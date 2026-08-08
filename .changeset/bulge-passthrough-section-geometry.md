---
'@baustatik/section-geometry': minor
---

`Bulge` als vollständige y/z-Durchreiche hinzugefügt, alle sechs Funktionen —
auch die drei koordinatenfreien (`sweep`, `sagitta`, `isStraight`), nach dem
Vorbild von `normalizeAngleYZ`. Ihre JSDoc sagt jeweils, *warum* sie nichts
umrechnen. Die Vorzeichen tragen 1:1 durch, weil `convert.ts`
orientierungstreu ist: ein positiver `bulge` dreht von `+y` nach `+z`, wie
`Arc.sweep`.

`StraightBulgeError` und `FullCircleBulgeError` werden wie die acht bestehenden
Fehlerklassen re-exportiert.

Die `CONTEXT.md` schreibt ausserdem die Regel nieder, die der Bestand bereits
befolgte, aber nirgends aussprach: **`@baustatik/geometry-2d` wird oberhalb
dieses Packages nicht importiert, auch nicht in Tests.**

Rein additiv.
