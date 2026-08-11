# `@baustatik/sparse-solver-wasm`

## Purpose

Der dünnbesetzte Gleichungslöser `K d = F` für symmetrisch positiv definite
Systeme, übersetzt nach WebAssembly.

```
Querschnitts-FE --(n, Triplets(K), F[n × k])--> solve() --{ d } | { unfixed }--> Querschnitts-FE
                                                     ^
                                                     nur Zahlen; keine Geometrie, keine Elemente
```

Er bleibt vom dichten `@baustatik/linear-solver-wasm` getrennt. Ein Fehlschlag
heißt hier, dass die Fixierung fehlt oder das Netz in unverbundene Teile zerfällt;
er bedeutet nie Kinematik eines Stabwerks. Die physische Grenze bewahrt beide
Verträge und lädt auf dem jeweiligen Rechenweg nur das benötigte Artefakt
(ADR 0040).

## Boundaries

- Owns: den Aufbau von `K` aus Triplets, AMD als fill-in-reduzierende
  Umordnung, die sparse Cholesky-Zerlegung und die Rücksubstitution für alle
  rechten Seiten einer Matrix.
- Does not own: die FE-Assemblierung, Randbedingungen, die fachliche Deutung
  des Befunds, Worker-Lebenszyklen oder den Querschnitt.
- Hält keinen Zustand. Jede Zerlegung lebt nur innerhalb eines `solve`-Aufrufs,
  damit mehrere rechte Seiten genau eine Zerlegung verwenden können.

Kein Package aus diesem Monorepo importiert dieses Package direkt. Bei seiner
Einbindung kommt es per Port herein; die Anwendung verdrahtet den Port mit
einem Worker (ADR 0009).

## Dependencies

- `faer` 0.24 mit `sparse-linalg` und ohne Default-Features: sparse Cholesky
  mit AMD-Umordnung und Rücksubstitution.
- `wasm-bindgen` 0.2: die Grenze nach JavaScript.

## Invariants

1. `rows`, `cols` und `values` sind gleich lange Triplet-Arrays. Die Indizes
   liegen in `[0, n)` und enthalten ausschließlich `row >= col`; der Solver
   liest nur das untere Dreieck.
2. `F` und `d` sind spaltenweise flach. Für `k` rechte Seiten stehen zuerst die
   `n` Werte der ersten und danach die `n` Werte der nächsten Spalte.
3. Ein nichtpositives Pivot ist ein Modellbefund und wird als
   `SparseSolveOutcome.unfixed` zurückgegeben. Formfehler, nicht endliche Werte
   und fehlerhafte Array-Längen sind Vertragsbrüche und werden zu `JsError`.
4. `SparseSolveOutcome` ist eine wasm-bindgen-Struct. Der Aufrufer liest die
   Getter und ruft vor dem `postMessage` stets `free()` auf.
5. `solve_checked` bleibt vom WASM-Rand getrennt, damit `cargo test` die
   Fehlerpfade ohne `JsError` prüft.

## Build

`scripts/run-with-toolchain.mjs` nutzt lokal zuerst `wasm-pack` beziehungsweise
`cargo`. Fehlt das Werkzeug, führt es den Task im Docker-Image
`rust-wasm:latest` aus. Nur ohne lokale Toolchain und Docker akzeptiert der
Build ein vorhandenes `pkg/`; CI und `FORCE_WASM_BUILD=1` verlangen immer die
native Toolchain.

```text
pnpm --filter @baustatik/sparse-solver-wasm build
pnpm --filter @baustatik/sparse-solver-wasm test
```
