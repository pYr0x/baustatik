---
'@baustatik/geometry-2d': minor
---

`Bulge` hinzugefügt — der Umrechner zwischen der DXF-Wölbung `tan(Δ/4)` und
einem `Arc`, als eigenes Modul `src/bulge.ts`. Sechs Funktionen: `sweep`,
`sagitta`, `isStraight`, `toArc`, `fromArc`, `toPolyline`.

Die tragende Identität ist die Stichhöhe `h = (Sehne/2)·|bulge|` — **exakt**,
nicht genähert. Damit fällt „ab wann ist ein Bogen eine Gerade" mit
`DEFAULT_ARC_TOLERANCE` zusammen, statt eine zweite Zahl zu brauchen; ein festes
Epsilon auf `bulge` wäre längenblind.

`toArc` und `fromArc` **werfen** statt `undefined` zu liefern: die Gerade ist
eine bekannte Antwort und nicht „ich weiss es nicht". Neu sind dafür
`StraightBulgeError(bulge, chordLength, tolerance)` und
`FullCircleBulgeError(sweep)`, beide **mit Feldern** — anders als der Altbestand
in `errors.ts`. `toPolyline` ist total und bedient die Gerade mit.

Rein additiv; nichts Bestehendes ändert sich.
