# The wall path is positioned — and it stops at one cell

The first P5 decision. You look this one up when a drawn steel section finally
computes shear-flexible, when the gate warns about cells you did not know your
figure had, or when you wonder why `It` is there for one drawn box and
`undefined` for the next.

> **`Segment` is the positioned path piece: start point, direction, length, `t`,
> wall id — and no `S`. On it, open profiles and sections with exactly **one**
> closed cell yield κ, the shear centre and `It`. Two cells do not.**

This extends [ADR 0030](0030-the-section-editor-stores-a-wall-graph.md) and
[ADR 0035](0035-the-editor-section-yields-values-without-kappa.md); the storage
form, the outline derivation and the winding rule are untouched. Which of the
two figures carries which number is a separate decision,
[ADR 0041](0041-two-figures-for-the-wall-path.md).

## The gap this closes

ADR 0035 gave the drawn cross-section `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` and the
principal axes — everything Green reads off the carried outline. Everything that
needs a **path along the wall centrelines** was left out, and the consequences
were not cosmetic:

- The editor returned `GAs: 'rigid'` for every drawn section, so a shear-flexible
  frame silently computed stiffer than the model asked for.
- `validateSectionProperties` reported `ShearCentreUnknownWarning` on **every**
  drawn cross-section. A finding that always fires is a finding nobody reads.
- The torsion warning of [ADR 0031](0031-the-cross-section-plane.md) could not
  even be phrased: there was no `It`.

## 1 · `Segment` is positioned, and it carries no `S`

The word has been reserved since ADR 0030 and `packages/TODO.md` §5. It is now
spent on exactly what was promised:

```ts
type Segment = {
  readonly y: number; readonly z: number;   // start point
  readonly dy: number; readonly dz: number; // unit direction
  readonly length: number;
  readonly t: number;
  readonly wallId: string;
};
```

**No `S` in it**, and that is the load-bearing part. `Sy` and `Sz` are two
differently parameterised runs over the *same* geometry — one accumulates the
lever arm in `z`, the other in `y`. Put `S` into the segment and a figure needs
two lists, whose stations then have to be correlated. That correlation is the
double language ADR 0030 argues against; here it simply does not arise.

`ShearFlowInterval` (`src/shear.ts`) stays exactly as it was, as the **derived
energy form**, and `shearArea` remains the one place where a path becomes a
number. Nothing in that file changed for P5.

## 2 · Arcs are discretised before the path

`Bulge.toPolyline` under `policy.arcTolerance`, the same model assumption P2 and
P3 already make — not a second one. Every `Segment` is therefore straight,
`S(s)` on it is quadratic, and `shearFlowIntegral` is digit for digit the
existing function.

The closed-form treatment of a circular arc stays **additively retrofittable**:
it would replace the decomposition inside `segments`, not the type. Nothing
above it would move.

This is the one place where `sectionProperties` reads the policy, and the
parameter is therefore **optional** with `DEFAULT_SECTION_POLICY` behind it.
That is a knowing deviation from
[ADR 0011](0011-analysis-settings-split-into-versioned-policy-and-ports.md) —
the calculation path otherwise reads the *carried* outline and never the recipe.
It is bounded: a cross-section without an arc wall is untouched by the number,
because `Bulge.toPolyline` returns `[p1, p2]` for a straight edge whatever
tolerance stands next to it. A caller that holds the record's policy passes it
in and gets the same decomposition the outline was built under.

**Optional does not mean absent on the calculation path.** `SectionModel` in
`@baustatik/fem-section-resolve` carries `sectionPolicy` as a **mandatory**
field and hands it in; the snapshot has carried it since `schemaVersion: 7`, so
it is there where that adapter stands. Substituting the default there would
discretise the *path* finer or coarser than the *carried outline* `I` falls
out of — two discretisations of one figure, and the difference would sit
silently in κ. The default is for the occasional caller asking about a
catalogue profile or a parametric shape; neither ever sees the number.

## 3 · One cell yes, two cells no

`cells = E − V + C` over the **run** decomposition (`branches`), which already
drops degenerate walls. The cyclomatic number is insensitive to subdividing an
edge, so counting over runs and counting over walls give the same answer — and
the gate and the wall path then read *one* decomposition instead of two.

- **`0` cells** — tree traversal from the free ends. A run is only left once
  everything else at its start node has arrived, so `S` there is the sum of the
  incoming flows, and at a free end it is `0`. No special case.
- **`1` cell** — the cell is **cut** by duplicating its first node: the first
  cell run then hangs on a degree-1 node, the figure is a tree again, and one
  scalar compatibility equation gives back what the cut removed:

  ```text
  S₀ = − ∮(S_open/t) ds / ∮(ds/t)
  ```

  The trick that holds the whole scaffold together: on the cell segments `S₀` is
  a **constant addend on `c0`**. `ShearFlowInterval` and `shearArea` therefore
  need no change at all.

- **`≥ 2` cells, or more than one component** — κ, `yM`/`zM` and `It` stay
  `undefined`, and the gate says so with `MultipleCellsWarning` /
  `DisconnectedWallGraphWarning`.

Two cells are not "one more of the same": they are `n` coupled unknowns, hence a
linear system. That is a different undertaking, and it should not hide behind a
number that looks plausible.

## 4 · Signs and reproducibility are written down

Not left to whichever traversal the code happens to produce:

- The cell is walked in the sense `signedArea > 0`
  ([ADR 0034](0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)),
  so the input order of the walls cannot flip `A_m` and with it `It`.
- The lever arm `r = y·dz − z·dy` turns positive from `+y` to `+z`
  (ADR 0031). On a straight segment it is constant — `(p + s·u) × u = p × u` —
  so `∫S·r ds` is `r · ∫S ds` and not a second quadrature.
- The cut edge is the cell run carrying the **smallest wall id**. Before the
  first step the traversal has reached nothing, so every cell run is tied — and
  a tie is decided by the id, not by the position in the input array. Array
  order would make the same figure with a rotated wall list cut somewhere else.
  Where the cell is cut does not change the result; `WallPath.cutWallId` names
  the place, and two tests pin both — the choice and its irrelevance.

## 5 · The bound: `thickWallRatio`, two formulas, one number

```text
open   run:  t / L        L = length of the centreline
closed run:  t / √A_m     A_m = area enclosed by the centreline
```

The closed run has no length to measure against — its path closes — and its
perimeter grows with every indentation at constant area. `√A_m` is the one
length that names its size. Default `1/3`, deliberately generous: the literature
puts "thin-walled" between `1/10` and `1/5`, and the warning should catch the
case where the theory is *wrong*, not merely imprecise. Measured at both ends:
QRO 60×6,3 comes to `0,117` and stays silent, a box `100×100` with `t = 30` to
`0,43` and speaks up.

**Both new policy fields are judging fields.** `thickWallRatio` and
`shearCentreTolerance` do not change the stored outline, they judge it — they
stand next to `principalAxisTolerance`, not next to `arcTolerance`/`miterLimit`.
That distinction is written into the policy's JSDoc so the type does not
gradually become a collection point.

## 6 · The catalogue is not an oracle for `It`

Deliberately, and it is worth saying because it looks like the obvious check.
The wall graph of an IPE 300 gives `15,70 cm⁴` against a tabulated `20,12` — the
difference is the root fillet, which a centreline model does not have. Every
proof stone therefore stands on a closed-form expression of a parametric shape
or on a hand formula:

| Proof stone | Sharpness |
| --- | --- |
| κ of the I and T wall graph against `iSymmetric`/`tSection` | floating-point noise |
| κ of the box wall graph against `closedBoxPath` | floating-point noise — two independent paths |
| `zM` of the T graph | **exactly** `hf/2` |
| `yM` of the U graph against `e = b²h²tf/(4Iy)` | hand formula |
| `It` open: convergence against `⅓bt³(1 − 0,63·t/b + …)` | over three decades |
| `It` cell against `hollowRectangle` | **exact** |
| `It` cell + branch against cell alone | difference **exactly** `⅓l·t³` |
| cut-location independence, winding independence of `yM` | floating-point noise |
| `closingMoment` over the whole path | 0 to noise |

`profileProperties` passes `profile.It` **through** from the table, for the same
reason `A` and `Iy` come from it: the rolled profile has a fillet, and it tells
in `It` more than anywhere else.

## Consequences

- `SectionProperties` gains `It?` [m⁴]; `undefined` means *not determined*,
  after the pattern of `kappaY?`. Every solid cross-section keeps it `undefined`
  — there `It` is the solution of a boundary-value problem, and between the two
  admissible formulas lie three orders of magnitude.
- Each parametric shape writes its closed-form `It` for `thin-walled`; those
  expressions are the **oracles** for the computed path, not convenience.
- `t-section` gets `zM = hf/2` instead of `undefined` for `thin-walled`: in the
  centreline model the two lines meet in one point, every run has lever arm 0
  about it, so the shear-flow moment vanishes. `ShearCentreUnknownWarning`
  stops firing on every T.
- `SectionPolicy` gains `thickWallRatio` and `shearCentreTolerance`, both
  mandatory without a default; `schemaVersion` in `@baustatik/script` goes
  `9 → 10` with no migration routine
  ([ADR 0036](0036-release-policy-before-the-first-consumer.md): there are no
  consumers).
- The second copy of `outgoingTangent` in `validate.ts` is gone; the gate reads
  the one in `branch.ts`, and degenerate walls now drop out of the kink check in
  the same function they drop out of everywhere else.
- Recorded as `patch` per ADR 0036, with the schema break in the changeset body.

## What this decision does not do

No solver for multi-cell sections (P6). No Grashof for solid cross-sections
(P4), so `kind: 'outline'` and `midline` + `solid` get nothing from P5 —
`idealisation` switches the **wall path**, not the topology
([ADR 0029](0029-stress-points-follow-the-idealisation.md)). No warping
constant. No stress points from the wall path; they still come from their
templates. No closed form for arcs, and no change to `ShearFlowInterval`,
`shearArea` or any existing shape value.
