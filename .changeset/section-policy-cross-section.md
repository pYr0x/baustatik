---
'@baustatik/cross-section': major
---

**Breaking:** `SectionPolicy` ist da, und beide Gattertüren nehmen sie.

- `validateSectionGeometry(g, policy)` und `validateSectionProperties(p, policy)`
  statt `(g, { arcTolerance })` und `(p)`.
- `SectionGeometryOptions` ist **entfernt**.
- Neu exportiert: `SectionPolicy`, `SectionPolicyOverrides`,
  `DEFAULT_SECTION_POLICY`, `createSectionPolicy`, `parseSectionPolicy` und
  `InvalidSectionPolicyError`.

Eigene Wurzel statt einer Scheibe von `AnalysisPolicy`, entschieden an ADR 0011s
Trennlinie „steuert die Rechnung, ohne das Modell zu ändern": `arcTolerance`
ändert es — der abgeleitete Umriss reist im Satz mit, und seine Punktzahl hängt
an der Toleranz (ADR 0033). `arcTolerance` ist jetzt `mm`-gebrandet;
`DEFAULT_ARC_TOLERANCE` zieht nicht um, die Policy **liest** es aus
`@baustatik/section-geometry`.

`validateSectionProperties` nimmt die Policy heute, ohne ein Feld daraus zu
lesen — bewusst: die `Iyz`-Schwelle landet mit P2 dort, und ein Bruch jetzt ist
billiger als zwei.

**Neue Abhängigkeit `@baustatik/section-geometry`.** ADR 0032s Satz „keine neue
Abhängigkeit ausser `errors`" fällt damit: `outgoingTangent` liest `Bulge.sweep`,
statt `2·atan(bulge)` selbst zu rechnen. Die Zahlen der Knickwarnung ändern sich
dadurch nicht.
