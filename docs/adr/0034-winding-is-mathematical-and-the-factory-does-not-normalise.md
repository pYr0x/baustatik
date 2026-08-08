# The winding is mathematical, and the factory does not normalise it

The first P2 decision. You look this one up when a polygon comes back with the
opposite orientation from the one you handed in, when `isClockwise` answers the
opposite of what you remember, or when you are about to "fix" a hole ring that
keeps turning into material.

> **`signedArea > 0` is counter-clockwise, in both geometry packages and under
> the same word. `Polygon.make` validates it; it does not turn it.**

## Why now

P2 is the first place in the repo that reads the winding **as meaning**:
material against hole. Everything before it either ignored the winding or
normalised it away, so the question never had to be answered out loud.

Two things stood in the way, and both were statements the code itself did not
believe.

### `isClockwise` was describing the drawing

`section-geometry` answered `signedArea > 0` with `true`, on the grounds that
`+y → +z` is "clockwise as drawn, because `z` points down". That is a statement
about the **picture**, in an API that never draws — and since `convert.ts` maps
`x := y`, `y := z` *without a sign change*, `(y, z)` is simply the mathematical
system under a different name. `signedArea > 0` is what `geometry-2d` calls
counter-clockwise, and the two packages were giving opposite answers to the same
question.

```ts
// section-geometry/src/polygon.ts
- isClockwise: (polygon) => signedAreaYZ(polygon.points) > 0,
+ isClockwise: (polygon) => signedAreaYZ(polygon.points) < 0,   // = geometry-2d
```

How it looks on screen has not disappeared, it has **moved to where it belongs**:
a footnote in the JSDoc, not an API statement. Where "up" is on the page is the
viewer layer's answer. `Arc.sweep` is untouched and is afterwards consistent:
positive = CCW, one word in both packages.

### `Polygon.make` was normalising

In **both** geometry packages the factory silently reversed a clockwise ring.
That made a hole ring literally unconstructible — and a hole ring is exactly
what the cross-section needs. A factory that discards the only meaning-bearing
property of its input is the wrong door.

So `make` now only checks (at least 3 points) and leaves the winding alone. Two
promises that were implicitly hanging on it are handled **separately**:

| | before | after |
| --- | --- | --- |
| `mirror` | silently turned the winding back | **reverses it** — that is the truth about a reflection |
| `union`/`intersect`/`subtract` | inherited the normalisation from `make` | **`fromMartinez` normalises to CCW explicitly** |

The martinez boundary carries the reason in the code: *the winding of a foreign
library is not a statement of this package, so it is fixed at the boundary
rather than passed through.* A new martinez version would otherwise silently
flip the sign of every area behind it.

It also became **testable for the first time** that martinez copes with a
clockwise input polygon at all — before, `make` reversed it on the way in, so no
CW polygon ever reached the library. That was believed and never checked; now it
is checked.

`fromLines` inherits the change rather than keeping the normalisation
separately: leaving it in would only have moved the promise, not removed it.

## Material and hole on the `outline`

> **Material has `signedArea > 0` (CCW), a hole `< 0`.**

Holes then drop out of the Green sum through their winding alone — no special
case for the hollow concrete box, no nesting test on the calculation path.
`Polygon.moments` is signed throughout, so all six numbers add up linearly and a
hole contributes negatively on its own.

The rule is written down **numerically**, not as "CCW". In a plane with `z`
pointing down the word is ambiguous — the same sign reads "mathematically
positive" and "clockwise on screen". The sign statement is not ambiguous. The
`Ring` JSDoc, which quotes OGC / RFC 7946's "exterior CCW, holes CW", now says
the same thing in the unambiguous spelling.

`Polygon.make` and `Polygon.area` carry a warning sentence: they are the wrong
doors for a hole ring. `area` returns the absolute value; `signedArea` (and
`moments(...).A`) carries the sign.

## What the gate does with it

Reading a winding as meaning creates exactly one failure direction that breaks
the solver **silently**: a reversed outline yields a negative `A`, and
`fem-section-resolve` turns that into a negative stiffness. The system still
solves; it just answers wrongly. So:

| channel | trigger |
| --- | --- |
| `errors` | `Σ signedArea <= 0` over all rings (`NegativeOutlineAreaError`) |
| `errors` | a ring with `signedArea === 0` (`DegenerateOutlineRingError`) |
| `warnings` | a hole ring lying inside no material ring (`UnnestedHoleWarning`) |

The unnested hole **warns rather than refuses**: it is computable (it subtracts
area that is not there) and looks legitimate with two separate solid areas —
exactly the situation ADR 0032 warns about instead of rejecting.

**Explicitly not checked:** duplicate consecutive points (harmless — a duplicate
point contributes exactly zero to the shoelace sum) and **self-intersection**
(the price is real, P0 already left it open, and from P3 on Clipper2 produces
non-self-intersecting rings by construction).

## Price

Every caller who relied on `make` normalising loses that. In `src/` the count of
such callers outside the two geometry packages is **zero** — `Polygon.make` has
no production caller there at all; only `fromMartinez`, `fromLines` and the
former `fromXYPolygonNormalized` used it. In `tests/` the reliance was larger,
and those tests now state the new rule instead of the old one.

`section-geometry`'s `fromXYPolygonNormalized` is renamed to `fromXYPolygon`:
it is a plain mapper now, and the name says so.
