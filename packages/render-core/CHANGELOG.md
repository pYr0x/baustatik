# @baustatik/render-core

## 0.0.3

### Patch Changes

- 6bde31d: Cross-section viewer restructured, plus a wireframe primitive for it.

  `@baustatik/render-core` gains `IndexedLineListSpec`, a mesh-agnostic primitive
  for a list of independent lines: flat `points` (`[u0, v0, …]`) and `indices`
  (flat index pairs) as `ArrayLike<number>`, so a `Float64Array`/`Uint32Array`
  passes through without a copy. One spec per wireframe instead of one `LineSpec`
  per edge. Validation checks that both buffers can be read; duplicate, reversed
  and degenerate segments stay allowed.

  `@baustatik/konva-adapter` maps it to exactly one `Konva.Shape` whose scene
  function begins a separate subpath per segment, so two independent edges are
  never joined.

  **Breaking for `@baustatik/cross-section-viewer`:**

  - `CROSS_SECTION_LAYERS` is now
    `['grid', 'thin-walls', 'outlines', 'fe', 'symbols']`. The former `'section'`
    band is gone. Callers that pass the tuple to the driver need no change; callers
    that hard-coded `'section'` do.
  - Spec IDs are namespaced: `cross-section:thin-wall:{wallId}` and
    `cross-section:outline:{ringIndex}` replace the bare `{wallId}` and
    `outline-{index}`.

  New in the same package:

  - `crossSectionSpecs` (`scene.ts`) is the pure scene door; `createCrossSectionViewer`
    now only pulls data, holds the viewport and drives the renderer.
  - Three optional result pulls — `getProperties`, `getStressPoints`, `getFEMesh` —
    draw the centroid (red), the shear centre (green, only when both `yM` and `zM`
    are determined) and the stress points (blue), plus an FE wireframe. An omitted
    pull and a pull returning `undefined` are the same off state.
  - `CrossSectionStyle` with `DEFAULT_STYLE`, resolved once per scene. Wall
    thickness stays out of it: `Wall.t` is physics, everything with the `Px` suffix
    is screen-constant.
  - `CrossSectionFEMesh`, structurally compatible with `Mesh2DResult` but without a
    dependency on the mesher.
  - `@baustatik/units` and `@baustatik/errors` are new direct dependencies: section
    values arrive in SI metres and are converted exactly once, with `toExact`.

## 0.0.2

### Patch Changes

- Updated dependencies [d9a742d]
  - @baustatik/core@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies [d6d245f]
  - @baustatik/core@0.0.1

## 0.1.1

### Patch Changes

- e6a9a4e: Streckenlasten werden gezeichnet — und stehen auf ihrem Schatten (ADR 0028).

  - **Die Regel, aus der alle neun Faelle folgen:** die Grundlinie der Figur ist der
    Schatten des belasteten Abschnitts, geworfen von Parallellicht in
    Lastrichtung; bei `trueLength` die Stabachse selbst. Damit braucht die Matrix
    aus `frame` x `axis` x `referenceLength` keine einzige Fallunterscheidung — ein
    Schatten steht per Definition senkrecht auf dem Licht, und das entgegen der
    Lastrichtung abgetragene Polygon kann deshalb nicht flach werden. Die
    naheliegende Regel „die Bezugslaenge nennt die Grundlinie" ist an
    `Linienlast4` und `Linienlast8` widerlegt.
  - **Zwei Folgen, beide gewollt:** `horizontalProjection` und `verticalProjection`
    zeichnen bei gleicher Lastrichtung IDENTISCH (sie unterscheiden sich im Wert,
    den das Bild nicht skaliert), und die Luecke sitzt an der geringsten Stelle,
    gemessen laengs der Lastrichtung.
  - **Die eine Ausnahme davon:** misst die Bezugslaenge am Stab EXAKT 0 —
    `verticalProjection` am waagrechten, `horizontalProjection` am senkrechten —,
    wird dort gar nichts gezeichnet, so wie RSTAB es haelt. Das Bild skaliert nicht
    mit dem Faktor, aber „nichts" ist keine Skalierung: die Last traegt an diesem
    Stab nichts ein, und weil die Ordinate je Last normiert ist, stuende die Figur
    sonst ausgerechnet dort in voller Hoehe. Entschieden wird JE STAB, am exakten 0
    — der fast waagrechte Stab wird weiter gezeichnet.
  - **Der eine Sonderfall:** Lastrichtung parallel zur Stabachse — `lokal x` immer,
    `global x`/`global z` am waagrechten beziehungsweise senkrechten Stab. Dort
    steht der Block quer und die zwei Pfeile liegen laengs darin; ohne sie waeren
    eine Last und ihr Gegenstueck dasselbe Bild.
  - **Neues Symbol `symbols/distributed-force.ts`**, nicht `pointForceSpecs` mit
    einem Parameter mehr: beim Kraftpfeil sagt die Laenge laut Invariante nichts
    ueber den Betrag, hier ist sie die Ordinate. Die Figur hat trotzdem keine
    eigene Hoehenzahl — die Aussenkante des Polygons IST die Verbindung der
    Pfeilenden.
  - **Marker auf dem Stab** an Anfang und Ende des Abschnitts. Unter der
    Schattenregel steht die Figur bei einer Projektion nicht mehr ueber dem Stab;
    ohne die Marken saehe man nicht, welches Stueck belastet ist.
  - **Bekannte Einschraenkung, jetzt bewusst:** die Ordinate ist JE LAST normiert.
    Die Hoehe zeigt den Verlauf innerhalb einer Last, nie zwischen zweien. Der
    Bezugsmassstab ueber alle sichtbaren Lasten bleibt offen.
  - **Behoben nebenbei:** `beam-loads.ts` las `distanceFromStart` vor der
    Verzweigung — an einer Streckenlast gibt es das Feld nicht, `loadStation`
    machte daraus stillschweigend `NaN`. Und `render-core` validierte
    `RectangleSpec` gar nicht: die Spec stand in der Union und der Konva-Adapter
    konnte sie, aber `validateSpec` fiel in den Unbekannt-Zweig.

## 0.1.0

### Minor Changes

- 35c566b: Momentenlasten zeichnen: `NodeLoad.my` und `BeamMomentPointLoad` werden als
  gebogener Pfeil mit beschriftetem Betrag (`kNm`) dargestellt.

  - `render-core` bekommt `ArcPathSpec` (`kind: 'arcPath'`) samt Validierung: ein
    Kreisbogen als STRICH, ohne Füllung. Der Name trennt zwei Figuren, die viele
    Bibliotheken beide „Arc" nennen — ein ARCPATH ist ein gebogener Strich, ein
    RINGSEGMENT die von zwei Radien begrenzte Fläche. Letzteres gibt es hier
    (noch) nicht; der Name ist reserviert, damit es später nicht `ArcSpec` heißt.
    Die Winkel zählen wie überall von +u Richtung +v, `sweepAngle` trägt das
    Vorzeichen des Umlaufs und muss `0 < |sweepAngle| < 2π` erfüllen: ein Umlauf
    von 0 zeichnet nichts, ein voller Umlauf ist ein `circle`.
  - `konva-adapter` bildet ihn auf `Konva.Path` mit dem SVG-Kommando `A` ab.
    `Konva.Arc` schied aus — genau das ist das Ringsegment und zieht beide Radien
    mit.
  - `fem-viewer` zeichnet das Symbol als 270-Grad-Bogen mit dem Angriffspunkt als
    Mittelpunkt, Radius 22 px, Spitze und demselben Label-Abstand wie die
    Punktlast. Ein positives Moment dreht gegen den Uhrzeigersinn (globales y
    zeigt aus der Ebene), das negative ist sein Spiegelbild. Festgehalten wird die
    LÜCKE, nicht die Spitze: sie sitzt bei beiden Vorzeichen unten, das Label
    darüber, die Spitze an der Kante der Lücke, in die sie zeigt. `my` steht neben
    `fx`/`fz` im selben Lastobjekt — ein Knoten kann beides tragen, und beides
    wird gezeichnet.
  - Die Spitze ist gefüllt UND bestrichen, genau wie Konva den Pfeilkopf zeichnet.
    Nur gefüllt fiele sie bei gleichem `pointerLength`/`pointerWidth` kleiner aus
    als der Kraftpfeilkopf: der Strich liegt mittig auf der Kontur und trägt nach
    außen auf, an der spitzen Ecke durch die Gehrung besonders.
  - Neu in `LoadStyle`: `momentColor`, `momentRadiusPx`, `momentArcWidthPx`,
    `momentPointerLengthPx`, `momentPointerWidthPx`, dazu die Konstante
    `DEFAULT_MOMENT_RADIUS_PX`. Additiv, alle Felder haben Vorgaben.
  - `fem-viewer/src/loads.ts` ist zu `src/loads/` geworden, getrennt nach Lastart
    (`node-loads`, `beam-loads`) und Symbol (`point-force`, `moment`) mit
    `label` und `style` als gemeinsamem Teil. Rein paketintern: die öffentlichen
    Exporte sind unverändert.

- 8a2beb1: domain driven refactor
- 1bb918d: Punktlasten zeichnen: Knotenkräfte und punktuelle Stabkräfte werden als Pfeil mit
  beschriftetem Betrag dargestellt.

  - `fem-load-resolve` exportiert `loadStation` und `loadDirection`. Lage und
    Richtung einer Last werden damit nicht ein zweites Mal hergeleitet — der Viewer
    nimmt sie von dort, wo der Solver sie liest.
  - `render-core` bekommt `ArrowSpec` und `LabelSpec` samt Validierung. Ein
    `LabelSpec` ist als Gruppenkind verboten, weil es im Renderer selbst eine Gruppe
    ist. Neu ist dafuer `ShapeSpec`, der Typ der Gruppenkinder. Das ist **kein**
    Breaking Change: `ShapeSpec` deckt genau die Arten ab, die es vor dieser Version
    gab, und `LabelSpec` erscheint erst mit ihr — kein bestehender Aufrufer konnte
    ein Label in eine Gruppe legen.
  - `konva-adapter` bildet beide auf `Konva.Arrow` beziehungsweise auf ein
    gekapseltes `Konva.Label` ab und versetzt die vermessene Labelbox nach der
    Strahl-Rechteck-Regel.
  - **Breaking, `fem-viewer`**: `createFEMViewer` verlangt den neuen Pflicht-Port
    `getLoads()`, und `femSpecs` nimmt statt fünf Positionsparametern ein
    Optionsobjekt `{ nodes, beams, supports, loads, viewport, style }`. `FEM_LAYERS`
    hat zusätzlich das oberste Band `loads`.

### Patch Changes

- Updated dependencies [8a2beb1]
  - @baustatik/core@0.1.0
  - @baustatik/errors@0.1.0
  - @baustatik/viewport-2d@0.1.0
