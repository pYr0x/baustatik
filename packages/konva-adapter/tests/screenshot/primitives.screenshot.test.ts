import type { GroupSpec, Spec } from '@baustatik/render-core';
import { viewport } from '@baustatik/viewport-2d';
import { page } from '@vitest/browser/context';
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createAdapterHarness, nextFrame } from '../browser/harness';

// pixelRatio bindet sonst window.devicePixelRatio in die Bilddatei ein und
// macht Baselines geraeteabhaengig. Fest auf 1 fuer reproduzierbare Screenshots.
beforeAll(() => {
  Konva.pixelRatio = 1;
});

// Weltursprung in die Mitte des 320x240-Containers, 20 px/Welt-Einheit.
const VIEW = viewport({ x: 160, y: 120 }, 20);

async function snapshot(name: string, specs: readonly Spec[]): Promise<void> {
  const h = createAdapterHarness();
  h.driver.applyViewport(VIEW);
  h.driver.reconcile(specs);
  h.driver.flush();
  await nextFrame();

  await expect
    .element(page.getByTestId('konva-stage-container'))
    .toMatchScreenshot(name);

  h.destroy();
}

describe('primitive shapes — screenshot baselines', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a line', async () => {
    await snapshot('primitive-line', [
      {
        id: 'line',
        kind: 'line',
        from: { u: -4, v: 0 },
        to: { u: 4, v: 0 },
        strokeColor: '#1d4ed8',
        strokeWidth: 3,
      },
    ]);
  });

  it('renders a circle', async () => {
    await snapshot('primitive-circle', [
      {
        id: 'circle',
        kind: 'circle',
        center: { u: 0, v: 0 },
        radius: 3,
        fillColor: '#f59e0b',
        strokeColor: '#92400e',
        strokeWidth: 2,
      },
    ]);
  });

  it('renders a polygon', async () => {
    await snapshot('primitive-polygon', [
      {
        id: 'polygon',
        kind: 'polygon',
        points: [
          { u: 0, v: -3 },
          { u: 3, v: 2 },
          { u: -3, v: 2 },
        ],
        closed: true,
        fillColor: '#10b981',
        strokeColor: '#065f46',
        strokeWidth: 2,
      },
    ]);
  });

  it('renders a rectangle', async () => {
    await snapshot('primitive-rectangle', [
      {
        id: 'rectangle',
        kind: 'rectangle',
        topLeft: { u: -4, v: -2.5 },
        width: 8,
        height: 5,
        fillColor: '#818cf8',
        strokeColor: '#3730a3',
        strokeWidth: 2,
      },
    ]);
  });

  it('renders a triangle', async () => {
    await snapshot('primitive-triangle', [
      {
        id: 'triangle',
        kind: 'triangle',
        center: { u: 0, v: 0 },
        sideLength: 6,
        fillColor: '#f472b6',
        strokeColor: '#9d174d',
        strokeWidth: 2,
      },
    ]);
  });

  // Fuer `label` gibt es BEWUSST keine Baseline: Text haengt deutlich staerker
  // von der Maschine ab als das ohnehin plattformabhaengige Antialiasing
  // (Fontverfuegbarkeit, Hinting). Die Zusage ueber die Boxgeometrie steht
  // stattdessen im Browser-Test, siehe CONTEXT.md.
  it('renders an arrow', async () => {
    await snapshot('primitive-arrow', [
      {
        id: 'arrow',
        kind: 'arrow',
        tail: { u: 0, v: -3 },
        tip: { u: 0, v: 3 },
        pointerLength: 1,
        pointerWidth: 0.8,
        strokeColor: '#1d4ed8',
        strokeWidth: 3,
        fillColor: '#1d4ed8',
      },
    ]);
  });

  it('renders a dashed stroke', async () => {
    await snapshot('stroke-dashed', [
      {
        id: 'dashed',
        kind: 'line',
        from: { u: -4, v: 0 },
        to: { u: 4, v: 0 },
        strokeColor: '#111827',
        strokeWidth: 3,
        strokeStyle: 'dashed',
      },
    ]);
  });

  it('renders a dotted stroke', async () => {
    await snapshot('stroke-dotted', [
      {
        id: 'dotted',
        kind: 'line',
        from: { u: -4, v: 0 },
        to: { u: 4, v: 0 },
        strokeColor: '#111827',
        strokeWidth: 3,
        strokeStyle: 'dotted',
      },
    ]);
  });

  it('renders a rectangle with rounded corners', async () => {
    await snapshot('rectangle-corner-radius', [
      {
        id: 'rounded',
        kind: 'rectangle',
        topLeft: { u: -4, v: -2.5 },
        width: 8,
        height: 5,
        // Konva liest [topLeft, topRight, bottomRight, bottomLeft]. Bewusst
        // asymmetrisch, damit ein vertauschtes Ecken-Mapping auffaellt.
        cornerRadius: [2, 0, 2, 0],
        fillColor: '#38bdf8',
        strokeColor: '#0369a1',
        strokeWidth: 2,
      },
    ]);
  });

  it('renders a rotated group', async () => {
    const group: GroupSpec = {
      id: 'grp',
      kind: 'group',
      position: { u: 0, v: 0 },
      translation: { u: 0, v: 0 },
      rotationDeg: 30,
      children: [
        {
          id: 'grp-rect',
          kind: 'rectangle',
          topLeft: { u: -4, v: -1.5 },
          width: 8,
          height: 3,
          fillColor: '#fca5a5',
          strokeColor: '#991b1b',
          strokeWidth: 2,
        },
      ],
    };
    await snapshot('group-rotated', [group]);
  });
});
