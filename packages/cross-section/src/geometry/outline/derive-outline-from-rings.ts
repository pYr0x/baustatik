import { Bulge } from '@baustatik/section-geometry';
import type { Polygon, Ring, Vertex } from '../../model/section-geometry';
import type { SectionPolicy } from '../../policy';
import type { PointYZ } from '../point-yz';
import { usableBulge } from '../wall-graph/wall-polyline';

/**
 * Ein Polygon je Ring, in EINGABEREIHENFOLGE und mit UNVERÄNDERTEM Umlaufsinn.
 *
 * DER UMLAUFSINN WIRD NICHT ANGEFASST, und das ist die tragende Zusage: er
 * trägt die Bedeutung „Material" gegen „Loch"
 * ([ADR 0034](../../../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 * Ein Ring, den der Zeichner verkehrt herum gelegt hat, kommt verkehrt herum
 * heraus — und fällt im Gate auf, statt hier still repariert zu werden.
 *
 * DAS UNTERSCHEIDET DIESEN WEG VOM ANDEREN: `deriveOutlineFromWalls` SETZT den
 * Umlaufsinn, weil er ihn aus einer Verschachtelung ableitet, die es vorher
 * nicht gab. Hier gibt es sie bereits, und sie zu überschreiben hieße, die
 * Aussage des Zeichners zu verwerfen.
 *
 * TOTAL, ES WIRD NICHTS GEPRÜFT. Ein Ring mit zwei Punkten liefert einen
 * zweipunktigen Umriss, und dass daraus keine Fläche wird, sagt
 * `validateSectionGeometry` mit Namen. Eine zweite Meinung darüber, was ein
 * brauchbarer Ring ist, wäre genau die Doppelung, die das Gate abschafft.
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
      const points: PointYZ[] = [];
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
 * Die Punkte EINER Ringkante, beide Endpunkte eingeschlossen.
 *
 * `bulge` GEHÖRT DEM ANFANGSPUNKT, wie im DXF-Format, aus dem die Zahl stammt:
 * `from.bulge` wölbt die Kante `from → to`. Der letzte Vertex wölbt damit die
 * Schlusskante zurück zum ersten.
 *
 * `Bulge.toPolyline` ist total: eine gerade Kante (`bulge` fehlt, ist `0`, oder
 * seine Stichhöhe bleibt unter der Toleranz) ergibt `[p1, p2]`, ein Bogen die
 * Zerlegung unter `policy.discretisationTolerance`. Genau diese Toleranz reist im Satz
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
    usableBulge(from, to, from.bulge ?? 0, policy),
    policy.discretisationTolerance,
  ).points;
}
