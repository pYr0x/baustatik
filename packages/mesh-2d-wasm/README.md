# `@baustatik/mesh-2d-wasm`

A small browser and Node ESM facade around Triangle 1.6 for constrained,
quality triangular meshes. It accepts generic two-dimensional rings and knows
nothing about cross-sections, units, or FEM equations.

```ts
import { createMesher2D } from '@baustatik/mesh-2d-wasm';

const mesher = await createMesher2D();
const mesh = mesher.generate({
  rings: [
    {
      kind: 'material',
      coordinates: new Float64Array([0, 0, 1, 0, 1, 1, 0, 1]),
    },
  ],
  element: 'tri3',
  maxElementArea: 0.1,
  switches: { quality: 25, ccdt: true, steiner: 2 },
});
```

`createMesher2D()` initializes WASM once. `generate()` is synchronous after
that. Triangle receives PSLG (`p`), zero-based indices (`z`), and the required
maximum element area (`a`) on every call. Tri6 adds `o2`; its nodes use
`[v0, v1, v2, m01, m12, m20]`.

`switches` exposes `quality` (`q`, default `20`, range `(0, 34]`), `ccdt` (`D`),
`jettison` (`j`), `steiner` (`S`), and `quiet` (`Q`, default `true`). Triangle
guarantees termination only up to `20.7`; values above `34` usually do not
terminate and are rejected. The facade retains PSLG input, holes, boundary
markers, and output shape, so it deliberately does not expose switches that
would break those guarantees (`p`, `z`, `a`, `o2`, `B`, `O`, `r`, `c`, `e`,
`n`, `A`).

## License

This package contains Triangle 1.6. Its license permits private, research, and
institutional use, but commercial distribution requires a direct arrangement
with Triangle's author. Do not use this package commercially without that
arrangement. See `THIRD_PARTY_NOTICES.md` and `vendor/triangle/README`.
