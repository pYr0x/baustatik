import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { FEMLoad } from '@baustatik/fem-loads';
import type {
  CircleSpec,
  GroupSpec,
  LineSpec,
  Spec,
} from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import { UnknownNodeReferenceError } from './errors';
import { DEFAULT_LOAD_STYLE, type LoadStyle, loadSpecs } from './loads';
import { supportSpec } from './supports';
import { Vector, Point } from '@baustatik/fem-geometry';
import { BeamEndReleases } from '@baustatik/fem';

// Der FEM-Viewer zeichnet ein SCHEMA, kein massstaebliches Abbild: Knoten und
// Staebe sind Symbole ohne physische Ausdehnung. Ihre Groessen sind deshalb
// Screen-Pixel und zoomen NICHT mit. (Gegenfall ist der Querschnitt, wo die
// Blechdicke eine echte Weltgroesse ist.)
export interface FEMStyle extends LoadStyle {
  readonly beamColor?: string;
  readonly beamWidthPx?: number;
  readonly nodeColor?: string;
  readonly nodeRadiusPx?: number;
  readonly nodeSupportColor?: string;
  readonly hingeRadiusPx?: number;
  readonly hingeInnerColor?: string;
  readonly hingeStrokeColor?: string;
}

const DEFAULT_STYLE: Required<FEMStyle> = {
  ...DEFAULT_LOAD_STYLE,
  beamColor: '#000',
  beamWidthPx: 2,
  nodeColor: '#f00',
  nodeRadiusPx: 4,
  nodeSupportColor: '#0f0',
  hingeRadiusPx: 3,
  hingeInnerColor: '#fff',
  hingeStrokeColor: '#000'
};

export interface FEMSceneOptions {
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly supports: readonly NodeSupport[];
  readonly loads: readonly FEMLoad[];
  readonly viewport: Viewport;
  readonly style?: FEMStyle;
}
function beamSpecs(
  beam: Beam,
  start: Node,
  end: Node,
  vp: Viewport,
  style: Required<FEMStyle>,
): readonly Spec[] {
  const specs: Spec[] = [beamSpec(beam, start, end, style)];

  const v = Vector.fromPoints(start.position, end.position);

  const hasRelease = (release?: BeamEndReleases) =>
    release?.u === true ||
    release?.w === true ||
    release?.theta === true;

  if (hasRelease(beam.releases?.start)) {
    specs.push(hingeSpec(beam, start, v, vp, style));
  }

  if (hasRelease(beam.releases?.end)) {
    specs.push(hingeSpec(beam, end, Vector.negate(v), vp, style));
  }

  return specs;
}
function beamSpec(
  beam: Beam,
  start: Node,
  end: Node,
  style: Required<FEMStyle>,
): LineSpec {
  return {
    kind: 'line',
    id: `beam:${beam.id}`,
    layer: 'beams',
    // EINZIGE Stelle des x/z -> u/v Mappings. Kein Vorzeichenwechsel: in
    // fem-geometry zeigt z nach unten (Baustatik-Konvention), und v zeigt auf
    // dem Schirm ebenfalls nach unten.
    from: worldPoint(start.position.x, start.position.z),
    to: worldPoint(end.position.x, end.position.z),
    // Konstant, OHNE vp.scale: der Adapter setzt strokeScaleEnabled:false,
    // der Wert ist damit bereits screen-konstant.
    strokeWidth: style.beamWidthPx,
    strokeColor: style.beamColor,
  };
}

function nodeSpec(
  node: Node,
  vp: Viewport,
  style: Required<FEMStyle>,
): CircleSpec {
  return {
    kind: 'circle',
    id: `node:${node.id}`,
    layer: 'nodes',
    center: worldPoint(node.position.x, node.position.z),
    // GETEILT, im Gegensatz zu strokeWidth: Konva.Circle.radius liegt als
    // einziges Feld in lokalen Koordinaten und skaliert mit der Stage. Das ist
    // der einzige zoomabhaengige Wert im ganzen Viewer.
    radius: style.nodeRadiusPx / vp.scale,
    fillColor: style.nodeColor,
  };
}

function nodeSupportSpec(
  support: NodeSupport,
  node: Node,
  vp: Viewport,
  style: Required<FEMStyle>,
): GroupSpec {
  return supportSpec({
    support,
    position: node.position,
    scale: vp.scale,
    color: style.nodeSupportColor,
  });
}

function hingeSpec(beam: Beam, atNode: Node, v: Vector, vp: Viewport, style: Required<FEMStyle>,): CircleSpec {
  const hingePosition = Point.translate(atNode.position, Vector.scale(Vector.normalize(v), (style.nodeRadiusPx * 2 / vp.scale)));
  return {
    kind: 'circle',
    id: `beam:${beam.id}:hinge:${atNode.id}`,
    layer: 'hinges',
    center: worldPoint(hingePosition.x, hingePosition.z),
    radius: style.hingeRadiusPx / vp.scale,
    fillColor: style.hingeInnerColor,
    strokeWidth: 1,
    strokeColor: style.hingeStrokeColor
  };
}

// Reine Abbildung Modell -> Zeichen-Specs. Kein Driver, kein Konva, kein
// Zustand — deshalb in Node testbar (siehe tests/scene.test.ts).
//
// EIN Optionsobjekt statt Positionsparametern: sonst stuenden drei
// `readonly X[]` in Folge nebeneinander, und ein vertauschtes Paar faellt an
// keiner Typgrenze auf.
export function femSpecs(options: FEMSceneOptions): readonly Spec[] {
  const { nodes, beams, supports, loads, viewport: vp, style } = options;
  const resolved = { ...DEFAULT_STYLE, ...style };
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const specs: Spec[] = [];

  // Staebe vor Knoten, damit das Array die Bandreihenfolge widerspiegelt und
  // lesbar bleibt. Die GARANTIE liefern aber die Baender, nicht diese
  // Reihenfolge — der Renderer haengt neue Shapes sonst ungefragt obenauf.
  for (const beam of beams) {
    const start = byId.get(beam.startNodeId);
    if (!start) throw new UnknownNodeReferenceError(beam.id, beam.startNodeId);
    const end = byId.get(beam.endNodeId);
    if (!end) throw new UnknownNodeReferenceError(beam.id, beam.endNodeId);

    specs.push(...beamSpecs(beam, start, end, vp, resolved));
  }

  for (const node of nodes) {
    specs.push(nodeSpec(node, vp, resolved));
  }

  for (const support of supports) {
    const node = byId.get(support.nodeId);
    if (!node) {
      throw new UnknownNodeReferenceError(
        support.id,
        support.nodeId,
        'NodeSupport',
      );
    }
    specs.push(nodeSupportSpec(support, node, vp, resolved));
  }

  specs.push(
    ...loadSpecs({ nodes, beams, loads, viewport: vp, style: resolved }),
  );

  return specs;
}
