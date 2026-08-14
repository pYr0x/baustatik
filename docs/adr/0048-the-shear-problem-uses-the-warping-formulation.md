# The shear problem uses the warping formulation

The shear boundary-value problem of `@baustatik/cross-section-fe` is solved for a
**displacement** `ψ`, not for a stress function `Φ`. The refusal
`reason: 'hole-off-bending-axis'` is gone, without replacement, together with
everything that produced it.

**This amends [ADR 0045](0045-solid-section-values-are-nu-free-coefficients.md)
on that one point only.** The coefficient form `1/κ = d0 + d2·m²`, the ν-freedom
of the stored record, Trefftz over Weber for the shear centre, and the
material-free set all stand unchanged. `disconnected-areas` also stands — that is
a statement about the frame model, not about the formulation.

Evidence:
[`docs/messungen/verwoelbung-gegen-dirichlet.md`](../messungen/verwoelbung-gegen-dirichlet.md),
produced by
[`verifaction/verwoelbung-gegen-dirichlet.mjs`](../../verifaction/verwoelbung-gegen-dirichlet.mjs).

## The limit was a property of the formulation, not of the figure

For `Qz = 1` in principal, centroidal axes the problem is, in any formulation:

```text
Gleichgewicht:    ∂τ_y/∂y + ∂τ_z/∂z = −z/Iy
Verträglichkeit:  ∂τ_z/∂y − ∂τ_y/∂z = m·y/Iy          m = ν/(1+ν)
Rand:             τ_y·n_y + τ_z·n_z = 0     auf ALLEN Schleifen
```

The previous solution set `τ_y = ∂Φ/∂z`, `τ_z = −∂Φ/∂y − z²/(2·Iy)` with
`∇²Φ = −m·y/Iy`. That fixes `Φ` only *along* each boundary loop; per loop a
constant stays open, and the boundary datum has to close on the way round:

```text
∮ dΦ = −1/(2·Iy) ∮ z² dy = ∓(1/Iy)·∫∫_D z dA
```

The jump is the first moment of the enclosed area about the bending axis. It
vanishes **only** when the centroid of every hole lies on that axis. Otherwise
`Φ` is multi-valued and cannot be carried by an FE field at all — so the code
refused, and since both reference frames are checked, eccentricity in **one**
direction was enough.

**A displacement has no such condition.** `ψ` is single-valued on any domain,
holes or not. This is not a new argument: it is the reason the torsion problem
has always run this way (`torsion.ts`), and the reason `It` was never touched by
the refusal. For the shear problem the question was simply never asked — the
Dirichlet version came from the original specification and was calibrated in
`verifaction/nu-koeffizientenform.mjs` before the hole limit had been found at
all.

## The derivation

Write `τ = ∇ψ + p`. Because `rot(∇ψ) = 0`, all vorticity sits in `p`; because
`div(∇ψ) = ∇²ψ`, how much of the *source* `p` carries is a free choice. Taking
**both**:

```text
p = ( 0 , −z²/(2·Iy) + m·y²/(2·Iy) )

  div p = ∂p_z/∂z = −z/Iy          ✓
  rot p = ∂p_z/∂y =  m·y/Iy        ✓
```

leaves `∇²ψ = 0` and pushes everything onto the boundary. Split `ψ = ψ₀ + m·ψ₁`:

| | Quelle | Rand |
| --- | --- | --- |
| `ψ₀` | `∇²ψ₀ = 0` | `∂ψ₀/∂n = +z²/(2·Iy)·n_z` |
| `ψ₁` | `∇²ψ₁ = 0` | `∂ψ₁/∂n = −y²/(2·Iy)·n_z` |

and the stress field stays affine in `m`, exactly as before:

```text
τ_a = ( ∂ψ₀/∂y , ∂ψ₀/∂z − z²/(2·Iy) )
τ_b = ( ∂ψ₁/∂y , ∂ψ₁/∂z + y²/(2·Iy) )
```

Both right-hand sides are pure boundary integrals. With the normal convention of
`prepare.ts` (`n = (dz, −dy)/L`, `ds = L·dt`, so `n_z·ds = −dy`, and the edge
length cancels):

```text
ψ₀:  rhs_i = ∮ −z²/(2·Iy)·N_i dy
ψ₁:  rhs_i = ∮ +y²/(2·Iy)·N_i dy
```

## Why the hole limit disappears

A Neumann problem is compatible when `∫f dA = ∮g ds`. That is one condition over
the **whole** boundary, not one per loop — precisely because `ψ` is single-valued
and no per-loop constant is being determined:

| | Volumen | Rand | schließt? |
| --- | --- | --- | --- |
| `ψ₀` | `∫0 dA = 0` | `−∮ z²/(2·Iy) dy = (1/Iy)·∫∫ z dA = 0` | Schwerpunkt |
| `ψ₁` | `∫0 dA = 0` | `∮ y²/(2·Iy) dy = 0` | exaktes Differential |

`∮y²dy = 0` holds on **every** closed curve, because `y²dy` is an exact
differential. No centroid appears in it, no bending axis, and no hole position.

The `ψ₀` condition is the *same integral* that used to be the hole limit — but
taken over the whole boundary it is just the statement that the coordinates are
centroidal, which `prepare.ts` establishes by construction. Split per loop it was
a condition on the figure; taken whole it is a condition on nothing.

## Why `p` carries the source as well

Leaving the source in the volume — `∇²ψ₀ = −z/Iy` with `∂ψ₀/∂n = 0` — is equally
exact and removes the hole limit just as completely. It was the first candidate,
and it was **measured and rejected**.

For the rectangle at `m = 0` the closed solution is Jourawski's parabola
`τ_z = (h²/8 − z²/2)/Iy`. With the source in the volume that parabola has to come
out of `∇ψ₀`, so `ψ₀ = (h²z/8 − z³/6)/Iy` — **cubic**, and a Tri6 field carries
only the quadratic part. With the source in `p` the algebraic term stands exactly
in the integrand and `ψ₀ = h²z/(8·Iy)` is **linear**, which Tri6 carries exactly:

| | `\|d0/1,2 − 1\|` | Feldabstand gegen Dirichlet bei ν = 0 |
| --- | --- | --- |
| Quelle im Volumen | `4,2·10⁻⁹` | `max 5,0·10⁻⁴`, `L2 1,5·10⁻⁴` |
| Quelle in `p` | `3,0·10⁻¹²` | `max 2,3·10⁻¹⁰`, `L2 4,1·10⁻¹²` |

`κ = 0,833333333333` on twelve digits is the sharpest number in this repository
and the only place an FE result is pinned that far. Four orders of magnitude is
not a rounding preference.

## What this costs

**`d₁ = 2·A·E01` is no longer machine-zero.** It is still provably zero — `τ_a`
is curl-free, `τ_b` is divergence-free with vanishing normal component, so
`∫τ_a·τ_b dA = 0` after integrating by parts — but that is a statement about the
*continuous* fields. Under the Dirichlet version `τ_b` was the exact discrete
rotation of a gradient with `Φ_b = 0` on the boundary, and the integral fell out
at `10⁻¹⁶` structurally. Now it converges instead, at roughly `O(h³)`:

| Elemente | `d1RatioZ` | `d1RatioY` |
| --- | --- | --- |
| 2 352 | `4,3·10⁻⁹` | `2,1·10⁻⁷` |
| 9 301 | `1,8·10⁻¹⁰` | `7,6·10⁻⁹` |
| 37 226 | `1,5·10⁻¹¹` | `3,8·10⁻¹⁰` |

**That is a gain.** A quantity that is zero by construction tests nothing; one
that runs to zero tests the field. The oracle threshold moved from `1e-9` to
`1e-7` to say so honestly.

## What this buys

- **One matrix instead of two.** Both boundary-value problems are pure Neumann,
  so torsion and shear share the stiffness matrix and the factorization: five
  right-hand sides on one decomposition, where it used to be two assemblies, two
  factorizations and `4 + h` columns.
- **The machinery behind the refusal is gone**, not disabled: per-loop boundary
  datum, Dirichlet lift, hole indicator fields, the capacitance matrix, the dense
  `h × h` system, the closure check. `assemble.ts` 419 → 277 lines, `compute.ts`
  445 → 212.
- **`FEResult.shear` is no longer optional**, and `computeFESectionValues` can
  only refuse *before* meshing.
- **A figure that used to have no answer now has one.** Box 200 × 400 with a
  60 × 120 hole at `z = 210` returns `status: 'computed'`, and κ and `yM` run
  continuously as the hole moves off the axis — the case for which no closed
  oracle exists, and which used to jump from a number to a refusal.

## The schema tick is a real break

`@baustatik/script` goes to `schemaVersion: 12`. The union only *shrinks*, but a
v11 snapshot can carry `reason: 'hole-off-bending-axis'` and `parseFEValues` now
rejects it. That is what the fixed version number is for: silently rewriting the
value would turn a refusal into numbers nobody recomputed.

## What was checked

Both formulations were run **on the same mesh** and `τ` compared **at every Gauss
point**, over several ν — a scalar oracle can hide two sign errors against each
other, a field comparison cannot. The scalars (`d0`, `d2`, `yM`, `zM`, `It`)
agree to five to seven digits on all five figures; the field agrees to
discretisation level. At re-entrant corners `max|Δτ|` reaches 41 % while the
energy-weighted `L2` stays at 3 % — `τ` is singular there and the two
discretisations truncate the singularity differently, which is why the report
carries both measures.

The oracles that see the `m`-part of the field — circle against
Timoshenko/Goodier, half-circle against Sokolnikoff — carry the sign of the `ψ₁`
boundary term and are unchanged. `m = 0` does not see it, so the rectangle does
not either.

## Re-entrant corners are unchanged, and now measured

At a re-entrant corner — every corner of a rectangular hole, the inside corner of
an angle — `τ` is **singular in the continuous solution**. For material interior
angle `ω` the Neumann problem has exponent `λ = π/ω`; with `ω = 3π/2` that is
`ψ ~ r^(2/3)`, so `τ = ∇ψ ~ r^(−1/3) → ∞`.

**κ itself is unaffected**: it is an energy integral, and `|τ|²·dA ~ r^(−2/3)·r dr`
converges. What suffers is the *rate*: the H1 error is capped at `O(h^λ)`, the
energy error at `O(h^(2λ)) = O(h^(4/3))` instead of `O(h⁴)`.

This is **pre-existing and formulation-independent** — both candidate splittings
give identical field distances at those corners, and the Dirichlet version had it
too. It is recorded here because the same measurement run now covers it, and
because nothing else in the repository did: the mesh-independence test
(`door.test.ts`) uses the rectangle, the one figure without a singularity.

| Figur | einspringende Ecken | beobachtete `p` | erwartet |
| --- | --- | --- | --- |
| Rechteck 200 × 300 | keine | 3,77 … 3,91 | 4 |
| Kasten 200 × 400, Loch bei `z = 60` | 4 × 270° | 0,96 … 1,43 | 4/3 |
| Winkel 200 × 120 × 30 | 1 × 270° | 0,70 … 1,41 | 4/3 |

Extrapolated from the observed order, the residual in `d0` at ~149 000 elements is
`7·10⁻⁵` for both singular figures. Practically: on such a figure, quadrupling
the element count buys roughly a **halving** of the error, not the sixteen-fold
improvement the rectangle gives.

No remedy is built. Graded meshes towards the corner, a singularity element, or
extrapolation in the production code are the known routes; whether one is needed
is a separate question from this ADR.
