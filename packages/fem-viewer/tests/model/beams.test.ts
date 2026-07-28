import { describe, expect, it } from 'vitest';

import type { Beam } from '@baustatik/fem';

import { UnknownNodeReferenceError } from '../../src/errors';
import {
  beamAB,
  inLayer,
  nodeA,
  nodeB,
  specById,
  specsOf,
  vp1,
} from '../helpers';
import { screenPoint, viewport } from '@baustatik/viewport-2d';

describe('Der Stab als Linie', () => {
  it('maps a beam between two nodes to a line with resolved endpoints', () => {
    const beam = specById(specsOf([nodeA, nodeB], [beamAB]), 'beam:ab');

    expect(beam.kind).toBe('line');
    expect(beam).toMatchObject({
      from: { u: 0, v: 0 },
      to: { u: 100, v: 0 },
    });
  });

  it('emits exactly one line per beam', () => {
    const specs = specsOf([nodeA, nodeB], [beamAB]);

    expect(specs.filter((s) => s.kind === 'line')).toHaveLength(1);
  });

  it('puts every beam line into the beams band', () => {
    const specs = specsOf([nodeA, nodeB], [beamAB]);

    expect(inLayer(specs, 'beams').map((s) => s.id)).toEqual(['beam:ab']);
  });
});

describe('Schema statt Abbild', () => {
  it('keeps the beam stroke width constant across zoom', () => {
    // strokeScaleEnabled:false im Adapter — der Wert IST bereits Screen-px und
    // darf deshalb NICHT mit vp.scale verrechnet werden.
    const at1 = specsOf([nodeA, nodeB], [beamAB], { viewport: vp1 });
    const at8 = specsOf([nodeA, nodeB], [beamAB], {
      viewport: viewport(screenPoint(0, 0), 8),
    });

    expect(specById(at1, 'beam:ab')).toMatchObject({ strokeWidth: 2 });
    expect(specById(at8, 'beam:ab')).toMatchObject({ strokeWidth: 2 });
  });
});

describe('Styling', () => {
  it('defaults to a thin black beam', () => {
    const specs = specsOf([nodeA, nodeB], [beamAB]);

    expect(specById(specs, 'beam:ab')).toMatchObject({
      strokeColor: '#000',
      strokeWidth: 2,
    });
  });

  it('lets callers override beam colour and width', () => {
    const specs = specsOf([nodeA, nodeB], [beamAB], {
      style: { beamColor: '#0ff', beamWidthPx: 5 },
    });

    expect(specById(specs, 'beam:ab')).toMatchObject({
      strokeColor: '#0ff',
      strokeWidth: 5,
    });
  });
});

describe('Kaputte Referenzen', () => {
  it('throws when a beam references an unknown start node', () => {
    const orphan: Beam = { ...beamAB, startNodeId: 'missing' };

    expect(() => specsOf([nodeA, nodeB], [orphan])).toThrow(
      UnknownNodeReferenceError,
    );
  });

  it('throws when a beam references an unknown end node', () => {
    const orphan: Beam = { ...beamAB, endNodeId: 'missing' };

    expect(() => specsOf([nodeA, nodeB], [orphan])).toThrow(
      UnknownNodeReferenceError,
    );
  });

  it('names the beam and the missing node in the message', () => {
    const orphan: Beam = { ...beamAB, endNodeId: 'missing' };

    expect(() => specsOf([nodeA, nodeB], [orphan])).toThrow(/"ab".*"missing"/);
  });
});
