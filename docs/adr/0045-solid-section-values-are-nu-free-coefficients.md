# Solid-section values are ν-free coefficients

The FE values of a solid cross-section — κ, `It`, `yM`/`zM` — are computed once,
when the section is created, and stored **without ν**. The Poisson ratio enters
at the very end, in `@baustatik/fem-section-resolve`, where geometry and material
meet anyway.

`SectionProperties` therefore stays material-free, and
[ADR 0020](0020-section-properties-versus-section-stiffness.md) holds unchanged.

Evidence: [`docs/messungen/nu-abhaengigkeit-schubwerte.md`](../messungen/nu-abhaengigkeit-schubwerte.md),
produced by `verifaction/nu-koeffizientenform.mjs`, and — for multiply connected
sections — [`docs/messungen/loch-zusatzbedingung.md`](../messungen/loch-zusatzbedingung.md),
produced by `verifaction/loch-zusatzbedingung.mjs`.

## The problem this closes

A cross-section record carries no material — a beam names one. That is the
decision of [ADR 0023](0023-cross-sections-belong-to-the-model.md) and
[ADR 0026](0026-materials-belong-to-the-model.md), and it is right.

The solid-section FE breaks it in one place: κ depends on the Poisson ratio, and
ν comes from the material. Either the section learns about a material — reversing
the dependency and duplicating state — or ν has to reach the computation some
other way.

It reaches it as a *coefficient*, and the record never sees it.

## Two axes, not one

The three values were treated as one group. They are not:

| | needs the FE (async) | needs ν |
| --- | --- | --- |
| `A`, `Iy`, `Iz`, `Iyz`, `alpha`, `Iu`, `Iv`, `ys`, `zs` | no | no |
| `It` | **yes** | no |
| `yM`, `zM` | **yes** | no (see below) |
| `kappaY`, `kappaZ` | **yes** | **yes** |

**Asynchronous is not the same as material-dependent**, and `It` is the case that
proves it. Pure Saint-Venant torsion has no normal stresses at all — σx = σy =
σz = 0 — and ν is the coupling between normal strains in different directions.
There is nothing for it to couple. The problem is `∇²ω = 0` with
`∂ω/∂n = z·n_y − y·n_z`; ν appears in neither. `It` needs a mesh and a solve, and
no material whatsoever. Only `G·It` sees ν, through `G = E/(2(1+ν))`, and `G` is
already a stored field.

The shear problem is different because σx ≠ 0 there: the bending stress varies
along the beam, and its transverse contraction is exactly where ν enters.

## The substitution that makes it work

With

```text
m = ν / (1 + ν)          ν = 0 → m = 0      ν = 0,3 → m = 0,23077
```

the shear boundary-value problem for `Qz = 1` reads

```text
τ_y = ∂Φ/∂z              τ_z = −∂Φ/∂y − z²/(2·Iy)

∇²Φ = −m·y/Iy    in A
Φ   = −1/(2·Iy) ∫ z² dy  on ∂A          (Dirichlet, WITHOUT ν)
```

m stands alone in the right-hand side; the boundary term is ν-free. So
`Φ = Φ₀ + m·Φ₁`, and the stress field is affine in m. From that:

- The shear centre is a **linear** functional of τ (the moment arm of the
  resultant), hence **affine** in m.
- κ comes from the shear **energy**, a **quadratic** functional, hence `1/κ` is
  **quadratic** in m — not κ itself, and not a linear form.

```text
1/κ = d₀ + d₁·m + d₂·m²
```

Both were measured independently — for each ν the full system was assembled and
solved from scratch, and only afterwards fitted. Residuals are at rounding level
(10⁻⁹ % to 10⁻¹¹ % of the range over ν) for a rectangle, a half-disc, and an
unsymmetric angle in both principal directions. A **linear** fit of `1/κ` leaves
16 % standing, so the quadratic term is not optional.

`d₁` vanished in all four figures, to 10⁻¹³, and this is provable rather than
accidental. `d₁` is the inner product `2A·∫τ₀·τ₁ dA`, which splits into
`∫∇Φ₀·∇Φ₁ dA` and `∫z²/(2·Iy)·∂Φ₁/∂y dA`. Integrating both by parts leaves only
boundary terms carrying `Φ₁`, plus `∇²Φ₀ = 0` and `∂/∂y(z²/(2·Iy)) = 0`. Since
`Φ₁` vanishes on the boundary, `d₁ = 0` exactly — for any simply connected
section, symmetric or not, in either load direction.

The proof needs `Φ₁ = 0` on the **whole** boundary, which a hole appears to
destroy: on each inner loop k, `Φ₁` is an unknown constant `c_k₁`. It survives
anyway, and the [hole measurement](../messungen/loch-zusatzbedingung.md) confirms
it on a circular ring, on a box with an off-centre hole, and on boxes with two
and three holes. Both boundary terms still vanish, term by term:

```text
∮Φ₁·∂Φ₀/∂n ds        = Σ_k c_k₁·∮_Γk ∂Φ₀/∂n ds = 0   ← the side condition itself,
                                                        in its m⁰ part
∮z²/(2·Iy)·Φ₁·n_y ds = Σ_k c_k₁/(2·Iy)·∮_Γk z² dz = 0 ← an exact differential
```

Every summand falls away on its own, so nothing depends on the number of holes.

**Two coefficients are therefore stored, not three:** `1/κ = d₀ + d₂·m²`. `d₁` is
zero for every section this package computes — simply or multiply connected — and
a slot that is provably always zero invites the question of why it is there.
Note that `d₁` is **not** a diagnostic for a forgotten side condition: with
`c₁ = 0` forced it is zero too, while κ is 85.6 % off. The diagnostic is the
residual flux.

The proof has one precondition worth naming, because it couples the two
decisions in this ADR: the first integration by parts needs `∇²Φ₀ = 0`, which
holds for the field **without superimposed torsion** (`C = 0`). So **κ belongs to
the Weber field while `yM`/`zM` are Trefftz's.** That is not an inconsistency — κ
is an energy equivalence in the ordinary flexure problem, which is where 5/6 for
a rectangle and 1/2 for a thin tube come from, whereas the shear centre answers
where the load must act. But moving κ onto the Trefftz field would leave
`−C₀·∫Φ₁ dA` standing and bring the third coefficient back.

## Cost: one factorization, two right-hand sides

Φ₀ and Φ₁ differ only in the load vector, so the matrix is assembled and
factorized once. That is exactly what both WASM crates already offer — `n × k`
right-hand sides on one decomposition
([ADR 0042](0042-sparse-and-dense-solvers-are-separate-wasm-artifacts.md)).
Recomputing `Φ(m) = Φ₀ + m·Φ₁` reproduces ten independently solved systems to
10⁻¹⁵.

The coefficient form is therefore not a trade — it is free.

## Holes cost `h` more right-hand sides, and carry one restriction

The Dirichlet datum `dΦ/ds = −z²/(2·Iy)·dy/ds` fixes Φ **along** a boundary loop,
not on it: one constant per loop stays open. On the outer loop that constant is a
gauge and may be set to zero. On each inner loop it is a genuine unknown, fixed by
the requirement that the warping close up after a lap around the hole —
`∮_Γk ∂Φ/∂n ds = 0`, Weber's condition, the same figure as Bredt's in torsion.
So `Φ = Φ_g + m·Φ_load + Σ_k c_k·Φ_k`: `2 + h` right-hand sides on **one**
factorization plus a dense `h × h` solve, exactly the shape of ADR 0042. `It` is
untouched, because the torsion path solves for the warping function `ω`, a
physical displacement, which is single-valued on any domain.

Leaving the condition out is not a rounding matter: κ comes out 85,6 % too small,
and — worse — mesh-dependent, since `c_k = 0` means "zero at whichever node the
boundary walk started". Two meshes of one figure then give two different κ. The
usual equilibrium check `∫τ_z dA = Qz` cannot see it (an additive boundary value
makes a circulating field with no resultant); the diagnostic is the residual flux.
The Trefftz shear centre cannot see it either, and that is a second, independent
argument for Trefftz: `ΔyM = Σ_k c_k·∮_Γk ∂ω/∂t ds = 0`.

The `h × h` matrix `M_kj = ∮_Γk ∂Φ_j/∂n ds` is the Schur complement of K onto the
inner boundaries — symmetric, independent of m, built once per figure. Its
off-diagonal is the hole-to-hole coupling, and it is not small: 31,5 % of the
diagonal for two holes, 38,2 % for three. Solving with the diagonal only — each
hole for itself — costs 27,2 % of κ at h = 2 and more at h = 3.

**The restriction.** Walking a loop once, the datum accumulates

```text
∮ dΦ = −1/(2·Iy) ∮ z² dy = (1/Iy)·∫∫_D z dA        (D = the enclosed region)
```

so **Φ is single-valued only if the first moment of each hole about the bending
axis vanishes** — that is, if every hole's centroid lies on it (`∫∫ y dA` for
`Qy`). The section's own centroid is at the origin by construction, so the outer
loop then closes by itself. Otherwise Φ is multivalued and not representable as a
finite-element field at all: measured on a 200 × 300 box with a 60 × 120 hole at
`z = 210`, the predicted jump `1,191800e-3` appears at both loops to seven digits,
16,4 % of the datum's own span, and equilibrium degrades to `1,8e-1`. **The
residual flux stays at 10⁻¹⁷ throughout** — the side condition is satisfied, only
for the wrong boundary-value problem. The detector is the per-loop closure of the
datum, and it belongs in the implementation as a check.

**So the Dirichlet stress-function formulation covers multiply connected sections
only in part.** It carries the symmetric hollow box and everything whose holes sit
on the bending axis — which is the practically common case, and includes
`kasten-200x400x10-r30` from the test bench. An off-axis void needs more: either a
particular solution corrected by a harmonic `∇v` with prescribed hole flux (which
reuses the same coupling matrix), or a switch to the warping-based formulation,
where the unknown is a displacement and single-valued for the same reason `ω` is.
Neither is built, and which one to take is an implementation decision, not this
one.

Evidence: [`docs/messungen/loch-zusatzbedingung.md`](../messungen/loch-zusatzbedingung.md).
Note what is **not** there: for one cell the thin-tube limit `κ → 1/2` is an
independent oracle, but for two and three cells no closed-form κ exists to measure
against. The `h ≥ 2` evidence is structural — matrix symmetry to 10⁻¹⁶, all fluxes
vanishing together, a mirror-symmetry prediction hit to 10⁻⁴ %, gauge
independence, mesh convergence to 0,12 %. What an outside oracle confirms is the
*formulation*, and that does not change with the number of cells; what is added is
only the linear system in `c`.

## The shear centre is Trefftz's, and that is a choice

The boundary-value problem above is incomplete. It is really

```text
∇²Φ = −m·y/Iy + C
```

where C is a superimposed torsion field. It carries no net force, so it does not
disturb equilibrium; it only moves the torque, and with it the line of action of
the resultant. C is fixed by whatever condition is used for "no twist", and the
two customary ones do not agree:

- **Weber** — vanishing *mean* twist, which gives `C = 0`. The shear centre is
  ν-dependent.
- **Trefftz** — vanishing projection onto the torsion mode,
  `∫[τ_y·(ω,y − z) + τ_z·(ω,z + y)] dA = 0`. The shear centre is **ν-free**, and
  measurably so: constant to 10⁻¹² of the radius of gyration across all four
  figures.

**Trefftz is chosen**, and not because it is ν-free — that is a consequence, not
the reason. The reason is the beam element. Its torsional degree of freedom has
the stiffness `G·It`, with `It` from the ν-free warping problem. A transverse
load at eccentricity `e` from the shear centre feeds `Mx = Vz·e` into exactly
that mode. For the split to be clean, the shear centre must be the point at which
the bending-shear field stops exciting the torsion mode — and that condition *is*
Trefftz's, by construction. Weber's point still excites it slightly.

Put plainly: if the element takes `It` from the warping problem, the shear centre
belongs to the same problem. Otherwise the two quantities that work together in
the beam come from two different models.

The price is small and was measured: Weber and Trefftz differ by at most 0,55 %
of the radius of gyration over the whole range ν = 0 … 0,45, and they agree at
ν = 0 to five digits. Gruttmann and Wagner take both κ and the shear centre from
the one shear problem, which is the opposite choice made for a defensible reason;
this is not a case of one answer being wrong.

One consequence worth naming: the warping constant `Iω` is referred to the shear
centre. Under Trefftz the whole torsion family — `It`, `yM`/`zM`, `Iω` — stays
ν-free together. Under Weber, `Iω` would have inherited a ν-dependence it does not
otherwise have.

## What the record stores

```ts
/** Aus dem FE-Vollquerschnitt. KEINE Materialzahl, KEIN ν. */
type FESectionValues = {
  /** Torsionstraegheitsmoment [m4] — aus ∇²ω = 0, ν-frei. */
  readonly It: number;
  /** Schubmittelpunkt nach TREFFTZ [m] — ν-frei. */
  readonly yM: number;
  readonly zM: number;
  /** 1/kappaY = d0 + d2·m², m = ν/(1+ν). Der lineare Anteil ist beweisbar null. */
  readonly inverseKappaY: readonly [number, number];
  readonly inverseKappaZ: readonly [number, number];
};
```

Nothing in it names a material, a grade, or a ν. It is geometry expressed as a
formula rather than as a number, and that is the whole trick.

> **Addendum, as built.** The type is called `FESectionValues`, not
> `SolidSectionValues`: what it comes from is the FE, and `solid` is already the
> name of an `Idealisation` value that this block does *not* track — the drawn
> `midline` figure gets it under either idealisation. It is wrapped in a
> three-state `FESectionState` (`computed` · `unsupported` · absent), it carries
> a fingerprint `{ A, Iy }` of the outline it was computed on, and it lives in
> `@baustatik/cross-section` while the computation lives in
> `@baustatik/cross-section-fe`
> ([ADR 0047](0047-the-solid-section-fe-lives-in-its-own-package.md)).
> The `unsupported` branch carries `It` when meshing happened at all — the
> torsion problem is untouched by both refusal reasons, and throwing away a
> computed number would be dishonest.

## ν enters at one place, and only there

> **Amended by [ADR 0061](0061-the-fe-stress-is-a-vector-at-a-node.md) — this
> section's headline only.** ν now enters at **two** places: here, where
> geometry meets material, and at the FE stress recovery
> (`recoverStresses(fields, forces, nu)`), which takes it as a bare number.
> It has to: τ is affine in `m = ν/(1+ν)` and, unlike κ, is not stored — it is
> evaluated for a known material and thrown away with the mesh. The claim of
> this ADR that actually carries survives untouched: **no ν stands in the
> section values.** `FESectionValues` names no material, no grade and no ν, and
> `SectionProperties` stays material-free. `recoverStresses` takes no
> `Material` either — in an elastic recovery on a homogeneous section neither
> `E` nor `G` appears.

`ElasticModuli` gains `nu?: number`, copied from the catalogue at creation like
`E` and `G` already are (`STEEL_POISSON`, `CONCRETE_POISSON` exist today).
`resolveSectionStiffness` evaluates the polynomial:

```ts
const m = nu / (1 + nu);
const [d0, d2] = properties.inverseKappaZ;
const kappaZ = 1 / (d0 + d2 * m * m);
```

**`nu` is optional, and its absence is an answer.** Timber is orthotropic: its
`E0,mean` and `G,mean` are tabulated independently, and back-computing ν from
them yields nonsense (≈ 6,97 for C24). There is no isotropic ν for timber, the
isotropic FE formulation does not hold there, and the honest result is no κ —
which the existing vocabulary already expresses as `kappaZ === undefined`,
meaning shear-rigid, not zero stiffness (`ShearDeformationUnavailableWarning` in
`fem-solver`'s `check()`, [ADR 0035](0035-the-editor-section-yields-values-without-kappa.md)).

Deriving ν from `E` and `G` was rejected for the same reason: it gives 0,30001 for
steel where the standard says 0,3, and it fails silently where it should refuse.

## The gate keeps its signature

`validateSectionProperties(properties, policy)` takes values and a policy and no
material, and it stays that way —
[ADR 0032](0032-the-cross-section-gate-warns.md) cut it that way deliberately.
Sentence 2 reads `yM`:

```text
|yM − ys| > shearCentreTolerance · max(√(Iy/A), √(Iz/A))
```

With Trefftz, `yM` is a single ν-free number and the question does not arise. Had
Weber been chosen, the gate would have evaluated at m = 0 — and the warning could
not have flipped either way, because a figure symmetric in y has both the
constant and the m-term equal to zero. A ν contribution cannot make a symmetric
figure unsymmetric. The measurement confirms it: the rectangle's Weber `yM` moves
by 4,7·10⁻⁶ % of the radius of gyration, which is 10⁻¹³ in absolute terms.

## The computation happens at creation, not on the calculation path

`getSectionStiffness(beam)` is **synchronous** (`fem-solver/src/config.ts`), and
so is `sectionProperties(cs, policy)`. Meshing is an asynchronous Worker
capability behind a port ([ADR 0039](0039-meshing-is-a-transient-worker-capability.md)),
and the sparse solve is asynchronous too. The FE can therefore never run inside
either door — a fact that is independent of ν and was the first thing to get
wrong.

So the sequence is: create the section, then compute, then write the values into
the record, then solve. The stored values are the fourth instance of a pattern
the repository already uses three times — the copied profile row
([ADR 0027](0027-catalogues-are-import-sources.md)), the derived outline
([ADR 0037](0037-the-outline-comes-from-inflating-wall-runs.md)), and the
creation policy travelling in the snapshot
([ADR 0033](0033-the-cross-section-has-a-creation-policy.md)) — and it is stored
for the same reason all three are: otherwise a saved model computes against
whatever the running program version would produce.

**The drift check is weaker here, and that is an accepted asymmetry.** The gate
re-derives the outline and reports the difference, because re-deriving is cheap.
It cannot re-run the FE. A geometry edit therefore invalidates the block by
application rule rather than by a checked comparison. Carrying a cheap
fingerprint — the `A` and `Iy` of the outline the values were computed on, both
of which the gate computes anyway — turns a stale block into a finding instead of
silent drift, and is the recommended mitigation.

## Two textbook formulas, and what the measurement did with them

**Cowper is not the acceptance criterion.** Cowper's `κ = 10(1+ν)/(12+11ν)` gives
0,84967 for a rectangle at ν = 0,3. The energy-based value is 0,832942 — κ from
the shear energy *falls* with ν where Cowper's formula rises. Both meet at 5/6 for
ν = 0. Cowper averages the 3D equations and is a different quantity; using his
numbers as a target would have sent an implementation hunting a phantom error.
The one sharp oracle is the rectangle at m = 0, where the exact solution is linear
and a linear triangle is exact: measured `0,833333333333` against 5/6.

A practical consequence: the FE path and the existing Grashof path (`shear.ts`)
agree **for the rectangle** to 0,08 %, not to 2 %.

> **Addendum: that sentence held only for the rectangle, and the rest is now
> measured.** The original wording — *"the feared disagreement between a
> parametric section and the same section drawn in the editor does not exist"* —
> read as a statement about the whole boundary below. It was not one. Measured on
> the T-section
> ([`docs/messungen/t-querschnitt-grashof-gegen-fe.md`](../messungen/t-querschnitt-grashof-gegen-fe.md)),
> Grashof is **+10,7 % to +134 %** above the FE, and always on the stiff side.
> The reason is the second approximation, not the first: `τ = Q·S/(I·t)` averages
> across the cut width, and at a flange-to-web step `t` jumps by `bf/bw`. ν-blindness
> is the smaller error — the spread over ν = 0 … 0,3 is a few percent.
>
> So the duplication is a **known, open gap**, not a settled state: one model,
> two machines. Owner: `packages/TODO.md`. Two ways out, and no promise which:
> write the four parametric shapes out as polygons so they can go through the FE,
> or accept Grashof for the parametric branch and say so at the field. The
> measurement is what a decision between them would be made on; it has not been
> made.

**The half-disc formula was misquoted, and the correct one is an oracle.**
`e = 8a(3+4ν)/(15π(1+ν))` demands a ν-dependence that neither definition
reproduces — the entire Weber-to-Trefftz gap is some twenty times smaller than
what it asks for. The formula was the wrong part. Sokolnikoff, *Mathematical
Theory of Elasticity*, 2nd ed., § 61, pp. 237–239 has

```text
e/a = 8·[3 + (40/π² − 1)·ν] / (15π(1+ν))  =  8·[3 + (40/π² − 4)·m] / (15π)
```

and since `40/π² = 4,0529` the slope in m is nearly flat rather than steep — a
factor of nineteen apart from the remembered version. Against the correct form
the Weber shear centre matches at **every** ν: the constant is off by 0,0013 %
and the slope in m by 0,0196 % (measured `8,973403e-3` against `8,971644e-3`),
both at discretization level and flat in ν.

This closes the one open footnote and adds an independent oracle for the part
that is otherwise hardest to check — not the value of the shear centre but its
**m-dependence**, which is exactly what the coefficient form claims to capture.
It also settles which definition the classical number is: **Weber's**. Trefftz
is ν-free by construction and cannot produce a non-zero slope at all, so the
closed-form solution confirms Weber's ν-dependence and says nothing against the
choice of Trefftz made above — the two differ by 0,55 % of the radius of
gyration, and the beam element is what picks between them.

## The boundary: the parametric solid section stays out

> **~~This boundary is lifted~~ by
> [ADR 0062](0062-the-parametric-shape-writes-itself-out-as-an-outline.md).**
> The section below stands as written — it records what was decided here, and
> its first bullet names exactly the piece that was missing: *"It has no input.
> The FE needs a polygon."* ADR 0062 supplies that input. `ShapeSpec` gets a
> `Ring[]` per shape (`geometry/shape-outline.ts`), the four shapes run through
> the same `computeFESectionValues`, and `It === undefined` plus `t-section`'s
> `zM === undefined` stop being **permanent** answers. What they become is the
> answer *before an FE run* — and so does κ, which this ADR left on Grashof.

`It`, `yM` and `zM` are not FE inventions. They are fields of
`SectionProperties`, filled today from three sources: the closed expression of a
parametric shape (`shapes/kernel.ts`), the catalogue row, and the wall path
(`wall-path.ts`). Only the **solid** case leaves them empty — and it does so for
the parametric shape as much as for the drawn one. `i-symmetric`,
`hollow-rectangle` and `t-section` all branch on `idealisation === 'solid'` and
return `It: undefined` there (`t-section` also `zM: undefined`).

This ADR covers the drawn section only — `kind: 'section-geometry'`, either
input mark. **`kind: 'shape'` with `idealisation: 'solid'` is deliberately out
of scope**, and stays where it is:

- **It has no input.** The FE needs a polygon. `deriveOutline` works on
  `SectionGeometry`; `ShapeSpec` carries dimensions, not an outline. Including
  it would mean writing all four shapes out as polygons as well — a separate
  piece of work with nothing to do with the FE.
- **There is a way out, and it is the intended one.** Whoever wants FE values
  for an IPE draws the figure. `ipe-300-modelliert` on the test bench does
  exactly that.
- **κ is untouched there.** The parametric solid path keeps its Grashof κ from
  `shear.ts` — the `0,401` against `0,340` quoted in
  `packages/cross-section/CONTEXT.md`.

So for a parametric solid section, `It === undefined` and `t-section`'s
`zM === undefined` are **permanent** answers, not gaps awaiting this work. The
JSDoc in `shapes/kernel.ts` and `properties.ts` says so at each field.

## Consequences

- `@baustatik/cross-section` gains no dependency on `@baustatik/material`, and
  `sectionProperties` gains no parameter.
- A new package owns assembly and evaluation. ~~Superseded by
  [ADR 0046](0046-the-solid-section-fe-lives-in-cross-section.md)~~ —
  **and reinstated by [ADR 0047](0047-the-solid-section-fe-lives-in-its-own-package.md),
  for a different reason than the original one.** The bullet was written to
  protect "`cross-section` imports no WASM"; ADR 0046 rightly said a package
  boundary is not what enforces that. What the built thing showed is that
  `@baustatik/cross-section-fe` is the *orchestrator* and imports both artifacts,
  and that its sharpest oracles need a real mesh — which `cross-section`'s
  deliberately Emscripten-free suite cannot run.
- **`SectionGeometry` gains the optional block**, next to `outline` in both
  variants, costing a `schemaVersion` tick and a shape check in the snapshot
  parser — which checks shape, not resolvability, as always. Not `CrossSection`:
  the boundary below means `kind: 'shape'` never receives one, and a field that
  one branch of a union can never carry belongs in the branch that can. The
  derived outline is already there, and the provenance travels with it.
- Breaking change to `@baustatik/material`: `ElasticModuli` gains `nu?`.
- [ADR 0035](0035-the-editor-section-yields-values-without-kappa.md) becomes
  partly obsolete: the editor section will yield κ. It gets a banner rather than a
  rewrite — it records what was decided when.
- The same computation delivers `It` for **drawn** solid sections, which
  `SectionProperties` has carried as permanently `undefined` until now. For the
  **parametric** solid shape it stays `undefined` — see the boundary above.
- A section whose hole does not sit on the bending axis is outside the shear
  formulation until one of the two fixes above is built. The implementation
  checks the per-loop closure of the boundary datum and refuses rather than
  returning a number — the residual flux would report success. `It` is
  unaffected and can still be delivered.
- `docs/agents/` gains nothing; the working detail lives in
  [`packages/plan-handoff-fe-vollquerschnitt.md`](../../packages/plan-handoff-fe-vollquerschnitt.md).
