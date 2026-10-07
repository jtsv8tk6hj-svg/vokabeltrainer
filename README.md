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
2. **Kurzbefehl in die Zwischenablage.** In der Kurzbefehle-App: *Notizen suchen* mit
   Filter „Name ist Vokabeln“, Limit 1 → *Details der Notiz abrufen*, Detail „Text“ →
   *In Zwischenablage kopieren*. Den Kurzbefehl auf den Home-Bildschirm legen, danach
   die App öffnen und einfügen.
3. **Kurzbefehl öffnet die App mit der Liste.** Wie 2, aber statt Kopieren: *URL-codieren*
   → *URL* `https://jtsv8tk6hj-svg.github.io/vokabeltrainer/#liste=` gefolgt vom
   codierten Text → *URL öffnen*. Die Liste steht dann sofort im Feld. Das öffnet
   Safari; das Home-Bildschirm-Symbol auf dem iPhone hat einen eigenen Speicher und
   sieht die Liste nicht. Wer die App als Symbol nutzt, nimmt Weg 1 oder 2.

## Weiterentwickeln

`index.html` wird erzeugt und sollte nicht von Hand bearbeitet werden:

```bash
python3 build.py        # erzeugt index.html aus src/template.html und daten/
```

Aufbau, Datenmodell, didaktische Festlegungen und bekannte Fallstricke stehen in
[CLAUDE.md](CLAUDE.md).
