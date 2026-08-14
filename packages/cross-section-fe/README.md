# @baustatik/cross-section-fe

Two-dimensional finite-element computation of the **drawn solid cross-section**:
the torsion constant `It`, the shear centre after Trefftz, and the shear
correction factor κ stored as a ν-free coefficient pair per axis.

```ts
import { computeFESectionValues } from '@baustatik/cross-section-fe';

const { state, mesh } = await computeFESectionValues(geometry, policy);
if (state.status === 'computed') {
  section.geometry = { ...section.geometry, feValues: state };
}
```

One geometry in, one result out — **no ID**. The door keeps no key and no cache;
deduplication is the application's job and its guard is the `feValues` field in
the record itself.

The returned mesh is **transient**: it exists so the application can draw what
was computed, without meshing a second time. It does not belong in the model
record.

Both boundary-value problems — torsion and shear — are solved for a
**displacement** with a Neumann boundary, so they share one stiffness matrix and
one factorization. A displacement is single-valued on any domain, which is why a
hole anywhere costs nothing: no extra unknown, no side condition, no limit.

Boundaries, invariants and the calibrated formulation:
[`CONTEXT.md`](CONTEXT.md). Decisions:
[ADR 0045](../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md),
[ADR 0047](../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md),
[ADR 0048](../../docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md).
