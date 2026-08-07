# Stress points follow the idealisation

Extends [ADR 0022](0022-stress-points-are-computed-from-a-template.md), which
decided *that* stress points are computed from a template. This one decides
*which* template: the one `idealisation` already selects for κ.

> **The same question must not have two machines.** "How does the shear flow"
> is one question. `idealisation` answers it for κ **and** for the stress
> points, or for neither.

## The contradiction this removes

The package carried **two independent shear models**, and `idealisation` steered
only one of them.

- `src/shear.ts` and the `pathY`/`pathZ` of `ShapeResult` are the **wall model**.
  `i-symmetric.ts` and `t-section.ts` switch between band cuts (`solid`) and the
  wall path (`thin-walled`) — for κ.
- `src/stress-points/outline.ts` is a **second** `S` machine, one band per
  height, and `stress-points/index.ts` branched **exclusively** on `shape.kind`.
  `idealisation` did not appear in it at all.

The result was demonstrable, not theoretical. An `i-symmetric` with
`idealisation: 'thin-walled'` and IPE 80 dimensions got

- its κ from the wall path, whose `Sy,max` is **11.60 cm³** (catalogue: 11.61),
- a stress point at the centroid from the band machine reading **11.25 cm³** —
  exactly the value the comment two files away rejects as "wide of the mark".

Two answers to one number, in one cross-section. On top of that the flange
points carried `t = b` instead of `t = tf`: the *vertical* shear component
through the whole flange, which at a thin-walled flange means nothing — the flow
runs *along* the wall and divides by `tf`.

## Why this was cheap to fix

Because the right template already existed. `stress-points/rolled-i.ts` is not a
band model at the flange; it is already the wall model — `t = tf`, and its lever
arm `zf = (h − tf)/2` sits on the **centre line**. Its `halfFlangeMoment` is
term-for-term what `crossWallInterval(−zf, tf, b/2)` computes for κ. It is
validated against 546 RSTAB points; it was simply **not reachable from the
parametric branch**.

So the work was not "a model is missing" but "the model we have is not
connected in one place".

## Which template answers where

| shape | `solid` | `thin-walled` |
| --- | --- | --- |
| `rectangle` | band machine | — (carries no `idealisation`) |
| `i-symmetric` | band machine | **wall model** |
| `t-section` | band machine | **wall model** |
| `hollow-rectangle` | `undefined` | `undefined` |

**`solid` keeps the band machine, and that is not a stopgap.** Grashof *is*
right for solid sections; the rectangle parabola falls straight out of it.

**The closed box stays `undefined`, with a sharper reason than before.** It is
not the theory that is missing — `closedBoxPath` in `hollow-rectangle.ts` has
the circumferential path already, and κ falls out of it. What is missing is the
**reference data**. A template with nothing to check it against is guessed, not
computed.

## The oracle: `r = 0`

A **welded** I with no fillet *is* the rolled profile with `r = 0`. So

```
iSymmetricThinPoints(h, b, tw, tf) ≡ rolledIStressPoints({ h, b, tw, tf, r: 0 })
```

at the shared stations. This inherits the validity of the 546 validated points
and costs no new fixture — it is the reference that `CONTEXT.md` demands of
every template.

**The oracle holds at the 14 flange stations, and not at the centroid.** That
boundary is the substance of this decision, not a caveat on it:

- At the **flange**, `rolled-i.ts` is the wall model, and none of its flange
  quantities contains a fillet term at all. The agreement there is exact to
  floating-point noise — the two sides only bracket the same product
  differently.
- At the **web**, `rolled-i.ts` is the outline: its web runs the **clear** height
  `h/2 − tf`, while the wall model runs centre-line to centre-line (`±zf`). For
  IPE 80 that is 11.25 against 11.60 cm³.

Neither number is wrong; they belong to two idealisations. The centroid
therefore gets its own reference, the catalogue's `Sy,max` — 11.60 against
11.61, the remaining 0.05 % being the fillet the welded shape does not have.
Across the whole catalogue the wall model lands **below** the table every time,
by 0.05 % (IPE 80) to 4.6 % (HEA 260). Same signature as κ, where `Az` is also
always too small: the HEA series has the fattest fillets relative to its web.

## The T-section's two centroids

For the unsymmetric shape the wall model has a different area than the outline —
the web reaches to the flange centre line — so its centroid sits elsewhere.

- **Coordinates** are about `zs`, the centroid of the **outline**, because `A`
  and `Iy` come from the outline and σ needs the same axis.
- **`S`** is about `zsWall`, the centroid of the **wall model**, because
  otherwise the path does not close to zero at the free web end and `S` would be
  ambiguous — depending on which side you cut from.

**The offset `zs − zsWall` is this shape's approximation**, and it is recorded
rather than hidden: a characterisation test pins it with a number. It is small
(0.30 mm on a 200 mm deep welded T) and, because `S` is flat at its maximum,
costs 3·10⁻⁶ of `S`. It can change sign — for a wide flange the outline centroid
sits *above* the wall centroid — which is why the template receives `zs` and
`zsWall` separately rather than a difference with an assumed sign. For the
doubly symmetric shapes the offset is exactly zero.

## Consequences

- **`ShapeSpec.kind` `'t-beam'` becomes `'t-section'`.** The old name carried a
  *material*: the same shape is a Plattenbalken in concrete and a T-profile in
  steel, and what separates them is `idealisation`, not the shape name.
- **Breaking change to `@baustatik/script`: `schemaVersion` goes to `5`.** A v4
  snapshot is **rejected**, not rewritten, exactly as v3 is. It would be a
  two-line substitution here, and that is precisely the argument against doing
  it silently: a migration is a tool someone *invokes*, sees, and can decline.
- **κ does not move in a single digit.** `shear.ts`, the paths and κ were not
  touched; `tests/kappa.test.ts` is the safety net that says the cut was held.
- **The wall model is still written twice** — once as `ShearFlowInterval` for κ,
  once as a closed form here. A `ShearFlowInterval` is a *positionless* energy
  accumulator: `pathZ: [flangeHalf, flangeHalf, web, flangeHalf, flangeHalf]`
  uses the same object four times, so no point's location can be read back out
  of it. One path feeding both would need a start point and a direction per
  interval, and `Sy`/`Sz` would come from two differently parametrised paths
  whose stations then have to be correlated. What holds the two copies together
  meanwhile are the tests: the flange against 546 RSTAB points, the I's centroid
  against the catalogue, the T's free web end against zero.
