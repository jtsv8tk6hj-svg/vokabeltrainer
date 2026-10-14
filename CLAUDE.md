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
daten/verben.csv                    60 Verben in fünf Sprachen mit Aspektpaaren (Stapel Verben)
daten/substantive.csv               60 Substantive in fünf Sprachen mit Artikel (Stapel Substantive)
daten/formen.json                   Formentafeln je Wort (Konjugation, Deklination), erzeugt von formen.py; Platzhalter __FORMS__
formen.py                           erzeugt und prüft die Formentafeln über die API (auf dem eigenen Rechner)
index.html                          erzeugt — nicht von Hand bearbeiten
sw.js                               Service Worker (Offline-Betrieb)
manifest.webmanifest, icon.svg      Home-Bildschirm-Symbol
.nojekyll                           verhindert Jekyll-Verarbeitung auf GitHub Pages
kurzbefehl.html                     Anleitung für den Apple-Kurzbefehl (statisch, von Hand gepflegt)
test/pruefung.js                    Playwright-Prüfung der App (siehe „Prüfen")
```

**Wichtig:** `index.html` ist ein Erzeugnis. Änderungen an der App gehören in
`src/template.html`, Änderungen am Wortschatz in `daten/`. Wer `index.html` direkt
bearbeitet, verliert die Änderung beim nächsten `build.py`.

## Arbeitsablauf

```bash
export ANTHROPIC_API_KEY=sk-ant-…  # nur für formen.py
python3 formen.py                # fehlende Formentafeln erzeugen und prüfen, schreibt daten/formen.json
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
| `p` | Lernstand je Zielsprache: `p.pl = {s, d, r}` mit `s` Stufe (Index in `LADDER`), `d` Fälligkeit in Millisekunden, `r:1` während des Wiederanlaufs nach „Nochmal“. Kein Eintrag = in dieser Sprache nie gelernt |
| `g` | Lernstand der Formkarten: `g.ru[2] = {s, d, r}` je Sprache und Tempus-Index, gleiche Form wie `p` |
| `forms` | Formentafeln am Wort, nur bei selbst angelegten Verben (Grundstock-Verben liegen in `FORMS`) |

Die früheren Felder `step` und `due` (ein Stand je Wort) werden in `migrate()` beim
Laden, beim JSON-Import und beim Einsetzen alter Codes in Stände für Deutsch **und**
Englisch übernommen und dann gelöscht, weil beide Richtungen gemischt geübt wurden.
`build.py` gibt sie nicht mehr aus.

Daneben im Speicher: `cfg` (Tagespensum, Lernweise, Antwortmodus `mode`, Richtung
`from`/`to`, `forms` Verbformen mitlernen, `wl` Sprachen der Wörterliste), `log` (neue
Karten je Tag, Schlüssel `JJJJ-MM-TT` nach Ortszeit), `key` (optionaler API-Schlüssel),
`rep` (gemeldete Formen), `seedn` (Zahl der Grundstock-Einträge beim letzten Abgleich:
kommen neue hinzu, etwa der Stapel Verben, trägt `load()` die fehlenden Ids einmalig
nach, ohne gelöschte Wörter wiederzubeleben).

`cfg.from` ist `mix` (Deutsch und Englisch gemischt, Vorgabe, mit `askAll` alle
Sprachen als Frage) oder ein Sprachkürzel; `cfg.to` ist die Liste der Zielsprachen in
fester Reihenfolge `de en fr pl ru`, nie leer. Bei `mix` ist das Ziel je Karte das
Gegenstück (Deutsch ↔ Englisch, andere Fragesprachen nach Deutsch).

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
startet bei Stufe 0 (Gut → 1 Tag) bzw. Stufe 1 (Leicht → 3 Tage). Der Wiederanlauf
nach „Nochmal“ zählt wie neu: Gut führt wieder zu Stufe 0.

**Vorzeitigkeitsregel.** Eine Karte erscheint, sobald eine ihrer Zielsprachen fällig
oder neu ist; die übrigen gewählten Zielsprachen werden mit abgefragt. Ist eine
davon noch nicht fällig, bringt eine richtige Antwort sie nicht voran, eine falsche
setzt sie zurück (`plan()`). Sonst rutschte eine Sprache durch bloßes Mitlaufen in
lange Abstände.

Bewusst gewählt gegen SM-2: nachvollziehbar, leicht zu erklären, in der Praxis
gleichwertig. Eine frühere Fassung hatte den vollen Anki-Algorithmus mit
Leichtigkeitsfaktor — er wurde auf Wunsch zugunsten der Verständlichkeit entfernt.

**Nur anschauen** (`mode: look`) ist ein Durchsehen, kein Lernen: Frage und Lösung
stehen zusammen, es gibt nur **Weiter**, `step` und `due` bleiben unberührt, die Runde
läuft über die ganze Auswahl (Fälliges und Neues zuerst, dann der Rest). Der
Startknopf heißt dann „Durchsehen starten“.

**Eine Karte je Wort, ein Stand je Zielsprache.** Die Karte ist das Wort; der
Lernstand liegt je Zielsprache in `p`, weil Produktion in eine Sprache eine eigene
Fertigkeit ist. Das Tagespensum zählt je Wort und Zielsprache. Die Richtung wählt der
Nutzer auf der Lernseite: gemischt (Vorgabe, wie bisher) oder fest „von X nach Y, Z“.
Bei mehreren Zielsprachen bekommt die Karte ein Eingabefeld je Sprache und nach dem
Aufdecken ein antippbares Urteil je Sprache (Nochmal, Gut, Leicht, vorgeschlagen aus
dem Vergleich) mit einem Knopf **Übernehmen**; bei einer Zielsprache bleiben die drei
Knöpfe, im Tippmodus ist der passende vorgewählt. Nicht gewählte Sprachen laufen klein
in der Auflösung mit (`.more`).

## Verben, Substantive und Formkarten

Der Stapel **Verben** enthält 60 kuratierte Verben (`daten/verben.csv`, zwei Drittel
allgemein, ein Drittel Personalgewinnung), dieselben Begriffe in fünf Sprachen, bei
Polnisch und Russisch als Aspektpaar „unvollendet / vollendet“ im Wortfeld selbst
(`pracować / popracować`), damit `matches()` beide Formen als richtig wertet. Die
Verben sind normale Wortkarten und zusätzlich Quelle für **Formkarten**.

Formentafeln liegen in `daten/formen.json` je Verb und Sprache:
`{inf, aspect, pair, note, tenses:[{t, rows:[{p, f}]}]}`. `p` ist die Person oder
Beschriftung in der jeweiligen Sprache, `f` die Form ohne Pronomen. Die Tempora je
Sprache sind fest (`TEMPORA` in `formen.py` und in `src/template.html`, beide gleich
halten): DE Präsens, Präteritum, Perfekt, Futur I, Imperativ, Konjunktiv II; EN
Präsens, Vergangenheit, Perfekt, Futur, Imperativ, Formen; FR Présent, Passé composé,
Imparfait, Futur simple, Impératif, Subjonctif présent; PL und RU Präsens,
Vergangenheit (nach Genus), Futur (unvollendet), Futur (vollendet), Imperativ.

`formen.py` erzeugt die Tafeln über die API (Modell `claude-opus-5-5`, Antwort an ein
JSON-Schema gebunden, nur Standardbibliothek, resumierbar) und macht einen zweiten
Prüfdurchgang, in dem das Modell die eigenen Tafeln gegenliest (`_geprueft`). Die
beiden Verben `arbeiten` und `fragen` sind von Hand geschrieben und dienen als Muster
und Prüfdaten. Die Tafeln sind maschinell; die App sagt das unter *Daten → Meldungen*
und bietet in jeder Formkarte **Form melden** (`data.rep`, kopierbar als JSON).

**Substantive.** Der Stapel **Substantive** enthält 60 kuratierte Substantive
(`daten/substantive.csv`), Deutsch und Französisch mit Artikel im Wortfeld. Ihre Tafeln
nutzen dasselbe Format: Gruppen `Singular` und `Plural` (DE vier Fälle mit Artikel, PL
sieben Fälle, RU sechs Fälle mit Betonung), Englisch und Französisch eine Gruppe
`Formen` mit Singular und Plural. Dazu `gender` (m, f, n) am Spracheintrag, auf der
Karte hinter der Grundform. Pluraliatantum haben eine leere Singular-Gruppe und einen
Hinweis in `note`. `formen.py` unterscheidet die Wortart an der Kennung (`vb`, `sb`)
und nutzt je eigenen Systemtext (`SYSTEM`, `SYSTEM_SUBST`) und Tafelsatz (`TEMPORA`,
`KASUS`); die App ebenso (`FORM_SYSTEM`, `NOUN_SYSTEM`, `nounLike()`: Kennung `sb` oder ein unter *Neu*
einzeln angelegtes Wort mit deutschem Artikel, Merkmal `tbl`; Listenimporte bekommen
bewusst keine Kasustafeln, sonst löste jede Notiz mit Artikeln hundert Anfragen aus). `das Haus` und `die Arbeit` sind von Hand
geschrieben.

**Formkarte.** Ein Eintrag der Warteschlange ist `{i}` für ein Wort oder `{i, k, t}`
für Wort × Sprache × Tafel (`entries()`), bei Substantiven also Singular oder Plural. Je Karte wird eine zufällige Zeile der
Tafel gefragt: „*arbeiten* · Präsens · du“ (`#qTask`), Antwort eintippen oder
aufdecken, die Auflösung zeigt die Form groß und darunter die ganze Tafel des Tempus
mit markierter Zeile. Der Stand liegt in `i.g[k][t]`, dieselbe Leiter, dasselbe
Pensum (eine Formkarte zählt eins), derselbe Code (`VT2`, fünftes Feld
`<index>.<sprache>.<tempus>.<stufe>.<tag>`). Formkarten laufen nur mit, wenn der
Stapel Verben in der Auswahl ist und `cfg.forms` an ist (Lernweise „Verbformen
mitlernen“). Sie folgen der gewählten Richtung: Zielsprachen sind die Sprachen der
Formkarten.

**Eigene Verben.** `verbLike()` erkennt einen deutschen Infinitiv (kleingeschrieben,
ein Wort, wahlweise „sich“) oder ohne Deutsch ein englisches „to …“. Beim Speichern
unter *Neu* holt `fetchForms()` mit hinterlegtem Schlüssel die Tafel und legt sie am
Wort ab (`i.forms`); *Nachübersetzen* holt sie für alle Verben ohne Tafel nach, auch
für Grundstock-Verben, solange `formen.json` sie noch nicht enthält (`formsOf()` nimmt
`i.forms` vor `FORMS`).

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
   Klammerzusätze, Betonungszeichen); bei Russisch gilt auch die Umschrift `rulat`. `look` zeigt Frage und Lösung zusammen und bewertet nicht — das
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
Symbol (getrennter Speicher). Die Anleitung zum Nachbauen der Kurzbefehle liegt als
eigene Seite `kurzbefehl.html` neben der App, mit denselben Farben, ohne Skript; sie
wird vom Service Worker mit vorgehalten und ist aus dem Hinweis unter *Liste
übernehmen* verlinkt. Empfohlene erste Zeile der Notiz: `Stapel: Vokabeln`.

Die Übersetzung läuft über eine gemeinsame Funktion `translate(list)` für Einzelwort,
Liste und *Nachübersetzen*: direkter `fetch` auf `api.anthropic.com/v1/messages` mit
dem Schlüssel des Nutzers (Kopfzeile `anthropic-dangerous-direct-browser-access`, weil
ohne Server), Modell `claude-opus-5-5`, Antwort über `output_config.format` an ein
JSON-Schema mit genau den Feldern `de en fr pl ru rulat ex exde cat` gebunden.
`fillItems()` schickt Blöcke von 20 Wörtern, füllt nur leere Felder und speichert nach
jedem Block, sodass ein Abbruch nichts verliert. Bewusst kein SDK und kein Bundler:
die App bleibt eine Datei ohne Abhängigkeiten. Kein Fallback-Modell konfiguriert;
ein `stop_reason: "refusal"` wird als Fehler gemeldet.

## Gestaltung

Ziel ist eine App, die auch außerhalb des Dienstes gern genutzt wird und später als
Produkt bestehen kann. Deshalb gelten feste Regeln:

- **Farben nur über Tokens** in `:root` (`--bg --card --raise --line --edge --ink
  --onink --dim --faint`, Sprachfarben `--de … --ru`, Warn- und Sicherfarben). Keine
  festen Hexwerte in Regeln oder in erzeugtem HTML. Das **helle Schema** kommt über
  `prefers-color-scheme: light` und tauscht nur die Tokens; `theme-color` ist je Schema
  gesetzt. Die Anleitungsseite `kurzbefehl.html` führt dieselben Tokens.
- **Kontraste geprüft** (WCAG 2.1 AA): `faint` ≥ 4,5:1 auf `bg` und `card`
  (`#8b939d`, das frühere `#727b86` lag bei 4,0:1), Ränder von Knöpfen und Chips über
  `--edge` ≥ 3:1 (`--line` ist nur für Trennlinien und Kartenränder, 1,3:1).
  Sprachfarben tragen dunklen Text `--ontag`.
- **Tipp-Ziele** mindestens 40 px hoch (Chips, Urteil-Knöpfe, Reiter 44 px,
  Vorlese-Knopf 34 px).
- **Flaggen** sind eingebettete SVG-Grafiken (`.flag.f-xx`), weil Emoji-Flaggen auf
  Windows nicht dargestellt werden. Sie stehen überall neben dem farbigen
  Sprachkürzel (`TAG()`), in der Richtungswahl, in der Wörterliste und im Formular.
  Englisch führt die britische Flagge.
- **Wörterliste je Sprache.** Jede Sprache steht in einer eigenen Zeile mit Flagge,
  Kürzel, Wort, Umschrift und Lernstand (`fällig` rot). Die Chips „Zeigen“ wählen,
  welche Sprachen gelistet werden (`cfg.wl`), damit sich eine Sprache einzeln
  betrachten lässt. Kein Fließtext mehr.
- **Bewegung sparsam**: Knöpfe drücken sich leicht ein, die Auflösung blendet in
  180 ms ein; `prefers-reduced-motion` schaltet alles ab. Die Frage bleibt beim
  Scrollen der Auflösung als klebrige Kopfzeile sichtbar.
- **Rollen für Bildschirmleser**: Chips tragen `aria-pressed`, Reiter `aria-current`,
  Lernfenster und Begrüßung `role="dialog"`, Eingabefelder `aria-label`, Toast und
  Auflösung `aria-live`.
- Das Bundeswehr-Design (Skill `bw-design-karriereberatung`) wird bewusst nicht
  verwendet: die App ist ein eigenes Produkt, kein Dienstwerkzeug.

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
  `VT2|<index>.<sprache>.<stufe>.<tag>,…|<neue heute>|<eigene Wörter base64>` trägt
  den Lernstand über die Zwischenablage, ein Eintrag je Wort und Zielsprache, Sprache
  als Buchstabe `d e f p r`. Alte `VT1`-Codes bleiben lesbar und werden wie der alte
  Speicherstand auf Deutsch und Englisch übernommen.
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
Speichern der Bewertung je Zielsprache, Wiederanlauf nach „Nochmal“, die drei
Antwortmodi, Richtungswahl, zwei Zielsprachen mit Urteil je Sprache, Pensum je Wort
und Sprache, Vorzeitigkeitsregel, Übernahme alter Speicherstände und `VT1`-Codes,
Listenimport mit Dubletten und
nachgestellter API (`page.route` auf `api.anthropic.com`, prüft auch Modell und
Schema der Anfrage), Nachübersetzen, Übernahme aus dem Link, Start ohne Speicher mit
Sichern und Einsetzen des Fortschritts-Codes, Formkarten (Stapel Verben, Aufgabe,
Tafel, Melden, Stand, Code mit Grammatikfeld, Schalter „Formen mitlernen“,
Formen-Abruf über die Attrappe), Kasuskarten (Stapel Substantive, Genus, sechs
russische Fälle), Selbstheilung bei leerem Speicherstand und
Offline-Start über den Service Worker. Jede Zeile der Ausgabe beginnt mit `OK` oder `FEHL`, der
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
  als Verstehen. Mit dem Stand je Zielsprache ist die Grundlage da, die Leiter ist
  noch für alle Richtungen gleich.
- Abgestimmter Ausbau in Stufen: Stufe 2 Verben und Stufe 3 Substantive sind gebaut;
  die Tafeln für 116 Wörter entstehen erst mit `python3 formen.py` auf dem Rechner des
  Nutzers. Stufe 4 Adjektive und Pronomen folgt im selben Tafelformat
  `{t, rows:[{p, f}]}` (Adjektive: Gruppen je Genus und Numerus, Komparation).
- Zweiter Stapel mit Alltagswortschatz, damit die App auch privat taugt.
- FR/PL/RU von Muttersprachlern gegenlesen lassen.
- Import weiterer CSV-Dateien als eigene Stapel ist bereits eingebaut
  (*Daten → Datei einlesen*), Format `Englisch;Deutsch;Kategorie;Beispielsatz`.

## Sprache

Oberfläche, Code-Kommentare und Commit-Nachrichten auf Deutsch. Knapp und sachlich,
keine Ausrufezeichen, keine Werbesprache. Fehlermeldungen sagen, was zu tun ist.
