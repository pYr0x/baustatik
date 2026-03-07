import Konva from 'konva';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { degToRad } from '@baustatik/core';
import { screenPoint, viewport } from '@baustatik/render-core';
import { Arc, Point } from '@baustatik/section-geometry';

import { arcWithThicknessToKonvaShapeSpec } from '../../src/thickness-rendering';
import { createStageHarness } from './harness';

describe('thickness rendering browser integration (phase 1 contracts)', () => {
  afterEach(() => {
    // document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('renders sampled arc as Konva.Line and has a client rect', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const harness = createStageHarness();
    const layer = new Konva.Layer();
    harness.stage.add(layer);

    const item = {
      axis: Arc.fromCenter(Point.make(100, 100), 30, 0, Math.PI / 2),
      thickness: 8,
    } as const;
    const vp = viewport(screenPoint(0, 0), 1);
    const spec = arcWithThicknessToKonvaShapeSpec(item, vp, {
      renderMode: 'sampled-line',
      sampling: { segments: 8 },
    });

    expect(spec.shapeType).toBe('Line');
    if (spec.shapeType === 'Line') {
      const line = new Konva.Line({
        ...spec.props,
        stroke: 'black',
      });
      layer.add(line);
      layer.draw();

      const rect = line.getClientRect();
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    harness.destroy();
  });

  it('renders native arc as Konva.Arc and has a client rect', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const harness = createStageHarness();
    const layer = new Konva.Layer();
    harness.stage.add(layer);

    const item = {
      axis: Arc.fromCenter(Point.make(100, 100), 30, 0, degToRad(45)),
      thickness: 8,
    } as const;
    const vp = viewport(screenPoint(0, 0), 1);
    const spec = arcWithThicknessToKonvaShapeSpec(item, vp, {
      renderMode: 'native-arc',
    });

    expect(spec.shapeType).toBe('Arc');
    if (spec.shapeType === 'Arc') {
      const arc = new Konva.Arc({
        ...spec.props,
        fill: 'black',
      });
      layer.add(arc);
      layer.draw();

      const rect = arc.getClientRect();
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    }

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    // harness.destroy();
  });

  it('default dispatcher result is directly renderable', () => {
    const harness = createStageHarness();
    const layer = new Konva.Layer();
    harness.stage.add(layer);

    const item = {
      axis: Arc.fromCenter(Point.make(100, 100), 30, 0, Math.PI / 2),
      thickness: 8,
    } as const;
    const vp = viewport(screenPoint(0, 0), 1);
    const spec = arcWithThicknessToKonvaShapeSpec(item, vp);

    if (spec.shapeType === 'Line') {
      const line = new Konva.Line({
        ...spec.props,
        stroke: 'black',
      });
      layer.add(line);
      layer.draw();
      expect(line.getClientRect().width).toBeGreaterThan(0);
    } else {
      const arc = new Konva.Arc({
        ...spec.props,
        fill: 'black',
      });
      layer.add(arc);
      layer.draw();
      expect(arc.getClientRect().width).toBeGreaterThan(0);
    }

    // harness.destroy();
  });
});
