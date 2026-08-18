# Stress points are computed from a template, not tabulated

Next door in `@baustatik/steel-profiles` the rule is **"tabulated, not
recomputed"** ([ADR 0021](0021-section-values-separate-from-tabulated-profiles.md)).
Stress points break it on purpose: they are **computed** for every source,
including the rolled profiles whose table prints them.

## Why compute what the table already has

Because half the cross-sections have no table. A parametric shape — a rectangle,
a T-section a user typed in — has no printed stress points and never will.
Tabulating them would mean maintaining one source that is authoritative for
rolled profiles and empty for everything else, and every caller would have to
know which kind it was holding.

The stress points also fall out of the **same dimensions** as everything else.
`h, b, tw, tf, r` already determine `A` and `Iy`; the points cost nothing extra
once the fillet integration exists.

The check the decision buys: our computed `Sy` at the centroid must hit the
tabulated `Sy,max` — for **every** profile. It does, to 0.05 %. And
`2·Sy,max = Wpl,y` (also tabulated, also checked) says independently that the
table is true to itself. That is a stronger statement than transcription would
have been.

## The rule: corners plus the centroid

> **Every template contains at least all corners of the outline and the
> centroid.**

| shape | points | |
| --- | --- | --- |
| `rectangle` | **5** | 4 corners + centroid |
| `t-beam` | **9** | 8 corners + centroid |
| `i-symmetric` (welded) | **15** | 12 corners + centroid + 2 on the web axis `(0, ±h/2)` |
| rolled IPE/HEA | **13** | reference: 5 + 5 flange, 2 web start, 1 centroid |

A list would have been shorter to write and impossible to extend. The rule earns
its keep twice:

- **T-section with a wide flange.** The neutral axis can lie *inside the
  flange*: `bf=2.0, hf=0.2, bw=0.25, h=0.5` gives `zs = 0.1395` against
  `hf = 0.2`. "Centroid" hits that with no special case and reports `t = bf`
  there. "Mid-web" — the obvious shortcut — would have put the point in the wrong
  material.
- **Rectangle.** Four corners alone have `S = 0` everywhere. The maximum,
  `b·h²/8`, sits at half height and would simply have been missing.

**The rolled profile keeps the 13 points** and omits the flange-underside corners.
That is a *reasoned exception*, not an oversight: in a homogeneous section they
can never govern (same `y`, smaller `|z|` than the flange tip above them), and
the numbering is printed. Welded I (15) and rolled IPE (13) therefore read
differently on purpose — they are two shapes.

## The numbering is a published contract

The printed source lists "S-Punkt Nr. 1…13": 1–5 upper flange left to right, 6–10 lower
flange likewise, 11/12 web start, 13 centroid. We adopt it unchanged, and a test
pins which number sits where — written **before** the first report prints it,
because after that the mapping is outside our control.

Two sign conventions live side by side, deliberately. For the parametric shapes
`Sy`/`Sz` are the first moment of the part *above* / *left of* the point, hence
always ≤ 0. For the rolled profile we adopt the published bookkeeping, in which the
sign encodes the **direction** of the shear flow around the path. For `|τ|` the
direction is irrelevant; the convention is adopted because that is how the
numbers are printed.

`t` is the **governing** width: at a step (the flange underside) the **smaller**
of the two applies, because the shear stress jumps up there. Taking the larger
would average away the peak the point exists to report.

## Consequences

- The fillet integration is the fiddliest computation in the repository. It is
  load-bearing for `A`, `Iy` **and** the stress points, so it is checked three
  ways: `A` and `Iy` against the table (0.05 %), `Sy` at the centroid against
  `Sy,max` (0.05 %), and all 546 reference points against the fixture (0.7 %).
- **One known deviation.** At points 3 and 8 (flange centre) the reference prints up to
  2.8 % away from the closed formula for the half flange, `b/2 · tf · (h−tf)/2`.
  The same formula is right to 0.45 % at points 2 and 4, and the difference is
  neither a fixed share of the fillet nor a function of `r/tf`. A test records
  the span as a **characterisation**, so a later explanation notices if it
  changes it.
- **The fixture tolerance is 0.7 %, not the 0.3 % originally planned.** Not a
  concession about our arithmetic: the reference contradicts *itself* by up to 0.56 %
  (its stress point 13 against its own `Sy,max`, HEA 260) and prints mirror-image
  points differently (IPE 220: 119.44 against 119.73).
- **The closed box has no template yet.** `stressPoints` returns `undefined`.
  A template with no reference data to check it against is guessed, not
  computed; it arrives with the QRO data, which brings arc tangents and needs its
  own derivation anyway.
