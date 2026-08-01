# @baustatik/units

## 0.3.0

### Minor Changes

- fe49281: Neu: **`convert(x).from(a).toExact(b)`** — dieselbe Umrechnung wie `to`, aber
  **ohne die atomare Rundung**.

  `to()` rundet auf ganze Millimeter (bzw. mm², mm³, mm⁴). Das ist der Zweck des
  Packages fuer alles, was gedruckt wird, und es zerstoert alles, was
  weitergerechnet wird:

  ```ts
  convert(139.5).from("mm").to("m"); // 0.14    ← nicht 0,1395
  convert(6.9).from("mm").to("m"); // 0.007   ← nicht 0,0069
  convert(139.5).from("mm").toExact("m"); // 0.1395
  ```

  Die beiden Zahlen sind nicht ausgedacht: `139,5 mm` ist die Schwerpunktlage
  eines Plattenbalkens mit breitem Gurt, `6,9 mm` ein Spannungspunkt am
  Ausrundungsende von IPE 80. **Faustregel: drucken → `to`, rechnen →
  `toExact`.** Ein Test haelt die beiden Wege ausdruecklich auseinander.

  Ebenfalls neu: die **phantom-branded Quantity-Typen** ziehen aus
  `@baustatik/material` hierher — `Quantity<U>` plus `mm`, `cm`, `m`, `mm2`,
  `cm2`, `m2`, `mm3`, `cm3`, `m3`, `mm4`, `cm4`, `m4`, `MPa`, `KNm3`, `Kgm3`,
  `PerK`, `PerMille`, `Percent`. Zur Laufzeit sind es blanke `number`, das Brand
  ist optional: es **dokumentiert** eine Einheit am Aufrufort, es erzwingt sie
  nicht. `units` besitzt das Einheiten-Vokabular ohnehin
  ([ADR 0024](../docs/adr/0024-units-at-the-package-boundary.md)).

## 0.2.0

### Minor Changes

- 8a2beb1: domain driven refactor

### Patch Changes

- Updated dependencies [8a2beb1]
  - @baustatik/errors@0.1.0
  - @baustatik/round@0.1.0

## 0.1.0

### Minor Changes

- refactor package. move round functions into own package

### Patch Changes

- Updated dependencies
  - @baustatik/round@0.0.2

## 0.0.1

### Patch Changes

- implement parsing, converting and rounding physical units
