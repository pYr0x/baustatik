# Section forces come from equilibrium, not from the constitutive law

`internalForces` was a throwing stub. It is now a pair of free functions in
`@baustatik/fem-element`:

```ts
function internalForcesAt(state, x, side?): { N, V, M }
function internalForcesStations(state): number[]
```

and they compute `N`, `V` and `M` by integrating the applied load away from the
member end forces:

```text
N(x) = −e[0] − ∫₀ˣ qx dξ − Σ_{a<x} px
V(x) = −e[1] − ∫₀ˣ qz dξ − Σ_{a<x} pz
M(x) = +e[2] + ∫₀ˣ (V + my_e) dξ + Σ_{a<x} p.my
```

with `e = state.endForces`. No `EA`, no `EI`, no `phi`, no shape function.

## The rejected alternative, and the case that decides it

The obvious route is the constitutive one: interpolate the displacement field
with the element's own shape functions and differentiate,
`M = EI·θ′`, `V = GAs·(w′ − θ)`, `N = EA·u′`. It looks principled — it uses the
element's own kinematics, which is exactly what the old comment on
`PreparedElement.internalForces` claimed was needed.

It is wrong, and one textbook case shows it. Take a beam **fixed at both ends**
under a uniform load `q`. Every nodal degree of freedom is zero. The
constitutive route therefore reports `M ≡ 0` over the whole span. The true
answer is `M(0) = M(L) = −qL²/12` and `M(L/2) = +qL²/24`.

The reason is not a discretisation error that a finer mesh would remove. The
element's displacement field is the *homogeneous* solution; the load's
particular solution lives entirely in the consistent nodal load vector `f`, and
differentiating `N·d` never sees it. Refining the mesh reduces the error, which
makes the failure worse, not better: it looks like convergence.

Equilibrium has no such gap. The member end forces are **nodally exact** for a
straight prismatic beam under first-order theory, and cutting the beam and
summing forces introduces no approximation. `internal-forces.test.ts` pins the
fixed-fixed case with a comment naming this ADR.

## Timoshenko and Euler-Bernoulli get the same formula

This is the property that makes the equilibrium route more than a workaround.
The shear flexibility changes the *displacements* and therefore changes the
member end forces — but once `e` is known, the reconstruction between the nodes
is pure statics. A test computes the same case with `GAs: 'rigid'` and with a
finite `GAs` and asserts **identical** section forces while the displacements
differ. A constitutive route would need a separate shear branch and would have
to know `phi`.

## Two traps, written down because both produce plausible numbers

- **`dM/dx = V + my_e`, not `dM/dx = V`.** `my_e` already carries the sign flip
  from `fem-load-resolve` (`my_e = −m`, ADR 0005). The anchor is a cantilever
  under a constant distributed moment: with `dM/dx = V` the moment stays
  constant; with `+m` instead of `my_e` it comes out as `2mL` at the free end.
  Only the right combination hits zero where the beam is free.
- **`Σ_{a<x}` is strictly less.** That is what makes the default the *left*
  limit; `side: 'right'` sums `a ≤ x`. A section force is genuinely
  discontinuous at a point load, and a caller forced to pick one value would be
  guessing. Note that `M` is continuous at a point *force* (the lever arm is
  zero at the load's own station) and discontinuous at a point *moment*.

## Consequences: the condensation moves to `fem-element`

The reconstruction needs `e`, and `e` needs the end displacements of the
released degrees of freedom — which the global solve does not produce. Recovering
them,

```text
d_i = (f[i] − Σ_{j≠i} K[i,j]·d_j) / K[i,i]
```

requires the row `K[i,:]`, the pivot `K[i,i]` and the load value `f[i]` **as
they stood immediately before that particular condensation**, and it runs in
**reverse** condensation order — with `u1` and `theta1` released, row 2 already
has a zero in column 0, but the original row 0 still has an entry in column 2.
Only whoever performed the condensation holds those rows.

So `condense` left `fem-solver/src/element-matrix.ts` and became
`condenseStiffness` / `condenseLoad` / `recoverEndDisplacements` in
`fem-element/src/condense.ts`. The **mechanics** belongs to the formulation; the
**orchestration** — which degrees of freedom a given beam releases — stays with
the solver and arrives as an argument. `prepareBeam`'s six `condense` calls
collapse into one parameter, because `Beam['releases']` and `ElementReleases`
are shaped alike by construction (ADR 0017 took the names `u`/`w`/`theta` from
this package's vocabulary precisely so the translation would be a pass-through).

That forces a third binding stage:

```ts
prepare(props, L, releases?) → PreparedElement   // binds phi and the releases
  .withLoad(load)            → LoadedElement     // binds the load
  .evaluate(dLocal)          → ElementEvaluationState
```

`withLoad` exists for the same reason `prepare` exists (ADR 0003), one level
further in: `evaluate` continues with literally the same load vector that
`consistentLoad` produced. Passing the load to `evaluate` separately would let a
caller supply a different one and get a wrong end displacement *and* wrong member
end forces, both looking plausible. `stiffness()` and `shapeFunctions(x)` stay on
the outer stage because they do not depend on the load — otherwise every
stiffness test, and every later eigenvalue or buckling computation, would have
to invent an empty load.

## The exact stations, and why they are not a sampling grid

`internalForcesStations` returns the ends, every segment boundary, every point
load position, and the roots of `V + my_e = 0` and `qz = 0` per interval.
Between two of the first three, `q` is linear, so `V` is quadratic and `M` is
cubic — the extrema are computable, and a maximum reported from this list is
exact rather than a function of the grid spacing. The roots are obtained by
fitting through three samples inside the interval, which is exact because the
function *is* quadratic there.

The stations come from `state.load`, i.e. from `fem-element`, not from
`fem-load-resolve`. The evaluation must not look anything up; that is the
property that lets a result be stored (ADR 0019).

## Sign conventions, fixed here

One rule: **a positive value is plotted on the local +z side.** Mechanically
`M(x) = ∫σ·z dA` (positive moment = tension on the +z side), `V` positive on the
positive cut face in the +z direction, `N` positive in tension.

Member end forces are **not** section forces. `endForces` is `K·d − f` in DOF
direction, `[Fx1, Fz1, My1, Fx2, Fz2, My2]` — the old comment `[N1, V1, M1, …]`
in `solve.ts` was misleading, because the signs do not agree:

| | left limit at x = 0 | right limit at x = L |
| --- | --- | --- |
| `N` | `−e[0]` | `+e[3]` |
| `V` | `−e[1]` | `+e[4]` |
| `M` | `+e[2]` | `−e[5]` |

The moment is the odd one out because the element's `theta` (from +x to +z) runs
against the node's `phiY` — the same minus as ADR 0005. Every closed-form test
case asserts both boundary identities; a flipped sign fails immediately.

Under a **node swap** (`ex` reverses, and `ez` reverses with it because
`fem-geometry` derives one from the other by the same rotation), `N` is
invariant, `M` flips, and **`V` is invariant**. The last one is worth stating
because it reads wrong: `dM/dx = V`, and if both `M` and `x` flip, the quotient
does not.

## Consequences

- Breaking change to `@baustatik/fem-element`: `PreparedElement.consistentLoad`
  moves behind `withLoad`, `PreparedElement.internalForces` is gone, and
  `InternalForcesNotImplementedError` with it.
- Breaking change to `@baustatik/fem-solver`: `condense` and `endForces` are no
  longer exported from `element-matrix.ts`. The file header, which described
  condensation and joints, now describes transformation.
- `packages/fem-element/src/shape-functions.ts` keeps its derivatives, but not
  for `internalForces` — the equilibrium route does not use them. They are for
  `gaussStiffness` now and the deflection curve later.
