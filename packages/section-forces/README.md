# `@baustatik/section-forces`

The six section forces at one location along a beam. One type, no dependencies,
no arithmetic.

```ts
import type { SectionForces } from '@baustatik/section-forces';

const planeFrame: SectionForces = { N: -120, Vz: 50, My: 100 };
const spatial: SectionForces = { N: -120, Vy: 10, Vz: 50, My: 100, Mz: 8, Mt: 0 };
```

Every field is optional: the plane frame fills three, a later spatial solver
six.

The **sign convention** is in the JSDoc at the fields:

```text
My = +∫ z·σ dA              Mz = −∫ y·σ dA
My > 0 = tension on +z      Mz > 0 = COMPRESSION on +y
dMy/dx = +Vz                dMz/dx = −Vy
```

Details, boundaries and reasoning: [`CONTEXT.md`](./CONTEXT.md),
[ADR 0060](../../docs/adr/0060-the-section-forces-are-right-handed-components.md).
