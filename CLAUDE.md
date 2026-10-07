# Vokabeltrainer — Arbeitsgrundlage

Fünfsprachiger Vokabeltrainer (Deutsch, Englisch, Französisch, Polnisch, Russisch)
mit Beispielsätzen und Karteikartensystem. Entstanden für die Fachbegriffe der
Personalgewinnung der Bundeswehr, aber inhaltlich offen: der Wortschatz ist Daten,
nicht Programm.

**Live:** https://jtsv8tk6hj-svg.github.io/vokabeltrainer/
**Nutzung:** Link in Safari öffnen → Teilen → Zum Home-Bildschirm. Danach eigenes
App-Symbol, Start im Flugmodus, Lernstand bleibt dauerhaft erhalten.

---

## Projektstruktur

```
build.py                            erzeugt index.html aus Vorlage + Daten
src/template.html                   die App; Platzhalter __SEED__ für die Wörter
daten/vokabeln-personalgewinnung.csv  Quelle: Englisch;Deutsch;Kategorie;Beispielsatz
daten/beispielsaetze-de.json        {id: deutscher Beispielsatz}
daten/sprachen-fr-pl-ru.json        {id: {fr, pl, ru, rulat}}
index.html                          erzeugt — nicht von Hand bearbeiten
sw.js                               Service Worker (Offline-Betrieb)
manifest.webmanifest, icon.svg      Home-Bildschirm-Symbol
.nojekyll                           verhindert Jekyll-Verarbeitung auf GitHub Pages
test/pruefung.js                    Playwright-Prüfung der App (siehe „Prüfen")
```

**Wichtig:** `index.html` ist ein Erzeugnis. Änderungen an der App gehören in
`src/template.html`, Änderungen am Wortschatz in `daten/`. Wer `index.html` direkt
bearbeitet, verliert die Änderung beim nächsten `build.py`.

## Arbeitsablauf

```bash
python3 build.py                 # index.html neu erzeugen
python3 -m http.server 8000      # lokal prüfen unter localhost:8000
node test/pruefung.js            # Playwright-Prüfung (startet den Server bei Bedarf selbst)
git add -A && git commit -m "…" && git push
```

GitHub Pages baut nach dem Push etwa 60 Sekunden und liefert dann die neue Fassung
aus. Der Service Worker holt die Seite netzwerk-zuerst, Aktualisierungen kommen also
beim nächsten Öffnen an. Bei Änderungen an `sw.js` selbst den Cache-Namen
(`vokabeltrainer-vN`) hochzählen, sonst bleibt der alte Worker aktiv.

---

## Datenmodell

Ein Wort ist ein Objekt; alle Wörter liegen in `data.items`.

| Feld | Bedeutung |
|---|---|
| `id` | eindeutig; `pg001`–`pg301` für den Grundstock, `u<Zeitstempel>` für selbst angelegte |
| `de`, `en`, `fr`, `pl`, `ru` | das Wort je Sprache; leere Felder sind erlaubt |
| `rulat` | deutsche Umschrift des Russischen mit Betonungsakzent |
| `cat` | Kategorie (Recht, Verfahren, Marketing …) — Filter |
| `deck` | Stapel; Grundstock = `Personalgewinnung`, eigene = `Eigene` |
| `ex` | Beispielsatz in der Ausgangssprache (hier: englisch) |
| `exde` | derselbe Satz auf Deutsch |
| `step` | Stufe auf der Wiederholungsleiter (Index in `LADDER`) |
| `due` | Fälligkeit als Zeitstempel in Millisekunden; `0` = noch nie gelernt |

Daneben im Speicher: `cfg` (Tagespensum, Lernweise, Antwortmodus `mode`), `log` (neue
Karten je Tag, Schlüssel `JJJJ-MM-TT` nach Ortszeit), `key` (optionaler API-Schlüssel).

`cfg.mode` ist einer von `check` (überlegen und aufdecken, Vorgabe), `type` (Antwort
eintippen) oder `look` (nur anschauen). Das frühere Feld `cfg.typing` wird in `load()`
nach `mode` übernommen und gelöscht.

Speicherschlüssel: `localStorage["vokabeltrainer-v1"]`, dazu
`vokabeltrainer-v1-seen` für die einmalige Begrüßung.

## Lernverfahren

Feste Leiter statt gerechnetem Algorithmus:

```js
LADDER = [1, 3, 7, 16, 35, 75, 150, 300]   // Tage
```

- **Nochmal** → zurück auf Stufe 0, Wiedervorlage in 10 Minuten, Karte kommt in
  derselben Runde erneut.
- **Gut** → eine Stufe weiter.
- **Leicht** → zwei Stufen weiter.

Auf jedem Knopf steht der tatsächlich resultierende Abstand. Eine neue Karte
startet bei Stufe 0 (Gut → 1 Tag) bzw. Stufe 1 (Leicht → 3 Tage).

Bewusst gewählt gegen SM-2: nachvollziehbar, leicht zu erklären, in der Praxis
gleichwertig. Eine frühere Fassung hatte den vollen Anki-Algorithmus mit
Leichtigkeitsfaktor — er wurde auf Wunsch zugunsten der Verständlichkeit entfernt.

**Nur anschauen** (`mode: look`) ist ein Durchsehen, kein Lernen: Frage und Lösung
stehen zusammen, es gibt nur **Weiter**, `step` und `due` bleiben unberührt, die Runde
läuft über die ganze Auswahl (Fälliges und Neues zuerst, dann der Rest). Der
Startknopf heißt dann „Durchsehen starten“.

**Eine Karte je Wort**, nicht eine je Sprachrichtung. Die Abfragesprache wechselt
zufällig; das vervierfacht nicht die Wiederholungsmenge. Standardmäßig wird nur aus
Deutsch und Englisch abgefragt (`cfg.askAll` schaltet FR/PL/RU dazu), die übrigen
Sprachen laufen als Mitnahmeeffekt in der Auflösung mit.

## Didaktische Festlegungen

Diese sind nicht beliebig — sie wurden mit fremdsprachendidaktischer Begründung so
gesetzt und sollten nicht aus Bequemlichkeit zurückgedreht werden:

1. **Frage und Auflösung sind räumlich getrennt.** Vor dem Aufdecken steht der
   Begriff allein in der Bildschirmmitte. Danach rückt die Frage nach oben, schrumpft
   und wird grau; die Lösung erscheint in einer eigenen Karte mit grünem Randbalken.
   Grund: steht die Lösung direkt unter der Frage, hat das Auge sie gesehen, bevor
   das Gedächtnis arbeiten konnte — dann wird Wiedererkennen statt Abruf geübt.
2. **Lückensatz.** Auf der Frageseite steht der Beispielsatz mit ausgeschnittenem
   Begriff, gebeugte Formen werden mit erkannt (`wrap()` in `src/template.html`).
   Abruf im Satzbau statt isoliert.
3. **Beide Sätze in der Auflösung**, Zielsprache zuerst, Ausgangssprache darunter
   abgesetzt. Der gesuchte Begriff ist in beiden Sätzen fett markiert.
4. **Nebensprachen klein.** FR/PL/RU erscheinen erst nach dem Aufdecken, deutlich
   kleiner als die Hauptlösung, mit eigenem Vorlese-Knopf.
5. **Russisch mit Betonungszeichen** (учи́тель) und deutscher Umschrift. Die Betonung
   ist im Russischen nicht vorhersagbar; wer sie nicht mitlernt, spricht dauerhaft
   falsch. Bei Verben steht das Aspektpaar.
6. **Antwortmodus** (`cfg.mode`, Chips auf der Lernseite). `check` ist der Regelfall.
   `type` vergleicht die Eingabe über `matches()` mit Normalisierung (Artikel, Akzente,
   Klammerzusätze). `look` zeigt Frage und Lösung zusammen und bewertet nicht — das
   ist die ausdrücklich gewünschte Ausnahme von Punkt 1 und darf nicht zur Vorgabe
   werden.

## Listenimport und Übersetzung

*Neu → Liste übernehmen* nimmt Text an, eine Zeile je Wort. `parseList()` entfernt
Aufzählungszeichen, liest `# Name` bzw. `Stapel: Name` als Stapelnamen und trennt
„Wort – Übersetzung“ an ` – `, ` - `, `=`, `:` (mit Leerzeichen danach), `;` oder Tab.
Die Sprache der ersten Spalte wählt der Nutzer (Deutsch oder Englisch), die zweite ist
die jeweils andere. Dubletten werden je Sprache über `norm()` gegen den ganzen Bestand
erkannt und übersprungen, damit eine wachsende Notiz mehrfach eingelesen werden kann.

Drei Zugänge zum selben Feld: Einfügen von Hand, `navigator.clipboard.readText()`
(Knopf *Aus Zwischenablage einfügen*, braucht eine Nutzergeste), und `fromLink()`,
das `#liste=…` oder `?liste=…` aus der Adresse übernimmt, die Adresse per
`history.replaceState` bereinigt und zur Ansicht *Neu* wechselt. Letzteres ist für
Kurzbefehle gedacht; auf dem iPhone landet es in Safari, nicht im Home-Bildschirm-
Symbol (getrennter Speicher), siehe README.

Die Übersetzung läuft über eine gemeinsame Funktion `translate(list)` für Einzelwort,
Liste und *Nachübersetzen*: direkter `fetch` auf `api.anthropic.com/v1/messages` mit
dem Schlüssel des Nutzers (Kopfzeile `anthropic-dangerous-direct-browser-access`, weil
ohne Server), Modell `claude-opus-5-5`, Antwort über `output_config.format` an ein
JSON-Schema mit genau den Feldern `de en fr pl ru rulat ex exde cat` gebunden.
`fillItems()` schickt Blöcke von 20 Wörtern, füllt nur leere Felder und speichert nach
jedem Block, sodass ein Abbruch nichts verliert. Bewusst kein SDK und kein Bundler:
die App bleibt eine Datei ohne Abhängigkeiten. Kein Fallback-Modell konfiguriert;
ein `stop_reason: "refusal"` wird als Fehler gemeldet.

## Oberfläche

Das Lernfenster `#drill` ist ein Vollbild mit fester Dreiteilung: Kopf (Fortschritt,
Zähler), scrollbare Mitte, feste Fußzeile mit den Knöpfen. `body.drilling` stellt die
Seite dahinter fest. Aufdecken-Knopf und die drei Bewertungsknöpfe sind gleich hoch
und sitzen an derselben Stelle — der Daumen bleibt liegen, nichts springt. Das war
eine ausdrückliche Anforderung für das iPhone.

---

## Fallen, die schon zugeschnappt sind

Alle vier haben in der Praxis Zeit gekostet. Sie stehen hier, damit sie nicht
wiederkehren.

**1. `display` schlägt das `hidden`-Attribut.** Eine Regel wie `.grades{display:grid}`
überschreibt die Browser-Vorgabe `[hidden]{display:none}`. Folge: Lösung und
Bewertungsknöpfe waren immer sichtbar, das Lernverfahren damit wertlos. Abgesichert
durch `[hidden]{display:none !important}` ganz oben im Stylesheet — diese Zeile nicht
entfernen.

**2. Spezifität bei Knöpfen.** `#app button{color:…}` ist stärker als `.primary{…}`
und hat die dunkle Schrift auf hellen Knöpfen überschrieben: weiß auf weiß. Deshalb
sind die Knopfregeln als `#app .primary` geschrieben. Bei neuen Knöpfen gleich stark
schreiben.

**3. Leerer Speicherstand.** Lag unter dem Schlüssel ein Objekt ohne `items`, lud die
App brav nichts und zeigte „0 Wörter". Behoben durch Selbstheilung in `load()`: ist
`data.items` leer oder kein Array, wird der Grundstock aus `SEED` wiederhergestellt.
Zusätzlich fängt ein `try/catch` um die Initialisierung einen Totalausfall ab und
zeigt statt einer toten Seite einen Knopf zum Zurücksetzen.

**4. Datumsgrenze nach Weltzeit.** `toISOString()` für den Tagesschlüssel ordnete
alles zwischen Mitternacht und 02:00 dem Vortag zu. `today()` rechnet jetzt in
Ortszeit.

## Grenzen

- **Lokal geöffnete Dateien laufen auf iOS nicht.** Eine `.html` aus der Dateien-App
  wird dort nur angezeigt, nicht ausgeführt. Deshalb die gehostete Fassung. Auf Mac,
  Windows und Android funktioniert die Einzeldatei weiterhin.
- Ohne Browser-Speicher (private Fenster, manche Vorschauen) erscheint ein roter
  Balken mit **Sichern** und **Laden**: ein kurzer Code im Format
  `VT1|<index>.<stufe>.<tag>,…|<neue heute>|<eigene Wörter base64>` trägt den
  Lernstand über die Zwischenablage. Rund 11 Zeichen je gelerntem Wort.
- Der Lernstand hängt an Gerät und Browser. Kein Abgleich zwischen Geräten.
- Die automatische Übersetzung (Einzelwort, Liste, Nachübersetzen) braucht einen
  eigenen API-Schlüssel (unter *Neu* zu hinterlegen, bleibt lokal) und Internet. Der
  Schlüssel liegt im Browser-Speicher; wer das Gerät teilt, sollte das wissen.
- Apple Notizen hat keine Schnittstelle für Web-Apps. Der Weg führt über Zwischenablage
  oder Kurzbefehl (siehe README), nicht über einen direkten Zugriff auf die Notiz.
- FR/PL/RU wurden maschinell ergänzt und sind nicht von Muttersprachlern geprüft.
- Die Beispielsätze enthalten Zahlen aus dem Fachbereich (Zielgrößen, Quoten,
  Standortplanungen). Die Adresse ist öffentlich erreichbar — bewusst so entschieden.

## Prüfen

`test/pruefung.js` prüft die gebaute `index.html` mit Playwright gegen Chromium im
iPhone-Format. Voraussetzung ist ein global installiertes `playwright` samt Chromium
(`npm i -g playwright && npx playwright install chromium`); liegt es nicht im
Modulpfad, hilft `NODE_PATH=$(npm root -g)`. Abgedeckt sind: Begrüßung nur beim
ersten Start, Verbergen und Aufdecken, Lage und Beschriftung der Bewertungsknöpfe,
Speichern der Bewertung, die drei Antwortmodi, Listenimport mit Dubletten und
nachgestellter API (`page.route` auf `api.anthropic.com`, prüft auch Modell und
Schema der Anfrage), Nachübersetzen, Übernahme aus dem Link, Start ohne Speicher mit
Sichern und Einsetzen des Fortschritts-Codes, Selbstheilung bei leerem Speicherstand
und Offline-Start über den Service Worker. Jede Zeile der Ausgabe beginnt mit `OK` oder `FEHL`, der
Exit-Code ist 1 bei Fehlschlägen. Neue Fälle dort ergänzen, nach demselben Muster:

```js
// Sichtbarkeit statt .hidden abfragen — sonst entgeht Falle 1
await p.click('#start');
console.log(await p.isVisible('#grades'));   // muss false sein
await p.click('#reveal');
console.log(await p.isVisible('#grades'));   // muss true sein
```

Weitere lohnende Fälle: Start ohne Speicher (`localStorage` per `addInitScript`
werfen lassen), Start mit leerem Speicherstand, Offline-Start nach
`context.setOffline(true)`, Fortschritts-Code erzeugen und in frischer Sitzung wieder
einsetzen.

## Mögliche nächste Schritte

- Abgleich zwischen Geräten — bisher bewusst nicht gebaut, weil jede Lösung ein Konto
  oder einen Server verlangt.
- Richtung Deutsch → Englisch strenger takten als umgekehrt; Produktion ist schwerer
  als Verstehen. Vom Didaktiker empfohlen, noch nicht umgesetzt.
- Zweiter Stapel mit Alltagswortschatz, damit die App auch privat taugt.
- FR/PL/RU von Muttersprachlern gegenlesen lassen.
- Import weiterer CSV-Dateien als eigene Stapel ist bereits eingebaut
  (*Daten → Datei einlesen*), Format `Englisch;Deutsch;Kategorie;Beispielsatz`.

## Sprache

Oberfläche, Code-Kommentare und Commit-Nachrichten auf Deutsch. Knapp und sachlich,
keine Ausrufezeichen, keine Werbesprache. Fehlermeldungen sagen, was zu tun ist.
