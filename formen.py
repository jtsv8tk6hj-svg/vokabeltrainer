#!/usr/bin/env python3
"""Erzeugt die Verbformen fuer daten/verben.csv und schreibt sie nach daten/formen.json.

Aufruf auf dem eigenen Rechner (braucht einen API-Schluessel von Anthropic):

    export ANTHROPIC_API_KEY=sk-ant-...
    python3 formen.py              # fehlende Verben erzeugen, dann pruefen
    python3 formen.py --nur vb019  # nur ein Verb
    python3 formen.py --pruefen    # nur den Pruefdurchgang fuer alle Verben
    python3 formen.py --neu vb019  # ein Verb neu erzeugen, auch wenn es schon da ist

Das Skript speichert nach jedem Verb, ein Abbruch verliert nichts. Beim naechsten
Aufruf macht es dort weiter, wo es stand. Danach: python3 build.py, commit, push.

Bewusst ohne SDK und ohne Abhaengigkeiten, nur Standardbibliothek: das Skript laeuft
auf jedem Mac mit python3, ohne pip. Die Antwort ist ueber output_config.format an
ein JSON-Schema gebunden; dasselbe Schema nutzt die App fuer selbst angelegte Verben
(src/template.html, FORM_SCHEMA) - bei Aenderungen beide Stellen anpassen.
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
VERBEN = WURZEL / "daten" / "verben.csv"
ZIEL = WURZEL / "daten" / "formen.json"
MODELL = "claude-opus-5-5"
URL = "https://api.anthropic.com/v1/messages"

# Tempora je Sprache, in dieser Reihenfolge und mit diesen Namen
TEMPORA = {
    "de": ["Präsens", "Präteritum", "Perfekt", "Futur I", "Imperativ", "Konjunktiv II"],
    "en": ["Präsens", "Vergangenheit", "Perfekt", "Futur", "Imperativ", "Formen"],
    "fr": ["Présent", "Passé composé", "Imparfait", "Futur simple", "Impératif", "Subjonctif présent"],
    "pl": ["Präsens", "Vergangenheit", "Futur (unvollendet)", "Futur (vollendet)", "Imperativ"],
    "ru": ["Präsens", "Vergangenheit", "Futur (unvollendet)", "Futur (vollendet)", "Imperativ"],
}

ZEILE = {"type": "object", "properties": {"p": {"type": "string"}, "f": {"type": "string"}},
         "required": ["p", "f"], "additionalProperties": False}
TEMPUS = {"type": "object", "properties": {"t": {"type": "string"}, "rows": {"type": "array", "items": ZEILE}},
          "required": ["t", "rows"], "additionalProperties": False}
SPRACHE = {"type": "object",
           "properties": {"inf": {"type": "string"}, "aspect": {"type": "string"}, "pair": {"type": "string"},
                          "note": {"type": "string"}, "tenses": {"type": "array", "items": TEMPUS}},
           "required": ["inf", "aspect", "pair", "note", "tenses"], "additionalProperties": False}
SCHEMA = {"type": "object",
          "properties": {k: SPRACHE for k in TEMPORA} | {"ex": {"type": "string"}, "exde": {"type": "string"}},
          "required": list(TEMPORA) + ["ex", "exde"], "additionalProperties": False}

SYSTEM = (
    "Du bist ein Konjugationswörterbuch für Deutsch, Englisch, Französisch, Polnisch und Russisch. "
    "Du lieferst vollständige, korrekte Formentabellen. Regeln:\n"
    "- Je Sprache genau die vorgegebenen Tempora in der vorgegebenen Reihenfolge, Feld t exakt mit dem vorgegebenen Namen.\n"
    "- Zeilen p = Person oder Beschriftung in der jeweiligen Sprache (ich, du, er/sie/es ...; je, tu ...; ja, ty ...; я, ты ...), "
    "f = die Form ohne Pronomen, bei zusammengesetzten Zeiten mit Hilfsverb (habe gearbeitet, ai travaillé, бу́ду рабо́тать).\n"
    "- Deutsch: Perfekt mit dem richtigen Hilfsverb (haben/sein), Imperativ mit den Zeilen du, ihr, Sie; Konjunktiv II in der "
    "gebräuchlichen Form (wäre, hätte, käme; sonst würde + Infinitiv). Trennbare Verben im Präsens getrennt (stelle ein).\n"
    "- Englisch: Tempus Formen mit den Zeilen Grundform, 3. Person, ing-Form, Vergangenheit, Partizip; Imperativ mit you und we (let's ...).\n"
    "- Polnisch: Vergangenheit mit allen Genera: ja (m), ja (f), ty (m), ty (f), on, ona, ono, my (m-os.), my (nie-m-os.), "
    "wy (m-os.), wy (nie-m-os.), oni, one. Futur (unvollendet) mit będę + Infinitiv, Futur (vollendet) mit dem vollendeten "
    "Partner; fehlt der Partner, Futur (vollendet) mit leerer Zeilenliste. Imperativ ty, my, wy.\n"
    "- Russisch: alle Formen mit Betonungszeichen (U+0301) auf dem betonten Vokal, außer bei ё und Einsilbern. "
    "Vergangenheit mit он, она́, оно́, они́. Futur (unvollendet) mit бу́ду + Infinitiv, Futur (vollendet) mit dem vollendeten "
    "Partner (einfaches Futur); fehlt der Partner, leere Zeilenliste. Imperativ ты, вы. Reflexive Verben mit -ся/-сь.\n"
    "- aspect ist bei Polnisch und Russisch ipf, pair der vollendete Partner (oder leer); bei den anderen Sprachen beide leer.\n"
    "- note: knapper Hinweis auf Unregelmäßigkeiten, sonst leer.\n"
    "- ex: ein kurzer englischer Beispielsatz mit dem Verb, exde: derselbe Satz auf Deutsch.\n"
    "Keine Erklärungen, nur das JSON."
)

PRUEF = (
    "Du prüfst Konjugationstabellen auf Fehler: falsche Endungen, falsches Hilfsverb, fehlende oder falsche Betonungszeichen "
    "im Russischen, falsche Genusformen im Polnischen, vertauschte Aspekte, falsche Personenzuordnung. "
    "Gib die vollständige korrigierte Tabelle im selben Format zurück. Was richtig ist, bleibt unverändert."
)


def anfrage(system, text, schluessel):
    daten = {"model": MODELL, "max_tokens": 16000, "system": system,
             "output_config": {"format": {"type": "json_schema", "schema": SCHEMA}},
             "messages": [{"role": "user", "content": text}]}
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
    if antwort.get("stop_reason") == "max_tokens":
        sys.exit("Antwort abgeschnitten, max_tokens erhöhen")
    text = "".join(b.get("text", "") for b in antwort["content"] if b.get("type") == "text")
    return json.loads(text)


def vorgabe(v):
    zeilen = ["Verb: %s (id %s)" % (v["de"], v["id"]),
              "Deutsch: %s | Englisch: %s | Französisch: %s | Polnisch: %s | Russisch: %s"
              % (v["de"], v["en"], v["fr"], v["pl"], v["ru"]),
              "Bei Polnisch und Russisch steht 'unvollendet / vollendet'. Tempora je Sprache:"]
    for k, ts in TEMPORA.items():
        zeilen.append("  %s: %s" % (k, ", ".join(ts)))
    return "\n".join(zeilen)


def pruefen_struktur(f, v):
    """Stellt sicher, dass Tempora vollstaendig und richtig benannt sind."""
    fehler = []
    for k, ts in TEMPORA.items():
        got = [t["t"] for t in f[k]["tenses"]]
        if got != ts:
            fehler.append("%s: Tempora %s statt %s" % (k, got, ts))
        for t in f[k]["tenses"]:
            if not t["rows"] and "vollendet" not in t["t"]:
                fehler.append("%s/%s: keine Zeilen" % (k, t["t"]))
    if "́" not in json.dumps(f["ru"], ensure_ascii=False) and len(v["ru"]) > 5:
        fehler.append("ru: keine Betonungszeichen")
    return fehler


def main():
    schluessel = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not schluessel:
        sys.exit("ANTHROPIC_API_KEY fehlt. Vorher: export ANTHROPIC_API_KEY=sk-ant-...")
    args = sys.argv[1:]
    nur = args[args.index("--nur") + 1] if "--nur" in args else None
    neu = args[args.index("--neu") + 1] if "--neu" in args else None
    nur_pruefen = "--pruefen" in args

    with VERBEN.open(encoding="utf-8") as fh:
        verben = list(csv.DictReader(fh, delimiter=";"))
    formen = json.loads(ZIEL.read_text(encoding="utf-8")) if ZIEL.exists() else {}

    def speichern():
        ZIEL.write_text(json.dumps(formen, ensure_ascii=False, indent=1), encoding="utf-8")

    auswahl = [v for v in verben if (nur is None or v["id"] == nur) and (neu is None or v["id"] == neu)]
    if not nur_pruefen:
        for v in auswahl:
            if v["id"] in formen and neu != v["id"]:
                continue
            print("Erzeuge", v["id"], v["de"])
            f = anfrage(SYSTEM, vorgabe(v), schluessel)
            for fe in pruefen_struktur(f, v):
                print("  Hinweis:", fe)
            formen[v["id"]] = f
            speichern()

    for v in auswahl:
        if v["id"] not in formen:
            continue
        if formen[v["id"]].get("_geprueft") and not nur_pruefen and neu != v["id"]:
            continue
        print("Prüfe", v["id"], v["de"])
        alt = {k: val for k, val in formen[v["id"]].items() if not k.startswith("_")}
        f = anfrage(PRUEF, vorgabe(v) + "\n\nTabelle:\n" + json.dumps(alt, ensure_ascii=False), schluessel)
        geaendert = [k for k in alt if alt[k] != f.get(k)]
        if geaendert:
            print("  korrigiert:", ", ".join(geaendert))
        for fe in pruefen_struktur(f, v):
            print("  Hinweis:", fe)
        f["_geprueft"] = True
        formen[v["id"]] = f
        speichern()

    fertig = sum(1 for v in verben if v["id"] in formen)
    print("formen.json: %d von %d Verben, %d geprüft" % (fertig, len(verben),
          sum(1 for v in formen.values() if v.get("_geprueft"))))


if __name__ == "__main__":
    main()
