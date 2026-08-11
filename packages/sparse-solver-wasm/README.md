# `@baustatik/sparse-solver-wasm`

Ein zustandsloser WebAssembly-Löser für symmetrisch positiv definite,
dünnbesetzte Gleichungssysteme. Er nimmt die untere Dreieckshälfte von `K` als
Triplets sowie eine oder mehrere rechte Seiten entgegen.

```ts
import init, { solve } from '@baustatik/sparse-solver-wasm';

await init();

// K = [4 -1; -1 4], F = [2; 3]
const outcome = solve(
  2,
  new Uint32Array([0, 1, 1]),
  new Uint32Array([0, 0, 1]),
  new Float64Array([4, -1, 4]),
  1,
  new Float64Array([2, 3]),
);

try {
  if (outcome.unfixed) {
    throw new Error('Die Fixierung fehlt oder das Netz ist nicht zusammenhängend.');
  }
  console.log(outcome.d);
} finally {
  outcome.free();
}
```

Die Einträge gehören ausschließlich in das untere Dreieck einschließlich der
Diagonale. `F` und `outcome.d` sind spaltenweise flach für `n × k` rechte
Seiten. `unfixed` ist ein Modellbefund, kein Aufruferfehler; Vertragsbrüche
werden als JavaScript-Fehler gemeldet.

```text
pnpm --filter @baustatik/sparse-solver-wasm build
pnpm --filter @baustatik/sparse-solver-wasm test
```
