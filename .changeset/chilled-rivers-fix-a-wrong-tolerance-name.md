---
'@baustatik/cross-section': patch
'@baustatik/cross-section-viewer': patch
'@baustatik/script': patch
'@baustatik/fem-section-resolve': patch
---

`SectionPolicy.arcTolerance` is renamed to `discretisationTolerance`

The name now says what the number does, not what it measures: it steers the
whole discretisation of the figure — arcs, the derived outline, kinks, drift
and the mitre chamfer floor — not just arcs (ADR 0033, 0037, 0038). Renamed
everywhere the field travels: the snapshot JSON key, the policy overrides and
arguments, the error fields on `TangentKinkWarning` and
`UndiscretisableBulgeError`, the viewer's `thinWalls` parameter and the demo.
The constant keeps its name (`DEFAULT_ARC_TOLERANCE` stays
`DEFAULT_ARC_TOLERANCE`), and so does the `InflateOptions`/`Bulge` argument in
`@baustatik/geometry-2d`.
