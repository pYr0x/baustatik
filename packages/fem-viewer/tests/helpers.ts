/**
 * Gemeinsame Fixtures der MODELLseite — Staebe, Knoten, Gelenke, Auflager.
 *
 * Die Lastseite hat ihre eigenen in `loads/helpers.ts`: sie braucht eine andere
 * Geometrie (einen schraegen Stab, an dem sich lokal und global unterscheiden)
 * und wuerde sich hier nur gegenseitig im Weg stehen.
 */

import { expect } from 'vitest';

import type { Beam, BeamEndReleases, Node, NodeSupport } from '@baustatik/fem';
import type { Spec } from '@baustatik/render-core';
import { screenPoint, type Viewport, viewport } from '@baustatik/viewport-2d';

import { type FEMSceneOptions, femSpecs } from '../src/scene';

export const vp1 = viewport(screenPoint(0, 0), 1);
export const vp2 = viewport(screenPoint(0, 0), 2);

export const nodeA: Node = { id: 'a', position: { x: 0, z: 0 } };
export const nodeB: Node = { id: 'b', position: { x: 100, z: 0 } };
export const nodeC: Node = { id: 'c', position: { x: 100, z: 100 } };

export const beamAB: Beam = {
  id: 'ab',
  startNodeId: 'a',
  endNodeId: 'b',
  crossSectionId: 'default',
  materialId: 'default',
};

/** Derselbe Stab, aber senkrecht: a — c faellt von z=0 auf z=100. */
export const beamAC: Beam = { ...beamAB, id: 'ac', endNodeId: 'c' };

export const supportA: NodeSupport = {
  id: 'support-a',
  nodeId: 'a',
  ux: 'fixed',
  uz: 'fixed',
  phiY: 'free',
};

/** Ein Stab mit Freigaben — die Vorlage bleibt unberuehrt. */
export function hinged(
  beam: Beam,
  releases: { start?: BeamEndReleases; end?: BeamEndReleases },
): Beam {
  return { ...beam, releases };
}

// femSpecs nimmt ein Optionsobjekt; die Tests interessieren sich meist nur fuer
// Knoten und Staebe, der Rest bleibt leer.
export function scene(
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

/** Kurzschluss: Szene bauen und zeichnen in einem Schritt. */
export function specsOf(
  nodes: readonly Node[],
  beams: readonly Beam[],
  rest: Partial<Omit<FEMSceneOptions, 'nodes' | 'beams'>> = {},
): readonly Spec[] {
  return femSpecs(scene(nodes, beams, rest));
}

/** Ein Spec nach ID, mit einer Fehlermeldung, die die ID nennt. */
export function specById<T extends Spec = Spec>(
  specs: readonly Spec[],
  id: string,
): T {
  const spec = specs.find((s) => s.id === id);
  expect(spec, `kein Spec mit id ${id}`).toBeDefined();
  return spec as T;
}

/** Alle Specs eines Bandes. */
export function inLayer(specs: readonly Spec[], layer: string): readonly Spec[] {
  return specs.filter((s) => s.layer === layer);
}

export type { Viewport };
