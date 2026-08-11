# @baustatik/script

## Purpose

The public browser-scripting DSL for building FEM frame models. A user writes a
`defineModel(...)` function against model-owned handles; the builder hands back a
`FEMModelSnapshot` — plain, JSON-serialisable data that describes a model
completely enough to compute it.

The second half of the package is the border crossing back:
`parseFEMModelSnapshot(unknown)` is the only supported way to turn foreign data
into a snapshot.

## Boundaries

- Owns: builder ergonomics (handles, batching, id assignment), the snapshot
  shape and its `schemaVersion`, strict snapshot-boundary validation, and the
  ambient `.d.ts` text the editor shows script authors.
- Does not own: the FEM records or their domain rules. `assertValidModel`
  (`@baustatik/fem`), `assertValidLoadCase` and `assertValidLoads`
  (`@baustatik/fem-loads`) are **delegated to**, never reimplemented — their
  errors travel outward unchanged. Also not owned: the meaning of a cross-section
  or a material grade — this package fetches catalogue entries, it does not
  define them.

## Dependencies

- `@baustatik/cross-section`: the `CrossSection` record and `ShapeSpec`.
- `@baustatik/material`: the `Material` record, `MaterialKind`, and
  `lookupMaterial` — the grade lookup the builder performs.
- `@baustatik/steel-profiles`: `lookupProfile`/`profileData` for the same reason,
  plus `PROFILE_DATA_KEYS` so the parser checks the row's shape without keeping
  a second column list.
- `@baustatik/fem`, `@baustatik/fem-loads`: the records and their validation
  gates.
- `@baustatik/errors`: base class for `FEMScriptError` and
  `SnapshotValidationError`.

## Navigation

- [`src/types.ts`](src/types.ts): the handles, the `*Input` types and
  `FEMModelSnapshot`.
- [`src/builder.ts`](src/builder.ts): `createFEMModelBuilder()`, handle
  implementations, `finish()`.
- [`src/validate.ts`](src/validate.ts): `parseFEMModelSnapshot` and every shape
  check.
- [`src/declarations.ts`](src/declarations.ts): the ambient module text handed to
  the editor. **Keep it in step with `types.ts`** — nothing enforces this.

## Invariants and conventions

- **A snapshot is self-supporting in its references** since v2/v3:
  `crossSections` and `materials` carry what `Beam.crossSectionId` and
  `Beam.materialId` point at
  ([ADR 0023](../../docs/adr/0023-cross-sections-belong-to-the-model.md),
  [ADR 0026](../../docs/adr/0026-materials-belong-to-the-model.md)).
- **…and in its numbers** since v4: the records carry the profile table row
  (`data`) and the elastic moduli (`moduli`) as a **copy**. Until v3 a stored
  model recomputed against whatever tables the running release shipped — correct
  one row and every old model silently answered differently
  ([ADR 0027](../../docs/adr/0027-catalogues-are-import-sources.md)).
- **The catalogue is read when a record is created, never when one is parsed.**
  `crossSection()` and `material()` look up and copy; they throw `FEMScriptError`
  on a designation the catalogue does not know. That is the only moment a typo
  can surface, and it is the moment the author can fix it.
  - **The authored DSL is unchanged.** `CrossSectionInput`/`MaterialInput` still
    name the catalogue entry; the copy is what `finish()` writes, not what
    anyone types. `declarations.ts` needed no edit, and a test holds that.
- **The builder derives one thing, and only one:** the outline of a wall graph.
  `crossSection({ kind: 'section-input', input })` runs the figure through
  `createSectionGeometry` under the builder's own `SectionPolicy`
  ([ADR 0037](../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
  This is the same *procurement* as the catalogue lookup, not a check: the
  author names what they know, and the model puts beside it what is not to be
  had without the project setting — which the script author never sees.
  `{ kind: 'section-geometry', geometry }` stays next to it and is still only
  **copied**: a record that came from a file already carries its outline, and
  re-deriving it here would silently replace the stored numbers.
- **An older `schemaVersion` is rejected, never extended.** A v1 snapshot has a
  `crossSectionId` pointing nowhere; a v2 snapshot's `materialId` *is* the grade
  rather than a reference; a v3 snapshot lacks the copied numbers; a v6 lacks
  the `sectionPolicy` under which its carried outlines were produced; a v7, v8
  or v9 carries that policy with only some of its five fields. **Every snapshot
  that carries a partial policy is the most tempting of all** —
  `DEFAULT_SECTION_POLICY` is sitting right there — and also the worst:
  substituting it would *assert* that the outline was discretised at 0.05 mm
  and judged at `1e-9`, and the drift check the field exists for would then
  judge against an invented number. A migration is a tool someone runs and can
  refuse.
- **`sectionPolicy` is a mandatory project-level field since v7**, and since
  v10 it carries **five**: `arcTolerance` (creation), `miterLimit` (creation —
  it changes the stored outline), `principalAxisTolerance`, `thickWallRatio`
  and `shearCentreTolerance` (judgement)
  ([ADR 0033](../../docs/adr/0033-the-cross-section-has-a-creation-policy.md),
  [ADR 0035](../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md),
  [ADR 0037](../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md),
  [ADR 0040](../../docs/adr/0040-the-wall-path-is-positioned.md)).
  It carries **effective** values, not deviations — otherwise the same project
  would silently compute differently after a change to the software defaults.
  It sits beside `crossSections` rather than inside each one because the fields
  that *judge* rather than create must not apply two yardsticks within one
  report. **Its owner validates it:**
  the parser calls `parseSectionPolicy` from `@baustatik/cross-section` and lets
  `InvalidSectionPolicyError` travel outward, the same division of labour with
  which `fem-solver` calls `parseLoadValidationPolicy`.
  `createFEMModelBuilder({ sectionPolicy })` takes a *complete* policy, never
  overrides — the same rule as `SolverConfig.analysisPolicy`, so one application
  composes it once and hands the same frozen object to builder, gate and viewer.
- **Shape, not resolvability.** The parser checks discriminators, exact key
  sets, types and positive numbers. It does **not** check that a `profile` or a
  `grade` exists in the catalogue, that any id resolves, **or that `data`/`moduli`
  match the current tables**. The last one is the important restraint: comparing
  here would reintroduce silent re-resolution through the back door, at the
  moment a user is least able to notice. Drift belongs in a tool with a visible
  diff, never in the parser.
  - The one exception is `Material.kind`, checked hard: it is the discriminator
    that picked the catalogue when the record was made. An unknown `kind` is a
    broken record, not an unknown material.
- **The model assigns every id**, via `crypto.randomUUID()`. Handles for nodes,
  beams and load cases travel as arguments; handles for cross-sections and
  materials hand out `.id` instead, because `Beam.crossSectionId` and
  `Beam.materialId` are strings. That asymmetry is deliberate — it lets a beam
  name something that does not exist yet, which the report is the right place to
  catch.
- **Inputs are cloned on the way in** (`structuredClone`), and `finish()` clones
  on the way out. A caller who mutates their input afterwards does not mutate
  the model.
- **A handle belongs to one builder.** Passing a handle from another model
  throws `FEMScriptError` rather than producing a silently wrong graph.

## Language

**Snapshot**:
The serialisable model — `FEMModelSnapshot`. Plain data, versioned, complete.
_Avoid_: document, state, dump.

**Handle**:
The builder-issued reference to something in the model (`NodeHandle`,
`CrossSectionHandle`, …). Not the record: a handle carries identity, not fields.
_Avoid_: proxy, ref, wrapper.

**Input**:
A record minus everything the model **procures** — the id it assigns, and the
catalogue data it fetches. What the script author writes: `'IPE 300'`, not
twenty-one numbers.
_Avoid_: DTO, options, params.

**Parse**:
The border crossing from `unknown` into a snapshot. Only `parseFEMModelSnapshot`
parses; everything downstream assumes it has already happened.
_Avoid_: validate (that is the domain gates' word), deserialize, load.
