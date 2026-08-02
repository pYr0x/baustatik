# `@baustatik/material`

## Purpose

Provides Eurocode material data for the four strength materials — concrete,
structural steel, reinforcement, timber — as verified characteristic values,
plus National-Annex-aware design values. Access is through a factory bound once
to a National Annex; a convenience instance pre-bound to the German Annex (DE)
is exported directly.

## Boundaries

- Owns: vendored characteristic material tables (EN 1992 / EN 1993 / EN 338),
  National-Annex partial safety factors and design-value formulas, the material
  factory API (`MaterialCatalog`), and the **model record** `Material`
  ([ADR 0026](../../docs/adr/0026-materials-belong-to-the-model.md)) — next to
  the values that give it meaning, as `CrossSection` sits next to
  `sectionProperties`.
- Does not own: reinforcement-bar diameters and bolt/fastener geometry (a later,
  separate module — these are geometry catalogs, not strength materials); custom
  user-defined grades; prestressing steel; unit conversion (values are exposed
  in fixed units, not coupled to `@baustatik/units`).

## Dependencies

- `@baustatik/errors`: base `BaustatikError` class for the package error
  hierarchy (`UnknownGradeError`, `DesignValueRequiresContextError`).

## Navigation

- [`src/index.ts`](src/index.ts): public package boundary — `createMaterials`,
  the DE-default factories (`concrete`, `steel`, `reinforcement`, `timber`),
  types, and error classes.
- [`src/factory.ts`](src/factory.ts): `createMaterials({ na })` binds a National
  Annex and returns a `MaterialCatalog`; the DE default is `createMaterials({ na: "DE" })`.
- [`src/model.ts`](src/model.ts): the model records `Material`, `MaterialKind`
  and `ElasticModuli`. Plain data, no behaviour — the record layer, not the
  value layer.
- [`src/moduli.ts`](src/moduli.ts): `lookupMaterial(kind, grade)` — the
  **Annex-free** grade lookup used when a `Material` record is created. The
  counterpart to `lookupProfile`: same folding rule, same `undefined`, and the
  canonical grade comes back with the values.
- [`src/national-annex.ts`](src/national-annex.ts): built-in `DE`/`EN` parameter
  sets and resolution of `"DE" | "EN" | NationalAnnexParams`.
- [`src/data/`](src/data): vendored characteristic tables with per-standard
  provenance comments.

## Invariants and conventions

- **Characteristic vs. design values**: The vendored tables hold only
  characteristic values (material constants). Design values are computed from
  the bound National Annex — never taken raw from a third-party source. In
  particular the German Annex applies `αcc = 0.85` and `γM1 = 1.1`, which differ
  from the EN-recommended values used by `eurocodepy`.
- **No global mutable configuration**: the National Annex is bound per factory
  instance via `createMaterials`; there is no global setter. This avoids
  order-of-import surprises and test leakage.
- **Fixed units**: strengths and moduli in MPa, lengths in mm, areas in cm²,
  unit weight (Wichte) in kN/m³, density in kg/m³. Values are plain `number`s at
  runtime, but each numeric field carries a phantom-branded `Quantity<Unit>` type
  (`MPa`, `KNm3`, `Kgm3`, …) so the unit is visible in the type at the call site.
  The brand is optional — it documents units with zero runtime cost, it does not
  enforce them; there is no coupling to `@baustatik/units`.
- **Grade identifiers**: the public key is the Eurocode designation with slash
  (`"C30/37"`), not the JSON underscore form. Input is normalized tolerantly —
  **all whitespace removed, then uppercased**, the same folding rule
  `lookupProfile` uses in `@baustatik/steel-profiles`, so `"S 235"` and
  `"c30/37"` both land. String-Literal-Union types still constrain valid grades
  at compile time at the catalogue signature. Unknown grades throw
  `UnknownGradeError` — unlike `lookupProfile`, which returns `undefined`
  because it is a leaf without `@baustatik/errors`. `lookupMaterial` is this
  package's own bridge between the two vocabularies: it catches
  `UnknownGradeError` and answers `undefined`, so the two lookups a model
  builder calls behave alike. (The FEM adapter used to do that translation; it
  no longer sees grades at all — ADR 0027.)
- **Record vs. catalogue vs. values**: `Material` names a grade **and carries
  its moduli**, the `MaterialCatalog` answers what a grade means today,
  `Steel`/`Concrete`/`Timber` are the resolved values. Three layers, three
  names — see `## Language`.
- **The record copies, it does not reference**
  ([ADR 0027](../../docs/adr/0027-catalogues-are-import-sources.md)):
  `Material.moduli` is filled from `lookupMaterial` when the record is created,
  and nothing re-resolves it afterwards. `grade` stays as **provenance** — what
  a report prints and what a later catalogue comparison keys on.
  - **Only the moduli**, not `fyk`/`fck`/`fmk`. Nothing reads the strengths yet,
    and a frozen number without a reader cannot be noticed when it is wrong.
    They join the record additively when design arrives; `gamma` (Wichte) is the
    known next field and arrives with self-weight.
  - **No National Annex is involved.** `E` and `G` are characteristic, so
    `lookupMaterial` has no parameter one could hang an Annex on. What ADR 0026
    held by test, this makes structural.
  - `G` for concrete comes from `concreteShearModulus(Ecm)`, called by both
    `makeConcrete` and `lookupMaterial` — one place, so the catalogue and the
    copy cannot drift apart. A test compares the two paths under both Annexes.
- **`Concrete.G` describes Zustand I** (uncracked): `Ecm/(2(1+ν))` with ν = 0.2
  per EN 1992-1-1 §3.1.3(4). The catalogue carries the quotient for the same
  reason `STEEL_SHEAR_MODULUS` is exact rather than the printed 81000: `G` is
  consumed by a computation, not by a reader.

  The *state* is a statement about the analysis, not about the material — the
  material cracks as soon as `fctm` is exceeded — so it does not belong to this
  value. What hangs on that today is spelled out in
  `fem-section-resolve/CONTEXT.md` ("Zustand I ist die stillschweigende
  Annahme"): deflections are unusable, non-linear ULS design is excluded, and
  superposition would fail the moment cracking is computed.
- **Timber has no bare design value**: `timber(...)` exposes only characteristic
  values; `fmd` (and siblings) require `designValues({ loadDuration, serviceClass })`
  because `kmod` has no meaningful default. Accessing `.fmd` directly is both a
  TypeScript type error and a runtime guard (`DesignValueRequiresContextError`).

## Language

**Material**:
The **model record** — `{ kind, id, grade, moduli }`. It is what
`Beam.materialId` points at, it is stored with the model, and it travels in the
snapshot ([ADR 0026](../../docs/adr/0026-materials-belong-to-the-model.md)). It
carries **both**: `grade` names the catalogue entry it came from, `moduli` holds
the values that came with it
([ADR 0027](../../docs/adr/0027-catalogues-are-import-sources.md)). The name is
provenance; the numbers are what gets computed with.
_Avoid_: material definition, material assignment.

**MaterialCatalog**:
The **factories** bound to one National Annex, returned by
`createMaterials({ na })`. Answers "what does C30/37 mean here"; knows nothing
about any model. Formerly `Materials` — renamed because `Material` is the record
and two near-identical names for two layers is not a glossary.
_Avoid_: materials, material library, material service.

**Steel / Concrete / Timber / Reinforcement**:
The **resolved values** a catalogue call yields — `Es`, `Ecm`, `fcd`, `kmod`.
The third layer: record → catalogue → values.
_Avoid_: using these names for the model record.

**Kind**:
The material **family** of a model record: `steel`, `concrete` or `timber`. Not
derivable from `grade` — timber carries `C24`/`C30`, concrete carries `C30/37`,
and lookup folds tolerantly. Reinforcement is deliberately not a kind: it is a
section inlay, never a member material.
_Avoid_: type, class, category.

**Grade**:
The catalogue designation — `'S235'`, `'C30/37'`, `'C24'`. A plain string on the
record and a literal union at the catalogue signature: the record crosses the
JSON boundary where no compiler is left, the call site does not. Resolved
tolerantly: all whitespace removed, uppercased — the same folding rule
`lookupProfile` uses, so `'S 235'` and `'c30/37'` both land.
_Avoid_: strength class, quality, type.

**Characteristic value**:
A material constant taken from the Eurocode material standard, independent of any
safety factor or National Annex (e.g. `fck`, `fyk`, `fmk`, `E`, density).
_Avoid_: nominal value, base value.

**Design value**:
A characteristic value reduced by partial safety factors, dependent on the
National Annex and the design situation (e.g. `fcd = αcc · fck / γc`).
_Avoid_: factored value, allowable value.

**National Annex**:
The country-specific parameter set (partial safety factors `γc`/`γs`/`γM`,
`αcc`, `kmod` tables) that turns characteristic values into design values.
Default: `DE`. Bound once via `createMaterials({ na })`.
_Avoid_: country config, locale.

**Design situation**:
The load scenario that selects the partial safety factors — `persistent`
(ständig/vorübergehend, γc = 1.5, γs = 1.15) or `accidental` (außergewöhnlich,
γc = 1.2, γs = 1.0).
_Avoid_: load case, combination.

**Steel**:
Structural steel per EN 1993 (e.g. `S355`). In this package "steel" canonically
means structural steel.
_Avoid_: bare "steel" for reinforcement — that is Reinforcement.

**Reinforcement**:
Reinforcing steel (Betonstahl) per EN 1992-1-1 §3.2 (e.g. `B500B`).
_Avoid_: rebar steel, reinforcing bar (the bar geometry is a separate concept).
