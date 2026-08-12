---
'@baustatik/core': patch
---

`assertNever` closes exhaustive switches from the base package

The repo's rule — close every exhaustive `switch` with `assertNever` — could
only be followed by packages that may depend on `@baustatik/render-core`, which
rules out the domain strand. `assertNever` now sits in `@baustatik/core` next to
`atOrThrow`, throws `AssertionError`, and is available to every package.

`@baustatik/render-core` keeps its own copy and its own `UnreachableCaseError`
for now; merging the two is a separate, deliberate change and would move a
public export.
