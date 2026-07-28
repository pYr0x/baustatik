import { describe, expect, it } from 'vitest';

import type { CircleSpec } from '@baustatik/render-core';
import { validateSpecs } from '@baustatik/render-core';

import { FEM_LAYERS } from '../../src/layers';
import {
  beamAB,
  beamAC,
  hinged,
  nodeA,
  nodeB,
  nodeC,
  specById,
  specsOf,
  vp1,
  vp2,
} from '../helpers';

const NODES = [nodeA, nodeB];

/** Alle Gelenkkreise einer Szene. */
function hinges(specs: readonly { id: string }[]) {
  return specs.filter((s) => s.id.includes(':hinge:'));
}

describe('Wann ein Gelenk gezeichnet wird', () => {
  it('draws none for a beam without releases', () => {
    expect(hinges(specsOf(NODES, [beamAB]))).toHaveLength(0);
  });

  it('draws none for an empty release object', () => {
    // `releases: {}` ist keine Freigabe — der Stab ist beidseitig biegesteif.
    expect(hinges(specsOf(NODES, [hinged(beamAB, {})]))).toHaveLength(0);
  });

  it('draws one at the start node when the start end is released', () => {
    const specs = specsOf(NODES, [hinged(beamAB, { start: { theta: true } })]);

    expect(hinges(specs).map((s) => s.id)).toEqual(['beam:ab:hinge:a']);
  });

  it('draws one at the end node when the end is released', () => {
    const specs = specsOf(NODES, [hinged(beamAB, { end: { theta: true } })]);

    expect(hinges(specs).map((s) => s.id)).toEqual(['beam:ab:hinge:b']);
  });

  it('draws both when both ends are released', () => {
    const specs = specsOf(NODES, [
      hinged(beamAB, { start: { theta: true }, end: { theta: true } }),
    ]);

    expect(hinges(specs).map((s) => s.id)).toEqual([
      'beam:ab:hinge:a',
      'beam:ab:hinge:b',
    ]);
  });

  // Der Viewer zeigt, DASS der Stab hier gelenkig anschliesst — nicht, welche
  // Komponente freigegeben ist. Alle drei bekommen deshalb dasselbe Symbol.
  it.each([['u'], ['w'], ['theta']])(
    'treats a released %s like any other release',
    (component) => {
      const specs = specsOf(NODES, [
        hinged(beamAB, { start: { [component]: true } }),
      ]);

      expect(hinges(specs).map((s) => s.id)).toEqual(['beam:ab:hinge:a']);
    },
  );

  it('names beam AND node, so two beams hinged at one node stay apart', () => {
    const specs = specsOf(
      [nodeA, nodeB, nodeC],
      [
        hinged(beamAB, { start: { theta: true } }),
        hinged(beamAC, { start: { theta: true } }),
      ],
    );

    expect(hinges(specs).map((s) => s.id)).toEqual([
      'beam:ab:hinge:a',
      'beam:ac:hinge:a',
    ]);
  });
});

describe('Wo das Gelenk sitzt', () => {
  it('sits two node radii from the node, INTO the beam', () => {
    const specs = specsOf(NODES, [hinged(beamAB, { start: { theta: true } })]);

    // nodeRadiusPx = 4, also 8 px vom Knoten weg auf der Stabachse.
    expect(specById(specs, 'beam:ab:hinge:a')).toMatchObject({
      center: { u: 8, v: 0 },
    });
  });

  it('points back along the beam at the end node', () => {
    const specs = specsOf(NODES, [hinged(beamAB, { end: { theta: true } })]);

    expect(specById(specs, 'beam:ab:hinge:b')).toMatchObject({
      center: { u: 92, v: 0 },
    });
  });

  it('follows the axis of a skewed beam', () => {
    const specs = specsOf(
      [nodeA, nodeC],
      [hinged(beamAC, { start: { theta: true } })],
    );
    const hinge = specById<CircleSpec>(specs, 'beam:ac:hinge:a');

    // a — c faellt unter 45 Grad; 8 px auf dieser Achse heisst 8/√2 je Richtung.
    expect(hinge.center.u).toBeCloseTo(8 * Math.SQRT1_2, 10);
    expect(hinge.center.v).toBeCloseTo(8 * Math.SQRT1_2, 10);
  });
});

describe('Schema statt Abbild', () => {
  it('halves radius AND offset when the scale doubles', () => {
    const at1 = specsOf(NODES, [hinged(beamAB, { start: { theta: true } })], {
      viewport: vp1,
    });
    const at2 = specsOf(NODES, [hinged(beamAB, { start: { theta: true } })], {
      viewport: vp2,
    });

    expect(specById(at1, 'beam:ab:hinge:a')).toMatchObject({
      radius: 3,
      center: { u: 8, v: 0 },
    });
    expect(specById(at2, 'beam:ab:hinge:a')).toMatchObject({
      radius: 1.5,
      center: { u: 4, v: 0 },
    });
  });

  it('leaves the stroke width untouched — the adapter draws it in screen px', () => {
    const at2 = specsOf(NODES, [hinged(beamAB, { start: { theta: true } })], {
      viewport: vp2,
    });

    expect(specById(at2, 'beam:ab:hinge:a')).toMatchObject({ strokeWidth: 1 });
  });
});

describe('Aussehen und Band', () => {
  it('is a white disc with a dark outline — a HOLE in the beam', () => {
    const specs = specsOf(NODES, [hinged(beamAB, { start: { theta: true } })]);

    expect(specById(specs, 'beam:ab:hinge:a')).toMatchObject({
      kind: 'circle',
      fillColor: '#fff',
      strokeColor: '#000',
    });
  });

  it('sits in the hinges band, which FEM_LAYERS declares above nodes', () => {
    const specs = specsOf(NODES, [hinged(beamAB, { start: { theta: true } })]);

    expect(specById(specs, 'beam:ab:hinge:a').layer).toBe('hinges');
    expect(FEM_LAYERS.indexOf('hinges')).toBeGreaterThan(
      FEM_LAYERS.indexOf('nodes'),
    );
  });

  it('lets callers override its radius and colours', () => {
    const specs = specsOf(NODES, [hinged(beamAB, { start: { theta: true } })], {
      style: {
        hingeRadiusPx: 6,
        hingeInnerColor: '#ff0',
        hingeStrokeColor: '#00f',
      },
    });

    expect(specById(specs, 'beam:ab:hinge:a')).toMatchObject({
      radius: 6,
      fillColor: '#ff0',
      strokeColor: '#00f',
    });
  });

  it('produces specs that pass render-core validation', () => {
    const specs = specsOf(NODES, [
      hinged(beamAB, { start: { theta: true }, end: { u: true } }),
    ]);

    expect(() => validateSpecs(specs)).not.toThrow();
  });
});
