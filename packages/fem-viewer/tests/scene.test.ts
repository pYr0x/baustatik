import { describe, expect, it } from 'vitest';

import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { GroupSpec } from '@baustatik/render-core';
import { gridSpecs } from '@baustatik/grid-2d';
import { validateSpecs } from '@baustatik/render-core';
import { pan, screenPoint, size, viewport } from '@baustatik/viewport-2d';

import {
  UnknownNodeReferenceError,
  UnsupportedSupportError,
} from '../src/errors';
import { FEM_LAYERS } from '../src/layers';
import { type FEMSceneOptions, type FEMStyle, femSpecs } from '../src/scene';

const vp1 = viewport(screenPoint(0, 0), 1);

// femSpecs nimmt ein Optionsobjekt; die Tests interessieren sich meist nur fuer
// Knoten und Staebe, der Rest bleibt leer.
function scene(
  nodes: readonly Node[],
  beams: readonly Beam[],
  rest: Partial<Omit<FEMSceneOptions, 'nodes' | 'beams'>> = {},
): FEMSceneOptions {
  return {
    nodes,
    beams,
    supports: [],
    loads: [],
    viewport: vp1,
    ...rest,
  };
}

const nodeA: Node = { id: 'a', position: { x: 0, z: 0 } };
const nodeB: Node = { id: 'b', position: { x: 100, z: 0 } };
const nodeC: Node = { id: 'c', position: { x: 100, z: 100 } };

const beamAB: Beam = {
  id: 'ab',
  startNodeId: 'a',
  endNodeId: 'b',
  crossSectionId: 'default',
  materialId: 'default',
};

const supportA: NodeSupport = {
  id: 'support-a',
  nodeId: 'a',
  ux: 'fixed',
  uz: 'fixed',
  phiY: 'free',
};

describe('femSpecs: Abbildung Modell -> Specs', () => {
  it('maps a beam between two nodes to a line with resolved endpoints', () => {
    const specs = femSpecs(scene([nodeA, nodeB], [beamAB]));
    const beam = specs.find((s) => s.id === 'beam:ab');

    expect(beam).toBeDefined();
    expect(beam!.kind).toBe('line');
    expect(beam).toMatchObject({
      from: { u: 0, v: 0 },
      to: { u: 100, v: 0 },
    });
  });

  it('maps z downwards onto v without flipping the sign', () => {
    // In fem-geometry zeigt z nach unten, auf dem Schirm zeigt v nach unten.
    // Ein Knoten bei z=100 gehoert also UNTER den Ursprung, nicht darueber.
    const specs = femSpecs(scene([nodeC], []));
    const node = specs.find((s) => s.id === 'node:c');

    expect(node).toMatchObject({ center: { u: 100, v: 100 } });
  });

  it('emits one circle per node and one line per beam', () => {
    const specs = femSpecs(scene([nodeA, nodeB, nodeC], [beamAB]));

    expect(specs.filter((s) => s.kind === 'circle')).toHaveLength(3);
    expect(specs.filter((s) => s.kind === 'line')).toHaveLength(1);
  });

  it('namespaces ids so nodes and beams cannot collide', () => {
    // Ein Knoten und ein Stab duerfen dieselbe Roh-ID tragen; validateSpecs
    // verlangt aber Eindeutigkeit ueber alle Baender hinweg.
    const sameId: Node = { id: 'ab', position: { x: 0, z: 0 } };
    const specs = femSpecs(scene([nodeA, nodeB, sameId], [beamAB]));

    expect(specs.map((s) => s.id)).toContain('beam:ab');
    expect(specs.map((s) => s.id)).toContain('node:ab');
    expect(() => validateSpecs(specs)).not.toThrow();
  });

  it('produces specs that pass render-core validation', () => {
    const specs = femSpecs(scene([nodeA, nodeB, nodeC], [beamAB]));

    expect(() => validateSpecs(specs)).not.toThrow();
  });
});

describe('femSpecs: Baender', () => {
  it('assigns beams and nodes to their own paint bands', () => {
    const specs = femSpecs(scene([nodeA, nodeB], [beamAB]));

    expect(specs.filter((s) => s.kind === 'line').every((s) => s.layer === 'beams'))
      .toBe(true);
    expect(specs.filter((s) => s.kind === 'circle').every((s) => s.layer === 'nodes'))
      .toBe(true);
  });
});

describe('Szene und Baender passen zusammen', () => {
  it('emits only bands that FEM_LAYERS declares, grid included', () => {
    // Genau der Fall, den UnknownLayerError im Adapter abfaengt: emittiert
    // irgendeine Quelle ein Band, das der Driver nicht kennt, bricht der erste
    // Frame ab. gridSpecs stampft 'grid' per Vorgabe — das muss im Tupel stehen.
    const specs = [
      ...gridSpecs(vp1, size(200, 200), { spacing: 10 }),
      ...femSpecs(
        scene([nodeA, nodeB, nodeC], [beamAB], {
          supports: [supportA],
          loads: [{ id: 'nl', target: 'node', nodeIds: ['b'], fz: 10 }],
        }),
      ),
    ];

    expect(specs.length).toBeGreaterThan(3);
    for (const spec of specs) {
      expect(FEM_LAYERS).toContain(spec.layer);
    }
    // Und die ganze Szene bleibt ueber Baender hinweg ID-eindeutig.
    expect(() => validateSpecs(specs)).not.toThrow();
  });
});

describe('femSpecs: Schema statt Abbild', () => {
  it('halves the node radius when the scale doubles', () => {
    // Konva.Circle.radius liegt in lokalen Koordinaten und skaliert mit der
    // Stage — geteilt durch scale bleibt der Punkt am Schirm gleich gross.
    const at1 = femSpecs(scene([nodeA], [], { viewport: viewport(screenPoint(0, 0), 1) }));
    const at2 = femSpecs(scene([nodeA], [], { viewport: viewport(screenPoint(0, 0), 2) }));

    expect(at1[0]).toMatchObject({ radius: 4 });
    expect(at2[0]).toMatchObject({ radius: 2 });
  });

  it('keeps the beam stroke width constant across zoom', () => {
    // strokeScaleEnabled:false im Adapter — der Wert IST bereits Screen-px und
    // darf deshalb NICHT mit vp.scale verrechnet werden.
    const at1 = femSpecs(scene([nodeA, nodeB], [beamAB], { viewport: viewport(screenPoint(0, 0), 1) }));
    const at8 = femSpecs(scene([nodeA, nodeB], [beamAB], { viewport: viewport(screenPoint(0, 0), 8) }));

    expect(at1.find((s) => s.id === 'beam:ab')).toMatchObject({ strokeWidth: 2 });
    expect(at8.find((s) => s.id === 'beam:ab')).toMatchObject({ strokeWidth: 2 });
  });

  it('keeps ids stable across pan and zoom so the renderer patches', () => {
    const before = femSpecs(scene([nodeA, nodeB], [beamAB]));
    const panned = femSpecs(scene([nodeA, nodeB], [beamAB], { viewport: pan(vp1, 3, 7) }));
    const zoomed = femSpecs(scene([nodeA, nodeB], [beamAB], { viewport: viewport(screenPoint(0, 0), 4) }));

    expect(panned.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(zoomed.map((s) => s.id)).toEqual(before.map((s) => s.id));
  });

  it('anchors a support group at its node and keeps its relative gap on zoom', () => {
    const at1 = femSpecs(
      scene([nodeA], [], {
        supports: [supportA],
        viewport: viewport(screenPoint(0, 0), 1),
      }),
    );
    const at2 = femSpecs(
      scene([nodeA], [], {
        supports: [supportA],
        viewport: viewport(screenPoint(0, 0), 2),
      }),
    );
    const group1 = at1.find((spec) => spec.kind === 'group') as GroupSpec;
    const group2 = at2.find((spec) => spec.kind === 'group') as GroupSpec;

    expect(group1).toMatchObject({
      id: 'support:support-a',
      layer: 'supports',
      position: { u: 0, v: 0 },
      translation: { u: 0, v: 7 },
      rotationDeg: 0,
    });
    expect(group2.translation).toEqual({ u: 0, v: 3.5 });

    const circle1 = group1.children.find((child) => child.kind === 'circle');
    const circle2 = group2.children.find((child) => child.kind === 'circle');
    expect(circle1).toMatchObject({ center: { u: 0, v: 0 }, radius: 7 });
    expect(circle2).toMatchObject({ center: { u: 0, v: 0 }, radius: 3.5 });

    // Stage-Skalierung * lokale Weltgroesse bleibt fuer Abstand und Radius
    // gleich; damit bleibt auch ihr Verhaeltnis bei jedem Zoom konstant.
    expect(group1.translation.v / (circle1 as { radius: number }).radius).toBe(1);
    expect(group2.translation.v / (circle2 as { radius: number }).radius).toBe(1);
  });
});

describe('femSpecs: Styling', () => {
  it('defaults to thin black beams and small red nodes', () => {
    const specs = femSpecs(scene([nodeA, nodeB], [beamAB]));

    expect(specs.find((s) => s.id === 'beam:ab')).toMatchObject({
      strokeColor: '#000',
      strokeWidth: 2,
    });
    expect(specs.find((s) => s.id === 'node:a')).toMatchObject({
      fillColor: '#f00',
      radius: 4,
    });
  });

  it('lets callers override individual style fields', () => {
    const style: FEMStyle = { nodeColor: '#00f', nodeRadiusPx: 10 };
    const specs = femSpecs(scene([nodeA, nodeB], [beamAB], { style }));

    expect(specs.find((s) => s.id === 'node:a')).toMatchObject({
      fillColor: '#00f',
      radius: 10,
    });
    // Nicht ueberschriebene Felder behalten ihre Vorgabe.
    expect(specs.find((s) => s.id === 'beam:ab')).toMatchObject({
      strokeColor: '#000',
    });
  });
});

describe('femSpecs: kaputte Referenzen', () => {
  it('throws when a beam references an unknown start node', () => {
    const orphan: Beam = { ...beamAB, startNodeId: 'missing' };

    expect(() => femSpecs(scene([nodeA, nodeB], [orphan]))).toThrow(
      UnknownNodeReferenceError,
    );
  });

  it('throws when a beam references an unknown end node', () => {
    const orphan: Beam = { ...beamAB, endNodeId: 'missing' };

    expect(() => femSpecs(scene([nodeA, nodeB], [orphan]))).toThrow(
      UnknownNodeReferenceError,
    );
  });

  it('names the beam and the missing node in the message', () => {
    const orphan: Beam = { ...beamAB, endNodeId: 'missing' };

    expect(() => femSpecs(scene([nodeA, nodeB], [orphan]))).toThrow(/"ab".*"missing"/);
  });
});

describe('femSpecs: nicht implementierte Auflagersymbole', () => {
  it('throws instead of silently drawing the wrong symbol', () => {
    const fixedSupport: NodeSupport = {
      ...supportA,
      id: 'fixed-support',
      phiY: '300deg', // noch nicht implementiert
    };

    expect(() => femSpecs(scene([nodeA], [], { supports: [fixedSupport] }))).toThrow(
      UnsupportedSupportError,
    );
  });
});
