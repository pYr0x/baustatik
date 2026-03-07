import Konva from 'konva';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { degToRad } from '@baustatik/core';
import { screenPoint, viewport, worldPoint } from '@baustatik/render-core';
import { Arc, Point } from '@baustatik/section-geometry';

import { sampleSectionArcToWorldPoints } from '../../src/arc-sampling';
import {
  worldPolygonToKonvaLineProps,
  worldPolylineToKonvaLineProps,
} from '../../src/konva-builders';
import { getStagePointerWorld } from '../../src/pointer';
import { panViewport, zoomViewportAt } from '../../src/viewport-controls';
import { createStageHarness } from './harness';

describe('konva-adapter browser integration', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('creates a stage/canvas in browser', () => {
    const harness = createStageHarness(200, 100);

    const container = document.querySelector('[data-testid="konva-stage-container"]');
    expect(container).toBe(harness.container);
    expect(harness.stage.width()).toBe(200);
    expect(harness.stage.height()).toBe(100);

    harness.destroy();
  });

  it('renders a polyline from adapter props', () => {
    const harness = createStageHarness();
    const layer = new Konva.Layer();
    harness.stage.add(layer);

    const vp = viewport(screenPoint(0, 0), 1);
    const props = worldPolylineToKonvaLineProps(
      [worldPoint(0, 0), worldPoint(10, 0), worldPoint(10, 10)],
      vp
    );
    const line = new Konva.Line({
      ...props,
      stroke: 'red',
      strokeWidth: 15,
    });

    layer.add(line);
    layer.draw();

    expect(line.closed()).toBe(false);
    expect(line.points()).toEqual([0, 0, 10, 0, 10, 10]);

    harness.destroy();
  });

  it('renders a polygon via closed konva line props', () => {
    const harness = createStageHarness();
    const layer = new Konva.Layer();
    harness.stage.add(layer);

    const vp = viewport(screenPoint(0, 0), 1);
    const props = worldPolygonToKonvaLineProps(
      [worldPoint(0, 0), worldPoint(10, 0), worldPoint(5, 5)],
      vp,
    );
    const line = new Konva.Line(props);

    layer.add(line);
    layer.draw();

    expect(line.closed()).toBe(true);
    expect(line.points()).toEqual([0, 0, 10, 0, 5, 5]);

    harness.destroy();
  });

  it('renders sampled arc points as konva line', () => {
    const harness = createStageHarness();
    const layer = new Konva.Layer();
    harness.stage.add(layer);

    const arc = Arc.fromCenter(Point.make(100, 100), 50, 0, degToRad(90));
    const sampled = sampleSectionArcToWorldPoints(arc, { segments: 8 });
    const vp = viewport(screenPoint(0, 0), 1);
    const line = new Konva.Line({
      ...worldPolylineToKonvaLineProps(sampled, vp),
      stroke: 'blue',
      strokeWidth: 15,
    });

    layer.add(line);
    layer.draw();

    expect(line.points().length).toBeGreaterThanOrEqual(6);

    harness.destroy();
  });

  it('reads pointer from stage and maps back to world', () => {
    const harness = createStageHarness();
    const vp = viewport(screenPoint(0, 0), 2);

    vi.spyOn(harness.stage, 'getPointerPosition').mockReturnValue({ x: 20, y: 30 });

    expect(getStagePointerWorld(harness.stage, vp)).toEqual({ u: 10, v: 15 });

    harness.destroy();
  });

  it('supports null pointer from stage', () => {
    const harness = createStageHarness();
    const vp = viewport(screenPoint(0, 0), 2);

    vi.spyOn(harness.stage, 'getPointerPosition').mockReturnValue(null);

    expect(getStagePointerWorld(harness.stage, vp)).toBeNull();

    harness.destroy();
  });

  it('allows verifying zoom and pan flow at integration level', () => {
    const vp = viewport(screenPoint(100, 100), 1);
    const anchor = screenPoint(120, 140);

    const panned = panViewport(vp, 10, -20);
    const zoomed = zoomViewportAt(panned, 2, anchor);

    expect(zoomed.scale).toBe(2);
  });

  it('emits no console errors during setup and draw', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const harness = createStageHarness();
    const layer = new Konva.Layer();
    harness.stage.add(layer);
    layer.add(new Konva.Line({ points: [0, 0, 10, 10] }));
    layer.draw();

    expect(consoleErrorSpy).not.toHaveBeenCalled();

    harness.destroy();
  });
});
