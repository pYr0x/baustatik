/**
 * `bulge` in der Querschnittsebene — die Durchreiche von
 * `@baustatik/geometry-2d`.
 *
 * VOLLSTÄNDIG GEWRAPPT, alle sechs Funktionen, auch die drei koordinatenfreien.
 * Vorbild ist `normalizeAngleYZ` in `convert.ts`: dieses Package ist DIE
 * Durchreiche in die Querschnittsebene, und wer für drei von sechs Funktionen
 * am Package vorbei nach `@baustatik/geometry-2d` greifen müsste, hätte die
 * Regel schon gebrochen.
 *
 * DIE VORZEICHEN TRAGEN 1:1 DURCH, weil `convert.ts` orientierungstreu ist
 * (`x := y`, `y := z`, ohne Vorzeichenwechsel): ein positiver `bulge` dreht in
 * `geometry-2d` von `+x` auf `+y` und hier von `+y` auf `+z`
 * ([ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md)) — derselbe
 * Drehsinn wie `Arc.sweep`, im Bild (y rechts, z runter) rechtsdrehend.
 *
 * Was `bulge` bedeutet und warum `h = (Sehne/2)·|bulge|` exakt ist, steht im
 * Kopf von `packages/geometry-2d/src/bulge.ts` und wird hier nicht wiederholt.
 */
import { Bulge as GeometryBulge } from '@baustatik/geometry-2d';
import { fromXYArc, fromXYPolyline, toXYArc, toXYPoint } from './convert';
import type { Arc, Point, Polyline } from './types';

export const Bulge: {
  sweep(bulge: number): number;
  sagitta(chordLength: number, bulge: number): number;
  isStraight(chordLength: number, bulge: number, tolerance: number): boolean;
  toArc(p1: Point, p2: Point, bulge: number, tolerance: number): Arc;
  fromArc(arc: Arc): number;
  toPolyline(
    p1: Point,
    p2: Point,
    bulge: number,
    tolerance: number,
  ): Polyline;
} = {
  /**
   * Der Öffnungswinkel `Δ = 4·atan(bulge)` [rad], mit Vorzeichen.
   *
   * RECHNET NICHTS UM, und der Wrapper steht trotzdem hier: der Winkel bildet
   * 1:1 ab, weil die Abbildung orientierungstreu ist — genau die Begründung,
   * mit der `normalizeAngleYZ` dieselbe Zeile schreibt. Wer den Drehsinn in
   * y/z lesen will, soll ihn aus dem y/z-Package holen.
   */
  sweep: (bulge) => GeometryBulge.sweep(bulge),

  /**
   * Die Stichhöhe `h = (Sehne/2)·|bulge|` — EXAKT.
   *
   * RECHNET NICHTS UM: zwei Längen und eine dimensionslose Zahl, in beiden
   * Welten dieselbe Grösse. Die Einheit ist die des Aufrufers; im Querschnitt
   * sind das MILLIMETER (ADR 0031).
   */
  sagitta: (chordLength, bulge) => GeometryBulge.sagitta(chordLength, bulge),

  /**
   * Ob die Stichhöhe unter der Diskretisierungstoleranz bleibt.
   *
   * RECHNET NICHTS UM: die Toleranz ist eine Länge und teilt die Einheit mit
   * der Sehne. Sie kommt im Querschnitt aus `SectionPolicy.arcTolerance`.
   */
  isStraight: (chordLength, bulge, tolerance) =>
    GeometryBulge.isStraight(chordLength, bulge, tolerance),

  /** Der Bogen zwischen zwei Punkten. WIRFT `StraightBulgeError` bei einer Geraden. */
  toArc: (p1, p2, bulge, tolerance) =>
    fromXYArc(
      GeometryBulge.toArc(toXYPoint(p1), toXYPoint(p2), bulge, tolerance),
    ),

  /** Die Wölbung eines Bogens. WIRFT `FullCircleBulgeError` bei `|sweep| >= 2π`. */
  fromArc: (arc) => GeometryBulge.fromArc(toXYArc(arc)),

  /** TOTAL: eine gerade Kante ergibt `[p1, p2]`. BEIDE Endpunkte inklusive. */
  toPolyline: (p1, p2, bulge, tolerance) =>
    fromXYPolyline(
      GeometryBulge.toPolyline(toXYPoint(p1), toXYPoint(p2), bulge, tolerance),
    ),
};
