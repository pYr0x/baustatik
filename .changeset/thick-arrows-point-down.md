---
"@baustatik/fem-load-resolve": minor
"@baustatik/render-core": minor
"@baustatik/konva-adapter": minor
"@baustatik/fem-viewer": major
---

Punktlasten zeichnen: Knotenkräfte und punktuelle Stabkräfte werden als Pfeil mit
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
