import type {
  CircleSpec,
  LineSpec,
  PolygonSpec,
  RectangleSpec,
  TriangleSpec,
} from '@baustatik/render-core';
import { describe, expect, it } from 'vitest';
import {
  circleConfig,
  lineConfig,
  polygonConfig,
  rectangleConfig,
  triangleConfig,
} from '../../src/primitives';

// Exakte toEqual-Vergleiche statt toMatchObject: der Patch-Pfad schickt genau
// diese Objekte durch setAttrs, deshalb muss ein weggefallenes ODER ein
// zusaetzliches Feld auffallen — nicht nur die erwarteten Treffer.

describe('lineConfig()', () => {
  const spec: LineSpec = {
    id: 'l1',
    kind: 'line',
    from: { u: 0, v: 0 },
    to: { u: 10, v: 4 },
    strokeColor: 'black',
    strokeWidth: 2,
  };

  it('maps the full spec to a Konva line config', () => {
    expect(lineConfig(spec)).toEqual({
      id: 'l1',
      points: [0, 0, 10, 4],
      stroke: 'black',
      strokeWidth: 2,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('carries strokeStyle through as a dash pattern', () => {
    expect(lineConfig({ ...spec, strokeStyle: 'dashed' }).dash).toEqual([8, 4]);
  });
});

describe('circleConfig()', () => {
  const spec: CircleSpec = {
    id: 'c1',
    kind: 'circle',
    center: { u: 5, v: 6 },
    radius: 3,
    fillColor: 'blue',
  };

  it('maps the full spec to a Konva circle config', () => {
    expect(circleConfig(spec)).toEqual({
      id: 'c1',
      x: 5,
      y: 6,
      radius: 3,
      fill: 'blue',
      stroke: undefined,
      strokeWidth: undefined,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });
});

describe('polygonConfig()', () => {
  const spec: PolygonSpec = {
    id: 'p1',
    kind: 'polygon',
    points: [
      { u: 0, v: 0 },
      { u: 10, v: 0 },
      { u: 5, v: 5 },
    ],
    closed: true,
    fillColor: 'green',
  };

  it('maps the full spec to a Konva line config', () => {
    expect(polygonConfig(spec)).toEqual({
      id: 'p1',
      points: [0, 0, 10, 0, 5, 5],
      closed: true,
      fill: 'green',
      stroke: undefined,
      strokeWidth: undefined,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });
});

describe('rectangleConfig()', () => {
  const spec: RectangleSpec = {
    id: 'r1',
    kind: 'rectangle',
    topLeft: { u: 2, v: 3 },
    width: 20,
    height: 10,
    cornerRadius: [1, 2, 3, 4],
    fillColor: 'orange',
  };

  it('maps the full spec to a Konva rect config', () => {
    expect(rectangleConfig(spec)).toEqual({
      id: 'r1',
      x: 2,
      y: 3,
      width: 20,
      height: 10,
      cornerRadius: [1, 2, 3, 4],
      fill: 'orange',
      stroke: undefined,
      strokeWidth: undefined,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('leaves cornerRadius undefined when the spec omits it', () => {
    const { cornerRadius, ...rest } = spec;
    expect(rectangleConfig(rest).cornerRadius).toBeUndefined();
  });
});

describe('triangleConfig()', () => {
  const spec: TriangleSpec = {
    id: 't1',
    kind: 'triangle',
    center: { u: 0, v: 0 },
    sideLength: 6,
    fillColor: 'red',
  };

  it('maps the full spec to a 3-sided regular polygon config', () => {
    expect(triangleConfig(spec)).toEqual({
      id: 't1',
      x: 0,
      y: 0,
      sides: 3,
      // Umkreisradius R = a / sqrt(3) fuer ein gleichseitiges Dreieck.
      radius: 6 / Math.sqrt(3),
      fill: 'red',
      stroke: undefined,
      strokeWidth: undefined,
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('derives the circumradius R = a / sqrt(3) from sideLength', () => {
    expect(triangleConfig(spec).radius).toBeCloseTo(6 / Math.sqrt(3), 10);
    expect(triangleConfig({ ...spec, sideLength: 12 }).radius).toBeCloseTo(
      12 / Math.sqrt(3),
      10,
    );
  });
});
