# `SectionProperties` names section values, not stiffnesses

`@baustatik/fem-element` owned the name `SectionProperties` for
`{ EA, EI, GAs }`. That name is given up. The type is now `SectionStiffness`,
the solver port is `getSectionStiffness`, and the model error is
`UnknownSectionStiffnessError`. `SectionProperties` becomes the name of the
geometric section values in `@baustatik/cross-section`.

## Why the name sits on the wrong side

The type's own doc comment already said it: *"Effektive Steifigkeiten eines
Stabquerschnitts"* — effective **stiffnesses**. What ArcelorMittal, Dlubal and
every profile table print under *section properties* is `A`, `Iy`, `Wel`, `Sy`:
geometry, no material.

The distinction is not pedantic, it is the unit:

| | contents | depends on material |
| --- | --- | --- |
| `SectionProperties` (`cross-section`) | `A` [m²], `Iy`, `Iz`, `Iyz` [m⁴], `ys`, `zs` [m], `kappaY`, `kappaZ` [–] | **no** |
| `SectionStiffness` (`fem-element`) | `EA` [kN], `EI` [kNm²], `GAs` [kN] | **yes** |

One name for both would have made the adapter — the one place where the
multiplication by `E` and `G` happens — read as if it converted a thing into
itself. The adapter is `@baustatik/fem-section-resolve`, and its whole content
is that multiplication plus the unit chain; naming its input and output alike
would have hidden the only thing it does.

## Why now, and why alone

The rename is a **pure** commit: no logic changed, and the existing test suite
passing is the evidence. Doing it before the catalogue exists means there is
never a moment where both names are live and a reader has to guess which one a
call site meant.

It is a breaking change to `@baustatik/fem-element` and `@baustatik/fem-solver`,
which is cheap at 0.x and would not be later. The alternative — letting
`cross-section` invent a second name such as `SectionValues` — was rejected:
the catalogue term is the one printed in the tables the values are read from,
and a synonym invented in code loses that link.

## Consequences

- ADRs [0009](0009-fem-solver-ports-and-async-solve.md) and
  [0011](0011-analysis-settings-split-into-versioned-policy-and-ports.md) keep
  the old names in their bodies and carry a note pointing here. They are records
  of decisions, not API documentation; rewriting them would falsify what was
  decided when.
- `fem-element` keeps its dependency-free shape. The rename touches the word,
  not the boundary: the element mathematics still sees nothing but three
  numbers.
