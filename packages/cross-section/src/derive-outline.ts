/**
 * Der Umriss aus den RINGEN — der eine der beiden Ableitungswege.
 *
 * `SectionGeometry` führt den Umriss MIT ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)),
 * aber er muss einmal entstehen. Für `kind: 'outline'` ist das nur die
 * Bogenzerlegung: der Ring BESCHREIBT den Umriss bereits, seine Kanten tragen
 * lediglich ein `bulge`. Keine Aufweitung, keine Verschneidung, KEINE
 * BIBLIOTHEK — `clipper2-ts` kommt erst mit dem `midline`-Zweig (P3), wo aus
 * Mittellinien um `t/2` aufgeweitet und vereinigt wird.
 *
 * WARUM HIER UND NICHT IN `@baustatik/geometry-2d`: die Signatur nennt `Ring`
 * und `SectionPolicy`, also Typen dieses Packages. Ein Geometriepackage, das
 * `SectionGeometry`-nahe Typen kennt, wäre die umgedrehte Abhängigkeit; die
 * Bogenalgebra, die es tatsächlich braucht, holt es sich über `Bulge` aus
 * `@baustatik/section-geometry` — dieselbe Kante, die das Gate seit P1 hat.
 *
 * DIE ALTERNATIVE WÄRE STILLE ABWEICHUNG. Ohne diesen Schritt zerlegte jeder
 * Aufrufer seine Bögen von Hand, mit seiner eigenen Toleranz — genau das, was
 * ADR 0030 und ADR 0033 verhindern sollen: der mitgeführte Umriss und die
 * Toleranz, unter der er entstand, gehören in denselben Satz.
 */

import { Bulge } from '@baustatik/section-geometry';
import type { mm } from '@baustatik/units';
import type { SectionPolicy } from './policy';
import type { Polygon, Ring, Vertex } from './types';

/**
 * Ein Polygon je Ring, in EINGABEREIHENFOLGE und mit UNVERÄNDERTEM Umlaufsinn.
 *
 * DER UMLAUFSINN WIRD NICHT ANGEFASST, und das ist die tragende Zusage: er
 * trägt die Bedeutung „Material" gegen „Loch"
 * ([ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 * Ein Ring, den der Zeichner verkehrt herum gelegt hat, kommt verkehrt herum
 * heraus — und fällt im Gate auf, statt hier still repariert zu werden.
 *
 * TOTAL, ES WIRD NICHTS GEPRÜFT. Ein Ring mit zwei Punkten liefert einen
 * zweipunktigen Umriss, und dass daraus keine Fläche wird, sagt
 * `validateSectionGeometry` mit Namen. Eine zweite Meinung darüber, was ein
 * brauchbarer Ring ist, wäre genau die Doppelung, die das Gate abschafft.
 *
 * Die Einheit ist MILLIMETER — die der `Vertex` und die von
 * `policy.arcTolerance`.
 */
export function deriveOutlineFromRings(
  rings: readonly Ring[],
  policy: SectionPolicy,
): readonly Polygon[] {
  return Object.freeze(
    rings.map((ring) => {
      // Die Schlusskante zurück zum Anfang ist KEIN Sonderfall: der erste Punkt
      // wird hinten angehängt, und danach ist jede Kante dieselbe Kante. Der
      // Vorgänger reist als lokale Variable mit, statt über den Index gesucht
      // zu werden — die Kante ist ein PAAR und keine Position.
      const points: { y: mm; z: mm }[] = [];
      let from: Vertex | undefined;

      for (const to of [...ring.vertices, ...ring.vertices.slice(0, 1)]) {
        // Am ersten Punkt endet noch keine Kante.
        if (from !== undefined) {
          // Der letzte Punkt jeder Kante IST der erste der nächsten:
          // `toPolyline` liefert beide Endpunkte, das Polygon nennt jeden Punkt
          // einmal. Das eine `slice` steht deshalb hier und an keiner zweiten
          // Stelle.
          points.push(...edgePoints(from, to, policy).slice(0, -1));
        }
        from = to;
      }

      return Object.freeze({ points: Object.freeze(points) });
    }),
  );
}

/**
 * Die Punkte EINER Kante, beide Endpunkte eingeschlossen.
 *
 * `bulge` GEHÖRT DEM ANFANGSPUNKT, wie im DXF-Format, aus dem die Zahl stammt:
 * `from.bulge` wölbt die Kante `from → to`. Der letzte Vertex wölbt damit die
 * Schlusskante zurück zum ersten.
 *
 * `Bulge.toPolyline` ist total: eine gerade Kante (`bulge` fehlt, ist `0`, oder
 * seine Stichhöhe bleibt unter der Toleranz) ergibt `[p1, p2]`, ein Bogen die
 * Zerlegung unter `policy.arcTolerance`. Genau diese Toleranz reist im Satz
 * neben dem Ergebnis mit (ADR 0033), damit später prüfbar bleibt, unter
 * welcher Zahl der Umriss entstanden ist.
 */
function edgePoints(
  from: Vertex,
  to: Vertex,
  policy: SectionPolicy,
): { y: number; z: number }[] {
  return Bulge.toPolyline(
    { y: from.y, z: from.z },
    { y: to.y, z: to.z },
    from.bulge ?? 0,
    policy.arcTolerance,
  ).points;
}
