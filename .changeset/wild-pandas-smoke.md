---
'@baustatik/cross-section': patch
'@baustatik/script': patch
---

P5: κ, shear centre and `It` from the positioned wall path

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

**Additive.** `sectionProperties(cs, policy?)` takes an optional policy; only
`arcTolerance` is read from it, and only to discretise arc walls of the wall
path. A cross-section without an arc wall is unaffected. New exports:
`Segment`, `SegmentRun`, `segments`, `WallMoments`, `wallMoments`, `wallPath`,
`OutlineFigure`, `WallPath`, `cellCount`, `componentCount`.
