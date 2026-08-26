# The parametric shape writes itself out as an outline

You look this one up when a `solid` T suddenly reports `It` and `zM` where it
used to answer `undefined`, when κ for a parametric solid section becomes
`undefined` until an FE step has run, or when you wonder why `ShapeSpec` — four
numbers — now has a polygon behind it.

> **The parametric shape writes itself out as an outline.** `ShapeSpec` gains a
> `Ring[]` per shape, and with it the reason the solid section had **two
> machines** falls away: κ, `It` and `yM`/`zM` for `idealisation: 'solid'` come
> out of the same 2D FE as for the drawn figure. `A`, `Iy`, `Iz`, `Iyz`, `ys`,
> `zs`, `alpha`, `Iu`, `Iv` stay closed formula — they need no FE, and they
> therefore turn from a second computation path into the **oracle** of the
> first.

Lifts the section *"The boundary: the parametric solid section stays out"* of
[ADR 0045](0045-solid-section-values-are-nu-free-coefficients.md) — by banner,
not by rewriting it — and gives
[ADR 0057](0057-the-parametric-solid-section-has-no-stress-points.md) its second
half-step: what ADR 0057 did for the stress points (the approximation delivers
nothing at all any more), this does for κ.

## The problem this closes

The solid section had two machines, and which one answered depended on how the
*same figure* was entered:

| entered as | κ | `It` | `zM` (T) |
| --- | --- | --- | --- |
| drawn (`kind: 'section-geometry'`) | 2D FE (ADR 0045/0047) | 2D FE | 2D FE |
| parametric (`idealisation: 'solid'`) | Grashof (`calculation/shear.ts`) | `undefined` | `undefined` |

Measured, Grashof comes out **+10,7 % to +133,6 %** too stiff against the FE
over four T figures
([`docs/messungen/t-querschnitt-grashof-gegen-fe.md`](../messungen/t-querschnitt-grashof-gegen-fe.md)),
always on the stiff side. For the rectangle the same comparison is 0,08 % — and
that makes the state of affairs worse, not better, because it sets the
expectation that the whole branch is that accurate.

`packages/TODO.md` §5.6 already recorded the direction: the parametric input is
only a more convenient notation for a drawn figure, so it should run through the
same FE, written out as a polygon. This decision carries it out.

## The second occasion, and it reaches further than the FE

The nonlinear concrete response (`@baustatik/cross-section-response`,
[ADR 0055](0055-the-cross-section-response-is-the-shared-machine.md)) integrates
σ(ε) over the section. **What it integrates over is open** and stays open —
`packages/cross-section-response/TODO.md` question 1 weighs lamellae over the
outline figure against the FE mesh and recommends lamellae. Both are viable: a
fixed Tri6 mesh carries a numerical fibre integration without any remeshing, the
Gauss points are fixed, and only ε at them changes per iteration. What speaks
for lamellae is not the meshing but the **quadrature at the neutral axis**: σ(ε)
is kinked (parabola-rectangle at `εc2`, zero in tension), the neutral axis cuts
arbitrarily through elements, and the usual error order does not hold there. The
oracle ADR 0055 set for itself — `Mpl = b·h²/4·fy` — demands an exact split.

**Both ways need the outline.** Lamellae cut it, the FE meshes it. The outline
writer is therefore the load-bearing piece independently of that decision — the
FE is its first consumer, the concrete integration its second.

## What moves, and what does not

The axis table of ADR 0045 holds unchanged:

| | needs the FE (async) | needs ν |
| --- | --- | --- |
| `A`, `Iy`, `Iz`, `Iyz`, `alpha`, `Iu`, `Iv`, `ys`, `zs` | no | no |
| `It`, `yM`, `zM` | **yes** | no |
| `kappaY`, `kappaZ` | **yes** | **yes** |

The route, in one picture:

```text
ShapeSpec  (rectangle | hollow-rectangle | i-symmetric | t-section)
   |
   +- shapeValues(spec) ---------------> A, Iy, Iz, Iyz, ys, zs, alpha, Iu, Iv
   |  closed formula, SYNCHRONOUS                         (unchanged)
   |
   +- shapeOutline(spec) -> Ring[]                        NEW
         |
         +-> createSectionGeometry({ kind: 'outline', rings }, policy)
                +-> computeFESectionValues(geometry, policy)      async
                       |   @baustatik/cross-section-fe UNCHANGED
                       v
                    FESectionState --the application writes it back-->
                                            CrossSection.feValues (kind: 'shape')
                                                     |
                                   sectionProperties() reads it --+
                                       -> It, yM, zM, inverseKappaY/Z
```

**`@baustatik/cross-section-fe` is not touched.** Its door takes a
`SectionGeometry`, and `{ kind: 'outline', rings, outline }` is one. That is the
touchstone of this decision: if the FE package had to change, the outline writer
would be sitting in the wrong place.

## Why the outline writer, and not a second formula set

The obvious alternative was to keep the parametric branch closed-form and write
the missing quantities — `It` of the rectangle as a Fourier series, `zM` of the
T from a table. That would have been a *third* machine next to the two we
already had, with its own error behaviour, its own oracles, and no way of ever
agreeing exactly with the drawn figure.

Writing the figure out as a polygon is instead the statement that the parametric
input **is** a drawn figure — with the same input system (`y = 0` the symmetry
axis, `z = 0` the top edge), the same winding rule
([ADR 0034](0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)),
the same derivation. Four shapes, axis-parallel, **no `bulge`**: the rectangle
has 4 points, the T 8, the welded I 12, and the box **two** rings — material
with `signedArea > 0`, the hole `(b−2t)×(h−2t)` with `signedArea < 0`.

The proof that both descriptions are the same figure is not an argument but a
test: Green over `shapeOutline(spec)` against `shapeValues(spec)`, `A`, `Iy`,
`Iz`, `ys`, `zs` to `1e-12`. It carries the whole change — if it fails, the FE
is computing a different figure than the formula.

## The closed formula becomes an oracle

`A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs`, `alpha`, `Iu`, `Iv` stay where they are. Not
out of caution: they need no boundary-value problem, they are exact, and they
are synchronous — a section list that shows `A` must not wait for a mesher.

Their role changes, though. Until now they were the *second* computation path
for the same figure; now they are the **independent witness** of the first. Two
places lean on that:

- Green over the written-out rings against the closed formula — the outline is
  the same figure.
- `state.fingerprint.A` of the FE against the formula value — it comes from the
  mesh, not from Green, and therefore checks outline *and* meshing.

## Consequences, stated plainly

- **Without a resolved FE block there is no κ** → shear-rigid plus
  `ShearDeformationUnavailableWarning`. Grashof used to return a number always.
  Stored models need one run.
- **Without ν there is no κ.** A timber solid section computes shear-rigid
  instead of Grashof — **exactly the behaviour the drawn figure already has
  today**. No `nu ?? 0`, no exception; ADR 0045's *"the absence of ν is an
  answer"* stays untouched. Timber is not in focus at present.
- **`It` gains no consumer today.** `fem-section-resolve` reads `A`, `Iy`,
  `kappaZ`/`inverseKappaZ` — the plane frame has no torsional degree of freedom.
  The visible gain is κ alone; `It`, `yM`, `zM` are correctness in stock for the
  design packages.
- **Every parametric input becomes costly** (`FEElements` = 4000, ~1 s per
  outline). That is for the UI to solve, not the computation core.
- **The Grashof paths of the solid section go.** `solidPaths` in
  `shapes/t-section.ts` and `shapes/i-symmetric.ts`, the inline `solid` arm in
  `shapes/hollow-rectangle.ts`, and the whole path in `shapes/rectangle.ts`.
  `calculation/shear.ts` **stays complete** — the thin-walled branch lives on
  it. `ShapeResult.pathY`/`pathZ` become optional; where they are absent,
  `toProperties` answers κ with `undefined` = shear-rigid.
- **One oracle loses its subject, and it is replaced.** `κ = 5/6` for the
  rectangle was the proof that `shear.ts`' definition is right, and it stands
  nowhere as a literal in the code. The rectangle is solid-only, so the proof
  moves into the test and checks `shearArea` directly, with the rectangle path
  built there from `partIntervals`.
- **`CrossSection` gains `feValues` on the `shape` variant.** ADR 0045 put the
  field only on `SectionGeometry` with the reasoning that `kind: 'shape'`
  carries no polygon and would therefore never receive a block. That reasoning
  is what this decision removes; the field follows it.
- **`schemaVersion` 13 → 14** in `@baustatik/script`. Only the shape of the new
  field is checked, not its resolvability — as always. Precedent: v12.
- **`@baustatik/cross-section` stays WASM-free**, and `cross-section-fe` stays a
  leaf with `apps/demo` as its only consumer (ADR 0047).

## Not part of this decision

- Stresses for the parametric solid section (`recoverStresses` would be open,
  but `fields` are transient — a step of its own).
- The lamella decomposition for `cross-section-response`.
- `i-shape` with independent flanges (`packages/TODO.md` §5.5).
- Multi-cell sections, box stress points, the section editor.
