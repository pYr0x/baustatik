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
| `@baustatik/errors` | `BaustatikError`, the root of every error class in the repo. | — |
| `@baustatik/core` | Core domain and infrastructure primitives, including `atOrThrow`. | `errors` |
| `@baustatik/round` | Numeric rounding utilities. | — |
| `@baustatik/units` | Unit conversion (`convert(x).from(a).to(b)` rounds, `toExact(b)` does not) and the phantom-branded quantity types `Quantity<U>`, `mm`, `cm2`, `MPa`. | `errors`, `round` |
| `@baustatik/geometry-2d` | 2D geometry primitives and polygon operations. | `core`, `errors` |
| `@baustatik/material` | Eurocode material data and National-Annex design values via `createMaterials({ na })`, plus the model record `Material` and the Annex-free `lookupMaterial`. | `errors`, `units` |
| `@baustatik/viewport-2d` | 2D viewport and coordinate-view state. | `errors` |
| `@baustatik/render-core` | Rendering abstractions shared by visual adapters. | `core`, `errors`, `viewport-2d` |
| `@baustatik/grid-2d` | 2D grid rendering and grid behavior. | `errors`, `render-core`, `viewport-2d` |
| `@baustatik/konva-adapter` | Konva-based rendering adapter. | `render-core`, `viewport-2d` |
| `@baustatik/section-geometry` | Geometry and calculations for cross-sections. | `core`, `errors`, `geometry-2d` |
| `@baustatik/steel-profiles` | Rolled steel profile catalogue (IPE, HEA) as vendored, tabulated data plus `lookupProfile`. Leaf package with no dependencies at all. | — |
| `@baustatik/cross-section` | Section-value engine: `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` and κ from four parametric shapes or a catalogue profile; owns `stressPoints` and the model record `CrossSection`. | `steel-profiles`, `units` |
| `@baustatik/cross-section-viewer` | Viewer-facing cross-section composition and visualization. | `cross-section`, `grid-2d`, `render-core`, `section-geometry`, `viewport-2d` |
| `@baustatik/fem` | FEM frame model types (`Node`, `Beam`, `NodeSupport`) and the model validation gate (`validateModel`, `assertValidModel`, `isolatedNodeIds`). | `errors` |
| `@baustatik/fem-geometry` | 2D geometry primitives in structural x/z coordinates (z downwards). | `core`, `errors`, `geometry-2d` |
| `@baustatik/fem-element` | Element formulation for plane frames: local 6×6 stiffness, consistent load vector, shape functions, release condensation, and the section forces `N`/`V`/`M`, bound in three stages. | `errors` |
| `@baustatik/fem-loads` | Load input model for plane frames plus its validation gate, and the load case (`LoadCase`, `effectiveLoads`) above it. | `actions`, `errors`, `fem`, `fem-geometry` |
| `@baustatik/script` | Public browser-scripting DSL that builds serializable `schemaVersion: 4` model snapshots through model-owned handles. | `cross-section`, `errors`, `fem`, `fem-loads`, `material`, `steel-profiles` |
| `@baustatik/fem-section-resolve` | `CrossSection` × `Material` → `SectionStiffness`; the only place in the repo where geometry is multiplied by material. | `cross-section`, `fem`, `fem-element`, `material` |
| `@baustatik/fem-load-resolve` | Resolves abstract loads onto beams: frame rotation, reference length, positions, merge per beam. | `fem-element`, `fem-geometry`, `fem-loads` |
| `@baustatik/fem-solver` | Entry point of the calculation (`createFEMSolver`): `check`, `solve`, `solveAll`, and the composition root for the versioned `AnalysisPolicy`. | `errors`, `fem`, `fem-element`, `fem-geometry`, `fem-load-resolve`, `fem-loads` |
| `@baustatik/linear-solver-wasm` | Rust/faer WASM binding for `K d = F` via Cholesky, including kinematics detection. | — |
| `@baustatik/fem-viewer` | Viewer-facing FEM frame composition and visualization, including loads and support reactions. `N`/`V`/`M` diagrams are still missing. | `errors`, `fem`, `fem-geometry`, `fem-load-resolve`, `fem-loads`, `fem-solver`, `grid-2d`, `render-core`, `round`, `viewport-2d` |

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

- **`typecheck` runs in no Turbo task and in no CI step.** 22 packages define
  `tsc --noEmit`; nothing invokes it. Run
  `pnpm --filter @baustatik/<pkg> typecheck` yourself before handing off.
- Every `lint` script writes (`--fix` / `--write`), so CI's lint step cannot
  fail on formatting drift — it silently reformats.
- Seven packages lint with Biome, sixteen with Oxlint/Oxfmt. This is an
  unfinished migration, not a layered setup: follow the package-local scripts.
  Root `pnpm check` runs Biome over `packages/**` regardless.
- CI runs `build → lint → test` on Node 24; `engines` says `>=18`. The pinned
  package manager is `pnpm@11.16.0`.
- The demo app is `apps/demo`, started by the root `pnpm dev`.
- Releases go through Changesets (`pnpm changeset`). Never hand-edit versions.

Known tooling gaps, none of them fixed:
[`docs/agents/tooling-gaps.md`](docs/agents/tooling-gaps.md).

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
- Tests live in `tests/*.test.ts`; `describe`/`it` are German sentences stating
  the invariant.
- Documents — `AGENTS.md`, `CONTEXT.md`, `README.md`, `CODING_STANDARDS.md` —
  are written in English.

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
