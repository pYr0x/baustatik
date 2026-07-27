# Load case data arrives by PULL, the selection arrives as a parameter

`SolverConfig` has a getter for every part of the model — `getNodes`,
`getBeams`, `getSupports`, `getLoadCases` — but `check()` and `solve()` take the
load case as an **argument**:

```ts
getLoadCases: () => readonly LoadCase[];

check(loadCaseId: string): CheckReport;
solve(loadCaseId: string): Promise<SolveResult>;
solveAll(): Promise<SolveResult[]>;
```

There are exactly **two** compute operations and no third: every load case, or one
named one. `solveAll()` exists rather than leaving the loop to the caller because
otherwise every UI writes the same loop — and it is the only place where
`SolveResult.loadCaseId` pays off, since the returned array is readable without a
lookup table beside it. It fails fast, like `solve()`: the model is shared by all
cases, so a model error affects every one of them, and a load error means the
input is not finished. A caller who wants to know *which* case is broken asks
`check(id)` per case first.

Read cold this looks inconsistent: three quarters of the model is pulled, and
the fourth quarter is selected by hand. The split is between **data** and
**selection**, and both halves have their own reason.

## Data stays PULL

Unchanged from ADR 0007: getters mean there is no second copy of the model
beside the store, and every call sees the current state. `getLoadCases()` returns
all cases, which is still a getter over store state — nothing is copied.

## Selection is not data

`fem-solver/CONTEXT.md` used to predict this as `canSolve(caseId)`, and
`packages/TODO.md` proposed the opposite: a `getLoadCase()` port returning the
*active* case. The port version is the smaller change — one line in the config,
one in `solve.ts`, one in `check.ts` — and it was rejected for two reasons.

**It makes the solver read application state.** "Which load case is active" is a
selection the user makes in the UI. A calculation head that reads it computes
something different depending on how the application is being operated, and the
same `solve()` call yields different numbers at different times for reasons
invisible at the call site. The same argument already settled the viewer question
in the other direction: the viewer does *not* learn about load cases, because
which one is visible is the application's business. Applying that rule
consistently means the solver must be **told**, not allowed to look.

**It would have to be undone for combinations.** With a `getLoadCase()` port,
computing every case means mutating view state in a loop:

```ts
for (const c of store.loadCases) {
  store.activeLoadCaseId = c.id;      // view state, mutated to drive a computation
  results.push(await solver.solve());
}
```

With the selection as a parameter it is a plain loop over ids, and the port never
changes again.

**Rejected: passing the `LoadCase` object instead of its id.** `solve(loadCase)`
is the most direct form and needs no lookup, but then the model arrives through
two channels, and a caller can hand over a case that was never in the store —
the single-source guarantee of ADR 0007 would drop from structural to
conventional.

## An unknown id throws

`resolveLoadCase` throws `UnknownLoadCaseError` when no case matches. Not a sixth
`CheckState`: the five states describe how far the *model* has come, and an id
that does not exist says nothing about the model. It is a violated precondition
of the caller.

This is reachable despite ids being UUIDs — not through collisions, but through a
**stale** id: the user deletes the active load case and the UI keeps asking with
the old one.

The lookup uses `find` and does not check uniqueness. Ids come from
`crypto.randomUUID()`, so duplicates are unreachable, and adding a scan on every
call would buy nothing. If project files are ever loaded, that boundary is where
a strict parser belongs — the pattern already exists as
`parseLoadValidationPolicy`.

## Where the rule does *not* apply: the store

The first attempt extended this to writes as well — `addNodeLoad(loadCaseId, …)`
naming its target — and that was over-applied. The user's workflow is: create a
load case, switch into it, then enter loads. For a store action triggered by
someone who has just selected a case, "into the active one" is not a hazard, it is
the specification; fighting it only produces ceremony at every call site.

The distinction that matters is what the operation *is*. A **computation** whose
result gets archived must not silently change meaning with the UI selection — so
the solver is told. A **write** made by a user who is looking at the selection
should follow it — so `addNodeLoad(nodes, load)` targets the active case, and
`activeLoadCaseId` means both "what is drawn" and "where new loads go".
