# ν-Abhängigkeit der Schubwerte am Vollquerschnitt

<!-- ERZEUGT von tests/nu-koeffizientenform.mjs.
     Nicht von Hand bearbeiten — der nächste Lauf überschreibt die Datei. -->

Beleg-Artefakt zu [ADR 0045](../adr/0045-solid-section-values-are-nu-free-coefficients.md).

Gemessen mit den produktiven Artefakten: `@baustatik/mesh-2d-wasm` (Triangle,
`tri3`, rund 37 000 Elemente je Figur) und `@baustatik/sparse-solver-wasm`
(dünnbesetztes Cholesky mit AMD-Umordnung).

## Die Frage

Mit `m = ν/(1+ν)` lautet das Schubproblem für `Qz = 1`

```text
τ_y = ∂Φ/∂z            τ_z = −∂Φ/∂y − z²/(2·Iy)

∇²Φ = −m·y/Iy   in A
Φ   = −1/(2·Iy) ∫ z² dy   auf ∂A      (Dirichlet, OHNE ν)
```

m steht allein in der rechten Seite. Ist damit `yM` **affin** und `1/κ`
**quadratisch** in m? Gemessen wird unabhängig: für jedes ν wird das
volle System neu aufgestellt und gelöst, und erst danach gefittet.

## Zuerst: ist die Formulierung richtig?

Der Kreis hat bei Timoshenko/Goodier eine geschlossene, **ν-abhängige**
Lösung für das ganze τ-Feld. Ohne diesen Schritt wäre jede Aussage über
die ν-Abhängigkeit unbelegt — die Gleichgewichtsprobe `∫τ_z dA = Qz` sieht
den m-Anteil nämlich gar nicht.

| ν | max\|τ_FE − τ_exakt\| / max\|τ_exakt\| | κ |
| ---: | ---: | ---: |
| 0.00 | 0.5024 % | 0.857137787 |
| 0.05 | 0.5168 % | 0.856860287 |
| 0.10 | 0.5303 % | 0.856127269 |
| 0.15 | 0.5429 % | 0.855060127 |
| 0.20 | 0.5548 % | 0.853750752 |
| 0.25 | 0.5691 % | 0.852268922 |
| 0.30 | 0.5882 % | 0.850667748 |
| 0.35 | 0.6063 % | 0.848987722 |
| 0.40 | 0.6234 % | 0.847259729 |
| 0.45 | 0.6397 % | 0.845507311 |

Der Rest ist Diskretisierung (lineares Dreieck gegen ein quadratisches Feld)
und **wächst nicht mit ν**: der m-Anteil wird so genau getroffen wie der Rest.

Zwei weitere Orakel:

- **Rechteck bei ν = 0**: die exakte Lösung ist dort linear, das lineare
  Dreieck also exakt. Gerechnet `0.833333333333`, 5/6 = `0.833333333333`.
- **It gegen die Fourierreihe** des Rechtecks: gerechnet `0.457414852`,
  Reihe `0.457363465`, Abweichung 0.0112 %.

## Das Ergebnis

Vier Figuren, je zehn ν von 0 bis 0,45. Rest gegen die Ausgleichskurve,
gemessen an der Spannweite über ν.

| Figur | `yM` affin in m | `1/κ` quadratisch in m | `1/κ` nur linear |
| --- | ---: | ---: | ---: |
| Rechteck | 1.57e-5 % | 2.79e-9 % | 1.58e+1 % |
| Halbkreis | 9.37e-11 % | 1.20e-9 % | 1.58e+1 % |
| Winkel (u) | 9.97e-10 % | 1.50e-10 % | 1.58e+1 % |
| Winkel (v) | 3.71e-9 % | 3.73e-8 % | 1.58e+1 % |

**Beide Vermutungen halten auf Rundungsniveau.** Die letzte Spalte sagt, dass
der quadratische Anteil nicht wegzulassen ist: ein linearer Ansatz für `1/κ`
lässt rund 16 % stehen.

Die Gegenprobe — **eine** Zerlegung, **zwei** rechte Seiten, `Φ(m) = Φ₀ + m·Φ₁` —
reproduziert alle zehn vollen Lösungen je Figur auf 2.22e-15.

### Die Koeffizienten

| Figur | `1/κ` = d₀ | + d₁·m | + d₂·m² |
| --- | ---: | ---: | ---: |
| Rechteck | 1.200000e+0 | 1.04e-13 | 1.058677e-2 |
| Halbkreis | 1.166664e+0 | -2.97e-13 | 1.494241e-2 |
| Winkel (u) | 2.715996e+0 | 4.16e-13 | 6.082886e-1 |
| Winkel (v) | 1.821726e+0 | 2.47e-13 | 1.990226e-3 |

**d₁ verschwindet in allen vier Figuren** — auf Rundungsniveau, nicht
näherungsweise. Das ist kein Zufall der vier Figuren, sondern
herleitbar. d₁ ist das Skalarprodukt der beiden Spannungsfelder:

```text
1/κ = A·∫|τ₀|²  +  2A·m·∫τ₀·τ₁  +  A·m²·∫|τ₁|²
       └─ d₀ ─┘      └─── d₁ ───┘    └── d₂ ──┘

∫τ₀·τ₁ dA = ∫∇Φ₀·∇Φ₁ dA + ∫ z²/(2·Iy) · ∂Φ₁/∂y dA
```

Der erste Teil ist nach Green `∮Φ₁·∂Φ₀/∂n ds − ∫Φ₁·∇²Φ₀ dA`: das Randintegral
fällt weg, weil Φ₁ am Rand null ist, das Gebietsintegral, weil Φ₀ harmonisch
ist. Der zweite Teil ist partiell nach y `∮ z²/(2·Iy)·Φ₁·n_y ds − ∫Φ₁·∂/∂y(…) dA`:
das Randintegral fällt weg aus demselben Grund, das Gebietsintegral, weil
`z²/(2·Iy)` kein y enthält. Also **d₁ = 0 exakt**, für jeden
einfach zusammenhängenden Querschnitt, symmetrisch oder nicht, in beiden
Lastrichtungen. Die 10⁻¹³ oben sind Rundung.

Der Beweis braucht **eine** Voraussetzung: Φ₁ ist auf dem *ganzen* Rand null.
Genau die zerstört ein Loch — dort ist Φ₁ eine unbekannte Konstante c₁, und
aus dem ersten Randintegral wird `c₁·∮∂Φ₀/∂n ds` über den Innenrand, also der
Fluss durch das Loch, der im Allgemeinen nicht verschwindet. **Bei mehrfach
zusammenhängenden Figuren kann d₁ wieder auftauchen** — das Messgerät rechnet
sie nicht. Deshalb bleiben drei Zahlen gespeichert.

## Schubmittelpunkt: Trefftz gegen Weber

Das Randwertproblem lautet vollständig `∇²Φ = −m·y/Iy + C`. C ist die
überlagerte Torsion und wird von der Nebenbedingung festgelegt, unter der
„keine Verdrillung" gemessen wird:

- **Weber** — verschwindende *mittlere* Verdrillung, also `C = 0`.
- **Trefftz** — verschwindende Projektion auf die Torsionsmode,
  `∫[τ_y·(ω,y − z) + τ_z·(ω,z + y)] dA = 0`.

ν bewegt den Schubmittelpunkt, bezogen auf den Trägheitsradius `√(Iy/A)` —
dieselbe Bezugsgröße, an der Satz 2 des Gates misst:

| Figur | Weber | Trefftz |
| --- | ---: | ---: |
| Rechteck | 4.705e-6 % | 1.255e-12 % |
| Halbkreis | 5.570e-1 % | 1.235e-12 % |
| Winkel (u) | 5.523e-1 % | 1.186e-11 % |
| Winkel (v) | 4.508e-2 % | 3.120e-12 % |

**Trefftz ist in allen vier Figuren konstant** — auf Rundungsniveau. Das ist
kein Messergebnis, sondern die Bauform: er fällt aus `∇²ω = 0`, und darin
kommt ν nicht vor. Dasselbe gilt für `It`.

## Zwei Formeln, die als Orakel nicht taugten

**Cowper ist nicht der Energiewert.** Für das Rechteck bei ν = 0,3 gibt
Cowpers `10(1+ν)/(12+11ν)` den Wert 0,84967; gemessen wird 0,832942. κ aus der
Schubenergie **fällt** mit ν, Cowpers Formel steigt. Beide treffen sich bei
ν = 0 in 5/6. Cowper mittelt die 3D-Gleichungen und ist eine andere Größe —
er taugt nicht als Abnahmekriterium. Praktisch heißt das: der FE-Weg und der
vorhandene Grashof-Weg (`shear.ts`) stimmen für das Rechteck auf 0,08 %
überein, nicht auf 2 %.

**Die Lehrbuchformel des Halbkreises war falsch zitiert.** `e =
8a(3+4ν)/(15π(1+ν))` verlangt eine ν-Abhängigkeit, die keine der beiden
Definitionen wiedergibt — der ganze Abstand zwischen Weber und Trefftz ist
rund zwanzigmal kleiner als der, den sie fordert. Der Fehler steckt in der
Formel: bei Sokolnikoff (*Mathematical Theory of Elasticity*, 2. Aufl.,
§ 61, S. 237–239) steht

```text
e/a = 8·[3 + (40/π² − 1)·ν] / (15π(1+ν))  =  8·[3 + (40/π² − 4)·m] / (15π)
```

Da `40/π² = 4,0529` ist, ist die m-Steigung fast null statt steil —
der Unterschied zur erinnerten Fassung ist der Faktor 19. Gegen die
richtige Fassung gemessen:

| | bei m = 0 | Steigung in m |
| --- | ---: | ---: |
| Weber (FE) | 0.509289248 | 8.973403e-3 |
| Sokolnikoff | 0.509295818 | 8.971644e-3 |
| Abweichung | -0.0013 % | 0.0196 % |

**Die geschlossene Lösung ist also ein Orakel für den m-Anteil des
Schubmittelpunkts**, und sie bestätigt ihn. Sie bestätigt nebenbei auch, dass
die klassische Zahl eine **Weber**-Zahl ist: Trefftz ist ν-frei und kann eine
Steigung ungleich null gar nicht liefern.

