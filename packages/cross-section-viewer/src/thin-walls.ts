/**
 * Die WANDMITTELLINIEN — die EINGABE des Editors, gerade als `line`, gebogen
 * als `arcPath`.
 *
 * Der Unterschied zu `outlines.ts` ist fachlich und bleibt sichtbar:
 * Mittellinien sind das, was gespeichert wird; der Umriss ist ein mitgefuehrtes
 * ABGELEITETES Ergebnis (ADR 0030). Der Viewer leitet ihn kein zweites Mal ab.
 *
 * EIN STRICH DER DICKE `t` AUF EINEM BOGEN **IST** DIE WAND. `arcPath` hat
 * keine Fuellung (`render-core/src/specs.ts` trennt ihn deshalb vom
 * Ringsegment), und das ist fuer eine Mittellinie genau richtig.
 *
 * DIE VORZEICHEN TRAGEN OHNE UMRECHNUNG DURCH, und das ist die eine Stelle, an
 * der drei Drehsinne aufeinandertreffen: `bulge` -> `Arc.sweep` (positiv
 * `+y → +z`, ADR 0031) -> `ArcPathSpec.sweepAngle` (positiv `+u → +v`). Das
 * Mapping dazwischen ist `worldPoint(y, z)`, also die Identitaet. Gepinnt in
 * `tests/node/thin-walls.test.ts` — argumentiert reichte hier nicht.
 */

import type { SectionGeometry, Wall } from '@baustatik/cross-section';
import type { Spec } from '@baustatik/render-core';
import { Bulge, Point, type PointType } from '@baustatik/section-geometry';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { CrossSectionStyle } from './style';

export const THIN_WALL_LAYER = 'thin-walls';

/** Die ID einer Wand in der Szene — mit Namensraum, damit nichts kollidiert. */
function wallId(id: string): string {
  return `cross-section:thin-wall:${id}`;
}

export function thinWallSpecs(
  geometry: SectionGeometry,
  discretisationTolerance: number,
  vp: Viewport,
  style: Required<CrossSectionStyle>,
): readonly Spec[] {
  // Ein freier Umriss hat keine Mittellinien; die verbotene Zelle „Umriss, aber
  // duennwandig" ist im Typ bereits ausgeschlossen.
  if (geometry.kind === 'outline') return [];

  const byId = new Map(geometry.nodes.map((node) => [node.id, node]));
  const specs: Spec[] = [];
  for (const wall of geometry.walls) {
    const spec = wallSpec(wall, byId, discretisationTolerance, vp, style);
    if (spec !== undefined) specs.push(spec);
  }
  return specs;
}

/**
 * Eine Wand als Mittellinie.
 *
 * `undefined` heisst „hier nicht": ein haengender Verweis ist ein Befund des
 * Gates (`UnknownSectionNodeError`), kein Wurf im Zeichenweg. Wer ein kaputtes
 * Modell zeichnet, soll den Rest davon sehen — Umriss, Netz, Symbole und jede
 * andere Wand bleiben stehen.
 */
function wallSpec(
  wall: Wall,
  byId: ReadonlyMap<string, { y: number; z: number }>,
  discretisationTolerance: number,
  vp: Viewport,
  style: Required<CrossSectionStyle>,
): Spec | undefined {
  const start = byId.get(wall.startNodeId);
  const end = byId.get(wall.endNodeId);
  if (start === undefined || end === undefined) return undefined;

  // `t` ist PHYSIK (die Wandstaerke), nicht die Strichbreite am Schirm —
  // deshalb skaliert sie mit dem Viewport und die Umrisslinie nicht.
  const strokeWidth = wall.t * vp.scale;
  const bulge = wall.bulge ?? 0;
  const p1 = Point.make(start.y, start.z);
  const p2 = Point.make(end.y, end.z);

  if (drawsAsArc(p1, p2, bulge, discretisationTolerance)) {
    const arc = Bulge.toArc(p1, p2, bulge, discretisationTolerance);
    return {
      kind: 'arcPath',
      id: wallId(wall.id),
      layer: THIN_WALL_LAYER,
      center: worldPoint(arc.center.y, arc.center.z),
      radius: arc.radius,
      startAngle: arc.startAngle,
      sweepAngle: arc.sweep,
      strokeWidth,
      strokeColor: style.thinWallColor,
    };
  }

  // `from`/`to` sind hier die Enden der ZEICHENSTRECKE (`Spec`), nicht die
  // Knotenverweise der Wand — die heissen `startNodeId`/`endNodeId`.
  return {
    kind: 'line',
    id: wallId(wall.id),
    layer: THIN_WALL_LAYER,
    from: worldPoint(start.y, start.z),
    to: worldPoint(end.y, end.z),
    strokeWidth,
    strokeColor: style.thinWallColor,
  };
}

/**
 * Ob diese Kante als Bogen gezeichnet wird — und DER ZEICHENWEG WIRFT NICHT.
 *
 * Das ist keine Vorsicht, sondern die Regel dieses Moduls: ein kaputtes Modell
 * soll man SEHEN. Ein Wurf hier loeschte Grid, Umriss und jede andere Wand
 * gleich mit, und weil `draw()` auch aus `onViewIntent` laeuft, braeche er
 * mitten im Pan ab.
 *
 * DREI FAELLE FALLEN DESHALB AUF DIE SEHNE ZURUECK:
 *
 *   `bulge === 0`           — die gerade Wand, der Regelfall.
 *   `bulge` nicht endlich   — `Bulge.toArc` wuerfe `InvalidArcError`.
 *                             `NaN` kaeme sogar durch beide Vorpruefungen:
 *                             `NaN !== 0` ist wahr und `NaN <= tolerance`
 *                             falsch, die Kante gaelte also als Bogen.
 *   `|Δ| >= 2π`             — `ArcPathSpec` verlangt `|sweepAngle| < 2π`
 *                             (`render-core/src/specs.ts`), und ab
 *                             `|bulge| ~ 1.6e16` rundet `4·atan(bulge)` genau
 *                             auf `2π`. Der Adapter wiese die Spec zurueck.
 *
 * DAS GATE PRUEFT `bulge` HEUTE NICHT — G1 bis G6 sehen Umriss, doppelte Ids,
 * haengende Verweise, `t > 0`, Nulllaenge und Knick, aber nie die Woelbung
 * selbst; die Knickwarnung rechnet bei `NaN` still `notch = NaN` und schweigt.
 * Beides kann also aus einem Store kommen, ohne dass irgendwer es gemeldet
 * haette. Solange das so ist, faengt es der Zeichenweg ab.
 */
function drawsAsArc(
  p1: PointType,
  p2: PointType,
  bulge: number,
  discretisationTolerance: number,
): boolean {
  if (bulge === 0 || !Number.isFinite(bulge)) return false;
  if (Math.abs(Bulge.sweep(bulge)) >= 2 * Math.PI) return false;
  // DIESELBE SCHRANKE WIE ANDERSWO: was `Bulge` als Gerade liest, zeichnet der
  // Viewer als Gerade. Ein eigenes Epsilon hier gaebe eine Kante, die gerade
  // gerechnet und krumm gezeichnet wird.
  return !Bulge.isStraight(
    Point.distance(p1, p2),
    bulge,
    discretisationTolerance,
  );
}
