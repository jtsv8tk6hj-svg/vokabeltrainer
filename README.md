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

## Was drin ist

301 Fachbegriffe der Personalgewinnung der Bundeswehr, in elf Kategorien von Recht
über Verfahren bis Vortragssprache. Eigene Wörter lassen sich unter *Neu* anlegen,
weitere Listen unter *Daten* als CSV einlesen.

## Weiterentwickeln

`index.html` wird erzeugt und sollte nicht von Hand bearbeitet werden:

```bash
python3 build.py        # erzeugt index.html aus src/template.html und daten/
```

Aufbau, Datenmodell, didaktische Festlegungen und bekannte Fallstricke stehen in
[CLAUDE.md](CLAUDE.md).
