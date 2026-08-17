import { describe, expect, it } from 'vitest';

import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { FEMLoad } from '@baustatik/fem-loads';
import type { RenderDriver, Spec, ViewIntent } from '@baustatik/render-core';
import { screenPoint, size, viewport } from '@baustatik/viewport-2d';

import { createFEMViewer } from '../src/viewer';

class FakeDriver implements RenderDriver {
  readonly calls: string[] = [];
  readonly viewports = [] as ReturnType<typeof viewport>[];
  readonly scenes: (readonly Spec[])[] = [];
  flushCount = 0;
  destroyCount = 0;
  private intentHandler?: (intent: ViewIntent) => void;

  applyViewport(vp: ReturnType<typeof viewport>): void {
    this.calls.push('applyViewport');
    this.viewports.push(vp);
  }

  reconcile(specs: readonly Spec[]): void {
    this.calls.push('reconcile');
    this.scenes.push(specs);
  }

  flush(): void {
    this.calls.push('flush');
    this.flushCount++;
  }

  onViewIntent(handler: (intent: ViewIntent) => void): void {
    this.intentHandler = handler;
  }

  destroy(): void {
    this.destroyCount++;
  }

  dispatch(intent: ViewIntent): void {
    this.intentHandler?.(intent);
  }
}

const nodeA: Node = { id: 'a', position: { x: 0, z: 0 } };
const nodeB: Node = { id: 'b', position: { x: 100, z: 0 } };
const beamAB: Beam = {
  id: 'ab',
  startNodeId: 'a',
  endNodeId: 'b',
  crossSectionId: 'default',
  materialId: 'default',
};

function makeViewer(
  driver: FakeDriver,
  model: {
    nodes: readonly Node[];
    beams: readonly Beam[];
    supports?: readonly NodeSupport[];
    loads?: readonly FEMLoad[];
  },
  options: {
    initialViewport?: ReturnType<typeof viewport>;
    grid?: { spacing: number; showAxes?: boolean };
    getScreenSize?: () => ReturnType<typeof size>;
  } = {},
) {
  return createFEMViewer({
    driver,
    getNodes: () => model.nodes,
    getBeams: () => model.beams,
    getSupports: () => model.supports ?? [],
    getLoads: () => model.loads ?? [],
    getScreenSize: options.getScreenSize ?? (() => size(200, 100)),
    initialViewport: options.initialViewport,
    grid: options.grid,
  });
}

describe('createFEMViewer', () => {
  it('renders only on request and applies, reconciles, then flushes', () => {
    const driver = new FakeDriver();
    const viewer = makeViewer(driver, { nodes: [nodeA, nodeB], beams: [beamAB] });

    expect(driver.calls).toEqual([]);

    viewer.requestRender();

    expect(driver.calls).toEqual(['applyViewport', 'reconcile', 'flush']);
    expect(driver.viewports).toEqual([viewport(screenPoint(0, 0), 1)]);
    expect(driver.scenes[0].map((spec) => spec.id)).toEqual([
      'beam:ab',
      'beam:ab:fiber',
      'node:a',
      'node:b',
    ]);
  });

  it('pulls the current model and screen size for every render', () => {
    const driver = new FakeDriver();
    const model: { nodes: Node[]; beams: Beam[] } = { nodes: [nodeA], beams: [] };
    let screenSize = size(20, 20);
    const viewer = makeViewer(driver, model, {
      grid: { spacing: 10, showAxes: false },
      getScreenSize: () => screenSize,
    });

    viewer.requestRender();
    model.nodes.push(nodeB);
    screenSize = size(40, 20);
    viewer.requestRender();

    expect(driver.scenes[0].map((spec) => spec.id)).toContain('grid:v:2');
    expect(driver.scenes[1].map((spec) => spec.id)).toContain('grid:v:4');
    expect(driver.scenes[1].map((spec) => spec.id)).toContain('node:b');
  });

  it('pulls the current loads for every render, like the rest of the model', () => {
    const driver = new FakeDriver();
    const model: { nodes: Node[]; beams: Beam[]; loads: FEMLoad[] } = {
      nodes: [nodeA, nodeB],
      beams: [beamAB],
      loads: [],
    };
    const viewer = makeViewer(driver, model);

    viewer.requestRender();
    model.loads.push({ id: 'nl', target: 'node', nodeIds: ['b'], fz: 10 });
    viewer.requestRender();

    expect(driver.scenes[0].map((spec) => spec.id)).not.toContain(
      'load:nl:b:fz:arrow',
    );
    expect(driver.scenes[1].map((spec) => spec.id)).toEqual([
      'beam:ab',
      'beam:ab:fiber',
      'node:a',
      'node:b',
      'load:nl:b:fz:arrow',
      'load:nl:b:fz:label',
    ]);
  });

  it('places grid specs before FEM specs when a grid is configured', () => {
    const driver = new FakeDriver();
    const viewer = makeViewer(driver, { nodes: [nodeA], beams: [] }, {
      grid: { spacing: 10, showAxes: false },
    });

    viewer.requestRender();

    const ids = driver.scenes[0].map((spec) => spec.id);
    expect(ids.findIndex((id) => id.startsWith('grid:'))).toBeLessThan(
      ids.indexOf('node:a'),
    );
  });

  it('updates the viewport for pan and zoom intents', () => {
    const driver = new FakeDriver();
    const viewer = makeViewer(driver, { nodes: [], beams: [] }, {
      initialViewport: viewport(screenPoint(10, 20), 2),
    });

    driver.dispatch({ type: 'pan', dx: 3, dy: -5 });
    driver.dispatch({ type: 'zoom', pointer: screenPoint(20, 30), factor: 2 });

    expect(driver.viewports).toEqual([
      viewport(screenPoint(13, 15), 2),
      viewport(screenPoint(6, 0), 4),
    ]);
    expect(driver.flushCount).toBe(2);
  });

  it('resets to the configured initial viewport', () => {
    const driver = new FakeDriver();
    const initial = viewport(screenPoint(10, 20), 2);
    makeViewer(driver, { nodes: [], beams: [] }, { initialViewport: initial });

    driver.dispatch({ type: 'pan', dx: 7, dy: 9 });
    driver.dispatch({ type: 'reset' });

    expect(driver.viewports[1]).toEqual(initial);
  });

  it('resets to the default viewport when no initial viewport is configured', () => {
    const driver = new FakeDriver();
    makeViewer(driver, { nodes: [], beams: [] });

    driver.dispatch({ type: 'pan', dx: 7, dy: 9 });
    driver.dispatch({ type: 'reset' });

    expect(driver.viewports[1]).toEqual(viewport(screenPoint(0, 0), 1));
  });

  it('redraws without changing the viewport for the currently unimplemented fit intent', () => {
    const driver = new FakeDriver();
    const initial = viewport(screenPoint(10, 20), 2);
    makeViewer(driver, { nodes: [], beams: [] }, { initialViewport: initial });

    driver.dispatch({ type: 'fit' });

    expect(driver.viewports).toEqual([initial]);
    expect(driver.flushCount).toBe(1);
  });

  it('delegates destruction to its driver', () => {
    const driver = new FakeDriver();
    const viewer = makeViewer(driver, { nodes: [], beams: [] });

    viewer.destroy();

    expect(driver.destroyCount).toBe(1);
  });
});
