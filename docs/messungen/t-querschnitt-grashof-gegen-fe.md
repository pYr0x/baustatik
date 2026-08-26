# T-Querschnitt: Grashof gegen FE — geschlossen

Erzeugt von [`verifaction/t-querschnitt-grashof-gegen-fe.mjs`](../../verifaction/t-querschnitt-grashof-gegen-fe.mjs).
Beleg zu [ADR 0062](../adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md) —
und, in der Tabelle „Was vorher war", zur Lücke, die [ADR 0045](../adr/0045-solid-section-values-are-nu-free-coefficients.md)
und [ADR 0047](../adr/0047-the-solid-section-fe-lives-in-its-own-package.md) offen ließen.

## Die Frage, in ihrer zweiten Fassung

Der Vollquerschnitt hatte zwei Maschinen: die parametrische Form rechnete κ nach
Grashof (`shear.ts`), die gezeichnete Figur über die FE. Seit ADR 0062 schreibt
die Form sich über `shapeOutline` als `Ring[]` aus und läuft durch dieselbe FE.

Gefragt ist damit nicht mehr, wie weit die beiden auseinanderliegen, sondern ob
sie **dieselbe Figur** sind — und die Antwort muss BITGENAU ja lauten, nicht
„auf sechs Stellen". Zwei Wege, die dieselben Punkte erzeugen, erzeugen dasselbe
Netz und dieselbe Faktorisierung.

Gemessen mit 20000 Tri6-Elementen je Figur (`@baustatik/mesh-2d-wasm`,
`@baustatik/sparse-solver-wasm`).

## Der geschlossene Zustand

`shapeOutline(spec)` gegen den von Hand geschriebenen Ring derselben Figur —
beide durch `computeFESectionValues`. Verglichen werden `It`, `yM`, `zM` und
beide κ-Koeffizienten, auf Gleichheit und nicht auf Nähe.

| Figur | `bf/bw` | Elemente | Form κ_z (ν=0) | Zeichnung κ_z (ν=0) | bitgleich |
| --- | --- | --- | --- | --- | --- |
| Plattenbalken 2000/200/250/500 | 8.00 | 31016 | 0.197151001 | 0.197151001 | ja |
| Plattenbalken 1000/150/300/600 | 3.33 | 31082 | 0.451492106 | 0.451492106 | ja |
| Stahl-T 200/15/10/200 | 20.00 | 31212 | 0.328544241 | 0.328544241 | ja |
| Quadrat-T 300/150/150/300 | 2.00 | 31071 | 0.676598592 | 0.676598592 | ja |

## Die Gegenprobe: Formel gegen Netz

`A` und `Iy` fallen bei der Form aus der geschlossenen Formel und beim FE-Lauf
aus dem NETZ (`state.fingerprint`). Die Formel ist damit nicht mehr der zweite
Rechenweg, sondern das **Orakel** des ersten (ADR 0062).

| Figur | `A` Formel [m²] | `A` Netz [m²] | Δ | `Iy` Formel [m⁴] | `Iy` Netz [m⁴] | Δ |
| --- | --- | --- | --- | --- | --- | --- |
| Plattenbalken 2000/200/250/500 | 4.750000e-1 | 4.750000e-1 | 2.54e-12 % | 5.843202e-3 | 5.843202e-3 | -9.20e-13 % |
| Plattenbalken 1000/150/300/600 | 2.850000e-1 | 2.850000e-1 | -7.01e-13 % | 8.954112e-3 | 8.954112e-3 | 1.41e-12 % |
| Stahl-T 200/15/10/200 | 4.850000e-3 | 4.850000e-3 | -1.59e-12 % | 1.677590e-5 | 1.677590e-5 | 1.41e-13 % |
| Quadrat-T 300/150/150/300 | 6.750000e-2 | 6.750000e-2 | 1.03e-13 % | 4.640625e-4 | 4.640625e-4 | 4.79e-13 % |

## Was jetzt an der Form steht

Mit aufgelöstem FE-Block gibt `sectionProperties` für `kind: 'shape'` dieselben
Werte wie für die gezeichnete Figur. `zM` ist die Zahl, die vorher fehlte.

| Figur | `d0` | `d2` | `It` [m⁴] | `zs` [m] | `zM` [m] |
| --- | --- | --- | --- | --- | --- |
| Plattenbalken 2000/200/250/500 | 5.072254 | 5.097862 | 6.898899e-3 | 0.139474 | 0.112658 |
| Plattenbalken 1000/150/300/600 | 2.214878 | 0.068358 | 4.768251e-3 | 0.217105 | 0.132302 |
| Stahl-T 200/15/10/200 | 3.043730 | 0.002795 | 2.809221e-7 | 0.045644 | 0.007819 |
| Quadrat-T 300/150/150/300 | 1.477981 | 0.078048 | 4.691997e-4 | 0.125000 | 0.108420 |

## Ohne FE-Block

Der dritte Zustand, und der Preis dieser Entscheidung: eine frisch eingegebene
Form ist **schubstarr**, bis ein Lauf sie auflöst. Grashof lieferte immer eine
Zahl — auch dort, wo sie um 134 % danebenlag.

| Figur | `It` | `kappaZ` |
| --- | --- | --- |
| Plattenbalken 2000/200/250/500 | – | schubstarr |
| Plattenbalken 1000/150/300/600 | – | schubstarr |
| Stahl-T 200/15/10/200 | – | schubstarr |
| Quadrat-T 300/150/150/300 | – | schubstarr |

## Was vorher war

Die Zahlen, die den Umbau entschieden haben — Lauf vom 2026-08-17, als
`solidPaths` in `calculation/shapes/t-section.ts` noch existierte. Sie werden
nicht mehr gerechnet, sondern **zitiert**: die Grashof-Pfade des
Vollquerschnitts sind gelöscht. `Δ` ist, um wieviel Grashof über der FE lag —
positiv heißt: Grashof rechnete den Querschnitt **schubsteifer**, als er ist.

Die FE-Spalte ist NEU GERECHNET, die Grashof-Spalte zitiert — deshalb weichen
die Prozentzahlen in der zweiten Nachkommastelle von der Fassung vom 2026-08-17
ab (anderes Netz). Die Aussage bewegt sich davon nicht: die Lücke lag zwischen
rund +11 % und rund +134 %.

| Figur | Grashof κ_z | FE κ_z (ν=0) | Δ (ν=0) | Δ (ν=0,2) | Δ (ν=0,3) |
| --- | --- | --- | --- | --- | --- |
| Plattenbalken 2000/200/250/500 | 0.437009 | 0.197151 | +121.66 % | +127.85 % | +133.53 % |
| Plattenbalken 1000/150/300/600 | 0.605606 | 0.451492 | +34.13 % | +34.25 % | +34.35 % |
| Stahl-T 200/15/10/200 | 0.363692 | 0.328544 | +10.70 % | +10.70 % | +10.70 % |
| Quadrat-T 300/150/150/300 | 0.781654 | 0.676599 | +15.53 % | +15.70 % | +15.85 % |

## Was hier NICHT steht

Keine Schranke. Welche Abweichung tragbar ist, entscheidet ein ADR und nicht
dieses Messgerät. Was der Bericht belegt, ist die GLEICHHEIT der beiden
Eingabearten — nicht, dass die FE-Zahl richtig ist. Dafür stehen die Orakel in
`packages/cross-section-fe/tests/oracles.test.ts`.
