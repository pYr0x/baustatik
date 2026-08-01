# @baustatik/fem-section-resolve

## 0.1.0

### Minor Changes

- fdfa066: Ab hier rechnet die FEM echt.

  `@baustatik/fem-section-resolve` ist neu: `resolveSectionStiffness(beam,
sections, materials)` macht aus Querschnitt × Material die `SectionStiffness`
  `{ EA, EI, GAs }` — die einzige Stelle im Repository, an der Geometrie mit
  Material multipliziert wird. `undefined` statt Wurf, passend zum Port
  `getSectionStiffness`.

  `@baustatik/script`: **Breaking im 0.x.** `FEMModelSnapshot` trägt
  `crossSections` und `schemaVersion: 2`; ein v1-Snapshot wird abgelehnt statt
  stillschweigend ergänzt. Neu ist `model.crossSection(input)`, das die vom
  Modell vergebene ID herausreicht. Damit ist ein Snapshot selbsttragend —
  bis v1 zeigte `crossSectionId` ins Leere.

### Patch Changes

- Updated dependencies [fe49281]
- Updated dependencies [fe49281]
- Updated dependencies [3da2409]
- Updated dependencies [d66e29b]
- Updated dependencies [e9b652b]
- Updated dependencies [fe49281]
- Updated dependencies [6fb26ba]
  - @baustatik/material@0.0.3
  - @baustatik/cross-section@0.2.0
  - @baustatik/fem-element@1.1.0
