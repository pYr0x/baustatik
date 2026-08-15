# Kinematics shows in the displacement, not only in the pivot

[ADR 0012](0012-kinematics-is-detected-by-the-solver.md) made the Cholesky pivot
the general test for a mechanism: scale `K` with `S = diag(1/sqrt(K_ii))`, and a
smallest pivot below `1e-12` means the model is kinematic. That decision was
right and remains in force. It was also **incomplete**, and the gap is not closed
by moving the threshold.

The model that showed it is the demo itself: three nodes, two beams, a single
support holding `ux` and `uz` and leaving `phiY` free. It rotates about that node
as a rigid body — `K_ff` is exactly rank deficient, by construction, no matter
where the third node sits. What the solver sees depends on where it sits:

| third node | smallest scaled pivot | outcome |
| --- | --- | --- |
| collinear at (200, 0) | 7.8e-16 | detected |
| (160, 40) — the demo | **−1.6e-10** | detected (negative pivot ⇒ breakdown) |
| (165, 40) | **−1.6e-10** | detected (negative pivot ⇒ breakdown) |
| (165, 10) | **+1.8e-11** | **solves** → `uz = 9.0e13`, `φ = −9.0e11 rad` |
| (165, 80) | **+7.2e-11** | **solves** → `uz = 3.6e13`, `φ = −3.6e11 rad` |

These are the Gaussian test double's numbers, measured on the `demoMechanism`
geometries in `tests/solve.test.ts`. `faer` classifies the same five rows the
same way but lands on different magnitudes — the noise is a property of the
arithmetic, not of the model, which is precisely the finding.

The true pivot is exactly zero in all five rows. What the factorization actually
sees is rounding noise, and the middle rows say it plainly: `−1.6e-10` and
`+1.8e-11` are the same size. The
**sign** decides whether the factorization breaks down; the **magnitude** decides
whether it clears `1e-12`. Both hang on nothing but the coordinates.

## Where the noise comes from

An **inclined** beam mixes axial and bending stiffness into the same row through
the 6x6 transformation: `EA/L` next to `12EI/L³`, a factor of about `A·L²/I`
apart — slenderness squared. Cancellation carries the magnitude of the *larger*
term, while the Jacobi scaling normalizes against the row's *diagonal*. That puts
the noise floor near `eps · A·L²/I`, orders of magnitude above the threshold.

**It is not a demo artifact.** An angle sweep of the inclined beam (0°…90° in 5°
steps) over IPE 80, HEB 200 and HEB 600 slips through at every one of the three
sections, and at a realistic 10 m span as well as at the demo's 100 m. Which
angle slips and which is caught is not a pattern — it is where the noise happens
to land.

## Why no better factorization helps

This is a **backward error**, and that is the whole argument. After the
cancellation, `K` does not hold the model's matrix with a small error in it. It
holds the *exact* matrix of a slightly different model — and that other model is
not kinematic. It genuinely has the pivot that was measured.

Every method that reads the same stored matrix therefore reads the same
well-posed problem. An eigenvalue solver returns the smallest eigenvalue *of the
perturbed system*; a condition estimator estimates *its* condition number; a
rank-revealing QR finds full rank, because the rank *is* full. None of them can
recover information the assembly already discarded. Buying a more expensive
decomposition buys a more precise answer to the wrong question.

## Why the threshold is not raised

Raising `1e-12` trades misses for false alarms, and the measurement says the
trade is bad. Over 117 stable systems (cantilever, single- and two-span beams,
frames with legs at 30°/45°/60°, three-hinged frame, strutted beam, a 20-element
cantilever, a 10-span continuous beam and a six-storey frame — across all three
of IPE 80 / HEB 200 / HEB 600 and spans between 1 and 20 m) the smallest pivot is
`2.4e-5`, and 24 of 132 kinematic systems slip through between `2.0e-12` and
`4.3e-10`. All 24 come from the inclined-beam family; the sway frame on two
pin-ended columns, the hinge chain and the three parallel `uz` supports are all
caught by the existing nets — which is the point, since those are the mechanisms
without a shallow inclined member mixing `EA` into a bending row.

The two sets do not overlap here, but that separation is a property of
*this corpus*, not a safety margin: the stable minimum falls with system size and
slenderness, and the largest model measured has 60 degrees of freedom. A
threshold placed above the slipping mechanisms would have to be dragged upward
again with every larger model — and would then start rejecting structures that
carry load.

The pivot therefore stays where it is and stays a **one-sided** test: a pivot
below the threshold is certainly a mechanism, the other direction proves nothing.

## The result, not the matrix

The mechanism destroys the pivot in the twelfth digit. In the *solution* it
blooms by ten orders of magnitude:

| | smallest pivot | max rotation |
| --- | --- | --- |
| stable systems (117) | 2.4e-5 … 7.1e-1 | 4.3e-7 … 1.2e+1 rad |
| slipped mechanisms (24) | 2.0e-12 … 4.3e-10 ⟵ *close in* | 3.3e+10 … 9.5e+13 rad |

`fem-solver` gains a fourth net, `assessDisplacements`, with two stages:

| | limit | reading |
| --- | --- | --- |
| warning | `\|φ\| > 0.1 rad` or `\|u\|/L > 0.1` | the result leaves the validity range of first-order theory |
| error | `\|φ\| > 1e3 rad` or `\|u\|/L > 1e4` | this is not a deformation but a motion → kinematic |

**The limits come from the theory, not from a guess about plausibility.**
First-order theory assumes `sin φ ≈ φ` and equilibrium on the undeformed system;
above roughly `0.1` neither is an approximation any more. Both quantities are
dimensionless — `rad` and `u/L` — so the limits carry no unit and need no scaling
by section, span or material. The error stage sits above anything a stable system
produced in the measurement (`1.2e+1 rad`) and seven orders below the mildest
mechanism that slipped through (`3.3e+10 rad`).

`|u|/L` gets one decade more headroom than `|φ|` because it is **mesh
sensitive**: the same 20 m cantilever measures `7.9` as one element and `1.6e2`
as twenty, since the reference length is the attached beam. Rotation does not do
this. That makes rotation the more dependable of the two, and the relative
displacement the one that needs the extra room.

The check runs **before** the reactions and end forces are computed. Unusable
displacements must not turn into unusable internal forces — those would look
plausible and travel on as numbers.

## The honest limit

The check only sees the mechanism **if the load excites it**. A load whose
resultant passes through the pivot point produces no motion: the check stays
silent, the model is still kinematic, and the solution is still not unique. This
is why it is the *fourth* net and not a replacement for the third. Both are kept,
and the package's `CONTEXT.md` records the staggering.

## Why it lives in `fem-solver`

`@baustatik/linear-solver-wasm` knows only numbers. Turning a row index into a
node and a direction requires the `free[i]` mapping, which exists only here — the
same ownership split that ADR 0012 already drew for `SingularStiffnessMatrixError`.
The four limits are data, not a capability, so they join the versioned
`AnalysisPolicy` as `deformationLimits` rather than becoming a port (ADR 0011).
`ANALYSIS_POLICY_SCHEMA_VERSION` goes from 1 to 2; no migration path exists,
because at the time of the bump `parseAnalysisPolicy` had no production caller
and nothing was persisted. (That counter reached `3` and was then removed
entirely — the policy is versioned by the document that carries it,
[ADR 0049](0049-the-tool-document-is-the-versioned-record-unit.md). The
`deformationLimits` decision here is unaffected.)

Unlike `SingularStiffnessMatrixError`, `ImplausibleDisplacementError` names the
node **exactly**. The pivot marks where the rank deficiency became visible during
elimination; the displacement marks the degree of freedom that actually moves.

## Consequences

- `SolveResult` gains `warnings: SolveWarning[]` — the one outward API change.
  It fits the existing line that a result describes itself (`loadCaseId`): a
  result that does not carry its own caveats cannot be filed. `SolveWarning` is a
  third narrow warning root beside `ModelValidationWarning` and
  `LoadValidationWarning`, because a finding about the *computation* concerns
  neither the model nor the input.
- `check()` still cannot report kinematics, and that part of ADR 0012 is
  unchanged. The check runs before there is a result to inspect.
- The measurement is a permanent artifact:
  `packages/fem-solver/tests/kinematics-margin.test.ts` regenerates
  `docs/messungen/kinematik-abstand.md` on every run. It deliberately runs with
  the deformation check **disabled** — with the limits that came out of it, it
  would only prove itself.

## Rejected

**Carrying an assembly noise floor along.** Numerically the cleanest route: track
the magnitude of the largest term cancelled per row and compare the pivot against
*that* instead of a fixed constant. It attacks the actual cause. It was rejected
for cost — it means instrumenting the assembly loop, the hottest code in the
package — against a benefit smaller than the deformation check, which catches the
same cases from the far side. Worth keeping on the shelf, not worth building now.

**Eigenvalue solver or condition estimator.** They read the same corrupted matrix
and see the same well-posed perturbed problem, at several times the cost of the
factorization. See "Why no better factorization helps".

**A topological pre-check** (counting `n·3 − constraints`). Already rejected in
ADR 0012 and rejected again for the same reason: necessary but not sufficient, it
calls a laterally unbraced frame with the right number of supports stable.

**Raising the pivot threshold.** See above — it trades misses for false alarms on
slender but load-bearing systems, and the price rises with model size.
