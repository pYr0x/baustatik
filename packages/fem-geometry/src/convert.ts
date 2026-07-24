/**
 * Abbildung zwischen der Baustatik-Welt (x rechts, z **abwaerts**) und der
 * Rechenwelt von `@baustatik/geometry-2d` (x/y).
 *
 * **Die Abbildung ist die Identitaet — `y := z`, ohne Vorzeichenwechsel.**
 * Das sieht auf den ersten Blick falsch aus, weil y "nach oben" und z "nach
 * unten" zeigt. Der Punkt ist: `geometry-2d` weiss nicht, wo oben ist. Es
 * zeichnet nie etwas, "y ist oben" steht nirgends im Code. Was dort steht, ist
 * ausschliesslich eine Orientierungsaussage —
 *
 *   perpendicular(v) = (-dy, dx),  angle(v) = atan2(dy, dx)
 *
 * also: *eine positive Drehung fuehrt die erste Achse auf die zweite*. Genau
 * das ist auch unsere FEM-Konvention ("positiver Drehsinn von +x nach +z",
 * `fem-element/CONTEXT.md`). Beide Systeme sind strukturell gleich, deshalb
 * ist die algebraisch richtige Zuordnung `x↔x`, `z↔y` ohne Minus.
 *
 * **Warum nicht `y = -z`?** Eine Spiegelung `M = diag(1,-1)` konjugiert jede
 * Drehung `P` in ihre Umkehrung: `M·P·M = P⁻¹`. Jede delegierte
 * drehsinnbehaftete Operation — `perpendicular`, `rotate`, `angle`,
 * `Line.normalVector`, `Line.parallel` — kaeme dann invertiert zurueck, waehrend
 * `dot` und `distance` wegen `M·M = I` unauffaellig richtig blieben. Ergebnis
 * waere ein stiller Vorzeichenfehler bei jeder Querlast: richtiger Betrag,
 * falsches Vorzeichen. Diese Fassung hatte das Package frueher; die Tests in
 * `tests/` halten den Drehsinn jetzt fest.
 *
 * Die x/y-Zwischenwelt existiert nur innerhalb einer einzelnen Operation und
 * wird nie gezeichnet — relevant ist allein, was in x/z zurueckkommt. Die
 * Frage "wo ist im Bild oben" beantwortet die x/z → u/v-Abbildung im
 * `fem-viewer`, nicht dieses Package.
 *
 * Der Nutzen der Umrechnung ist damit rein typseitig: `Point{x,z}` und
 * `Point{x,y}` bleiben unterscheidbar, sodass die beiden Welten nicht
 * versehentlich vermischt werden.
 */
import type {
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
export type XYBoundingBox = { readonly min: XYPoint; readonly max: XYPoint };

const normalizeAngleXY = (angle: number): number => ((angle % TAU) + TAU) % TAU;

/**
 * Normiert einen Winkel auf `[0, 2*PI)`. Weil die Abbildung orientierungstreu
 * ist, ist das dieselbe Normierung wie in x/y — der Winkel selbst zaehlt in
 * beiden Welten von +x zur zweiten Achse, hier also von +x nach +z.
 */
export const normalizeAngleYZ = (angle: number): number =>
  normalizeAngleXY(angle);

// y := z, kein Vorzeichenwechsel — Begruendung im Kopf dieser Datei.
export const toXYPoint = (point: Point): XYPoint => ({
  x: point.x,
  y: point.z,
});

export const fromXYPoint = (point: XYPoint): Point => ({
  x: point.x,
  z: point.y,
});

export const toXYVector = (vector: Vector): XYVector => ({
  dx: vector.dx,
  dy: vector.dz,
});

export const fromXYVector = (vector: XYVector): Vector => ({
  dx: vector.dx,
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
