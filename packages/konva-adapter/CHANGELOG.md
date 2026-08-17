# @baustatik/konva-adapter

## 0.0.5

### Patch Changes

- 422cecb: Keep label text the same size on screen at any zoom level.

  `LabelSpec.fontSize` is a world measure — producers divide their screen pixels by
  `vp.scale`. Written straight into `Konva.Text.fontSize`, that becomes
  `ctx.font = '0.006px sans-serif'` at high zoom, and browsers quantise or drop a
  font that small: the text grew visibly uneven while zooming in and eventually
  vanished, taking its box with it (`measureText` returns a width of `0`).

  The text is now built at a fixed `REFERENCE_FONT_SIZE` and the label group
  carries `scale = spec.fontSize / REFERENCE_FONT_SIZE`. The rendered result is
  unchanged; the shrinking happens in the transform, where glyphs are rasterised at
  their effective device size.

  Visible in the exported configs: `labelTextConfig(...).fontSize` is now the
  reference size, and `padding` / `cornerRadius` come back in reference units.
  `strokeWidth` is untouched — `strokeScaleEnabled: false` measures against the
  absolute transform. Anything reading a label's box size from outside has to
  multiply `getText().width()` by the node's `scaleX()`; the new exported
  `labelScale(spec)` gives that factor.

## 0.0.4

### Patch Changes

- @baustatik/render-core@0.0.4

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

- Updated dependencies [6bde31d]
  - @baustatik/render-core@0.0.3

## 0.0.2

### Patch Changes

- @baustatik/render-core@0.0.2

## 0.0.1

### Patch Changes

- @baustatik/render-core@0.0.1

## 0.1.1

### Patch Changes

- Updated dependencies [e6a9a4e]
  - @baustatik/render-core@0.1.1

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

- Updated dependencies [35c566b]
- Updated dependencies [8a2beb1]
- Updated dependencies [1bb918d]
  - @baustatik/render-core@0.1.0
  - @baustatik/viewport-2d@0.1.0
