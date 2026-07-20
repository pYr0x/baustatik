# `@baustatik/material`

## Purpose

Provides Eurocode material data for the four strength materials — concrete,
structural steel, reinforcement, timber — as verified characteristic values,
plus National-Annex-aware design values. Access is through a factory bound once
to a National Annex; a convenience instance pre-bound to the German Annex (DE)
is exported directly.

## Boundaries

- Owns: vendored characteristic material tables (EN 1992 / EN 1993 / EN 338),
  National-Annex partial safety factors and design-value formulas, and the
  material factory API.
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
  Annex and returns the material factories; the DE default is `createMaterials({ na: "DE" })`.
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
  unit weight (Wichte) in kN/m³, density in kg/m³. Values are plain `number`s
  with the unit documented at the field; there is no branded-unit coupling.
- **Grade identifiers**: the public key is the Eurocode designation with slash
  (`"C30/37"`), not the JSON underscore form. Input is normalized tolerantly
  (trim, case) but String-Literal-Union types constrain valid grades at compile
  time. Unknown grades throw `UnknownGradeError`.
- **Timber has no bare design value**: `timber(...)` exposes only characteristic
  values; `fmd` (and siblings) require `designValues({ loadDuration, serviceClass })`
  because `kmod` has no meaningful default. Accessing `.fmd` directly is both a
  TypeScript type error and a runtime guard (`DesignValueRequiresContextError`).

## Language

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
