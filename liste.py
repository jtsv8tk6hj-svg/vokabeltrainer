#!/usr/bin/env python3
"""Stellt eine kuratierte Wortliste zu einem Fachgebiet ueber die API zusammen: je Thema
die nuetzlichsten Woerter in Deutsch und Englisch, ohne Dubletten untereinander und
gegen die schon vorhandenen Stapel. Ergebnis ist eine CSV id;de;en;thema, die danach
mit woerter.py um FR, PL, RU, Umschrift und Beispielsaetze ergaenzt wird.

    export ANTHROPIC_API_KEY=sk-ant-...
    python3 liste.py kueche          # schreibt daten/kueche.csv nach dem Plan unten

Bewusst nur Standardbibliothek. Der Plan je Gebiet steht in PLAENE.
"""

import csv
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

WURZEL = pathlib.Path(__file__).parent
MODELL = "claude-opus-5-5"
URL = "https://api.anthropic.com/v1/messages"

# Gebiet -> (Kennung, Zieldatei, Woerter je Thema, Themen)
PLAENE = {
    "kueche": ("ku", "daten/kueche.csv", 25, [
        "Obst", "Gemüse", "Fleisch und Wurst", "Fisch und Meeresfrüchte", "Milchprodukte und Eier",
        "Brot und Backwaren", "Getreide, Nudeln und Reis", "Gewürze und Kräuter", "Getränke",
        "Süßes und Desserts", "Küchengeräte", "Kochgeschirr und Besteck", "Zubereiten (Verben)",
        "Garmethoden", "Geschmack und Beschaffenheit", "Maße und Mengen", "Einkaufen und Vorrat",
        "Im Restaurant", "Mahlzeiten und Gerichte", "Küche und Hygiene",
    ]),
}

SCHEMA = {"type": "object", "properties": {"items": {"type": "array", "items": {
    "type": "object", "properties": {"de": {"type": "string"}, "en": {"type": "string"}},
    "required": ["de", "en"], "additionalProperties": False}}},
    "required": ["items"], "additionalProperties": False}

SYSTEM = (
    "Du stellst Wortschatz für Sprachlernende zusammen. Zu einem Thema lieferst du die nützlichsten Wörter und festen "
    "Wendungen, die man im Alltag dazu wirklich braucht, vom Grundwortschatz bis zum gehobenen Alltag, keine Randbegriffe, "
    "keine Wiederholungen, keine Wörter, die schon in der Ausschlussliste stehen. Deutsch: Substantive mit Artikel "
    "(der/die/das), Verben im Infinitiv, Adjektive in der Grundform. Englisch: die übliche Entsprechung (britisch), Verben mit to. "
    "Genau die verlangte Anzahl, nur das JSON."
)


def anfrage(text, schluessel):
    daten = {"model": MODELL, "max_tokens": 16000, "system": SYSTEM,
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
                time.sleep(5 * 2 ** versuch)
                continue
            sys.exit("Fehler %d: %s" % (e.code, e.read().decode("utf-8", "replace")[:400]))
    if antwort.get("stop_reason") == "refusal":
        sys.exit("Anfrage abgelehnt")
    text = "".join(b.get("text", "") for b in antwort["content"] if b.get("type") == "text")
    return json.loads(text)["items"]


def norm(s):
    s = re.sub(r"\s*\([^)]*\)", "", (s or "").lower())
    s = re.sub(r"^(der|die|das|the|to|le|la)\s+", "", s)
    return re.sub(r"[^\w ]", "", s).strip()


def vorhanden():
    """de- und en-Formen aller vorhandenen Stapel, damit nichts doppelt entsteht."""
    de, en = set(), set()
    for name in ("vokabeln-personalgewinnung.csv", "verben.csv", "substantive.csv", "adjektive.csv",
                 "pronomen.csv", "alltag.csv"):
        p = WURZEL / "daten" / name
        if not p.exists():
            continue
        with p.open(encoding="utf-8") as f:
            r = csv.reader(f, delimiter=";")
            kopf = next(r)
            ide, ien = kopf.index("de") if "de" in kopf else 1, kopf.index("en") if "en" in kopf else 0
            if name.startswith("vokabeln"):
                ide, ien = 1, 0
            for z in r:
                if len(z) > max(ide, ien):
                    de.add(norm(z[ide])); en.add(norm(z[ien]))
    return de, en


def main():
    schluessel = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not schluessel:
        sys.exit("ANTHROPIC_API_KEY fehlt")
    gebiet = sys.argv[1] if len(sys.argv) > 1 else "kueche"
    kennung, ziel, je, themen = PLAENE[gebiet]
    ziel = WURZEL / ziel
    de_alt, en_alt = vorhanden()
    zeilen, de_neu, en_neu = [], set(), set()
    for thema in themen:
        ausschluss = sorted(de_neu)[-80:]
        print("Thema:", thema)
        items = anfrage("Thema: %s (Gebiet: Lebensmittel, Küche, Kochen)\nAnzahl: %d Einträge\nAusschlussliste (schon vorhanden): %s"
                        % (thema, je + 6, ", ".join(ausschluss) or "–"), schluessel)
        n = 0
        for o in items:
            d, e = norm(o["de"]), norm(o["en"])
            if not d or not e or d in de_alt or d in de_neu or e in en_neu:
                continue
            de_neu.add(d); en_neu.add(e)
            zeilen.append({"de": o["de"].strip(), "en": o["en"].strip(), "thema": thema})
            n += 1
            if n >= je:
                break
        print("  %d übernommen" % n)
    with ziel.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["id", "de", "en", "thema"])
        for k, z in enumerate(zeilen, 1):
            w.writerow(["%s%03d" % (kennung, k), z["de"], z["en"], z["thema"]])
    print("%s: %d Wörter in %d Themen" % (ziel.name, len(zeilen), len(themen)))


if __name__ == "__main__":
    main()
