# @baustatik/cross-section-stress

## 0.0.3

### Patch Changes

- Updated dependencies [79f9796]
  - @baustatik/cross-section@0.0.11

## 0.0.2

### Patch Changes

- Updated dependencies [68312cf]
  - @baustatik/cross-section@0.0.10

## 0.0.1

### Patch Changes

- a2d34f1: Der Rechenkern: σ, τ und σv an den Spannungspunkten eines Querschnitts. Das
  Package war bis hierhin ein leeres Gerüst (`export {}`).

  Zwei Türen: `sectionStresses(cs, forces)` erbt das `undefined` von
  `stressPoints` (gezeichnete Geometrie, parametrische Vollfigur, ungültige
  Abmessungen), `stressesAtPoints(properties, points, forces)` nimmt die beiden
  Argumente getrennt — der einzige Weg an den `Iyz`-Zweig, weil jede Form mit
  Spannungspunkten heute mindestens einfach symmetrisch ist.

  - **σ und τ tragen beide die allgemeine `Iyz`-Form**, an einer Stelle aufgelöst
    und zweimal aufgerufen: der Schubfluss IST σ mit `My → Vz`, `Mz → −Vy`.
  - **Intern mm und N**, damit der Ausgang die Identität ist — `N/mm²` ist MPa,
    und kein Faktor kann sich in einer Ausgangsumrechnung verstecken.
  - **`tau` ist vorzeichenbehaftet**, bezogen auf die mitgelieferte Tangente
    (`ty`, `tz`).
  - **`Mt` wirft** `TorsionNotSupportedError`; `Mt: 0` läuft durch.

  Keine Festigkeit, kein Maximum, kein „massgebender Punkt" (ADR 0054/0056).

- Updated dependencies [a2d34f1]
  - @baustatik/section-forces@0.0.1
