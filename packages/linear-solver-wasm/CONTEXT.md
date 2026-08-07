# `@baustatik/linear-solver-wasm`

## Purpose

Der lineare Gleichungsloeser `K d = F` in Rust, uebersetzt nach WebAssembly —
und die Erkennung, dass es keine Loesung gibt.

```
fem-solver  --(n, K, F)-->  solve()  --{ d } | { singularIndex, pivotRatio }-->  fem-solver
                              ^
                              nur Zahlen; keine Knoten, keine Staebe
```

**Stand:** laeuft. `Llt` (Cholesky) statt `PartialPivLu`, mit Jacobi-Skalierung
und Pivot-Schwelle. Dicht besetzt, ein Rechenkern, keine Parallelisierung.

## Boundaries

- Owns: die Zerlegung und den Ruecksubstitutionsschritt; die
  **Kinematik-Erkennung** (exakt und fast-singulaer); die Skalierung, ohne die
  eine feste Pivot-Schwelle nichts aussagt; die Schwelle
  `SINGULAR_PIVOT_TOLERANCE` selbst.
- Does not own: **die Deutung**. Dieses Package weiss nichts von Knoten,
  Staeben, Auflagern oder Richtungen. Es meldet eine ZEILENNUMMER; welcher
  Freiheitsgrad das ist, weiss nur `@baustatik/fem-solver`, weil nur dort die
  Abbildung `free[i] -> Knoten x Richtung` existiert. Ebenso wenig gehoert ihm
  die Assemblierung, die Reduktion auf die freien Freiheitsgrade oder die
  Entscheidung, was mit einem Befund geschieht.
- Haelt **keinen** Zustand. Jeder `solve`-Aufruf ist fuer sich; das WASM-Modul
  wird einmal initialisiert (`init()`), mehr nicht.

## Dependencies

- `faer` 0.24 (`default-features = false`) — `Llt`, `Mat`, `Side`.
- `wasm-bindgen` 0.2 — die Grenze nach JS.

Keine Abhaengigkeit in die andere Richtung: **kein** Package aus diesem Monorepo
wird hier importiert, und `fem-solver` importiert dieses hier NICHT — es kommt
per Port herein (ADR 0009). `apps/demo` ist der einzige Ort, der beide kennt.

## Navigation

- `rust/src/lib.rs` — alles: `solve` (die WASM-Grenze), `solve_checked` (der
  Rechenkern), `SolveOutcome`, die Tests.
- `pkg/` — Build-Ergebnis von `wasm-pack`, nicht eingecheckt.
- `scripts/run-with-toolchain.mjs` — Guard vor `build` und `test`.

## Build ohne Rust-Toolchain

`build` und `test` laufen nicht direkt gegen `wasm-pack`/`cargo`, sondern ueber
`scripts/run-with-toolchain.mjs`. Fehlt das jeweilige Werkzeug auf der Maschine,
wird der Task uebersprungen statt fehlzuschlagen — damit der Monorepo-Build auch
auf einem Rechner ohne Rust durchlaeuft, auf den ein fertiges `pkg/` kopiert
wurde. Uebersprungen wird nur, wenn `pkg/linear_solver_wasm.js` und
`pkg/linear_solver_wasm_bg.wasm` da sind; sonst bricht der Task mit einer Meldung
ab. In CI (`CI` gesetzt) und mit `FORCE_WASM_BUILD=1` wird nie uebersprungen — eine
fehlende Toolchain ist dort ein Fehler.

## Domain language

- **Pivot** — ein Diagonalglied der Zerlegung. Wird es 0 oder negativ, ist die
  Matrix nicht mehr positiv definit.
- **Pivot-Verhaeltnis** (`pivotRatio`) — das kleinste Pivot der SKALIERTEN
  Matrix. Weil deren Diagonale ueberall 1 ist, ist es zugleich das Verhaeltnis
  zum groessten und damit ein billiger Schaetzer fuer den Kehrwert der
  Konditionszahl. `0` heisst „die Zerlegung ist gescheitert".
- **Singulaer** — hier immer gleichbedeutend mit „das Tragwerk ist ein
  Mechanismus". Es gibt in diesem Modell keine andere Ursache.

## Warum Cholesky

`K` ist die reduzierte Steifigkeitsmatrix und damit symmetrisch positiv
**semi**definit: haelt das Tragwerk, ist sie positiv definit; ist es kinematisch,
ist sie nur noch semidefinit. Genau diese Grenze ist die, an der eine
Cholesky-Zerlegung scheitert — das klassische „Null- oder Negativpivot ist ein
Mechanismus". Der Fehlschlag IST das Signal, und nebenbei ist es halb so viel
Arbeit wie eine LU-Zerlegung.

**Nicht ueber die Determinante.** `det(K) = 0` genau dann wenn singulaer ist
mathematisch richtig und numerisch unbrauchbar: `det` ist das Produkt aller `n`
Eigenwerte und laeuft bei realistischen Steifigkeiten (`EA ~ 1e9`) und ein paar
hundert Freiheitsgraden ueber oder unter. Ein voellig stabiler Rahmen liefert
dann `det = 0` durch Underflow, ein Mechanismus `det = 1e-5`. `det` ist
ausserdem nicht skalierungsinvariant — ein Einheitenwechsel aendert es um `2^n`.

**Nicht ueber SVD oder `col_piv_qr`.** Beide sind teurer, und schlimmer: sie
**gelingen** bei einem Mechanismus. Sie liefern ein beliebiges
Least-Squares-Verschiebungsfeld aus dem unendlich grossen Loesungsraum, statt zu
scheitern. Fuer eine Statik ist ein plausibel aussehendes falsches Ergebnis das
schlechteste aller Ergebnisse.

## Invariants and conventions

1. **`K` liegt ZEILENWEISE flach**, `n * n` Werte. Die JS-Seite legt es so ab
   (`fem-solver/src/solve.ts`). Weil `K` symmetrisch ist, waere ein
   spaltenweiser Leser nicht zu bemerken — der Vertrag steht deshalb an beiden
   Enden im Kommentar.
2. **Symmetrie wird vorausgesetzt, nicht geprueft.** `Llt` liest nur das untere
   Dreieck (`Side::Lower`); ein unsymmetrisches `K` wuerde stillschweigend als
   sein eigenes unteres Dreieck gedeutet. Das haelt, solange die Formulierung
   linear und erster Ordnung ist. Kaeme je eine unsymmetrische dazu (Folgelasten,
   manche Kontaktformulierungen), bricht diese Annahme, und dieser Punkt ist
   die Stelle, an der es auffallen muss.
3. **Skalieren, dann Pivots vergleichen.** In `K` stehen Dehnsteifigkeiten
   (`EA/L`) neben Biegesteifigkeiten (`EI/L^3`) — Groessen, die um
   Zehnerpotenzen auseinanderliegen. Ein Vergleich auf der Rohmatrix wuerde
   davon erschlagen. `Ks = S K S` mit `S = diag(1/sqrt(K_ii))` macht die
   Diagonale ueberall 1; erst dann ist ein Pivot mit einer festen Schwelle
   vergleichbar. Der Test
   `ein_schlecht_skaliertes_aber_stabiles_system_kommt_durch` ist der Beleg.
4. **Die Schwelle ist `1e-12`** und nicht kritisch. Die Luecke ist gross: ein
   Kragarm liegt bei `0.25` — und zwar unabhaengig von `EI`, `L` und Material,
   weil die Skalierung die Steifigkeit wegkuerzt und nur die Geometrie
   stehenlaesst (`1 - 36/48 = 1/4`, siehe Test). Ein Mechanismus faellt auf
   `1e-16` und darunter. Zwoelf Zehnerpotenzen dazwischen.
5. **Ein Mechanismus ist kein `Err`.** `Err` ist den Vertragsbruechen
   vorbehalten (falsche Laengen) — dem Fehler des AUFRUFERS. Ein Mechanismus ist
   ein Befund ueber sein Modell und steht deshalb in `SolveOutcome`. Wer beides
   in einen Kanal wirft, kann einen kaputten Worker nicht mehr von einem
   verschieblichen Rahmen unterscheiden.
6. **Keine Panik an der Grenze.** Die frueheren `assert_eq!` wurden im
   Release-Build zu `unreachable executed`, verloren die Meldung und liessen die
   WASM-Instanz mit abgebrochenem Allokator zurueck. Formpruefungen sind
   deshalb `Err`, kein `assert!`.
7. **`solve_checked` ist vom WASM-Rand getrennt**, weil `JsError` sich auf einem
   Nicht-WASM-Ziel nicht bauen laesst. Ohne die Trennung liefe `cargo test` beim
   Bau des Fehlers in eine Panik, und ausgerechnet die Fehlerwege blieben
   ungetestet.
8. **`SolveOutcome` muss in JS freigegeben werden.** Es ist eine
   wasm-bindgen-Struct, also ein Zeiger in den WASM-Speicher — kein
   `structuredClone`, kein `postMessage`. Der Aufrufer liest die Getter aus und
   ruft `free()` (siehe `apps/demo/linear-solver.worker.ts`).

## Known constraints

- **Dicht besetzt.** `K` kommt als `n * n` Werte, die Zerlegung ist `O(n^3)` in
  Zeit und `O(n^2)` im Speicher. Fuer die heutigen Modellgroessen belanglos; ab
  einigen tausend Freiheitsgraden waere eine duennbesetzte Zerlegung faellig
  (`faer::sparse` hat sie, samt `LltError`).
- **Ein Rechenkern.** Kein `rayon`; WASM-Threads waeren ein eigenes Vorhaben
  (Cross-Origin-Isolation, `SharedArrayBuffer`).
- **Die gemeldete Zeile ist ein Hinweis, kein Beweis.** Cholesky pivotiert
  nicht, die Zeile ist also deterministisch — aber sie ist die Stelle, an der der
  Rangabfall waehrend der Elimination sichtbar wird, nicht notwendig der
  Freiheitsgrad, der sich bewegt. Der echte Mechanismus waere der Eigenvektor
  zum kleinsten Eigenwert; den zu rechnen kostet ein Vielfaches der Zerlegung.
- **Kein Residuencheck.** Er wuerde auch nichts bringen: LU wie Cholesky haben
  auch bei fast singulaerer Matrix einen winzigen Rueckwaertsfehler. Das
  Pivot-Verhaeltnis ist das Mass, das etwas aussagt.
- **Nur `f64`.** Kein `f32`-Pfad, keine iterative Nachbesserung.
