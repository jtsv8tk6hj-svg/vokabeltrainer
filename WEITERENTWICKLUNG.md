# Weiterentwicklung — Recherche und Gestaltungsvorschläge

Stand 19.10.2026. Zwei Hilfsagenten haben recherchiert (Web, GitHub) und die
Oberfläche kritisch gesichtet. Nur belegte Befunde; Einschätzungen sind als solche
gekennzeichnet.

## Priorisierte Vorschläge

1. **Sicherung als Datei über das Teilen-Blatt.** Lernstand überlebt Gerätewechsel
   und Browser-Reset ohne Konto. Aufwand gering: `navigator.share({files})` und
   `<input type=file>` für den Import, JSON ohne API-Schlüssel. Vorbild
   https://github.com/SQ-NO-Ls/jewuolingo, Grundlage https://web.dev/articles/web-share.
2. **Review-Log mitschreiben.** Ein Eintrag je Urteil (`{id, lang, rating, ts}`) als
   Grundlage für FSRS-Optimierung und für eine ehrliche Auswertung der eigenen Leiter.
   Aufwand gering. Quelle https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md.
3. **Gesprächsübung mit Korrektur über die Messages API.** Sichtbarster Unterschied
   zu Anki, nutzt den vorhandenen Schlüsselmechanismus: mehrere Turns, Korrektur als
   Structured Output `{antwort, korrekturen:[{falsch, richtig, regel}]}`, Wortschatz der
   gewählten Stapel als Kontext. Aufwand mittel (neuer Reiter). Quelle
   https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript, Vorbild Jewolingo.
4. **Weitere Übungsformen: Zuordnen, Multiple Choice, Satz-Scramble.** Abwechslung,
   Erkennen vor Produzieren, keine neuen Daten nötig. Aufwand mittel. Vorbilder
   https://github.com/JesusOrihuela/practice_english.github.io, Jewolingo.
5. **Anki-Export (.apkg) oder CSV mit Lernstand.** Daten sind mitnehmbar, senkt die
   Hürde für Anki-Nutzer. CSV trivial, apkg mittel (SQLite in Zip). Vorbild
   https://github.com/smolkaj/jolito.
6. **FSRS als wählbares Verfahren über ts-fsrs (UMD, eine Datei).** Erst nach
   Vorschlag 2. Aufwand mittel bis hoch (zweites Zustandsmodell, Migration, Tests).
   https://github.com/open-spaced-repetition/ts-fsrs.
7. **Abgleich über GitHub Gist oder Dropbox mit eigenem Token.** Zwei Geräte ohne
   Server, Regel „letzter Schreiber gewinnt“ je Wort und Sprache. Aufwand mittel.
8. **Vorgerenderte Audiodateien für PL/RU (Piper, medium).** Hörbare Betonung, auch
   offline, ohne Schlüssel im Betrieb. Aufwand hoch (rund 2.000 Dateien, Cache).
   https://github.com/rhasspy/piper/blob/master/VOICES.md.

Bewusst nicht empfohlen: Agent SDK und Managed Agents (brauchen einen Server),
Aussprachebewertung für PL/RU (keine belastbare Abdeckung), Supabase Free (Projekt
pausiert nach einer Woche Inaktivität), App-Store-Veröffentlichung jetzt (Mac, 99 $
je Jahr, Richtlinie 4.2, PWABuilder-iOS archiviert).

## Befunde im Einzelnen

### Vergleichbare Open-Source-Trainer

- **FSRS-Ökosystem** (https://github.com/open-spaced-repetition/awesome-fsrs): Web-Apps
  mit FSRS, u. a. Jiaci, Jolito, Ordkort. `ts-fsrs` (MIT, FSRS v6, auf jsDelivr) bietet
  `createEmptyCard()`, `fsrs()`, `repeat()`, `next()`.
- **Jolito** (https://github.com/smolkaj/jolito, Apache 2.0): Offline-PWA für
  Spanisch, Tippabfrage mit Hervorhebung der Abweichung, Grammatikdrills, Anki-Import
  mit Erhalt der Intervalle, JSON-Export, Cloud-Sicherung über Supabase, iOS-App über
  Capacitor. Uns fehlen: Anki-Import/Export, Cloud-Sicherung, Wischgesten.
- **Jewolingo** (https://github.com/SQ-NO-Ls/jewuolingo): eine HTML-Datei ohne
  Build, 13 Übungsmodi (Flashcards, Multiple Choice, Tippen, Zuordnen, Lückensatz,
  KI-Gespräch mit eigenem Schlüssel), Lernstand in vier Dimensionen, Tagesquests,
  Export/Restore über das iOS-Teilen-Blatt. Hinweis dort: Home-Bildschirm-Apps sind
  von WebKits 7-Tage-Speicherlöschung ausgenommen, Safari-Tabs nicht.
- **Idiomap** (https://github.com/JesusOrihuela/practice_english.github.io): acht
  Übungen, Einstufungstest A1–C2, Sprachausgabe (Kokoro) und Spracherkennung
  (Whisper) komplett im Browser über `@huggingface/transformers`.
- Einschätzung: unsere App ist stark bei Mehrsprachigkeit, Formentafeln und
  Beispielsätzen, schwach bei Übungsvielfalt, Anki-Kompatibilität und Datensicherung
  außerhalb des Browsers.

### KI-Tutor in der Einzeldatei-App

- Direkter Browserzugriff auf die API ist offiziell, aber als riskant markiert
  (Schlüssel im Browser). Für Freunde tragfähig; für ein Produkt braucht es einen
  Schlüsselhalter, etwa Cloudflare Workers Free (100.000 Anfragen je Tag) als dünner
  Proxy, dazu Workspace mit Ausgabenlimit und Schlüsselrotation.
- Gesprächsübung und Fehlerkorrektur gehen mit der Messages API allein; Tool Use
  ginge clientseitig (die App stellt „Karte anlegen“ als Werkzeug bereit).
- Agent SDK und Managed Agents brauchen zwingend einen Server; für Tutor oder
  Satzgenerierung sind sie nicht nötig.
- Sprache zu Sprache gibt es nicht als Anthropic-API; ein Sprach-Tutor wäre die Kette
  Browser-STT → Claude (Text) → Browser-TTS.
- Aussprachebewertung: Speechace nur EN/FR/ES; Azure listet 33 Sprachen, Polnisch
  war Anfang 2025 defekt. Für PL/RU nicht verlässlich.

### Abgleich zwischen Geräten ohne eigenen Server

- Dateiexport über das Teilen-Blatt (Web Share API mit Dateien, Nutzergeste nötig):
  kein Konto, aber manuelle Übertragung, keine Zusammenführung. iCloud Drive ist aus
  dem Browser nicht direkt erreichbar, der Weg führt über die Dateien-App.
- GitHub Gist: REST-API mit CORS, feingranulares Token nur für Gists, „secret gist“
  verwenden, Konfliktregel nötig. Pragmatischster fast serverloser Abgleich.
- Dropbox per OAuth PKCE ohne App-Secret, App-Ordner-Modus; für Nutzer einfach.
- Supabase Free pausiert nach einer Woche Inaktivität; Firebase Spark bricht die
  Regel „eine Datei ohne Abhängigkeiten“; PouchDB/CouchDB braucht einen Server.

### Sprachausgabe und Spracherkennung

- iOS stellt dem Web nur vorinstallierte Compact-Stimmen bereit (PL „Zosia“, RU
  „Milena“); nachgeladene Premium-Stimmen fehlen in `getVoices()`.
- Spracherkennung (`webkitSpeechRecognition`) fehlt in Home-Bildschirm-Web-Apps
  (WebKit-Bug 225298, seit 2021 offen); im Safari-Tab läuft sie.
- Piper hat PL- und RU-Stimmen in mittlerer Qualität, per sherpa-onnx im Browser
  ausführbar (Modul rund 11,5 MB plus Modell). Whisper über Transformers.js mit
  WebGPU (Safari 26) wäre der einzige Weg für Diktat im App-Symbol.

### Lernwissenschaft: FSRS oder feste Leiter

- Benchmark (srs-benchmark, rund 10.000 Anki-Sammlungen): FSRS-6 sagt Vergessen
  besser voraus als ältere Modelle. Ein direkter Vergleich mit einer festen Leiter ist
  nicht belegt.
- FSRS braucht Review-Historie zum Optimieren (frühere Mindestgrenze 400 Reviews);
  ohne Optimierung laufen Standardparameter.
- Karpicke & Roediger 2007 und Kang u. a. 2014: wachsende Abstände sind kurzfristig
  im Vorteil, langfristig gleichwertig; der erste Abstand wiegt mehr als das Wachstum.
  Unsere Leiter (1, 3, 7, 16 …) ist damit nicht widerlegt.
- Einschätzung: Umstieg lohnt erst mit mehreren tausend Reviews und einem
  Review-Log. Die feste Leiter bleibt Vorgabe.

### Veröffentlichung als Produkt

- iOS: Apple Developer Program 99 $ je Jahr, Richtlinie 4.2 verlangt mehr als eine
  verpackte Website, PWABuilder-iOS ist seit 11.09.2025 archiviert, bleibt Capacitor
  mit Mac und Xcode.
- Android: Google Play 25 $ einmalig, Privatkonten brauchen einen geschlossenen Test
  mit 12 Testern über 14 Tage; PWABuilder/Bubblewrap erzeugen eine Trusted Web
  Activity ohne Codeänderung.
- iOS 26 macht die PWA-Route attraktiver (jede Seite als Web-App, Push, Offline).
- Einschätzung: solange der Nutzerkreis Freunde sind, bleibt der Link mit „Zum
  Home-Bildschirm“ der günstigste Weg.

## Drei Gestaltungsvorschläge (umgesetzt am 19.10.2026)

Gesamteindruck des Kritikers: ruhig, konsequent tokenbasiert, didaktisch sauber
getrennt. Die größte Chance liegt in klarerer Bedeutung von Farbe und in der
Lesbarkeit langer Tafeln und Listen. Bleiben soll: die Dreiteilung des Lernfensters
mit gleich hohen Knöpfen an fester Stelle, Serife für Wörter gegen Grotesk für
Steuerung, SVG-Flaggen, das helle Schema mit warmem Papierton.

### 1. Sprachfarben von Urteilsfarben trennen (Aufwand klein)

Problem: Grün ist zugleich Französisch, Fortschrittsbalken, Randbalken der
Lösungskarte, „richtig“, Fragewort-Hervorhebung und der Knopf Leicht; Orange zugleich
Englisch, Nochmal, „fällig“ und Warnung. Für neue Nutzer ist das Farbsystem nicht
lernbar. Vorschlag: semantische Tokens `--ok` (vorhanden, im dunklen Schema von `--fr`
absetzen) und neu `--bad`, beide auf 4,5:1 geprüft; alle Bewertungsstellen darauf
umstellen (`.dbar i`, `.azone`, `.qq`, `.ok`/`.no`, `.g1 b`/`.g3 b`, `.rs.due`,
`.stat.warn`). Sprachfarben nur noch für Kürzel, Chips und Wörterliste. Nochmal und
Leicht zusätzlich mit 3 px Balken in `--bad`/`--ok`, damit die Bedeutung auch bei
Farbschwäche lesbar bleibt.

### 2. Formentafeln gruppieren, Trefferzeile verankern (Aufwand mittel)

Problem: Bei 16 bis 21 Zeilen ist die Tafel eine gleichförmige Liste, die Trefferzeile
hebt sich im hellen Schema nur schwach ab, „Dativ f“ steht ohne Bezug zwischen „Dativ
m“ und „Dativ n“. Vorschlag: Tafeln nach dem ersten Wort der Beschriftung gruppieren
(Nominativ, Akkusativ, Dativ, Genitiv; bei PL und RU nach Person) mit schmaler
Gruppenzeile in `.acat`-Stil, darunter nur noch das Genus. Trefferzeile mit 3 px Balken
in `--ok` und Form fett in `--ink`; nach dem Aufdecken die Trefferzeile per
`scrollIntoView({block:'center'})` in die Mitte holen. Bei Substantiven den
einheimischen Namen und die Fragewörter in eine Zeile, erste Spalte von 42 auf 50 %.

### 3. Fortschrittsübersicht als Streifenliste (Aufwand mittel)

Problem: über 25 Zeilen mit identischem Balken, abgeschnittene Themennamen,
konkurrierende Linien, die Zahl steht weit vom Balken. Vorschlag: jede Zeile als
zweizeiliger Streifen, oben Name (Umbruch erlaubt) und Prozent direkt daneben, darunter
ein Balken über die volle Breite (6 px bei Stapeln, 4 px bei Themen); Themenzeilen ohne
Trennlinie mit 24 px Einrückung; Stapelzeile mit `--card`-Hintergrund, sodass die
aufgeklappten Themen sichtbar zur Gruppe gehören. Die Erklärung in ein `details`
falten. Tipp-Ziele bleiben über 40 px, `aria-label` je Zeile bleibt.
