#!/usr/bin/env python3
"""Ergaenzt fuer einen Wortstapel die Sprachen FR, PL, RU, die Umschrift und beide
Beispielsaetze ueber die API. Quelle ist eine CSV mit id;de;en;thema, Ziel eine JSON
{id: {fr, pl, ru, rulat, ex, exde}}, die build.py mit der CSV zusammenfuehrt.

    export ANTHROPIC_API_KEY=sk-ant-...
    python3 woerter.py                       # Vorgabe: daten/alltag.csv -> daten/alltag-sprachen.json
    python3 woerter.py daten/x.csv daten/x-sprachen.json

Je Aufruf 20 Woerter, speichert nach jedem Block, setzt beim naechsten Aufruf fort.
Dasselbe Schema und derselbe Systemtext wie translate() in src/template.html.
Bewusst nur Standardbibliothek, laeuft auf jedem Mac ohne pip.
"""

import csv
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

WURZEL = pathlib.Path(__file__).parent
QUELLE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else WURZEL / "daten" / "alltag.csv"
ZIEL = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else WURZEL / "daten" / "alltag-sprachen.json"
MODELL = "claude-opus-5-5"
URL = "https://api.anthropic.com/v1/messages"
BLOCK = 20

FELDER = ["de", "en", "fr", "pl", "ru", "rulat", "ex", "exde", "cat"]
EINTRAG = {"type": "object", "properties": {k: {"type": "string"} for k in FELDER},
           "required": FELDER, "additionalProperties": False}
SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": EINTRAG}},
          "required": ["items"], "additionalProperties": False}

SYSTEM = (
    "Du bist ein fünfsprachiges Wörterbuch (Deutsch, Englisch, Französisch, Polnisch, Russisch) für Alltagswortschatz. "
    "Du bekommst Einträge, bei denen einzelne Felder leer sind, und füllst alle Felder. Vorhandene Angaben bleiben unverändert. "
    "Regeln: deutsche Substantive mit Artikel (der/die/das), französische mit le/la/les, Verben in der Grundform; feste Wendungen "
    "(Guten Morgen, Wie geht es dir?) als übliche Entsprechung in der jeweiligen Sprache. "
    "\"ru\" kyrillisch mit Betonungszeichen auf dem betonten Vokal (учи́тель), außer bei ё und Einsilbern; \"rulat\" deutsche Umschrift "
    "mit Betonungsakzent; \"ex\" ein kurzer, natürlicher Beispielsatz auf Englisch, der das Wort enthält; \"exde\" derselbe Satz auf Deutsch "
    "mit dem deutschen Wort; \"cat\" die vorgegebene Kategorie unverändert. "
    "Antworte mit genau so vielen Einträgen wie vorgegeben, in derselben Reihenfolge."
)


def anfrage(liste, schluessel):
    daten = {"model": MODELL, "max_tokens": 16000, "system": SYSTEM,
             "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
             "messages": [{"role": "user", "content": "Ergänze diese %d Einträge:\n%s"
                           % (len(liste), json.dumps(liste, ensure_ascii=False))}]}
    req = urllib.request.Request(URL, data=json.dumps(daten).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "x-api-key": schluessel,
                                          "anthropic-version": "2023-06-01"})
    for versuch in range(4):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                antwort = json.loads(r.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 529) and versuch < 3:
                warte = 5 * 2 ** versuch
                print("  Server %d, warte %ds" % (e.code, warte))
                time.sleep(warte)
                continue
            sys.exit("Fehler %d: %s" % (e.code, e.read().decode("utf-8", "replace")[:400]))
    if antwort.get("stop_reason") == "refusal":
        sys.exit("Anfrage abgelehnt: " + str(antwort.get("stop_details")))
    text = "".join(b.get("text", "") for b in antwort["content"] if b.get("type") == "text")
    items = json.loads(text)["items"]
    if len(items) != len(liste):
        sys.exit("Antwort unvollständig: %d statt %d Einträge" % (len(items), len(liste)))
    return items


def main():
    schluessel = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not schluessel:
        sys.exit("ANTHROPIC_API_KEY fehlt. Vorher: export ANTHROPIC_API_KEY=sk-ant-...")
    with QUELLE.open(encoding="utf-8") as fh:
        zeilen = list(csv.DictReader(fh, delimiter=";"))
    fertig = json.loads(ZIEL.read_text(encoding="utf-8")) if ZIEL.exists() else {}
    offen = [z for z in zeilen if z["id"] not in fertig]
    print("%d Wörter, %d schon ergänzt, %d offen" % (len(zeilen), len(fertig), len(offen)))
    for n in range(0, len(offen), BLOCK):
        block = offen[n:n + BLOCK]
        print("Ergänze %s bis %s (%s)" % (block[0]["id"], block[-1]["id"], block[0]["thema"]))
        liste = [{"de": z["de"], "en": z["en"], "fr": "", "pl": "", "ru": "", "rulat": "", "ex": "", "exde": "",
                  "cat": z["thema"]} for z in block]
        for z, o in zip(block, anfrage(liste, schluessel)):
            fertig[z["id"]] = {k: o.get(k, "") for k in ("fr", "pl", "ru", "rulat", "ex", "exde")}
        ZIEL.write_text(json.dumps(fertig, ensure_ascii=False, indent=1), encoding="utf-8")
    print("%s: %d von %d Wörtern ergänzt" % (ZIEL.name, len(fertig), len(zeilen)))


if __name__ == "__main__":
    main()
