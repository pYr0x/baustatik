# Analysis settings split into a versioned policy and ports

> **Amended by [ADR 0049](0049-the-tool-document-is-the-versioned-record-unit.md)
> on *where* the version sits.** The split below — data versus capability — is
> untouched, and so is "the version sits on the record rather than on the
> program". What changed is which record: `AnalysisPolicy` no longer carries a
> `schemaVersion` of its own. It is a mandatory field of the `FEMModelSnapshot`
> (v13), and that document versions it. `ANALYSIS_POLICY_SCHEMA_VERSION` and
> `UnsupportedAnalysisPolicySchemaVersionError` are gone; `parseAnalysisPolicy`
> checks form only. The reasoning below is kept as it was written, when the
> policy still travelled alone.

An **analysis setting** is anything that steers the computation without changing
the model. A column's cross-section belongs to the model; whether its shear
deformation is accounted for is a setting.

> Renamed by [ADR 0020](0020-section-properties-versus-section-stiffness.md):
> `getSectionProperties` is now `getSectionStiffness`. The original name is
> kept below because this is a record of a decision, not API documentation.

Analysis settings fall into **two kinds**, and that dividing line is the whole
design:

| Kind | Examples | Lives in | Persisted |
| --- | --- | --- | --- |
| **Data** — writable as JSON | tolerances, warning thresholds, `shearDeformation` | `AnalysisPolicy` | yes, versioned |
| **Capability** — is code | `formulation`, `solveLinearSystem`, `getSectionProperties` | ports on `SolverConfig` | no |

## Why `formulation` stays a port

`formulation` *is* an analysis setting conceptually — it simply cannot be
written down. A function object has no JSON form, and the JSON form is the
entire purpose of `AnalysisPolicy`. The same rule explains
`solveLinearSystem`: "direct or iterative" would be a persistable setting,
"*this* solver implementation" is a port.

**If** the choice of formulation ever has to be persisted, the route is a name
discriminator (`'timoshenko-2d'`) plus a registry in the solver. That buys two
paths to the same answer — the name and the object — and someone then has to
rule on which wins. Unnecessary today: per ADR 0004 `Timoshenko2DIntegrated` is
a cross-check, not a user option. When the time comes, it gets its own ADR.

## Each package owns its own slice

Every package exports its own typed policy slice with its default and its value
checks; `@baustatik/fem-solver` composes those slices with its own analysis
decisions into a versioned `AnalysisPolicy`. It is the composition root.

The alternative — one central policy file that knows every number — was
rejected because the number and the rule it guards would then live in different
packages. `suspiciousReferenceFactor` is only meaningful next to the reasoning
in `fem-loads/CONTEXT.md` about the 5° flat roof and the 0.57° beam. A knob
whose justification lives elsewhere is a knob nobody can set responsibly.

No new package boundary appears: `fem-solver` already depends on `fem-loads` and
`fem-element` for domain reasons. `fem`, `fem-element` and `fem-load-resolve`
get no slice at all — see *What stays out* below.

## The persisted form is complete, not a diff

`AnalysisPolicy` carries `schemaVersion` and the **full effective** settings,
never just the overrides. Storing overrides would make a project compute
differently after a change to the software defaults, silently. A project outlives
a release of the program, so reproducibility beats brevity.

The version sits on the record rather than on the program so the parser can say
*"this file is newer than this program"* instead of failing on a field it does
not know. `parseAnalysisPolicy` therefore checks the version **first** and only
then the shape: a document from a later version legitimately carries fields this
version has never heard of, and "unknown field" would be the wrong answer to it.
`UnsupportedAnalysisPolicySchemaVersionError` and `InvalidAnalysisPolicyError`
are separate classes because the user can do different things about them — a
broken setting gets repaired, a newer file gets opened with a newer program.

## Strict parser against value-checking factory

Two entry points with a deliberate division of labour:

- `create…Policy(overrides?)` receives a **typed** argument and therefore checks
  only **values** (finite, non-negative, `0 <= minimum < suspicious <= 1`). That
  the fields are named what they are named is something the compiler already
  said.
- `parse…Policy(unknown)` is the border crossing from JSON and is the only place
  that checks the **shape**: complete, no unknown fields, every field the right
  type.

The same shape check in both places would be two truths about one shape.

Leaves delegate to their owner: `createAnalysisPolicy` calls
`createLoadValidationPolicy`, `parseAnalysisPolicy` calls
`parseLoadValidationPolicy`, and their errors travel outward unchanged. A
solver-owned error class for a load-owned rule would give one finding two names.

## Immutable objects with default identity

All policy objects are `Object.freeze`d and `readonly`. Because of that,
`createLoadValidationPolicy()` and `createAnalysisPolicy()` return the default
object **itself** rather than a copy — copying an immutable value buys nothing,
and identity gives `DEFAULT_ANALYSIS_POLICY.loads ===
DEFAULT_LOAD_VALIDATION_POLICY` as a checkable statement that the composition
root does not quietly rebuild a foreign slice. The parsers always build fresh:
their input is foreign data.

## Binding via `createLoadValidator`, not an optional parameter

`validateLoad(model, load, policy?)` was rejected. The realistic failure is not
that someone deliberately uses two different policies — it is that someone
**forgets** the third argument. The input dialog would call
`validateLoad(geom, draft)` with the default policy while the solver computes
with an overridden one: the dialog then accepts what the Compute button
rejects, and nothing anywhere shows it.

So the policy is bound once, like the formulation in ADR 0003:
`createLoadValidator(policy)` returns `{ validateLoad, validateLoads,
assertValidLoads }`. The three free exports keep their two-argument signatures
and are the default validator's exits — no call site changes, and there is no
forgettable argument left. Anyone wanting a different policy must go through the
factory.

`fem-solver` resolves the context once in `createFEMSolver` (`ResolvedAnalysis`:
policy, bound validator, formulation) so `check()` and `solve()` cannot drift
apart. The PULL getters stay dynamic — they deliver *model data*, which changes;
a setting that changes under your hand would not be a setting.

## `shearDeformation` moved

`SolverConfig.shearDeformation` is gone; the switch lives at
`AnalysisPolicy.shearDeformation`. It was **moved, not duplicated** — two
sources for one switch are two truths. It is also the first field a user
actually turns; the rest are numeric guards.

Because the policy is always complete, `solve()` now compares
`shearDeformation === true` instead of `=== false` against an optional field.

## What stays out

- **`fem-element`: `GEOMETRY_EPS` stays a private constant.** In the wired-up
  chain the value has **no effect**: `fem-load-resolve` clamps every station to
  `[0, L]` with `Math.min(Math.max(absolute, 0), L)` (`resolve.ts:257`), so
  `requireOnElement` never sees a value outside the interval. A configurable
  value that produces identical behaviour for every admissible setting would be
  persisted state without effect — plus an error class, two more public
  factories, and a persisted field named after a beam theory although the value
  contains nothing Timoshenko-specific. ADR 0003 and ADR 0004 are untouched.
- Exact model invariants in `packages/fem` (zero length, uniqueness, graph
  rules).
- The percent definition `100` and the `[0, L]` clamp in `fem-load-resolve`.
- DOF counts, Gauss coefficients, positivity/finiteness rules and the exact
  `phi === 0` semantics in `fem-element`.
- DOF counts, the exact zero guards for condensation and free degrees of
  freedom, and the coarse non-finiteness check on the linear solver's result in
  `fem-solver`.
- The ports `formulation`, `solveLinearSystem` and `getSectionProperties` — see
  the table at the top.
- No new condition-number, rank or near-singularity limits, and no worker/WASM
  change.

## What this does not decide

UI, store wiring and project migration are not part of this. The data model and
the strict parser are the seam they attach to.
