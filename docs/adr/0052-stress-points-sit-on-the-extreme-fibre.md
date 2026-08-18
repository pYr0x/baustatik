# Stress points sit on the extreme fibre

A stress point's `S` and `t` belong to the **cut**; its coordinate belongs to
**σ**. The two are independent, so a cut is always named at the fibre with the
largest `|z|`. The welded I and the welded T are re-laid accordingly, and both
now carry a point at the flange/web junction **in the web**.

Extends [ADR 0029](0029-stress-points-follow-the-idealisation.md) (the
idealisation steers κ *and* the stress points) and
[ADR 0022](0022-stress-points-are-computed-from-a-template.md) (they are
computed from a template, not tabulated).

## What was wrong

Both welded templates inherited their point list from the outline model, where
the natural stations are the **corners of the figure**. In the wall model the
corners are the wrong question, and two things followed from it.

**The junction cuts sat on the inner flange face.** A cut through the flange at
`y = ±tw/2` is a vertical line through the full flange thickness: `S` and `t`
are the same whether the point is named at the top or the bottom of it. Only σ
differs — and it is larger on the outer face. We were reporting the same shear
with 19 % less σ. For a welded T 200/15/10/300 under `My = 100 kNm`,
`Vz = Vy = 100 kN`:

| | σ | τ | σ_v |
| --- | --- | --- | --- |
| flange, inner face `y = ±5` (what we printed) | −125.5 | 62.9 | 166.2 |
| flange, **outer face** `y = ±5` (same cut) | −154.3 | 62.9 | **188.8** |
| flange, **outer face** `y = 0` (max `Sz`) | −154.3 | 63.7 | **189.7** |

**There was no point in the web under the flange.** τ jumps there by `tf/tw`,
because the same shear flow suddenly has to pass through the web thickness,
while `|σ|` is still nearly the edge value. With `Vy = 0` the gap stands alone —
nothing we printed came near it:

| | σ | τ | σ_v |
| --- | --- | --- | --- |
| flange, inner face `y = ±5` (our best in that region) | −125.5 | 13.1 | 127.6 |
| **web top** `(0, −65.58)`, `t = tw` | −125.5 | 41.5 | **144.6** |
| centroid | 0 | 46.5 | 80.5 |

The evidence that this is our inconsistency and not a difference of opinion:
**`rolled-i.ts` already did it this way** — five points per flange on the
outer face, two web points at the flange, centroid — and it is the template
validated against the catalogue points. The argument for dropping the inner-face
flange corners was even written down in `compact.ts`, as the reason the *rolled*
profile does not print them. It was never applied to the welded ones.

## The rule that replaces "all corners"

> A template contains every **station** at which `S` or `t` jumps or has a
> maximum — and names the coordinate there in the **extreme fibre**.

The corners are one way to reach the stations, not the definition of them. They
over-generate (the inner-face flange corners are dominated: same `y`, smaller
`|z|` than the flange tip above) and they under-generate (no outer-face junction
cut, no web point under the flange).

The station lists now live in `stress-points/open-stations.ts`, read by **both**
idealisations, so the shared numbering is a matter of construction rather than
of two lists kept in step by a test.

## The layouts

Welded I — **13 points, numbered exactly like the rolled profile**:

```
 1– 5  top flange, outer face:  -b/2, -tw/2, 0, +tw/2, +b/2
 6–10  bottom flange, outer face
11,12  web under each flange, t = tw
13     centroid, t = tw
```

Welded T — **9 points**, top to bottom:

```
1–5  flange, outer face:  -bf/2, -bw/2, 0, +bw/2, +bf/2
6    web under the flange, t = bw
7    centroid
8,9  free web end, ±bw/2   (two, because Mz does something there
                            and there is no flange tip to catch it)
```

At the junction point the severed part is **exactly the flange**. Walking the
web path to that height would count the piece between the flange mid-line and
the flange underside twice — the same corner defect that
[ADR 0051](0051-the-closed-box-tiles-the-outline-figure.md) called `t³/8` on the
box.

## What this buys

The welded I and the rolled profile now agree **number for number at points 1
through 12**, to the last bit, at `r = 0` — where before they needed a
translation table and only twelve of fifteen points could be compared at all.
Point 13 is the one deliberate difference: the centroid value comes from the
wall model (11.60 cm³ for IPE 80 against the catalogue's 11.61) rather than the
clear web height (11.25), per ADR 0029.

> **Later:** that last sentence is withdrawn.
> [ADR 0053](0053-the-stress-point-walls-tile-the-outline.md) found the 11.60 to
> be a coincidence — the catalogue's 11.61 belongs to the *rolled* profile,
> whose fillets contribute 0.361 cm³, while the centre-line model's double-count
> contributes 0.357. The welded I's value is 11.25, and the agreement with
> `rolled-i.ts` now covers **all thirteen** points.

## What this does not touch

- **The outline model's numbers.** `Sy` and `t` still come from `z` alone, `Sz`
  from `y` alone. The new list still contains every z-station and every
  y-station, so nothing is lost there; the dropped corners contributed no
  station of their own. Their `Sy`/`t` combination at a flange-tip coordinate
  was in fact spurious — the narrow cut at the flange underside does not run
  out to the flange tip.
- **`S` itself.** Not one formula changed. The junction cuts carry the values
  they always carried; they are simply named 15 mm higher.
- **The box.** `hollow-stations.ts` is untouched: a closed section has no free
  edge, its stations come from symmetry, and its outer corners already sat on
  the extreme fibre.
- **The rolled profile.** It was already right; it is now the pattern.
