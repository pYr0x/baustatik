# `@baustatik/fem-geometry`

## Purpose

Provides the 2D geometry primitives — `Point`, `Vector`, `Line` — in the
structural coordinate system used across the FEM packages: `x` to the right,
`z` **downwards**, a downward load being positive. It is a thin adapter over
`@baustatik/geometry-2d`, which works in `x`/`y`. The package exists so that the
`x`/`z` convention is defined in exactly one place instead of being re-derived
by every FEM consumer.

Beyond the mapping it owns one genuinely structural concept: the local beam
coordinate system (`Line.frame` / `toLocal` / `toGlobal`), which turns a global
load or displacement vector into beam-local components.

## Boundaries

- Owns: the `x`/`z` types, the mapping to `geometry-2d` (`src/convert.ts`), and
  the local beam frame.
- Does not own: anything with degrees of freedom. The 2×2 vector rotation lives
  here; the 6×6 DOF transformation (which carries the `phiY` row and the
  rotational sign convention of the element formulation) belongs to
  `@baustatik/fem-element` / `fem-solver`. Also not owned: load semantics
  (reference lengths, projection factors — those are `@baustatik/fem-loads`),
  element mathematics, and rendering. In particular, _where "up" is on screen_
  is answered by the `x`/`z` → `u`/`v` mapping in `@baustatik/fem-viewer`, not
  here.

Important consumers:

- [`@baustatik/fem-loads`](../fem-loads): validates load geometry against beam
  axes.
- `@baustatik/fem-load-resolve` (planned): resolves global beam loads into
  local `qx`/`qz` components via `Line.toLocal`.

## Dependencies

- `@baustatik/geometry-2d`: the actual geometry implementation. Nearly every
  operation delegates to it through `src/convert.ts`.
- `@baustatik/core` and `@baustatik/errors` are declared in `package.json` but
  currently unused — errors are raised by `geometry-2d` and propagate through
  unchanged.

## Navigation

- [`src/types.ts`](src/types.ts): the plain `x`/`z` shapes (`Point`, `Vector`,
  `Line`, `Polyline`, `Polygon`, `BoundingBox`, `Transformable`).
- [`src/convert.ts`](src/convert.ts): the mapping to `x`/`y` in both directions,
  with the full rationale for why it is orientation-preserving. Read this first
  if you are tempted to "fix" the missing minus sign. Package-internal except
  for `normalizeAngleYZ`.
- [`src/line.ts`](src/line.ts): `Line`, including `frame` / `toLocal` /
  `toGlobal`.
- [`src/vector.ts`](src/vector.ts): `Vector`. `add`, `subtract`, `scale`,
  `negate`, `dot` and `cross` are implemented natively in `x`/`z`.
- [`src/point.ts`](src/point.ts): `Point`, fully delegated.
- [`src/index.ts`](src/index.ts): public exports — `Point`, `Vector`, `Line`,
  `LineFrame`, `normalizeAngleYZ`. Several further exports are present but
  commented out (see Known constraints).
- [`tests/vector.test.ts`](tests/vector.test.ts): pins the rotation sense. The
  most important test file in the package.
- [`tests/line.test.ts`](tests/line.test.ts): the beam frame, plus the tripwire
  that compares `frame` against the delegated `normalVector`.

## Invariants and conventions

- **`z` points downwards.** This matches `fem-loads` and `fem-element`: a
  downward load has positive `z`. It is the reason this package exists.
- **Positive rotation takes `+x` to `+z`.** Same convention as
  `fem-element/CONTEXT.md` (`theta = dw/dx`). Concretely: `Vector.angle` is
  `atan2(dz, dx)`, so a beam falling to the lower right has `α = +45°`, and
  `cos α = Δx/L`, `sin α = Δz/L` hold as `fem-loads` and `fem-load-resolve`
  assume.
- **The mapping to `geometry-2d` is `y := z` with no sign change.** This looks
  wrong at first — `y` points up, `z` points down — and the package was
  originally written with `y = −z` for exactly that reason. It is nonetheless
  the correct mapping, because `geometry-2d` never renders anything: "y is up"
  appears nowhere in its code. What its code _does_ encode is an orientation
  convention — `perpendicular(v) = (−dy, dx)`, `angle(v) = atan2(dy, dx)`,
  i.e. _positive rotation takes the first axis to the second_ — and that is
  structurally identical to the `+x → +z` convention above. Hence `x↔x`, `z↔y`
  without a minus.
- **Why the mirror was removed.** A reflection `M = diag(1,−1)` conjugates a
  rotation into its inverse: `M·P·M = P⁻¹`. Every delegated orientation-bearing
  operation — `Vector.perpendicular`, `rotate`, `angle`, `Line.normalVector`,
  `Line.parallel` — therefore came back reversed, while `dot` and `distance`
  stayed correct because `M·M = I`. The result was right magnitudes with wrong
  signs on transverse quantities: a silent error class, and the worst kind in
  structural analysis. With the identity mapping every operation agrees with the
  convention above and no consumer has to remember an inversion.
- **The `x`/`y` intermediate world is never drawn.** Inside a single operation a
  beam falling to the lower right does appear as rising to the upper right. That
  is irrelevant — the only thing that matters is what comes back in `x`/`z`. The
  benefit of the conversion is purely type-level: `Point{x,z}` and `Point{x,y}`
  stay distinguishable so the two worlds cannot be mixed up accidentally.
- **Beam direction is node order, and node order fixes local `z`.** `ex` runs
  from the start node to the end node, so entering the same physical beam the
  other way round reverses _both_ local axes: left → right gives `ez = (0, 1)`,
  local `z` pointing downwards; right → left gives `ez = (0, −1)`, local `z`
  pointing upwards. That is the convention and not a defect — reversing a beam's
  local transverse direction means reversing its node order. Everything
  downstream inherits it from this one basis: `frame: 'local'` loads in
  `fem-load-resolve`, the 6×6 DOF transformation in `fem-solver`, and the signs
  of the local results. Pinned in `tests/line.test.ts`.
- **`Line.frame` is the authoritative definition of the local beam axes, and is
  deliberately not delegated.** It returns `ex` (start node → end node) and
  `ez`, with `ex = (cos α, sin α)` implying `ez = (−sin α, cos α)`. That equals
  `Line.normalVector` today, and `tests/line.test.ts` asserts exactly that —
  which is the point: `frame` computes natively in `x`/`z` while `normalVector`
  delegates, so the assertion is a tripwire on the orientation of
  `src/convert.ts`. If `frame` delegated too, a reintroduced mirror would flip
  both sides at once and pass unnoticed.
- **`Line.toLocal` / `toGlobal` decompose along that basis using dot products
  only** — no angle, no rotation matrix, no `atan2`, and therefore no sign
  derivation at the call site. This is what `fem-load-resolve` should use for
  the global → local rotation of beam loads instead of building `cos α`/`sin α`
  itself.

## Validation

```text
pnpm --filter @baustatik/fem-geometry typecheck
pnpm --filter @baustatik/fem-geometry test
pnpm --filter @baustatik/fem-geometry lint
```

Pure functions without Konva/DOM/WASM, testable in Node.

## Known constraints

- **`src/index.ts` exports less than the package contains.** `Polygon` and
  `Polyline` have no `x`/`z` wrapper at all, and the re-exports of the
  `geometry-2d` error classes and of `BoundingBox` / `Transformable` are present
  but commented out. Consumers that need to catch e.g. `DegenerateVectorError`
  must import it from `@baustatik/geometry-2d` directly, which couples them to
  the underlying package.
- **`Arc` is not wrapped.** Its `sweep` carries an orientation, so a wrapper
  would need the same scrutiny as the operations above rather than a
  pass-through.
- **`normalizeAngleYZ` is just a `[0, 2π)` normalisation** (`src/convert.ts`).
  With the orientation-preserving mapping that is now the whole job — the name
  no longer promises more than it does, but it also carries no `x`/`z`-specific
  logic and could be replaced by a shared helper.
