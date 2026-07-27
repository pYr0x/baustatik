# A beam release is named in the local frame, and it is named after the degree of freedom

`Beam.releases` used to read

```ts
releases?: { start?: { phiY?: true }; end?: { phiY?: true } }
```

It now reads

```ts
releases?: { start?: BeamEndReleases; end?: BeamEndReleases }
type BeamEndReleases = { u?: true; w?: true; theta?: true }
```

Two decisions are packed into that: **which frame the name belongs to**, and
**what the name refers to**.

## Local, because the release is a local condition

`phiY` is the node world's word (`NodeSupport.ux/uz/phiY`, `@baustatik/fem`).
The release was never a node condition: `fem-solver` condenses it out of the
**local** 6×6 *before* the transformation, and both the code and its comment
said so from the start — "erst kondensieren, dann drehen".

Nobody noticed the mismatch because an in-plane rotation is frame-invariant:
`phiY` and `theta` differ by a sign (ADR 0005), not by the beam angle, and a
release flag carries no sign — it is a `true`, not a value. So for the rotation
the wrong name was harmless.

For a **translation** it stops being harmless. On a beam at 30° a released `u`
is a slide along the beam axis; a released `ux` would be a slide along global x.
Those are different releases, and they produce different stiffness matrices. The
moment `u` and `w` were added, the name had to say which system it means.

The local vocabulary already existed one package over: `@baustatik/fem-element`
fixes `d_e = [u1, w1, theta1, u2, w2, theta2]`. Taking those three words gives
the release object the same order as the condensation indices `0/1/2` and
`3/4/5` in `prepareBeam`. There is nothing to translate anywhere.

## Named after the degree of freedom, not after the internal force

The serious alternative was `{ N, V, M }` — naming the release after the
internal force it fails to transmit. It reads closer to what an engineer says
("Normalkraftgelenk"), and it dodges the frame question entirely, because
internal forces only ever exist locally.

It was rejected because the mechanism is condensation, and condensation works on
degrees of freedom. `condense(K, f, 2)` removes a *row*, not a force. Naming the
input `M` would put a second translation (N↔u, V↔w, M↔theta) between the field
and the line of code that acts on it, for no gain — the two vocabularies are in
bijection here anyway, so nothing is expressible in one and not the other.

The engineer's word survives where it belongs: in the doc comment on each field
(`w` — *das Querkraftgelenk*) and in the test names.

## What `u` and `w` bring that `theta` did not

Releasing a **translation** removes that stiffness from the beam **entirely**,
not just at the released end. For the axial part it is a two-line check: from
`[[EA/L, −EA/L], [−EA/L, EA/L]]`, condensing `u1` leaves
`K[u2][u2] = EA/L − (EA/L)²/(EA/L) = 0` — exactly zero, not a rounding residue.
That is physically right: a beam that can slide *somewhere* carries no normal
force *anywhere*. The same holds for `w` and the transverse stiffness, where
condensing `w1` leaves `K[w2][w2] = 12EI/L³ − (12EI/L³)²/(12EI/L³) = 0`.

A moment release does not behave this way: after condensing `theta1` the pin-
ended beam still has `K[theta2][theta2] = 3EI/L`.

The consequence lands on one line. `condense` returns early on a zero pivot, and
that branch was documented as a guard against "widersprüchliche Eingaben" — a
defensive branch nothing reached. With `u` released at **both** ends it is now
on the ordinary path: the second call finds a pivot of exactly 0 and correctly
does nothing, because the first call already took the whole stiffness. The
branch keeps its behaviour, gets an honest comment, and gets a test.

## Releases at both ends stay legal

Same reasoning `packages/fem/src/validate.ts` already gives for the pin-ended
beam: a beam that slides lengthwise still transmits shear and moment, so by
itself it is not a mechanism. Whether the *system* becomes kinematic is decided
by the equation system, and `fem-solver` has two nets for that (ADR 0012,
ADR 0016). Forbidding the input here would forbid legitimate models to catch a
case that is caught anyway.

## Consequences

- `Beam.releases` is a breaking change to `@baustatik/fem`. It is cheap right
  now — `releases` appears outside `fem`, `fem-solver` and their tests nowhere,
  nothing persists it, and the demo store cannot set it yet. After the joint
  symbol and the demo input (TODO 3a) it would not be.
- `@baustatik/fem-solver` condenses six indices instead of two. Nothing else in
  the chain changes: condensation is theory-free matrix algebra, and the
  transformation never saw the release.
- `internalForces` (TODO stage 2) inherits the condition unchanged, but for
  three quantities instead of one: `N(0)`, `V(0)` and `M(0)` must meet
  `elementEndForces` — at a release, exactly 0.
