# `@baustatik/section-geometry`

## Purpose

Provides the 2D geometry primitives — `Point`, `Vector`, `Line`, `Arc`,
`Polyline`, `Polygon` — plus the `bulge` codec `Bulge`, in the cross-section
coordinate system: `y` to the right, `z` **downwards**. It is a thin adapter
over `@baustatik/geometry-2d`, which works in `x`/`y`. The package exists so
that the `y`/`z` convention, the rotation sense and the winding rule are defined
in exactly one place instead of being re-derived by every consumer.

Sibling package: [`@baustatik/fem-geometry`](../fem-geometry) does the same job
for the beam plane (`x`/`z`). The two share the rotation sense — see Invariants.

## Boundaries

- Owns: the `y`/`z` types, the mapping to `geometry-2d` (`src/convert.ts`), the
  rotation sense, and the polygon winding rule.
- Does not own: **section properties**. Area moments (`Iy`, `Iz`, `Iyz`),
  static moments, centroid-relative values, principal axes and section moduli
  are not computed here — this package only supplies the shapes they would be
  computed from. Also not owned: rendering, material data, and the beam plane
  (`fem-geometry`).

**`@baustatik/geometry-2d` is not imported above this package — not in tests
either.** This package *is* the pass-through into the cross-section plane; a
consumer that reaches around it for one function has already broken the rule
that the `y`/`z` convention is decided in one place. The consequence is that
every `geometry-2d` surface a consumer needs must be wrapped here, **including
the coordinate-free ones**: `normalizeAngleYZ` (`src/convert.ts`) set that
precedent, and `Bulge.sweep` / `sagitta` / `isStraight` follow it. Their JSDoc
says explicitly *why* they convert nothing, so the wrapper does not read as an
oversight. Both current consumers already obey the rule; until now it was only
visible in the dependency column.

Important consumers:
- [`@baustatik/cross-section-viewer`](../cross-section-viewer): uses `Bulge` to
  turn `Wall.bulge` into an `arcPath` spec.
- [`@baustatik/cross-section`](../cross-section): the gate's kink warning reads
  `Bulge.sweep`.
- `apps/demo/cross-section-viewer.ts`: through the viewer.

## Dependencies

- `@baustatik/geometry-2d`: the actual geometry implementation. Nearly every
  operation delegates to it through `src/convert.ts`.
- `@baustatik/core`: `atOrThrow`, used once in `src/polygon.ts`.
- `@baustatik/errors` is declared in `package.json` but unused — the error
  classes are re-exported unchanged from `geometry-2d` via `src/errors.ts`, so
  a caller can catch them without importing the underlying package (this is the
  opposite of `fem-geometry`, where those re-exports are commented out).

## Navigation

- [`src/types.ts`](src/types.ts): the plain `y`/`z` shapes and the `sweep` sign
  convention on `Arc`.
- [`src/convert.ts`](src/convert.ts): the mapping to `x`/`y` in both directions,
  with the full rationale for why it is orientation-preserving. Read this first
  if you are tempted to "fix" the missing minus sign.
- [`src/polygon.ts`](src/polygon.ts): the native `signedAreaYZ`, the winding
  rule and the `y`/`z` naming of `Polygon.moments` — the second place (after
  `convert.ts`) where a sign convention is decided.
- [`src/vector.ts`](src/vector.ts): `Vector`. `add`, `subtract`, `scale`,
  `negate`, `dot` and `cross` are implemented natively in `y`/`z`.
- [`src/line.ts`](src/line.ts), [`src/arc.ts`](src/arc.ts),
  [`src/polyline.ts`](src/polyline.ts), [`src/point.ts`](src/point.ts): thin
  delegating wrappers.
- [`src/bulge.ts`](src/bulge.ts): `Bulge`, the `bulge` ⇄ `Arc` codec. Six
  functions, all wrapped; the three coordinate-free ones are wrapped anyway —
  see Boundaries.
- [`src/errors.ts`](src/errors.ts): a pure re-export of the `geometry-2d` error
  classes. No package-own error types.
- [`tests/direction.test.ts`](tests/direction.test.ts): pins the rotation sense
  and the winding rule against each other. The most important test file.
- [`README.md`](README.md), [`docs/usage.md`](docs/usage.md): the public API
  documentation and the conventions as stated to callers.

## Invariants and conventions

- **`z` points downwards, `y` to the right.**
- **Positive rotation takes `+y` to `+z`** — clockwise as drawn, since `z`
  points down. Concretely `Vector.angle` is `atan2(dz, dy)` normalised to
  `[0, 2π)`, so `+z` (down) is `π/2` and `−z` (up) is `3π/2`; `Arc.sweep`
  follows the same sense. Rationale: the section hangs on a member, and in a
  right-handed `(x, y, z)` a rotation about the member axis `+x` takes `+y` to
  `+z`. This is the same sense `fem-geometry` uses for the beam plane
  (`+x → +z`). A section that turns the opposite way to the member it belongs to
  is a defect source with no upside.
- **The mapping to `geometry-2d` is `x := y`, `y := z` with no sign change.**
  This looks wrong at first — geometry-2d's `y` is conventionally "up" — but
  `geometry-2d` never renders anything: "y is up" appears nowhere in its code.
  What its code *does* encode is an orientation convention
  (`perpendicular(v) = (−dy, dx)`, `angle(v) = atan2(dy, dx)`, i.e. *positive
  rotation takes the first axis to the second*), which is structurally identical
  to the `+y → +z` convention above.
- **Why the mirror was removed.** The package originally mapped `y = −z` to make
  positive angles read counter-clockwise *on screen*. A reflection
  `M = diag(1,−1)` conjugates a rotation into its inverse (`M·P·M = P⁻¹`), so
  every delegated orientation-bearing operation — `perpendicular`, `rotate`,
  `angle`, `Line.normalVector`, `Line.parallel`, `Arc.sweep` — ran one way while
  the natively computed `Vector.cross` and `Polygon.signedArea` ran the other.
  That split was the actual defect; the visual convention was only its cause.
  All five now agree.
- **`Vector.cross` and `Polygon.signedArea` stay native in `y`/`z`.** Since the
  mapping is orientation-preserving they are numerically identical to their
  delegated counterparts, so this is redundancy rather than divergence — and it
  keeps the sign conventions readable where they are decided.
- **Winding: `signedArea > 0` means the ring runs in the positive rotation
  sense** (`+y → +z`) — which is exactly what `geometry-2d` calls
  counter-clockwise, since `(y, z)` is the mathematical system under a different
  name. `Polygon.make` **validates but does not rotate** (ADR 0034): the winding
  comes out the way it went in, because consumers read it as *material*
  (`> 0`) against *hole* (`< 0`). `mirror` reverses it. Only
  `intersect`/`union`/`subtract` promise a winding, and that promise sits at the
  martinez boundary in `geometry-2d`, not here.
- **`isClockwise` is `true` for `signedArea < 0`** — the same answer as
  `geometry-2d`, and the same word in both packages. It used to be `> 0` with
  the rationale "clockwise as drawn, because `z` points down"; that was a
  statement about the *drawing* in an API that never draws, and since
  `convert.ts` maps orientation-preservingly it was simply the wrong name for
  the mathematically positive sense. How it looks on screen is a footnote, not
  an API statement — the viewer layer decides where "up" is.
  `toClockwise` / `toCounterClockwise` force a specific winding and stay spelled
  out explicitly.
- **`Polygon.area` is the wrong door for a hole ring.** It returns the absolute
  value; `Polygon.signedArea` carries the sign, and `Polygon.moments` carries it
  through all six numbers.
- **`bulge` is a storage form, `Arc` is the derived one.** `bulge = tan(Δ/4)` is
  redundancy-free — it encodes an arc between two points that are already
  stored — but unreadable. `Bulge` is the pair that translates between them, and
  its signs carry through 1:1 because the mapping is orientation-preserving: a
  positive `bulge` sweeps `+y → +z`, the same sense as `Arc.sweep`.
- **The sagitta is exact, not approximated:** `h = (chord/2)·|bulge|`, from
  `c = 2R·sin(Δ/2)` and `(c/2)·tan(Δ/4) = 2R·sin²(Δ/4) = R(1 − cos(Δ/2))`. "How
  curved is this wall" is therefore answerable without trigonometry, and "when is
  an arc a straight line" collapses onto `DEFAULT_ARC_TOLERANCE` instead of
  needing a second number.
- **Asking for an arc where there is none throws.** `Bulge.toArc` /
  `Bulge.fromArc` raise `StraightBulgeError` / `FullCircleBulgeError` rather than
  returning `undefined`: the straight line is a *known* answer, not "I don't
  know". Callers that want it handled take `Bulge.toPolyline` (total) or ask
  `Bulge.isStraight`. The value range is the open interval `(−2π, +2π)` — DXF
  draws the same line, an `LWPOLYLINE` cannot carry a full circle. A tube is
  therefore **two nodes and two semicircular walls** (`Δ = ±180°`, `bulge = ±1`),
  and at a semicircle end-tangency is automatic, so the gate's kink warning stays
  silent by itself.
- **The `x`/`y` intermediate world is never drawn.** Inside a single operation
  the section appears vertically flipped. That is irrelevant — only what comes
  back in `y`/`z` matters. The benefit of the conversion is purely type-level:
  `Point{y,z}` and `Point{x,y}` stay distinguishable.

## Validation

```text
pnpm --filter @baustatik/section-geometry typecheck
pnpm --filter @baustatik/section-geometry test
pnpm --filter @baustatik/section-geometry lint
```

Pure functions without Konva/DOM/WASM, testable in Node.

## Coming role: offsetting and the drift check

The cross-section editor stores a **wall graph plus the outline it implies**
([ADR 0030](../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)). The
step from the one to the other — widening a centre line by `t/2` on both sides
and unioning the results — is an **offset**, and it lands here, together with
`deriveOutline` and `checkOutlineDrift` (P3, with `clipper2-ts`). The carried
outline is a denormalisation whose whole point is that the drift becomes a
finding instead of a silent change; this package is the place that produces the
number the finding compares against.

Two of the constraints below are on the critical path for it: boolean operations
dropping holes, and the missing hole/outer winding distinction. A hollow section
cannot be derived until both are resolved.

`DEFAULT_ARC_TOLERANCE` (re-exported here from `@baustatik/geometry-2d`) is the
**one** discretisation tolerance of the repo and the default of `Arc.toPolyline`.
It used to live at two places with two numbers. It decides how many points an
outline carries, and therefore which `A`, `Iy`, `Iz` fall out of it — pass it
explicitly wherever the result is stored.

## Known constraints

- **Boolean operations silently drop holes.** `Polygon.intersect` / `union` /
  `subtract` delegate to `geometry-2d`, whose `fromMartinez`
  (`geometry-2d/src/polygon.ts`) keeps only ring 0 of each result polygon and
  discards the inner rings. Subtracting an inner shape from an outer one
  therefore returns the outer contour with the hole **gone**, not a polygon with
  a hole. For a cross-section package this is the sharpest edge in the API:
  hollow sections cannot be built this way today. A multi-ring polygon type
  would have to come from `geometry-2d` first.
- **No hole/outer distinction in the boolean output.** `Polygon.make` no longer
  normalises (ADR 0034), so a hole ring is expressible; but the boolean
  operations still return CCW-only rings, because `fromMartinez` keeps ring 0.
  Fixing that is the point above, not this one.
- **Area moments live here, section properties do not.** `Polygon.moments`
  returns the raw, signed moments about the origin under the `y`/`z` names
  (`A`, `Sy`, `Sz`, `Iy`, `Iz`, `Iyz`) and nothing else — no centroid shift, no
  principal axes, no material. `Iyz = +∫y·z dA`, **without** negation: the
  mathematical convention that goes with `tan 2α = −2·Iyz/(Iy − Iz)` in ADR
  0031. The composition over several rings, the Steiner shift and the units are
  `@baustatik/cross-section`'s job.
- **`Arc.sweep` is where intuition and convention collide.** A caller thinking
  in drafting terms will read "positive sweep" as counter-clockwise on the page;
  here it is the opposite. This is the one API surface where the convention is
  likely to surprise, and the reason `tests/direction.test.ts` states it
  explicitly.
- **`@baustatik/errors` is an unused dependency** (see Dependencies).
