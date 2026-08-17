/**
 * Die gestrichelte Faser.
 *
 * DIE SEITE IST DER GANZE PUNKT — deshalb steht hier ein waagerechter UND ein
 * senkrechter Stab. `ez` folgt allein aus der Knotenreihenfolge; die Faser macht
 * das sichtbar, und `results/internal-forces.ts` traegt genau dorthin auf.
 */

import { describe, expect, it } from 'vitest';

import type { Beam, Node } from '@baustatik/fem';
import type { LineSpec } from '@baustatik/render-core';
import { screenPoint, viewport } from '@baustatik/viewport-2d';

import { nodeA, nodeB, specById, specsOf, vp1 } from '../helpers';

/** Senkrecht UNTER `a`: der Stab faellt von z=0 auf z=100. */
const nodeD: Node = { id: 'd', position: { x: 0, z: 100 } };

const beamAD: Beam = {
  id: 'ad',
  startNodeId: 'a',
  endNodeId: 'd',
  crossSectionId: 'default',
  materialId: 'default',
};

const beamAB: Beam = { ...beamAD, id: 'ab', endNodeId: 'b' };

describe('Die Faser liegt auf der +ez-Seite', () => {
  it('hangs BELOW a horizontal beam running in +x', () => {
    // `ex = (1, 0)` ⇒ `ez = (0, 1)`, und z zeigt nach unten.
    const fiber = specById<LineSpec>(
      specsOf([nodeA, nodeB], [beamAB], { viewport: vp1 }),
      'beam:ab:fiber',
    );

    expect(fiber.from).toEqual({ u: 0, v: 6 });
    expect(fiber.to).toEqual({ u: 100, v: 6 });
  });

  it('sits LEFT of a beam running downwards — where the side is invisible', () => {
    // `ex = (0, 1)` ⇒ `ez = (−1, 0)`. Genau dieser Fall ist der Grund fuer die
    // Faser: an einer Stuetze sagt das Bild sonst nicht, welche Seite `+z` ist.
    const fiber = specById<LineSpec>(
      specsOf([nodeA, nodeD], [beamAD], { viewport: vp1 }),
      'beam:ad:fiber',
    );

    expect(fiber.from).toEqual({ u: -6, v: 0 });
    expect(fiber.to).toEqual({ u: -6, v: 100 });
  });

  it('is drawn without any result at all', () => {
    // Sie gehoert zum MODELL: sie ist eine Eigenschaft des Stabs, kein Ergebnis.
    const ids = specsOf([nodeA, nodeB], [beamAB]).map((spec) => spec.id);

    expect(ids).toContain('beam:ab:fiber');
  });
});

describe('Schema statt Abbild — auch die Faser', () => {
  it('keeps its offset and stroke screen-constant', () => {
    const at4 = specById<LineSpec>(
      specsOf([nodeA, nodeB], [beamAB], {
        viewport: viewport(screenPoint(0, 0), 4),
      }),
      'beam:ab:fiber',
    );

    // Der Versatz ist ein SCREEN-Mass und wird deshalb geteilt — anders als die
    // Diagrammordinate, die ein Weltmass ist (ADR 0050).
    expect(at4.from).toEqual({ u: 0, v: 6 / 4 });
    // Die Strichstaerke bleibt ungeteilt: `strokeScaleEnabled: false`.
    expect(at4.strokeWidth).toBe(1);
  });

  it('is dashed and grey, so it does not double the beam line', () => {
    const fiber = specById<LineSpec>(
      specsOf([nodeA, nodeB], [beamAB]),
      'beam:ab:fiber',
    );

    expect(fiber.strokeStyle).toBe('dashed');
    expect(fiber.strokeColor).not.toBe('#000');
  });

  it('lets callers override side offset, colour and dash style', () => {
    const fiber = specById<LineSpec>(
      specsOf([nodeA, nodeB], [beamAB], {
        style: {
          fiberOffsetPx: 12,
          fiberColor: '#123456',
          fiberDashStyle: 'dotted',
        },
      }),
      'beam:ab:fiber',
    );

    expect(fiber.from).toEqual({ u: 0, v: 12 });
    expect(fiber.strokeColor).toBe('#123456');
    expect(fiber.strokeStyle).toBe('dotted');
  });
});
