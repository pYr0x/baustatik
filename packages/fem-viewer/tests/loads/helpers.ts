/**
 * Gemeinsame Fixtures der LASTseite.
 *
 * Eigene Geometrie, nicht die aus `../helpers.ts`: die Lasttests brauchen einen
 * SCHRAEGEN Stab, an dem sich lokale und globale Richtung unterscheiden — sonst
 * beweist kein Test, dass die Drehung ins Stabsystem ueberhaupt stattfindet.
 */

import { expect } from 'vitest';

import type { Beam, Node } from '@baustatik/fem';
import type { FEMLoad } from '@baustatik/fem-loads';
import type { Spec } from '@baustatik/render-core';
import { screenPoint, type Viewport, viewport } from '@baustatik/viewport-2d';

import { femSpecs } from '../../src/scene';

export const vp1 = viewport(screenPoint(0, 0), 1);
export const vp4 = viewport(screenPoint(0, 0), 4);

// a — b liegt waagrecht (L = 100), b — c faellt unter 45 Grad (L = 100 * √2).
export const nodeA: Node = { id: 'a', position: { x: 0, z: 0 } };
export const nodeB: Node = { id: 'b', position: { x: 100, z: 0 } };
export const nodeC: Node = { id: 'c', position: { x: 200, z: 100 } };

export const beamAB: Beam = {
  id: 'ab',
  startNodeId: 'a',
  endNodeId: 'b',
  crossSectionId: 'default',
  materialId: 'default',
};
export const beamBC: Beam = {
  ...beamAB,
  id: 'bc',
  startNodeId: 'b',
  endNodeId: 'c',
};

/**
 * Die Zeichner fuer EIN Modell. Jede Testdatei bindet ihr eigenes Modell —
 * `moments.test.ts` kommt mit dem waagrechten Stab aus, `point-forces.test.ts`
 * braucht den schraegen dazu.
 */
export function drawingOf(nodes: readonly Node[], beams: readonly Beam[]) {
  function specsFor(
    loads: readonly FEMLoad[],
    vp: Viewport = vp1,
  ): readonly Spec[] {
    return femSpecs({ nodes, beams, supports: [], loads, viewport: vp });
  }

  /** Nur die Lastspecs: `femSpecs` liefert immer die ganze Szene. */
  function loadOnly(
    loads: readonly FEMLoad[],
    vp: Viewport = vp1,
  ): readonly Spec[] {
    return specsFor(loads, vp).filter((spec) => spec.id.startsWith('load:'));
  }

  function specById<T>(
    loads: readonly FEMLoad[],
    id: string,
    vp: Viewport = vp1,
  ): T {
    const spec = specsFor(loads, vp).find((s) => s.id === id);
    expect(spec, `kein Spec mit id ${id}`).toBeDefined();
    return spec as T;
  }

  return { specsFor, loadOnly, specById };
}
