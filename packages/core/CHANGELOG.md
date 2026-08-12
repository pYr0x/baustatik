# @baustatik/core

## 0.0.2

### Patch Changes

- d9a742d: `assertNever` closes exhaustive switches from the base package

  The repo's rule — close every exhaustive `switch` with `assertNever` — could
  only be followed by packages that may depend on `@baustatik/render-core`, which
  rules out the domain strand. `assertNever` now sits in `@baustatik/core` next to
  `atOrThrow`, throws `AssertionError`, and is available to every package.

  `@baustatik/render-core` keeps its own copy and its own `UnreachableCaseError`
  for now; merging the two is a separate, deliberate change and would move a
  public export.

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
