# @baustatik/fem-viewer

## 1.2.1

### Patch Changes

- @baustatik/fem-geometry@0.0.3
- @baustatik/fem-load-resolve@0.1.2
- @baustatik/fem-loads@0.1.1
- @baustatik/fem-solver@1.1.1

## 1.2.0

### Minor Changes

- e6a9a4e: Der Kraftpfeil steht ab und sagt, wo er angreift — die zwei Dinge, die die
  Streckenlast schon konnte, gelten jetzt fuer jede Punktlast.

  - **Der Gap gilt fuer JEDEN Kraftpfeil:** die Spitze sitzt `forceGapPx` VOR dem
    Angriffspunkt statt darin. Es ist dieselbe Groesse, mit der die Streckenlast
    ueber dem Stab schwebt — wieviel Luft die Figur ueber der Stelle laesst, auf die
    sie sich bezieht —, und deshalb ist es EINE Zahl (`DEFAULT_FORCE_GAP_PX`, 10 px)
    und nicht zwei, die voneinander abweichen koennen.
  - **Auch die Auflagerreaktion**, und zwar mit demselben Wert: Last und Reaktion
    stehen damit spiegelbildlich um den Knoten, gleich weit ab. Die
    Gleichgewichtsprobe bleibt ablesbar, weil die Regel fuer beide dieselbe ist —
    ein anderer Gap auf der Ergebnisseite saehe aus, als griffen die beiden an
    verschiedenen Stellen an.
  - **Marke fuer die Stab-Einzellast**, an ihrem Angriffspunkt auf der Stabachse.
    Nur dort: eine Knotenlast und eine Reaktion haengen an einem Knoten, der schon
    gezeichnet ist, und die Marke laege unter seinem groesseren roten Kreis. Ob es
    eine Marke gibt, entscheidet deshalb `loads/beam-loads.ts` und nicht das
    Kraftsymbol — es ist die Frage, WORAN die Last haengt.
  - **Neues Symbol `symbols/marker.ts`:** die Marke hat jetzt zwei Aufrufer. Bei der
    Streckenlast ist sie konstitutiv und steht in der Figur, bei der Einzellast ist
    sie der Fall „auf einem Stab" und steht beim Aufrufer.
  - **Stilschluessel zusammengelegt** (die Streckenlast ist noch nicht
    veroeffentlicht, es bricht also nichts): `distributedLoadGapPx` →
    `pointForceGapPx` plus neu `reactionForceGapPx`, `distributedLoadMarkerColor`/
    `-SizePx` → `loadMarkerColor`/`loadMarkerSizePx`. In `symbols/style.ts` heissen
    sie `forceGapPx` (in `SymbolStyle`, weil die Reaktion ihn teilt) und
    `MarkerStyle` (eigene Scheibe, weil die Reaktion sie NICHT teilt).

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

### Patch Changes

- Updated dependencies [e6a9a4e]
  - @baustatik/render-core@0.1.1
  - @baustatik/grid-2d@0.0.3

## 1.1.0

### Minor Changes

- 489b53e: Auflagerreaktionen werden gezeichnet.

  `femSpecs` und `createFEMViewer` nehmen das Ergebnis eines gerechneten Lastfalls
  entgegen (`reactions` beziehungsweise `getReactions`) und zeichnen je Knoten und
  Komponente dasselbe Symbol wie eine Last — Pfeil für `fx`/`fz`, gebogener Pfeil
  für `my`, Betrag im Label —, nur grün und in einem neuen obersten Band
  `'reactions'`.

  Die Reaktion ist die Kraft **auf das Tragwerk**, wie `SupportReaction` sie
  definiert: eine Stütze unter einer Last nach unten trägt ein negatives `fz`, ihr
  Pfeil zeigt nach oben, und damit ist `Σ Lasten + Σ Reaktionen = 0` im Bild
  ablesbar. Kein Ergebnis (`undefined`) ist der Aus-Zustand und erzeugt keine
  einzige Spec; einen Schalter daneben gibt es nicht.

  Intern sind Pfeil, Bogen und Label von `loads/` nach `symbols/` gezogen, weil
  Last und Reaktion sie sich teilen. `LoadStyle` bleibt unverändert; `ResultStyle`
  kommt mit eigenen Schlüsseln dazu.

  Neue Dependency: `@baustatik/fem-solver` (heute nur der Typ `SupportReaction`).
  `N`/`V`/`M`-Verläufe fehlen weiterhin — sie brauchen zuerst ein Bezugsmaß über
  alle Stäbe.

## 1.0.1

### Patch Changes

- @baustatik/fem-load-resolve@0.1.1

## 1.0.0

### Major Changes

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

### Patch Changes

- Updated dependencies [605e904]
- Updated dependencies [35c566b]
- Updated dependencies [8a2beb1]
- Updated dependencies [abba606]
- Updated dependencies [1bb918d]
- Updated dependencies [9290f16]
  - @baustatik/fem@1.0.0
  - @baustatik/render-core@0.1.0
  - @baustatik/errors@0.1.0
  - @baustatik/round@0.1.0
  - @baustatik/viewport-2d@0.1.0
  - @baustatik/fem-load-resolve@0.1.0
  - @baustatik/fem-loads@0.1.0
  - @baustatik/grid-2d@0.0.2
  - @baustatik/fem-geometry@0.0.2
