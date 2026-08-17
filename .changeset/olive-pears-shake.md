---
'@baustatik/konva-adapter': patch
---

Keep label text the same size on screen at any zoom level.

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
