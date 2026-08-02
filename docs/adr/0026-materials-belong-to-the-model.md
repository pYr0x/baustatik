# Materials belong to the model

> **Partly revised by [ADR 0027](0027-catalogues-are-import-sources.md).** The
> record gained `moduli`, the snapshot moved to `schemaVersion: 4`, and
> `resolveSectionStiffness` lost its `catalog` parameter. What stands unchanged:
> `Material` is a model record, `Beam.materialId` is a string, `grade` is a plain
> string, `kind` is not redundant, reinforcement stays out, and the Annex does
> not move the FEM — the last of these is now structural rather than tested.

`Material` is a model record, like `Node`, `Beam`, `NodeSupport` and
`CrossSection`. It is stored with the model, it travels in the snapshot, and
`FEMModelSnapshot` gains `materials` at `schemaVersion: 3`.

This extends [ADR 0023](0023-cross-sections-belong-to-the-model.md) to the other
half of the stiffness. Everything that ADR says about a cross-section living in
application state applies here word for word.

```ts
export type MaterialKind = 'steel' | 'concrete' | 'timber';

export type Material = {
  readonly kind: MaterialKind;
  readonly id: string;
  readonly grade: string;
};
```

## The defect this closes

Until now `Beam.materialId` was not an id. It was the grade designation itself —
`'S235'` — and the resolver read it with an unchecked cast:

```ts
materials.steel(materialId as SteelGrade)   // fem-section-resolve, before
```

That cast declared **every beam structural steel**. A timber member computed
with E = 210 000 MPa and said nothing; a concrete member did the same. The
package's own `CONTEXT.md` named it as an open seam.

The record does not remove the cast — it makes it answerable. `kind` picks the
catalogue first, and the call that follows validates the grade in the same
breath. Before, the cast was an assertion nobody checked. Now it is a question
with an answer, and `undefined` is the answer when there is none.

## `Beam.materialId` stays a string

For the reason ADR 0023 gives: `@baustatik/fem` depends on `@baustatik/errors`
and nothing else, and it never interprets the value. The beam names a material,
the resolution happens at the boundary, and an unresolvable name is a finding
rather than a type error. `MaterialHandle.id` is handed out by the builder
exactly as `CrossSectionHandle.id` is.

## `grade` is a plain string, not a literal union

`{ kind: 'steel'; grade: SteelGrade }` looks stricter and is worse. The snapshot
parser deliberately checks **shape, not resolvability**, so it cannot know that
an incoming string is a member of `SteelGrade` — it would have to write
`text(...) as SteelGrade`. That is the very cast this ADR removes, relocated
into the parser, which is the one place that must not adjudicate grades.

So `grade` is a `string`, like `CrossSection.profile` already is. The narrow
types stay where they earn their keep: `MaterialCatalog.steel(grade: SteelGrade)`
keeps `concrete('C30/37').fcd` autocompleting and catches `steel('S234')` at
compile time, which is what [ADR 0002](0002-national-annex-via-factory-not-singleton.md)
calls out as worth protecting.

## `kind` is not redundant

The four grade tables are disjoint as sets, so one might derive the family from
the string. One should not. Timber carries `C24` and `C30`; concrete carries
`C30/37`; and grade lookup folds tolerantly (all whitespace removed,
uppercased — the same rule `lookupProfile` uses). Under that rule `'C30'` is not
distinguishable from a truncated `'C30/37'` by inspection. The discriminator
states the family instead of inferring it.

## `'reinforcement'` is deliberately absent

The catalogue still serves reinforcement data; the **model record union** does
not include it. Reinforcing steel is never the material of a *member* — it is
the inlay of a reinforced-concrete section. A `Material` record of that kind
would have no possible referent: the only thing that could point at it is
`Beam.materialId`, and a beam made of B500B is a category error.

When reinforced concrete arrives, the pair belongs to the cross-section, and the
variant is added there — additively, without either existing variant changing.

## `Materials` was renamed to `MaterialCatalog`

With the record named `Material`, the factory set could no longer be called
`Materials`. The resolver's own call site would have read `model.materials`
(records) next to `materials: Materials` (factories) — two nearly identical
names for two different things, one line apart.

The model record keeps the plain domain noun, as `CrossSection` does.
`createMaterials` keeps its name, so ADR 0002's wording stays true.

## Concrete is computed in state I, and this is not free

The resolver answers all three families. Steel and timber are unambiguous:
`Es`/`G` and `E0,mean`/`G,mean` are the values the catalogue tabulates.

Concrete required a decision, and the decision is **Zustand I** — linear
elastic, uncracked, tension zone fully effective. `Concrete.G` is
`Ecm / (2(1+ν))` with ν = 0,2, the value EN 1992-1-1 §3.1.3(4) gives for the
uncracked section. The quotient lives in `@baustatik/material` for the same
reason `STEEL_SHEAR_MODULUS` does: `G` is consumed by a computation, not by a
reader.

This is the cheapest decision available today and the right one for a first
step, but it is not a neutral one. Three consequences follow, and they are
recorded here because a reader who finds only "uncracked" will not derive them:

**Deflections are wrong.** For reinforced concrete in service, **Zustand II**
normally governs. Once `fctm` is exceeded the section cracks and the effective
stiffness drops — several-fold in a typical T-beam. `EI` is therefore too high
and computed deflections too small. EN 1992-1-1 §7.4.3 interpolates with ζ
between the two states; none of that exists here. Internal forces in a
statically determinate system are unaffected; a serviceability check is not.

**Non-linear ULS design is excluded.** A method per EN 1992-1-1 §5.7 needs a
load- and crack-dependent stiffness. While `getSectionStiffness` returns a fixed
value, design is confined to linear-elastic internal forces — with or without
redistribution, but not non-linear.

**Superposition fails, and that reaches the port signature.** Cracking is
**load-dependent**. Once the state is computed, stiffness is no longer a
property of the beam but of the pair (beam, load level). Load cases can then no
longer be solved separately and summed into a combination — the combination
itself must be solved. Second-order theory breaks the same assumption for the
same reason.

```ts
getSectionStiffness(beam: Beam): SectionStiffness | undefined
//                  ^^^^ no load case, and there cannot be one
```

The port from [ADR 0009](0009-fem-solver-ports-and-async-solve.md) *presumes*
load-independent stiffness. That is not an oversight — it is the shape of
first-order theory in state I, and while both hold, the narrow signature is
correct.

**Where the switch belongs when it comes.** Not on the material: `Material`
names a grade, not an analysis state. Not on the resolver: it translates, it
does not interpret. It belongs on what is *being computed* — the load case or
the combination — which is exactly where "Theorie I. / II. Ordnung" belongs. The
two switches are of one kind, they break the same assumption, and they should be
decided together.

Notably, this is **not** a global `AnalysisPolicy` setting of the
`shearDeformation` kind: within one project the ULS is computed differently from
the SLS deflection check, where state II governs. One project needs both at
once.

## The National Annex does not move the FEM

`Es`, `Ecm` and `E0,mean` are characteristic values. The Annex steers partial
safety factors — `fyd`, `fcd` — and nothing the stiffness is built from. A test
holds this for all three families: `EA`, `EI` and `GAs` are identical under
`na: 'DE'` and `na: 'EN'`, with `fcd` (17,0 vs 20,0 for C30/37) as the
counter-check that the two catalogues are not accidentally the same object.

This matters because it says where the Annex belongs. It is not model state and
it is not needed to compute one; binding it stays a composition-root concern.

## `schemaVersion: 3` rejects version 2

A v2 snapshot is **rejected**, not quietly extended with an empty `materials`.
This is a stronger refusal than the v1 case, because the meaning of an existing
field changed: in v2 `materialId` *was* the grade, in v3 it is a reference. An
empty `materials` would pretend the two are the same thing and silently strip
every beam of its material. Nothing on disk is affected — no snapshot was ever
persisted.

## The validator checks shape, not resolvability

`parseFEMModelSnapshot` checks that a material is well-formed: exact key set,
`kind` one of the three, `id` and `grade` non-empty strings, ids unique. It does
**not** check that the grade exists in the catalogue, nor that every
`beam.materialId` resolves. Both already surface as
`UnknownSectionStiffnessError` in the solver's report, and a second rule in a
second place would give two answers to "is this model valid".

`kind` is the exception and is checked hard — it is the discriminator the
resolver switches on. An unknown `kind` is not an unknown material; it is a
broken record.

## Consequences

- Breaking change to `@baustatik/script` (cheap at 0.x): a new required field, a
  new version, a new dependency on `@baustatik/material`, and
  `model.material(input)` next to `model.crossSection(input)`.
- Breaking change to `@baustatik/material`: `Materials` → `MaterialCatalog`, and
  `Concrete` gains `G`. Grade lookup now folds inner whitespace, so `'S 235'`
  and `'C 30/37'` resolve where they previously threw.
- `resolveSectionStiffness(beam, model, catalog)` takes the two record lists as
  one `SectionModel` object rather than as positional arguments. A store that
  holds both satisfies the shape structurally.
- `ElasticModuli.Es` became `ElasticModuli.E`. With three families feeding it,
  the steel symbol was wrong for two of them — and the rename removes a
  structural accident where a whole `Steel` object happened to fit.
- A frame of mixed materials is expressible for the first time.

> Footnote on numbering: `0024` was issued twice, for
> `units-at-the-package-boundary` and `results-are-drawn-in-the-model-viewer`.
> The latter has been renumbered to `0025` — it was the later of the two and had
> a single inbound link, whereas the former is referenced from four generated
> CHANGELOG entries that should not be rewritten.
