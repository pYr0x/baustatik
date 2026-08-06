# Known tooling gaps

Facts about the build and quality setup that are *not* what the configuration
appears to promise. None of these are fixed. They are recorded here so that
nobody assumes a check is running that is not, and so that the list can be
worked off deliberately rather than discovered one at a time.

Last verified: 2026-08-06.

## Checks that do not run

- **`typecheck` is never invoked.** 22 packages define `"typecheck": "tsc
  --noEmit"`. There is no `typecheck` task in `turbo.json`, no root script, and
  no CI step. `pnpm build` compiles through Vite + `vite-plugin-dts`, which
  does not fail the build the way `tsc --noEmit` would.
- **`lint` cannot fail on formatting.** Every package's `lint` script passes
  `--fix` (Biome) or `--write` (oxfmt). CI runs `pnpm lint`, so it mutates the
  checkout and exits 0 unless a rule is genuinely unfixable. There is no
  `--check` / CI-mode variant.
- **Coverage is collected but never enforced.** Every `vitest.config.ts` sets
  `coverage.enabled: true` with the istanbul provider; no package configures
  `thresholds`.
- **Browser tests do not run in CI for every package that has them.**
  `units` and `geometry-2d` run only `--project Unit` in their `test` script;
  their `*.browser.test.ts` files run solely via the separate `test:browser`
  script. `konva-adapter`'s screenshot project is excluded on purpose.

## Unfinished linter migration

Two toolchains split the workspace:

| Toolchain | Packages |
| --- | --- |
| `biome check --fix .` | `core`, `cross-section`, `cross-section-viewer`, `geometry-2d`, `round`, `units`, `viewport-2d` |
| `oxlint --fix .` + `oxfmt --write .` | the other 16 |

`biome.json` still includes all of `packages/**` (minus `section-geometry`), so
root `pnpm check` reformats the oxlint packages with Biome. The two formatters
agree on 2 spaces / single quotes / width 80, so drift is limited to edge cases
and to import organisation, which only Biome performs.

`fem-section-resolve`, `script` and `steel-profiles` run `oxlint` **without**
an `.oxlintrc.json` / `.oxfmtrc.json`, so they fall back to defaults and lint
their `tests/` directory, which the other packages exclude.

## TypeScript strictness

`tsconfig.base.json` sets `strict: true` and nothing beyond it. Not enabled:
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`,
`noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedDeclarations`.

`noUncheckedIndexedAccess` is the interesting one: the `atOrThrow` convention
exists precisely because indexed access is unsound, and the flag would enforce
what the convention asks for. Turning it on will produce an initial error wave.

No package uses `composite` / project references; per-package `tsc --noEmit`
resolves cross-package imports through `node_modules` symlinks into `dist/`,
which is why `build` depends on `^build`.

## Publish surface

- **No package declares `sideEffects` or `files`.** npm therefore publishes
  everything not gitignored — `src/`, `tests/`, configs, `CONTEXT.md` — and
  bundlers cannot tree-shake with confidence.
- **`exports` has no `default` and no `require` condition.** A `require()`, or
  a resolver that ignores the `import` condition, fails.
- No `publint`, no `@arethetypeswrong/cli`, no `knip`. The publish surface and
  dead exports are unverified.
- `@baustatik/geometry-2d` lacks `publishConfig.access: "public"`; with the
  global `access: "restricted"` in `.changeset/config.json` it would publish
  restricted.
- `@baustatik/errors` has no `type: "module"`, no build/test/lint scripts, and
  points `main`/`types`/`exports` at `./src/index.ts` — it ships raw
  TypeScript.
- `apps/demo` has no `private: true` and lists `vite` under `dependencies`.

## Dependency drift

The two linter cohorts are also two dependency cohorts: Vite 7 /
`vite-plugin-dts` 4 / Vitest 4.0 against Vite 8 / `vite-plugin-dts` 5 /
Vitest 4.1. Two mutually incompatible dts option names are in use accordingly
(`rollupTypes` in v4, `bundleTypes` in v5), and `core` is the only package that
bundles its types.

There is no `pnpm.overrides` and no `catalog:` in `pnpm-workspace.yaml`;
versions are pinned by hand in 23 `package.json` files. Renovate automerges
minor and patch updates for non-`0.x` dependencies, which keeps the drift
moving.

## Turbo cache correctness

- The `test` task's `inputs` list omits `vitest.config.ts` and `package.json`,
  so a config-only change does not invalidate a cached test result.
- The `lint` task declares no `inputs` and no `outputs`, so it is keyed on the
  whole package hash.

## Small inconsistencies

- `packages/cross-section/vitest.config.ts` runs its browser project with
  `headless: false`.
- `tsconfig.base.json`'s `paths` map omits `actions`, `steel-profiles`,
  `fem-section-resolve` and `linear-solver-wasm`. Every package tsconfig resets
  `paths: {}`, so this only affects `apps/demo`, which inherits the base.
- `AGENTS.md` used to claim pnpm 9; the pinned manager is `pnpm@11.16.0` and CI
  runs Node 24 while `engines` says `>=18`.
