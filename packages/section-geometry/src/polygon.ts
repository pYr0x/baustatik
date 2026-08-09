import { atOrThrow } from '@baustatik/core';
import {
  Polygon as GeometryPolygon,
  type InflateEndType,
  type InflateOptions,
} from '@baustatik/geometry-2d';
import {
  fromXYBoundingBox,
  fromXYPoint,
  toXYLine,
  toXYPoint,
  toXYPolygon,
  toXYPolyline,
  toXYVector,
  type XYPolygon,
} from './convert';
import { InvalidPolygonError } from './errors';
import type {
  BoundingBox,
  Line,
  Point,
  Polygon as SectionPolygon,
  Polyline,
  Transformable,
} from './types';

/**
 * Schleifenflaeche nach der Gauss'schen Trapezformel, direkt in y/z gerechnet.
 *
 * Vorzeichen: **positiv, wenn der Ring im positiven Drehsinn (+y → +z)
 * umläuft**. Damit zählt sie im selben Sinn wie `Vector.angle`,
 * `Vector.cross` und `Arc.sweep` — und ist damit derselbe Sinn, den
 * `geometry-2d` counter-clockwise nennt (ADR 0034). Wie das im BILD aussieht
 * (rechtsdrehend, weil z nach unten zeigt), beantwortet die Viewer-Schicht und
 * nicht dieses Package.
 *
 * Bleibt bewusst nativ statt an geometry-2d zu delegieren: seit `convert.ts`
 * orientierungstreu abbildet, ist die dortige Formel rechnerisch dieselbe, und
 * die Windungsregel dieses Packages soll an einer Stelle stehen.
 */
const signedAreaYZ = (points: readonly Point[]): number => {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = atOrThrow(points, i);
    const pj = atOrThrow(points, j);
    area += pi.y * pj.z - pj.y * pi.z;
  }
  return area / 2;
};

/**
 * Der reine Mapper zurück nach y/z — er DREHT NICHTS.
 *
 * Hieß früher `fromXYPolygonNormalized`, weil `Polygon.make` dahinter still
 * normalisierte. Seit ADR 0034 tut es das nicht mehr, und der Name nennt jetzt,
 * was passiert: die Windung reist unverändert durch, weil `convert.ts`
 * orientierungstreu abbildet. Wo eine bestimmte Windung ZUGESICHERT ist
 * (`intersect`/`union`/`subtract`), steht sie in `geometry-2d` an der
 * martinez-Grenze und nicht hier ein zweites Mal.
 */
const fromXYPolygon = (polygon: XYPolygon): SectionPolygon =>
  Polygon.make(polygon.points.map(fromXYPoint));

/**
 * Die rohen Flächenmomente eines Ringes in der QUERSCHNITTSEBENE — um den
 * Ursprung, mit Vorzeichen.
 *
 * Die Namen tragen die Symbole der Norm (`Iy`, `Iz`, `Iyz`) und nicht die
 * Achsenpaare der ebenen Geometrie: das ist der ganze Unterschied zu
 * `PolygonMoments` in `@baustatik/geometry-2d`, und deshalb steht der Wrapper
 * überhaupt hier.
 *
 * SKALENFREI: was hineingeht, bestimmt, was herauskommt. Im Querschnitt sind
 * das MILLIMETER (ADR 0031), also mm², mm³ und mm⁴.
 */
export type PolygonMomentsYZ = {
  /** `∫dA` [L²] — vorzeichenbehaftet: `> 0` Material, `< 0` Loch. */
  readonly A: number;
  /** `∫y dA` [L³]. */
  readonly Sy: number;
  /** `∫z dA` [L³]. */
  readonly Sz: number;
  /** `∫z² dA` [L⁴] — das Moment UM die y-Achse. */
  readonly Iy: number;
  /** `∫y² dA` [L⁴] — das Moment UM die z-Achse. */
  readonly Iz: number;
  /** `∫y·z dA` [L⁴] — OHNE Negation, siehe `moments`. */
  readonly Iyz: number;
};

/**
 * Ein Zug samt seiner Aufweitung, in der QUERSCHNITTSEBENE.
 *
 * Reiner Namenswechsel auf `InflatePath` aus `@baustatik/geometry-2d`: `y`
 * statt `x`, `z` statt `y`. `delta` und `endType` reisen unverändert durch —
 * beide sind koordinatenfrei.
 */
export type InflatePathYZ = {
  readonly polyline: Polyline;
  /**
   * Die Aufweitung nach JEDER Seite [mm] — bei der Wand `t/2`.
   *
   * `0` mit `endType: 'joined'` ist die IDENTITÄT: der Ring geht unverändert in
   * die Vereinigung. So kommt die Miter-Ecke am Dickensprung in den Umriss, die
   * kein Offset erzeugen kann
   * ([ADR 0038](../../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)).
   */
  readonly delta: number;
  readonly endType: InflateEndType;
};

export const Polygon: Transformable<SectionPolygon> & {
  make(points: readonly Point[]): SectionPolygon;
  inflate(
    paths: readonly InflatePathYZ[],
    options?: InflateOptions,
  ): SectionPolygon[];
  fromLines(lines: Line[]): SectionPolygon;
  area(polygon: SectionPolygon): number;
  signedArea(points: readonly Point[]): number;
  moments(points: readonly Point[]): PolygonMomentsYZ;
  centroid(polygon: SectionPolygon): Point;
  perimeter(polygon: SectionPolygon): number;
  contains(polygon: SectionPolygon, point: Point): boolean;
  isClockwise(polygon: SectionPolygon): boolean;
  toClockwise(polygon: SectionPolygon): SectionPolygon;
  toCounterClockwise(polygon: SectionPolygon): SectionPolygon;
  intersect(a: SectionPolygon, b: SectionPolygon): SectionPolygon[];
  union(a: SectionPolygon, b: SectionPolygon): SectionPolygon[];
  subtract(a: SectionPolygon, b: SectionPolygon): SectionPolygon[];
  boundingBox(polygon: SectionPolygon): BoundingBox;
} = {
  /**
   * PRÜFT NUR, DREHT NICHT — wie in `@baustatik/geometry-2d` (ADR 0034).
   *
   * Früher normalisierte die Fabrik auf `signedArea >= 0`. Damit war ein
   * Lochring nicht baubar, und genau den braucht der Querschnitt: dort
   * BEDEUTET die Windung Material (`> 0`) gegen Loch (`< 0`).
   *
   * FOLGE: `area` gibt weiterhin den Betrag zurück und ist damit die falsche
   * Tür für einen Lochring. Die richtige heißt `signedArea`.
   */
  make: (points) => {
    if (points.length < 3)
      throw new InvalidPolygonError('weniger als 3 Punkte');
    return { points };
  },

  /**
   * ZÜGE AUFWEITEN UND VEREINIGEN, in y/z
   * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
   *
   * Reine Durchreichung wie `union` und `moments`, und aus demselben Grund:
   * `@baustatik/geometry-2d` wird oberhalb dieses Packages NICHT importiert,
   * also muss jede Fläche, die ein Verbraucher braucht, hier durch — auch die
   * koordinatenfreien Teile davon (`delta`, `endType`, `InflateOptions`).
   *
   * DIE WINDUNGSREGEL REIST UNVERÄNDERT MIT, weil `convert.ts`
   * orientierungstreu abbildet: was dort `signedArea > 0` heisst, heisst hier
   * `signedArea > 0` — Material gegen Loch (ADR 0034). Die Zusage steht an der
   * Clipper2-Grenze in `geometry-2d` und wird hier nicht ein zweites Mal
   * gegeben.
   *
   * WAS HIER NICHT LIEGT: `deriveOutline` und die Drift-Prüfung. Ihre Signatur
   * nennt `SectionGeometry` und `SectionPolicy`, also Typen von
   * `@baustatik/cross-section` — sie liegen dort. Hier liegt allein die
   * Geometrieoperation, die sie benutzen.
   */
  inflate: (paths, options) =>
    GeometryPolygon.inflate(
      paths.map((path) => ({
        polyline: toXYPolyline(path.polyline),
        delta: path.delta,
        endType: path.endType,
      })),
      options,
    ).map((polygon) => fromXYPolygon(polygon)),

  fromLines: (lines) =>
    fromXYPolygon(
      GeometryPolygon.fromLines(lines.map((line) => toXYLine(line))),
    ),

  /**
   * Die Fläche als BETRAG — die falsche Tür für einen Lochring.
   *
   * Seit `make` die Windung stehen lässt, kann ein Ring negativ umlaufen und
   * damit ein Loch bedeuten. `area` sagt darüber nichts; wer die Windung
   * braucht, nimmt `signedArea`.
   */
  area: (polygon) => Math.abs(signedAreaYZ(polygon.points)),

  signedArea: (points) => signedAreaYZ(points),

  /**
   * Die rohen Flächenmomente in y/z — um den URSPRUNG, MIT VORZEICHEN.
   *
   * Reiner Namenswechsel auf `PolygonMoments` aus `@baustatik/geometry-2d`:
   * `x := y`, `y := z`. Weil die Abbildung orientierungstreu ist, reisen alle
   * sechs Zahlen unverändert durch — auch `Ixy`, das hier `Iyz` heißt.
   *
   * `Iyz = +∫y·z dA`, OHNE NEGATION. Das ist das nackte Green-Integral und die
   * MATHEMATISCHE Konvention, zu der `tan 2α = −2·Iyz/(Iy − Iz)` gehört
   * ([ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md)). Die
   * klassische deutsche Elastostatik führt die andere (`Iyz = −∫y·z dA` mit
   * `+2·Iyz`); beide liefern dasselbe `α`, aber Definitions- und
   * Formelvorzeichen reisen immer GEMEINSAM.
   */
  moments: (points) => {
    const raw = GeometryPolygon.moments(points.map(toXYPoint));
    return Object.freeze({
      A: raw.A,
      Sy: raw.Sx,
      Sz: raw.Sy,
      Iy: raw.Ixx,
      Iz: raw.Iyy,
      Iyz: raw.Ixy,
    });
  },

  centroid: (polygon) =>
    fromXYPoint(GeometryPolygon.centroid(toXYPolygon(polygon))),

  perimeter: (polygon) => GeometryPolygon.perimeter(toXYPolygon(polygon)),

  contains: (polygon, point) =>
    GeometryPolygon.contains(toXYPolygon(polygon), toXYPoint(point)),

  /**
   * `true` genau für `signedArea < 0` — DIESELBE Antwort wie in
   * `@baustatik/geometry-2d`.
   *
   * KEHRT SEIT ADR 0034 UM. Vorher stand hier `> 0` mit der Begründung „im
   * Bild rechtsdrehend, weil z nach unten zeigt" — eine Aussage über die
   * ZEICHNUNG in einer API, die nicht zeichnet, und seit `convert.ts`
   * orientierungstreu abbildet schlicht der falsche Name für den mathematisch
   * positiven Sinn. `(y, z)` IST das mathematische System unter anderem Namen;
   * `signedArea > 0` heißt counter-clockwise, in beiden Packages dasselbe Wort.
   *
   * NACHSATZ ZUR ZEICHNUNG, und mehr ist es nicht: mit z nach unten sieht ein
   * counter-clockwise laufender Ring im Bild rechtsdrehend aus. Wo im Bild
   * „oben" ist, beantwortet die Viewer-Schicht.
   */
  isClockwise: (polygon) => signedAreaYZ(polygon.points) < 0,

  toClockwise: (polygon) =>
    Polygon.isClockwise(polygon)
      ? polygon
      : { points: [...polygon.points].reverse() },

  toCounterClockwise: (polygon) =>
    Polygon.isClockwise(polygon)
      ? { points: [...polygon.points].reverse() }
      : polygon,

  intersect: (a, b) =>
    GeometryPolygon.intersect(toXYPolygon(a), toXYPolygon(b)).map((polygon) =>
      fromXYPolygon(polygon),
    ),

  union: (a, b) =>
    GeometryPolygon.union(toXYPolygon(a), toXYPolygon(b)).map((polygon) =>
      fromXYPolygon(polygon),
    ),

  subtract: (a, b) =>
    GeometryPolygon.subtract(toXYPolygon(a), toXYPolygon(b)).map((polygon) =>
      fromXYPolygon(polygon),
    ),

  boundingBox: (polygon) =>
    fromXYBoundingBox(GeometryPolygon.boundingBox(toXYPolygon(polygon))),

  translate: (polygon, vector) =>
    fromXYPolygon(
      GeometryPolygon.translate(toXYPolygon(polygon), toXYVector(vector)),
    ),

  rotate: (polygon, angle, origin) =>
    fromXYPolygon(
      GeometryPolygon.rotate(
        toXYPolygon(polygon),
        angle,
        origin ? toXYPoint(origin) : undefined,
      ),
    ),

  mirror: (polygon, axisP1, axisP2) =>
    fromXYPolygon(
      GeometryPolygon.mirror(
        toXYPolygon(polygon),
        toXYPoint(axisP1),
        toXYPoint(axisP2),
      ),
    ),
};
