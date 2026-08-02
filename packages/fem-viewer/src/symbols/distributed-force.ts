/**
 * Die STRECKENLAST als Flaeche mit zwei Randpfeilen und zwei Beschriftungen.
 *
 * DER UNTERSCHIED ZUM KRAFTPFEIL, und der Grund, warum das ein eigenes Symbol
 * ist und kein `pointForceSpecs` mit einem Parameter mehr: dort sagt die
 * Pfeillaenge NICHTS ueber den Betrag (siehe `point-force.ts`), hier sagt sie
 * ALLES. Ein Trapez hat zwei verschieden lange Pfeile, und eine Dreieckslast
 * hat an einem Ende gar keinen.
 *
 * DIE GRUNDLINIE IST DER SCHATTEN — die eine Regel, aus der alle neun
 * Kombinationen aus Lastrichtung und Bezugslaenge folgen (ADR 0028):
 *
 *   Die Grundlinie ist der Schatten des belasteten Abschnitts, geworfen von
 *   Parallellicht in Lastrichtung. Bei `trueLength` ist es die Stabachse selbst.
 *
 * Daraus folgt von allein, dass die Grundlinie bei jeder Projektion SENKRECHT
 * auf der Lastrichtung steht — das Polygon, entgegen der Lastrichtung
 * abgetragen, kann deshalb nicht flach werden. Und daraus folgt ebenso, dass
 * `horizontalProjection` und `verticalProjection` bei gleicher Richtung
 * DASSELBE Bild ergeben: sie unterscheiden sich im Wert, nicht in der Lage.
 *
 * DIE FIGUR HAENGT AN EINER EINZIGEN ZAHL: `forceArrowLengthPx`. Die
 * Pfeilspitzen liegen auf der Grundlinie, die Aussenkante des Polygons IST die
 * Verbindung der Pfeilenden. Eine zweite Zahl fuer die Hoehe gaebe es nur,
 * damit sie von der ersten abweichen kann.
 */

import { Line, type LineFrame, Point, Vector } from '@baustatik/fem-geometry';
import type { ArrowSpec, PolygonSpec, Spec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { FEMLayer } from '../layers';
import { forceLabelText, symbolLabelSpec } from './label';
import { markerSpec } from './marker';
import type { DistributedStyle, MarkerStyle, SymbolStyle } from './style';

/** Der aufgeloeste Stil der ganzen Figur — Pfeil, Flaeche, Marke. */
type Style = SymbolStyle & MarkerStyle & DistributedStyle;

/** Eine gezeichnete Streckenlast: wo sie liegt, wohin sie zeigt, wie sie verlaeuft. */
export interface DistributedForce {
  /** Global eindeutig, aus Last- und Stab-ID. */
  readonly id: string;
  /** Malband — das sagt die Quelle, nicht das Symbol. */
  readonly layer: FEMLayer;
  /**
   * Der belastete Abschnitt AUF der Stabachse, `p1` am Anfang. Nicht die
   * Grundlinie — die entsteht hier. Er traegt auch die beiden Marker.
   */
  readonly segment: Line;
  /** Einheitsvektor der Wirkrichtung, global. */
  readonly direction: Vector;
  /**
   * Das lokale System des STABES, nicht des Abschnitts. Nur der Parallelfall
   * braucht es: er traegt die Hoehe auf der lokalen -z-Seite ab.
   */
  readonly beamFrame: LineFrame;
  /** Schatten werfen oder auf der Stabachse stehen bleiben (`trueLength`). */
  readonly projected: boolean;
  /** kN/m MIT Vorzeichen, am Anfang des Abschnitts. */
  readonly q1: number;
  /** kN/m MIT Vorzeichen, am Ende des Abschnitts. */
  readonly q2: number;
}

/**
 * Unterhalb dieser Bauhoehe waere die Figur duenner als der Strich, mit dem sie
 * gezeichnet wird — dann greift der Parallelfall.
 *
 * Die Schwelle steht bewusst in SCREEN-Pixeln und nicht als Winkel: was zaehlt,
 * ist ob man die Flaeche noch sieht, und das haengt am Produkt aus Pfeillaenge
 * und `sin` des Winkels, nicht am Winkel allein.
 */
const MIN_BUILD_HEIGHT_PX = 2;

/**
 * Eine Streckenlast aus zwei vorzeichenbehafteten Werten.
 *
 * Anders als `pointForce` faltet sie das Vorzeichen NICHT in die Richtung: `q1`
 * und `q2` duerfen verschiedene Vorzeichen haben, eine gemeinsame Richtung gaebe
 * es dann nicht. Beide Werte 0 faellt heraus wie dort — ein Polygon der Hoehe 0
 * waere kein Bild, sondern ein Strich.
 */
export function distributedForce(
  force: DistributedForce,
): DistributedForce | undefined {
  if (force.q1 === 0 && force.q2 === 0) return undefined;
  // Ein Abschnitt ohne Laenge (`from === to`) hat keine Grundlinie. `validate.ts`
  // laesst das durch; das Zeichnen soll daran nicht scheitern.
  if (Line.length(force.segment) === 0) return undefined;
  return force;
}

/** Vorzeichenwechsel ohne `-0` — wie in `point-force.ts`: in Specs sonst Laerm. */
function opposite(value: number): number {
  return value === 0 ? 0 : -value;
}

/** Der Anteil eines Punktes in Lastrichtung, gemessen ab `origin`. */
function along(origin: Point, point: Point, direction: Vector): number {
  return Vector.dot(Vector.fromPoints(origin, point), direction);
}

/**
 * Die Grundlinie: der um `gap` freigestellte Schatten des Abschnitts.
 *
 * Projiziert wird, indem jeder Punkt um seinen eigenen Anteil in Lastrichtung
 * zurueckgeschoben wird — bis auf `smin`, den Anteil des am weitesten gegen die
 * Lastrichtung liegenden Endes. Genau dieses Ende behaelt damit den vollen
 * `gap`, alle anderen bekommen mehr: die Luecke sitzt an der GERINGSTEN Stelle,
 * und die Figur schneidet den Stab nirgends.
 *
 * Bei `trueLength` faellt der Projektionsanteil weg und uebrig bleibt die um
 * `gap` verschobene Stabachse.
 */
function baseline(force: DistributedForce, gap: number): Line {
  const { segment, direction } = force;
  const shift = (point: Point, offset: number): Point =>
    Point.translate(point, Vector.scale(direction, -offset));

  if (!force.projected) {
    return Line.make(shift(segment.p1, gap), shift(segment.p2, gap));
  }

  // `s(p1)` ist per Definition 0, weil ab `p1` gemessen wird.
  const s2 = along(segment.p1, segment.p2, direction);
  const smin = Math.min(0, s2);
  return Line.make(shift(segment.p1, gap - smin), shift(segment.p2, s2 - smin + gap));
}

/** Der Punkt auf `line` beim Parameter `t` aus [0, 1]. */
function at(line: Line, t: number): Point {
  return Point.translate(line.p1, Vector.scale(Vector.fromPoints(line.p1, line.p2), t));
}

function polygonSpec(
  force: DistributedForce,
  points: readonly Point[],
  style: Style,
): PolygonSpec {
  return {
    kind: 'polygon',
    id: `${force.id}:area`,
    layer: force.layer,
    points: points.map((point) => worldPoint(point.x, point.z)),
    closed: true,
    fillColor: style.distributedFillColor,
    strokeColor: style.forceColor,
    // Wie ueberall ungeteilt: der Adapter zeichnet in Screen-Pixeln.
    strokeWidth: style.forceArrowWidthPx,
  };
}

function arrowSpec(
  force: DistributedForce,
  part: 'q1' | 'q2',
  tail: Point,
  tip: Point,
  vp: Viewport,
  style: Style,
): ArrowSpec {
  return {
    kind: 'arrow',
    id: `${force.id}:${part}:arrow`,
    layer: force.layer,
    tail: worldPoint(tail.x, tail.z),
    tip: worldPoint(tip.x, tip.z),
    pointerLength: style.forcePointerLengthPx / vp.scale,
    pointerWidth: style.forcePointerWidthPx / vp.scale,
    strokeColor: style.forceColor,
    strokeWidth: style.forceArrowWidthPx,
    fillColor: style.forceColor,
  };
}

/** Die Ecken des Polygons, mit Nullstelle als Stuetzstelle bei Vorzeichenwechsel. */
function areaPoints(
  base: Line,
  outer1: Point,
  outer2: Point,
  q1: number,
  q2: number,
): readonly Point[] {
  // Wechselt das Vorzeichen, liegt eine Ecke auf jeder Seite der Grundlinie.
  // Ohne die Nullstelle dazwischen waere der Ring ueberschlagen und die Fuellung
  // eine Schleife statt zweier Lappen.
  if (q1 * q2 >= 0) {
    // Ein Wert 0 hat keine Ecke: sie faellt mit ihrem Grundlinienpunkt zusammen,
    // und zweimal derselbe Punkt macht aus dem Dreieck der Dreieckslast ein
    // Viereck mit einer Kante der Laenge 0.
    return [
      base.p1,
      ...(q1 === 0 ? [] : [outer1]),
      ...(q2 === 0 ? [] : [outer2]),
      base.p2,
    ];
  }
  const zero = at(base, Math.abs(q1) / (Math.abs(q1) + Math.abs(q2)));
  return [base.p1, outer1, zero, outer2, base.p2];
}

/** Ein Ende der Figur: welcher Wert dort steht und wo er hingehoert. */
interface End {
  readonly part: 'q1' | 'q2';
  readonly value: number;
  /** Punkt auf der Grundlinie. */
  readonly base: Point;
  /** Punkt auf der Aussenkante — das Pfeilende. */
  readonly outer: Point;
}

/**
 * Der Normalfall: Polygon entgegen der Lastrichtung, Pfeilspitzen auf der
 * Grundlinie, Pfeilenden auf der Aussenkante.
 */
function acrossSpecs(
  force: DistributedForce,
  base: Line,
  heights: readonly [number, number],
  vp: Viewport,
  style: Style,
): readonly Spec[] {
  const { q1, q2, direction } = force;

  // Das Vorzeichen dreht den Pfeil und legt damit auch fest, auf welcher Seite
  // der Grundlinie die zugehoerige Ecke liegt. Bei gemischten Vorzeichen
  // schneidet das Polygon die Grundlinie — genau so, wie die Last es tut.
  const corner = (point: Point, value: number, height: number): Point =>
    Point.translate(point, Vector.scale(direction, -Math.sign(value) * height));

  const ends: readonly [End, End] = [
    {
      part: 'q1',
      value: q1,
      base: base.p1,
      outer: corner(base.p1, q1, heights[0]),
    },
    {
      part: 'q2',
      value: q2,
      base: base.p2,
      outer: corner(base.p2, q2, heights[1]),
    },
  ];

  const specs: Spec[] = [
    polygonSpec(
      force,
      areaPoints(base, ends[0].outer, ends[1].outer, q1, q2),
      style,
    ),
  ];

  for (const end of ends) {
    // Wie beim Kraftpfeil: ein Wert ohne Betrag hat keine Richtung. Die
    // Dreieckslast bekommt an ihrem spitzen Ende deshalb weder Pfeil noch Label.
    if (end.value === 0) continue;
    const sign = Math.sign(end.value);
    specs.push(
      arrowSpec(force, end.part, end.outer, end.base, vp, style),
      symbolLabelSpec({
        id: `${force.id}:${end.part}:label`,
        layer: force.layer,
        text: forceLabelText(Math.abs(end.value), 'kN/m'),
        anchor: end.outer,
        direction: Vector.make(
          opposite(direction.dx * sign),
          opposite(direction.dz * sign),
        ),
        viewport: vp,
        style,
      }),
    );
  }

  return specs;
}

/**
 * Der Parallelfall: die Lastrichtung liegt in der Stabachse, der Schatten ist
 * ein Punkt und das quer abgetragene Polygon waere ein Strich.
 *
 * Trifft `lokal x` immer, und `global x`/`global z` genau dann, wenn der Stab
 * zufaellig waagerecht beziehungsweise senkrecht steht. Die Hoehe wird deshalb
 * auf der lokalen -z-Seite abgetragen — „oben" am waagerechten Stab —, und die
 * beiden Pfeile liegen LAENGS im Block statt an seinen Ecken. Ohne sie waeren
 * eine Last und ihr Gegenstueck dasselbe Bild.
 */
function alongSpecs(
  force: DistributedForce,
  gap: number,
  heights: readonly [number, number],
  vp: Viewport,
  style: Style,
): readonly Spec[] {
  const { segment, direction, beamFrame, q1, q2 } = force;
  const up = Vector.negate(beamFrame.ez);
  const base = Line.make(
    Point.translate(segment.p1, Vector.scale(up, gap)),
    Point.translate(segment.p2, Vector.scale(up, gap)),
  );
  const outer: readonly [Point, Point] = [
    Point.translate(base.p1, Vector.scale(up, heights[0])),
    Point.translate(base.p2, Vector.scale(up, heights[1])),
  ];

  // Die Pfeile besetzen das erste und das letzte Stueck des Blocks. Halb so lang
  // wie der Block, falls der kurz ist — sonst laegen sie uebereinander.
  const length = Math.min(
    style.forceArrowLengthPx / vp.scale,
    Line.length(segment) / 2,
  );
  const forward = Vector.scale(beamFrame.ex, length);
  const backward = Vector.negate(forward);
  // MIT dem Vorzeichen des Wertes: `direction` ist die blanke Lastachse, das
  // Vorzeichen steckt am Wert. Ohne es zeigten beide Pfeile bei `q < 0` verkehrt
  // herum — und im Parallelfall sind sie das Einzige, was die Richtung sagt.
  const downstream = (value: number): boolean =>
    Vector.dot(direction, beamFrame.ex) * Math.sign(value) > 0;

  const specs: Spec[] = [
    polygonSpec(force, [base.p1, outer[0], outer[1], base.p2], style),
  ];

  const ends: readonly [End, End] = [
    { part: 'q1', value: q1, base: base.p1, outer: outer[0] },
    { part: 'q2', value: q2, base: base.p2, outer: outer[1] },
  ];

  for (const [index, end] of ends.entries()) {
    if (end.value === 0) continue;
    const first = index === 0;
    // Auf halber Blockhoehe des jeweiligen Endes, damit der Pfeil im Block liegt.
    const seat = Point.translate(
      end.base,
      Vector.scale(up, (first ? heights[0] : heights[1]) / 2),
    );
    // Das Stueck neben dem Ende: am Anfang nach vorn, am Ende nach hinten. Wohin
    // der Pfeil ZEIGT, entscheidet die Lastrichtung, nicht das Ende.
    const other = Point.translate(seat, first ? forward : backward);
    const leaves = downstream(end.value) === first;
    specs.push(
      arrowSpec(
        force,
        end.part,
        leaves ? seat : other,
        leaves ? other : seat,
        vp,
        style,
      ),
      symbolLabelSpec({
        id: `${force.id}:${end.part}:label`,
        layer: force.layer,
        text: forceLabelText(Math.abs(end.value), 'kN/m'),
        // Am Blockrand, nicht am Pfeil: der Pfeil liegt hier INNEN, ein Label an
        // seinem Ende laege mitten in der Flaeche.
        anchor: end.outer,
        direction: up,
        viewport: vp,
        style,
      }),
    );
  }

  return specs;
}

export function distributedForceSpecs(
  force: DistributedForce,
  vp: Viewport,
  style: Style,
): readonly Spec[] {
  const gap = style.forceGapPx / vp.scale;
  const full = style.forceArrowLengthPx / vp.scale;

  // JE LAST normiert, nicht ueber das Bild: die Hoehe zeigt den Verlauf
  // INNERHALB einer Last. Zwei Lasten sind an ihr nicht zu vergleichen — siehe
  // CONTEXT.md, „the height is normalised per load".
  const peak = Math.max(Math.abs(force.q1), Math.abs(force.q2));
  const heights: readonly [number, number] = [
    (full * Math.abs(force.q1)) / peak,
    (full * Math.abs(force.q2)) / peak,
  ];

  // `cross` zweier Einheitsvektoren IST der Sinus des eingeschlossenen Winkels.
  const sine = Math.abs(Vector.cross(force.direction, force.beamFrame.ex));

  return [
    ...(style.forceArrowLengthPx * sine < MIN_BUILD_HEIGHT_PX
      ? alongSpecs(force, gap, heights, vp, style)
      : acrossSpecs(force, baseline(force, gap), heights, vp, style)),
    // Die Marken gehoeren zur Figur und stehen nicht beim Aufrufer wie bei der
    // Einzellast: dort ist die Marke der Fall „Last auf einem Stab", hier ist sie
    // konstitutiv — ohne sie sagt das Bild nicht, WELCHES Stueck belastet ist.
    markerSpec(`${force.id}:start`, force.layer, force.segment.p1, vp, style),
    markerSpec(`${force.id}:end`, force.layer, force.segment.p2, vp, style),
  ];
}
