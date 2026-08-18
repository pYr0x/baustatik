# Stress points follow the idealisation

> **Later:** [ADR 0052](0052-stress-points-sit-on-the-extreme-fibre.md) changed
> *where* the points of the welded I and T sit — onto the flange's outer fibre,
> plus a point in the web under each flange. It did not change this decision:
> the two idealisations still read one station list, and the idealisation still
> steers κ and the stress points together.

> **Later still:** [ADR 0053](0053-the-stress-point-walls-tile-the-outline.md)
> changed *what `S` is* at those points. The thin-walled walls now **tile the
> outline figure**, so `S` is taken about the outline centroid and the T's two
> centroids collapse into one — the section "The T-section's two centroids"
> below describes a state that no longer exists. Two claims made here are
> withdrawn with it: that the wall model's 11.60 cm³ is the *right* centroid
> value for a welded I (it is 11.25; the catalogue's 11.61 belongs to the rolled
> profile and its fillets), and that the web is where the r = 0 oracle stops (it
> now holds at all thirteen points). What survives unchanged is the decision
> itself — one question, one machine — and the **κ** half of it: the shear-energy
> path keeps the centre-line development, for reasons ADR 0053 sets out with
> numbers.

> **The closed box is no longer `undefined`.** This ADR left it out for lack of
> reference data, not of theory, and said so. The data arrived — the reference
> for TO 300/200/10 and TO 400/200/10, transcribed to
> `packages/cross-section/tests/fixtures/hollow-rectangle-stress-points.json` — so the box
> now has both templates, exactly as the rule below prescribes: outline model
> for `solid`, wall model for `thin-walled`. **The decision itself is
> unchanged**; only the table row is —
> [ADR 0051](0051-the-closed-box-tiles-the-outline-figure.md) then decided *how*
> the box's wall model measures, and leaned on the rule below to move κ with it.
> Details in the package's `CONTEXT.md`.

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
validated against the catalogue points; it was simply **not reachable from the
parametric branch**.

So the work was not "a model is missing" but "the model we have is not
connected in one place".

## Which template answers where

| shape | `solid` | `thin-walled` |
| --- | --- | --- |
| `rectangle` | band machine | — (carries no `idealisation`) |
| `i-symmetric` | band machine | **wall model** |
| `t-section` | band machine | **wall model** |
| `hollow-rectangle` | `undefined`&nbsp;† | `undefined`&nbsp;† |

† Since resolved — see the note at the top: band machine and wall model.

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
meanwhile are the tests: the flange against the catalogue points, the I's centroid
against the catalogue, the T's free web end against zero.
