#!/usr/bin/env python3
"""Erzeugt die Formentafeln fuer daten/verben.csv (Konjugation), daten/substantive.csv
(Deklination), daten/adjektive.csv (Komparation, Deklination) und daten/pronomen.csv
(Faelle) und schreibt sie nach daten/formen.json.

Aufruf auf dem eigenen Rechner (braucht einen API-Schluessel von Anthropic):

    export ANTHROPIC_API_KEY=sk-ant-...
    python3 formen.py              # fehlende Woerter erzeugen, dann pruefen
    python3 formen.py --nur sb001  # nur ein Wort (vb… Verb, sb… Substantiv, aj… Adjektiv, pn… Pronomen)
    python3 formen.py --pruefen    # nur den Pruefdurchgang fuer alle Woerter
    python3 formen.py --neu vb019  # ein Wort neu erzeugen, auch wenn es schon da ist

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
SUBSTANTIVE = WURZEL / "daten" / "substantive.csv"
ADJEKTIVE = WURZEL / "daten" / "adjektive.csv"
PRONOMEN = WURZEL / "daten" / "pronomen.csv"
ZIEL = WURZEL / "daten" / "formen.json"
MODELL = "claude-opus-5-5"
URL = "https://api.anthropic.com/v1/messages"

# Tafeln je Sprache, in dieser Reihenfolge und mit diesen Namen: Tempora bei Verben, Numerus bei Substantiven
TEMPORA = {
    "de": ["Präsens", "Präteritum", "Perfekt", "Futur I", "Imperativ", "Konjunktiv II"],
    "en": ["Präsens", "Vergangenheit", "Perfekt", "Futur", "Imperativ", "Formen"],
    "fr": ["Présent", "Passé composé", "Imparfait", "Futur simple", "Impératif", "Subjonctif présent"],
    "pl": ["Präsens", "Vergangenheit", "Futur (unvollendet)", "Futur (vollendet)", "Imperativ"],
    "ru": ["Präsens", "Vergangenheit", "Futur (unvollendet)", "Futur (vollendet)", "Imperativ"],
}

KASUS = {
    "de": ["Singular", "Plural"], "en": ["Formen"], "fr": ["Formen"], "pl": ["Singular", "Plural"], "ru": ["Singular", "Plural"],
}
FAELLE = {
    "de": "Nominativ, Genitiv, Dativ, Akkusativ (jeweils mit bestimmtem Artikel)",
    "en": "Singular, Plural",
    "fr": "Singular, Plural (jeweils mit bestimmtem Artikel le/la/l'/les)",
    "pl": "Nominativ, Genitiv, Dativ, Akkusativ, Instrumental, Lokativ, Vokativ",
    "ru": "Nominativ, Genitiv, Dativ, Akkusativ, Instrumental, Präpositiv",
}

ADJ = {
    "de": ["Komparation", "Mit bestimmtem Artikel", "Ohne Artikel"], "en": ["Komparation"],
    "fr": ["Formen", "Komparation"], "pl": ["Komparation", "Singular", "Plural"], "ru": ["Komparation", "Singular", "Plural"],
}
ADJ_ZEILEN = {
    "de": "Komparation: Positiv, Komparativ, Superlativ (am …sten). Mit bestimmtem Artikel und Ohne Artikel: je 16 Zeilen "
          "Nominativ m, f, n, Pl; Akkusativ m, f, n, Pl; Dativ m, f, n, Pl; Genitiv m, f, n, Pl (mit Artikel: der große …)",
    "en": "Komparation: Positiv, Komparativ, Superlativ",
    "fr": "Formen: m Singular, f Singular, m Plural, f Plural. Komparation: Positiv, Komparativ (plus …), Superlativ (le plus …)",
    "pl": "Komparation: Positiv, Komparativ, Superlativ. Singular: 21 Zeilen, je Fall (Nominativ, Genitiv, Dativ, Akkusativ, "
          "Instrumental, Lokativ, Vokativ) die Genera m, f, n; Akkusativ m als 'belebt / unbelebt'. Plural: 14 Zeilen, je Fall "
          "m-os. und nie-m-os.",
    "ru": "Komparation: Positiv, Komparativ (einfache Form), Superlativ (са́мый …). Singular: 18 Zeilen, je Fall (Nominativ, "
          "Genitiv, Dativ, Akkusativ, Instrumental, Präpositiv) die Genera m, f, n; Akkusativ m als 'unbelebt / belebt'. "
          "Plural: 6 Zeilen je Fall, Akkusativ als 'unbelebt / belebt'",
}
PRON = {"de": ["Fälle"], "en": ["Formen"], "fr": ["Formen"], "pl": ["Fälle"], "ru": ["Fälle"]}
PRON_ZEILEN = {
    "de": "Fälle: Nominativ, Akkusativ, Dativ, Genitiv",
    "en": "Formen: Subjekt, Objekt, Possessiv (begleitend), Possessiv (allein)",
    "fr": "Formen: Subjekt, betont, direktes Objekt, indirektes Objekt",
    "pl": "Fälle: Nominativ, Genitiv, Dativ, Akkusativ, Instrumental, Lokativ (betonte / unbetonte Form mit Schrägstrich)",
    "ru": "Fälle: Nominativ, Genitiv, Dativ, Akkusativ, Instrumental, Präpositiv (mit Präposition, z. B. обо мне)",
}

ZEILE = {"type": "object", "properties": {"p": {"type": "string"}, "f": {"type": "string"}},
         "required": ["p", "f"], "additionalProperties": False}
TEMPUS = {"type": "object", "properties": {"t": {"type": "string"}, "rows": {"type": "array", "items": ZEILE}},
          "required": ["t", "rows"], "additionalProperties": False}
SPRACHE = {"type": "object",
           "properties": {"inf": {"type": "string"}, "aspect": {"type": "string"}, "pair": {"type": "string"},
                          "gender": {"type": "string"}, "note": {"type": "string"},
                          "tenses": {"type": "array", "items": TEMPUS}},
           "required": ["inf", "aspect", "pair", "gender", "note", "tenses"], "additionalProperties": False}
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
    "- gender bleibt bei Verben leer. note: knapper Hinweis auf Unregelmäßigkeiten, sonst leer.\n"
    "- ex: ein kurzer englischer Beispielsatz mit dem Verb, exde: derselbe Satz auf Deutsch.\n"
    "Keine Erklärungen, nur das JSON."
)

SYSTEM_SUBST = (
    "Du bist ein Deklinationswörterbuch für Deutsch, Englisch, Französisch, Polnisch und Russisch. "
    "Du lieferst vollständige, korrekte Formentafeln für Substantive. Regeln:\n"
    "- Je Sprache genau die vorgegebenen Tafeln (Feld t) in der vorgegebenen Reihenfolge mit exakt den vorgegebenen Namen; "
    "die Zeilen p sind die vorgegebenen Fälle bzw. Numeri in dieser Reihenfolge, f die Form.\n"
    "- Deutsch: jede Form mit bestimmtem Artikel (das Haus, des Hauses); inf ist die Grundform mit Artikel.\n"
    "- Französisch: Singular und Plural mit Artikel (le travail, les travaux), inf mit Artikel.\n"
    "- Englisch: Singular und Plural ohne Artikel; bei unzählbaren Wörtern Plural trotzdem angeben und in note erklären.\n"
    "- Polnisch: sieben Fälle im Singular und Plural, ohne Artikel; bei Pluraliatantum (drzwi, pieniądze) Singular mit leerer Zeilenliste "
    "und Hinweis in note.\n"
    "- Russisch: sechs Fälle im Singular und Plural, alle Formen mit Betonungszeichen (U+0301) außer bei ё und Einsilbern; "
    "bei Pluraliatantum (де́ньги) Singular mit leerer Zeilenliste und Hinweis in note; belebte Substantive mit Akkusativ = Genitiv.\n"
    "- gender: m, f oder n (Englisch leer). aspect und pair leer. note: Besonderheiten (Fluchtvokal, Betonungswechsel, "
    "unregelmäßiger Plural), sonst leer.\n"
    "- ex: ein kurzer englischer Beispielsatz mit dem Wort, exde: derselbe Satz auf Deutsch.\n"
    "Keine Erklärungen, nur das JSON."
)

SYSTEM_ADJ = (
    "Du bist ein Grammatikwörterbuch für Adjektive in Deutsch, Englisch, Französisch, Polnisch und Russisch. "
    "Du lieferst vollständige, korrekte Tafeln. Regeln:\n"
    "- Je Sprache genau die vorgegebenen Tafeln (t) in der vorgegebenen Reihenfolge mit exakt den vorgegebenen Namen; "
    "die Zeilen p exakt wie vorgegeben, in dieser Reihenfolge, f die Form.\n"
    "- Russisch mit Betonungszeichen (U+0301) außer bei ё und Einsilbern. Fehlt eine Form (etwa keine Komparation), Zeile mit f leer "
    "und Hinweis in note.\n"
    "- gender, aspect und pair leer. note: Unregelmäßigkeiten (Umlaut, Suppletion, Konsonantenwechsel), sonst leer.\n"
    "- ex: ein kurzer englischer Beispielsatz mit dem Adjektiv, exde: derselbe Satz auf Deutsch.\n"
    "Keine Erklärungen, nur das JSON."
)

SYSTEM_PRON = (
    "Du bist ein Grammatikwörterbuch für Pronomen in Deutsch, Englisch, Französisch, Polnisch und Russisch. "
    "Du lieferst vollständige, korrekte Formentafeln. Regeln:\n"
    "- Je Sprache genau die vorgegebene Tafel (t) mit exakt dem vorgegebenen Namen; die Zeilen p exakt wie vorgegeben, "
    "in dieser Reihenfolge, f die Form. Hat ein Pronomen mehrere Formen je Zeile (ona: ją / nią), beide mit Schrägstrich.\n"
    "- Russisch mit Betonungszeichen (U+0301) außer bei ё und Einsilbern; nach Präposition die n-Formen (у него́) in Klammern ergänzen.\n"
    "- gender, aspect und pair leer. note: Besonderheiten, sonst leer.\n"
    "- ex: ein kurzer englischer Beispielsatz mit dem Pronomen, exde: derselbe Satz auf Deutsch.\n"
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


ARTEN = {
    "vb": ("Verb", TEMPORA, None, None),
    "sb": ("Substantiv", KASUS, FAELLE, None),
    "aj": ("Adjektiv", ADJ, ADJ_ZEILEN, None),
    "pn": ("Pronomen", PRON, PRON_ZEILEN, None),
}


def art(v):
    return v["id"][:2]


def tafeln(v):
    return ARTEN[art(v)][1]


def system(v):
    return {"vb": SYSTEM, "sb": SYSTEM_SUBST, "aj": SYSTEM_ADJ, "pn": SYSTEM_PRON}[art(v)]


def vorgabe(v):
    name, tf, zeilen_je, _ = ARTEN[art(v)]
    zeilen = ["%s: %s (id %s)" % (name, v["de"], v["id"]),
              "Deutsch: %s | Englisch: %s | Französisch: %s | Polnisch: %s | Russisch: %s"
              % (v["de"], v["en"], v["fr"], v["pl"], v["ru"])]
    if art(v) == "vb":
        zeilen.append("Bei Polnisch und Russisch steht 'unvollendet / vollendet'. Tempora je Sprache:")
        for k, ts in tf.items():
            zeilen.append("  %s: %s" % (k, ", ".join(ts)))
    else:
        zeilen.append("Tafeln je Sprache, Zeilen in dieser Reihenfolge:")
        for k, ts in tf.items():
            zeilen.append("  %s: %s – Zeilen: %s" % (k, ", ".join(ts), zeilen_je[k]))
    return "\n".join(zeilen)


def pruefen_struktur(f, v):
    """Stellt sicher, dass Tempora vollstaendig und richtig benannt sind."""
    fehler = []
    for k, ts in tafeln(v).items():
        got = [t["t"] for t in f[k]["tenses"]]
        if got != ts:
            fehler.append("%s: Tafeln %s statt %s" % (k, got, ts))
        for t in f[k]["tenses"]:
            if not t["rows"] and "vollendet" not in t["t"] and not f[k].get("note"):
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

    verben = []
    for datei in (VERBEN, SUBSTANTIVE, ADJEKTIVE, PRONOMEN):
        if datei.exists():
            with datei.open(encoding="utf-8") as fh:
                verben += list(csv.DictReader(fh, delimiter=";"))
    formen = json.loads(ZIEL.read_text(encoding="utf-8")) if ZIEL.exists() else {}

    def speichern():
        ZIEL.write_text(json.dumps(formen, ensure_ascii=False, indent=1), encoding="utf-8")

    auswahl = [v for v in verben if (nur is None or v["id"] == nur) and (neu is None or v["id"] == neu)]
    if not nur_pruefen:
        for v in auswahl:
            if v["id"] in formen and neu != v["id"]:
                continue
            print("Erzeuge", v["id"], v["de"])
            f = anfrage(system(v), vorgabe(v), schluessel)
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
    print("formen.json: %d von %d Wörtern, %d geprüft" % (fertig, len(verben),
          sum(1 for v in formen.values() if v.get("_geprueft"))))


if __name__ == "__main__":
    main()
