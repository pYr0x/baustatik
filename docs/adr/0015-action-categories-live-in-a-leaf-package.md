# Action categories live in a leaf package with no dependencies

`ActionCategory` — the EN 1990 vocabulary a load case is tagged with — lives in
its own package, `@baustatik/actions`, which contains one type, no functions and
**no dependencies at all**, not even `@baustatik/errors`.

A package holding a single type looks like overhead. Two things make it the right
shape.

## The cycle

Combinations (γ, ψ0/ψ1/ψ2, leading action, mutually exclusive groups) will become
their own package. It will need `LoadCase`, so it will depend on
`@baustatik/fem-loads`. If the category type lived there, `fem-loads` would have
to depend on the combinations package in return — a cycle against the one-way
direction stated in `AGENTS.md`.

Note the trap: a *stub* inside the combinations package would be acyclic **today**
and become a cycle the moment that package does its actual job. A leaf is the only
acyclic home for vocabulary both sides need, and the repository already has two
of them: `@baustatik/errors` and `@baustatik/fem`.

**Rejected: `LoadCase<TCategory>`.** A type parameter is genuine dependency
injection at zero cost — `fem-loads` would store a value whose type it never
names, and the solver would accept `LoadCase<unknown>`. It was rejected because
it leaves the *concept* homeless: every application would invent its own category
type, and the eventual ψ table would have nothing canonical to be keyed by.

**Rejected: `category?: unknown`.** Same storage, no generics, but the
application has to cast on read — and a cast is exactly where a typo becomes a
legal value again.

## No values, no validation

The package carries the **terms**, not the table. ψ values differ by National
Annex and belong, with provenance per record, where they are evaluated — the
pattern is `packages/material/src/national-annex.ts` (ADR 0001). `fem-loads`
stores the category and never interprets it.

Because the type is a discriminated union, no impossible state is representable:
a use category without an imposed load cannot be written down, rather than being
rejected at runtime. So nothing throws, and the package needs no error
hierarchy — hence zero dependencies.

Two axes, deliberately separate: `action` is the EN 1990 §4.1.1 classification,
`kind` the concrete action. The ψ rows in DIN EN 1990 Tab. NA.A.1.1 are indexed by
**both** — every imposed, snow and wind case is equally `'variable'` yet carries a
different ψ. One flat list would merge the axes and force a second field later.

**No altitude split for snow**, even though the National Annex distinguishes
ψ0 = 0.5 / 0.7 for sites below and above 1000 m. That is a property of the
**site**, not of the action: a snow load case does not become a different action
when the building moves, and the altitude is the same for every load case in the
project — putting it in the category would make the UI ask for it once per snow
case. A later `psi0(category, site)` takes it as a second argument.

The union starts with a core (permanent, imposed A–E, snow, wind, temperature,
accidental). Traffic categories F–H, settlement and "other" are missing on
purpose: extending is free while nothing switches exhaustively over the union,
and expensive afterwards. `packages/actions/tests/types.test.ts` holds that door
open with an `assertNever`, so the day a ψ mapping exists, adding a variant fails
the typecheck instead of silently producing a gap.
