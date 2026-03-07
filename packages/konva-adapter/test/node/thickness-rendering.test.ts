import { describe, expect, it } from 'vitest';

import { screenPoint, viewport } from '@baustatik/render-core';
import { Arc, Line, Point } from '@baustatik/section-geometry';

import {
  arcWithThicknessToKonvaLineProps,
  lineWithThicknessToKonvaLineProps,
} from '../../src/thickness-rendering';

describe('thickness rendering wrappers', () => {
  it('renders a line with strokeWidth from thickness', () => {
    const item = {
      axis: Line.make(Point.make(0, 0), Point.make(0, 10)),
      thickness: 10,
    } as const;
    const vp = viewport(screenPoint(0, 0), 1);

    const props = lineWithThicknessToKonvaLineProps(item, vp);

    expect(props.strokeWidth).toBe(10);
    expect(props.points.length).toBeGreaterThanOrEqual(4);
    expect(props.lineCap).toBe('butt');
    expect(props.lineJoin).toBe('miter');
  });

  it('renders an arc polyline with thickness strokeWidth', () => {
    const item = {
      axis: Arc.fromCenter(Point.make(0, 0), 20, 0, Math.PI / 2),
      thickness: 5,
    } as const;
    const vp = viewport(screenPoint(0, 0), 1);

    const props = arcWithThicknessToKonvaLineProps(item, vp, { segments: 8 });

    expect(props.points.length).toBeGreaterThanOrEqual(6);
    expect(props.strokeWidth).toBe(5);
    expect(props.lineCap).toBe('butt');
    expect(props.lineJoin).toBe('miter');
  });

  it('scales strokeWidth with viewport scale', () => {
    const item = {
      axis: Line.make(Point.make(0, 0), Point.make(0, 10)),
      thickness: 3,
    } as const;
    const vp = viewport(screenPoint(0, 0), 2);

    const props = lineWithThicknessToKonvaLineProps(item, vp);

    expect(props.strokeWidth).toBe(6);
  });
});
