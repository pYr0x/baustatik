# The tool document is the versioned record unit

You look this one up when you are about to give a policy, a sub-record or any
other travelling type its own `schemaVersion` — or when you wonder why
`AnalysisPolicy` lost the one it had.

> **One counter per document. A version on a sub-record is a second truth about
> the same bytes.**

## What changed

`AnalysisPolicy` becomes a mandatory field of `FEMModelSnapshot`, exactly as
`SectionPolicy` has been since
[ADR 0033](0033-the-cross-section-has-a-creation-policy.md). In the same move it
loses `ANALYSIS_POLICY_SCHEMA_VERSION` (last value `3`) and the field
`schemaVersion`. The snapshot goes to **v13**.

```ts
// packages/script/src/types.ts
export interface FEMModelSnapshot {
  readonly schemaVersion: 13;
  // …
  readonly sectionPolicy: SectionPolicy;   // since v7  (ADR 0033)
  readonly analysisPolicy: AnalysisPolicy; // since v13 (this ADR)
}
```

`UnsupportedAnalysisPolicySchemaVersionError` is deleted with it.

## Why the sub-record counter goes

The counter was not wrong when it was written. [ADR
0011](0011-analysis-settings-split-into-versioned-policy-and-ports.md) gave the
policy a version because the policy travelled **alone**: it stood in no
document, so nothing else could say how old it was. That is also why the jumps
1 → 2 and 2 → 3 could happen without a migration path — `parseAnalysisPolicy`
had no productive caller at all, which `packages/TODO.md` §6 records as the
finding that opened this question.

The moment the policy travels **inside** a snapshot, the premise is gone. The
only question its counter answered — *"is this file newer than the program?"* —
is now answered by the document, and answered **earlier**:
`parseFEMModelSnapshot` rejects a foreign version before `parseAnalysisPolicy`
ever sees the sub-record.

Two counters over the same bytes can disagree, and there is no rule for which
one wins. A v13 snapshot carrying a policy stamped `schemaVersion: 2` is not a
question anyone should have to answer at runtime. This is
[ADR 0033](0033-the-cross-section-has-a-creation-policy.md)'s "second truth"
argument, generalised from one policy to the shape of the record as a whole.

So `parseAnalysisPolicy` now checks **form only** — complete, no unknown
fields, value rules — and `schemaVersion` inside it is an unknown field like
any other. Silently tolerating what used to be the version would keep giving an
answer for which there is no longer a truth.

## Why the field is mandatory

The same reason `sectionPolicy` is, and it survives the difference between the
two. `sectionPolicy` **creates**: the carried outline exists because of it, and
substituting a default would assert that a stored figure was built under a
tolerance nobody chose. `analysisPolicy` does not create anything — but
`shearDeformation` and `linearSystem` are **calculation instructions**, and a
substituted default asserts that somebody chose to compute that way.

A policy in a record carries **effective values, not deviations** — otherwise
the same project computes differently once the software defaults move, with no
one having decided anything. That rule is what makes the field mandatory in
both cases.

No migration from v12. There are no stored files, and a migration is a tool
somebody **calls, sees and can decline** — the line ADR 0027 draws and ADR 0033
repeats.

## What this does not decide

- **The ports stay ports.** `formulation`, `solveLinearSystem`,
  `getSectionStiffness` are capability and have no JSON form; ADR 0011's split
  is untouched. This ADR only says where the **data** half is versioned.
- **`sectionPolicy` stays where it is.** Its home in the FEM snapshot is a
  bridge, and it moves to the cross-section tool document when that document
  exists (`packages/TODO.md` §6). Whichever document holds it then versions it
  — which is this decision applied again, not an exception to it.
- **The project container** — name, building project, references to positions —
  is the app's, and it will carry its own single version over its own bytes.

## Consequence for the dependency graph

`@baustatik/script` now depends on `@baustatik/fem-solver`, because the
snapshot type and its parser need `AnalysisPolicy`, `createAnalysisPolicy` and
`parseAnalysisPolicy`. No cycle: `fem-solver` reaches the model through ports
and does not know `script`. It is worth naming, though — the DSL package now
pulls the solver package into its graph, and if a third tool document ever
needs the same type, that is the moment to ask whether `AnalysisPolicy` wants a
package of its own rather than a home inside the thing that consumes it.
