/**
 * Gemeinsame Fixtures der MODELLseite — Staebe, Knoten, Gelenke, Auflager.
 *
 * Die Lastseite hat ihre eigenen in `loads/helpers.ts`: sie braucht eine andere
 * Geometrie (einen schraegen Stab, an dem sich lokal und global unterscheiden)
 * und wuerde sich hier nur gegenseitig im Weg stehen.
 */

import { expect } from 'vitest';

import type { Beam, BeamEndReleases, Node, NodeSupport } from '@baustatik/fem';
import type { SolveResult } from '@baustatik/fem-solver';
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

/**
 * Der Auswertungszustand EINES Stabs.
 *
 * ABGELEITET statt importiert: `@baustatik/fem-element` ist bewusst keine
 * Abhaengigkeit dieses Packages — der Viewer sieht den Typ nur, weil
 * `SolveResult` ihn traegt. Genau so wird er hier auch benannt.
 */
type BeamState = NonNullable<ReturnType<SolveResult['beamStates']['get']>>;

/**
 * Ein Auswertungszustand aus Stabendkraeften und Stablast.
 *
 * `internalForcesAt` liest daraus nur `L`, `endForces[0..2]` und `load` — die
 * Schnittgroessen kommen aus dem GLEICHGEWICHT, nicht aus dem Stoffgesetz
 * (ADR 0018). Die uebrigen Felder stehen der Form halber da.
 */
export function beamState(
  L: number,
  endForces: readonly [number, number, number, number, number, number],
  load: BeamState['load'] = { segments: [], points: [] },
): BeamState {
  return {
    L,
    endForces,
    endDisplacements: [0, 0, 0, 0, 0, 0],
    load,
    deformation: { kind: 'timoshenko-2d-iie', phi: 0, EI: 1, EA: 1 },
  };
}

/**
 * Der EINFELDTRAEGER unter Gleichlast, als Auswertungszustand.
 *
 *   V(x) = qL/2 - q x        M(x) = (qL/2) x - q x²/2       M_max = qL²/8
 *
 * Aus `V(0) = -e[1]` und `M(0) = e[2]` folgen die beiden Stabendkraefte. Die
 * Extremstelle `x = L/2` rechnet `internalForcesStations` EXAKT aus, sie haengt
 * also nicht an der Rasterweite — das ist die Grundlage der Gegenprobe.
 */
export function simplySupported(L: number, q: number): BeamState {
  return beamState(L, [0, -(q * L) / 2, 0, 0, (q * L) / 2, 0], {
    segments: [{ from: 0, to: L, qx1: 0, qx2: 0, qz1: q, qz2: q, my1: 0, my2: 0 }],
    points: [],
  });
}

/** Ein Ergebnis mit nur den Feldern, die der Viewer liest. */
export function solveResult(rest: Partial<SolveResult> = {}): SolveResult {
  return {
    loadCaseId: 'lf',
    displacements: new Map(),
    reactions: new Map(),
    beamStates: new Map(),
    warnings: [],
    ...rest,
  };
}

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
