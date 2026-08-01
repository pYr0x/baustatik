# @baustatik/material

## 0.0.3

### Patch Changes

- fe49281: `Quantity<U>` und die Einheiten-Aliase (`MPa`, `KNm3`, `Kgm3`, `PerK`,
  `PerMille`, `Percent`) leben jetzt in `@baustatik/units` und werden von hier
  nur noch re-exportiert. **Keine Verhaltensaenderung und kein Bruch**: die Namen,
  die Typen und die oeffentliche Oberflaeche dieses Packages sind unveraendert.

  Grund: der Typ stand an zwei Stellen, seit `cross-section` sich eine eigene
  Kopie angelegt hatte. `units` besitzt das Einheiten-Vokabular ohnehin
  (`UNITS`, `UnitCategory`, `convert`)
  ([ADR 0024](../docs/adr/0024-units-at-the-package-boundary.md)).

  Die neue Dependency auf `@baustatik/units` ist **rein typseitig** — zur Laufzeit
  entsteht nichts, im Bundle steht nichts.

- 6fb26ba: `STEEL_SHEAR_MODULUS` ist der **exakte** Quotient `E/(2(1+ν)) = 210000/2,6 =
80769,23`, auf ganze MPa gerundet — nicht die 81000, die EN 1993-1-1 §3.2.6
  druckt und die die meisten Tabellen wiederholen. Der Normwert ist gerundet; wir
  runden nicht, weil `G` in eine Rechnung geht (`GAs = κ·G·A`) und nicht in einen
  Ausdruck.

  Der Zahlenwert selbst stand schon so im Code; neu ist der Kommentar, der ihn
  davor bewahrt, als Tippfehler „korrigiert" zu werden.

- Updated dependencies [fe49281]
  - @baustatik/units@0.3.0

## 0.0.2

### Patch Changes

- Updated dependencies [8a2beb1]
  - @baustatik/errors@0.1.0
