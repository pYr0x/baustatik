---
'@baustatik/cross-section': minor
---

Der Rechenkern der Querschnittswerte.

`sectionProperties(cs)` liefert `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` und κ in
SI-Metern — aus einer parametrischen Form (`rectangle`, `hollow-rectangle`,
`i-symmetric`, `t-beam`) oder aus einem Katalogprofil. Dazu der Modellsatz
`CrossSection`, der neben `Node`, `Beam` und `NodeSupport` im Modell liegt.

κ hat eine Definition, die Schubenergie `A_s = I² / ∫(S/t)² dA`; fürs Rechteck
fällt daraus exakt 5/6. `idealisation` ist ein Pflichtfeld ohne Default:
dieselben vier Zahlen ergeben als kompakt 0,401 und als dünnwandig 0,340.

Neue Dependency: `@baustatik/steel-profiles`.
