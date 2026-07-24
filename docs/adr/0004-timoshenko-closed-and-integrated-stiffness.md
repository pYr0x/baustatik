# Both a closed-form and an integrated Timoshenko stiffness ship as production formulations

`@baustatik/fem-element` exports **two** frame element formulations, not one:

- `Timoshenko2D` builds the local stiffness from the closed-form expression
  `EI/(L³(1+φ))·[[12, 6L, −12, 6L], …]`. This is the default and the first
  choice.
- `Timoshenko2DIntegrated` builds the same matrix by numerically integrating
  `∫BᵀDB` from the element's own shape functions with 3-point Gauss.

Everything else is shared: the `φ` normalisation, the interdependent
interpolation (IIE) shape functions, `consistentLoad`, `shapeFunctions` and the
`internalForces` stub. The two differ in exactly one injected function, so there
is no duplicated element theory — see `src/stiffness.ts` and the
`createFormulation` factory in `src/timoshenko.ts`.

## Why two, when `Elementformulierung.md` asked for one

The originating handoff (`Elementformulierung.md`, "Kritik #3") argued that `K`
should be *integrated* in production with the closed formula kept only as a test
reference. The follow-up handoff (`packages/fem-element/timoshenko.md`)
recommended the opposite: closed-form in production, integration only as a test.
Both framings assume a single production path, and both are wrong about the same
thing — the integration code has to exist either way, because the K↔N
consistency check *is* the integration. The only real question was where it
lives.

Shipping it as a second formulation rather than a test helper costs almost
nothing (it is one more injected function) and buys a genuine cross-check between
two independent derivations of the same matrix, exercised through the public
API rather than through test-only code. Mutation checks confirm the pairing is
load-bearing: perturbing `(2−φ)` to `(2+φ)` in the closed form, or using `Nθ`
instead of `dNθ` as the curvature operator in the integrated form, each break the
cross-check immediately.

The generalisation argument also points this way. The closed form is valid only
for the straight, prismatic, linear-elastic case. If tapered members ever arrive,
the integrated path is the one that survives, and it will already be a tested,
exported formulation rather than something buried in `tests/`.

## Why two formulation objects and not an option on `prepare()`

The obvious alternative was `prepare(props, L, { stiffness: 'integrated' })`.
That was rejected because `prepare(props, L)` is the interface signature that
ADR-0003 fixed and that `fem-solver` and every future element depend on. An
option parameter there would force the solver to know about and forward a
*numerics* switch, breaking the "the solver knows only the interface, never the
theory" boundary from `Elementformulierung.md`.

Two objects, both satisfying the **unchanged** `FrameElement2DFormulation`, give
the same choice to the caller — who has to name a formulation anyway — while the
solver's per-element loop stays exactly `prepare()` then `stiffness()` +
`consistentLoad(load)`. ADR-0003 remains valid and unamended.

## Why the integrated path needs a `φ === 0` branch (and the closed one does not)

In the integrated form, and only there, `GAs` appears as a raw factor in the
shear term `∫B_sᵀ·GAs·B_s`. For the shear-rigid case this is a **removable
singularity that IEEE-754 cannot remove**: the shear strain is proportional to φ,

```
γ = φ/(12L(1+φ)) · (12w₁ + 6Lθ₁ − 12w₂ + 6Lθ₂)
shear energy = ½·GAs·γ²·L  with  GAs = 12EI/(φL²)  =  EI·φ·c²/L²
```

so one φ cancels analytically and the limit at φ = 0 is cleanly zero — but
evaluated numerically the expression is `Infinity · 0² = NaN`. Mapping `'rigid'`
to `Infinity` does not help; the term has to be *skipped*, which is what
`gaussStiffness` does. The guard `phi === 0` is exact rather than epsilon-based
because `prepare()` normalises `'rigid'`/`Infinity` to exactly `0` at the single
normalisation point (the `GAs`-only-in-φ invariant in
`packages/fem-element/CONTEXT.md`).

The closed form never touches `GAs` at all, so it has no branch and no NaN risk.
That asymmetry is the reason it stays the default, and the reason the strongest
validation anchor — `Timoshenko2D.prepare({…, GAs: 'rigid'}, L).stiffness()`
being **floating-point identical** to the independent Euler–Bernoulli reference —
belongs to it. The integrated variant can only match that reference to within
`1e-12`: Gauss over Hermite polynomials is mathematically exact but is not the
same sequence of floating-point operations.

## Consequences

- `Elementformulierung.md` "Kritik #3" is superseded and has been corrected in
  place; its "Entschieden" table now records this decision.
- `Timoshenko2DIntegrated` is public API and semver-bound from now on.
- The Gauss integrator (`src/gauss.ts`) and the shape functions
  (`src/shape-functions.ts`) stay package-internal. They can be exported later
  without a breaking change; the reverse is not true.
