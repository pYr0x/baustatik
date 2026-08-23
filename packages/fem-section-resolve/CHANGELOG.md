# @baustatik/fem-section-resolve

## 0.0.9

### Patch Changes

- Updated dependencies [6c215da]
- Updated dependencies [6c215da]
- Updated dependencies [6c215da]
  - @baustatik/cross-section@0.0.9

## 0.0.8

### Patch Changes

- Updated dependencies [7ce2046]
  - @baustatik/cross-section@0.0.8

## 0.0.7

### Patch Changes

- Updated dependencies [ded937d]
  - @baustatik/cross-section@0.0.7

## 0.0.6

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
  - @baustatik/material@0.0.1

## 0.0.5

### Patch Changes

- 9f5c5e3: `SectionPolicy.arcTolerance` is renamed to `discretisationTolerance`

  The name now says what the number does, not what it measures: it steers the
  whole discretisation of the figure — arcs, the derived outline, kinks, drift
  and the mitre chamfer floor — not just arcs (ADR 0033, 0037, 0038). Renamed
  everywhere the field travels: the snapshot JSON key, the policy overrides and
  arguments, the error fields on `TangentKinkWarning` and
  `UndiscretisableBulgeError`, the viewer's `thinWalls` parameter and the demo.
  The constant keeps its name (`DEFAULT_ARC_TOLERANCE` stays
  `DEFAULT_ARC_TOLERANCE`), and so does the `InflateOptions`/`Bulge` argument in
  `@baustatik/geometry-2d`.

- Updated dependencies [9f5c5e3]
- Updated dependencies [9f5c5e3]
  - @baustatik/cross-section@0.0.5

## 0.0.4

### Patch Changes

- @baustatik/cross-section@0.0.4

## 0.0.3

### Patch Changes

- 39020e1: P5: κ, shear centre and `It` from the positioned wall path

  A `kind: 'midline'` cross-section drawn `thin-walled`, in one piece and with at
  most **one** closed cell, now yields `kappaY`, `kappaZ`, `yM`, `zM` and `It`.
  Drawn steel sections stop computing shear-rigid, and
  `ShearCentreUnknownWarning` stops firing on every one of them.
  See [ADR 0040](../docs/adr/0040-the-wall-path-is-positioned.md) and
  [ADR 0041](../docs/adr/0041-two-figures-for-the-wall-path.md).

  **Breaking — `schemaVersion: 9 → 10`, no migration routine.** `SectionPolicy`
  gains two mandatory fields without defaults, `thickWallRatio` (default `1/3`)
  and `shearCentreTolerance` (default `1e-6`). `parseSectionPolicy` is strict, so
  every v9 file is rejected. Per
  [ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md) this
  is recorded as `patch`: there are no consumers, and the break belongs in the
  text rather than in the version arithmetic.

  **Breaking — new and changed values.**

  - `SectionProperties` gains `It?` [m⁴]. It stands for every `thin-walled`
    parametric shape (closed-form expression), for every rolled profile (from the
    table) and for the drawn wall graph; `undefined` on every solid section.
  - `t-section` with `idealisation: 'thin-walled'` now reports `zM = hf/2`
    instead of `undefined`. Consumers that treated `undefined` as "no torsion"
    will see the shear-centre offset they were missing.
  - Statement 2 of the properties gate compares with a tolerance
    (`|yM − ys| > shearCentreTolerance · max(√(Iy/A), √(Iz/A))`) instead of
    `yM !== ys`; `ShearCentreOffsetWarning` carries the bound as `limit`.
  - Three new geometry-gate findings for `thin-walled` wall graphs:
    `MultipleCellsWarning`, `DisconnectedWallGraphWarning`, `ThickWallWarning`.

  **Breaking — `SectionModel` gains `sectionPolicy`
  (`@baustatik/fem-section-resolve`).** The field is mandatory and has no
  default: since the wall path reads `arcTolerance`, a resolver substituting the
  default would discretise the path finer or coarser than the carried outline `I`
  falls out of — two discretisations of one figure, and the difference would sit
  silently in κ. A `FEMModelSnapshot` satisfies the shape unchanged; it has
  carried `sectionPolicy` since `schemaVersion: 7`.

  **Additive.** `sectionProperties(cs, policy?)` takes an optional policy; only
  `arcTolerance` is read from it, and only to discretise arc walls of the wall
  path. A cross-section without an arc wall is unaffected. The wall path itself
  (`Segment`, `segments`, `wallMoments`, `wallPath`, `cellCount`,
  `componentCount`) stays **internal** — no new exports from
  `@baustatik/cross-section` beyond the three warning classes above.

- Updated dependencies [39020e1]
  - @baustatik/cross-section@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [fd949a4]
- Updated dependencies [a7a1863]
- Updated dependencies [90c195f]
- Updated dependencies [d6d245f]
  - @baustatik/cross-section@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies
- Updated dependencies [8646b0b]
- Updated dependencies [cec4a27]
  - @baustatik/cross-section@0.0.1

## 0.2.2

### Patch Changes

- Updated dependencies [ded1de8]
  - @baustatik/cross-section@1.0.0

## 0.2.1

### Patch Changes

- Updated dependencies [3f2b5fb]
- Updated dependencies [3f2b5fb]
- Updated dependencies [86c9b36]
  - @baustatik/cross-section@0.4.0

## 0.2.0

### Minor Changes

- 5f543a4: Der Katalog-Parameter entfaellt — der Schritt, der Code WEGNIMMT.

  - **Neue Signatur: `resolveSectionStiffness(beam, model)`.** Bis hierher kam ein
    dritter Parameter `catalog` herein, und die Naht zwischen „was gespeichert
    wird" und „was am Nationalen Anhang haengt" lag genau hier. Seit die Zahlen im
    Modellsatz stehen ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)),
    gibt es diese Naht nicht mehr.
  - **`resolveModuli` ist geloescht.** Mit ihm verschwinden der Familien-`switch`,
    die drei `as SteelGrade`-Casts und das `try`/`catch` um `UnknownGradeError`.
    Die Familienwahl faellt einmal beim Anlegen des Satzes, nicht bei jedem
    Aufruf.
  - **„Der Anhang bewegt die FEM nicht" ist keine Zusicherung mehr, sondern eine
    Bauform.** Es gibt keinen Parameter mehr, an dem ein Anhang haengen koennte;
    `@baustatik/material` wird nur noch fuer zwei Typen importiert. Der frueher
    hier stehende DE/EN-Test ist deshalb ersatzlos entfallen — was von ihm zu
    pruefen bleibt, steht jetzt in `material/tests/moduli.test.ts`.
  - **`undefined` heisst weniger als vorher:** unbekannter `crossSectionId`,
    unbekannter `materialId`, oder ein Querschnitt, dessen Werte sich nicht bilden
    lassen. „Unbekannte Sorte" und „unbekanntes Profil" stehen nicht mehr dabei —
    ein Tippfehler wird beim Anlegen gemeldet, ein Verweis ins Leere im Bericht.
    Zwei Fehler, die vorher als dasselbe `undefined` ankamen, sind damit getrennt.
  - `ElasticModuli` wird aus `@baustatik/material` re-exportiert;
    `sectionStiffness(props, moduli)` ist unveraendert.

- 5f543a4: Der Resolver liest Modellsaetze und kennt alle drei Familien.

  - **Der Defekt, der hier stirbt:** `materials.steel(materialId as SteelGrade)`
    erklaerte **jeden Stab zu Baustahl**. Ein Holzstab rechnete klaglos mit
    E = 210 000 MPa, ein Betonstab ebenso. Jetzt waehlt `Material.kind` erst den
    Katalog, und der Cast danach wird im selben Atemzug validiert — eine Frage mit
    Antwort statt einer Behauptung.
  - **Neue Signatur:** `resolveSectionStiffness(beam, model, catalog)`. `model`
    (`SectionModel`: `crossSections` + `materials`) ist das, was gespeichert wird;
    `catalog` ist das, was am Nationalen Anhang haengt. Ein Store, der beide Listen
    fuehrt, erfuellt die Form strukturell und reist als ein Stueck hinein.
  - **Alle drei Familien** liefern Steifigkeiten: Stahl `Es`/`G`, Beton
    `Ecm`/`G` (ungerissen), Holz `E0,mean`/`G,mean`. Ein Rahmen aus gemischten
    Materialien ist damit erstmals rechenbar.
  - **`ElasticModuli.Es` → `ElasticModuli.E`.** Mit drei Familien war das
    Stahlzeichen bei zweien schlicht falsch. Nebenbei faellt eine strukturelle
    Zufaelligkeit weg: ein ganzes `Steel`-Objekt passt nicht mehr versehentlich
    hinein, jede Familie benennt ihre Abbildung selbst.
  - Neu getestet und festgehalten: `EA`, `EI` und `GAs` sind unter `na: 'DE'` und
    `na: 'EN'` **identisch**, fuer alle drei Familien — die Moduln sind
    charakteristische Werte, der Anhang steuert nur die Bemessungswerte.

### Patch Changes

- Updated dependencies [5f543a4]
- Updated dependencies [5f543a4]
- Updated dependencies [5f543a4]
  - @baustatik/cross-section@0.3.0
  - @baustatik/material@0.1.0

## 0.1.0

### Minor Changes

- fdfa066: Ab hier rechnet die FEM echt.

  `@baustatik/fem-section-resolve` ist neu: `resolveSectionStiffness(beam,
sections, materials)` macht aus Querschnitt × Material die `SectionStiffness`
  `{ EA, EI, GAs }` — die einzige Stelle im Repository, an der Geometrie mit
  Material multipliziert wird. `undefined` statt Wurf, passend zum Port
  `getSectionStiffness`.

  `@baustatik/script`: **Breaking im 0.x.** `FEMModelSnapshot` trägt
  `crossSections` und `schemaVersion: 2`; ein v1-Snapshot wird abgelehnt statt
  stillschweigend ergänzt. Neu ist `model.crossSection(input)`, das die vom
  Modell vergebene ID herausreicht. Damit ist ein Snapshot selbsttragend —
  bis v1 zeigte `crossSectionId` ins Leere.

### Patch Changes

- Updated dependencies [fe49281]
- Updated dependencies [fe49281]
- Updated dependencies [3da2409]
- Updated dependencies [d66e29b]
- Updated dependencies [e9b652b]
- Updated dependencies [fe49281]
- Updated dependencies [6fb26ba]
  - @baustatik/material@0.0.3
  - @baustatik/cross-section@0.2.0
  - @baustatik/fem-element@1.1.0
