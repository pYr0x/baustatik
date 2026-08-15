# `@baustatik/sparse-solver-wasm`

## Purpose

Der dünnbesetzte Gleichungslöser `K d = F` für symmetrisch positiv definite
Systeme, übersetzt nach WebAssembly.

```
Aufrufer --(n, Triplets(K), k, F[n × k])--> solve() --{ d[n × k] } | { unfixed, singularIndex, pivotRatio }--> Aufrufer
                                               ^
                                               nur Zahlen; keine Geometrie, keine Elemente
```

Er bleibt vom dichten `@baustatik/linear-solver-wasm` getrennt. Ein Fehlschlag
heißt hier, dass die Fixierung fehlt oder das Netz in unverbundene Teile zerfällt;
er bedeutet nie Kinematik eines Stabwerks. Die physische Grenze bewahrt beide
Verträge und lädt auf dem jeweiligen Rechenweg nur das benötigte Artefakt
(ADR 0042).

**Zwei Aufrufer, ein Vertrag.** Gebaut wurde dieses Paket für die
Querschnitts-FE; seit
[ADR 0043](../../docs/adr/0043-the-solver-is-an-analysis-setting.md) rechnet
auch das **Stabwerk** darüber, und zwar voreingestellt. Am Vertrag ändert das
nichts: `unfixed` heißt weiterhin *die Matrix ist nicht positiv definit* und
nicht *Mechanismus*. Die Übersetzung in die Sprache des jeweiligen Fachgebiets
macht der Port-Adapter der Anwendung, nicht dieses Crate.

## Boundaries

- Owns: den Aufbau von `K` aus Triplets, die **Jacobi-Skalierung**, AMD als
  fill-in-reduzierende Umordnung, die sparse Cholesky-Zerlegung und die
  Rücksubstitution für alle rechten Seiten einer Matrix; dazu die Erkennung des
  **fast** singulären Falls samt der Schwelle `SINGULAR_PIVOT_TOLERANCE` und das
  Zurückrechnen des gemeldeten Index aus der AMD-Umordnung.
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
   liest nur das untere Dreieck. **Doppelte Einträge werden summiert** — auch
   für die Skalierung, nicht nur beim Aufbau der Matrix. Eine FE-Assemblierung
   trägt denselben Platz mehrfach an; skalierte die Diagonale nach dem letzten
   Triplet statt nach ihrer Summe, wäre `pivotRatio` eine andere Größe als im
   dichten Schwesterpaket.
2. `F` und `d` sind spaltenweise flach. Für `k` rechte Seiten stehen zuerst die
   `n` Werte der ersten und danach die `n` Werte der nächsten Spalte.
3. Ein nichtpositives Pivot ist ein Modellbefund und wird als
   `SparseSolveOutcome.unfixed` zurückgegeben. Formfehler, nicht endliche Werte
   und fehlerhafte Array-Längen sind Vertragsbrüche und werden zu `JsError`.
4. **`singularIndex` steht in der Nummerierung des AUFRUFERS.** Die Zerlegung
   rechnet in einer AMD-Umordnung, und faer zählt die gescheiterte Spalte ab
   eins. Beides wird zurückgerechnet, bevor der Index das Paket verlässt — ein
   Index in der falschen Nummerierung wäre schlimmer als gar keiner. Belegt vom
   Test `die_gemeldete_zeile_steht_in_der_nummerierung_des_aufrufers`.
5. **`pivotRatio` ist dieselbe Größe wie im dichten Schwesterpaket**, mit
   derselben Schwelle `1e-12`: das kleinste Pivot der SKALIERTEN Matrix, deren
   Diagonale überall 1 ist. Auch im GELUNGENEN Fall — genau das fängt die fast
   singuläre Matrix. Der Beleg, dass beide Pakete dasselbe messen, ist eine
   Zahl: derselbe skalierte Kragarm liefert auf beiden exakt `1/4`, unabhängig
   von `EI` und `L`.
6. **Die Zerlegung wird auf `FORCE_SIMPLICIAL` festgelegt.** Nur in dieser
   Anordnung steht die Diagonale von `L` an der ersten Stelle jeder Spalte
   (`values[col_ptr[j]]`) und ist damit lesbar. faers Heuristik zwischen
   simplicial und supernodal ist eine Geschwindigkeitsentscheidung; sie darf
   nicht darüber entscheiden, ob das Pivot überhaupt zu haben ist. Deshalb
   läuft die Zerlegung über `factorize_symbolic_cholesky` /
   `factorize_numeric_llt` und nicht über `sp_cholesky` — letzteres gibt weder
   die Permutation noch die Werte von `L` heraus.
7. `SparseSolveOutcome` ist eine wasm-bindgen-Struct. Der Aufrufer liest die
   Getter und ruft vor dem `postMessage` stets `free()` auf.
8. `solve_checked` bleibt vom WASM-Rand getrennt, damit `cargo test` die
   Fehlerpfade ohne `JsError` prüft.

## Build

`scripts/run-with-toolchain.mjs` nutzt lokal zuerst `wasm-pack` beziehungsweise
`cargo`. Fehlt das Werkzeug, baut es bei Bedarf das Image aus
`docker/Dockerfile.rust` und führt den Task in
`baustatik/rust-wasm:1.0.0` aus. Nur ohne lokale Toolchain und Docker akzeptiert
der Build ein vorhandenes `pkg/`; CI und `FORCE_WASM_BUILD=1` verlangen immer
die native Toolchain.

```text
pnpm --filter @baustatik/sparse-solver-wasm build
pnpm --filter @baustatik/sparse-solver-wasm test
```
