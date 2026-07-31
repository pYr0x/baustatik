# Cross-sections belong to the model

`CrossSection` is a model record, like `Node`, `Beam` and `NodeSupport`. It is
stored with the model, it travels in the snapshot, and `FEMModelSnapshot` gains
`crossSections` at `schemaVersion: 2`.

Until now `Beam.crossSectionId` pointed at nothing. A snapshot described a model
that could not be computed without a second body of data that the snapshot never
named.

## Why the model and not the application

The editor will eventually draw a thin-walled section, compute it, and use it as
a member in the frame in the same app. That is **one** model. A cross-section
that lives in application state is a cross-section that cannot be saved,
exchanged, or replayed with the frame it belongs to.

## Why `cross-section` owns the record and `fem` does not

`@baustatik/fem` depends on `@baustatik/errors` and nothing else. Pulling
`ShapeSpec` into it would reverse the dependency — `fem` would have to know about
profile catalogues and shear idealisation to hold a type it never interprets.

So the record lives in `@baustatik/cross-section`, next to the arithmetic that
gives it meaning, and **`Beam.crossSectionId` stays a string**. A string is
exactly the right amount of coupling: the beam names a section, the resolution
happens at the boundary, and an unresolvable name is a finding rather than a
type error.

```ts
export type CrossSection =
  | { kind: 'shape';   id: string; shape: ShapeSpec }
  | { kind: 'profile'; id: string; profileId: string };
```

Plain data, JSON-serialisable — that is the precondition for travelling in the
snapshot. Part 2 adds `{ kind: 'thin-walled'; … }` **additively**, without
either existing variant changing.

## `schemaVersion: 2` rejects version 1

A v1 snapshot is **rejected**, not quietly extended with an empty
`crossSections`. It describes a model whose `crossSectionId` points nowhere;
filling in an empty array would pretend it could be computed. The version number
exists to make that refusal explicit and legible.

## The validator checks shape, not resolvability

`parseFEMModelSnapshot` validates that a cross-section is well-formed —
discriminator, exact key set, positive dimensions, `idealisation` present where
`ShapeSpec` requires it. It does **not** check that a `profileId` exists in the
catalogue, nor that every `beam.crossSectionId` resolves.

Both are already reported: an unresolvable section becomes
`UnknownSectionStiffnessError` in the solver's report
(`fem-solver/src/check.ts`). A second rule at a second place would create two
answers to "is this model valid", and they would drift.

`idealisation` is required where the shape requires it — silently defaulting to
`'solid'` here would reintroduce exactly the default that `cross-section`
deliberately refuses to offer (see
[ADR 0021](0021-section-values-separate-from-tabulated-profiles.md): 18 %
difference in κ, invisible in the result).

## `SolverConfig` is untouched

The port `getSectionStiffness` is the seam from
[ADR 0009](0009-fem-solver-ports-and-async-solve.md), and the solver must not
learn about catalogues. What plugs into it is `@baustatik/fem-section-resolve`,
a pure function taking the beam, the model's sections and the material
factories. No factory, no closure, no `Map`: those were needed while the
sections were application state and a collection had to be captured. As a model
record they travel with the call.

## Consequences

- Breaking change to `@baustatik/script` (cheap at 0.x): `FEMModelSnapshot` has
  a new required field and a new version. `model.crossSection(input)` returns a
  handle whose `id` the beam records.
- The handle hands out an id instead of travelling as an argument, unlike
  `NodeHandle` in `beam()`. That is what keeps `Beam.crossSectionId` a string —
  and it leaves a beam free to name a section that does not exist yet, which the
  report, not the type system, is the right place to catch.
- A snapshot is now self-supporting: build → JSON → parse → compute yields the
  same displacements, with nothing read from outside it.
