#!/usr/bin/env python3
"""Erzeugt index.html aus src/template.html und den Dateien in daten/.

Aufruf:  python3 build.py
Ergebnis: index.html (ueberschrieben), danach commit + push => GitHub Pages aktualisiert sich.

Die Vokabeln werden als JSON-Array in den Platzhalter __SEED__ der Vorlage gesetzt.
Zusaetzlich traegt dieses Skript die PWA-Teile ein, die nur in der gehosteten
Fassung gebraucht werden (Manifest, Home-Bildschirm-Symbol, Service Worker).
"""

import csv
import json
import pathlib
import sys

WURZEL = pathlib.Path(__file__).parent
CSV_DATEI = WURZEL / "daten" / "vokabeln-personalgewinnung.csv"
SAETZE_DE = WURZEL / "daten" / "beispielsaetze-de.json"
SPRACHEN = WURZEL / "daten" / "sprachen-fr-pl-ru.json"
VORLAGE = WURZEL / "src" / "template.html"
ZIEL = WURZEL / "index.html"

STAPEL = "Personalgewinnung"

# Als data:-URI eingebettet, damit iOS beim Ablegen auf dem Home-Bildschirm
# sofort ein Symbol hat, ohne eine zweite Datei zu laden.
APPLE_ICON = (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 180 180'%3E"
    "%3Crect width='180' height='180' rx='40' fill='%230e1013'/%3E"
    "%3Ctext x='90' y='120' font-size='96' font-family='Georgia,serif' fill='%23eceef1' "
    "text-anchor='middle'%3EV%3C/text%3E%3C/svg%3E"
)

KOPF_ALT = "<title>Vokabeltrainer</title>"
KOPF_NEU = (
    '<title>Vokabeltrainer</title>\n'
    '<link rel="manifest" href="manifest.webmanifest">\n'
    '<link rel="apple-touch-icon" href="' + APPLE_ICON + '">\n'
    '<meta name="apple-mobile-web-app-title" content="Vokabeln">'
)

SW_ALT = "<script>\nconst SEED ="
SW_NEU = (
    '<script>\n'
    'if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost")){\n'
    '  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));\n'
    '}\n</script>\n<script>\nconst SEED ='
)


def vokabeln():
    """Liest die CSV und reichert sie mit den uebersetzten Feldern an."""
    saetze = json.loads(SAETZE_DE.read_text(encoding="utf-8"))
    sprachen = json.loads(SPRACHEN.read_text(encoding="utf-8"))

    with CSV_DATEI.open(encoding="utf-8") as f:
        zeilen = list(csv.reader(f, delimiter=";"))[1:]  # Kopfzeile weg

    eintraege, gesehen, n = [], set(), 0
    for zeile in zeilen:
        if len(zeile) < 4:
            continue
        en, de, kategorie, beispiel = (x.strip() for x in zeile[:4])
        if not en and not de:
            continue
        schluessel = (en.lower(), de.lower())
        if schluessel in gesehen:
            continue
        gesehen.add(schluessel)

        n += 1
        kennung = "pg%03d" % n
        weitere = sprachen.get(kennung, {})
        eintraege.append({
            "id": kennung,
            "en": en,
            "de": de,
            "fr": weitere.get("fr", ""),
            "pl": weitere.get("pl", ""),
            "ru": weitere.get("ru", ""),
            "rulat": weitere.get("rulat", ""),
            "cat": kategorie,
            "ex": beispiel,                      # Beispielsatz englisch
            "exde": saetze.get(kennung, ""),     # derselbe Satz deutsch
            "deck": STAPEL,
            "step": 0,                           # Stufe auf der Wiederholungsleiter
            "due": 0,                            # 0 = noch nie gelernt
        })
    return eintraege


def main():
    daten = vokabeln()
    vorlage = VORLAGE.read_text(encoding="utf-8")

    if "__SEED__" not in vorlage:
        sys.exit("FEHLER: src/template.html enthaelt keinen Platzhalter __SEED__")
    for alt in (KOPF_ALT, SW_ALT):
        if alt not in vorlage:
            sys.exit("FEHLER: Ankerstelle fehlt in src/template.html:\n" + alt[:60])

    seite = vorlage.replace(KOPF_ALT, KOPF_NEU, 1)
    seite = seite.replace(SW_ALT, SW_NEU, 1)
    seite = seite.replace(
        "__SEED__",
        json.dumps(daten, ensure_ascii=False, separators=(",", ":")),
    )

    ZIEL.write_text(seite, encoding="utf-8")

    ohne_satz = sum(1 for d in daten if not d["exde"])
    ohne_sprachen = sum(1 for d in daten if not (d["fr"] and d["pl"] and d["ru"]))
    print("index.html geschrieben: %d Woerter, %d Bytes" % (len(daten), len(seite)))
    if ohne_satz:
        print("  Hinweis: %d Eintraege ohne deutschen Beispielsatz" % ohne_satz)
    if ohne_sprachen:
        print("  Hinweis: %d Eintraege ohne FR/PL/RU" % ohne_sprachen)


if __name__ == "__main__":
    main()
