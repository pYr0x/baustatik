---
'@baustatik/fem-section-resolve': minor
'@baustatik/script': minor
---

Ab hier rechnet die FEM echt.

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
