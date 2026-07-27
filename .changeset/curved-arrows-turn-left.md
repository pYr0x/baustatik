---
"@baustatik/render-core": minor
"@baustatik/konva-adapter": minor
"@baustatik/fem-viewer": minor
---

Momentenlasten zeichnen: `NodeLoad.my` und `BeamMomentPointLoad` werden als
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
