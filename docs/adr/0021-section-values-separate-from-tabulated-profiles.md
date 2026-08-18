# Section values are computed; tabulated profiles are not

`@baustatik/steel-profiles` holds the table. `@baustatik/cross-section` holds
the arithmetic. The boundary between them is not a size decision — it is the
line between **read** and **derived**.

## Why the table gets its own package

> `Iy` of an IPE 300 is 8356 cm⁴ because the standard says so.

The number accounts for the root fillets and it is rounded to four significant
digits. It is *not* the output of anyone's integrator, and it must not become
one. If the integrator lived next to the table, sooner or later someone would
"fix" a table entry because the recomputation came out 0.3 % different — and the
catalogue would stop being a catalogue.

Two packages make that mistake impossible to make quietly: a change to
`steel-profiles/src/data/ipe.ts` is a change to vendored data, visible as such in
the diff.

The table is a leaf with **no dependencies at all**, not even
`@baustatik/errors`: `lookupProfile` returns `undefined` rather than throwing,
so there is nothing to import. Same shape as `@baustatik/actions`
([ADR 0015](0015-action-categories-live-in-a-leaf-package.md)).

## Units stay as the standard prints them

`steel-profiles` carries mm, cm², cm⁴, cm⁶. Not SI.

The reason is checkability: `Iy: 8356` can be diffed against the printed table,
`8.356e-5` cannot. Conversion to metres happens at **exactly one** place, the
profile mapping in `cross-section`, and that place is a dozen lines with a test
per factor.

## `Az`, not `Av,z` — and it costs a third of the shear stiffness

The printed table lists three shear areas side by side for IPE 80, and they are not
interchangeable:

| | IPE 80 | meaning | used for |
| --- | --- | --- | --- |
| `Az` | 2.69 cm² | shear energy | **deformation** — our column |
| `Av,z` | 3.57 cm² | EN 1993-1-1 §6.2.6 | resistance |
| `Apl,z` | 2.84 cm² | plastic | ultimate load |

The catalogue carries **only** `Ay`/`Az`. `Av` and `Apl` are deliberately
absent: next to `Az` they are an invitation to reach for the wrong one, and the
wrong one makes the member 33 % too stiff without a single computation
complaining. A test in `steel-profiles` states the difference explicitly and
fails if `κ` ever lands near `Av,z/A = 0.467`.

`Ay`/`Az` are **optional**. A later series without tabulated shear areas
computes shear-rigid rather than having an approximation invented for it here.

## κ has one definition: the shear energy

> **`A_s = I² / ∫ (S/t)² dA`**, and `κ = A_s / A`.

One definition for every shape — no `5/6` here, `A_web/A` there, `2·h·t/A`
somewhere else. The integral runs along the **wall shear-flow path**
(`dA = t·ds`), not over area cuts. For a rectangle the two coincide; for an
I-section they differ by 11 %.

Checked against all 42 catalogue profiles, using the profile's dimensions in the
welded (`thin-walled`) shape:

| definition | `Ay` | `Az` |
| --- | --- | --- |
| `A_web/A` | — | 1.7 % off, no derivation behind it |
| energy over **area cuts** `I²/∫(S/b)²dA` | 0.3 % ✓ | **11 % off** |
| energy over the **wall shear flow** `I²/∮(S²/t)ds` | **0.0–0.33 %** ✓ | 3.5–6.2 %, systematically one-sided |

The third row is what the code computes. The residual gap in `Az` is the missing
fillet: that material sits at the web-to-flange transition, where it contributes
a lot to `Vz` and almost nothing to `Vy` — and the deviation is negative for
**every one** of the 42 profiles. A tolerance test would prove nothing; the
one-sidedness is the evidence that we compute the same definition the reference does.

For a rectangle the definition yields **exactly 5/6**. The value appears nowhere
in the source; that it comes out is the test that the definition is right.

There is **no quadrature in `src/`**: `S` is quadratic on each segment, `S²`
quartic, and the integral is closed-form. The numerical integration lives in the
test as an independent oracle for the eight derivations.

## `idealisation` is an input, not a property of the shape

A T-section is compact as reinforced concrete and thin-walled as a welded steel
member: **the same four numbers, two different κ.** At IPE-80 dimensions,
`solid → 0.401` and `thin-walled → 0.340` (catalogue 0.352; the difference is
the fillet). Eighteen percent, and nothing in the result shows which one was
used.

So it is a **required field with no default**. A default would be the one
decision nobody would ever revisit, in the one place where being wrong is
invisible.

`rectangle` carries no `idealisation` — a thin-walled solid rectangle does not
exist.

**Known gap:** today the idealisation reaches exactly one quantity, κ. `A`,
`Iy`, `Iz`, `Iyz`, `ys` and `zs` are computed exactly from the outline in both
cases, because closed formulas are available and the classical thin-walled
approximation buys nothing. With `It` it comes back, and there the two readings
are three orders of magnitude apart.

## What neither package may know

Neither `steel-profiles` nor `cross-section` may know `fy`. The boundary is
mechanically checkable:

> No symbol in `cross-section` knows a **section force** or a **strength**.

That is why `normalStress`/`shearStress` do not exist here: they take `N`, `My`,
`Vz`. They belong to the later EN 1993 package, together with cross-section
class, `Npl,d`/`Vpl,d`/`Mpl,d` and the buckling curves.
