/**
 * Die SZENE als Ganzes: was nur entsteht, wenn Modell und Lasten
 * zusammenkommen. Was ein einzelner Stab, Knoten, Gelenk oder ein Auflager
 * zeichnet, steht in `model/`; was eine Last zeichnet, in `loads/`.
 */

import { describe, expect, it } from 'vitest';

import type { Node } from '@baustatik/fem';
import { gridSpecs } from '@baustatik/grid-2d';
import { validateSpecs } from '@baustatik/render-core';
import { pan, screenPoint, size, viewport } from '@baustatik/viewport-2d';

import { FEM_LAYERS } from '../src/layers';
import type { FEMStyle } from '../src/scene';
import {
  beamAB,
  hinged,
  nodeA,
  nodeB,
  nodeC,
  specById,
  specsOf,
  supportA,
  vp1,
} from './helpers';

const NODE_LOAD = { id: 'nl', target: 'node', nodeIds: ['b'], fz: 10 };

/** Eine Szene, in der jede Sorte Spec genau einmal vorkommt. */
function fullScene(rest: Record<string, unknown> = {}) {
  return specsOf(
    [nodeA, nodeB, nodeC],
    [hinged(beamAB, { start: { theta: true } })],
    {
      supports: [supportA],
      loads: [NODE_LOAD as never],
      ...rest,
    },
  );
}

describe('IDs bleiben ueber die ganze Szene eindeutig', () => {
  it('namespaces ids so nodes and beams cannot collide', () => {
    // Ein Knoten und ein Stab duerfen dieselbe Roh-ID tragen; validateSpecs
    // verlangt aber Eindeutigkeit ueber alle Baender hinweg.
    const sameId: Node = { id: 'ab', position: { x: 0, z: 0 } };
    const specs = specsOf([nodeA, nodeB, sameId], [beamAB]);

    expect(specs.map((s) => s.id)).toContain('beam:ab');
    expect(specs.map((s) => s.id)).toContain('node:ab');
    expect(() => validateSpecs(specs)).not.toThrow();
  });

  it('produces specs that pass render-core validation', () => {
    expect(() => validateSpecs(fullScene())).not.toThrow();
  });

  it('keeps ids stable across pan and zoom so the renderer patches', () => {
    const before = fullScene();
    const panned = fullScene({ viewport: pan(vp1, 3, 7) });
    const zoomed = fullScene({ viewport: viewport(screenPoint(0, 0), 4) });

    expect(panned.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(zoomed.map((s) => s.id)).toEqual(before.map((s) => s.id));
  });
});

describe('Szene und Baender passen zusammen', () => {
  it('emits only bands that FEM_LAYERS declares, grid included', () => {
    // Genau der Fall, den UnknownLayerError im Adapter abfaengt: emittiert
    // irgendeine Quelle ein Band, das der Driver nicht kennt, bricht der erste
    // Frame ab. gridSpecs stampft 'grid' per Vorgabe — das muss im Tupel stehen.
    const specs = [
      ...gridSpecs(vp1, size(200, 200), { spacing: 10 }),
      ...fullScene(),
    ];

    expect(specs.length).toBeGreaterThan(3);
    for (const spec of specs) {
      expect(FEM_LAYERS).toContain(spec.layer);
    }
    // Und die ganze Szene bleibt ueber Baender hinweg ID-eindeutig.
    expect(() => validateSpecs(specs)).not.toThrow();
  });

  it('covers every band except grid from the model and its loads alone', () => {
    // Die Gegenrichtung: nicht nur „kein unbekanntes Band", sondern auch
    // „kein Band im Tupel, das nie jemand bespielt".
    const used = new Set(fullScene().map((s) => s.layer));

    expect([...FEM_LAYERS].filter((band) => band !== 'grid').sort()).toEqual(
      [...used].sort(),
    );
  });
});

describe('Der Stil erreicht beide Haelften', () => {
  it('applies caller overrides to model AND loads from one object', () => {
    // Die Vorgaben werden EINMAL aufgeloest und an beide Seiten durchgereicht.
    // Wirkte ein Override nur auf einer Haelfte, faende man es erst im Bild.
    const style: FEMStyle = { nodeColor: '#00f', pointForceColor: '#0f0' };
    const specs = fullScene({ style });

    expect(specById(specs, 'node:a')).toMatchObject({ fillColor: '#00f' });
    expect(specById(specs, 'load:nl:b:fz:arrow')).toMatchObject({
      strokeColor: '#0f0',
    });
  });

  it('leaves untouched fields at their defaults on both halves', () => {
    const specs = fullScene({ style: { nodeColor: '#00f' } });

    expect(specById(specs, 'beam:ab')).toMatchObject({ strokeColor: '#000' });
    expect(specById(specs, 'load:nl:b:fz:arrow')).toMatchObject({
      strokeColor: '#1d4ed8',
    });
  });
});
