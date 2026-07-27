/**
 * Das MOMENT als gebogener Pfeil mit Beschriftung: ein 270-Grad-Bogen mit
 * Spitze, Mittelpunkt im Angriffspunkt.
 *
 * DREHSINN — die eine Regel, die hier nicht geraten werden darf: global y zeigt
 * aus der Zeichenebene heraus, ein positives Moment dreht deshalb im Bild GEGEN
 * den Uhrzeigersinn (`fem-loads/src/types.ts`, Abschnitt DREHSINN). Auf dem
 * Schirm waechst der Winkel von +u nach +v, also mit v nach unten IM
 * Uhrzeigersinn — ein positives Moment bekommt damit einen NEGATIVEN
 * `sweepAngle`. Das ist der einzige Vorzeichenwechsel in dieser Datei.
 *
 * WO DIE LUECKE SITZT: unten, bei beiden Vorzeichen. Festgehalten wird die
 * LUECKE, nicht der Kopf — haelt man stattdessen den Kopf fest, wandert die
 * Luecke mit dem Umlaufsinn und steht beim einen Vorzeichen unten, beim anderen
 * seitlich. Der Kopf sitzt am ENDE des Bogens, also an der Kante der Luecke, in
 * die er hineinzeigt: beim positiven Moment unten links, beim negativen unten
 * rechts. Die Anfangswinkel folgen daraus: +45 beziehungsweise +135 Grad.
 *
 * Wie beim Kraftpfeil ist der Radius ein SCHEMA und sagt nichts ueber den
 * Betrag; den traegt das Label.
 */

import { Point, Vector } from '@baustatik/fem-geometry';
import type { ArcPathSpec, PolygonSpec, Spec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import { loadLabelSpec, momentLabelText } from './label';
import type { LoadStyle } from './style';

/** Ein gezeichnetes Moment: wo es angreift, wie herum es dreht, wie gross es ist. */
export interface Moment {
  /** Global eindeutig, aus Last-ID, Ziel-ID und ggf. Komponente. */
  readonly id: string;
  /** Angriffspunkt — MITTELPUNKT des Bogens, nicht sein Anfang. */
  readonly at: Point;
  /** +1 = gegen den Uhrzeigersinn (positives Moment), -1 = mit dem Uhrzeigersinn. */
  readonly sense: 1 | -1;
  /** Betrag in kNm, bereits ohne Vorzeichen. */
  readonly magnitude: number;
}

/** Ueberstrichener Winkel. 270 Grad lassen eine Luecke, die man als solche sieht. */
const SWEEP = (3 * Math.PI) / 2;

/**
 * Mitte der Luecke, bei beiden Vorzeichen dieselbe: UNTEN. `v` waechst nach
 * unten, unten ist deshalb +90 Grad und nicht -90.
 */
const GAP_CENTER = Math.PI / 2;

/** Was von der vollen Umdrehung uebrig bleibt, je zur Haelfte links und rechts. */
const HALF_GAP = (2 * Math.PI - SWEEP) / 2;

/**
 * Ein Moment aus vorzeichenbehaftetem Wert.
 *
 * `undefined` und 0 fallen gemeinsam heraus, aus demselben Grund wie bei der
 * Kraft: ein Wert ohne Betrag hat keinen Drehsinn.
 */
export function moment(
  id: string,
  at: Point,
  value: number | undefined,
): Moment | undefined {
  if (value === undefined || value === 0) return undefined;
  return { id, at, sense: value > 0 ? 1 : -1, magnitude: Math.abs(value) };
}

/**
 * Winkel, den die Spitze vom Mittelpunkt aus einnimmt.
 *
 * Die Spitze steht TANGENTIAL auf dem Kreis, Basis auf dem Kreis, Spitzenpunkt
 * `pointerLength` davor — Basis, Mittelpunkt und Spitzenpunkt bilden also ein
 * rechtwinkliges Dreieck, und der gesuchte Winkel ist genau dessen `atan`. Die
 * naheliegende Bogenlaengen-Naeherung `pointerLength / radius` ueberschaetzt ihn
 * und liesse Bogen plus Spitze weniger als die vollen 270 Grad ueberstreichen.
 */
function headSpan(radius: number, pointerLength: number): number {
  return Math.atan(pointerLength / radius);
}

/**
 * In (-π, π] falten, damit in der Spec die Zahl steht, ueber die man redet:
 * -135 Grad statt 225 Grad. Gezeichnet wird beides gleich.
 */
function normalizeAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

function onCircle(center: Point, radius: number, angle: number): Point {
  return Point.make(
    center.x + radius * Math.cos(angle),
    center.z + radius * Math.sin(angle),
  );
}

/**
 * Die Spitze als Dreieck.
 *
 * Ihre BASISMITTE sitzt auf dem Kreis, dort wo der gekuerzte Bogen endet — die
 * stumpfe Strichkappe des Bogens verschwindet damit unter dem Dreieck. Die
 * Spitze steht tangential davor, in Laufrichtung des Bogens.
 *
 * GEFUELLT UND BESTRICHEN, obwohl die Fuellung allein das Dreieck schon
 * hinstellt: genau das tut Konva am Kraftpfeil auch. Ein nur gefuelltes Dreieck
 * mit denselben `pointerLength`/`pointerWidth` faellt gegen den Pfeilkopf
 * sichtbar kleiner aus — der Strich liegt mittig auf der Kontur und traegt nach
 * aussen eine halbe Strichbreite auf, an der spitzen Ecke durch die Gehrung
 * sogar `strokeWidth / 2 / sin(halber Spitzenwinkel)`, bei diesen Massen also
 * fast drei Pixel. Mit demselben Strich bedeuten die beiden Zahlen in
 * `LoadStyle` in beiden Symbolen dasselbe, statt dass Faktoren den Unterschied
 * nachstellen muessten.
 */
function headSpec(
  m: Moment,
  radius: number,
  baseAngle: number,
  sweepSign: number,
  length: number,
  style: Required<LoadStyle>,
  vp: Viewport,
): PolygonSpec {
  const base = onCircle(m.at, radius, baseAngle);
  // `pointerWidth` ist wie bei Konva die VOLLE Basisbreite, nicht die halbe.
  const half = style.momentPointerWidthPx / vp.scale / 2;

  // Tangente in Laufrichtung: Ableitung des Kreispunkts nach dem Winkel, mit
  // dem Vorzeichen des Umlaufs. Die Normale steht senkrecht darauf.
  const tx = -Math.sin(baseAngle) * sweepSign;
  const tz = Math.cos(baseAngle) * sweepSign;

  return {
    kind: 'polygon',
    id: `${m.id}:head`,
    layer: 'loads',
    points: [
      worldPoint(base.x + tx * length, base.z + tz * length),
      worldPoint(base.x - tz * half, base.z + tx * half),
      worldPoint(base.x + tz * half, base.z - tx * half),
    ],
    closed: true,
    fillColor: style.momentColor,
    strokeColor: style.momentColor,
    // Wie am Bogen ungeteilt: der Adapter zeichnet in Screen-Pixeln.
    strokeWidth: style.momentArcWidthPx,
  };
}

function arcSpec(
  m: Moment,
  radius: number,
  startAngle: number,
  sweepAngle: number,
  style: Required<LoadStyle>,
): ArcPathSpec {
  return {
    kind: 'arcPath',
    // Die ID benennt den TEIL der Figur, nicht das Primitive: der Bogen des
    // Momentsymbols. Sie folgt deshalb nicht dem Umbenennen von `kind`.
    id: `${m.id}:arc`,
    layer: 'loads',
    center: worldPoint(m.at.x, m.at.z),
    radius,
    startAngle,
    sweepAngle,
    strokeColor: style.momentColor,
    // Wie am Kraftpfeil: ungeteilt, der Adapter zeichnet in Screen-Pixeln.
    strokeWidth: style.momentArcWidthPx,
  };
}

export function momentSpecs(
  m: Moment,
  vp: Viewport,
  style: Required<LoadStyle>,
): readonly Spec[] {
  const radius = style.momentRadiusPx / vp.scale;
  const pointerLength = style.momentPointerLengthPx / vp.scale;
  // Positives Moment (sense +1) laeuft gegen den Uhrzeigersinn, auf dem Schirm
  // also mit ABNEHMENDEM Winkel.
  const sweep = -m.sense * SWEEP;
  const sweepSign = Math.sign(sweep);
  // Der Bogen faengt an der einen Kante der Luecke an und hoert an der anderen
  // auf; welche davon der Anfang ist, entscheidet der Umlaufsinn. So bleibt die
  // Luecke unten stehen, statt mit dem Vorzeichen zu wandern.
  const start = normalizeAngle(GAP_CENTER + sweepSign * HALF_GAP);

  // Der Bogen endet an der BASIS der Spitze, nicht an der Spitze selbst — und
  // er wird um genau den Winkel gekuerzt, den die Spitze einnimmt. Sonst
  // ueberstreichen Bogen und Spitze zusammen mehr als 270 Grad, und die Luecke
  // steht schief zur Figur.
  const shortened = sweep - sweepSign * headSpan(radius, pointerLength);

  return [
    arcSpec(m, radius, start, shortened, style),
    // Die Basis liegt dort, wo der gekuerzte Bogen endet — einmal gerechnet,
    // damit zwischen Bogenende und Dreieck keine Fuge entstehen kann.
    headSpec(m, radius, start + shortened, sweepSign, pointerLength, style, vp),
    loadLabelSpec({
      id: `${m.id}:label`,
      text: momentLabelText(m.magnitude),
      // Anker auf dem Bogenkreis, senkrecht UEBER dem Angriffspunkt: derselbe
      // Abstand zum Knoten wie beim Kraftpfeil das aeussere Pfeilende, und
      // dahinter dieselbe Luecke. Oben, weil die Luecke des Bogens unten sitzt
      // — dort zeigt der Kopf hin, und dorthin gehoert kein Kasten.
      anchor: Point.make(m.at.x, m.at.z - radius),
      direction: Vector.make(0, -1),
      viewport: vp,
      style,
    }),
  ];
}
