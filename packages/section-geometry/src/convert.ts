/**
 * Abbildung zwischen der Querschnittswelt (y rechts, z **abwaerts**) und der
 * Rechenwelt von `@baustatik/geometry-2d` (x/y).
 *
 * **Die Abbildung ist orientierungstreu — `x := y`, `y := z`, ohne
 * Vorzeichenwechsel.** Das sieht auf den ersten Blick falsch aus, weil das y
 * von `geometry-2d` "nach oben" und unser z "nach unten" zeigt. Der Punkt ist:
 * `geometry-2d` weiss nicht, wo oben ist. Es zeichnet nie etwas, "y ist oben"
 * steht nirgends in seinem Code. Was dort steht, ist ausschliesslich eine
 * Orientierungsaussage —
 *
 *   perpendicular(v) = (-dy, dx),  angle(v) = atan2(dy, dx)
 *
 * also: *eine positive Drehung fuehrt die erste Achse auf die zweite*. Genau so
 * ist der Drehsinn hier definiert: **positiv fuehrt +y auf +z**.
 *
 * **Warum `+y → +z` und nicht "CCW wie gezeichnet"?** Der Querschnitt haengt am
 * Stab. Im rechtshaendigen (x, y, z) fuehrt eine Drehung um die Stabachse +x
 * gerade +y auf +z — derselbe Drehsinn, den `@baustatik/fem-geometry` fuer die
 * Stabebene verwendet (`+x → +z`). Ein Querschnitt, der andersherum dreht als
 * der Stab, an dem er haengt, ist eine Fehlerquelle ohne Gegenwert.
 * Im Bild (y rechts, z runter) ist das rechtsdrehend.
 *
 * **Warum nicht `y = -z`?** Eine Spiegelung `M = diag(1,-1)` konjugiert jede
 * Drehung `P` in ihre Umkehrung: `M·P·M = P⁻¹`. Jede delegierte
 * drehsinnbehaftete Operation — `perpendicular`, `rotate`, `angle`,
 * `Line.normalVector`, `Line.parallel`, `Arc.sweep` — kaeme dann invertiert
 * zurueck, waehrend `dot` und `distance` wegen `M·M = I` unauffaellig richtig
 * blieben. Das Package war frueher so gebaut (Drehsinn "CCW wie gezeichnet")
 * und hatte dadurch einen dauerhaften Riss: `Vector.cross` und
 * `Polygon.signedArea` sind nativ in y/z gerechnet und liefen deshalb im
 * Gegensinn zu `angle`/`rotate`. Mit der orientierungstreuen Abbildung ist der
 * Riss weg — alle fuenf stimmen jetzt ueberein.
 *
 * Die x/y-Zwischenwelt existiert nur innerhalb einer einzelnen Operation und
 * wird nie gezeichnet — relevant ist allein, was in y/z zurueckkommt. Wo im
 * Bild "oben" ist, beantwortet die Viewer-Schicht, nicht dieses Package.
 *
 * Der Nutzen der Umrechnung ist damit rein typseitig: `Point{y,z}` und
 * `Point{x,y}` bleiben unterscheidbar, sodass die beiden Welten nicht
 * versehentlich vermischt werden.
 */
import type {
  Arc,
  BoundingBox,
  Line,
  Point,
  Polygon,
  Polyline,
  Vector,
} from './types';

const TAU = 2 * Math.PI;

export type XYPoint = { readonly x: number; readonly y: number };
export type XYVector = { readonly dx: number; readonly dy: number };
export type XYLine = { readonly p1: XYPoint; readonly p2: XYPoint };
export type XYPolyline = { readonly points: XYPoint[] };
export type XYPolygon = { readonly points: XYPoint[] };
export type XYArc = {
  readonly center: XYPoint;
  readonly radius: number;
  readonly startAngle: number;
  readonly sweep: number;
};
export type XYBoundingBox = { readonly min: XYPoint; readonly max: XYPoint };

const normalizeAngleXY = (angle: number): number => ((angle % TAU) + TAU) % TAU;

/**
 * Normiert einen Winkel auf `[0, 2*PI)`. Weil die Abbildung orientierungstreu
 * ist, ist das dieselbe Normierung wie in x/y — der Winkel zaehlt in beiden
 * Welten von der ersten Achse zur zweiten, hier also von +y nach +z.
 */
export const normalizeAngleYZ = (angle: number): number =>
  normalizeAngleXY(angle);

// x := y, y := z — kein Vorzeichenwechsel, Begruendung im Kopf dieser Datei.
export const toXYPoint = (point: Point): XYPoint => ({
  x: point.y,
  y: point.z,
});

export const fromXYPoint = (point: XYPoint): Point => ({
  y: point.x,
  z: point.y,
});

export const toXYVector = (vector: Vector): XYVector => ({
  dx: vector.dy,
  dy: vector.dz,
});

export const fromXYVector = (vector: XYVector): Vector => ({
  dy: vector.dx,
  dz: vector.dy,
});

export const toXYLine = (line: Line): XYLine => ({
  p1: toXYPoint(line.p1),
  p2: toXYPoint(line.p2),
});

export const fromXYLine = (line: XYLine): Line => ({
  p1: fromXYPoint(line.p1),
  p2: fromXYPoint(line.p2),
});

export const toXYPolyline = (polyline: Polyline): XYPolyline => ({
  points: polyline.points.map(toXYPoint),
});

export const fromXYPolyline = (polyline: XYPolyline): Polyline => ({
  points: polyline.points.map(fromXYPoint),
});

export const toXYPolygon = (polygon: Polygon): XYPolygon => ({
  points: polygon.points.map(toXYPoint),
});

export const toXYArc = (arc: Arc): XYArc => ({
  center: toXYPoint(arc.center),
  radius: arc.radius,
  // Winkel bilden 1:1 ab: die Abbildung ist orientierungstreu, ein Punkt unter
  // dem y/z-Winkel theta (von +y nach +z) landet unter demselben x/y-Winkel.
  // Positiver Sweep laeuft damit von +y nach +z, im Bild also rechtsdrehend.
  startAngle: arc.startAngle,
  sweep: arc.sweep,
});

export const fromXYArc = (arc: XYArc): Arc => ({
  center: fromXYPoint(arc.center),
  radius: arc.radius,
  startAngle: arc.startAngle,
  sweep: arc.sweep,
});

// Ohne Vorzeichenwechsel bleibt die Ordnung min <= max erhalten; das fruehere
// Umsortieren per Math.min/Math.max war nur noetig, um die Spiegelung wieder
// geradezuruecken.
export const toXYBoundingBox = (boundingBox: BoundingBox): XYBoundingBox => ({
  min: toXYPoint(boundingBox.min),
  max: toXYPoint(boundingBox.max),
});

export const fromXYBoundingBox = (boundingBox: XYBoundingBox): BoundingBox => ({
  min: fromXYPoint(boundingBox.min),
  max: fromXYPoint(boundingBox.max),
});
