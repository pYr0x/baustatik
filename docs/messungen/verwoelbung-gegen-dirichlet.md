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

## Wie schnell steht die Zahl?

Eine zweite, von der ersten unabhängige Frage — und eine ältere: sie betrifft
jede Diskretisierung dieses Problems und nicht nur die neue Formulierung.
Gerechnet wird deshalb hier **nur der Produktivweg** (Variante B).

An einer **einspringenden Ecke** ist `τ` singulär, und zwar in der
kontinuierlichen Lösung. Bei Materialinnenwinkel `ω` hat das Neumann-Problem den
Exponenten `λ = π/ω`; für die Ecke eines Rechtecklochs und für die Innenecke
eines Winkels ist `ω = 3π/2`:

```text
ψ ~ r^(2/3)        τ = ∇ψ ~ r^(−1/3)  →  ∞
```

**κ bleibt davon unberührt.** Es ist ein Energieintegral, und
`|τ|²·dA ~ r^(−2/3)·r dr` konvergiert — die Zahl ist endlich. Was leidet, ist die
ORDNUNG, mit der sie sich einstellt: der H1-Fehler ist durch die Singularität auf
`O(h^λ)` gedeckelt, der Energiefehler damit auf `O(h^(2λ)) = O(h^(4/3))` statt
`O(h⁴)` wie bei glatter Lösung.

Gemessen wird nicht gegen eine Wahrheit — es gibt keine geschlossene Zahl —
sondern gegen die eigene Bewegung. Je Schritt vervierfacht sich die Elementzahl,
`h` halbiert sich also, und mit `Fehler ~ C·h^p` verhält sich der Abstand
aufeinanderfolgender Werte wie `2^p`:

```text
p = log₂( Δ_vorher / Δ_danach )
```

Das Rechteck läuft als **glatte Gegenprobe** mit. Ohne es wäre eine langsame
Ordnung nicht der Ecke zuzuordnen — sie könnte ebensogut an der Quadratur, am
Löser oder am Mesher liegen.

Zwei Dinge, die beim Lesen zählen:

- **`p` steht nur, wo sich etwas bewegt.** Wo der Abstand zweier Netze auf
  Gleitkommarauschen liegt, ist `log₂` zweier Rundungsfehler eine Zufallszahl und
  keine Ordnung; die Spalte trägt dann `Rauschen`. `≈ 0` heißt: die Größe
  verschwindet aus Symmetrie und hat keinen eigenen Maßstab.
- **Die Netze sind NICHT geschachtelt.** Triangle vernetzt jeden Schritt neu, also
  liegt auf der asymptotischen Rate noch Netz-zu-Netz-Rauschen. `p` schwankt
  deshalb; zu lesen ist die Größenordnung, nicht die zweite Stelle.

### Rechteck 200 × 300

Einspringende Ecken: **keine**. GLATTE Gegenprobe — kein einspringender Winkel, keine Singularität.

| Elemente | `d0` | Δ | p | `It` [m⁴] | Δ | p | `zM` [m] | Δ | p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2327 | 1.200000000e+0 | — | — | 4.698266480e-4 | — | — | ≈ 0 | — | — |
| 9325 | 1.200000000e+0 | Rauschen | — | 4.698257701e-4 | 2.44e-7 | 3.77 | ≈ 0 | — | — |
| 37356 | 1.200000000e+0 | Rauschen | — | 4.698257059e-4 | 1.78e-8 | 3.91 | ≈ 0 | — | — |
| 149062 | 1.200000000e+0 | Rauschen | — | 4.698257016e-4 | 1.19e-9 | — | ≈ 0 | — | — |

Aus der Ordnung fortgeschrieben, Restfehler am feinsten Netz: `It` [m⁴] `8.50e-11`.

### Kasten 200 × 400, Loch bei z = 60

Einspringende Ecken: **4 × 270°**. Die Figur, für die es diese Formulierung gibt: vier einspringende Ecken am Loch, und das Loch liegt neben der Biegeachse.

| Elemente | `d0` | Δ | p | `It` [m⁴] | Δ | p | `zM` [m] | Δ | p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2339 | 1.348908134e+0 | — | — | 7.167736734e-4 | — | — | -7.937233348e-3 | — | — |
| 9334 | 1.349496358e+0 | 4.36e-4 | 1.43 | 7.167221346e-4 | 9.72e-6 | 1.20 | -7.952230137e-3 | 5.56e-5 | 0.96 |
| 37380 | 1.349715414e+0 | 1.62e-4 | 1.09 | 7.166996995e-4 | 4.23e-6 | 1.29 | -7.959953323e-3 | 2.86e-5 | 1.39 |
| 149149 | 1.349818123e+0 | 7.61e-5 | — | 7.166905282e-4 | 1.73e-6 | — | -7.962903833e-3 | 1.09e-5 | — |

Aus der Ordnung fortgeschrieben, Restfehler am feinsten Netz: `d0` `6.72e-5`, `It` [m⁴] `1.20e-6`, `zM` [m] `6.76e-6`.

### Winkel 200 × 120 × 30

Einspringende Ecken: **1 × 270°**. Eine einzige einspringende Ecke, dafür ohne Symmetrieachse.

| Elemente | `d0` | Δ | p | `It` [m⁴] | Δ | p | `zM` [m] | Δ | p |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2321 | 2.714204171e+0 | — | — | 2.499693221e-6 | — | — | 1.440971388e-2 | — | — |
| 9329 | 2.714788567e+0 | 2.15e-4 | 1.39 | 2.499019613e-6 | 8.90e-6 | 1.41 | 1.440662440e-2 | 3.31e-5 | 1.37 |
| 37233 | 2.715011640e+0 | 8.22e-5 | 0.74 | 2.498766958e-6 | 3.34e-6 | 0.72 | 1.440543079e-2 | 1.28e-5 | 0.70 |
| 148859 | 2.715145425e+0 | 4.93e-5 | — | 2.498613294e-6 | 2.03e-6 | — | 1.440469673e-2 | 7.87e-6 | — |

Aus der Ordnung fortgeschrieben, Restfehler am feinsten Netz: `d0` `7.38e-5`, `It` [m⁴] `3.15e-6`, `zM` [m] `1.26e-5`.

### Was die Reihe zeigt

Die gemessenen Ordnungen fallen in zwei getrennte Gruppen:

| Figur | einspringende Ecken | beobachtete `p` | erwartet |
| --- | --- | --- | --- |
| Rechteck 200 × 300 | keine | 3.77 … 3.91 | `4` (glatt) |
| Kasten 200 × 400, Loch bei z = 60 | 4 × 270° | 0.96 … 1.43 | `4/3 ≈ 1,33` (λ = 2/3) |
| Winkel 200 × 120 × 30 | 1 × 270° | 0.70 … 1.41 | `4/3 ≈ 1,33` (λ = 2/3) |

Die glatte Figur trifft `O(h⁴)`, die beiden mit einspringender Ecke liegen bei
rund `1` — also dort, wo die Singularität sie hinstellt, und nicht bei `4`. Die
Vorhersage aus `λ = π/ω` ist damit bestätigt, und zwar an zwei verschiedenen
Figuren mit verschiedener Eckenzahl.

Praktisch heißt das: bei einer Figur mit Lochecke oder Innenecke kauft eine
Vervierfachung der Elementzahl **rund eine Halbierung** des Fehlers statt der
sechzehn Mal besseren Zahl, die man vom Rechteck gewohnt ist.

## Was hier NICHT steht

Keine Schranke. Welcher Abstand tragbar ist, welche Variante der Produktivcode
führt und ab welchem Restfehler eine Netzdichte zu grob heißt, entscheidet ein
ADR und nicht dieses Messgerät.

Und kein Gegenmittel. Graduierte Netze zur Ecke hin, ein Singularitätselement oder
eine Extrapolation im Produktivcode wären die bekannten Wege — gebaut ist keiner,
und ob einer gebraucht wird, ist eine andere Frage als diese hier.

