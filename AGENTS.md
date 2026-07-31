# baustatik

## Repository map

This repository is a pnpm/Turborepo monorepo. The workspace includes the
packages below. Keep this file short and update it when package ownership or
dependencies change.

### Active packages

| Package | Purpose | Internal dependencies |
| --- | --- | --- |
| `@baustatik/actions` | EN 1990 action vocabulary (`ActionCategory`): classification × concrete action, plus imposed-load use categories. Terms only — no ψ values, no combination rules ([ADR 0015](docs/adr/0015-action-categories-live-in-a-leaf-package.md)). | — |
| `@baustatik/errors` | Shared error types and error helpers. | — |
| `@baustatik/core` | Core domain and infrastructure primitives. | `errors` |
| `@baustatik/round` | Numeric rounding utilities. | — |
| `@baustatik/units` | Unit-related value and conversion utilities. | `round`, `errors` |
| `@baustatik/geometry-2d` | 2D geometry primitives and polygon operations. | `core`, `errors` |
| `@baustatik/material` | Eurocode material data (concrete, steel, reinforcement, timber) and National-Annex design values. | `errors` |
| `@baustatik/viewport-2d` | 2D viewport and coordinate-view state. | `errors` |
| `@baustatik/render-core` | Rendering abstractions shared by visual adapters. | `core`, `errors`, `viewport-2d` |
| `@baustatik/grid-2d` | 2D grid rendering and grid behavior. | `errors`, `render-core`, `viewport-2d` |
| `@baustatik/konva-adapter` | Konva-based rendering adapter. | `render-core`, `viewport-2d` |
| `@baustatik/section-geometry` | Geometry and calculations for cross-sections. | `core`, `errors`, `geometry-2d` |
| `@baustatik/steel-profiles` | Rolled steel profile catalogue (IPE, HEA) as vendored data plus `lookupProfile`. Leaf package, **no dependencies at all** — nothing throws, so not even `errors` ([ADR 0015](docs/adr/0015-action-categories-live-in-a-leaf-package.md)). Values are **tabulated, not recomputed**, in the units the standard prints (mm, cm², cm⁴). The shear areas are `Ay`/`Az` of shear-flexible theory, deliberately **not** `Av` (EC 3) or `Apl` ([ADR 0021](docs/adr/0021-section-values-separate-from-tabulated-profiles.md)). | — |
| `@baustatik/cross-section` | **Section-value engine.** `sectionProperties(cs)` yields `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` and κ in SI metres, from four closed-form parametric shapes or from a catalogue profile. κ has one definition, the shear energy `A_s = I²/∫(S/t)²dA`; `idealisation` is a required field without default (ADR 0021). Also owns `stressPoints(cs)` — computed from a per-source template, "all corners plus the centroid" ([ADR 0022](docs/adr/0022-stress-points-are-computed-from-a-template.md)) — and the model record `CrossSection` ([ADR 0023](docs/adr/0023-cross-sections-belong-to-the-model.md)). Knows no section force and no strength. | `steel-profiles` |
| `@baustatik/cross-section-viewer` | Viewer-facing cross-section composition and visualization. | `cross-section`, `grid-2d`, `render-core`, `section-geometry`, `viewport-2d` |
| `@baustatik/fem` | FEM frame model types (`Node`, `Beam`, `NodeSupport`) plus the model validation gate (`validateModel`, `isolatedNodeIds`). Beam end releases are named in the **local** frame (`u`, `w`, `theta`), not the node frame ([ADR 0017](docs/adr/0017-releases-are-named-in-the-local-frame.md)). Also owns the rule against the **element-internal mechanism** (`UnrestrainedBeamError`): too many releases on one beam leave it with a rigid-body motion inside itself, which no net in the solver can see. The pin-ended beam stays legal. | `errors` |
| `@baustatik/fem-geometry` | 2D geometry primitives in structural x/z coordinates (z downwards). | `core`, `errors`, `geometry-2d` |
| `@baustatik/fem-element` | Element formulation for plane frames: local 6x6 stiffness, consistent nodal load vector, shape functions, static condensation of the releases plus its inverse, and the section forces `N`/`V`/`M`. Three binding stages: `prepare(props, L, releases)` → `withLoad(load)` → `evaluate(dLocal)`, yielding a serialisable `ElementEvaluationState`. Section forces come from **equilibrium**, not from the constitutive law ([ADR 0018](docs/adr/0018-section-forces-from-equilibrium.md)). | `errors` |
| `@baustatik/fem-loads` | Load input model for plane frames (node and beam loads) plus its validation gate. Also owns the **load case** (`LoadCase`, `assertValidLoadCase`, `effectiveLoads`) as a layer above the load model: a named group that owns its loads, with an optional factor for deriving one case from another ([ADR 0013](docs/adr/0013-load-case-factor.md)). | `actions`, `errors`, `fem`, `fem-geometry` |
| `@baustatik/script` | Public browser-scripting DSL for building serializable FEM model snapshots through model-owned handles. Owns builder ergonomics and strict snapshot-boundary validation, not the FEM records or their domain rules. Snapshots are `schemaVersion: 2` and carry `crossSections`, which makes them self-supporting; v1 is rejected, not extended ([ADR 0023](docs/adr/0023-cross-sections-belong-to-the-model.md)). | `cross-section`, `errors`, `fem`, `fem-loads` |
| `@baustatik/fem-section-resolve` | `CrossSection` × `Material` → `SectionStiffness`. The twin of `fem-load-resolve` and the **only** place in the repository where geometry is multiplied by material: `resolveSectionStiffness(beam, sections, materials)` resolves the ids, `sectionStiffness(props, moduli)` does the arithmetic and the unit chain (MPa → kN/m²). Returns `undefined` rather than throwing, matching the port `getSectionStiffness`. | `cross-section`, `fem`, `fem-element`, `material` |
| `@baustatik/fem-load-resolve` | Resolves abstract loads onto beams: frame rotation, reference length, positions, merge per beam. Also exports the position and direction of a load (`loadStation`, `loadDirection`) for non-solver callers such as the viewer. | `fem-element`, `fem-geometry`, `fem-loads` |
| `@baustatik/fem-solver` | Entry point of the calculation (`createFEMSolver`). `check(loadCaseId)` reports a workflow state; `solve(loadCaseId)` computes one load case and `solveAll()` computes every load case, doing DOF numbering, assembly, transformation, boundary conditions and reactions; release condensation is orchestrated here but performed in `fem-element` (ADR 0018). The result carries a serialisable `ElementEvaluationState` per beam, from which the free functions `internalForcesAt`/`internalForcesAlong` answer `N`, `V` and `M` at any station without reading `config` ([ADR 0019](docs/adr/0019-result-carries-an-evaluation-state.md)). The linear solver, the stiffness catalogue and the element formulation arrive as ports. Owns the **judgement of the result**: a displacement field leaves this package only if it is a deformation and not a motion — the fourth net against kinematics, because the pivot test is one-sided ([ADR 0016](docs/adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md)). Also the composition root for the versioned `AnalysisPolicy`: it assembles the policy slices the other packages own with its own analysis decisions ([ADR 0011](docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md)). | `errors`, `fem`, `fem-element`, `fem-geometry`, `fem-load-resolve`, `fem-loads` |
| `@baustatik/linear-solver-wasm` | Rust/faer WASM binding for the linear solve `K d = F`, via Cholesky (`Llt`). Also owns **kinematics detection**: Jacobi scaling plus a pivot threshold turn a singular or nearly singular system into a reported finding instead of `NaN` ([ADR 0012](docs/adr/0012-kinematics-is-detected-by-the-solver.md)). Knows only numbers — the translation into node and direction belongs to `fem-solver`. | — |
| `@baustatik/fem-viewer` | Viewer-facing FEM frame composition and visualization, including concentrated loads: forces as arrows, moments as curved arrows, both with labelled magnitudes. | `errors`, `fem`, `fem-geometry`, `fem-load-resolve`, `fem-loads`, `grid-2d`, `render-core`, `round`, `viewport-2d` |

The dependency direction is broadly: foundational utilities and errors →
geometry/domain packages → rendering abstractions → adapters and viewers.
Confirm the package's `package.json` before adding a new dependency.

### Inactive, planned, or legacy directories

- `packages/konva-adapter-BAK/` is a legacy backup. Do not use or extend it
  unless the task explicitly targets it.
- `packages/fem-1d/`, `packages/fem-2d/`, and `packages/solver-2d/` currently
  have no `package.json` and are not pnpm workspace packages. Treat them as
  placeholders unless the task says otherwise.

## Working commands

Run commands from the repository root with pnpm:

```text
pnpm install
pnpm build       # turbo build
pnpm test        # turbo test
pnpm lint        # turbo lint
pnpm dev         # turbo dev
pnpm check       # biome check --write .
pnpm format      # biome format --write .
```

For a single package, prefer a filtered command, for example:

```text
pnpm --filter @baustatik/geometry-2d test
pnpm --filter @baustatik/section-geometry build
```

The demo application is under `apps/demo`; use the root `pnpm dev` command
or filter the app when a package-specific development server is needed.

## Conventions

- Package manager: pnpm 9; Node.js 18 or newer.
- Build orchestration: Turborepo.
- Source language: TypeScript with the shared root configuration in
  `tsconfig.base.json`.
- Formatting and general checks: Biome. Some packages additionally contain
  Oxlint/Oxfmt configuration; follow the package-local configuration.
- Tests: Vitest. Packages with browser tests use Vitest Browser and
  Playwright; check the package scripts before choosing a test command.
- Releases: use Changesets (`pnpm changeset`, then the version/publish
  scripts). Do not edit generated versions manually.
- Prefer package exports and existing domain abstractions over importing
  implementation files from another package.
- Comments in existing code are written in German and explain *why* the code
  exists or behaves as it does, rather than restating *what* it does.
- Keep architecture and domain explanations in focused documentation or
  package READMEs; do not turn this file into API documentation.

## Documentation and issue tracking

- GitHub Issues are tracked in `pYr0x/baustatik` via the `gh` CLI. See
  [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).
- Use the triage labels documented in
  [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).
- Package-specific `CONTEXT.md`, README files, and `docs/` directories are the
  source of truth for detailed usage and architecture. A package `CONTEXT.md`
  documents that package's purpose, boundaries, invariants, and domain
  language; use this root map to navigate between packages.

## Change checklist

Before handing off a change:

1. Run the narrowest relevant package test and typecheck.
2. Run the full relevant validation (`pnpm test`, `pnpm build`, or `pnpm
   lint`) when the change affects shared code or configuration.
3. Update this file when package boundaries, commands, or legacy status
   change.
