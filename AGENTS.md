# baustatik

## Repository map

This repository is a pnpm/Turborepo monorepo. The workspace includes the
packages below. Keep this file short and update it when package ownership or
dependencies change.

### Active packages

| Package | Purpose | Internal dependencies |
| --- | --- | --- |
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
| `@baustatik/cross-section` | Cross-section domain model and calculations. | — |
| `@baustatik/cross-section-viewer` | Viewer-facing cross-section composition and visualization. | `cross-section`, `grid-2d`, `render-core`, `section-geometry`, `viewport-2d` |
| `@baustatik/fem` | FEM frame model types (`Node`, `Beam`, `NodeSupport`). | — |
| `@baustatik/fem-geometry` | 2D geometry primitives in structural x/z coordinates (z downwards). | `core`, `errors`, `geometry-2d` |
| `@baustatik/fem-viewer` | Viewer-facing FEM frame composition and visualization. | `errors`, `fem`, `grid-2d`, `render-core`, `viewport-2d` |

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
