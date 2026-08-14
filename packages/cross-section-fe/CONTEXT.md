# `@baustatik/cross-section-fe`

Die 2D-Finite-Elemente-Rechnung des **gezeichneten Vollquerschnitts**: `It`, der
Schubmittelpunkt nach Trefftz und κ als ν-freies Koeffizientenpaar je Achse.

Entscheidungen: [ADR 0045](../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)
(was gerechnet wird und warum ohne ν),
[ADR 0047](../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md)
(warum es dieses Package gibt).

## Die eine Tür

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

Heraus kommen zwei Dinge: der **Satz-Anteil** (`FESectionState`, wandert in die
Geometrie) und das **Netz** (transient, ADR 0039, gehört nicht in den Satz und
wird nicht serialisiert — es ist da, damit die Anwendung zeichnen kann, worauf
gerechnet wurde, ohne ein zweites Mal zu vernetzen).

## Was hier NICHT ist

- **Der parametrische Vollquerschnitt** (`kind: 'shape'` + `idealisation:
  'solid'`). Er behält sein Grashof-κ aus `cross-section/src/shear.ts` — ihm
  fehlt der Polygonzug, den die FE braucht. Das ist eine **bekannte, offene
  Lücke**, kein erledigter Zustand; gemessen in
  [`docs/messungen/t-querschnitt-grashof-gegen-fe.md`](../../docs/messungen/t-querschnitt-grashof-gegen-fe.md),
  Besitzer `packages/TODO.md`.
- **Der dünnwandige Weg.** Der läuft über `wall-path.ts` in
  `@baustatik/cross-section` (ADR 0040/0041).
- **Spannungspunkte** für die gezeichnete Figur.
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
- **`K` ist drehinvariant.** Beide Lastrichtungen laufen deshalb auf EINER Matrix
  und EINER Zerlegung: `4 + h` rechte Seiten statt zweier Faktorisierungen.
- **Der Umlaufsinn trägt Material und Loch** (`signedArea > 0` ist Material,
  ADR 0034). Die Umsetzung nach `MeshRing2D.kind` ist eine Vorzeichenabfrage —
  kein Verschachtelungstest, Lochsaatpunkte erzeugt der Mesher selbst.
- **Der Außenrand läuft mathematisch positiv, jeder Innenrand negativ.** Dann
  zeigt `n = (dz, −dy)/L` überall aus dem Material heraus. Ohne diese Festlegung
  dreht sich der Neumann-Randterm am Loch um, und `It` kommt falsch heraus, ohne
  dass irgendetwas wirft.
- **Der Randumlauf geht über ALLE Schleifen**, auch im Torsionsproblem.
- **SI hinein, SI heraus.** Keine cm-Zwischenwelt wie in
  `@baustatik/cross-section` — dort gibt es sie, damit man gegen die gedruckte
  Profiltabelle diffen kann (ADR 0024). Für `It` und den Schubmittelpunkt einer
  gezeichneten Figur gibt es keine Tabelle.

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

## Kommandos

```text
pnpm --filter @baustatik/cross-section-fe test
pnpm --filter @baustatik/cross-section-fe typecheck   # in KEINEM Turbo-Task
pnpm --filter @baustatik/cross-section-fe build
```

Die Suite **vernetzt und löst echt** und braucht deshalb die gebauten
`pkg/`-Artefakte von `@baustatik/mesh-2d-wasm` und
`@baustatik/sparse-solver-wasm`. Sie läuft rund eine Minute.
