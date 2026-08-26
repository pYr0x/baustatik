# `@baustatik/cross-section-fe`

Die 2D-Finite-Elemente-Rechnung des **gezeichneten Vollquerschnitts**: `It`, der
Schubmittelpunkt nach Trefftz und κ als ν-freies Koeffizientenpaar je Achse —
und aus denselben gelösten Feldern σ, τ und σv.

Entscheidungen: [ADR 0045](../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)
(was gerechnet wird und warum ohne ν),
[ADR 0047](../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md)
(warum es dieses Package gibt),
[ADR 0061](../../docs/adr/0061-the-fe-stress-is-a-vector-at-a-node.md)
(die zweite Tür und warum sie einen eigenen Ergebnistyp hat).

## Die erste Tür

```ts
computeFESectionValues(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): Promise<FEComputation>
```

**Eine Geometrie herein, ein Ergebnis heraus — KEINE ID.** Die Tür kennt weder
`CrossSection.id` noch einen Zwischenspeicher und führt keinen Schlüssel: was sie
bekommt, rechnet sie. Dass je distinktem Querschnitt genau einmal gerechnet wird,
entsteht dadurch, dass die **Anwendung** über ihre Querschnittsliste läuft und den
bereits gefüllten Satz überspringt — der Wächter ist das Feld `feValues` im Satz
selbst.

`FEComputation` ist eine **Union auf `kind`**:

```ts
type FEComputation =
  | { kind: 'refused'; state: FESectionState }
  | {
      kind: 'solved';
      state: FESectionState;
      mesh: Mesh2DResult;
      fields: FEFields;
      diagnostics: FEDiagnostics;
    };
```

Heraus kommt der **Satz-Anteil** (`FESectionState`, wandert in die Geometrie)
und, wenn gerechnet wurde, daneben das **Netz**, die gelösten **Felder** und die
**Diagnosen** — alle drei transient (ADR 0039): sie gehören nicht in den Satz
und werden nicht serialisiert. Das Netz ist da, damit die Anwendung zeichnen
kann, worauf gerechnet wurde, ohne ein zweites Mal zu vernetzen; die Felder sind
die Eingabe der zweiten Tür.

**Nicht auf `state.status` diskriminiert.** `fe-section-values.ts` führt im
`unsupported`-Arm ein optionales `It` und begründet es damit, dass ein Abbruch
**nach** dem Vernetzen wieder entstehen kann — eine Union auf `status` schlösse
genau diesen Fall aus. `kind` ist außerdem die Repo-Konvention und das Muster,
das `MeshPlan` nebenan schon verwendet.

## Die zweite Tür

```ts
recoverStresses(
  fields: FEFields,
  forces: SectionForces,
  nu: number,
): FEStressField
```

**Rein und synchron** (ADR 0061). Sie vernetzt nicht, löst nicht und speichert
nichts: die Faktorisierung ist schon gelaufen, und σ und τ fallen aus den
Gradienten der gelösten Felder.

**`FEFields` trägt `FESection`, `theta`, ω, die vier Schubfelder, `It` und je
Rahmen das WEBER-Moment `[torque, torqueSlope]`.** Der Schubmittelpunkt reist
**nicht** mit: für das Momentengleichgewicht der Rückrechnung ist er die falsche
Zahl (siehe unten). `FESection` reist ganz mit, obwohl σ und τ `loops` und
`isBoundary` nicht brauchen — die Randdiagnosen brauchen beides, und eine
zweite, engere Sektionsform wäre ein zweiter Typ für dieselbe Sache.

**Der Ergebnistyp ist eigen und nicht geliehen.** τ ist an einem Netzknoten ein
**Vektor** an einem Ort ohne ausgezeichnete Richtung; `StressAtPoint` aus
`@baustatik/cross-section-stress` trägt ein skalares `tau` entlang einer
bekannten Wandtangente. Es gibt deshalb **keine Abhängigkeit** dorthin; geteilt
ist σv als Formel, nicht als Typ (ADR 0061).

```ts
type FEStressField = {
  nodes: readonly StressAtNode[];      // NACHWEISFORM, gemittelt, trägt den Rand
  elements: readonly StressAtElement[]; // ROHBILD, ein Wert je Element
  diagnostics: FEStressDiagnostics;
};
```

**Beide Formen fallen aus einem Durchlauf.** Zwei Türen wären zwei Durchläufe
und die Möglichkeit, sie mit verschiedenem `nu` zu rufen. Elementmitten sind
nicht glatter, sondern gröber — eine Facette je Dreieck; sie sind punktweise
genauer, weil der Gradient eines C0-Feldes im Inneren besser ist als an den
Ecken, und sie liegen **nie am Rand**, unterschätzen das Maximum also
systematisch. Deshalb sind `nodes` die Nachweisform.

**`nu` ist Pflicht und wird bewacht** — endlich und in `[0, 0,5)`, sonst
`InvalidPoissonRatioError`. `ν = 30` statt `0,30` ist ein plausibler Tippfehler,
bei `ν = −1` teilte `m = ν/(1+ν)` durch null. Der Holzfall
(`ElasticModuli.nu === undefined`) wird hier **nicht** gelöst: ohne ν gibt es
kein Querkraftschubfeld, und `ν = 0` stillschweigend einzusetzen wäre eine
erfundene Zahl in einem Nachweiswert. **Kein `Material`** — in einer elastischen
Rückrechnung am homogenen Querschnitt kommen `E` und `G` nirgends vor.

### Das Momentengleichgewicht steht auf WEBER, nicht auf Trefftz

`(Vy, Vz, Mt)` ist die vollständige Resultierende der Schubspannungen, bezogen
auf den Schwerpunkt; eine „Querkraft mit Exzentrizität" **ist** dieses Paar. Das
Biegeschubfeld trägt selbst ein Moment, und der Rest ist Saint-Venant:

```text
T_F(m) = torque + m·torqueSlope                       je Rahmen F ∈ {Z, Y}
Mt_SV  = Mt − ( Vz'·T_Z(m) − Vy'·T_Y(m) )
τ_T    = (Mt_SV/It) · ( ω,y − z , ω,z + y )
```

`compute.ts` bildet `uM = torque − projection` — den Schubmittelpunkt nach
**Trefftz**, den `FESectionValues` führt. Für dieses Gleichgewicht zählt das
**rohe** Moment des gelösten Feldes. Wer `yM` einsetzt, verletzt
`∫(y·τ_z − z·τ_y) dA = Mt` um `projection`, ohne dass etwas wirft.

Folge: **`Mt = 0` ist bei unsymmetrischer Figur kein torsionsfreier Fall.** Ein
U-Profil, dessen Querkraft durch den Schwerpunkt läuft, verdreht sich. Diese Tür
liefert den Anteil; `cross-section-stress` liefert ihn nicht.

### Die Diagnosen des Feldes

`FEStressDiagnostics` trägt drei Zahlenpaare und eine Liste, und alle vier sind
**Diagnose, kein Vertrag**:

- **`maxJump`** — je Knoten `max_e |τ_e − τ̄|`, bezogen auf `max|τ̄|`. Damit ist
  die Glättung **sichtbar statt still**. σ steht nicht darin: es ist geschlossen
  und über Elementgrenzen stetig.
- **`maxBoundaryTraction`** — `max|τ̄·n|` über die Randknoten. Exakt gilt
  `τ·n = 0` auf dem freien Rand, die FE erfüllt das nur schwach. Die
  Normalkomponente wird **nicht herausprojiziert** — das sähe richtig aus und
  wäre Erfindung. An einem Eckknoten ist `n` mehrdeutig; genommen wird das
  Maximum über die anliegenden Randkanten.
- **`reentrantCorners`** — Knoten mit Materialinnenwinkel über π, mit einer
  Schranke von 5°, damit ein diskretisiertes rundes **Loch** nicht hundert
  Ecken meldet. Dort ist `τ ~ r^(−1/3)` in der kontinuierlichen Lösung, und der
  Knotenwert wächst mit jeder Verfeinerung. Er wird nicht gefiltert und nicht
  gekappt, sondern **benannt**.
- **Die Knotennummern reisen mit**, weil `maxJump` und `maxBoundaryTraction` an
  einer Figur mit Innenecke **nicht konvergieren**: der singuläre Knoten
  dominiert sie. Ohne die Nummer daneben liest sich das wie ein Bug, und jemand
  fängt an, das Mitteln zu reparieren.

**Keine Gleichgewichtsdiagnose zur Laufzeit.** `∫τ_z dA = Vz` ist durch
Linearität schon erfüllt, wenn `equilibriumZ` es für das Einheitsfeld ist. Als
Test dagegen wertvoll, weil er dort die Rahmenalgebra mitprüft.

**Kein Maximum und kein „maßgebender Punkt"** (ADR 0056). Welcher Knoten ein
Nachweispunkt ist, hängt am Nachweis und gehört in die Bemessungsstelle.

## Was hier NICHT ist

- **Die Übersetzung `ShapeSpec` → Polygonzug.** Der parametrische
  Vollquerschnitt (`kind: 'shape'` + `idealisation: 'solid'`) läuft seit
  [ADR 0062](../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
  durch **diese** FE — aber der Schreiber, der ihn dafür ausschreibt, sitzt
  nebenan: `shapeOutline` in `@baustatik/cross-section`. **An diesem Package hat
  sich dafür nichts geändert**, und das war der Prüfstein der Entscheidung: die
  async Tür nimmt eine `SectionGeometry`, und `{ kind: 'outline', rings,
  outline }` ist eine. Hätte hier etwas angefasst werden müssen, säße der
  Schreiber falsch. Der Beleg für den geschlossenen Zustand — beide
  Eingabearten bitgleich — steht in
  [`docs/messungen/t-querschnitt-grashof-gegen-fe.md`](../../docs/messungen/t-querschnitt-grashof-gegen-fe.md);
  die vier Formen laufen in `tests/door.test.ts` durch die Tür.
- **Der dünnwandige Weg.** Der läuft über `wall-path.ts` in
  `@baustatik/cross-section` (ADR 0040/0041).
- **Spannungspunkte** für die gezeichnete Figur. Die zweite Tür liefert ein
  Feld, keine `StressPoint`; `stressPoints()` gibt für
  `kind === 'section-geometry'` weiterhin `undefined` zurück (ADR 0054/0061).
- **Wölbkrafttorsion.** `Mt` wird als **Saint-Venant**-Torsion ausgewertet, mehr
  gibt die Formulierung nicht her. Bei einer gezeichneten offenen Figur mit
  behinderter Verwölbung ist das die **unsichere Seite**, und das steht hier
  statt nirgends.
- **Ein Viewer.** Das Feld zu zeichnen ist ein eigener Schritt am
  `cross-section-viewer` (ADR 0054).
- **Eine wählbare Stabachse.** Sie verlangt eine N–M-Kopplung in
  `SectionStiffness`, die es heute nicht gibt — solange sie fehlt, **ist** die
  Stabachse der Schwerpunkt. Eigene Entscheidung am Stabelement.
- **Ein Konvergenzlauf.** Kein zweiter, verfeinerter Durchgang, keine gespeicherte
  Konvergenzzahl, keine Warnung darüber. Die Netzdichte ist eine Angabe des
  Anwenders (`SectionPolicy.FEElements`), und das ist die ganze Steuerung.

## Die geeichte Formulierung

**Beide Randwertprobleme laufen über eine Verschiebung** und damit über reines
Neumann (ADR 0048). Es gibt deshalb **eine** Matrix, **eine** Zerlegung und fünf
rechte Seiten.

```text
m = ν / (1 + ν)                       ν = 0 → m = 0     ν = 0,3 → m = 0,23077

Schub:    τ   = ∇ψ + p,     p = ( 0 , −z²/(2·Iy) + m·y²/(2·Iy) )
          ∇²ψ = 0,          ∂ψ/∂n = ( z²/(2·Iy) − m·y²/(2·Iy) )·n_z
          ψ   = ψ₀ + m·ψ₁
          τ_a = ( ∂ψ₀/∂y , ∂ψ₀/∂z − z²/(2·Iy) )
          τ_b = ( ∂ψ₁/∂y , ∂ψ₁/∂z + y²/(2·Iy) )

Torsion:  ∇²ω = 0,          ∂ω/∂n = z·n_y − y·n_z
          It  = ∫(y² + z² + y·ω,z − z·ω,y) dA
```

`m` steht allein im Randterm, und der zerfällt linear. Also ist `ψ` affin in
`m`, das Spannungsfeld ebenso, und `1/κ = d₀ + d₂·m²` ist **exakt** und keine
Näherung. `d₁` ist beweisbar null (ADR 0045) und wird deshalb nicht gespeichert
— es fällt in `evaluate.ts` trotzdem an und steht als Diagnose da. Seit ADR 0048
läuft es mit `O(h³)` gegen null, statt strukturell null zu sein, und prüft damit
das Feld statt der Formulierung.

**Warum `p` auch die Quelle trägt und nicht nur die Wirbelstärke:** so steht der
algebraische Term `z²/(2·Iy)` exakt im Integranden, und `ψ₀` ist beim Rechteck
**linear** — Tri6 trägt das exakt. Mit `∇²ψ₀ = −z/Iy` und `∂ψ₀/∂n = 0` wäre `ψ₀`
dort kubisch, und `κ = 5/6` träfe nur noch auf acht statt zwölf Stellen
(gemessen, ADR 0048).

## Invarianten

- **Tri6, nicht Tri3.** Tri3 hat elementweise konstante Schubspannung, und κ ist
  ein Energieintegral genau darüber: mit ~37 000 Tri3-Elementen lag der
  Feldfehler am Kreis noch bei 0,5 %.
- **Drei Quadraturen, jede aus dem Grad des Integranden.** 3-Punkt für `K`
  (Gradienten linear, Produkt quadratisch), **6-Punkt** für Lastvektor, `It` und
  die Trefftz-Projektion (bis Grad 4 — die Schubenergie trägt `z²/(2·Iy)`, ihr
  Quadrat ist quartisch), 3-Punkt-Gauß je Randsegment über die quadratische
  Kante.
- **Gerechnet wird in den HAUPTACHSEN.** `σ_x = M·z/Iy` gilt nur dort. Gedreht
  wird nach dem Vernetzen — die Topologie bleibt, nur die Koordinaten drehen
  sich. `yM`/`zM` werden exakt zurückgedreht; `inverseKappaY`/`inverseKappaZ`
  gehören damit den Hauptachsen und fallen bei `alpha = 0` — dem Regelfall, den
  das Gate mit `NotPrincipalAxesWarning` absichert — mit `y` und `z` zusammen.
- **`K` ist drehinvariant, und beide Randwertprobleme sind reines Neumann.**
  Torsion und beide Lastrichtungen laufen deshalb auf EINER Matrix und EINER
  Zerlegung: **fünf** rechte Seiten statt zweier Faktorisierungen (ADR 0048).
- **An einer einspringenden Ecke ist `τ` singulär** — in der kontinuierlichen
  Lösung, nicht erst im Netz: bei Materialinnenwinkel `ω = 3π/2` ist
  `τ ~ r^(−1/3)`. κ bleibt davon **unberührt**, weil das Energieintegral
  konvergiert; was leidet, ist die Ordnung. Gemessen `p ≈ 1` statt `4`, also
  kauft eine Vervierfachung der Elementzahl dort nur eine Halbierung des
  Fehlers ([Bericht](../../docs/messungen/verwoelbung-gegen-dirichlet.md)). Das
  betrifft jede Figur mit Lochecke oder Innenecke, ist formulierungsunabhängig
  und **nicht abgemildert** — kein graduiertes Netz, kein Singularitätselement,
  keine Extrapolation.
- **Der Umlaufsinn trägt Material und Loch** (`signedArea > 0` ist Material,
  ADR 0034). Die Umsetzung nach `MeshRing2D.kind` ist eine Vorzeichenabfrage —
  kein Verschachtelungstest, Lochsaatpunkte erzeugt der Mesher selbst.
- **Der Außenrand läuft mathematisch positiv, jeder Innenrand negativ.** Dann
  zeigt `n = (dz, −dy)/L` überall aus dem Material heraus. Ohne diese Festlegung
  dreht sich der Neumann-Randterm am Loch um, und `It` kommt falsch heraus, ohne
  dass irgendetwas wirft.
- **Der Randumlauf geht über ALLE Schleifen**, auch im Torsionsproblem.
- **Die Geometrie kommt in mm herein und wird in SI gerechnet; die Spannung geht
  in MPa und mm heraus, weil eine Festigkeit in MPa steht** (ADR 0024/0061).
  Der Umriss führt Millimeter, `mesh.ts` rechnet ihn **einmal** nach Meter um,
  und ab dort sind Netz, Lösung und **Satz-Anteil** (`It`, `yM`, `zM`, κ) SI.
  Nur die zweite Tür rechnet um: am Eingang die Schnittgrößen, am Ausgang drei
  Spannungen und zwei Koordinaten. Keine cm-Zwischenwelt wie in
  `@baustatik/cross-section` — dort gibt es sie, damit man gegen die gedruckte
  Profiltabelle diffen kann; für `It` und den Schubmittelpunkt einer
  gezeichneten Figur gibt es keine Tabelle.

  Warum nicht wie in `@baustatik/cross-section-stress` „der Ausgang ist die
  Identität": dort war der Eingang schon mm. Hier hieße es, ein **gelöstes
  Feld** nachträglich umzuskalieren — sieben Skalare und sieben Arrays, jedes
  eine Gelegenheit, eines zu vergessen. Ein vergessener Faktor am Ausgang ist
  sichtbar, ein vergessenes `psi1Y` nicht.

## Löcher

**Sie kosten nichts** — seit [ADR 0048](../../docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md)
keine Zusatzbedingung, keine Kopplungsmatrix, keine zusätzliche rechte Seite und
keine Grenze.

Beide Randwertprobleme laufen über eine **Verschiebung** mit Neumann-Rand, und
eine Verschiebung ist auf jedem Gebiet eindeutig. Die Verträglichkeit eines
Neumann-Problems gilt über den **ganzen** Rand und nicht je Schleife:

```text
ψ₀:  −∮ z²/(2·Iy) dy = (1/Iy)·∫∫ z dA = 0     Schwerpunkt, per Konstruktion
ψ₁:   ∮ y²/(2·Iy) dy = 0                      exaktes Differential
```

Beides ist **identisch** erfüllt. Kein Schwerpunkt eines Lochs kommt darin vor,
keine Biegeachse und keine Lage.

Was übrig bleibt, ist die Buchführung: `holeLoops` liefert `holeCount` für die
Diagnosen, und der Randumlauf geht über **alle** Schleifen — wer nur den
Außenrand nimmt, bekommt für den Kreisring ein `It`, das keine Formel bestätigt.

> **Bis ADR 0048 stand hier das Gegenteil.** Die Spannungsfunktion `Φ` war je
> Randschleife nur bis auf eine Konstante bestimmt; jedes Loch brachte eine
> Unbekannte, eine Zusatzbedingung `∮_Γk ∂Φ/∂n ds = 0` und eine Kopplungsmatrix
> mit. Und ihr Randdatum musste beim Umlauf schließen — `∮dΦ = (1/Iy)·∫∫_D z dA`
> verschwindet nur, wenn der Schwerpunkt jedes Lochs auf der Biegeachse liegt,
> weshalb die Umsetzung sonst verweigerte (`reason: 'hole-off-bending-axis'`).
> Das war eine Eigenschaft der **Formulierung**, nicht der Figur. Die
> Begründungsspur steht in
> [`docs/messungen/loch-zusatzbedingung.md`](../../docs/messungen/loch-zusatzbedingung.md)
> und der Ablösebeleg in
> [`docs/messungen/verwoelbung-gegen-dirichlet.md`](../../docs/messungen/verwoelbung-gegen-dirichlet.md).

## Die Orakel

Es gibt **keine billige Selbstprüfung, die den Netzfehler abdeckt** — deshalb
tragen die Orakel diese Last. Die Gleichgewichtsprobe `∫τ_z dA = Qz` sieht den
m-Anteil nicht: `τ_b` ist quellenfrei und hat keine Resultierende.

| Orakel | was es findet |
| --- | --- |
| Rechteck, `m = 0`, κ = `0,833333333333` | die scharfe Zahl: `ψ₀` ist dort linear |
| `It` Rechteck gegen die Fourierreihe | jeden Vorzeichenfehler im Neumann-Randterm |
| Kreis gegen Timoshenko/Goodier | den **m-Anteil des Spannungsfelds** — als einziges |
| Halbkreis gegen Sokolnikoff | die Konstante des Schubmittelpunkts |
| Kreisring, `It = π(a⁴−b⁴)/2` | ob der Mesher ein Loch vernetzt und der Umlauf beide Schleifen findet |
| `A`, `Iy`, `Iz` aus dem Netz | jeden Indexdreher in der Assemblierung |
| Kasten mit außermittigem Loch, wandernd | **Stetigkeit über die Exzentrizität** — der Fall ohne geschlossene Formel |

Die beiden mittleren tragen das Vorzeichen des `ψ₁`-Randterms, und sie sind die
einzigen: bei `m = 0` trägt `ψ₁` nichts bei, das Rechteck sieht ihn also nicht.

**Cowper taugt NICHT als Kriterium** und steht in keinem `expect`: seine Formel
gibt für das Rechteck bei ν = 0,3 `0,84967`, gemessen wird `0,832942` — κ aus der
Schubenergie *fällt* mit ν, Cowpers Formel steigt. Er mittelt die
3D-Gleichungen und ist eine andere Größe.

### Die Orakel der Spannungsrückrechnung

`tests/stress.test.ts`, und sie vernetzen und lösen ebenso echt.

| Orakel | was es findet |
| --- | --- |
| Der **gekoppelte Vorzeichentest**: ein gekipptes Rechteck (`Iyz ≠ 0`), ein Aufruf, alle sechs Schnittgrößen. Geprüft: `∫τ_z dA = Vz`, `∫τ_y dA = Vy`, `∫(y·τ_z − z·τ_y) dA = Mt` | die Rahmenalgebra, beide Vorzeichen aus `theta + π/2`, die Rückdrehung und den Weber-Abzug in einem Zug |
| σ-Gleichgewicht: `∫σ dA = N`, `∫σ·z dA = My`, `∫σ·y dA = −Mz` | jeden Vorzeichendreher in der 2×2-Auflösung. **Kein Netztest** — die Momente kommen aus demselben Netz mit derselben Quadratur, die Identität fällt heraus. Ohne `Mz` bliebe der `Iyz`-Zweig ungeprüft |
| Handrechnung σ am Rechteck 200 × 300 unter `N` und `My` | die Einheitenkette, von `kNm` bis `MPa` |
| Kreis unter `Mt`: `τ = (Mt/Ip)·(−z, +y)` | die Torsionsformel, die Drehinvarianz und die Einheiten. **Blind für ω selbst** — beim Kreis ist `ω ≡ 0` |
| Rechteck unter `Vz` gegen Grashof, Scheitel `1,5·V/A` | die Form. Gemessen `1,0384` bei `b/h = 0,5`: τ verläuft auch über die Breite, die Schranke ist gemessen und nicht erfunden |
| reines `N` an der L-Figur | σ konstant, τ **identisch** null (`Mt_SV = 0`), beide Diagnosezahlen null |
| `maxJump` gegen die Verfeinerung: fällt am Kreis, fällt **nicht** an der L-Figur | dass die Diagnose bedeutet, was ihr JSDoc behauptet |
| `nu` außerhalb `[0, 0,5)` wirft, `nu = 0` läuft durch | die Vorbedingung |
| Stahl-T 200/15/10/200 | beide Seiten der gemessenen Lücke: im Steg trifft die FE `Vz·Sy/(Iy·bw)` auf 0,01 %, am Gurtanschluss liegt sie beim 1,66-Fachen — und wächst dort mit der Verfeinerung, weshalb nur eine untere Schranke steht |

**Kein Quervergleich gegen `stressesAtPoints`.** Naheliegend, weil σ dieselbe
Formel ist — aber er holte die Kopplung zurück, die ADR 0061 entfernt, und ein
geänderter Vorzeichenentscheid drüben ließe den FE-Test aus einem Grund fallen,
der mit der FE nichts zu tun hat.

### Die Ellipse ist eine offene Beweisstelle

Sie wäre das **einzige** Orakel mit `ω ≠ 0` gegen eine geschlossene Lösung:

```text
ω  = −((a²−b²)/(a²+b²))·y·z          It = π·a³b³/(a²+b²)
```

Sie steht **nicht** in der Suite. Die Konstanten gehören aus einer Quelle geholt
und als `verifaction/`-Skript festgehalten, und bis dahin ist das hier eine
benannte Lücke und kein erledigter Zustand: heute prüft **kein** Test das
Verwölbungsfeld selbst gegen eine Formel — der Kreis ist dafür blind, weil dort
`ω ≡ 0` ist, und `It` prüft nur ein Integral darüber.

## Kommandos

```text
pnpm --filter @baustatik/cross-section-fe test
pnpm --filter @baustatik/cross-section-fe typecheck   # in KEINEM Turbo-Task
pnpm --filter @baustatik/cross-section-fe build
```

Die Suite **vernetzt und löst echt** und braucht deshalb die gebauten
`pkg/`-Artefakte von `@baustatik/mesh-2d-wasm` und
`@baustatik/sparse-solver-wasm`. Sie läuft rund eine Minute.
