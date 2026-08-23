# @baustatik/cross-section-fe

Two-dimensional finite-element computation of the **drawn solid cross-section**:
the torsion constant `It`, the shear centre after Trefftz, and the shear
correction factor κ stored as a ν-free coefficient pair per axis — and, from the
same solved fields, σ, τ and σv.

```ts
import {
  computeFESectionValues,
  recoverStresses,
} from '@baustatik/cross-section-fe';

const computation = await computeFESectionValues(geometry, policy);
if (computation.state.status === 'computed') {
  section.geometry = { ...section.geometry, feValues: computation.state };
}

if (computation.kind === 'solved') {
  // Pure and synchronous — the factorization has already run.
  const field = recoverStresses(
    computation.fields,
    { N: 500, Vz: -120, My: 80, Mt: 12 }, // kN, kNm
    0.3, // ν, mandatory and guarded
  );
  field.nodes; // one row per mesh node, MPa and mm — the verification shape
  field.elements; // one value per element, unsmoothed — the raw picture
  field.diagnostics; // worst jump, worst boundary traction, reentrant corners
}
```

One geometry in, one result out — **no ID**. The door keeps no key and no cache;
deduplication is the application's job and its guard is the `feValues` field in
the record itself.

The returned mesh and fields are **transient**: they exist so the application
can draw what was computed and recover a stress from it, without meshing or
factorizing a second time. Neither belongs in the model record.

τ at a mesh node is a **vector** at a place with no distinguished direction, so
this package owns its own result type and does **not** depend on
`@baustatik/cross-section-stress`; the two share σv as a formula, not as a type.
`Mt` is answered here as Saint-Venant torsion and thrown next door.

Both boundary-value problems — torsion and shear — are solved for a
**displacement** with a Neumann boundary, so they share one stiffness matrix and
one factorization. A displacement is single-valued on any domain, which is why a
hole anywhere costs nothing: no extra unknown, no side condition, no limit.

Boundaries, invariants and the calibrated formulation:
[`CONTEXT.md`](CONTEXT.md). Decisions:
[ADR 0045](../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md),
[ADR 0047](../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md),
[ADR 0048](../../docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md),
[ADR 0061](../../docs/adr/0061-the-fe-stress-is-a-vector-at-a-node.md).
