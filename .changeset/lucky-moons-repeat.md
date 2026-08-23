---
'@baustatik/cross-section-fe': patch
---

Zweite Tür: σ, τ und σv im gezeichneten Vollquerschnitt, aus denselben
gelösten Feldern, aus denen `It`, der Schubmittelpunkt und κ fallen (ADR 0061).

```ts
const computation = await computeFESectionValues(geometry, policy);
if (computation.kind === 'solved') {
  const field = recoverStresses(computation.fields, forces, 0.3);
}
```

**BREAKING: `FEComputation` ist eine Union auf `kind`** (`'refused'` |
`'solved'`). `mesh` und `diagnostics` sind nicht mehr optional, sondern stehen
im `'solved'`-Arm, zusammen mit dem neuen `fields`. Wer bisher
`computation.mesh` gelesen hat, narrowt jetzt auf `kind`. Nicht auf
`state.status` diskriminiert: ein Abbruch **nach** dem Vernetzen kann wieder
entstehen, und `fe-section-values.ts` führt dafür ein optionales `It`.

- **`recoverStresses(fields, forces, nu)` ist rein und synchron.** Sie vernetzt
  nicht, löst nicht und speichert nichts — die Faktorisierung ist gelaufen.
- **Eigener Ergebnistyp, keine Abhängigkeit auf `cross-section-stress`.** τ ist
  an einem Netzknoten ein **Vektor** an einem Ort ohne ausgezeichnete Richtung;
  `StressAtPoint` trägt ein skalares `tau` entlang einer Wandtangente. Geteilt
  ist σv als Formel, nicht als Typ. Das amendiert den einen
  Consequences-Punkt von ADR 0054.
- **Zwei Formen aus einem Durchlauf:** `nodes` flächengewichtet gemittelt (die
  Nachweisform, trägt den Rand) und `elements` als ungeglättetes Rohbild.
- **`Mt` wird beantwortet** — Saint-Venant, aus ω. Das Gleichgewicht schließt
  über das **Weber**-Moment des Einheitsfeldes und nicht über den Trefftz-
  Schubmittelpunkt; wer `yM` einsetzte, verletzte `∫(y·τ_z − z·τ_y) dA = Mt` um
  die Projektion, ohne dass etwas wirft. Folge: `Mt = 0` ist bei
  unsymmetrischer Figur **kein** torsionsfreier Fall.
- **`nu` ist Pflicht und bewacht** — endlich und in `[0, 0,5)`, sonst
  `InvalidPoissonRatioError`. Kein `Material`: in einer elastischen
  Rückrechnung am homogenen Querschnitt kommen `E` und `G` nirgends vor.
- **Diagnosen statt stiller Glättung:** größter Elementsprung, größte
  Randtraktion (nicht herausprojiziert) und die einspringenden Ecken — je mit
  Knotennummer, weil die beiden Verhältnisse dort nicht konvergieren.
- **Einheiten:** Geometrie in mm herein, gerechnet in SI, Spannung in **MPa**
  und **mm** heraus. Der Satz-Anteil (`It`, `yM`, `zM`, κ) bleibt SI.

Neu exportiert: `recoverStresses`, `FEStressField`, `StressAtNode`,
`StressAtElement`, `FEStressDiagnostics`, `FEFields`,
`InvalidPoissonRatioError`, `BoundaryEdge`. Neue Dependency
`@baustatik/section-forces`. `assemble.ts` gibt `rotateFrame` heraus — ein
Rotationscode, zwei Aufrufer.
