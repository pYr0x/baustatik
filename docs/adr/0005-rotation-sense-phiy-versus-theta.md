# The node world and the element world use opposite rotation senses, and the sign flip lives in the transformation

The plane frame stack carries **two** rotation conventions on purpose:

| Quantity | Where | Positive sense | On screen |
|---|---|---|---|
| `phiY`, `NodeLoad.my`, `BeamMomentLoad.m` | `@baustatik/fem`, `@baustatik/fem-loads` | right-handed about global **y**, which points **out of** the drawing plane | counter-clockwise |
| `theta`, `LocalElementLoad.my` | `@baustatik/fem-element` | from **+x** to **+z** | clockwise |

So `phiY = −theta`, and the conversion happens at exactly two places:

- `@baustatik/fem-load-resolve` negates beam moment loads (`my_e = −m`,
  `my1/my2 = −m1/−m2`) when it resolves them onto an element.
- `@baustatik/fem-solver` will carry a `−1` in the rotation row of the 6×6
  transformation.

The two compose to the identity, so what the user typed is what arrives in the
global load vector. **Node loads get no minus at all** — they never pass through
an element, and the global vector's rotation entries are already `phiY`-conjugate.

## Why not one convention everywhere

Because the axis choice forces the split. With x to the right and z downward —
the German structural convention this repo uses throughout — right-handedness
requires `y = z × x`, which points *out of* the screen. A positive rotation about
`+y` then carries `+z` toward `+x`, i.e. counter-clockwise. That is what RSTAB
shows (`apps/demo/Knotenlast1.png`, `apps/demo/stabachsen.png`), and matching
RSTAB is a standing goal of the load model.

Meanwhile `theta = dw/dx` is the German *Neigung* definition. With `w` positive
downward it is positive from `+x` to `+z` — clockwise. There is no assignment of
`y` that makes both senses agree while keeping x right, z down and a right-handed
frame.

## Why `fem-element` was not flipped instead

Redefining `theta := −dw/dx` would have removed every minus sign from the chain
and made the transformation a proper rotation (det +1). It was rejected because
the cost lands on the one package that is finished and validated:

- `K` becomes `S·K·S` with `S = diag(1,1,−1,1,1,−1)`; the `w`↔`theta` coupling
  terms flip and the matrix leaves the classical Hermite form that a reviewer can
  check against a textbook.
- The consistent load vector for a uniform load becomes
  `[0, qL/2, −qL²/12, 0, qL/2, +qL²/12]` — no longer the textbook signature that
  `packages/fem-element/docs/timoshenko.md` uses as its Euler–Bernoulli anchor.
- `Nw2`, `Nw4` and all of `Ntheta` flip, and the existing tests move with them.

Against that, the two minus signs are cheap: neither is scattered. One is a
single expression in `appendMoment`; the other lives in a transformation matrix
that has to be written and tested anyway. And `theta = w'` is the domain-correct
name for what the field is.

The decision was in fact already recorded — `packages/fem-element/src/types.ts`
said "Die Zuordnung zum rechtshaendigen phiY am Knoten ist Sache der
Transformation" from the start. The handoff for `fem-load-resolve` misread that
sentence as an open question. It was the answer.

## Why the improper transformation block is safe

The per-node 3×3 block is

```
[  cosα  sinα   0 ]
[ −sinα  cosα   0 ]
[  0     0     −1 ]
```

with determinant −1. It is improper — a rotation composed with a reflection —
but it is still **orthogonal**, so `T⁻¹ = Tᵀ` holds and `K_global = Tᵀ K T`
remains valid. The sign flip costs nothing structurally.

## How it is pinned

`Ntheta(0) = [0, 0, 1, 0, 0, 0]` exactly (`nt2` at `ξ = 0` is `c·(1+φ) = 1`, the
rest vanish — `packages/fem-element/src/shape-functions.ts`). A single beam
moment `m` at `a = 0` must therefore produce a *pure* nodal moment, with no
rounding residue, and the sign of that one entry is the whole decision. The test
`packages/fem-load-resolve/tests/resolve.test.ts` asserts
`f_e = [0, 0, −m, 0, 0, 0]` and runs it through the real
`Timoshenko2D.prepare(...).consistentLoad(...)` rather than against a hand-copied
expectation.

Equilibrium and partition invariance do **not** discriminate here — the same
warning `packages/fem-element/CONTEXT.md` gives for the `Ntheta` versus `Nw'`
question applies to the sign.

## Consequences

- `fem-solver` is bound to this: its transformation must negate the rotation
  rows. Building it as a pure rotation would silently invert every applied
  moment.
- `@baustatik/fem` documents the sense on `phiY` even though the field currently
  only carries `'fixed' | 'free'` and no sign. The convention binds the later
  result quantities and the transformation.
- `internalForces`, once implemented, reports `M` in the element's `theta` sense.
  Whoever plots moment diagrams has to decide which sense the drawing uses; that
  is a presentation decision and is not fixed here.
