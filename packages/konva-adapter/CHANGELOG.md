# @baustatik/konva-adapter

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
