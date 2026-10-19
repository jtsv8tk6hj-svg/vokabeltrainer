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
VERBEN = WURZEL / "daten" / "verben.csv"
SUBSTANTIVE = WURZEL / "daten" / "substantive.csv"
ADJEKTIVE = WURZEL / "daten" / "adjektive.csv"
PRONOMEN = WURZEL / "daten" / "pronomen.csv"
# Kuratierte Themenstapel: CSV id;de;en;thema plus Sprachen-JSON aus woerter.py
THEMENSTAPEL = [
    ("Alltag", WURZEL / "daten" / "alltag.csv", WURZEL / "daten" / "alltag-sprachen.json"),
    ("Küche", WURZEL / "daten" / "kueche.csv", WURZEL / "daten" / "kueche-sprachen.json"),
    ("Reisen", WURZEL / "daten" / "reisen.csv", WURZEL / "daten" / "reisen-sprachen.json"),
    ("Auto", WURZEL / "daten" / "auto.csv", WURZEL / "daten" / "auto-sprachen.json"),
    ("Beruf", WURZEL / "daten" / "beruf.csv", WURZEL / "daten" / "beruf-sprachen.json"),
    ("Gesundheit", WURZEL / "daten" / "gesundheit.csv", WURZEL / "daten" / "gesundheit-sprachen.json"),
]
FORMEN = WURZEL / "daten" / "formen.json"
VORLAGE = WURZEL / "src" / "template.html"
ZIEL = WURZEL / "index.html"

STAPEL = "Personalgewinnung"
STAPEL_VERBEN = "Verben"
STAPEL_SUBSTANTIVE = "Substantive"
STAPEL_ADJEKTIVE = "Adjektive"
STAPEL_PRONOMEN = "Pronomen"

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
            "deck": STAPEL,                      # Lernstand je Zielsprache legt die App unter "p" an
        })
    return eintraege


def verben():
    """Die kuratierten Verben, Substantive, Adjektive und Pronomen als Woerter ihrer Stapel; die Formen kommen getrennt."""
    formen = json.loads(FORMEN.read_text(encoding="utf-8")) if FORMEN.exists() else {}
    eintraege = []
    for datei, stapel, wortart in ((VERBEN, STAPEL_VERBEN, "Verb"), (SUBSTANTIVE, STAPEL_SUBSTANTIVE, "Substantiv"),
                                   (ADJEKTIVE, STAPEL_ADJEKTIVE, "Adjektiv"), (PRONOMEN, STAPEL_PRONOMEN, "Pronomen")):
        if not datei.exists():
            continue
        with datei.open(encoding="utf-8") as f:
            for z in csv.DictReader(f, delimiter=";"):
                fo = formen.get(z["id"], {})
                eintraege.append({
                    "id": z["id"], "de": z["de"], "en": z["en"], "fr": z["fr"], "pl": z["pl"], "ru": z["ru"],
                    "rulat": z["rulat"], "cat": wortart + " " + z["bereich"], "deck": stapel,
                    "ex": fo.get("ex", ""), "exde": fo.get("exde", ""),
                })
    # Formen ohne Beispielsaetze und Pruefvermerk, nur die fuenf Sprachen
    tafeln = {vid: {k: v for k, v in fo.items() if k in ("de", "en", "fr", "pl", "ru")}
              for vid, fo in formen.items()}
    return eintraege, tafeln


def themenstapel():
    """Kuratierte Stapel nach Themen: CSV mit id;de;en;thema, Sprachen aus woerter.py."""
    eintraege = []
    for stapel, csv_datei, json_datei in THEMENSTAPEL:
        if not csv_datei.exists():
            continue
        sprachen = json.loads(json_datei.read_text(encoding="utf-8")) if json_datei.exists() else {}
        with csv_datei.open(encoding="utf-8") as f:
            for z in csv.DictReader(f, delimiter=";"):
                w = sprachen.get(z["id"], {})
                eintraege.append({
                    "id": z["id"], "de": z["de"], "en": z["en"],
                    "fr": w.get("fr", ""), "pl": w.get("pl", ""), "ru": w.get("ru", ""), "rulat": w.get("rulat", ""),
                    "cat": z["thema"], "deck": stapel, "ex": w.get("ex", ""), "exde": w.get("exde", ""),
                })
    return eintraege


def main():
    daten = vokabeln()
    verb_eintraege, tafeln = verben()
    daten += verb_eintraege
    alltag_eintraege = themenstapel()
    daten += alltag_eintraege
    vorlage = VORLAGE.read_text(encoding="utf-8")

    for ph in ("__SEED__", "__FORMS__"):
        if ph not in vorlage:
            sys.exit("FEHLER: src/template.html enthaelt keinen Platzhalter " + ph)
    for alt in (KOPF_ALT, SW_ALT):
        if alt not in vorlage:
            sys.exit("FEHLER: Ankerstelle fehlt in src/template.html:\n" + alt[:60])

    seite = vorlage.replace(KOPF_ALT, KOPF_NEU, 1)
    seite = seite.replace(SW_ALT, SW_NEU, 1)
    seite = seite.replace(
        "__SEED__",
        json.dumps(daten, ensure_ascii=False, separators=(",", ":")),
    )
    seite = seite.replace(
        "__FORMS__",
        json.dumps(tafeln, ensure_ascii=False, separators=(",", ":")),
    )

    ZIEL.write_text(seite, encoding="utf-8")

    ohne_alltag = sum(1 for d in alltag_eintraege if not d["ru"])
    if ohne_alltag:
        print("  Hinweis: %d Woerter der Themenstapel ohne FR/PL/RU - python3 woerter.py mit API-Schluessel ausfuehren" % ohne_alltag)
    ohne_satz = sum(1 for d in daten if not d["exde"])
    ohne_sprachen = sum(1 for d in daten if not (d["fr"] and d["pl"] and d["ru"]))
    print("index.html geschrieben: %d Woerter (davon %d mit Tafeln vorgesehen, %d mit Formen), %d Bytes"
          % (len(daten), len(verb_eintraege), len(tafeln), len(seite)))
    if len(tafeln) < len(verb_eintraege):
        print("  Hinweis: Formen fehlen fuer %d Woerter - python3 formen.py mit API-Schluessel ausfuehren"
              % (len(verb_eintraege) - len(tafeln)))
    if ohne_satz:
        print("  Hinweis: %d Eintraege ohne deutschen Beispielsatz" % ohne_satz)
    if ohne_sprachen:
        print("  Hinweis: %d Eintraege ohne FR/PL/RU" % ohne_sprachen)


if __name__ == "__main__":
    main()
