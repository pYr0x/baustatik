# The check report carries a state, not a flag with a reason

`solver.check()` returns a `CheckReport` whose `state` is one of five values:

```ts
state: 'empty' | 'invalid' | 'unloaded' | 'ready-with-warnings' | 'ready'
canSolve: boolean   // derived from state, never stored beside it
```

It replaces `solver.validate()`, which returned `LoadValidationError[]`.

## Why the list had to go

An array of complaints cannot express what the workflow needs. An empty array
meant two different things: *checked and fine*, and *there was nothing to
check*. A model with no loads is not wrong — it is merely not computable
(`d = 0` is the right answer to the wrong question). That ambiguity is what
makes a Compute button unbuildable, and an `EmptyLoadSetError` would have been
the wrong repair: the user has not made a mistake, they are not finished.

The name changed with the shape. `validate()` meant "check the loads"; with the
model inside, the same name would have been a silent widening. It is removed
rather than kept alongside — two checking exits, one of which tells half the
truth, is the very ambiguity the report exists to remove.

## Why a discriminant rather than a boolean plus a reason

The design sketched in `apps/demo/fem-viewer.ts` (v5, section O) proposed
`canSolve: boolean` together with `reason?: 'model-invalid' | 'loads-invalid' |
'no-loads' | 'empty-model'`. That sketch opens this ADR because it is written
down in the repository and would otherwise be picked up again.

It has two defects. It admits states that do not exist — `{ canSolve: true,
reason: 'no-loads' }` and `{ canSolve: false, reason: undefined }` are both
type-correct. And it cannot express READY_WARN, the fourth of the five states
the same sketch enumerates one section earlier: a caller would have to
recompute it from `warnings.length > 0` itself.

A discriminant maps the five states one-to-one. `canSolve` survives as a derived
property so the button stays one line and no interface re-derives the same
disjunction, but it is computed from `state` in a single place — a projection,
not a second truth.

## Two decisions the shape forces

**Precedence.** Several states can apply at once (an empty model is also
unloaded), so the order is fixed: `empty` → `invalid` → `unloaded` →
`ready-with-warnings` → `ready`, first match wins.

**`empty` means no beam** — not "no beam and no support" as the sketch had it.
The beam is the thing being computed; without one there is no stiffness, however
much else is lying around. Nodes and supports without beams announce themselves
as `IsolatedNodeWarning` anyway.

## Ordering and short-circuit belong in the package

Load validation asks the model for `beamAxis`. With a dangling node reference it
reports an additional `UnknownLoadTargetError` for *every* load on that beam — one
model error becomes twenty messages, nineteen of them consequences. So the model
is checked first, and on a model error the loads are not assessed at all. The
report says so explicitly (`loads: { assessed: false }`) rather than returning an
empty list, because "found no load errors" and "did not look" must not look
alike.

Doing this in the application would mean every application getting the order and
the short-circuit right again.

## No cache

The report is built fresh on every call, like `geometry()`. It goes stale the
moment the store changes, and noticing that is the application's job — the one
piece of state the workflow genuinely needs ("checked since the last change:
yes/no") lives at `store.$subscribe`, not in the package. A greyed-out verdict
about a model that has since changed is worse than no verdict.

## `solve()` still checks

`solve()` runs `assertValidModel` and `assertValidLoads` regardless of whether
`check()` was called. The report is information, not a key
(`error-handling-in-libraries.md`). Warnings stop nothing.
