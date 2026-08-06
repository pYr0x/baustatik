# Coding standards

The rules themselves are listed in [`AGENTS.md`](AGENTS.md) under *Coding
principles*. This file carries the reasoning and one worked example per rule,
so the short list stays short.

Every example below is real code in this repository. When a rule and the code
disagree, [§11 Known divergences](#11-known-divergences) says which one is the
target.

---

## 1. Types

**`type` is the default for records and unions; `interface` is for shapes that
get extended or implemented.** The repo holds 267 `type` aliases against 85
`interface` declarations, and the split is not accidental: domain records are
data, and `type` cannot be reopened by declaration merging. `interface` earns
its place where composition is the point — render specs build from shared
fragments (`packages/render-core/src/specs.ts:3-27`, `SpecBase` + `Stroke` +
`Filled` → `LineSpec`), and ports are declared as implementable contracts
(`packages/fem-solver/src/config.ts:77`, `SolverConfig`).

**The discriminant is always named `kind`.** 59 discriminated unions, zero
using `type:` as the field. Keeping one word means `switch (x.kind)` reads the
same in every package, and `Extract<BeamLoad, { kind: 'force' }>`
(`packages/fem-load-resolve/src/resolve.ts:149`) works without looking up which
spelling that package chose.

Where a second axis is needed, name it after the axis rather than adding a
second `kind` — `packages/fem-loads/src/types.ts:180-181` carries
`kind: 'force' | 'moment'` *and* `distribution: 'point' | 'constant' |
'trapezoidal'`.

**No `enum`.** There is not one in the repository. A string-literal union
(`packages/material/src/model.ts:28`) erases at compile time, prints readably
in JSON, and needs no import at the use site. For lookup tables, a `const`
object closed with `as const satisfies Record<…>` gives the same exhaustiveness
check without the runtime object an enum generates —
`packages/steel-profiles/src/data/ipe.ts:33`.

**Prefer an optional `true` over a `boolean`** when the absent case has no
meaning of its own. `packages/fem/src/types.ts:57-64` spells out why: for a
beam end release, `false` would be a second word for "not released".

**Let the type system check the data tables.** `satisfies` catches a wrong
entry; a type-level assertion catches a *missing* one.
`packages/steel-profiles/src/types.ts:138-142` pairs them so that adding a
column to `SteelProfileData` without listing it in `PROFILE_DATA_KEYS` fails to
compile:

```ts
type NoColumnMissing<T extends never> = T;
type _ProfileDataKeysAreComplete = NoColumnMissing<
  Exclude<keyof SteelProfileData, (typeof PROFILE_DATA_KEYS)[number]>
>;
```

The leading underscore marks an alias that exists only to be checked.

**Units belong in the type where one exists.** `Quantity<U>` from
`@baustatik/units` is a phantom brand — a plain `number` at runtime, with the
unit visible on hover (`packages/units/src/quantity.ts:12`). It documents; it
does not enforce, deliberately, so arithmetic works unwrapped. Alias names are
lower-cased like the symbol (`mm`, `cm2`, `cm4`), capitalised only where the
symbol is (`MPa`).

---

## 2. Functions, factories, staged APIs

**Export named function declarations.** 209 `export function` against 28
exported arrow consts. Declarations hoist, name themselves in stack traces, and
read the same whether or not they are generic.

**No default exports.** There are none in any `src/`. A named export cannot be
renamed by accident at the import site, and it keeps the barrel re-export
mechanical.

**`class` is for errors, and for an implementation hidden behind a factory.**
Everything else is a function over plain data. Where a class *is* the right
tool, it stays unexported and the module exports a `createX` that returns the
interface — `packages/script/src/builder.ts:43` returns
`FEMModelSnapshotBuilder`, while `FEMModelBuilderImpl` and the five
`*HandleImpl` classes below it are private to the file and use `#private`
fields (`:51-58`).

**Give a value type its operations as a namespace object of the same name**
rather than methods. `packages/geometry-2d/src/point.ts:4` declares
`type Point`, and `:6` a `const Point` holding `make`/`distance`/`equals`/
`translate`/`rotate`. The data stays a serialisable POJO, the operations stay
tree-shakeable, and `Point.rotate(p, a)` reads like the maths.

**Stage an API when a later step must not be reachable without an earlier
one.** Three examples, same shape:

- `prepare(props, L, releases)` → `.withLoad(load)` → `.evaluate(dLocal)`
  (`packages/fem-element/src/types.ts:249-311`) — φ is normalised exactly once
  in `prepare`, so the stiffness matrix and the shape functions cannot drift
  apart (ADR 0003).
- `convert(x).from(a).toExact(b)` (`packages/units/src/types.ts:16-34`).
- `round(value).toDecimals(n)` (`packages/round/src/round.ts:16-38`).

**Ports are function fields on a config object, not classes to subclass.**
`packages/fem-solver/src/config.ts:77-140` groups three categories in one
interface: getters that pull data (`getNodes`), ports that supply capability
(`solveLinearSystem`, `getSectionStiffness`), and policy. Tests substitute a
trivial formulation and check assembly with hand-computable numbers
(`config.ts:110-119`).

---

## 3. Errors and the three failure channels

**Which channel to use is a question about who broke a promise.**

| Situation | Channel | Example |
| --- | --- | --- |
| A precondition is violated — the function cannot fulfil its contract | **throw** a named error | `packages/fem-element/src/timoshenko.ts:76-80` |
| Valid input, but this component does not know the answer, and the port's type says so | **return `undefined`** | `packages/fem-section-resolve/src/index.ts:148-164` |
| A batch check that must report everything at once | **return a findings record** | `packages/fem/src/validate.ts:55-69` |
| Valid input, empty result, low-level utility in a loop | **return a safe value** (`[]`, `null`, the input) | — |

The `undefined` channel is a contract, not laziness. `resolveSectionStiffness`
returns `SectionStiffness | undefined` because the port it plugs into says so,
and `packages/fem-solver/src/config.ts:96-98` records the reason: `check()`
should be able to name the problem in its report instead of `solve()` failing
by surprise.

**Every validating package ships both doors.** `validateModel` collects all
findings for the UI, `assertValidModel` throws the first one as the gate before
the calculation. The rationale sits at the top of the file
(`packages/fem/src/validate.ts:1-12`). Same pair in `fem-loads`
(`validate.ts:215`, `load-case.ts:90`).

**Error classes.** Every one extends `BaustatikError` from `@baustatik/errors`
(`packages/errors/src/index.ts:1-6`), which sets `name` from
`this.constructor.name` — so never assign `this.name` yourself. Names end in
`Error`; a package that defines errors declares `@baustatik/errors` in its
dependencies.

Where a package has a family of rule violations, give the family an `abstract`
base with a `protected constructor` so nobody can throw a generic one
(`packages/fem/src/errors.ts:37-56`, and the parallel
`ModelValidationWarning`). A warning extends the same root even though it is
never thrown: the UI renders both with one code path (`errors.ts:43-51`).

**Errors carry their ids as fields, not only in the message text.**
`packages/fem/src/errors.ts:65-78` declares `readonly ownerKind`, `ownerId`,
`nodeId` alongside the German message, because `validateModel` *returns* these
objects and the surface highlights the affected element from them
(`errors.ts:18-20`).

Another package may extend a foreign hierarchy — `UnknownSectionStiffnessError`
in `fem-solver` extends `ModelValidationError` from `fem`
(`packages/fem-solver/src/errors.ts:77`). The hierarchy is the extension point.

**Index arrays with `atOrThrow(arr, i)` from `@baustatik/core`.** TypeScript
does not narrow through a length check, so `arr[i]` stays `T | undefined` even
after an explicit guard. `atOrThrow` throws an `AssertionError` if the index is
genuinely missing, which signals a bug in the caller rather than bad user input
(`packages/core/src/utils.ts:4-9`, re-exported under both names at
`packages/core/src/index.ts:3`). There are 52 call sites and zero `!`
assertions in `src/`.

```ts
// The repo's shape
if (pl.points.length === 0) throw new InvalidPolylineError('...');
return atOrThrow(pl.points, 0);
```

**Close every exhaustive switch with `assertNever`** from
`@baustatik/render-core` (`packages/render-core/src/exhaustive.ts:3`), so a new
union member becomes a compile error at each switch instead of a silent
fall-through. See `packages/konva-adapter/src/primitives/index.ts:68`.

---

## 4. Immutability

**Freeze what leaves the package; mutate locals freely.** Domain values and
policies are frozen on the way out — `packages/material/src/concrete.ts:125`
(`makeConcrete` returns `Object.freeze({…})`), the nested freezes in
`packages/fem-solver/src/policy.ts:100-102`, and
`packages/script/src/builder.ts:57`. Inside a function, `let` and `.push` are
normal and used throughout (`packages/fem/src/validate.ts:70-81`).

**Mark record fields and array parameters `readonly`.** Prefer
`readonly Node[]` over `ReadonlyArray<Node>` — the repo uses the former
exclusively. Parameters are readonly even where the type is not yet:
`packages/fem/src/validate.ts:65-68`. Fixed-length vectors are readonly tuples
(`packages/fem-element/src/types.ts:48`, `Vector6`).

---

## 5. Naming and file layout

**File names are kebab-case** — 100 % of `.ts` files, no exceptions:
`internal-forces.ts`, `hollow-rectangle.ts`, `national-annex.ts`, `to-si.ts`.

**Recurring file names carry meaning.** Reach for the established word before
inventing one: `index.ts` (barrel), `types.ts`, `errors.ts`, `validate.ts`,
`policy.ts`, `convert.ts`, `style.ts`. A concern that grows past one file
becomes a folder with its own `index.ts`
(`packages/cross-section/src/shapes/`, `packages/fem-viewer/src/results/`).

**Module-level constants are `SCREAMING_SNAKE_CASE`** —
`packages/cross-section/src/units.ts:20`, `GEOMETRY_EPS` in
`packages/fem-element/src/timoshenko.ts:73`.

**Acronyms stay uppercase in identifiers**: `createFEMSolver`,
`FEMModelSnapshot`, `IPE`, `HEA`.

**Two concepts that share a shape still get two names.** `SectionProperties` is
geometry, `SectionStiffness` is geometry × material — the rename was worth an
ADR (0020), and the reasoning is at
`packages/fem-element/src/types.ts:71-76`. Likewise `ZeroLengthBeamError` and
`DegenerateBeamError` (`packages/fem/src/errors.ts:81-86`).

---

## 6. Imports and the public API

**`index.ts` is a hand-curated barrel of named re-exports**, alphabetically
ordered, with `type` modifiers inline —
`packages/fem/src/index.ts:1-19`. It is the package's only entry point:
`exports` in `package.json` maps `"."` and nothing else.

**Never import through a deep path.** `@baustatik/fem-element` is a valid
import; `@baustatik/fem-element/src/timoshenko` is not. There are zero deep
cross-package imports today, and keeping it that way is what makes the barrel
an actual boundary.

**Relative specifiers carry no file extension** (`./stiffness`, not
`./stiffness.js`) — `moduleResolution` is `bundler`. 393 relative imports, none
with an extension.

**`import type` for type-only imports**, inline `type` when mixing:

```ts
import type { Beam } from '@baustatik/fem';
import { lookupMaterial, type Material } from '@baustatik/material';
```

Import order is Biome's `organizeImports` — do not hand-sort against it.

**Re-export a foreign type when it spares the caller a dependency**, and say
why at the export: `packages/fem-section-resolve/src/index.ts:55-63`.

---

## 7. Units and physical quantities

**Calculate with `toExact`; use `to` only for report output.** `convert(x).from(a).to(b)`
rounds *atomically* — to whole millimetres, mm², mm⁴. That is right for a
printed report and destroys a calculation: `139,5 mm` would become `0,14 m`
(ADR 0024). The rule is written out at `packages/cross-section/src/units.ts:7-11`.

**Pull conversion factors from `@baustatik/units`; never write the literal.**
`packages/cross-section/src/units.ts:19-28` derives `CM2_TO_M2`, `CM4_TO_M4`,
`MM_TO_CM` as module constants, because `1e-8` on its own does not say whether
it was cm⁴ or cm³.

**One conversion point per package, and it announces itself.**
`packages/cross-section/src/to-si.ts:26` — "the only place in the package where
catalogue units become SI". `packages/fem-section-resolve/src/index.ts:40-52`
does the same for MPa → kN/m², with the whole chain in the comment.

The shape is: **input in the unit a drawing uses (mm), internals in the unit
the standard prints (cm), SI at the package boundary.** Keeping the internals
in catalogue units means a result can be diffed against the printed table.

**Physical quantities use the standard's symbol**, not the English word: `A`,
`Iy`, `Iz`, `Iyz`, `ys`, `zs`, `kappaY`, `EA`, `EI`, `GAs`, `N`, `V`, `M`, `L`.
Greek letters are spelled out in identifiers (`kappaZ`, `phi`, `theta`) and
written as symbols in comments (κ, φ, ν). Document the unit in JSDoc in square
brackets — `/** Querschnittsflaeche A [m2]. */`.

**When `undefined` carries a domain meaning, write down which one.** A missing
`kappaZ` means *shear-rigid*, not κ = 0
(`packages/cross-section/src/properties.ts:41-46`). `'rigid'` is the JSON-safe
spelling of infinite stiffness (`packages/fem-element/src/types.ts:80`).

**Repeat the axis convention in every file header that touches geometry**: x to
the right, z **downwards**; node rotation `phiY = -theta` (ADR 0005).

---

## 8. Comments, JSDoc and ADRs

**Comments and JSDoc are written in German.** They explain *why* the code is
the way it is, not *what* it does. Prose paragraphs do the work — the repo uses
almost no JSDoc tags (0 `@example`, 0 `@see`, 18 `@param`).

**Use real umlauts (`ö`, `ä`, `ü`, `ß`) in new and edited comments.** All files
are UTF-8 and neither Biome nor oxfmt objects. Existing transliterations
(`Modellpruefung`, `gehoeren`) are legacy and are not worth a repo-wide diff —
leave them until the surrounding code changes anyway.

**Devices that recur, and are worth copying:**

- An ALL-CAPS lead phrase as a heading inside a block — "DREI BINDUNGSSTUFEN"
  (`packages/fem-element/src/timoshenko.ts:18`), "ZWEI HIERARCHIEN, ZWEI
  WOERTER" (`packages/fem/src/errors.ts:13`).
- Documenting the road *not* taken, and why — `packages/fem/src/types.ts:49-52`
  on why a release flag is `true` and not `boolean`.
- Naming what is deliberately **not** decided here —
  `packages/fem/src/validate.ts:19-38`.
- Citing the ADR inline, as a link or bare: a full markdown link at
  `packages/cross-section/src/properties.ts:8`, `Siehe ADR 0008.` at
  `packages/fem/src/errors.ts:11`.

**A decision that changes a package boundary, a type's owner, or a numeric
convention gets an ADR** in `docs/adr/`, numbered sequentially. Do not rewrite
a superseded ADR — add an amendment banner at the top of the old one and link
forward, the way ADR 0009 and ADR 0026 do.

**`CONTEXT.md`, `README.md`, `AGENTS.md` and this file are written in
English.** German stays in code comments, JSDoc and test names.

---

## 9. Tests

**Vitest, `tests/*.test.ts` beside `src/`**, importing `../src/…`. Browser
tests are `*.browser.test.ts` and run in Chromium via Playwright.

**`describe` and `it` are German sentences that state the invariant**, and the
`it` continues the `describe` grammatically:

```
describe('kappa: geschlossene Formel gegen numerische Integration')
  it('liefert kappa = 5/6 in beiden Richtungen — GERECHNET, nicht gesetzt')
```

Test names routinely cite the ADR they guard and are allowed to shout the point
(`der Waechter ueber die Az-Entscheidung`). Numeric literals in test titles use
the German decimal comma (`9,92 cm3`).

**Reference solutions, not property-based testing.** There is no `fast-check`.
The equivalent rigour comes from independent closed-form references
(`packages/fem-element/tests/references/euler-bernoulli.ts` — derived
independently, deliberately *not* as Timoshenko with φ = 0, so the check is not
circular), catalogue-wide sweeps, and structural invariance blocks.

**No snapshot tests.** Zero `toMatchSnapshot` in the repo. The only image
baselines are Playwright screenshots in `konva-adapter`, excluded from CI and
run locally via `pnpm test:screenshot`.

**Shared fixtures live in `tests/helpers.ts`** with a header explaining what
was extracted and why (`packages/fem-element/tests/helpers.ts`,
`packages/fem-viewer/tests/helpers.ts`). Test-only references are never
exported from `src/index.ts`.

---

## 10. Anatomy of a new package

Copy an existing package rather than starting empty. The canonical
`package.json`:

```json
{
  "name": "@baustatik/<name>",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "publishConfig": { "access": "public" }
}
```

`development` comes first so Vite resolves to source during `pnpm dev`.

- `tsconfig.json` extends `../../tsconfig.base.json` and sets `outDir: dist`,
  `rootDir: src`, `paths: {}`, `include: ["src"]`, and excludes `**/*.test.ts`
  and `**/*.browser.test.ts`.
- Build with `vite build` plus `vite-plugin-dts`, `formats: ['es']`,
  `external: [/^@baustatik\//]`.
- `vitest.config.ts` with a named `Unit` project over `tests/**/*.test.ts`.
- A `CONTEXT.md` following
  `.agents/skills/creating-package-context/assets/CONTEXT.template.md`.
- Add the package to the map in [`AGENTS.md`](AGENTS.md) with a one-line
  purpose and its internal dependencies.

Check the dependency direction before adding an internal dependency:
foundational utilities and errors → geometry and domain → rendering
abstractions → adapters and viewers.

---

## 11. Known divergences

Where the repository disagrees with itself. **The left column is the target**;
the right column is what a package does today. Do not propagate the right
column into new code, and do not "fix" it opportunistically either — these are
separate, deliberate changes.

| Target | Diverges today |
| --- | --- |
| `readonly` on record fields | `packages/fem/src/types.ts:57-84` (`Node`, `Beam`, `NodeSupport`), `packages/cross-section/src/properties.ts:19-51`, `packages/fem-element/src/types.ts:96-103` are mutable |
| Explicit named re-exports in the barrel | `export *` in `actions`, `fem-element`, `fem-loads`, `fem-viewer`, `cross-section-viewer` |
| A barrel exports, it does not execute | `packages/material/src/index.ts:5` calls `createMaterials({ na: 'DE' })` at module load |
| Tests in `tests/` | colocated in `src/` in `units`, `round`, `core`, `viewport-2d` |
| `type` for domain records | `packages/material/src/concrete.ts:33` models a record as `interface` while `model.ts:49` uses `type` |
| Real umlauts in comments | transliterated `ae`/`oe`/`ue` across the FEM strand |
| No `any` | `packages/render-core/src/validation.ts:273-274`, `packages/round/src/utils/guards.ts:5,13` |
| One geometry implementation | `geometry-2d`, `fem-geometry` and `section-geometry` hold three near-identical `Point`/`Line`/`Vector` namespace objects |

Tooling-level divergences — the linter split, unrun typechecks, publish-surface
gaps — are tracked separately in
[`docs/agents/tooling-gaps.md`](docs/agents/tooling-gaps.md).
