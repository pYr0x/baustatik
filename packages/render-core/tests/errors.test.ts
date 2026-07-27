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

  it('passes validation for a valid arrow and label', () => {
    expect(() => validateSpec({
      id: 'a1',
      kind: 'arrow',
      tail: { u: 0, v: 0 },
      tip: { u: 0, v: 10 },
      pointerLength: 4,
      pointerWidth: 3,
      strokeColor: '#1d4ed8',
      strokeWidth: 2,
      fillColor: '#1d4ed8',
    })).not.toThrow();

    expect(() => validateSpec({
      id: 'lb1',
      kind: 'label',
      text: '10 kN',
      anchor: { u: 0, v: 0 },
      direction: { u: 0, v: -1 },
      gap: 6,
      fontSize: 12,
      fontFamily: 'sans-serif',
      textColor: '#1d4ed8',
      padding: 3,
      backgroundColor: '#dbeafe',
      borderColor: '#1d4ed8',
      borderWidth: 1,
      cornerRadius: 3,
    })).not.toThrow();
  });

  it('throws InvalidSpecError for non-positive arrow pointer dimensions', () => {
    const arrow = {
      id: 'a1',
      kind: 'arrow' as const,
      tail: { u: 0, v: 0 },
      tip: { u: 0, v: 10 },
      pointerLength: 4,
      pointerWidth: 3,
    };

    expect(() => validateSpec({ ...arrow, pointerLength: 0 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...arrow, pointerWidth: -1 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...arrow, pointerLength: NaN })).toThrow(InvalidSpecError);
  });

  it('throws InvalidWorldPointError for a non-finite arrow tip', () => {
    expect(() => validateSpec({
      id: 'a1',
      kind: 'arrow',
      tail: { u: 0, v: 0 },
      tip: { u: NaN, v: 10 },
      pointerLength: 4,
      pointerWidth: 3,
    })).toThrow(InvalidWorldPointError);
  });

  it('throws InvalidSpecError for a degenerate arc', () => {
    const arc = {
      id: 'ar1',
      kind: 'arcPath' as const,
      center: { u: 0, v: 0 },
      radius: 5,
      startAngle: 0,
      sweepAngle: Math.PI,
    };

    expect(() => validateSpec(arc)).not.toThrow();
    expect(() => validateSpec({ ...arc, radius: 0 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...arc, startAngle: NaN })).toThrow(InvalidSpecError);
    // Beide Grenzen sind zeichnerisch: ein Umlauf von 0 zeichnet nichts, und
    // ein voller Umlauf faellt mit seinem eigenen Anfang zusammen. Fuer den
    // gibt es `circle`.
    expect(() => validateSpec({ ...arc, sweepAngle: 0 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...arc, sweepAngle: 2 * Math.PI })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...arc, sweepAngle: -3 * Math.PI })).toThrow(InvalidSpecError);
  });

  it('throws InvalidSpecError for invalid label fields', () => {
    const label = {
      id: 'lb1',
      kind: 'label' as const,
      text: '10 kN',
      anchor: { u: 0, v: 0 },
      direction: { u: 0, v: -1 },
      gap: 6,
      fontSize: 12,
      fontFamily: 'sans-serif',
      textColor: '#000',
      padding: 3,
      backgroundColor: '#fff',
    };

    expect(() => validateSpec({ ...label, text: '  ' })).toThrow(InvalidSpecError);
    // Der Nullvektor waehlt keine Seite — der Adapter koennte die Box
    // nirgendwo hinlegen.
    expect(() => validateSpec({ ...label, direction: { u: 0, v: 0 } })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, gap: -1 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, fontSize: 0 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, padding: NaN })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, fontFamily: '' })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, textColor: '' })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, backgroundColor: '   ' })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, borderColor: '' })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, borderWidth: -1 })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, cornerRadius: NaN })).toThrow(InvalidSpecError);
    expect(() => validateSpec({ ...label, anchor: { u: Infinity, v: 0 } })).toThrow(InvalidWorldPointError);
  });

  it('rejects a label inside a group, like a nested group', () => {
    // Konva.Label IST eine Group: als Kind entstuende der verschachtelte Baum,
    // den der Adapter ausdruecklich nicht unterstuetzt.
    expect(() => validateSpec({
      id: 'group',
      kind: 'group',
      position: { u: 0, v: 0 },
      translation: { u: 0, v: 0 },
      children: [{
        id: 'child',
        kind: 'label',
        text: '10 kN',
        anchor: { u: 0, v: 0 },
        direction: { u: 0, v: -1 },
        gap: 6,
        fontSize: 12,
        fontFamily: 'sans-serif',
        textColor: '#000',
        padding: 3,
        backgroundColor: '#fff',
      } as any],
    })).toThrow(InvalidSpecError);
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

  it('checks arrow and label ids for uniqueness alongside the other kinds', () => {
    const specs = [
      {
        id: 'x',
        kind: 'arrow' as const,
        tail: { u: 0, v: 0 },
        tip: { u: 0, v: 10 },
        pointerLength: 4,
        pointerWidth: 3,
      },
      {
        id: 'x',
        kind: 'label' as const,
        text: '10 kN',
        anchor: { u: 0, v: 0 },
        direction: { u: 0, v: -1 },
        gap: 6,
        fontSize: 12,
        fontFamily: 'sans-serif',
        textColor: '#000',
        padding: 3,
        backgroundColor: '#fff',
      },
    ];

    expect(() => validateSpecs(specs)).toThrow(DuplicateSpecIdError);
    expect(() => validateSpecs([specs[0], { ...specs[1], id: 'y' }])).not.toThrow();
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
