# @baustatik/cross-section

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
  - @baustatik/core@0.0.3
  - @baustatik/section-geometry@0.0.4

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

- 9f5c5e3: `jointFills` no longer cuts a chamfer narrower than `discretisationTolerance`

  The miter fill of [ADR 0038](../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)
  emulated Clipper2's cut with a chamfer between the two outer edges. Clipper2's
  own cut is a _fixed_ square; ours shrank as `miterLimit` approached the joint's
  overshoot, and went to zero at the threshold. It never quite vanished — Clipper2
  rounds to a `10^-6 mm` grid — so the derived outline carried an edge of exactly
  one grid step next to edges of `200 mm`.

  That outline is still an admissible PSLG: `mesh-2d-wasm` tests a zero-length
  edge on exact equality, so it accepts the figure and hands Triangle a length
  ratio of `10^8`, where the quality criterion cannot be met. The hazard is
  reachable by dragging a node, not just by typing a `miterLimit`: a joint's
  overshoot moves continuously with the figure.

  `fillRing` now measures the chamfer and keeps the full miter when it would be
  narrower than `discretisationTolerance` — the same chord tolerance the outline is
  discretised with anyway. Snapping goes _upward_, to the full miter, which is
  the continuous choice: the cut corner already tends to the full miter as
  `miterLimit` grows, and only the last, unrepresentable part of that path is
  skipped. The spike then stands less than `discretisationTolerance` further out than
  `miterLimit` allowed.

  Measured on the triangle with the tip pointing down (`tests/outline-meshability.test.ts`,
  new): the shortest edge over `miterLimit` in `[1.001, 10]` rises from
  `1.0·10^-6 mm` to `5.2·10^-2 mm`.

  The gate is deliberately left alone. Just above the bound it now warns about a
  cut that does not happen; it only ever promised "loses area there", and nothing
  is lost. Making the condition agree would mean recomputing the chamfer width in
  `validate.ts` — the duplication `chainedJoints` exists to prevent.

## 0.0.4

### Patch Changes

- Updated dependencies [d9a742d]
  - @baustatik/core@0.0.2
  - @baustatik/section-geometry@0.0.3

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

## 0.0.2

### Patch Changes

- fd949a4: Eine **endliche, aber riesige Wölbung** bringt die Umriss-Ableitung nicht mehr
  zum Absturz, und die Zerlegung eines Bogens bleibt in jedem Fall endlich.

  **Nach [ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md)
  ist das ein `patch`; die Brüche stehen hier im Text.**

  ## Der Defekt

  `Wall.bulge = 1e14` ist endlich, beschreibt aber einen fast vollen Kreis mit
  `2,5·10^15 mm` Radius durch zwei Punkte, die `100 mm` auseinanderliegen.
  `deriveOutline` filterte nur `Number.isFinite` weg und reichte den Rest an
  `Bulge.toPolyline` weiter. Dahinter rechnete `Arc.toPolyline` seine Segmentzahl
  aus `acos(1 − tol/R)` — bei `tol/R < 2^-53` wird das Argument zu `1`, `acos(1)`
  zu `0` und die Segmentzahl zu `Infinity`. Die Schleife lief in den Heap, bis der
  Prozess starb. Bei `bulge = 1e308` lief zusätzlich der Radius über: `Arc.make`
  liess `NaN` durch, weil jeder Vergleich mit `NaN` falsch ist, und der `NaN`
  stand danach in jedem Punkt des Umrisses.

  Getroffen war auch das **Gate**: es leitet den Umriss für die Drift-Prüfung neu
  ab, `validateSectionGeometry` starb also am selben Wert, statt ihn zu melden.

  ## Additiv

  - **`Bulge.isDiscretisable(chordLength, bulge, tolerance)`** in
    `@baustatik/geometry-2d` und `@baustatik/section-geometry` — total, und die
    Frage vor dem Wurf: sie verneint die nicht endliche Wölbung UND die, deren
    Bogen sich unter der Toleranz nicht mehr in `MAX_ARC_SEGMENTS` Punkte zerlegen
    lässt.
  - **`MAX_ARC_SEGMENTS = 100 000`** in `@baustatik/geometry-2d` — ein
    Speicherschutz, keine Feinheitsgrenze.
  - **`UndiscretisableBulgeError`** in `@baustatik/cross-section` — der
    Gate-Befund zur zweiten Sorte, neben `NonFiniteBulgeError`.
  - **`BulgeSite`** in `@baustatik/cross-section` — der Ort einer Wölbung, Wand
    oder Ring-Punkt. Das Gate prüft `Vertex.bulge` damit erstmals überhaupt:
    G6b sah bisher nur `geometry.walls`, obwohl der `outline`-Zweig dieselbe Zahl
    mit derselben Bedeutung trägt.

  ## Brüche

  - **`Arc.toPolyline` wirft `InvalidArcError`**, wenn die verlangte Segmentzahl
    `MAX_ARC_SEGMENTS` überschreitet — auch bei einer von Hand gesetzten
    `segments`-Option. Vorher belegte derselbe Aufruf Speicher, bis der Prozess
    starb.
  - **`Arc.make` wirft bei nicht endlichem `radius` oder `sweep`.** Vorher kam ein
    `NaN` durch beide Schranken.
  - **`Arc.toPolyline` rechnet die Segmentzahl stabil** über
    `2·asin(√(tol/2R))` statt `acos(1 − tol/R)`. Algebraisch dieselbe Zahl; für
    jeden Radius, an dem beide auflösen, kommt dieselbe Punktzahl heraus.
  - **`deriveOutline` liest eine unbrauchbare Wölbung als Gerade** — in BEIDEN
    Zweigen. Der Ringzweig warf dabei bisher sogar bei `bulge: NaN`, und weil das
    Gate für die Drift-Prüfung neu ableitet, starb `validateSectionGeometry` an
    dem Wert, statt ihn zu melden.
  - **`NonFiniteBulgeError` und `UndiscretisableBulgeError` tragen `at: BulgeSite`
    statt `wallId: string`.** Wer die betroffene Wand markiert, fragt jetzt
    `error.at.kind === 'wall'` — und bekommt dafür den Ring-Punkt mit, den es
    vorher gar nicht als Befund gab.

  ## Nebenbei

  - `@baustatik/cross-section` hängt jetzt an `@baustatik/core`, ausschliesslich
    für `atOrThrow`: die Zerlegung des Wandgraphen indizierte über Invarianten und
    machte aus deren Bruch ein stilles `continue`.
  - `pairKey` trennt die beiden Wand-Ids mit einem als Escape geschriebenen
    NUL statt mit dem rohen Byte im Quelltext, das `grep` die Datei für binär
    halten liess. Dieselbe Zeichenkette, nur sichtbar.

- a7a1863: Ein durchverbundener Stoss wird jetzt **gemitert, auch ueber einen
  Dickensprung** — [ADR 0038](../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md).

  **Nach ADR 0036 ist das ein `patch`; der Bruch steht hier im Text.**

  ## Der Bruch: Umrisse und Werte aendern sich

  Faellt ein Dickensprung mit einer ECKE zusammen, schnitt ADR 0037 den
  Offsetpfad dort auf, beide Stuecke endeten stumpf, und der Keil zwischen ihren
  Aussenkanten fehlte. Betroffen ist jeder gezeichnete Querschnitt mit
  `kind: 'midline'`, an dem zwei verschieden dicke Waende in einem Winkel
  durchverbunden sind — der geschweisste Kasten mit `tf ≠ tw` an allen vier Ecken.

  ```text
  Winkel Gurt 8 / Steg 6, 90°   A = 1548 mm²  ->  1560 mm²
  Kasten 400 x 200, tf 20/tw 10  A = 15000 mm² ->  15200 mm²
  ```

  Die neuen Zahlen sind die richtigen: die Aussenkontur am Stoss ist durch die
  beiden aeusseren Offsetgeraden begrenzt, und ihr Schnittpunkt ist der einzige
  Punkt, der beide Baender ausfuellt, ohne ueber eines hinauszureichen. **Wer
  gespeicherte Umrisse mitfuehrt, bekommt beim naechsten Gate-Lauf eine
  `OutlineDriftWarning`** — die Figur ist neu abzuleiten.

  Der KOLLINEARE Dickensprung bleibt unveraendert: dort ist die Stufe echt.

  ## Additiv

  - **`@baustatik/geometry-2d` / `@baustatik/section-geometry`: `delta: 0`** in
    `Polygon.inflate` ist die Identitaet — ein geschlossener Zug geht unveraendert
    in die Vereinigung, in den Umlaufsinn der Offsets gedreht. Ein offener Zug mit
    `delta: 0` traegt keine Flaeche und faellt heraus.
  - **`@baustatik/cross-section`: `ChainedJoint.overshoot`.** Der Ueberstand des
    ungekappten Spitzes wird an der GEBAUTEN Ecke gemessen statt aus `α`
    gerechnet, und das Gate liest ihn, statt eine zweite Formel zu fuehren.

  ## Geaendertes Verhalten

  - `MiterLimitExceededWarning` meldet sich jetzt auch am fast gestreckten Stoss
    MIT Dickensprung: dort laeuft der Miterpunkt laengs der Wand davon, waehrend
    `α` nahe `π` bleibt. Bei gleicher Wandstaerke ist `overshoot` unveraendert
    `1/sin(α/2)`. Der Bezug im Meldungstext ist die halbe **dickere** Wandstaerke.
  - Gekappt wird quer zur Richtung des Spitzes, an derselben Schranke wie bisher
    (`miterLimit · max(t)/2`). Der Schnitt ist eine Fase, wo Clipper2 intern ein
    Quadrat setzt — der Unterschied ist ein Splitter und tritt nur dort auf, wo
    das Gate ohnehin meldet.
  - Der Umriss traegt an der Naht eines Fuellrings kollineare Zwischenpunkte. Sie
    tragen zu `A`, `Iy` und `Iz` nichts bei.

- 90c195f: Der Umriss des gezeichneten Querschnitts entsteht jetzt aus dem **Wandgraphen**
  — P3, [ADR 0037](../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md).
  `kind: 'midline'` ist damit vollständig benutzbar: zeichnen, ableiten, rechnen,
  prüfen.

  **Nach ADR 0036 ist das ein `patch`; die Brüche stehen hier im Text.**

  ## Additiv

  - **`@baustatik/geometry-2d`: `Polygon.inflate(paths, options)`** — weitet
    offene oder geschlossene **Züge** um ein `delta` je Zug auf und vereinigt sie
    zu einer **Ringmenge mit Löchern** (aussen `signedArea > 0`, Loch `< 0`,
    sortiert nach `|A|`, jedes Loch unmittelbar hinter seinem Aussenring). Neue
    Typen `InflatePath`, `InflateOptions`, `InflateEndType`, neue Konstante
    `OFFSET_PRECISION`. Neue Abhängigkeit **`clipper2-ts`, exakt gepinnt** — die
    zweite Clipping-Bibliothek des Packages; martinez bleibt für
    `union`/`intersect`/`subtract` unberührt. Das ist bewusst kein Endzustand
    (`packages/TODO.md` §5).
  - **`@baustatik/section-geometry`: `Polygon.inflate`** in `y`/`z`
    durchgereicht, samt `InflatePathYZ` und den koordinatenfreien Optionstypen.
  - **`@baustatik/cross-section`**: `deriveOutline(geometry, policy)` als die EINE
    Tür über beide Varianten, `deriveOutlineFromWalls` dahinter,
    `createSectionGeometry(input, policy)` als Fabrik, `branches(nodes, walls)`
    und der Typ `Branch` (die Zerlegung, die P5 für den Wandweg braucht).
  - **`@baustatik/script`**: `crossSection({ kind: 'section-input', input })` —
    der Bauer leitet den Umriss unter seiner eigenen `SectionPolicy` ab, statt ihn
    entgegenzunehmen.

  ## Breaking

  - **`@baustatik/cross-section`: `SectionPolicy` hat ein drittes Pflichtfeld**,
    `miterLimit` (dimensionslos, Default `2`, muss `> 1` sein — Clipper2 ersetzt
    jeden Wert bis `1` still durch `2`). Es verändert den GESPEICHERTEN Umriss und
    ist damit nach ADR 0033 eine Erzeugungs- und keine Analyse-Einstellung.
    `parseSectionPolicy` lehnt jeden Satz ohne das Feld ab.
  - **`@baustatik/cross-section`: drei neue Befunde des Gates.**
    `OutlineDriftWarning` (der mitgeführte Umriss weicht von seiner Neuableitung
    ab, Schranke `arcTolerance · U` — für **beide** Varianten, der `outline`-Zweig
    bekommt damit erstmals eine Prüfung), `MiterLimitExceededWarning` (ein
    durchverbundener Stoss, dessen Umrissecke gekappt wird) und
    `NonFiniteBulgeError` (die offene Lücke aus P1). Wer die Befundlisten
    auszählt, zählt ab jetzt anders.
  - **`@baustatik/script`: `schemaVersion` steht auf `9`.** Jede v8-Datei wird
    abgelehnt, ohne Migrationswerkzeug und aus demselben Grund wie bei v5 bis v8:
    eine eingesetzte Voreinstellung behauptete, der Umriss sei unter ihr
    entstanden.

  ## Sonst

  - **`@baustatik/cross-section-viewer`** zeichnet den Umriss **orange**, die
    Wandmittellinien bleiben schwarz. Dass der Umriss abgeleitet und die Wände die
    Eingabe sind, ist eine Aussage des Viewers und keine Option am Aufruf.

- d6d245f: Die mit P2 hinzugekommenen öffentlichen Werte verlassen ihr Package jetzt
  **eingefroren und `readonly`**, wie es `CODING_STANDARDS.md` §4 verlangt.

  - `Polygon.moments` gibt in `@baustatik/geometry-2d` und
    `@baustatik/section-geometry` ein `Object.freeze`-tes Ergebnis zurück und
    nimmt seine Punkte als `readonly`.
  - `greenValues` und `deriveOutlineFromRings` in `@baustatik/cross-section`
    ebenso; `deriveOutlineFromRings` liefert jetzt `readonly Polygon[]` mit
    eingefrorenen Ringen.
  - `atOrThrow` in `@baustatik/core` nimmt `readonly T[]` statt `T[]` — reine
    Erweiterung, jeder bisherige Aufruf bleibt gültig.

  **Bruch am Typ, nicht am Verhalten:** `Polygon.points` ist in
  `@baustatik/section-geometry` und `@baustatik/cross-section` ein
  `readonly`-Array. Wer die Punktliste eines Polygons bisher an Ort und Stelle
  verändert hat, bekommt einen Compilerfehler; wer sie liest, merkt nichts. Die
  Laufzeitwerte sind unverändert.

  Dazu die Korrekturen aus dem Code-Review: die Kantenbildung in
  `deriveOutlineFromRings` und die Lochprobe in `validateSectionGeometry` kommen
  ohne direkten Index aus, `packages/section-geometry/README.md` behauptet nicht
  länger eine Normalisierung durch `Polygon.make`, und die JSDoc von
  `principalAxes` sagt jetzt, dass seit P2 **beide** Zweige in Gebrauch sind.

- Updated dependencies [fd949a4]
- Updated dependencies [a7a1863]
- Updated dependencies [90c195f]
- Updated dependencies [d6d245f]
  - @baustatik/section-geometry@0.0.2
  - @baustatik/core@0.0.1

## 0.0.1

### Patch Changes

- **Breaking:** Der Editor-Querschnitt liefert Werte, `SectionPolicy` bekommt ein
  zweites Pflichtfeld, und das Gate bekommt drei Befunde am Umlaufsinn
  (ADR 0034/0035).

  **`sectionProperties` gibt für `kind: 'section-geometry'` nicht mehr
  `undefined` zurück.** `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` fallen nach Green aus
  dem mitgeführten Umriss, `alpha`/`Iu`/`Iv` als reine Algebra mit. **Ohne
  `kappaY`/`kappaZ` und ohne `yM`/`zM`** — beide brauchen den Wandweg
  beziehungsweise Grashof (P4/P5). Für den Löser heisst das `GAs: 'rigid'`, also
  ohne Schubverformung; wer sie verlangt hat, erfährt es aus `check()` in
  `@baustatik/fem-solver`. `stressPoints` bleibt für diese Quelle `undefined`.

  **`SectionPolicy.principalAxisTolerance` ist neu und PFLICHT** (Default `1e-9`).
  Dimensionslos: `|Iyz| <= tol · max(|Iy|, |Iz|)` heisst Hauptachsenlage. Jedes
  selbst gebaute Policy-Literal und jeder v7-Snapshot ist damit ungültig;
  `createSectionPolicy` ergänzt den Default, `parseSectionPolicy` lehnt ab.

  **Satz 1 des Gates vergleicht relativ statt exakt gegen `0`.** Für einen
  gezeichneten Umriss ist `Iyz` nie exakt null — der exakte Vergleich feuerte
  sonst bei jedem symmetrisch gezeichneten Querschnitt.
  `NotPrincipalAxesWarning` trägt dafür ein neues Feld `limit`.

  **Drei neue Befunde am Umriss**, weil die Windung jetzt Bedeutung trägt
  (Material `signedArea > 0`, Loch `< 0`):

  - `NegativeOutlineAreaError` — `Σ signedArea <= 0`. Ohne ihn gäbe Green ein
    negatives `A` und `fem-section-resolve` daraus eine negative Steifigkeit.
  - `DegenerateOutlineRingError` — ein Ring mit `signedArea === 0`.
  - `UnnestedHoleWarning` — ein Lochring in keinem Materialring. Warnung, weil
    rechenbar und bei zwei getrennten Vollflächen legitim aussehend.

  **Neu exportiert:** `deriveOutlineFromRings(rings, policy)` — der Umriss aus den
  Ringen, nur über `Bulge.toPolyline`, ohne Bibliothek. Damit ist
  `kind: 'outline'` vollständig benutzbar: zeichnen, ableiten, rechnen, prüfen.
  Der `midline`-Zweig bleibt offen.

  **Intern:** `geometryResult()` ist die zweite mm→cm-Stelle. Die Regel heisst ab
  jetzt „eine Eingangsstelle je Quelle, ein gemeinsamer Ausgang (`toSI`)" statt
  „genau zwei Stellen".

- 8646b0b: Aus dem `ShearSegment` wird das **`ShearFlowInterval`**. Nur Namen und
  Kommentare — keine Zahl bewegt sich, und die öffentliche API ist nicht
  betroffen (`shear.ts` ist package-intern, `src/index.ts` exportiert daraus
  nichts).

  - **`Segment` versprach eine Lage, die der Typ nicht hat.** Er ist ein Stück
    der Laufkoordinate `s`, kein Stück Querschnitt: `pathZ` des I-Profils benutzt
    dasselbe Gurtobjekt viermal, ein Ort ließe sich daraus nicht ablesen.
    `Interval` sagt genau das, und die Funktionsfamilie zieht mit —
    `partSegments` → `partIntervals`, `crossWallSegment` → `crossWallInterval`,
    das Rückgabefeld `.segments` → `.intervals`.
  - **Damit ist `Segment` frei**, und es bleibt reserviert für das
    **positionierte** Wegstück mit Startpunkt und Richtung, aus dem κ und die
    Spannungspunkte einmal gemeinsam fallen sollen (`packages/TODO.md`). Das war
    der eigentliche Grund für den Rename; `Wall` (ADR 0030) ist unabhängig davon
    begründet und bleibt.
  - **Nicht `ShearEnergyInterval`**, obwohl `shear.ts` mit der Schubenergie
    aufmacht: `∫ S²/t ds` ist mit `L⁶` eine rein geometrische Größe — deshalb
    fällt `A_s = I²/∫` als Fläche heraus. Die Schubenergie ist das Prinzip hinter
    der Formel und gehört in die Begründung, nicht in einen Typnamen, der sonst
    eine Einheit behauptet, die er nicht trägt.
  - **Die Literatur gibt kein Wort her.** Sie führt das Stück nicht als Objekt,
    sondern integriert abschnittsweise über `s` und beschriftet „Bereich I, II,
    III". Dlubal (SHAPE-THIN/RSECTION) sagt _Element_ — im Monorepo vom
    FE-Element belegt; _Branch_ und _Zelle_ sind in der Theorie dünnwandiger
    Profile anders vergeben.

- cec4a27: **Breaking:** `SectionPolicy` ist da, und beide Türen des Gates nehmen sie.

  - `validateSectionGeometry(g, policy)` und `validateSectionProperties(p, policy)`
    statt `(g, { arcTolerance })` und `(p)`.
  - `SectionGeometryOptions` ist **entfernt**.
  - Neu exportiert: `SectionPolicy`, `SectionPolicyOverrides`,
    `DEFAULT_SECTION_POLICY`, `createSectionPolicy`, `parseSectionPolicy` und
    `InvalidSectionPolicyError`.

  Eigene Wurzel statt einer Scheibe von `AnalysisPolicy`, entschieden an ADR 0011s
  Trennlinie „steuert die Rechnung, ohne das Modell zu ändern": `arcTolerance`
  ändert es — der abgeleitete Umriss reist im Satz mit, und seine Punktzahl hängt
  an der Toleranz (ADR 0033). `arcTolerance` ist jetzt `mm`-gebrandet;
  `DEFAULT_ARC_TOLERANCE` zieht nicht um, die Policy **liest** es aus
  `@baustatik/section-geometry`.

  `validateSectionProperties` nimmt die Policy heute, ohne ein Feld daraus zu
  lesen — bewusst: die `Iyz`-Schwelle landet mit P2 dort, und ein Bruch jetzt ist
  billiger als zwei.

  **Neue Abhängigkeit `@baustatik/section-geometry`.** ADR 0032s Satz „keine neue
  Abhängigkeit ausser `errors`" fällt damit: `outgoingTangent` liest `Bulge.sweep`,
  statt `2·atan(bulge)` selbst zu rechnen. Die Zahlen der Knickwarnung ändern sich
  dadurch nicht.

- Updated dependencies [cec4a27]
- Updated dependencies
  - @baustatik/section-geometry@0.0.1

## 1.0.0

### Major Changes

- ded1de8: Der Querschnittseditor bekommt seinen Vertrag (ADR 0030–0032). **Keine
  Mathematik** — nur den gespeicherten Typ, den Werteumfang, die Vorzeichen und
  das Prüfgatter, damit die folgenden Stufen sie nicht mehr verrücken können.

  **Der Anlass:** summiert man die Querschnittswerte aus den Teilflächen eines
  Mittellinienmodells auf, weichen sie von den parametrischen Formen ab — bei
  gleichen Abmessungen und gleichen Blechdicken. Ursache ist der Doppelzähler am
  Knoten: der Steg läuft von Gurtmitte zu Gurtmitte und ragt `tf/2` in jeden Gurt
  hinein. Das ist kein Fehler in den vier Formen, sondern die Stelle, an der „die
  Form ist parametrisch" aufhört zu reichen.

  **BREAKING (`@baustatik/cross-section`)**

  - **Neu: `SectionGeometry` als dritte Quelle** (ADR 0030). Entweder ein
    Wandgraph (`nodes`, `walls` mit `t` und `bulge`, plus `idealisation`) oder
    freie Umrissringe — in beiden Fällen samt **mitgeführtem, diskretisiertem
    Umriss**. `CrossSection` bekommt die Variante
    `{ kind: 'section-geometry'; id; geometry }`; `sectionProperties` und
    `stressPoints` geben für sie noch `undefined` zurück.
    - **String-Ids, keine Indizes:** ein gelöschter Knoten verschöbe jeden
      folgenden, und ein Modell-Diff wäre unlesbar.
    - **`idealisation` sitzt IN der `midline`-Variante.** Die verbotene Zelle
      „freier Umriss, dünnwandig gerechnet" ist damit ein Compilerfehler.
    - **Beide Marken benennen eine Linie:** `midline` gegen `outline`. `midline`
      ist der Begriff der englischsprachigen Fachwelt für die Mittellinie (SCIA,
      SHAPE-THIN) und spart den Streit centre/center. Die Wandenden heißen
      `startNodeId`/`endNodeId` wie am Stab (`Beam` in `@baustatik/fem`) —
      dieselbe Systematik, dieselben Namen.
    - **Der Umriss reist mit,** und das ist eine geprüfte Denormalisierung: das
      Gatter leitet ihn ohnehin ab, der Vergleich kostet nichts, und aus stiller
      Drift wird ein Befund. Ein Bericht druckt `A = 5163,21 mm²`, eine neue
      Bibliotheksversion liefert `5163,19` — still (dieselbe Überlegung wie
      ADR 0027).
  - **`Segment` ist ersatzlos gelöscht.** Es war toter Code: nichts in `src/` hat
    je eins konstruiert, einziger Verbraucher war der Viewer, der es von außen
    hereinbekam. Es gab nichts zu migrieren.
  - **`SectionProperties` wächst um Pflichtfelder:** `alpha` [rad], `Iu`, `Iv`
    [m⁴] sowie die optionalen `yM`/`zM` [m] (ADR 0031). Pflicht, weil sie reine
    Algebra auf `Iy`/`Iz`/`Iyz` und damit für jede Quelle total sind — bei einem
    IPE 300 wäre `undefined` keine Auskunft, sondern eine Unwahrheit.
    - `alpha` zählt **positiv von `+y` nach `+z`**, derselbe Drehsinn wie
      `Arc.sweep`. Gegen Dlubal ist das Vorzeichen gespiegelt, und gespiegelt wird
      **einmal**, in der Berichtsausgabe (wie `phiY = −theta`, ADR 0005). Rider:
      `Iu ≥ Iv` und `alpha ∈ (−π/2, +π/2]`.
    - `alpha = 0` ist **nichts, was eine Form hinschreibt**, sondern das Ergebnis
      für eine aufrechte Figur. Der Plattenbalken mit 2 m breitem Gurt hat
      `Iz > Iy` und landet auf `+π/2`; ein Test hält beide Fälle.
    - **`zM` bleibt beim `t-section` `undefined`** — die Form ist nur einfach
      symmetrisch. `zs` hinzuschreiben wäre eine Unwahrheit.
    - Invariante statt dritter Konvention: **`yM`/`zM` liegen im selben System wie
      `ys`/`zs`.**
  - **Neu: das Prüfgatter** `validateSectionGeometry(g, { arcTolerance })` und
    `validateSectionProperties(p)`, beide mit `{ errors, warnings }` und benannten
    Klassen statt Strings (ADR 0032). **Es warnt, es verweigert nicht** — kein
    `assertValid…`: „aus der Ebene gehalten" ist keine Eigenschaft des
    Querschnitts, und `CrossSection` wird nach ADR 0023 geteilt.
    - **Doppelte Knoten- und Wand-Ids sind ein Fehler.** Das ist der Preis der
      String-Ids: die Nachschlagetabelle behielte sonst still den LETZTEN
      Eintrag, jede Wand hinge an der falschen Lage, und alles Weitere urteilte
      über eine Figur, die niemand gezeichnet hat.
    - Die **Knickschranke wird abgeleitet, nicht gesetzt**:
      `notch = (t/2)·tan(theta/2) > arcTolerance`. Bei `0,05 mm` heißt das
      `t = 6 → ≈1,9°`, `t = 20 → ≈0,57°`. Dass dicke Wände weniger Knick
      vertragen, ist richtig — ihre Kerbe wird tiefer.
    - Die Toleranz ist ein **Parameter**, keine Konstante im Gatter (ADR 0011):
      sonst hinge dieses Package an `geometry-2d`, nur um eine `0,05` zu lesen.
  - **Neue Abhängigkeit: `@baustatik/errors`** — die Wurzel der Gatterklassen.
    Derselbe Schritt wie ADR 0008, und er erzeugt keinen neuen Knoten im Graphen.
    **Keine** Geometriebibliothek: die Endtangente einer Bogenwand fällt aus
    `2·atan(bulge)`.
  - **κ und die 546 Spannungspunkt-Referenzen haben sich in keiner Ziffer
    bewegt.** Alle 72 Bestandstests laufen unverändert durch.

  **BREAKING (`@baustatik/script`): `schemaVersion` 5 → 6.**

  Die dritte Querschnittsvariante reist im Snapshot mit. Ein v5-Satz wird
  **abgelehnt** — und er ist der verführerischste Fall bisher, weil die Variante
  rein additiv ist und ein v5 sich schlicht durchwinken ließe. Genau deshalb steht
  ein Test dafür: eine Migration ist ein Werkzeug, das jemand AUFRUFT, sieht und
  ablehnen kann. **Ab hier ist jede v5-Datei verloren**, bewusst und ohne
  Migrationswerkzeug — gespeicherte v5-Modelle, die überleben müssten, gibt es
  nicht.

  **BREAKING (`@baustatik/cross-section-viewer`):** der Port heißt
  `getGeometry(): SectionGeometry` statt `getSegments(): readonly Segment[]`, und
  `arcSegments` entfällt. Der Viewer zeichnet den **mitgeführten** Umriss, statt
  einen eigenen abzuleiten — der erste Verbraucher, der belegt, dass die
  Denormalisierung sich lohnt. Wandmittellinien tragen ihre Dicke als
  Strichbreite; eine Bogenwand bekommt noch keine, weil `bulge` ↔ `Arc` zu P1
  gehört und nicht zweimal geschrieben werden darf.

  **`@baustatik/geometry-2d` / `@baustatik/section-geometry`:** neu
  `DEFAULT_ARC_TOLERANCE = 0,05 mm`, die **eine** Diskretisierungstoleranz des
  Repos und der Default von `Arc.toPolyline`. Sie war vorher schon eine stille
  Modellannahme, nur an zwei Stellen mit zwei Zahlen (`0,1` im Default,
  `arcSegments = 24` im Viewer) — und sie entscheidet mit, wie viele Punkte ein
  Umriss trägt und damit, welches `A`, `Iy`, `Iz` aus ihm fällt.

## 0.4.0

### Minor Changes

- 86c9b36: Die Spannungspunkte folgen der Idealisierung (ADR 0029), und `t-beam` heißt
  `t-section`.

  - **Der behobene Widerspruch:** das Package führte ZWEI unabhängige
    Schubmodelle, und `idealisation` steuerte nur eines. Ein `i-symmetric` mit
    `thin-walled` und IPE-80-Massen bekam sein κ aus dem Wandweg (`Sy,max`
    11,60 cm³, Katalog 11,61) und seinen Schwerpunkt-Spannungspunkt aus der
    Umrissmodell (11,25 cm³) — zwei Antworten auf EINE Zahl, in einem Querschnitt.
    Dazu stand am Gurtpunkt `t = b` statt `t = tf`, also die senkrechte
    Schubkomponente, die an einer dünnwandigen Wand nichts bedeutet.
  - **`stressPoints` verzweigt jetzt über Form UND Idealisierung.** Neu ist
    `src/stress-points/thin.ts` mit den dünnwandigen Vorlagen für `i-symmetric`
    (15 Punkte) und `t-section` (9 Punkte). `solid` behält das Umrissmodell, und
    das ist keine Übergangslösung: Grashof IST für Vollquerschnitte richtig.
  - **Koordinaten und Nummern bewegen sich nicht**, nur `t` und `S`. Die
    Nummerierung ist ein veröffentlichter Vertrag.
  - **Das Orakel kostete keine neue Fixture:** ein geschweißtes I ohne Ausrundung
    IST das gewalzte Profil mit `r = 0`. An den 14 Gurtstationen stimmen die neue
    Vorlage und die gegen 546 RSTAB-Punkte validierte `rolled-i.ts` auf
    Gleitkommarauschen überein. Am STEG gilt das Orakel nicht — `rolled-i.ts`
    führt dort die lichte Höhe, das Wandmodell Gurtmitte zu Gurtmitte —, und der
    Schwerpunkt hat deshalb seine eigene Referenz: `Sy,max` des Katalogs, über die
    ganze Reihe immer um 0,05 % bis 4,6 % unterschritten (die fehlende Ausrundung,
    dieselbe Signatur wie bei κ).
  - **κ hat sich in keiner Ziffer bewegt.** `shear.ts`, die Wege und κ wurden nicht
    angefasst; `tests/kappa.test.ts` ist der Beleg.
  - **Der Kasten bleibt `undefined`, mit präziserem Grund:** ihm fehlen die
    REFERENZDATEN, nicht die Theorie — `closedBoxPath` hat den umlaufenden Weg
    längst, und κ fällt daraus.

  **BREAKING (`@baustatik/script`): `schemaVersion` 4 → 5.**

  - `ShapeSpec.kind` heißt `'t-section'` statt `'t-beam'`. Der alte Name trug
    einen BAUSTOFF: dieselbe Form heißt im Betonbau Plattenbalken und im Stahlbau
    T-Profil, und getrennt werden die beiden von `idealisation`, nicht vom
    Formnamen.
  - Ein v4-Snapshot wird **abgelehnt**, nicht umgeschrieben — wie v3 heute. Hier
    wäre es eine zweizeilige Ersetzung, und genau das ist das Argument dagegen,
    sie still zu tun: eine Migration ist ein Werkzeug, das jemand AUFRUFT, sieht
    und ablehnen kann.

### Patch Changes

- 3f2b5fb: Ein `examples/`-Ordner zeigt jede Querschnittsart einmal — zum Ansehen, nicht
  zum Pruefen.

  `pnpm --filter @baustatik/cross-section example` baut das Package und druckt fuer
  Rechteck, geschweisstes I (beide Idealisierungen), T-Querschnitt (Plattenbalken
  und Stahl-T), Kasten und Walzprofil die Querschnittswerte, kappa und die
  Spannungspunkte. Es behauptet nichts und faellt nicht um: die Zusicherungen
  stehen weiter in `tests/`. Was hier dazukommt, ist die AUFRUFSEITE — wie ein
  `CrossSection` entsteht und was `sectionProperties` und `stressPoints` darauf
  zurueckgeben, einschliesslich der beiden Faelle, in denen das `undefined` ist.

  Der Ordner wird von `typecheck` mitgeprueft (`examples/tsconfig.json`), damit
  ein Beispiel nicht unbemerkt veralten kann.

- 3f2b5fb: Aus dem „Band" wird die **Teilfläche**, aus der „Bandmaschine" das
  **Umrissmodell**. Nur Namen und Kommentare — keine Zahl bewegt sich, und die
  öffentliche API ist nicht betroffen (`Part`, `OutlinePart` und `partSegments`
  sind package-intern, `src/index.ts` exportiert sie nicht).

  - **„Band" war erfundenes Vokabular.** Es steht in keinem Lehrbuch und in keinem
    Programm. Die Literatur nennt das Stück, aus dem ein zusammengesetzter
    Querschnitt gerechnet wird, **Teilfläche** — „das statische Moment der
    Teilfläche mal Abstand Teilschwerpunkt bis Gesamtschwerpunkt" ist genau das,
    was `momentBefore` tut. Dlubal nennt dasselbe in RSECTION/SHAPE-THIN
    _Element_; der Name ist hier vergeben, im Monorepo ist ein Element ein
    FE-Element.
  - **`Segment` war schon zweimal vergeben** und schied deshalb als Ersatz aus:
    `ShearSegment` (`shear.ts`) ist der Abschnitt des Schubflusswegs, `Segment`
    (`types.ts`, exportiert) das Wandsegment eines dünnwandigen Querschnitts.
    Englisch heißt die Teilfläche jetzt `Part` — bewusst formneutral, siehe unten.
  - **„Bandmaschine" war ein Gerät, wo ein Modell hingehört.** Der Begriff stand
    als Gegenstück zu **Wandmodell** in zwei Tabellen (`CONTEXT.md`,
    `stress-points/index.ts`). Beide Seiten heißen jetzt gleichrangig:
    **Umrissmodell** (Grashof, Schnitte durch die volle Umrissfigur) gegen
    **Wandmodell** (Schubfluss längs der Wandmittellinien).

  **Zwei Kommentare waren sachlich falsch und sind mitkorrigiert:**

  - `OutlinePart.from`/`to` laufen **längs** der Schnittkoordinate, `width` misst
    quer dazu — `shear.ts` behauptete beim Typ das Gegenteil („ein Band quer zur
    Schubrichtung"), während die Funktion darunter richtig „längs" schrieb. Die
    Teilflächen haben **keine gemeinsame Gestalt**: beim I ist der Gurt 8,5 mm
    hoch und 100 mm breit, der Steg 183 von 200 mm hoch und 5,6 mm breit. Es wird
    nicht in dünne Scheiben zerlegt und summiert, sondern über zwei bis drei
    Teilflächen geschlossen integriert.
  - **`width` kann eine Summe über getrennte Bereiche sein**, und das stand
    nirgends. Beim I in y-Richtung liefert `widthAt` außerhalb des Stegs `2*tf` —
    der senkrechte Schnitt trifft Ober- **und** Untergurt, zwei Flächen, die sich
    nicht berühren. Für `S` und für den Nenner von Grashof ist das richtig, beim
    Lesen aber überraschend; jetzt steht es bei `OutlinePart`, bei `widthAt` und
    an der Stelle in `compact.ts`, wo die `2*tf` hingeschrieben werden.

  `Teilfläche` und `Umrissmodell`/`Wandmodell` stehen ab jetzt unter
  **Domänensprache** in `packages/cross-section/CONTEXT.md`, mitsamt den
  Begriffen, die ausdrücklich _nicht_ gemeint sind: „Streifen" ist Hillerborgs
  Plattenverfahren, und eine „Lamelle" ist im Stahl- und Betonbau das
  aufgeschweißte bzw. aufgeklebte Blech.

## 0.3.0

### Minor Changes

- 5f543a4: Die Profil-Variante traegt die Tabellenzeile.

  - **`{ kind: 'profile'; id; profile; data: SteelProfileData }`** — `data` ist neu
    und pflicht, `profile` ist nur noch die HERKUNFT
    ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)).
  - **Dieses Package schlaegt nichts mehr nach.** `sectionProperties` und
    `stressPoints` lesen `cs.data`; der Profilzweig ist damit TOTAL. `undefined`
    heisst nur noch „unsinnige Abmessungen" bzw. „fuer diese Form gibt es keine
    Vorlage" — der Fall „unbekanntes Profil" ist hier verschwunden und wird beim
    ANLEGEN gemeldet, wo der Tippfehler steht (`@baustatik/script`).
  - **DIE GANZE ZEILE, nicht die fuenf Zahlen der Steifigkeit.** Zwei Verbraucher
    lesen heute schon disjunkte Teilmengen — `profileProperties` liest
    `A`/`Ay`/`Az`/`Iy`/`Iz`, die Spannungspunkte lesen `h`/`b`/`tw`/`tf`/`r` — und
    die Bemessung liest spaeter `Wply` und `It`. Jede Teilmenge waere eine weitere
    Meinung darueber, was ein Profil ist.
  - **`ShapeSpec` bleibt unveraendert und wird NICHT kopiert.** Dort sind `b`/`h`
    die Eingabe, `A`/`Iy` eine reine Funktion davon, und die Funktion liegt in
    git. Kopieren hiesse zwei Wahrheiten ueber eine Zahl.
  - Die Abhaengigkeit auf `@baustatik/steel-profiles` ist im `src` nur noch ein
    Typimport.

### Patch Changes

- Updated dependencies [5f543a4]
  - @baustatik/steel-profiles@0.2.0

## 0.2.0

### Minor Changes

- fe49281: **Breaking im 0.x: `ShapeSpec` nimmt Abmessungen in MILLIMETERN statt in
  Metern**, und `StressPoint` liefert mm und cm³ statt Meter und m³.

  ```diff
  - { kind: 'rectangle', b: 0.3, h: 0.5 }
  + { kind: 'rectangle', b: 300, h: 500 }
  - { kind: 'i-symmetric', h: 0.4, b: 0.2, tw: 0.01, tf: 0.01, idealisation: 'thin-walled' }
  + { kind: 'i-symmetric', h: 400, b: 200, tw: 10, tf: 10, idealisation: 'thin-walled' }
  ```

  **`SectionProperties` bleibt unveraendert SI** (m², m⁴, m). Die Einheitenkette
  zu `@baustatik/fem-section-resolve` — `EA` in kN, `EI` in kNm² — ist nicht
  angefasst; dessen Tests liefen durch diesen Umbau ohne eine geaenderte Zahl.

  Warum: beide Quellen dieses Packages sprechen mm/cm. Der Katalog
  (`SteelProfileData`) fuehrt mm, cm², cm⁴, weil man eine Zeile gegen die
  gedruckte Tabelle diffen koennen muss; eine Handeingabe ist eine Bemassung und
  steht in mm. Dass die parametrische Form daneben bereits in Metern rechnete,
  bedeutete zwei Umrechnungswege fuer dieselbe Frage.

  Intern rechnet das Package jetzt durchgehend in Katalogeinheiten
  (`ShapeResult`: cm², cm⁴, cm — dieselben wie `SteelProfileData`), und **`toSI`
  ist die einzige Stelle**, die daraus SI macht — fuer beide Quellen. `StressPoint`
  in mm/cm³ ist die Form des gedruckten Ausdrucks und der Referenz-Fixture; der
  Vergleich mit der Quelle braucht damit gar keinen Umrechnungsfaktor mehr.

  Die Faktoren kommen aus `@baustatik/units` (neue Dependency) und dort aus
  `toExact`, nicht aus `to`: `convert(139.5).from('mm').to('m')` liefert `0.14`
  ([ADR 0024](../docs/adr/0024-units-at-the-package-boundary.md)).

  κ ist von alldem **unberuehrt** — dimensionslos, und die kappa-Testreihe ging
  ohne eine einzige geaenderte Erwartung durch.

  `@baustatik/script`: nur die Skript-Deklarationen und Fehlertexte nennen jetzt
  Millimeter. Das Snapshot-Schema und die Validierung sind unveraendert — die
  Einheit ist nichts, was ein Parser feststellen koennte.

- d66e29b: Der Rechenkern der Querschnittswerte.

  `sectionProperties(cs)` liefert `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` und κ in
  SI-Metern — aus einer parametrischen Form (`rectangle`, `hollow-rectangle`,
  `i-symmetric`, `t-beam`) oder aus einem Katalogprofil. Dazu der Modellsatz
  `CrossSection`, der neben `Node`, `Beam` und `NodeSupport` im Modell liegt.

  κ hat eine Definition, die Schubenergie `A_s = I² / ∫(S/t)² dA`; fürs Rechteck
  fällt daraus exakt 5/6. `idealisation` ist ein Pflichtfeld ohne Default:
  dieselben vier Zahlen ergeben als kompakt 0,401 und als dünnwandig 0,340.

  Neue Dependency: `@baustatik/steel-profiles`.

- e9b652b: Spannungspunkte: `stressPoints(cs)` liefert Ort, Dicke und die statischen
  Momente `Sy`/`Sz` je Punkt.

  Vier Vorlagen nach einer Regel — alle Ecken der Umrissfigur plus der
  Schwerpunkt: Rechteck 5, Plattenbalken 9, geschweißtes I 15, Walzprofil 13.
  Beim Walzprofil ist RSTABs gedruckte Nummerierung übernommen und durch einen
  Test festgehalten; die Ausrundung wird integriert und reproduziert `A`, `Iy`
  und `Sy,max` des ganzen Katalogs auf 0,05 %.

  Für den geschlossenen Kasten gibt es noch keine Vorlage — `undefined`.

- fe49281: **Breaking im 0.x.** `CrossSection` heisst das Katalogprofil jetzt `profile`
  statt `profileId`: `{ kind: 'profile'; id: string; profile: string }`.

  Der Name trug ein `Id`, das keines war. `crossSectionId`, `materialId` und
  `startNodeId` zeigen auf einen Satz IM MODELL; `profile` nennt eine Reihe im
  Walzprofil-Katalog, den das Modell nicht besitzt und dessen Namen es nicht
  vergibt. Ein Feld, das wie ein Verweis aussieht, aber keiner ist, laesst genau
  die Frage offen, die `Beam.crossSectionId` beantwortet — worauf zeigt das hier.

  Die Snapshot-Grenze zieht mit: `parseFEMModelSnapshot` verlangt bei
  `kind: 'profile'` den Schluessel `profile`. **Kein `schemaVersion: 3`** —
  Version 2 ist mit demselben Stapel Changesets unterwegs und war nie
  veroeffentlicht, es gibt also keinen v2-Snapshot, der zu wandern haette.

### Patch Changes

- Updated dependencies [4003920]
- Updated dependencies [fe49281]
  - @baustatik/steel-profiles@0.1.0
  - @baustatik/units@0.3.0

## 0.1.0

### Minor Changes

- 8a2beb1: domain driven refactor
