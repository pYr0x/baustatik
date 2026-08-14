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

Boundaries, invariants and the calibrated formulation:
[`CONTEXT.md`](CONTEXT.md). Decisions:
[ADR 0045](../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md),
[ADR 0047](../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md).
