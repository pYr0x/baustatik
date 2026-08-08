---
'@baustatik/cross-section-viewer': major
---

**Breaking:** `ViewerConfig` bekommt einen zweiten Pull,
`getSectionPolicy: () => SectionPolicy`, neben `getGeometry` und
`getScreenSize`.

Dafür zeichnet der Viewer **Bogenwände**: eine Wand mit `bulge ≠ 0`, deren
Stichhöhe über `arcTolerance` liegt, wird als `arcPath`-Spec ausgegeben —
`center`/`radius`/`startAngle`/`sweepAngle` direkt aus `Bulge.toArc`,
`strokeWidth = t · vp.scale` wie bei der geraden Wand. Ein Strich der Dicke `t`
auf einem Bogen *ist* die Wand. Bis P0 gab `wallSpec` für sie `undefined`
zurück.

Der Pull ist Pflicht und nicht optional: `arcTolerance` entscheidet mit, welche
Kante überhaupt als Bogen gilt, und sie steht seit `schemaVersion: 7` im selben
Satz wie der Umriss, den der Viewer daneben zeichnet (ADR 0033). Eine
Modulkonstante zöge die Zahl aus einer anderen Quelle.

**Der Zeichenweg wirft weiterhin nicht.** Ein nicht endlicher `bulge` und einer
am Vollkreis-Pol (`|bulge| ≳ 1,6e16`, wo `4·atan(bulge)` genau auf `2π` rundet)
fallen auf die Sehne zurück, statt `InvalidArcError` bzw. eine von
`render-core` zurückgewiesene Spec zu erzeugen. Das Gate prüft `bulge` heute
nicht, beides kann also aus einem Store kommen — und ein Wurf hier löschte
Grid, Umriss und jede andere Wand mit.

`@baustatik/section-geometry` ist wieder eine Abhängigkeit. Neu gepinnt: der
Vorzeichen-Test, an dem `bulge` → `Arc.sweep` → `ArcPathSpec.sweepAngle`
aufeinandertreffen — bislang war die Identität nur argumentiert.
