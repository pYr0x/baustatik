/**
 * Konzentrierte KRAEFTE als Zeichen-Specs: `NodeLoad.fx/fz` und
 * `BeamForcePointLoad`. Momente und Streckenlasten bleiben vorerst unsichtbar.
 *
 * WAS HIER NICHT PASSIERT — die Grenze nach unten: Lage und Richtung einer
 * Stablast werden NICHT hier hergeleitet. Beides beantwortet
 * `@baustatik/fem-load-resolve` bereits fuer den Solver (`loadStation`,
 * `loadDirection`), und zweimal hergeleitet driften Bild und Rechnung genau in
 * dem Paar auseinander, fuer das man das Bild ueberhaupt anschaut.
 *
 * Der Pfeil ist ein SCHEMA: seine Laenge sagt nichts ueber den Betrag, sie ist
 * fuer jede Kraft dieselbe. Den Betrag traegt das Label. (Streckenlasten werden
 * sich das nicht leisten koennen — dort muss die Hoehe skalieren, sonst sind
 * 5 kN/m und 50 kN/m nicht unterscheidbar.)
 */

import type { Beam, Node } from '@baustatik/fem';
import { Line, Point, Vector } from '@baustatik/fem-geometry';
import { loadDirection, loadStation } from '@baustatik/fem-load-resolve';
import {
  type BeamForcePointLoad,
  type FEMLoad,
  modelGeometry,
  type NodeLoad,
  UnknownLoadTargetError,
} from '@baustatik/fem-loads';
import type { ArrowSpec, LabelSpec, Spec } from '@baustatik/render-core';
import { roundSmart } from '@baustatik/round';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

/** Schematische Pfeillaenge. Fuer JEDE Kraft dieselbe, siehe Dateikopf. */
export const DEFAULT_POINT_FORCE_ARROW_LENGTH_PX = 48;

/**
 * Die Lastscheibe des Viewer-Stils. Eigenes Interface, damit die Vorgaben hier
 * bei der Abbildung stehen koennen, die sie braucht, ohne dass `loads.ts` und
 * `scene.ts` sich gegenseitig importieren.
 */
export interface LoadStyle {
  readonly pointForceColor?: string;
  readonly pointForceArrowLengthPx?: number;
  readonly pointForceArrowWidthPx?: number;
  readonly pointForcePointerLengthPx?: number;
  readonly pointForcePointerWidthPx?: number;
  readonly loadLabelGapPx?: number;
  readonly loadLabelFontSizePx?: number;
  readonly loadLabelFontFamily?: string;
  readonly loadLabelPaddingPx?: number;
  readonly loadLabelCornerRadiusPx?: number;
  readonly loadLabelTextColor?: string;
  readonly loadLabelBackgroundColor?: string;
  readonly loadLabelBorderColor?: string;
  readonly loadLabelBorderWidthPx?: number;
}

export const DEFAULT_LOAD_STYLE: Required<LoadStyle> = {
  pointForceColor: '#1d4ed8',
  pointForceArrowLengthPx: DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
  pointForceArrowWidthPx: 2,
  pointForcePointerLengthPx: 10,
  pointForcePointerWidthPx: 8,
  loadLabelGapPx: 6,
  loadLabelFontSizePx: 12,
  loadLabelFontFamily: 'sans-serif',
  loadLabelPaddingPx: 3,
  loadLabelCornerRadiusPx: 3,
  loadLabelTextColor: '#1d4ed8',
  loadLabelBackgroundColor: '#dbeafe',
  loadLabelBorderColor: '#1d4ed8',
  loadLabelBorderWidthPx: 1,
};

interface LoadSpecOptions {
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly loads: readonly FEMLoad[];
  readonly viewport: Viewport;
  readonly style: Required<LoadStyle>;
}

/** Eine gezeichnete Kraft: wo sie angreift, wohin sie zeigt, wie gross sie ist. */
interface PointForce {
  /** Global eindeutig, aus Last-ID, Ziel-ID und ggf. Komponente. */
  readonly id: string;
  /** Angriffspunkt — hier liegt die PFEILSPITZE. */
  readonly at: Point;
  /** Einheitsvektor der Wirkrichtung, global. */
  readonly direction: Vector;
  /** Betrag in kN, bereits ohne Vorzeichen. */
  readonly magnitude: number;
}

/**
 * Der Labeltext.
 *
 * Blanke `String`-Umwandlung ohne Locale und ohne feste Nachkommastellen: die
 * Ganzzahl faellt unveraendert durch (`10 kN`), und `roundSmart` haelt die
 * Stellenzahl klein (`0.85 kN`). Ohne diese Festlegung haengt der Text an der
 * Fließkommadarstellung des Eingabewerts.
 */
function forceLabelText(magnitude: number): string {
  return `${roundSmart(magnitude)} kN`;
}

/**
 * Das AEUSSERE Pfeilende: Angriffspunkt minus Wirkrichtung mal Pfeillaenge.
 *
 * Pfeil und Label haengen beide daran — der eine faengt dort an, das andere
 * liegt dahinter. Zweimal gerechnet koennten sie auseinanderrutschen.
 *
 * GETEILT durch scale: der Pfeil ist ein Symbol und soll beim Zoomen gleich
 * gross bleiben. Ausgenommen strokeWidth — das zeichnet der Adapter ohnehin in
 * Screen-Pixeln (strokeScaleEnabled: false).
 */
function arrowTail(
  force: PointForce,
  vp: Viewport,
  style: Required<LoadStyle>,
): Point {
  const length = style.pointForceArrowLengthPx / vp.scale;
  return Point.translate(force.at, Vector.scale(force.direction, -length));
}

function arrowSpec(
  force: PointForce,
  tail: Point,
  vp: Viewport,
  style: Required<LoadStyle>,
): ArrowSpec {
  return {
    kind: 'arrow',
    id: `${force.id}:arrow`,
    layer: 'loads',
    tail: worldPoint(tail.x, tail.z),
    // Die Spitze liegt EXAKT am Angriffspunkt.
    tip: worldPoint(force.at.x, force.at.z),
    pointerLength: style.pointForcePointerLengthPx / vp.scale,
    pointerWidth: style.pointForcePointerWidthPx / vp.scale,
    strokeColor: style.pointForceColor,
    strokeWidth: style.pointForceArrowWidthPx,
    fillColor: style.pointForceColor,
  };
}

/** Vorzeichenwechsel ohne `-0`: fachlich dasselbe, in Specs und Tests aber Laerm. */
function opposite(value: number): number {
  return value === 0 ? 0 : -value;
}

function labelSpec(
  force: PointForce,
  tail: Point,
  vp: Viewport,
  style: Required<LoadStyle>,
): LabelSpec {
  return {
    kind: 'label',
    id: `${force.id}:label`,
    layer: 'loads',
    text: forceLabelText(force.magnitude),
    // Anker ist das AEUSSERE Pfeilende, die Richtung zeigt vom Pfeil weg.
    anchor: worldPoint(tail.x, tail.z),
    direction: worldPoint(
      opposite(force.direction.dx),
      opposite(force.direction.dz),
    ),
    gap: style.loadLabelGapPx / vp.scale,
    fontSize: style.loadLabelFontSizePx / vp.scale,
    fontFamily: style.loadLabelFontFamily,
    textColor: style.loadLabelTextColor,
    padding: style.loadLabelPaddingPx / vp.scale,
    backgroundColor: style.loadLabelBackgroundColor,
    borderColor: style.loadLabelBorderColor,
    // Wie strokeWidth am Pfeil: Screen-Pixel, deshalb ungeteilt.
    borderWidth: style.loadLabelBorderWidthPx,
    cornerRadius: style.loadLabelCornerRadiusPx / vp.scale,
  };
}

/**
 * Eine gerichtete Kraft aus Achse und vorzeichenbehaftetem Wert.
 *
 * `undefined` und 0 fallen gemeinsam heraus — fuer die Komponenten einer
 * Knotenlast wie fuer `p` einer Stab-Einzellast: ein Wert ohne Betrag hat keine
 * Richtung, und ein Pfeil der Laenge 0 waere kein Bild, sondern ein Punkt.
 * `validateLoads` beanstandet solche Lasten bereits; das Zeichnen soll daran
 * aber nicht scheitern.
 */
function pointForce(
  id: string,
  at: Point,
  axis: Vector,
  value: number | undefined,
): PointForce | undefined {
  if (value === undefined || value === 0) return undefined;
  return {
    id,
    at,
    direction: Vector.scale(axis, Math.sign(value)),
    magnitude: Math.abs(value),
  };
}

function nodeForces(
  load: NodeLoad,
  nodeById: ReadonlyMap<string, Node>,
): PointForce[] {
  const forces: PointForce[] = [];

  for (const nodeId of load.nodeIds) {
    const node = nodeById.get(nodeId);
    // Ein Lastziel, das es nicht gibt, ist ein LASTfehler — nicht der
    // Modellfehler `UnknownNodeReferenceError`, den ein ins Leere zeigender
    // Stab ausloest. Dieselbe Arbeitsteilung wie in `fem-loads`.
    if (node === undefined) {
      throw new UnknownLoadTargetError(load.id, 'node', nodeId);
    }

    // Je Komponente ein eigener Pfeil: so gibt der Anwender es ein, und so
    // bleibt die Darstellung eine Richtung statt einer Resultierenden.
    const fx = pointForce(
      `load:${load.id}:${nodeId}:fx`,
      node.position,
      Vector.make(1, 0),
      load.fx,
    );
    if (fx) forces.push(fx);

    const fz = pointForce(
      `load:${load.id}:${nodeId}:fz`,
      node.position,
      Vector.make(0, 1),
      load.fz,
    );
    if (fz) forces.push(fz);
    // `my` bleibt unberuecksichtigt — Momentsymbole kommen spaeter.
  }

  return forces;
}

function beamPointForces(
  load: BeamForcePointLoad,
  beamAxis: (beamId: string) => Line | undefined,
): PointForce[] {
  const forces: PointForce[] = [];

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

    const station = loadStation(
      load.distanceFromStart,
      load.relativeDistances === true,
      Line.length(axis),
    );
    const at = Point.translate(
      axis.p1,
      Vector.scale(Line.frame(axis).ex, station),
    );

    const force = pointForce(
      `load:${load.id}:${beamId}`,
      at,
      loadDirection(load.frame, load.axis, axis),
      load.p,
    );
    if (force) forces.push(force);
  }

  return forces;
}

/**
 * Reine Abbildung Lasten -> Specs.
 *
 * Nicht unterstuetzte Lastarten (Momente, konstante und trapezfoermige
 * Streckenlasten) werden still uebergangen statt beanstandet: eine vorhandene
 * Streckenlast soll das Zeichnen der uebrigen Lasten nicht verhindern.
 */
export function loadSpecs(options: LoadSpecOptions): readonly Spec[] {
  const { nodes, beams, loads, viewport: vp, style } = options;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  // Die Stabachse kommt aus `fem-loads`, samt der fachlichen Reihenfolge
  // p1 = Anfangs-, p2 = Endknoten — daran haengt `distanceFromStart`.
  const { beamAxis } = modelGeometry(nodes, beams);

  const forces: PointForce[] = [];
  for (const load of loads) {
    if (load.target === 'node') {
      forces.push(...nodeForces(load, nodeById));
    } else if (load.kind === 'force' && load.distribution === 'point') {
      forces.push(...beamPointForces(load, beamAxis));
    }
  }

  return forces.flatMap((force) => {
    const tail = arrowTail(force, vp, style);
    return [
      arrowSpec(force, tail, vp, style),
      labelSpec(force, tail, vp, style),
    ];
  });
}
