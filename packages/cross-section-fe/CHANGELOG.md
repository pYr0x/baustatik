# @baustatik/cross-section-fe

## 0.0.8

### Patch Changes

- Updated dependencies [79f9796]
  - @baustatik/cross-section@0.0.11

## 0.0.7

### Patch Changes

- Updated dependencies [68312cf]
  - @baustatik/cross-section@0.0.10

## 0.0.6

### Patch Changes

- dbdf900: Zweite Tür: σ, τ und σv im gezeichneten Vollquerschnitt, aus denselben
  gelösten Feldern, aus denen `It`, der Schubmittelpunkt und κ fallen (ADR 0061).

  ```ts
  const computation = await computeFESectionValues(geometry, policy);
  if (computation.kind === "solved") {
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

## 0.0.5

### Patch Changes

- Updated dependencies [6c215da]
- Updated dependencies [6c215da]
- Updated dependencies [6c215da]
  - @baustatik/cross-section@0.0.9

## 0.0.4

### Patch Changes

- Updated dependencies [7ce2046]
  - @baustatik/cross-section@0.0.8

## 0.0.3

### Patch Changes

- Updated dependencies [8243eae]
  - @baustatik/mesh-2d-wasm@0.0.4
  - @baustatik/sparse-solver-wasm@0.0.3

## 0.0.2

### Patch Changes

- ded937d: Das Schubproblem des Vollquerschnitts rechnet über eine Verwölbung.

  Ein gezeichneter Vollquerschnitt mit einem Loch **neben** der Biegeachse lieferte
  bisher weder κ noch einen Schubmittelpunkt: die FE verweigerte mit
  `reason: 'hole-off-bending-axis'`. Diese Grenze ist ersatzlos weg
  ([ADR 0048](https://github.com/pYr0x/baustatik/blob/main/docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md)).

  **Sie war eine Eigenschaft der Formulierung, nicht der Figur.** Das Schubproblem
  lief über eine Spannungsfunktion `Φ`, die je Randschleife nur bis auf eine
  Konstante bestimmt ist; ihr Randdatum musste beim Umlauf schließen, und der
  Sprung `∮dΦ = (1/Iy)·∫∫_D z dA` verschwindet nur, wenn der Schwerpunkt jedes
  Lochs auf der Biegeachse liegt. Über eine **Verschiebung** gerechnet stellt sich
  die Frage nicht — genau darum lief die Torsion schon immer so, und genau darum
  war `It` von der Verweigerung nie betroffen.

  Gemessen wurden beide Formulierungen auf demselben Netz und `τ` in jedem
  Gaußpunkt verglichen:
  [`docs/messungen/verwoelbung-gegen-dirichlet.md`](https://github.com/pYr0x/baustatik/blob/main/docs/messungen/verwoelbung-gegen-dirichlet.md).

  **BRUCH: `@baustatik/script` geht auf `schemaVersion: 12`.** Die Union von
  `feValues.reason` schrumpft auf `'disconnected-areas'`. Ein v11-Snapshot kann
  `'hole-off-bending-axis'` tragen, und `parseFEMModelSnapshot` weist ihn künftig
  ab. Dieselbe Figur liefert heute `status: 'computed'` — den Wert still
  umzuschreiben hieße, eine Verweigerung in Zahlen zu verwandeln, die niemand
  nachgerechnet hat.

  **BRUCH: `FEResult.shear` ist nicht mehr `| undefined`.** Wer
  `computeFromMesh` direkt ruft, braucht den `undefined`-Zweig nicht mehr.
  `computeFESectionValues` kann nur noch **vor** dem Vernetzen verweigern
  (`'disconnected-areas'`), also trägt `FESectionState` mit `status: 'unsupported'`
  in der Praxis kein `It` mehr.

  Weiter:

  - **Eine Matrix statt zweier.** Torsion und Schub sind beide reines Neumann und
    teilen sich Steifigkeitsmatrix und Zerlegung: fünf rechte Seiten auf einer
    Faktorisierung, wo es zuvor zwei Assemblierungen, zwei Zerlegungen und `4 + h`
    Spalten waren.
  - **`FEDiagnostics`**: `closureZ`, `closureY` und `capacitanceAsymmetry` fallen
    weg; neu sind `compatibilityPsi0Z/Y` und `compatibilityPsi1Z/Y` — der Rest der
    Verträglichkeit je rechter Seite, **identisch** null.
  - **`d1RatioZ`/`d1RatioY` laufen jetzt mit `O(h³)` gegen null**, statt strukturell
    null zu sein. Das ist ein Gewinn: eine Größe, die per Konstruktion null ist,
    prüft nichts.
  - `κ = 0,833333333333` beim Rechteck steht unverändert auf zwölf Stellen.
  - An ADR 0045 ändert sich sonst nichts: Koeffizientenform, ν-Freiheit,
    Trefftz-Schubmittelpunkt und der materialfreie Satz bleiben in Kraft.

- Updated dependencies [ded937d]
  - @baustatik/cross-section@0.0.7

## 0.0.1

### Patch Changes

- 2108d8a: FE-Querschnittswerte für gezeichnete Vollquerschnitte.

  Ein gezeichneter Querschnitt, der als Vollquerschnitt gerechnet wird, lieferte
  bisher kein κ, kein `It` und keinen Schubmittelpunkt. Diese Lücke ist
  geschlossen — über eine 2D-FE-Rechnung auf einem Tri6-Netz
  (ADR 0045, ADR 0047).

  **NEU: `@baustatik/cross-section-fe`.** Eine asynchrone Tür,
  `computeFESectionValues(geometry, policy)`. Sie vernetzt (`mesh-2d-wasm`), löst
  zwei Randwertprobleme (`sparse-solver-wasm`) und gibt zwei Dinge zurück: den
  Satz-Anteil und das Netz daneben (transient, ADR 0039). **Eine Geometrie herein,
  ein Ergebnis heraus — keine ID:** die Deduplizierung gehört der Anwendung, und
  ihr Wächter ist das Feld `feValues` im Satz selbst.

  **BREAKING CHANGES:**

  - **`@baustatik/script`: `schemaVersion` 10 → 11.** Jeder v10-Snapshot wird
    abgelehnt und nicht ergänzt. Drei Gründe zugleich: `SectionPolicy` bekommt das
    Pflichtfeld `FEElements`, `SectionGeometry` das optionale `feValues` in beiden
    Varianten, `ElasticModuli` das optionale `nu`.
  - **`@baustatik/cross-section`: `SectionPolicy` bekommt `FEElements`
    (Pflichtfeld, Default `4000`).** `parseSectionPolicy` ist strikt, also weist
    er jeden Satz ohne dieses Feld ab. Es ist eine dritte Sorte Feld — es ändert
    den Umriss nicht und beurteilt ihn nicht, es _erzeugt Zahlen, die im Satz
    gespeichert werden_.
  - **`@baustatik/material`: `ElasticModuli` bekommt `nu?`.** Optional, und die
    Abwesenheit ist eine Antwort: Holz ist orthotrop, hat kein isotropes ν und
    bekommt deshalb kein κ. Nicht aus `E` und `G` zurückgerechnet — das gäbe
    `0,30001` für Stahl und `6,97` für C24.
  - **`@baustatik/core`: `atOrThrow` nimmt `ArrayLike<T>` statt `readonly T[]`.**
    Strikt weiter als vorher; die FE rechnet in typisierten Feldern, und die
    Hausregel „`!` steht in keinem `src/`" war dort sonst nicht einzuhalten.

  **Weiter:**

  - `SectionProperties` bekommt `inverseKappaY`/`inverseKappaZ` — κ als ν-freie
    FORMEL `1/κ = d0 + d2·m²` mit `m = ν/(1+ν)`. Der Querschnitt bleibt damit
    materialfrei (ADR 0020).
  - `@baustatik/fem-section-resolve` wertet sie mit dem ν des Stabmaterials aus.
    Fehlt `nu`, bleibt der Stab schubstarr — derselbe Fall wie bisher, und
    `check()` meldet ihn weiterhin mit `ShearDeformationUnavailableWarning`.
  - Das Gate meldet einen FE-Block, dessen Fingerabdruck nicht mehr zum Umriss
    passt — als bestehende `OutlineDriftWarning`, keine neue Warnung.
  - `t-section` + `solid` behält sein Grashof-κ. Das ist eine bekannte, offene
    Lücke: gemessen liegt Grashof beim T um +11 % bis +134 % daneben
    (`docs/messungen/t-querschnitt-grashof-gegen-fe.md`).

- Updated dependencies [2108d8a]
  - @baustatik/cross-section@0.0.6
  - @baustatik/core@0.0.3
  - @baustatik/mesh-2d-wasm@0.0.3
