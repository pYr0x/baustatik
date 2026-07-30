---
'@baustatik/fem-element': minor
'@baustatik/fem-solver': minor
---

Rename `SectionProperties` to `SectionStiffness`.

Breaking, but at 0.x: `fem-element` exports `SectionStiffness` instead of
`SectionProperties`, `SolverConfig.getSectionProperties` is now
`getSectionStiffness`, and `UnknownSectionPropertiesError` is now
`UnknownSectionStiffnessError`. No behaviour changed.

The name is handed to `@baustatik/cross-section`, where it means what every
profile table means by it: `A`, `Iy`, `Wel` — geometry without material. What
`fem-element` holds is geometry times material. See ADR 0020.
