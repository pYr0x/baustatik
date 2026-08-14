# Verwölbungsformulierung gegen Dirichlet

Erzeugt von [`verifaction/verwoelbung-gegen-dirichlet.mjs`](../../verifaction/verwoelbung-gegen-dirichlet.mjs).
Beleg zu [ADR 0048](../adr/0048-the-shear-problem-uses-the-warping-formulation.md).

## Die Frage

Die heutige Fassung des Schubproblems löst eine Spannungsfunktion `Φ` mit
Dirichlet-Rand. Sie legt `Φ` nur *entlang* jeder Randschleife fest — je Schleife
bleibt eine Konstante offen, und das Randdatum muss beim Umlauf schließen:

```text
∮dΦ = −1/(2·Iy)·∮z²dy = ∓(1/Iy)·∫∫_D z dA
```

Der Sprung ist das statische Moment der eingeschlossenen Fläche um die Biegeachse.
Er verschwindet nur, wenn der Schwerpunkt jedes Lochs auf der Biegeachse liegt —
sonst verweigert die FE (`hole-off-bending-axis`).

Eine Formulierung über eine **Verschiebung** kennt das nicht. Mit `τ = ∇ψ + p`
trägt `p` die Wirbelstärke, und wieviel `p` zusätzlich von der Quelle
übernimmt, ist frei. Zwei Aufteilungen stehen hier nebeneinander:

| | `p` | `ψ₀` | `ψ₁` |
| --- | --- | --- | --- |
| **A** | `(0, m·y²/(2Iy))` | `∇²ψ₀ = −z/Iy`, `∂ψ₀/∂n = 0` | `∇²ψ₁ = 0`, `∂ψ₁/∂n = −y²/(2Iy)·n_z` |
| **B** | `(0, −z²/(2Iy) + m·y²/(2Iy))` | `∇²ψ₀ = 0`, `∂ψ₀/∂n = z²/(2Iy)·n_z` | wie A |

Daraus die Spannungsfelder, beide affin in `m = ν/(1+ν)`:

```text
Dirichlet   τ_a = ( ∂Φ_a/∂z , −∂Φ_a/∂y − z²/(2Iy) )   τ_b = ( ∂Φ_b/∂z , −∂Φ_b/∂y )
Variante A  τ_a = ( ∂ψ₀/∂y  ,  ∂ψ₀/∂z )               τ_b = ( ∂ψ₁/∂y , ∂ψ₁/∂z + y²/(2Iy) )
Variante B  τ_a = ( ∂ψ₀/∂y  ,  ∂ψ₀/∂z − z²/(2Iy) )    τ_b = ( ∂ψ₁/∂y , ∂ψ₁/∂z + y²/(2Iy) )
```

Gemessen mit rund 6000 Tri6-Elementen je Figur, alle drei Wege auf DEMSELBEN
Netz und derselben Torsionslösung `ω`.

## Der Feldvergleich

Über alle Gaußpunkte **beider** Lastrichtungen, bezogen auf das Dirichlet-Feld.
Orakel vergleichen Skalare, in denen sich zwei Vorzeichenfehler aufheben können;
ein Feldvergleich kann das nicht.

Zwei Maße, und der Unterschied zwischen ihnen ist die halbe Aussage:

- `max` — `max|Δτ| / max|τ|`. Das scharfe Maß.
- `L2` — `sqrt(∫|Δτ|²dA / ∫|τ|²dA)`. Das Maß, an dem κ hängt, denn κ ist ein
  Energieintegral.

An einer **einspringenden Ecke** ist `τ` singulär. Beide Diskretisierungen
schneiden die Singularität verschieden ab, ein einziges Element bestimmt dann
`max` — und `L2` bleibt klein. Genau das ist beim Winkel und beim Kasten mit
Loch zu sehen.

**`max`**

| Figur | Elemente | A, ν=0 | A, ν=0,2 | A, ν=0,3 | B, ν=0 | B, ν=0,2 | B, ν=0,3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rechteck 200 × 300 | 9325 | 5.04e-4 | 4.18e-3 | 5.36e-3 | 2.32e-10 | 4.00e-3 | 5.19e-3 |
| Kreis r = 150 | 9476 | 5.16e-3 | 6.37e-3 | 6.87e-3 | 5.18e-3 | 6.39e-3 | 6.89e-3 |
| Halbkreis r = 150 | 9436 | 4.39e-3 | 7.13e-3 | 9.04e-3 | 4.35e-3 | 7.18e-3 | 9.09e-3 |
| Winkel 200 × 120 × 30 | 9329 | 3.68e-1 | 3.68e-1 | 3.68e-1 | 3.68e-1 | 3.68e-1 | 3.68e-1 |
| Kasten 200 × 400, Loch mittig | 9340 | 4.10e-1 | 4.10e-1 | 4.10e-1 | 4.10e-1 | 4.10e-1 | 4.10e-1 |

**`L2`**

| Figur | Elemente | A, ν=0 | A, ν=0,2 | A, ν=0,3 | B, ν=0 | B, ν=0,2 | B, ν=0,3 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Rechteck 200 × 300 | 9325 | 1.46e-4 | 2.07e-4 | 2.48e-4 | 4.10e-12 | 1.44e-4 | 1.98e-4 |
| Kreis r = 150 | 9476 | 4.15e-4 | 4.80e-4 | 5.04e-4 | 4.09e-4 | 4.75e-4 | 4.99e-4 |
| Halbkreis r = 150 | 9436 | 3.48e-4 | 4.46e-4 | 4.90e-4 | 3.12e-4 | 4.23e-4 | 4.70e-4 |
| Winkel 200 × 120 × 30 | 9329 | 1.72e-2 | 1.71e-2 | 1.71e-2 | 1.72e-2 | 1.71e-2 | 1.71e-2 |
| Kasten 200 × 400, Loch mittig | 9340 | 3.26e-2 | 2.92e-2 | 2.78e-2 | 3.26e-2 | 2.92e-2 | 2.78e-2 |

Erwartet wird Diskretisierungsniveau, nicht Maschinengenauigkeit: es sind zwei
verschiedene Diskretisierungen desselben Feldes.

## Die Skalare

`1/κ = d0 + d2·m²` in den Hauptachsen, `yM`/`zM` im Eingabesystem, `It` aus `ω`.

### Rechteck 200 × 300

Der m⁰-Anteil gegen die geschlossene Parabel. `d0` muss 6/5 sein.

| Weg | `d0` | `d2` | `yM` [m] | `zM` [m] | `It` [m⁴] | `∫τ_z dA` |
| --- | --- | --- | --- | --- | --- | --- |
| Dirichlet | 1.200000000000 | 3.147554e-2 | 9.686038e-14 | -1.298847e-11 | 4.698258e-4 | 1.000000000000 |
| Verwölbung A | 1.199999994901 | 3.147562e-2 | 1.223727e-13 | -1.300670e-11 | 4.698258e-4 | 1.000000000001 |
| Verwölbung B | 1.200000000004 | 3.147562e-2 | 1.357268e-13 | -1.301554e-11 | 4.698258e-4 | 1.000000000002 |

Geschlossen ist `d0` hier **1.2** (κ = 5/6 bei m = 0). Abstand:

- Dirichlet: `1.477e-14`
- Verwölbung A: `4.249e-9`
- Verwölbung B: `3.014e-12`

### Kreis r = 150

Der m-Anteil des Feldes — eines der beiden Orakel, die ihn sehen.

| Weg | `d0` | `d2` | `yM` [m] | `zM` [m] | `It` [m⁴] | `∫τ_z dA` |
| --- | --- | --- | --- | --- | --- | --- |
| Dirichlet | 1.166666857910 | 1.666665e-1 | 2.483618e-17 | 5.353578e-18 | 7.951349e-4 | 1.000000000000 |
| Verwölbung A | 1.166666656451 | 1.666667e-1 | 2.621676e-17 | 4.592738e-18 | 7.951349e-4 | 1.000000000000 |
| Verwölbung B | 1.166666668452 | 1.666667e-1 | 2.795289e-17 | 3.206377e-18 | 7.951349e-4 | 1.000000000000 |

### Halbkreis r = 150

Der m-Anteil des Schubmittelpunkts, `Iyz`-frei.

| Weg | `d0` | `d2` | `yM` [m] | `zM` [m] | `It` [m⁴] | `∫τ_z dA` |
| --- | --- | --- | --- | --- | --- | --- |
| Dirichlet | 1.166666746271 | 1.495004e-2 | 7.639328e-2 | 1.827282e-11 | 1.506295e-4 | 1.000000000000 |
| Verwölbung A | 1.166666663958 | 1.495006e-2 | 7.639328e-2 | 1.824787e-11 | 1.506295e-4 | 1.000000000002 |
| Verwölbung B | 1.166666667087 | 1.495006e-2 | 7.639328e-2 | 1.823952e-11 | 1.506295e-4 | 1.000000000003 |

### Winkel 200 × 120 × 30

Ohne Symmetrieachse: `Iyz != 0`, gerechnet wird gedreht.

| Weg | `d0` | `d2` | `yM` [m] | `zM` [m] | `It` [m⁴] | `∫τ_z dA` |
| --- | --- | --- | --- | --- | --- | --- |
| Dirichlet | 2.715546990676 | 6.087678e-1 | 2.207676e-2 | 1.440662e-2 | 2.499020e-6 | 1.000000000000 |
| Verwölbung A | 2.714788553508 | 6.088762e-1 | 2.207676e-2 | 1.440662e-2 | 2.499020e-6 | 1.000000000001 |
| Verwölbung B | 2.714788567359 | 6.088762e-1 | 2.207676e-2 | 1.440662e-2 | 2.499020e-6 | 1.000000000002 |

### Kasten 200 × 400, Loch mittig

Die letzte Figur, die BEIDE Wege tragen — beim ausmittigen Loch verweigert der Dirichlet-Weg.

| Weg | `d0` | `d2` | `yM` [m] | `zM` [m] | `It` [m⁴] | `∫τ_z dA` |
| --- | --- | --- | --- | --- | --- | --- |
| Dirichlet | 1.409633981116 | 7.722141e-3 | -1.357695e-6 | -3.825307e-7 | 7.235340e-4 | 1.000000000000 |
| Verwölbung A | 1.408735156947 | 7.727436e-3 | -1.357695e-6 | -3.825307e-7 | 7.235340e-4 | 1.000000000002 |
| Verwölbung B | 1.408735158994 | 7.727436e-3 | -1.357695e-6 | -3.825307e-7 | 7.235340e-4 | 1.000000000003 |

## Die Selbstprüfungen

Der Dirichlet-Randschluss ist eine Eigenschaft der **Figur** und bricht am
ausmittigen Loch. Die Verträglichkeit `∫f dA − ∮g ds` der Verwölbung ist dagegen
**identisch** erfüllt — sie steht hier bezogen auf die Summe der Beträge, also
dimensionslos, und der größte Wert über beide rechten Seiten und beide
Lastrichtungen.

| Figur | Randschluss Dirichlet | Verträglichkeit A | Verträglichkeit B |
| --- | --- | --- | --- |
| Rechteck 200 × 300 | 2.89e-16 | 6.18e-15 | 9.80e-16 |
| Kreis r = 150 | 2.22e-16 | 5.41e-16 | 8.48e-16 |
| Halbkreis r = 150 | 1.07e-15 | 2.18e-14 | 2.47e-14 |
| Winkel 200 × 120 × 30 | 2.57e-15 | 4.10e-15 | 2.00e-15 |
| Kasten 200 × 400, Loch mittig | 3.36e-15 | 1.45e-15 | 1.79e-15 |

## Was hier NICHT steht

Keine Schranke. Welcher Abstand tragbar ist und welche Variante der Produktivcode
führt, entscheidet ADR 0048 und nicht dieses Messgerät.

