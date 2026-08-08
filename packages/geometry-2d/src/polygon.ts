import { atOrThrow } from '@baustatik/core';
import { diff, intersection, union } from 'martinez-polygon-clipping';
import { DiscontinuousLinesError, InvalidPolygonError } from './errors';
import type { Line } from './line';
import { Point } from './point';
import type { BoundingBox, Transformable } from './types';

/**
 * Ein geschlossener Ring. DIE WINDUNG IST EINE AUSSAGE, keine Formalie:
 * `signedArea > 0` läuft im mathematisch positiven Sinn (die erste Achse auf
 * die zweite), `< 0` im umgekehrten. Seit ADR 0034 dreht die Fabrik sie nicht
 * mehr zurecht — wer ein Loch beschreiben will, kann es.
 */
export type Polygon = { readonly points: Point[] };

/**
 * Die rohen Flächenmomente eines Ringes, um den URSPRUNG und MIT VORZEICHEN.
 *
 * Die Namen sind die der ebenen Geometrie (`x`/`y`), nicht die des
 * Querschnitts: `Ixx = ∫y² dA` ist das Moment UM die x-Achse. Wer sie als `Iy`,
 * `Iz`, `Iyz` lesen will, wrappt sie dort, wo `y`/`z` gilt
 * (`@baustatik/section-geometry`).
 */
export type PolygonMoments = {
  /** `∫dA` — die vorzeichenbehaftete Fläche. */
  readonly A: number;
  /** `∫x dA`. */
  readonly Sx: number;
  /** `∫y dA`. */
  readonly Sy: number;
  /** `∫y² dA` — das Moment UM die x-Achse. */
  readonly Ixx: number;
  /** `∫x² dA` — das Moment UM die y-Achse. */
  readonly Iyy: number;
  /** `∫xy dA` — das Deviationsmoment, OHNE Negation. */
  readonly Ixy: number;
};

type MartinezCoord = [number, number];
type MartinezRing = MartinezCoord[];
type MartinezPoly = MartinezRing[];

const toMartinez = (poly: Polygon): MartinezPoly => {
  const ring: MartinezRing = poly.points.map((p) => [p.x, p.y]);
  ring.push(atOrThrow(ring, 0));
  return [ring];
};

const signedArea = (points: Point[]): number => {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area +=
      atOrThrow(points, i).x * atOrThrow(points, j).y -
      atOrThrow(points, j).x * atOrThrow(points, i).y;
  }
  return area / 2;
};

/**
 * Die Rückabbildung von martinez — und die Stelle, die den Umlaufsinn FESTLEGT.
 *
 * AUSDRÜCKLICH NORMALISIERT, seit `Polygon.make` es nicht mehr tut: der
 * Umlaufsinn einer fremden Bibliothek ist keine Aussage dieses Packages. Also
 * wird er an der GRENZE festgelegt statt durchgereicht — sonst hänge die Zusage
 * von `union`/`intersect`/`subtract` an einer Implementierung, die niemand hier
 * kontrolliert, und eine neue martinez-Version änderte still das Vorzeichen
 * jeder Fläche dahinter ([ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 */
const fromMartinez = (result: unknown): Polygon[] => {
  if (!result || !Array.isArray(result)) return [];
  return (result as MartinezPoly[]).flatMap((poly) => {
    const ring = atOrThrow(poly, 0);
    const points = ring.slice(0, -1).map(([x, y]) => Point.make(x, y));
    return [Polygon.toCounterClockwise(Polygon.make(points))];
  });
};

export const Polygon: Transformable<Polygon> & {
  make(points: Point[]): Polygon;
  fromLines(lines: Line[]): Polygon;
  area(polygon: Polygon): number;
  moments(points: readonly Point[]): PolygonMoments;
  centroid(polygon: Polygon): Point;
  perimeter(polygon: Polygon): number;
  contains(polygon: Polygon, p: Point): boolean;
  isClockwise(polygon: Polygon): boolean;
  toClockwise(polygon: Polygon): Polygon;
  toCounterClockwise(polygon: Polygon): Polygon;
  intersect(a: Polygon, b: Polygon): Polygon[];
  union(a: Polygon, b: Polygon): Polygon[];
  subtract(a: Polygon, b: Polygon): Polygon[];
  boundingBox(polygon: Polygon): BoundingBox;
} = {
  /**
   * PRÜFT NUR, DREHT NICHT. Die Windung kommt so heraus, wie sie hineingeht.
   *
   * Früher normalisierte die Fabrik still auf CCW. Damit war ein Lochring
   * überhaupt nicht baubar — und genau den braucht der Querschnitt, wo die
   * Windung „Material gegen Loch" BEDEUTET (ADR 0034). Eine Fabrik, die die
   * einzige bedeutungstragende Eigenschaft ihrer Eingabe wegwirft, ist die
   * falsche Tür.
   *
   * FOLGE FÜR DIE FLÄCHE: `Polygon.area` gibt weiterhin den Betrag zurück.
   * Wer das VORZEICHEN braucht — also wissen will, ob der Ring Material oder
   * Loch ist —, fragt `Polygon.moments(points).A`.
   */
  make: (points) => {
    if (points.length < 3)
      throw new InvalidPolygonError('weniger als 3 Punkte');
    return { points };
  },

  fromLines: (lines) => {
    if (lines.length < 3)
      throw new InvalidPolygonError(
        'weniger als 3 Linien fuer ein Polygon noetig',
      );

    const points: Point[] = [atOrThrow(lines, 0).p1];
    for (let i = 0; i < lines.length; i++) {
      if (
        i > 0 &&
        !Point.equals(
          atOrThrow(points, points.length - 1),
          atOrThrow(lines, i).p1,
        )
      ) {
        throw new DiscontinuousLinesError(i - 1);
      }
      points.push(atOrThrow(lines, i).p2);
    }

    if (
      !Point.equals(atOrThrow(points, points.length - 1), atOrThrow(points, 0))
    ) {
      throw new InvalidPolygonError('Linien bilden keinen geschlossenen Zug');
    }

    return Polygon.make(points.slice(0, -1));
  },

  /**
   * Die Fläche als BETRAG — und damit die falsche Tür für einen Lochring.
   *
   * Seit `make` die Windung stehen lässt, kann ein Ring negativ umlaufen und
   * damit ein Loch bedeuten. `area` sagt darüber nichts; wer die Windung
   * BRAUCHT, nimmt `moments(points).A` (vorzeichenbehaftet) oder `isClockwise`.
   */
  area: (poly) => Math.abs(signedArea(poly.points)),

  /**
   * Die ROHEN Flächenmomente eines Ringes — um den URSPRUNG, mit VORZEICHEN.
   *
   * ```text
   * A   = ∫dA      Sx = ∫x dA     Sy = ∫y dA
   * Ixx = ∫y² dA   Iyy = ∫x² dA   Ixy = ∫xy dA
   * ```
   *
   * EBENE GEOMETRIE, KEIN QUERSCHNITTSWISSEN: in der Signatur steht kein
   * Querschnittsbegriff, und die Funktion ist SKALENFREI — was hineingeht,
   * bestimmt, was herauskommt (mm liefert mm², mm³, mm⁴).
   *
   * ROH UND NICHT SCHWERPUNKTSBEZOGEN, und das ist die eigentliche Entscheidung:
   * schwerpunktsbezogen je Ring wäre für eine Summe unbrauchbar, weil die
   * Ringschwerpunkte verschieden sind und jeder einzeln zurückverschoben werden
   * müsste. Roh addieren sich alle sechs Zahlen LINEAR über die Ringe, ein
   * Lochring trägt sich über sein Vorzeichen selbst bei, und die
   * Steiner-Verschiebung in den Gesamtschwerpunkt passiert EINMAL am Ende.
   *
   * EIN RING UND KEINE LISTE: `Polygon[]` in der Signatur zöge die Aussage
   * „mehrere Ringe sind eine Figur" in dieses Package, wo sie nicht hingehört.
   * Die Summe ist beim Aufrufer ein Dreizeiler.
   *
   * Herleitung über Green: für jede Kante `i → j` mit
   * `c = x_i·y_j − x_j·y_i` ist
   *
   * ```text
   * A   = ½ Σ c
   * Sx  = ⅙ Σ (x_i + x_j)·c
   * Iyy = (1/12) Σ (x_i² + x_i·x_j + x_j²)·c
   * Ixy = (1/24) Σ (x_i·y_j + 2·x_i·y_i + 2·x_j·y_j + x_j·y_i)·c
   * ```
   */
  moments: (points) => {
    if (points.length < 3)
      throw new InvalidPolygonError('weniger als 3 Punkte');

    let A = 0;
    let Sx = 0;
    let Sy = 0;
    let Ixx = 0;
    let Iyy = 0;
    let Ixy = 0;

    const n = points.length;
    for (let i = 0; i < n; i++) {
      const pi = atOrThrow(points, i);
      const pj = atOrThrow(points, (i + 1) % n);
      const cross = pi.x * pj.y - pj.x * pi.y;

      A += cross;
      Sx += (pi.x + pj.x) * cross;
      Sy += (pi.y + pj.y) * cross;
      Iyy += (pi.x * pi.x + pi.x * pj.x + pj.x * pj.x) * cross;
      Ixx += (pi.y * pi.y + pi.y * pj.y + pj.y * pj.y) * cross;
      Ixy +=
        (pi.x * pj.y + 2 * pi.x * pi.y + 2 * pj.x * pj.y + pj.x * pi.y) * cross;
    }

    return Object.freeze({
      A: A / 2,
      Sx: Sx / 6,
      Sy: Sy / 6,
      Ixx: Ixx / 12,
      Iyy: Iyy / 12,
      Ixy: Ixy / 24,
    });
  },

  centroid: (poly) => {
    const n = poly.points.length;
    let cx = 0;
    let cy = 0;
    const a = signedArea(poly.points);

    if (Math.abs(a) < 1e-14) return atOrThrow(poly.points, 0);

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xj = atOrThrow(poly.points, j).x;
      const yj = atOrThrow(poly.points, j).y;
      const cross =
        atOrThrow(poly.points, i).x * yj - xj * atOrThrow(poly.points, i).y;
      cx += (atOrThrow(poly.points, i).x + xj) * cross;
      cy += (atOrThrow(poly.points, i).y + yj) * cross;
    }

    return Point.make(cx / (6 * a), cy / (6 * a));
  },

  perimeter: (poly) => {
    const pts = poly.points;
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      total += Point.distance(
        atOrThrow(pts, i),
        atOrThrow(pts, (i + 1) % pts.length),
      );
    }
    return total;
  },

  contains: (poly, p) => {
    let inside = false;
    const pts = poly.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ptI = atOrThrow(pts, i);
      const ptJ = atOrThrow(pts, j);
      const xi = ptI.x;
      const yi = ptI.y;
      const xj = ptJ.x;
      const yj = ptJ.y;
      if (
        yi > p.y !== yj > p.y &&
        p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  },

  isClockwise: (poly) => signedArea(poly.points) < 0,

  toClockwise: (poly) =>
    Polygon.isClockwise(poly) ? poly : { points: [...poly.points].reverse() },

  toCounterClockwise: (poly) =>
    !Polygon.isClockwise(poly) ? poly : { points: [...poly.points].reverse() },

  intersect: (a, b) => fromMartinez(intersection(toMartinez(a), toMartinez(b))),
  union: (a, b) => fromMartinez(union(toMartinez(a), toMartinez(b))),
  subtract: (a, b) => fromMartinez(diff(toMartinez(a), toMartinez(b))),

  boundingBox: (poly) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of poly.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    return { min: Point.make(minX, minY), max: Point.make(maxX, maxY) };
  },

  translate: (poly, v) => ({
    points: poly.points.map((p) => Point.translate(p, v)),
  }),
  rotate: (poly, angle, origin) => ({
    points: poly.points.map((p) => Point.rotate(p, angle, origin)),
  }),
  /**
   * KEHRT DIE WINDUNG UM — das ist die Wahrheit über eine Spiegelung.
   *
   * Früher drehte diese Stelle sie still zurück, weil `make` normalisierte.
   * Eine Spiegelung ist orientierungsUMkehrend; das zu verstecken hieße, aus
   * einem Loch beim Spiegeln stillschweigend Material zu machen (ADR 0034).
   */
  mirror: (poly, axisP1, axisP2) => ({
    points: poly.points.map((p) => Point.mirror(p, axisP1, axisP2)),
  }),
};
