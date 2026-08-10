# Meshing is a transient worker capability

The P4 meshing decision. You look this up when a finite-element mesh is about
to become part of a cross-section record, or when a WASM dependency seems to
belong in a calculation package.

> **A mesh is transient output; the application composes its WASM capability in
> a Worker.**

## Decision

`@baustatik/mesh-2d-wasm` owns only generic PSLG-to-triangle conversion. It
knows neither `SectionGeometry` nor units or FEM equations. `@baustatik/cross-section`
does not import it and does not retain meshes.

The demo supplies the composition seam: its port owns lazy Worker lifecycle and
request IDs; the Worker initializes one mesher once and transfers copied typed
arrays. A fatal Triangle failure discards that Worker, rejects outstanding work,
and lets the next request create a fresh one.

## Consequences

- The later cross-section FEM receives a `GenerateMesh` port instead of a WASM
  dependency.
- A persisted cross-section remains its input geometry and creation policy, not
  a cached, toolchain-dependent triangulation.
- The generic mesher can be tested in Node without a browser, and the worker
  boundary is testable by the demo build without browser automation.
