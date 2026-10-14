# Vokabeltrainer

Fünfsprachiger Vokabeltrainer — Deutsch, Englisch, Französisch, Polnisch, Russisch —
mit Beispielsätzen in beiden Sprachen und einem Karteikartensystem nach dem Prinzip
wachsender Abstände.

**→ https://jtsv8tk6hj-svg.github.io/vokabeltrainer/**

Kein Konto, keine Installation, kein Server. Nach dem ersten Aufruf läuft alles
offline.

## Einrichten

Link in Safari oder Chrome öffnen, dann **Teilen → Zum Home-Bildschirm**. Danach
startet die App über ihr eigenes Symbol, auch im Flugmodus. Der Lernstand bleibt auf
dem Gerät erhalten.

Einmal mit Internet öffnen, bevor es offline gehen soll — dabei legt sich die App auf
dem Gerät ab.

## Lernen

Ein Begriff erscheint, dazu der Beispielsatz mit Lücke. Antwort überlegen, dann
**Aufdecken**. Anschließend selbst bewerten:

| Knopf | Bedeutung | nächster Abstand |
|---|---|---|
| Nochmal | saß nicht | 10 Minuten, dann von vorn |
| Gut | saß | eine Stufe weiter |
| Leicht | saß sofort | zwei Stufen weiter |

Die Leiter: 1, 3, 7, 16, 35, 75, 150, 300 Tage. Auf jedem Knopf steht, wann die Karte
wiederkommt.

### Antwortmodus

Auf der Lernseite lässt sich wählen, wie geantwortet wird:

| Modus | Ablauf |
|---|---|
| Überlegen und aufdecken | Begriff ansehen, Antwort im Kopf bilden, aufdecken, selbst bewerten. Der Regelfall. |
| Antwort eintippen | Antwort schreiben, die App vergleicht und zeigt das Ergebnis. Streng, gut für die Sprache, die man aktiv sprechen will. |
| Nur anschauen | Begriff und Lösung stehen gleich zusammen, ein Knopf **Weiter**. Zum Durchsehen der Auswahl, verändert den Lernstand nicht. |

### Richtung

Vorgabe ist „Deutsch und Englisch gemischt“: die App fragt abwechselnd in beiden
Sprachen, gesucht ist die jeweils andere. Wer eine feste Richtung will, wählt „Von
Deutsch“ und eine oder mehrere Zielsprachen, etwa Polnisch und Russisch. Dann steht
auf der Karte ein Eingabefeld je Zielsprache, nach dem Aufdecken ein Urteil je Sprache
(vorgeschlagen aus dem Vergleich, antippbar) und ein Knopf **Übernehmen**.

Jedes Wort hat je Zielsprache einen eigenen Lernstand. Wer Polnisch übt, verändert
damit nichts am Stand für Englisch. Das Tagespensum zählt je Wort und Zielsprache.

## Erscheinungsbild

Die App folgt der Systemeinstellung: dunkel oder hell. Jede Sprache hat eine Flagge und
eine feste Farbe, die sich durch Lernkarte, Richtungswahl, Wörterliste und Formular
zieht. Unter *Wörter* steht jede Sprache in einer eigenen Zeile; über die Chips
„Zeigen“ lässt sich die Liste auf einzelne Sprachen beschränken, etwa nur Polnisch und
Russisch.

## Was drin ist

301 Fachbegriffe der Personalgewinnung der Bundeswehr in elf Kategorien, 240
Alltagswörter in zwölf Themen, 500 Begriffe rund um Lebensmittel, Küche und Kochen in
zwanzig Themen, dazu Verben, Substantive, Adjektive und Pronomen mit Formentafeln. Eigene Wörter lassen sich unter *Neu* anlegen,
weitere Listen unter *Daten* als CSV einlesen.

## Alltag, Küche und Themen

Der Stapel **Alltag** bringt 240 Wörter und Wendungen in zwölf Themen mit, von
„Begrüßung und Höflichkeit“ über „Unterwegs“ bis „Körper und Gesundheit“, der Stapel
**Küche** 500 Begriffe zu Lebensmitteln, Küche und Kochen in zwanzig Themen, von Obst
und Gemüse über Küchengeräte und Garmethoden bis zum Restaurant. Unter *Lernen* den
Stapel wählen, dann das Thema, dann starten. Die Themen eines Stapels erscheinen als
Kategorien.

Eigene Themen entstehen unter *Neu → Thema aufbereiten*: Thema nennen, etwa „Beim
Arzt“, Anzahl wählen, und die App stellt mit hinterlegtem API-Schlüssel den Wortschatz
in allen fünf Sprachen samt Beispielsätzen zusammen. Schon vorhandene Wörter werden
übersprungen. Danach ist das Thema unter *Lernen* abrufbar.

## Verben, Substantive, Adjektive, Pronomen und Formen

Der Stapel **Verben** bringt 60 häufige Verben in allen fünf Sprachen mit, bei
Polnisch und Russisch als Aspektpaar, der Stapel **Substantive** 60 häufige Substantive
mit Artikel und Genus, dazu **Adjektive** (40, mit Komparation und Deklination) und
**Pronomen** (11, mit allen Fällen). Dazu übt die App Formen: „*arbeiten* · Präsens · du“ oder
„*дом* · Plural · Genitiv“, Antwort eintippen oder aufdecken, die Auflösung zeigt die
ganze Tafel: Tempus mit allen Personen, Numerus mit allen Fällen (Deutsch vier,
Russisch sechs, Polnisch sieben). Zu jedem Fall stehen der einheimische Name und die
Fragewörter, etwa „celownik · komu? czemu?“. Jede Tafel hat ihren eigenen Lernstand, zählt im
Tagespensum wie eine Karte und wandert mit dem Fortschritts-Code. Unter *Daten →
Lernweise* lässt sich „Formentafeln mitlernen“ abschalten.

Die Tafeln sind maschinell erzeugt. Wer eine Form für falsch hält, tippt in der
Auflösung auf **Form melden**; die Meldungen sammeln sich unter *Daten* und lassen sich
kopieren. Eigene Verben und Substantive (mit Artikel eingetragen) bekommen ihre Tafel
beim Speichern, wenn ein API-Schlüssel hinterlegt ist.

## Wortliste aus Apple Notizen

Unter *Neu → Liste übernehmen* nimmt die App eine Wortliste als Text an: eine Zeile je
Wort, wahlweise mit Übersetzung (`Bewerbung – application`, auch mit `=`, `:` oder `;`
als Trenner). Aufzählungszeichen werden entfernt, eine Zeile `# Name` oder
`Stapel: Name` legt den Stapelnamen fest. Schon vorhandene Wörter werden übersprungen,
eine wachsende Notiz kann also immer wieder eingelesen werden.

Mit hinterlegtem API-Schlüssel (unten auf derselben Seite) ergänzt die App alle fünf
Sprachen, die russische Umschrift und beide Beispielsätze, zwanzig Wörter je Anfrage.
Ohne Schlüssel bleiben die Wörter mit den eingegebenen Angaben stehen; **Nachübersetzen**
holt die fehlenden Felder später nach.

Drei Wege von der Notiz in die App:

1. **Kopieren.** Text der Notiz markieren, kopieren, in der App *Aus Zwischenablage
   einfügen* wählen.
2. **Kurzbefehl in die Zwischenablage.** Ein Tipp legt den Notiztext in die
   Zwischenablage, danach die App öffnen und einfügen. Passt zum Home-Bildschirm-Symbol.
3. **Kurzbefehl öffnet die App mit der Liste** über die Adresse `…/#liste=`. Nur für die
   Nutzung in Safari, weil das Home-Bildschirm-Symbol einen eigenen Speicher hat.

Die Anleitung zum Nachbauen beider Kurzbefehle, Schritt für Schritt, steht unter
**https://jtsv8tk6hj-svg.github.io/vokabeltrainer/kurzbefehl.html** und ist aus der
App heraus verlinkt (*Neu → Liste übernehmen → Aus einer Notiz auf dem iPhone*).
Die Notiz beginnt am besten mit der Zeile `Stapel: Vokabeln`, dann wird der Titel
nicht als Wort angelegt.

## Weiterentwickeln

`index.html` wird erzeugt und sollte nicht von Hand bearbeitet werden:

```bash
python3 build.py        # erzeugt index.html aus src/template.html und daten/
```

Die Formentafeln aller vier Wortarten entstehen einmalig mit einem eigenen API-Schlüssel:

```bash
export ANTHROPIC_API_KEY=sk-ant-…
python3 formen.py       # schreibt daten/formen.json, danach build.py, commit, push
```

Aufbau, Datenmodell, didaktische Festlegungen und bekannte Fallstricke stehen in
[CLAUDE.md](CLAUDE.md).
