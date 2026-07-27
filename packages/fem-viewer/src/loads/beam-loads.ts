/**
 * STABlasten -> Symbole. Wie bei den Knotenlasten steht hier nur, WAS auf einem
 * Stab liegt und wo — nicht, wie das Symbol aussieht.
 *
 * DIE GRENZE NACH UNTEN: Lage und Richtung einer Stablast werden hier NICHT
 * hergeleitet. Beides beantwortet `@baustatik/fem-load-resolve` bereits fuer den
 * Solver (`loadStation`, `loadDirection`), und zweimal hergeleitet driften Bild
 * und Rechnung genau in dem Paar auseinander, fuer das man das Bild ueberhaupt
 * anschaut.
 *
 * Nicht unterstuetzte Lastarten (konstante und trapezfoermige Streckenlasten,
 * Streckenmomente) liefern eine leere Liste statt eines Fehlers: eine vorhandene
 * Streckenlast soll das Zeichnen der uebrigen Lasten nicht verhindern.
 */

import { Line, Point, Vector } from '@baustatik/fem-geometry';
import { loadDirection, loadStation } from '@baustatik/fem-load-resolve';
import { type BeamLoad, UnknownLoadTargetError } from '@baustatik/fem-loads';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { moment, momentSpecs } from './moment';
import { pointForce, pointForceSpecs } from './point-force';
import type { LoadStyle } from './style';

/** Die Stabachse eines Ziels, oder `undefined`, wenn es sie nicht gibt. */
export type BeamAxis = (beamId: string) => Line | undefined;

/** Der Angriffspunkt auf der Stabachse, gemessen ab dem Anfangsknoten. */
function stationPoint(
  axis: Line,
  distanceFromStart: number,
  relativeDistances: boolean,
): Point {
  const station = loadStation(
    distanceFromStart,
    relativeDistances,
    Line.length(axis),
  );
  return Point.translate(axis.p1, Vector.scale(Line.frame(axis).ex, station));
}

export function beamLoadSpecs(
  load: BeamLoad,
  beamAxis: BeamAxis,
  vp: Viewport,
  style: Required<LoadStyle>,
): readonly Spec[] {
  if (load.distribution !== 'point') return [];

  const specs: Spec[] = [];

  for (const beamId of load.beamIds) {
    const axis = beamAxis(beamId);
    // `beamAxis` liefert auch dann `undefined`, wenn es den Stab GIBT, aber
    // einer seiner Knoten fehlt — das waere ein Modellfehler. Hier ist der Fall
    // nicht erreichbar: `femSpecs` bildet zuerst alle Staebe ab und wirft dort
    // `UnknownNodeReferenceError`. Bliebe die Reihenfolge nicht bestehen,
    // muesste diese Stelle die beiden Faelle trennen.
    if (axis === undefined) {
      throw new UnknownLoadTargetError(load.id, 'beam', beamId);
    }

    const at = stationPoint(
      axis,
      load.distanceFromStart,
      load.relativeDistances === true,
    );

    if (load.kind === 'force') {
      const force = pointForce(
        `load:${load.id}:${beamId}`,
        at,
        loadDirection(load.frame, load.axis, axis),
        load.p,
      );
      if (force) specs.push(...pointForceSpecs(force, vp, style));
    } else {
      // Das Einzelmoment auf dem Stab traegt weder `frame` noch `axis`: ein
      // ebenes Moment dreht immer um y, und beide Wahlmoeglichkeiten waeren
      // dieselbe Achse (siehe `fem-loads/src/types.ts`).
      const m = moment(`load:${load.id}:${beamId}`, at, load.m);
      if (m) specs.push(...momentSpecs(m, vp, style));
    }
  }

  return specs;
}
