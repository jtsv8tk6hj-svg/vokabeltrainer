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

## Was drin ist

301 Fachbegriffe der Personalgewinnung der Bundeswehr, in elf Kategorien von Recht
über Verfahren bis Vortragssprache. Eigene Wörter lassen sich unter *Neu* anlegen,
weitere Listen unter *Daten* als CSV einlesen.

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

Aufbau, Datenmodell, didaktische Festlegungen und bekannte Fallstricke stehen in
[CLAUDE.md](CLAUDE.md).
