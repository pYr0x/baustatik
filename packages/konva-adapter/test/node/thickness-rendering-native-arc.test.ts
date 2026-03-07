import { describe, expect, it } from 'vitest';

import type { Viewport } from '@baustatik/render-core';
import { screenPoint, viewport } from '@baustatik/render-core';
import { Arc, Line, Point } from '@baustatik/section-geometry';

import {
  arcWithThicknessToKonvaLineProps,
  arcWithThicknessToKonvaShapeSpec,
  arcWithThicknessToNativeKonvaArcProps,
  lineWithThicknessToKonvaShapeSpec,
} from '../../src/thickness-rendering';

describe('native arc thickness rendering API (phase 1 contracts)', () => {
  it('keeps sampled-line arc props contract unchanged', () => {
    const item = {
      axis: Arc.fromCenter(Point.make(0, 0), 20, 0, Math.PI / 2),
      thickness: 5,
    } as const;
    const vp = viewport(screenPoint(0, 0), 3);

    const props = arcWithThicknessToKonvaLineProps(item, vp, { segments: 8 });

    expect(props.points.length).toBeGreaterThanOrEqual(6);
    expect(props.strokeWidth).toBe(15);
    expect(props.lineCap).toBe('butt');
    expect(props.lineJoin).toBe('miter');
  });

  it('maps native arc center and radii to screen space', () => {
    const item = {
      axis: Arc.fromCenter(Point.make(10, 20), 8, 0, Math.PI / 2),
      thickness: 4,
    } as const;
    const vp = viewport(screenPoint(100, 200), 2);

    const props = arcWithThicknessToNativeKonvaArcProps(item, vp);

    expect(props.x).toBe(120);
    expect(props.y).toBe(240);
    expect(props.innerRadius).toBe(12);
    expect(props.outerRadius).toBe(20);
    expect(props.outerRadius - props.innerRadius).toBe(8);
    expect(props.angle).toBeGreaterThan(0);
    expect(props.angle).toBeCloseTo(270, 10);
    expect(props.rotation).toBeCloseTo(0, 10);
    expect(props.clockwise).toBe(true);
  });

  it('throws if thickness collapses or exceeds inner radius', () => {
    const item = {
      axis: Arc.fromCenter(Point.make(0, 0), 2, 0, Math.PI / 2),
      thickness: 4,
    } as const;
    const vp = viewport(screenPoint(0, 0), 1);

    expect(() => arcWithThicknessToNativeKonvaArcProps(item, vp)).toThrow();
  });

  it('throws for invalid viewport scale', () => {
    const item = {
      axis: Arc.fromCenter(Point.make(0, 0), 4, 0, Math.PI / 2),
      thickness: 1,
    } as const;
    const invalidViewport = {
      origin: screenPoint(0, 0),
      scale: 0,
    } as unknown as Viewport;

    expect(() =>
      arcWithThicknessToNativeKonvaArcProps(item, invalidViewport),
    ).toThrow();
  });

  it('dispatches sampled-line mode to Konva.Line spec', () => {
    const item = {
      axis: Arc.fromCenter(Point.make(0, 0), 20, 0, Math.PI / 2),
      thickness: 5,
    } as const;
    const vp = viewport(screenPoint(0, 0), 1);

    const spec = arcWithThicknessToKonvaShapeSpec(item, vp, {
      renderMode: 'sampled-line',
      sampling: { segments: 8 },
    });

    expect(spec.shapeType).toBe('Line');
    if (spec.shapeType === 'Line') {
      expect(spec.props.strokeWidth).toBe(5);
      expect(spec.props.points.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('dispatches native-arc mode to Konva.Arc spec', () => {
    const item = {
      axis: Arc.fromCenter(Point.make(10, 20), 8, 0, Math.PI / 2),
      thickness: 4,
    } as const;
    const vp = viewport(screenPoint(0, 0), 2);

    const spec = arcWithThicknessToKonvaShapeSpec(item, vp, {
      renderMode: 'native-arc',
    });

    expect(spec.shapeType).toBe('Arc');
    if (spec.shapeType === 'Arc') {
      expect(spec.props.outerRadius - spec.props.innerRadius).toBe(8);
    }
  });

  it('uses sampled-line as default dispatcher mode', () => {
    const item = {
      axis: Arc.fromCenter(Point.make(0, 0), 20, 0, Math.PI / 2),
      thickness: 5,
    } as const;
    const vp = viewport(screenPoint(0, 0), 1);

    const spec = arcWithThicknessToKonvaShapeSpec(item, vp);

    expect(spec.shapeType).toBe('Line');
  });

  it('returns Line shape spec for thick lines', () => {
    const item = {
      axis: Line.make(Point.make(0, 0), Point.make(0, 10)),
      thickness: 3,
    } as const;
    const vp = viewport(screenPoint(0, 0), 2);

    const spec = lineWithThicknessToKonvaShapeSpec(item, vp);

    expect(spec.shapeType).toBe('Line');
    expect(spec.props.strokeWidth).toBe(6);
    expect(spec.props.points.length).toBe(4);
  });
});
