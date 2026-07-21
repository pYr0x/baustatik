import { describe, expect, it } from 'vitest';
import {
  validateSpec,
  validateSpecs,
  assertNever,
  InvalidSpecError,
  DuplicateSpecIdError,
  UnreachableCaseError
} from '../src';
import { InvalidWorldPointError } from '@baustatik/viewport-2d';

describe('render-core errors and validation', () => {
  it('passes validation for valid specifications', () => {
    // LineSpec
    expect(() => validateSpec({
      id: 'l1',
      kind: 'line',
      from: { u: 0, v: 0 },
      to: { u: 1, v: 1 },
      strokeWidth: 2,
      strokeColor: 'red',
      strokeStyle: 'dashed'
    })).not.toThrow();

    // CircleSpec
    expect(() => validateSpec({
      id: 'c1',
      kind: 'circle',
      center: { u: 0, v: 0 },
      radius: 10,
      fillColor: 'blue'
    })).not.toThrow();

    // PolygonSpec
    expect(() => validateSpec({
      id: 'p1',
      kind: 'polygon',
      points: [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: 1, v: 0 }],
      closed: true
    })).not.toThrow();

    // TriangleSpec
    expect(() => validateSpec({
      id: 't1',
      kind: 'triangle',
      center: { u: 0, v: 0 },
      sideLength: 5
    })).not.toThrow();

    // GroupSpec
    expect(() => validateSpec({
      id: 'g1',
      kind: 'group',
      position: { u: 100, v: 50 },
      translation: { u: 0, v: 10 },
      rotationDeg: 90,
      children: [{
        id: 'g1:c1',
        kind: 'circle',
        center: { u: 0, v: 0 },
        radius: 5,
      }],
    })).not.toThrow();
  });

  it('throws InvalidSpecError for invalid IDs', () => {
    expect(() => validateSpec(undefined as any)).toThrow(InvalidSpecError);
    expect(() => validateSpec({ id: '', kind: 'line', from: { u: 0, v: 0 }, to: { u: 1, v: 1 } })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ id: '  ', kind: 'circle', center: { u: 0, v: 0 }, radius: 10 })).toThrow(InvalidSpecError);
  });

  it('throws InvalidWorldPointError for NaN or infinite coordinates in LineSpec', () => {
    expect(() => validateSpec({ id: 'l1', kind: 'line', from: { u: NaN, v: 0 }, to: { u: 1, v: 1 } })).toThrow(InvalidWorldPointError);
    expect(() => validateSpec({ id: 'l2', kind: 'line', from: { u: 0, v: 0 }, to: { u: 1, v: Infinity } })).toThrow(InvalidWorldPointError);
    expect(() => validateSpec({ id: 'l3', kind: 'line', from: undefined as any, to: { u: 1, v: 1 } })).toThrow(InvalidSpecError);
  });

  it('throws InvalidSpecError for negative or non-finite Circle radius', () => {
    expect(() => validateSpec({ id: 'c1', kind: 'circle', center: { u: 0, v: 0 }, radius: -5 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ id: 'c2', kind: 'circle', center: { u: 0, v: 0 }, radius: NaN })).toThrow(InvalidSpecError);
  });

  it('throws InvalidSpecError for Polygon with invalid points', () => {
    // points is not an array
    expect(() => validateSpec({
      id: 'p1',
      kind: 'polygon',
      points: 'not-an-array' as any,
      closed: true
    })).toThrow(InvalidSpecError);

    // fewer than 3 points
    expect(() => validateSpec({
      id: 'p2',
      kind: 'polygon',
      points: [{ u: 0, v: 0 }, { u: 1, v: 1 }],
      closed: true
    })).toThrow(InvalidSpecError);

    // invalid point in points array
    expect(() => validateSpec({
      id: 'p3',
      kind: 'polygon',
      points: [{ u: 0, v: 0 }, { u: 1, v: 1 }, { u: NaN, v: 0 }],
      closed: true
    })).toThrow(InvalidWorldPointError);
  });

  it('throws InvalidSpecError for Triangle with non-positive side length', () => {
    expect(() => validateSpec({ id: 't1', kind: 'triangle', center: { u: 0, v: 0 }, sideLength: 0 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ id: 't2', kind: 'triangle', center: { u: 0, v: 0 }, sideLength: -1 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ id: 't3', kind: 'triangle', center: { u: 0, v: 0 }, sideLength: NaN })).toThrow(InvalidSpecError);
  });

  it('throws InvalidSpecError for invalid stroke and fill settings', () => {
    expect(() => validateSpec({
      id: 'l1',
      kind: 'line',
      from: { u: 0, v: 0 },
      to: { u: 1, v: 1 },
      strokeWidth: -1
    })).toThrow(InvalidSpecError);

    expect(() => validateSpec({
      id: 'l2',
      kind: 'line',
      from: { u: 0, v: 0 },
      to: { u: 1, v: 1 },
      strokeWidth: NaN
    })).toThrow(InvalidSpecError);

    expect(() => validateSpec({
      id: 'l3',
      kind: 'line',
      from: { u: 0, v: 0 },
      to: { u: 1, v: 1 },
      strokeColor: ''
    })).toThrow(InvalidSpecError);

    expect(() => validateSpec({
      id: 'c1',
      kind: 'circle',
      center: { u: 0, v: 0 },
      radius: 10,
      fillColor: '  '
    })).toThrow(InvalidSpecError);
  });

  it('validates a collection of specs', () => {
    const specs = [
      { id: '1', kind: 'line' as const, from: { u: 0, v: 0 }, to: { u: 1, v: 1 } },
      { id: '2', kind: 'circle' as const, center: { u: 2, v: 2 }, radius: 5 },
    ];
    expect(() => validateSpecs(specs)).not.toThrow();
  });

  it('throws DuplicateSpecIdError for duplicate IDs in validateSpecs', () => {
    const specs = [
      { id: '1', kind: 'line' as const, from: { u: 0, v: 0 }, to: { u: 1, v: 1 } },
      { id: '1', kind: 'circle' as const, center: { u: 2, v: 2 }, radius: 5 },
    ];
    expect(() => validateSpecs(specs)).toThrow(DuplicateSpecIdError);
  });

  it('checks IDs inside groups for global uniqueness', () => {
    const specs = [{
      id: 'group',
      kind: 'group' as const,
      position: { u: 0, v: 0 },
      translation: { u: 0, v: 10 },
      children: [
        { id: 'child', kind: 'circle' as const, center: { u: 0, v: 0 }, radius: 5 },
        { id: 'child', kind: 'circle' as const, center: { u: 0, v: 0 }, radius: 10 },
      ],
    }];

    expect(() => validateSpecs(specs)).toThrow(DuplicateSpecIdError);
  });

  it('rejects invalid group transforms', () => {
    expect(() => validateSpec({
      id: 'group',
      kind: 'group',
      position: { u: 0, v: 0 },
      translation: { u: 0, v: 10 },
      rotationDeg: Number.NaN,
      children: [{ id: 'child', kind: 'circle', center: { u: 0, v: 0 }, radius: 5 }],
    })).toThrow(InvalidSpecError);
  });

  it('rejects layers on group children', () => {
    expect(() => validateSpec({
      id: 'group',
      kind: 'group',
      position: { u: 0, v: 0 },
      translation: { u: 0, v: 10 },
      children: [{
        id: 'child',
        kind: 'circle',
        layer: 'nodes',
        center: { u: 0, v: 0 },
        radius: 5,
      }],
    })).toThrow(InvalidSpecError);
  });

  it('throws InvalidSpecError for non-array specs in validateSpecs', () => {
    expect(() => validateSpecs('not-an-array' as any)).toThrow(InvalidSpecError);
  });

  it('throws UnreachableCaseError in assertNever', () => {
    expect(() => assertNever('unknown' as never)).toThrow(UnreachableCaseError);
  });

  it('throws InvalidSpecError for unknown kinds at runtime', () => {
    expect(() => validateSpec({ id: 'unknown', kind: 'unknown' as any })).toThrow(InvalidSpecError);
  });
});
