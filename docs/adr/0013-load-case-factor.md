# The load case factor is a derivation shortcut, not a combination coefficient

`LoadCase` carries an optional `factor` that scales every load value of the case.
It must be finite and non-zero; **negative is explicitly allowed**.

Read cold, this field looks like a mistake — a partial safety factor smuggled
into the input model, where EN 1990 says it belongs to the combination. It is
not, and the difference matters enough to write down, because the wrong reading
leads directly to deleting the field.

## What it is for

Deriving one load case from another by copying.

- **Reversing.** Copy "Wind von links", set `factor = -1`, and you have "Wind von
  rechts" without touching a single load value.
- **Scaling.** Enter a case with unit loads, copy it, set `factor = 1.75`, and
  every load in the copy is 1.75 kN.

Without it, the user retypes a dozen numbers per derived case, and the
relationship between the two cases becomes invisible: nothing in the data would
still say that one is the mirror of the other.

That is also why the negative sign is permitted, even though the sign is the
easiest thing to get wrong. The alternative — forbidding negatives and requiring
the user to re-enter mirrored values — removes exactly the case the field exists
for.

## What it is not

It is not γ, and it is not ψ. Enter `1.35` here and the combination will
multiply by `1.35` again: `1.35 × 1.35 = 1.82`, and nobody sees the 1.82. This
cannot be prevented structurally — the field takes a number and 1.35 is a
number. Two mitigations instead:

1. The type, the CONTEXT glossary and the module header all say so.
2. When combinations arrive, a report **must** show the case factor separately
   from the combination coefficient. A single multiplied number is not
   auditable, and somebody signs these calculations.

`factor = 0` is rejected. It would be a disabled load case through the back door:
the case still exists, still appears in lists, still looks loaded, and
contributes nothing. Disabling a case deserves its own switch, or deletion — not
a magic value. (`-0 === 0`, so one comparison catches both.)

## The check is an assertion, not a factory

`assertValidLoadCase(loadCase)` — deliberately **not** `createLoadCase()`.

A factory was the first attempt and it was wrong twice over. It sat next to
`createFEMViewer` and `createFEMSolver`, which build a machine and hide it, while
returning its own argument unchanged — the name promised a construction that does
not exist. Worse, it did not close the hole it appeared to close: an object
literal bypasses a factory entirely, and `solve()` would then compute with
`factor: NaN` all the way to `NaN` displacements.

An assertion has neither problem. It lives beside `assertValidLoads`, a name this
package already uses, and `solve()` calls it **in the gate** — so the check runs
whether or not the caller ever went through a constructor. `check()` stays silent
about it: an unusable factor is a programmer error, not a model state, in the same
class as `UnrestrainedDegreeOfFreedomError`, which the report also does not
predict.

## The invariant: validate raw, compute scaled

`solve()` runs the gate on the **entered** values and the computation on the
**factored** ones:

```ts
analysis.loadValidator.assertValidLoads(geometry, loadCase.loads);
const resolved = resolveLoads(geometry, effectiveLoads(loadCase));
```

The gate therefore judges numbers that are not the ones being computed with.
That is deliberate: a message reading `Last "l1": Wert q ist nicht endlich` must
name the number the user typed, and `ScaledLoadValue.value` is documented as "as
entered" — with a case factor applied first it would silently become a second
scaling stage and stop being true.

**This only works because no current rule changes its verdict under the factor.**
Zero-ness and finiteness are preserved for any finite non-zero factor, and the
distance rules are untouched because `effectiveLoads` scales magnitudes only:
`p`, `q`, `q1`, `q2`, `m`, `m1`, `m2`, `fx`, `fz`, `my` — never
`distanceFromStart`, `from`, `to` or `referenceLength`. A naive "multiply every
number" would turn a legal position into a `NegativeDistanceError` at
`factor = -1`, on a load the user entered correctly.

Add a rule that judges the **magnitude** of a load value — "anything above
1000 kN is suspicious" — and the invariant breaks silently. The tripwire is the
`Invariante` block in `packages/fem-loads/tests/load-case.test.ts`: if it fails,
do not repair the test. Re-decide. Either the gate starts seeing factored values
(and messages start naming numbers nobody entered), or the new rule accounts for
the factor itself.

## One function, both readers

`effectiveLoads(loadCase)` is the only place the factor is applied, and both the
solver and the viewer go through it — the demo wires
`getLoads: () => effectiveLoads(store.activeLoadCase)`. Otherwise an arrow
labelled 5 kN would sit next to a calculation using 6 kN.

**Rejected: applying the factor after load resolution.** Scaling `ResolvedLoads`
(or `F` directly) is mathematically identical, since resolution is linear in the
load values, and it avoids a mapper over seven load variants. But the viewer
cannot use any of it — it needs factored `FEMLoad` values for arrow direction
and label — so "apply the factor" would exist twice. That is the second truth
this design is built to avoid.
