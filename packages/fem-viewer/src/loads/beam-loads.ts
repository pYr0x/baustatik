/**
 * STABlasten -> Symbole. Wie bei den Knotenlasten steht hier nur, WAS auf einem
 * Stab liegt und wo — nicht, wie das Symbol aussieht.
 *
 * DIE GRENZE NACH UNTEN: Lage und Richtung einer Stablast werden hier NICHT
 * hergeleitet. Beides beantwortet `@baustatik/fem-load-resolve` bereits fuer den
 * Solver (`loadStation`, `loadDirection`), und zweimal hergeleitet driften Bild
 * und Rechnung genau in dem Paar auseinander, fuer das man das Bild ueberhaupt
 * anschaut. Die Grundlinie der Streckenlast — ihr Schatten — entsteht aus genau
 * diesen beiden Antworten und wird deshalb im Symbol KOMPONIERT, nicht dort ein
 * zweites Mal hergeleitet (ADR 0028).
 *
 * Streckenmomente liefern eine leere Liste statt eines Fehlers: eine nicht
 * darstellbare Last soll das Zeichnen der uebrigen nicht verhindern.
 */

import { Line, type LineFrame, Point, Vector } from '@baustatik/fem-geometry';
import { loadDirection, loadStation } from '@baustatik/fem-load-resolve';
import {
  type BeamForceLoad,
  type BeamLoad,
  referenceFactor,
  UnknownLoadTargetError,
} from '@baustatik/fem-loads';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import {
  type DistributedStyle,
  distributedForce,
  distributedForceSpecs,
  markerSpec,
  type MarkerStyle,
  moment,
  momentSpecs,
  pointForce,
  pointForceSpecs,
  type SymbolStyle,
} from '../symbols';

/** Die Stabachse eines Ziels, oder `undefined`, wenn es sie nicht gibt. */
export type BeamAxis = (beamId: string) => Line | undefined;

/** Ein Punkt auf der Stabachse, gemessen ab dem Anfangsknoten. */
function stationPoint(
  axis: Line,
  frame: LineFrame,
  distanceFromStart: number,
  relativeDistances: boolean,
): Point {
  const station = loadStation(
    distanceFromStart,
    relativeDistances,
    Line.length(axis),
  );
  return Point.translate(axis.p1, Vector.scale(frame.ex, station));
}

/** Die beiden Werte einer Streckenlast — die konstante hat nur einen. */
function values(
  load: Exclude<BeamForceLoad, { distribution: 'point' }>,
): readonly [number, number] {
  return load.distribution === 'constant'
    ? [load.q, load.q]
    : [load.q1, load.q2];
}

/**
 * Der belastete Abschnitt auf der Stabachse.
 *
 * Die Gleichstreckenlast hat keine Abstaende — sie liegt laut
 * `fem-loads/src/types.ts` immer auf dem GANZEN Stab; ein konstanter
 * Teilabschnitt wird als Trapez mit `q1 === q2` eingegeben.
 */
function loadedSegment(
  load: Exclude<BeamForceLoad, { distribution: 'point' }>,
  axis: Line,
  frame: LineFrame,
): Line {
  if (load.distribution === 'constant' || load.fullLength === true) {
    return axis;
  }
  const relative = load.relativeDistances === true;
  return Line.make(
    stationPoint(axis, frame, load.from, relative),
    stationPoint(axis, frame, load.to, relative),
  );
}

export function beamLoadSpecs(
  load: BeamLoad,
  beamAxis: BeamAxis,
  vp: Viewport,
  style: SymbolStyle & MarkerStyle & DistributedStyle,
): readonly Spec[] {
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
    const frame = Line.frame(axis);
    const id = `load:${load.id}:${beamId}`;

    if (load.kind === 'moment') {
      if (load.distribution !== 'point') continue;
      // Das Einzelmoment auf dem Stab traegt weder `frame` noch `axis`: ein
      // ebenes Moment dreht immer um y, und beide Wahlmoeglichkeiten waeren
      // dieselbe Achse (siehe `fem-loads/src/types.ts`).
      const m = moment(
        id,
        'loads',
        stationPoint(
          axis,
          frame,
          load.distanceFromStart,
          load.relativeDistances === true,
        ),
        load.m,
      );
      if (m) specs.push(...momentSpecs(m, vp, style));
      continue;
    }

    const direction = loadDirection(load.frame, load.axis, axis);

    if (load.distribution === 'point') {
      // Nur die punktuelle Last hat einen Angriffspunkt. `distanceFromStart`
      // steht deshalb IN diesem Zweig: an einer Streckenlast gibt es das Feld
      // nicht, und `loadStation` machte daraus stillschweigend `NaN`.
      const at = stationPoint(
        axis,
        frame,
        load.distanceFromStart,
        load.relativeDistances === true,
      );
      const force = pointForce(id, 'loads', at, direction, load.p);
      // DIE MARKE GIBT ES NUR HIER, und deshalb entscheidet sie diese Datei und
      // nicht `point-force.ts`: der Pfeil steht seit dem Gap nicht mehr im
      // Angriffspunkt, und auf einem Stab ist die Stelle sonst nichts, woran man
      // sie ablesen koennte. An einem Knoten sagt der Knoten sie bereits — dort
      // laege die Marke unter seinem groesseren roten Kreis (`node-loads.ts`,
      // `results/reactions.ts` setzen deshalb keine).
      if (force) {
        specs.push(
          ...pointForceSpecs(force, vp, style),
          markerSpec(`${id}:marker`, 'loads', at, vp, style),
        );
      }
      continue;
    }

    // DIE EINE STELLE, AN DER DIE BEZUGSLAENGE DOCH INS BILD SPRICHT: misst sie
    // an DIESEM Stab 0, dann traegt die Last dort nichts ein — `verticalProjection`
    // am waagrechten Stab, `horizontalProjection` am senkrechten. Gezeichnet wird
    // dann nichts.
    //
    // Das widerspricht ADR 0028 nicht, es ist sein Randfall: die Figur sagt, WIE
    // die Last wirkt, und hier wirkt keine. Eine Flaeche voller Pfeile ueber
    // einem Stab, der nichts abbekommt, behauptet das Gegenteil — und zwar umso
    // lauter, als die Ordinate JE LAST normiert ist: der Nachbarstab traegt, also
    // steht die Figur hier in voller Hoehe.
    //
    // EXAKT 0 UND KEINE SCHRANKE: darunter gibt es nichts, es ist die Grenze des
    // Wertebereichs. Ein fast waagrechter Stab traegt fast nichts und wird
    // weiterhin gezeichnet — der Uebergang ist stetig, und wo eine Schranke saesse,
    // ist eine Frage der Lastpruefung und nicht des Zeichnens (siehe
    // `NearlyDegenerateReferenceLengthWarning`).
    if (referenceFactor(load.referenceLength, axis) === 0) continue;

    const [q1, q2] = values(load);
    const distributed = distributedForce({
      id,
      layer: 'loads',
      segment: loadedSegment(load, axis, frame),
      direction,
      beamFrame: frame,
      // Die Bezugslaenge entscheidet allein, OB projiziert wird. WOHIN, sagt die
      // Lastrichtung — deshalb sehen die beiden Projektionen gleich aus
      // (ADR 0028).
      projected: load.referenceLength !== 'trueLength',
      q1,
      q2,
    });
    if (distributed)
      specs.push(...distributedForceSpecs(distributed, vp, style));
  }

  return specs;
}
