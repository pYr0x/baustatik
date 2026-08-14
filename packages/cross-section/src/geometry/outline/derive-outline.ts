/**
 * Der Umriss — die EINE Tür, mit zwei Wegen dahinter.
 *
 * `SectionGeometry` führt den Umriss MIT ([ADR 0030](../../../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)),
 * aber er muss einmal entstehen. Für `kind: 'outline'` ist das nur die
 * Bogenzerlegung: der Ring BESCHREIBT den Umriss bereits. Für `kind: 'midline'`
 * wird um `t/2` aufgeweitet und vereinigt
 * ([ADR 0037](../../../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
 *
 * EINE TÜR UND NICHT ZWEI, obwohl es zwei Wege sind: das Gate leitet den Umriss
 * für die Drift-Prüfung neu ab, und ohne diese Tür verzweigte es über `kind`
 * selbst — die Fallunterscheidung stünde dann zweimal im Repo.
 *
 * WARUM HIER UND NICHT IN `@baustatik/geometry-2d`: die Signatur nennt
 * `SectionGeometry` und `SectionPolicy`, also Typen dieses Packages. Ein
 * Geometriepackage, das sie kennt, wäre die umgedrehte Abhängigkeit; die
 * Bogenalgebra und die Aufweitung holt es sich über `Bulge` und
 * `Polygon.inflate` aus `@baustatik/section-geometry`.
 *
 * DIE ALTERNATIVE WÄRE STILLE ABWEICHUNG. Ohne diesen Schritt zerlegte jeder
 * Aufrufer seine Bögen von Hand, mit seiner eigenen Toleranz — genau das, was
 * ADR 0030 und ADR 0033 verhindern sollen: der mitgeführte Umriss und die
 * Toleranz, unter der er entstand, gehören in denselben Satz.
 */

import type { Polygon, SectionGeometry } from '../../model/section-geometry';
import type { SectionPolicy } from '../../policy';
import { deriveOutlineFromRings } from './derive-outline-from-rings';
import { deriveOutlineFromWalls } from './derive-outline-from-walls';

/**
 * Der Umriss zu einer gezeichneten Figur — über `kind` verzweigt.
 *
 * TOTAL, ES WIRD NICHTS GEPRÜFT: was an der Figur falsch ist, sagt
 * `validateSectionGeometry` mit Namen. Beide Wege dahinter halten sich daran.
 *
 * Die Einheit ist MILLIMETER — die der `Vertex`, die von `Wall.t` und die von
 * `policy.discretisationTolerance`.
 */
export function deriveOutline(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): readonly Polygon[] {
  return geometry.kind === 'outline'
    ? deriveOutlineFromRings(geometry.rings, policy)
    : deriveOutlineFromWalls(geometry.nodes, geometry.walls, policy);
}
