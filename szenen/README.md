# Mischpult-Simulator: Szenen (Prototyp)

Drei Einsatzsituationen mit Soundcheck und Show: Konferenz, Musik, Aufnahme.
Die Seite läuft komplett im Browser (Web Audio API) und ruft nichts von externen Servern ab.
Sie funktioniert auch lokal per Doppelklick auf `index.html`.

## Aufbau

```
index.html            Seitengerüst, lädt die Skripte in fester Reihenfolge
css/style.css         Gestaltung
js/util.js            Hilfsfunktionen, Richtcharakteristiken, Mikrofontypen
js/controls.js        Drehregler, Taster, Fader, Pegelanzeigen
js/sounds.js          Klangerzeugung (Sprach-„Gebrabbel“, Band, Jingle, Atmo)
js/engine.js          Audio-Signalweg: Raum → Mikrofon → Stagebox → Patch → Kanal → Busse → Ausgänge → Abhöre
js/help.js            Erklärtexte (data-help="…")
js/scenes/*.js        Eine Datei pro Szene
js/ui-*.js            Pult, Raumplan, Patchfeld
js/app.js             Zustand, Soundcheck/Show, Aufgaben, Bewertung
```

## Neue Szene anlegen

1. Eine vorhandene Datei in `js/scenes/` kopieren und `id` und `name` ändern.
2. Quellen (`sources`), Mikrofone (`mics`), Eingänge (`inputs`), Startzustand der Kanäle (`channels`),
   Ausgänge (`outputs`, `outDefault`) und Abhörpunkte (`listen`) anpassen.
3. Ablaufplan (`show.cues`, `show.activity`), Show-Regeln (`show.rules`) und Soundcheck-Aufgaben (`tasks`) schreiben.
4. Die Datei in `index.html` bei den Szenen eintragen.

Koordinaten im Raum sind Meter, Winkel Grad (0° = rechts, 90° = unten, −90° = oben).
