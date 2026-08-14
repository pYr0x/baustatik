# T-Querschnitt: Grashof gegen FE

Erzeugt von [`verifaction/t-querschnitt-grashof-gegen-fe.mjs`](../../verifaction/t-querschnitt-grashof-gegen-fe.mjs).
Beleg zur offenen Lücke aus [ADR 0045](../adr/0045-solid-section-values-are-nu-free-coefficients.md)
und [ADR 0047](../adr/0047-the-solid-section-fe-lives-in-its-own-package.md).

## Die Frage

Der Vollquerschnitt hat zwei Maschinen: die parametrische Form rechnet κ nach
Grashof (`shear.ts`), die gezeichnete Figur über die FE. Für das Rechteck liegen
sie 0,08 % auseinander. Für die T-Figur war es nie gemessen — und dort trägt
Grashof zwei Näherungen statt einer:

- **ν-blind.** `shear.ts` kennt keine Querdehnzahl.
- **Schubspannung über die Schnittbreite konstant.** `τ = Q·S/(I·t)` mittelt über
  die Breite; am Übergang Gurt/Steg springt `t` um den Faktor `bf/bw`.

Gemessen mit 20000 Tri6-Elementen je Figur (`@baustatik/mesh-2d-wasm`,
`@baustatik/sparse-solver-wasm`).

## Erst die Gegenprobe: dieselbe Figur

Bevor κ verglichen wird, muss belegt sein, dass beide Wege über DIESELBE Figur
rechnen. `A` und `Iy` fallen bei der Form aus der Formel und beim Umriss aus Green —
zwei Wege, eine Zahl.

| Figur | `A` Form [m²] | `A` Umriss [m²] | Δ | `Iy` Form [m⁴] | `Iy` Umriss [m⁴] | Δ |
| --- | --- | --- | --- | --- | --- | --- |
| Plattenbalken 2000/200/250/500 | 4.750000e-1 | 4.750000e-1 | exakt | 5.843202e-3 | 5.843202e-3 | −1.48e-14 % |
| Plattenbalken 1000/150/300/600 | 2.850000e-1 | 2.850000e-1 | exakt | 8.954112e-3 | 8.954112e-3 | exakt |
| Stahl-T 200/15/10/200 | 4.850000e-3 | 4.850000e-3 | exakt | 1.677590e-5 | 1.677590e-5 | exakt |
| Quadrat-T 300/150/150/300 | 6.750000e-2 | 6.750000e-2 | exakt | 4.640625e-4 | 4.640625e-4 | exakt |

## Die Zahl

`Δ` ist, um wieviel Grashof über der FE liegt — positiv heißt: Grashof rechnet
den Querschnitt **schubsteifer**, als er ist.

| Figur | `bf/bw` | Grashof κ_z | FE κ_z (ν=0) | FE κ_z (ν=0,2) | FE κ_z (ν=0,3) | Δ (ν=0) | Δ (ν=0,2) | Δ (ν=0,3) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Plattenbalken 2000/200/250/500 | 8.00 | 0.437009 | 0.197071 | 0.191720 | 0.187063 | +121.75 % | +127.94 % | +133.62 % |
| Plattenbalken 1000/150/300/600 | 3.33 | 0.605606 | 0.451363 | 0.450977 | 0.450623 | +34.17 % | +34.29 % | +34.39 % |
| Stahl-T 200/15/10/200 | 20.00 | 0.363692 | 0.328494 | 0.328486 | 0.328478 | +10.71 % | +10.72 % | +10.72 % |
| Quadrat-T 300/150/150/300 | 2.00 | 0.781654 | 0.676420 | 0.675430 | 0.674524 | +15.56 % | +15.73 % | +15.88 % |

## Was die FE zusätzlich liefert

Die parametrische Form gibt für `t-section` + `solid` weder `It` noch `zM` —
dauerhaft, weil die FE einen Polygonzug braucht und `ShapeSpec` keinen trägt.
Die gezeichnete Figur gibt beides.

| Figur | `d0` | `d2` | `It` [m⁴] | `zs` [m] | `zM` [m] |
| --- | --- | --- | --- | --- | --- |
| Plattenbalken 2000/200/250/500 | 5.074322 | 5.097821 | 6.898899e-3 | 0.139474 | 0.112658 |
| Plattenbalken 1000/150/300/600 | 2.215511 | 0.068349 | 4.768251e-3 | 0.217105 | 0.132302 |
| Stahl-T 200/15/10/200 | 3.044197 | 0.002795 | 2.809221e-7 | 0.045644 | 0.007819 |
| Quadrat-T 300/150/150/300 | 1.478372 | 0.078030 | 4.691997e-4 | 0.125000 | 0.108420 |

## Was hier NICHT steht

Keine Schranke. Welche Abweichung tragbar ist, entscheidet ein ADR und nicht
dieses Messgerät — und der Ausweg steht ohnehin fest und ist nicht gebaut: wer
FE-Werte für eine parametrische Form will, zeichnet die Figur. Genau das tun die
Vorgaben auf `outline-sections.html`.

