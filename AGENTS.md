# baustatik

A 2D frame FEM engine in TypeScript, as a pnpm/Turborepo monorepo. Scope and
non-goals: [`MISSION.md`](MISSION.md).

## Repository map

One line per package. The detail — boundaries, invariants, domain language —
lives in `packages/<pkg>/CONTEXT.md`; keep it there rather than growing this
table. Confirm a package's `package.json` before adding a dependency.

### Active packages

| Package | Purpose | Internal dependencies |
| --- | --- | --- |
| `@baustatik/actions` | EN 1990 action vocabulary (`ActionCategory`): classification × concrete action, plus imposed-load use categories. Terms only. | — |
| `@baustatik/section-forces` | The six section forces at one location (`SectionForces`: `N`, `Vy`, `Vz`, `My`, `Mz`, `Mt`) — **every field optional**, so the plane frame fills three and a later spatial solver six without a breaking change. Leaf package with no dependencies at all, `@baustatik/actions`-style: terms only, no function. **Owns the sign convention** (ADR 0060), in the JSDoc at the fields themselves rather than next to the formula that consumes it: `My = +∫z·σ dA`, `Mz = −∫y·σ dA`, and therefore `dMy/dx = +Vz` but `dMz/dx = −Vy`. `Mz` and `Vy` are a **pair**; deliver one of them under the other convention and τ comes out sign-wrong in the `Vy` share, with no test in the repo firing. Not to be confused with `fem-element`'s `SectionForces` — the plane frame's `N`/`V`/`M` triple; the name collision is deliberately unresolved (ADR 0054). | — |
| `@baustatik/errors` | `BaustatikError`, the root of every error class in the repo. | — |
| `@baustatik/core` | Core domain and infrastructure primitives, including `atOrThrow` and `assertNever`. | `errors` |
| `@baustatik/round` | Numeric rounding utilities. | — |
| `@baustatik/units` | Unit conversion (`convert(x).from(a).to(b)` rounds, `toExact(b)` does not) and the phantom-branded quantity types `Quantity<U>`, `mm`, `cm2`, `MPa`. | `errors`, `round` |
| `@baustatik/geometry-2d` | 2D geometry primitives and polygon operations, the raw signed `Polygon.moments`, the `bulge` ⇄ `Arc` codec `Bulge`, plus `DEFAULT_ARC_TOLERANCE` — the one discretisation tolerance of the repo. `Polygon.make` validates the winding, it does not normalise it. Two clipping libraries: martinez for `union`/`intersect`/`subtract`, `clipper2-ts` (pinned exactly) for `Polygon.inflate`, which inflates open or closed runs and unions them into a ring set with holes. | `core`, `errors` |
| `@baustatik/material` | Eurocode material data and National-Annex design values via `createMaterials({ na })`, plus the model record `Material` and the Annex-free `lookupMaterial`. `ElasticModuli` carries `nu?` — **optional, and its absence is an answer**: timber is orthotropic, so there is no isotropic ν, and the solid-section FE yields no κ there (ADR 0045). Never back-computed from `E` and `G`. | `errors`, `units` |
| `@baustatik/viewport-2d` | 2D viewport and coordinate-view state. | `errors` |
| `@baustatik/render-core` | Rendering abstractions shared by visual adapters, including the spec vocabulary. `IndexedLineListSpec` is the mesh-agnostic wireframe primitive: flat `ArrayLike<number>` point and index buffers, so a typed array passes through without a copy. | `core`, `errors`, `viewport-2d` |
| `@baustatik/grid-2d` | 2D grid rendering and grid behavior. | `errors`, `render-core`, `viewport-2d` |
| `@baustatik/konva-adapter` | Konva-based rendering adapter. | `render-core`, `viewport-2d` |
| `@baustatik/section-geometry` | Geometry and calculations for cross-sections, including the `y`/`z` pass-through of `Bulge`, of `Polygon.moments` (`Iyz = +∫y·z dA`) and of `Polygon.inflate`. Owns the winding rule: `signedArea > 0` is CCW, the same word as in `geometry-2d`. Nothing above it imports `geometry-2d` directly. | `core`, `errors`, `geometry-2d` |
| `@baustatik/steel-profiles` | Rolled steel profile catalogue (IPE, HEA) as vendored, tabulated data plus `lookupProfile`. Leaf package with no dependencies at all. | — |
| `@baustatik/cross-section` | Section-value engine: `A`, `Iy`, `Iz`, `Iyz`, `Iu`, `Iv`, `alpha`, `ys`, `zs`, `yM`, `zM`, κ and `It` from four parametric shapes, a catalogue profile, or the editor's `SectionGeometry` — the last via Green on the carried outline (`calculation/green.ts`) plus, for a `thin-walled` `midline` graph with at most one cell, the positioned wall path (`calculation/wall-path/`, ADR 0040/0041: `S` from the wall model, `I` for κ from the outline). **Both** outline branches are derivable: `deriveOutline` is the one door, `deriveOutlineFromRings` and `deriveOutlineFromWalls` (run decomposition `branches` + inflate) sit behind it, `createSectionGeometry` is the factory. Owns `stressPoints` — thin-walled shapes and the catalogue profile only; every **solid** figure, parametric or drawn, answers `undefined`, because `t` and `S` are the denominator of a cut model and a solid section has none (ADR 0057). Owns the model record `CrossSection`, the creation policy `SectionPolicy` (`discretisationTolerance`, `principalAxisTolerance`, `miterLimit`, `thickWallRatio`, `shearCentreTolerance`, `FEElements`), and the warning gate `validateSectionGeometry`/`validateSectionProperties` (both take the policy; the gate re-derives the outline and reports drift — against the carried outline *and* against the FE fingerprint — and names multi-cell, disconnected and thick-wall figures). Also **owns the types** of the solid-section FE (`FESectionValues`, `FESectionState`, the field `feValues` on both `SectionGeometry` variants, `kappaFromCoefficients`) while `@baustatik/cross-section-fe` does the computing — the package stays WASM-free by construction (ADR 0045/0047). | `core`, `errors`, `section-geometry`, `steel-profiles`, `units` |
| `@baustatik/cross-section-fe` | The 2D FE of the **drawn solid** cross-section: `It`, the Trefftz shear centre, and κ as the ν-free coefficient pair `1/κ = d0 + d2·m²`, `m = ν/(1+ν)` (ADR 0045). One asynchronous door, `computeFESectionValues(geometry, policy)` — **one geometry in, one result out, no ID**; deduplication is the application's, and its guard is the `feValues` field in the record. Returns the mesh alongside the record part, transient (ADR 0039). The one place that imports **both** WASM artifacts, which is why it is a package and not a folder in `cross-section` (ADR 0047, superseding 0046). Tri6, three quadratures chosen by integrand degree, computed in the principal axes. **Both** boundary-value problems — torsion and shear — are solved for a displacement with a Neumann boundary, so they share one stiffness matrix and one factorization (five right-hand sides), and a hole anywhere costs nothing: no side condition and no limit (ADR 0048, amending 0045 on that point). Its suite meshes and solves for real and needs the built `pkg/` artifacts. Out of scope: the parametric solid shape (keeps Grashof — a known open gap, measured in `docs/messungen/t-querschnitt-grashof-gegen-fe.md`), the thin-walled path, stress points, and any convergence loop. | `core`, `cross-section`, `errors`, `mesh-2d-wasm`, `sparse-solver-wasm`, `units` |
| `@baustatik/cross-section-stress` | The **numerator**: σ, τ and σv at the stress points, given a `SectionForces` (ADR 0054). Two doors — `sectionStresses(cs, forces)` inherits the `undefined` of `stressPoints` (drawn geometry, parametric solid figure, invalid dimensions — one `undefined`, three reasons), and `stressesAtPoints(properties, points, forces)` takes the two apart, which is the only way to reach the `Iyz` branch at all: every shape that carries stress points today is at least singly symmetric. **σ and τ both carry the general `Iyz` form**, resolved once in `field.ts` and called twice — the shear flow *is* σ under `My → Vz`, `Mz → −Vy`, negated and with `S` instead of a coordinate. Internally **mm and N**, so the exit is the identity: `N/mm²` *is* MPa and no factor can hide in an output conversion. `tau` is **signed**, relative to the `(ty, tz)` travelling in the same row. `Mt` **throws** (`TorsionNotSupportedError`); `Mt: 0` passes. No maximum and no "governing point" (ADR 0056), no strength, no `fyd` — `grep -r 'fy' src` finds nothing. | `cross-section`, `errors`, `section-forces`, `units` |
| `@baustatik/cross-section-viewer` | Viewer-facing cross-section composition and visualization. Five bands, `CROSS_SECTION_LAYERS` = `['grid','thin-walls','outlines','fe','symbols']`. The pure door is `crossSectionSpecs` (`scene.ts`); `viewer.ts` only pulls, holds the viewport and drives. Draws the outline carried in `SectionGeometry` rather than deriving one — in orange, because it is *derived* while the black wall centre lines are the *input*; arc walls become `arcPath` specs via `Bulge`. Results arrive through three optional pulls (`getProperties`, `getStressPoints`, `getFEMesh`) and an omitted pull is the off state; `CrossSectionFEMesh` is only *structurally* compatible with `Mesh2DResult`, so no mesher dependency. Owns `CrossSectionStyle` (the `Px` suffix = screen-constant; `Wall.t` stays physics) and the one exact m→mm conversion. | `cross-section`, `errors`, `grid-2d`, `render-core`, `section-geometry`, `units`, `viewport-2d` |
| `@baustatik/fem` | FEM frame model types (`Node`, `Beam`, `NodeSupport`) and the model validation gate (`validateModel`, `assertValidModel`, `isolatedNodeIds`). | `errors` |
| `@baustatik/fem-geometry` | 2D geometry primitives in structural x/z coordinates (z downwards). | `core`, `errors`, `geometry-2d` |
| `@baustatik/fem-element` | Element formulation for plane frames: local 6×6 stiffness, consistent load vector, shape functions, release condensation, and the section forces `N`/`V`/`M`, bound in three stages. | `errors` |
| `@baustatik/fem-loads` | Load input model for plane frames plus its validation gate, and the load case (`LoadCase`, `effectiveLoads`) above it. | `actions`, `errors`, `fem`, `fem-geometry` |
| `@baustatik/script` | Public browser-scripting DSL that builds serializable `schemaVersion: 13` model snapshots through model-owned handles. The snapshot is the **one** versioned record unit: it carries both project policies as mandatory fields — `sectionPolicy` since v7 and `analysisPolicy` since v13 — and each is parsed by its owner (ADR 0049). The `fem-solver` dependency exists for that field alone; nothing here calls the solver. | `cross-section`, `errors`, `fem`, `fem-loads`, `fem-solver`, `material`, `steel-profiles` |
| `@baustatik/fem-section-resolve` | `CrossSection` × `Material` → `SectionStiffness`; the only place in the repo where geometry is multiplied by material, and therefore **the only place ν enters**: the drawn solid section stores κ as a formula, and `sectionStiffness` evaluates it with the beam material's `nu` (ADR 0045). No `nu`, no κ — shear-rigid, which is the honest answer for timber. `SectionModel` carries `sectionPolicy` as a mandatory field — since ADR 0040 the wall path reads `discretisationTolerance`, so the record's own policy has to travel with it. | `cross-section`, `fem`, `fem-element`, `material` |
| `@baustatik/fem-load-resolve` | Resolves abstract loads onto beams: frame rotation, reference length, positions, merge per beam. | `fem-element`, `fem-geometry`, `fem-loads` |
| `@baustatik/fem-solver` | Entry point of the calculation (`createFEMSolver`): `check`, `solve`, `solveAll`, and the composition root for `AnalysisPolicy` — which since ADR 0049 carries **no `schemaVersion` of its own**: it is a mandatory field of the `@baustatik/script` snapshot, and that document versions it. `parseAnalysisPolicy` checks form only. `check` also warns when shear deformation is asked for but the cross-section is shear-rigid (`ShearDeformationUnavailableWarning`). Two solver paths stand side by side: `AnalysisPolicy.linearSystem` (`'dense'` \| `'sparse'`, default `'sparse'`) chooses, the two optional ports `solveLinearSystem`/`solveSparseSystem` supply the capability, and a missing port throws `InvalidSolverConfigError` at `createFEMSolver` (ADR 0043). The package-internal `SystemMatrix` owns its port, so `solve.ts` never sees a matrix format. `solveAll` assembles and factorizes **once** for all load cases (ADR 0044) — an invariant that expires with second-order theory or state II. Its measurement `tests/kinematics-margin.test.ts` is the one place that drives the two WASM crates (dev-only, skips itself when `pkg/` is missing); `src/` stays WASM-free. | `core`, `errors`, `fem`, `fem-element`, `fem-geometry`, `fem-load-resolve`, `fem-loads` |
| `@baustatik/linear-solver-wasm` | Rust/faer WASM binding for dense `K d = F` via Cholesky, including kinematics detection. Takes `n × k` right-hand sides on one factorization; `pivotRatio`/`singularIndex` stay single-valued. | — |
| `@baustatik/sparse-solver-wasm` | Rust/faer WASM binding for sparse SPD `K d = F` with lower-triangle triplets, multiple right-hand sides, AMD ordering, and an unfixed/disconnected-mesh finding. Reports `pivotRatio` and `singularIndex` on the same Jacobi scaling and the same `1e-12` threshold as its dense sibling, with the index mapped back out of the AMD permutation. Used by the frame path since ADR 0043; built for the cross-section FE. | — |
| `@baustatik/mesh-2d-wasm` | Generic Triangle 1.6 WASM mesher for `Tri3`/`Tri6`; no cross-section, unit, FEM, Worker, or rendering dependency. `boundarySegments` carries only the two **corners** of a boundary edge — the Tri6 midside node is looked up through the element list. Commercial Triangle use requires a direct arrangement with its author. | `core`, `errors` |
| `@baustatik/fem-viewer` | Viewer-facing FEM frame composition and visualization, including loads, support reactions and the `N`/`V`/`M` diagrams. One result pull, `getResult`, so `fem-solver` is a **runtime** dependency (`internalForcesAlong`) and no longer a type-only one. The diagram ordinate is the package's **one world measure** — `ref[K] = max\|K(x)\|` over all beams, `diagramOrdinateM` in metres, and `ref[K] === 0` draws nothing (ADR 0050). Distributed loads do not yet share that reference. | `errors`, `fem`, `fem-geometry`, `fem-load-resolve`, `fem-loads`, `fem-solver`, `grid-2d`, `render-core`, `round`, `viewport-2d` |

The dependency direction is broadly: foundational utilities and errors →
geometry/domain packages → rendering abstractions → adapters and viewers.

### Inactive, planned, or legacy directories

- `packages/konva-adapter-BAK/` is a legacy backup. Do not use or extend it
  unless the task explicitly targets it.

## Working commands

Root scripts are in `package.json` (`build`, `test`, `lint`, `dev`, `check`,
`format`). For a single package, filter:

```text
pnpm --filter @baustatik/cross-section test
```

What the scripts do not tell you:

- **`typecheck` runs via Turbo, repo-wide and in CI.** `pnpm typecheck` runs
  `tsc --noEmit` in every workspace that defines it (25 packages plus
  `apps/demo`) and depends on `^build`, because per-package `tsc` resolves
  workspace imports through `dist/`. `@baustatik/errors` and the two Rust WASM
  crates have no script and are skipped. For a single package, run
  `pnpm --filter @baustatik/<pkg> typecheck`.
- Every `lint` script writes (`--fix` / `--write`), so CI's lint step cannot
  fail on formatting drift — it silently reformats.
- Every package lints with Oxlint and formats with Oxfmt; `pnpm check`
  (`oxfmt --check packages && oxlint packages`) verifies both, and `pnpm format`
  writes them.
- CI runs `build → lint → test` on Node 24; `engines` says `>=18`. The pinned
  package manager is `pnpm@11.16.0`.
- `@baustatik/linear-solver-wasm` and `@baustatik/sparse-solver-wasm` prefer a
  local Rust toolchain, then build/test in Docker (`baustatik/rust-wasm:1.0.0`).
  The image is built automatically from `docker/Dockerfile.rust`. Without
  either, a build accepts a prebuilt `pkg/`; never skipped in CI or with
  `FORCE_WASM_BUILD=1`. See each package's `CONTEXT.md`.
- `@baustatik/mesh-2d-wasm` builds its generated `pkg/` with Emscripten 6.0.6:
  a local `emcc` first, otherwise Docker with
  `baustatik/emscripten:6.0.6`, native `emcc` in CI and releases. The image is
  built automatically from `docker/Dockerfile.emscripten`. Its `toolchain.json`
  and `scripts/build.mjs` are the single source of that toolchain contract.
- `@baustatik/cross-section-fe`'s suite **meshes and solves for real** and
  therefore needs both `pkg/` artifacts present. It does not skip itself — the
  oracles are the only thing covering the mesh error, so a silent skip would be
  worse than a failure.
- The demo app is `apps/demo`, started by the root `pnpm dev`.
- Releases go through Changesets (`pnpm changeset`). Never hand-edit versions.
  Until the first real release (ADR 0036) every package stays in the `0.0.x`
  series and every changeset is **`patch`** — `changeset version` ticks `0.0.0`
  → `0.0.1` → …, the number never leaves that series. Breaking changes are
  recorded in the changeset body, never as a `major`/`minor` label.
  `schemaVersion` in `@baustatik/script` is a data-format counter and is not a
  package version.

Known tooling gaps, most still unfixed:
[`docs/agents/tooling-gaps.md`](docs/agents/tooling-gaps.md).

## Browser automation

Do **not** open, drive, or screenshot the browser on your own initiative. The
`claude-in-chrome` skill and every `mcp__claude-in-chrome__*` tool are used only
when the user asks for it in that turn — "look at it in the browser", "take a
screenshot of the demo", or a comparable explicit instruction. Verifying a
change in the demo app, debugging a rendering question, or "just having a quick
look" is not such an instruction: report what you can from tests, types, and the
source, and offer the browser as a next step instead of taking it. The same
applies to the `run` skill when it would end in browser automation.

## Coding principles

Rationale, worked examples and the list of packages that currently diverge:
[`CODING_STANDARDS.md`](CODING_STANDARDS.md).

- File names are kebab-case; module constants are `SCREAMING_SNAKE_CASE`.
- `type` for records and unions; `interface` where a shape is extended or
  implemented (render specs, ports).
- Instead of `enum`: a string-literal union, or `as const satisfies Record<…>`
  for a data table.
- The discriminant field is named `kind`.
- Export named `function` declarations. No default exports.
- `class` is for errors, and for an unexported `*Impl` behind a `createX(…)`
  factory. Value types get a namespace object of the same name.
- Errors extend `BaustatikError`, end in `Error`, never assign `this.name`, and
  carry their ids as fields rather than only in the message.
- Index arrays with `atOrThrow(arr, i)` from `@baustatik/core`; `!` is not used
  anywhere in `src/`.
- Three failure channels: a broken precondition throws · "I do not know this",
  where the port's type says so, returns `undefined` · a batch check returns
  `{ errors, warnings }`.
- Close exhaustive switches with `assertNever`.
- `Object.freeze` what leaves the package; mutate locals freely.
- `readonly` on record fields and array parameters.
- Relative imports carry no file extension; workspace packages are imported by
  name, never through a deep path. `index.ts` is a hand-curated barrel.
- Calculate with `toExact`; `to` is for report output only. Conversion factors
  come from `@baustatik/units`, never as literals, at one place per package.
- Physical quantities carry the standard's symbol (`A`, `Iy`, `EA`, `GAs`,
  `kappaY`), not the English word, with the unit in JSDoc as `[m2]`.
- Comments and JSDoc are German, explain *why*, and cite ADR numbers. Use real
  umlauts in new text.
- Two vocabularies, and neither is translated into the other: engineering terms
  are German (`Querschnitt`, `Knick`, `Schwerpunkt`), software and architecture
  terms stay English inside the German sentence (`das Gate`, `der Builder`,
  `die Policy`, `der Port`). Never coin a German compound for an English
  concept — where no term is established, describe it plainly
  (`der Prüfschritt`) instead of inventing one. A term that genuinely needs a
  German form is pinned in the package's `CONTEXT.md`, not decided per file.
- Regression tests live in `tests/*.test.ts`; `describe`/`it` are German
  sentences stating the invariant.
- Keep a calculation or recheck as a reproducible evidence script in root
  `verifaction/` when it supports or changes an ADR, or is otherwise needed to
  reconstruct a design decision. Exercise judgement: routine checks stay
  disposable; a retained script must state its question and be linked from its
  resulting evidence or decision record.
- Documents — `AGENTS.md`, `CONTEXT.md`, `README.md`, `CODING_STANDARDS.md` —
  are written in English. Eight `CONTEXT.md` files are German throughout and
  stay that way until translated as a whole; write new sections in the language
  the file already uses (`CODING_STANDARDS.md` §11).

## Documentation and issue tracking

- `packages/<pkg>/CONTEXT.md` is the source of truth for a package's purpose,
  boundaries, invariants, and domain language. Use the map above to navigate
  between packages.
- `docs/adr/` holds the numbered architecture decisions. A decision that moves
  a package boundary, a type's owner, or a numeric convention gets one; amend
  a superseded ADR with a banner instead of rewriting it.
- GitHub Issues live in `pYr0x/baustatik` via the `gh` CLI, see
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) and the triage
  labels in [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).

## Change checklist

Before handing off a change:

1. Run the narrowest relevant package test **and** `typecheck` — nothing else
   runs the latter.
2. Run the full validation (`pnpm test`, `pnpm build`, `pnpm lint`) when the
   change touches shared code or configuration.
3. Add a changeset for every user-visible package change.
4. Update the package's `CONTEXT.md` when an invariant or boundary moves, and
   this file when a package, command, or legacy status changes.
