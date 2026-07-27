# `@baustatik/actions`

Vokabular fuer Einwirkungen nach EN 1990. Ein Typ, keine Abhaengigkeiten, keine
Zahlen.

```ts
import type { ActionCategory } from '@baustatik/actions';

const schnee: ActionCategory = { action: 'variable', kind: 'snow' };
const buero: ActionCategory = {
  action: 'variable',
  kind: 'imposed',
  useCategory: 'B',
};
const eigengewicht: ActionCategory = { action: 'permanent' };
```

Ein Lastfall in `@baustatik/fem-loads` traegt die Kategorie optional. Er
speichert sie und deutet sie nie — psi-Werte, Teilsicherheitsbeiwerte und
Kombinationsregeln gehoeren nicht hierher.

Details, Grenzen und Begruendungen: [`CONTEXT.md`](./CONTEXT.md).
