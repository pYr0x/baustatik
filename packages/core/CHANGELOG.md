# @baustatik/core

## 0.0.1

### Patch Changes

- d6d245f: Die mit P2 hinzugekommenen öffentlichen Werte verlassen ihr Package jetzt
  **eingefroren und `readonly`**, wie es `CODING_STANDARDS.md` §4 verlangt.

  - `Polygon.moments` gibt in `@baustatik/geometry-2d` und
    `@baustatik/section-geometry` ein `Object.freeze`-tes Ergebnis zurück und
    nimmt seine Punkte als `readonly`.
  - `greenValues` und `deriveOutlineFromRings` in `@baustatik/cross-section`
    ebenso; `deriveOutlineFromRings` liefert jetzt `readonly Polygon[]` mit
    eingefrorenen Ringen.
  - `atOrThrow` in `@baustatik/core` nimmt `readonly T[]` statt `T[]` — reine
    Erweiterung, jeder bisherige Aufruf bleibt gültig.

  **Bruch am Typ, nicht am Verhalten:** `Polygon.points` ist in
  `@baustatik/section-geometry` und `@baustatik/cross-section` ein
  `readonly`-Array. Wer die Punktliste eines Polygons bisher an Ort und Stelle
  verändert hat, bekommt einen Compilerfehler; wer sie liest, merkt nichts. Die
  Laufzeitwerte sind unverändert.

  Dazu die Korrekturen aus dem Code-Review: die Kantenbildung in
  `deriveOutlineFromRings` und die Lochprobe in `validateSectionGeometry` kommen
  ohne direkten Index aus, `packages/section-geometry/README.md` behauptet nicht
  länger eine Normalisierung durch `Polygon.make`, und die JSDoc von
  `principalAxes` sagt jetzt, dass seit P2 **beide** Zweige in Gebrauch sind.

## 0.1.0

### Minor Changes

- 8a2beb1: domain driven refactor

### Patch Changes

- Updated dependencies [8a2beb1]
  - @baustatik/errors@0.1.0
