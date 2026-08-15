# `@baustatik/mesh-2d-wasm`

## Purpose

A generic two-dimensional triangular mesher, compiled from Triangle 1.6 to
WASM. It receives flat rings and returns typed arrays. It has no dependency on
cross-sections, units, FEM equations, Worker, or rendering code.

`createMesher2D()` owns asynchronous WASM startup. The returned `Mesher2D`
instance generates synchronously, so a Worker can initialize one instance and
reuse it for every request.

## Dependencies

- `@baustatik/core` supplies `atOrThrow` for checked internal array invariants.
- `@baustatik/errors` supplies the root of `Mesh2DInputError`.

The demo is the only internal consumer. It owns the Worker lifecycle described
by [ADR 0039](../../docs/adr/0039-meshing-is-a-transient-worker-capability.md).

## Boundaries

- Owns: PSLG validation, scanline hole seeds, Triangle invocation, WASM-memory
  ownership, the fixed quality constraint, and the public Tri6 node order.
- Does not own: geometric model semantics, units, persistence, worker lifecycle,
  or any mesh visualization.

The TypeScript facade validates every PSLG before it reaches Triangle. A ring is
simple, rings must neither intersect nor touch, material rings must be separate,
and every hole belongs to exactly one material ring. Boundary markers are
created from stable input ring positions and returned after Triangle splits a
boundary with Steiner points.

## Invariants

- `maxElementArea` is required, finite, and positive; Triangle always receives
  `p`, `z`, and `a`, with `o2` only for Tri6. `Mesh2DSwitches` additionally
  exposes `q`, `D`, `j`, `S`, and `Q`, while switches that would invalidate the
  PSLG and result contract stay owned by the facade. `quality` is limited to
  `(0, 34]`: Triangle guarantees termination only through `20.7` and usually
  does not terminate above `34`.
- Triangle output and all caller-owned WASM input allocations are freed in
  `finally` blocks. Returned arrays are copies and never view WASM memory.
- The published Tri6 order is `[v0, v1, v2, m01, m12, m20]`, independent of
  Triangle's internal order.
- Triangle source remains unmodified under `vendor/triangle/`; its commercial
  restriction is documented in `THIRD_PARTY_NOTICES.md` and `README.md`.

## Build

`scripts/build.mjs` is the only source of Emscripten flags. It pins Emscripten
6.0.6 in `toolchain.json`, prefers native `emcc` locally and otherwise builds
with `baustatik/emscripten:6.0.6` from `docker/Dockerfile.emscripten`. CI and
`FORCE_WASM_BUILD=1` require native `emcc`. Without either toolchain, the
driver accepts `pkg/` only when its source and toolchain fingerprint matches.
`pkg/` is generated and ignored.

```text
pnpm --filter @baustatik/mesh-2d-wasm build
pnpm --filter @baustatik/mesh-2d-wasm typecheck
pnpm --filter @baustatik/mesh-2d-wasm test
pnpm --filter @baustatik/mesh-2d-wasm lint
```
