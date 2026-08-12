/**
 * Gemeinsame Fixtures der Querschnitts-Szene.
 *
 * Eine Datei fuer alle fuenf Lagen: anders als beim FEM-Viewer, dessen Last-
 * und Modellseite je eigene Geometrien brauchen, zeichnen hier alle Lagen
 * DIESELBE Figur — Wandgraph, Umriss, Netz und Symbole gehoeren zu einem
 * Querschnitt.
 */

import {
  DEFAULT_SECTION_POLICY,
  type SectionGeometry,
  type SectionProperties,
} from '@baustatik/cross-section';
import type {
  RenderDriver,
  Spec,
  ViewIntent,
} from '@baustatik/render-core';
import { screenPoint, type Viewport, viewport } from '@baustatik/viewport-2d';
import { expect } from 'vitest';

import {
  type CrossSectionSceneOptions,
  crossSectionSpecs,
} from '../src/scene';

export const vp1 = viewport(screenPoint(0, 0), 1);
export const vp2 = viewport(screenPoint(0, 0), 2);

/** Ein tragender Umriss, damit die Wandspecs nicht die einzigen sind. */
export const OUTLINE = [
  {
    points: [
      { y: 0, z: 0 },
      { y: 100, z: 0 },
      { y: 100, z: 100 },
    ],
  },
];

/** Eine einzelne Wand von (0,0) nach (100,0), wahlweise gewoelbt. */
export function wallGeometry(bulge?: number): SectionGeometry {
  return {
    kind: 'midline',
    idealisation: 'thin-walled',
    nodes: [
      { id: 'a', y: 0, z: 0 },
      { id: 'b', y: 100, z: 0 },
    ],
    walls: [
      {
        id: 'w1',
        startNodeId: 'a',
        endNodeId: 'b',
        t: 8,
        ...(bulge === undefined ? {} : { bulge }),
      },
    ],
    outline: OUTLINE,
  };
}

/**
 * Ein vollstaendiger Wertesatz in SI-METERN, mit Nachkommastellen, die eine
 * Rundung auf ganze Millimeter zerstoeren wuerde.
 */
export const PROPERTIES: SectionProperties = {
  A: 1e-3,
  Iy: 1e-6,
  Iz: 1e-6,
  Iyz: 0,
  ys: 0.0069,
  zs: 0.1395,
  alpha: 0,
  Iu: 1e-6,
  Iv: 1e-6,
  yM: 0.0123,
  zM: 0.0456,
};

/** Die Szene bauen und zeichnen in einem Schritt. */
export function specsOf(
  rest: Partial<CrossSectionSceneOptions> = {},
): readonly Spec[] {
  return crossSectionSpecs({
    geometry: wallGeometry(),
    sectionPolicy: DEFAULT_SECTION_POLICY,
    viewport: vp1,
    ...rest,
  });
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

/** Ein Treiber, der nichts zeichnet und nur mitschreibt, was er bekaeme. */
export function recordingDriver(): RenderDriver & {
  readonly specs: Spec[];
  readonly calls: string[];
  emit(intent: ViewIntent): void;
} {
  let specs: Spec[] = [];
  const calls: string[] = [];
  let handler: ((intent: ViewIntent) => void) | undefined;

  return {
    get specs() {
      return specs;
    },
    calls,
    applyViewport: () => calls.push('applyViewport'),
    reconcile: (next: readonly Spec[]) => {
      calls.push('reconcile');
      specs = [...next];
    },
    flush: () => calls.push('flush'),
    onViewIntent: (next: (intent: ViewIntent) => void) => {
      handler = next;
    },
    destroy: () => calls.push('destroy'),
    emit: (intent: ViewIntent) => handler?.(intent),
  };
}

export type { Viewport };
