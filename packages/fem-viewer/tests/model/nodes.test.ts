import { describe, expect, it } from 'vitest';

import {
  beamAB,
  inLayer,
  nodeA,
  nodeB,
  nodeC,
  specById,
  specsOf,
  vp1,
  vp2,
} from '../helpers';

describe('Der Knoten als Kreis', () => {
  it('emits exactly one circle per node', () => {
    const specs = specsOf([nodeA, nodeB, nodeC], [beamAB]);

    expect(specs.filter((s) => s.kind === 'circle')).toHaveLength(3);
  });

  it('maps z downwards onto v without flipping the sign', () => {
    // In fem-geometry zeigt z nach unten, auf dem Schirm zeigt v nach unten.
    // Ein Knoten bei z=100 gehoert also UNTER den Ursprung, nicht darueber.
    const specs = specsOf([nodeC], []);

    expect(specById(specs, 'node:c')).toMatchObject({
      center: { u: 100, v: 100 },
    });
  });

  it('puts every node circle into the nodes band', () => {
    const specs = specsOf([nodeA, nodeB], [beamAB]);

    expect(inLayer(specs, 'nodes').map((s) => s.id)).toEqual([
      'node:a',
      'node:b',
    ]);
  });
});

describe('Schema statt Abbild', () => {
  it('halves the node radius when the scale doubles', () => {
    // Konva.Circle.radius liegt in lokalen Koordinaten und skaliert mit der
    // Stage — geteilt durch scale bleibt der Punkt am Schirm gleich gross.
    const at1 = specsOf([nodeA], [], { viewport: vp1 });
    const at2 = specsOf([nodeA], [], { viewport: vp2 });

    expect(specById(at1, 'node:a')).toMatchObject({ radius: 4 });
    expect(specById(at2, 'node:a')).toMatchObject({ radius: 2 });
  });
});

describe('Styling', () => {
  it('defaults to a small red node', () => {
    const specs = specsOf([nodeA], []);

    expect(specById(specs, 'node:a')).toMatchObject({
      fillColor: '#f00',
      radius: 4,
    });
  });

  it('lets callers override node colour and radius', () => {
    const specs = specsOf([nodeA], [], {
      style: { nodeColor: '#00f', nodeRadiusPx: 10 },
    });

    expect(specById(specs, 'node:a')).toMatchObject({
      fillColor: '#00f',
      radius: 10,
    });
  });
});
