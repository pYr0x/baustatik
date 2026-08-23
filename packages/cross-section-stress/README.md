# `@baustatik/cross-section-stress`

σ, τ and σv at the stress points of a cross-section — the numerator to the
denominator `@baustatik/cross-section` supplies.

```ts
import { sectionStresses } from '@baustatik/cross-section-stress';

const rows = sectionStresses(crossSection, { My: 100, Vz: 50 });
// undefined for drawn geometry and for every parametric solid figure

for (const row of rows ?? []) {
  console.log(row.nr, row.wall, row.sigma, row.tau, row.sigmaV); // [MPa]
}
```

For the general case — or for your own points — the inner door:

```ts
import { stressesAtPoints } from '@baustatik/cross-section-stress';

stressesAtPoints(properties, points, { N: 250, My: 100, Mz: 8, Vz: 50 });
```

Three things that can surprise:

- **`tau` is signed**, relative to the tangent (`ty`, `tz`) travelling in the
  same row.
- **`Mt` throws** (`TorsionNotSupportedError`); `Mt: 0` passes through.
- **No maximum, no "governing point"** — one row per point, in input order.

Details, boundaries and reasoning: [`CONTEXT.md`](./CONTEXT.md).
