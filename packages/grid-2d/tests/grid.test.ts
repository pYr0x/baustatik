import { describe, expect, it } from 'vitest';

import { pan, screenPoint, size, viewport } from '@baustatik/viewport-2d';
import { validateSpecs } from '@baustatik/render-core';

import {
  gridSpecs,
  InvalidGridOptionsError,
  InvalidGridSpacingError,
} from '../src/index';

// Identitaets-Viewport: Weltausschnitt = 0..100 x 0..100.
const vp100 = viewport(screenPoint(0, 0), 1);
const size100 = size(100, 100);

describe('gridSpecs: Linienberechnung', () => {
  it('computes vertical and horizontal lines at spacing multiples', () => {
    const specs = gridSpecs(vp100, size100, { spacing: 10, showAxes: false });

    const vertical = specs.filter((s) => s.id.startsWith('grid:v:'));
    const horizontal = specs.filter((s) => s.id.startsWith('grid:h:'));

    // u,v in {0, 10, ..., 100} -> je 11 Linien
    expect(vertical).toHaveLength(11);
    expect(horizontal).toHaveLength(11);

    expect(vertical.map((s) => s.from.u)).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
    ]);
  });

  it('lines span the full visible bounds', () => {
    const specs = gridSpecs(vp100, size100, { spacing: 10, showAxes: false });
    const line = specs.find((s) => s.id === 'grid:v:5');

    expect(line).toBeDefined();
    expect(line!.from).toEqual({ u: 50, v: 0 });
    expect(line!.to).toEqual({ u: 50, v: 100 });
  });

  it('keeps ids stable across pan', () => {
    const before = gridSpecs(vp100, size100, { spacing: 10 });
    const after = gridSpecs(pan(vp100, 3, 7), size100, { spacing: 10 });

    // Linie bei u = 50 traegt in beiden Frames dieselbe ID.
    const beforeLine = before.find((s) => s.id === 'grid:v:5');
    const afterLine = after.find((s) => s.id === 'grid:v:5');

    expect(beforeLine!.from.u).toBe(50);
    expect(afterLine!.from.u).toBe(50);

    // Gemeinsame Weltlinien -> gemeinsame IDs.
    const beforeIds = new Set(before.map((s) => s.id));
    const commonIds = after.filter((s) => beforeIds.has(s.id));
    expect(commonIds.length).toBeGreaterThan(0);
  });
});

describe('gridSpecs: Achsen', () => {
  it('draws axes when the origin is visible and skips the k=0 grid lines', () => {
    // Ursprung in der Bildmitte.
    const vp = viewport(screenPoint(50, 50), 1);
    const specs = gridSpecs(vp, size100, { spacing: 10 });
    const ids = specs.map((s) => s.id);

    expect(ids).toContain('grid:axis:u');
    expect(ids).toContain('grid:axis:v');
    expect(ids).not.toContain('grid:v:0');
    expect(ids).not.toContain('grid:h:0');

    // Achsen liegen am Ende (innerhalb des Grids obenauf).
    expect(ids[ids.length - 2]).toBe('grid:axis:v');
    expect(ids[ids.length - 1]).toBe('grid:axis:u');
  });

  it('omits axes when the origin is out of view', () => {
    // Weit weggepannt: Weltausschnitt 1000..1100.
    const vp = viewport(screenPoint(-1000, -1000), 1);
    const specs = gridSpecs(vp, size100, { spacing: 10 });
    const ids = specs.map((s) => s.id);

    expect(ids).not.toContain('grid:axis:u');
    expect(ids).not.toContain('grid:axis:v');
  });

  it('showAxes false renders k=0 as a plain grid line', () => {
    const vp = viewport(screenPoint(50, 50), 1);
    const specs = gridSpecs(vp, size100, { spacing: 10, showAxes: false });
    const ids = specs.map((s) => s.id);

    expect(ids).toContain('grid:v:0');
    expect(ids).toContain('grid:h:0');
    expect(ids).not.toContain('grid:axis:u');
    expect(ids).not.toContain('grid:axis:v');
  });
});

describe('gridSpecs: Validierung', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'throws InvalidGridSpacingError for spacing %s',
    (spacing) => {
      expect(() => gridSpecs(vp100, size100, { spacing })).toThrow(
        InvalidGridSpacingError,
      );
    },
  );

  it('throws InvalidGridOptionsError for invalid maxLines', () => {
    expect(() =>
      gridSpecs(vp100, size100, { spacing: 10, maxLines: 0 }),
    ).toThrow(InvalidGridOptionsError);
    expect(() =>
      gridSpecs(vp100, size100, { spacing: 10, maxLines: 1.5 }),
    ).toThrow(InvalidGridOptionsError);
  });

  it('throws InvalidGridOptionsError for negative strokeWidth', () => {
    expect(() =>
      gridSpecs(vp100, size100, {
        spacing: 10,
        gridStyle: { strokeWidth: -1 },
      }),
    ).toThrow(InvalidGridOptionsError);
  });
});

describe('gridSpecs: Safeguard', () => {
  it('returns only the axes when the line count exceeds maxLines', () => {
    const vp = viewport(screenPoint(50, 50), 1);
    const specs = gridSpecs(vp, size100, { spacing: 0.001, maxLines: 100 });

    expect(specs.map((s) => s.id).sort()).toEqual([
      'grid:axis:u',
      'grid:axis:v',
    ]);
  });

  it('returns nothing when maxLines is exceeded and axes are hidden', () => {
    const specs = gridSpecs(vp100, size100, {
      spacing: 0.001,
      maxLines: 100,
      showAxes: false,
    });

    expect(specs).toHaveLength(0);
  });
});

describe('gridSpecs: Specs-Qualitaet', () => {
  it('produces unique, valid specs (render-core validateSpecs)', () => {
    const vp = viewport(screenPoint(50, 50), 1);

    expect(() =>
      validateSpecs(gridSpecs(vp, size100, { spacing: 10 })),
    ).not.toThrow();
    expect(() =>
      validateSpecs(gridSpecs(vp100, size100, { spacing: 10, showAxes: false })),
    ).not.toThrow();
  });

  it('applies default styles', () => {
    const vp = viewport(screenPoint(50, 50), 1);
    const specs = gridSpecs(vp, size100, { spacing: 10 });

    const gridLine = specs.find((s) => s.id === 'grid:v:1');
    const axis = specs.find((s) => s.id === 'grid:axis:v');

    expect(gridLine!.strokeColor).toBe('#e0e0e0');
    expect(gridLine!.strokeWidth).toBe(1);
    expect(axis!.strokeColor).toBe('#8c8c8c');
    expect(axis!.strokeWidth).toBe(1.5);
  });

  it('custom styles override the defaults', () => {
    const vp = viewport(screenPoint(50, 50), 1);
    const specs = gridSpecs(vp, size100, {
      spacing: 10,
      gridStyle: { strokeColor: '#ff0000' },
      axisStyle: { strokeWidth: 3 },
    });

    const gridLine = specs.find((s) => s.id === 'grid:v:1');
    const axis = specs.find((s) => s.id === 'grid:axis:v');

    expect(gridLine!.strokeColor).toBe('#ff0000');
    expect(gridLine!.strokeWidth).toBe(1); // Default bleibt
    expect(axis!.strokeColor).toBe('#8c8c8c'); // Default bleibt
    expect(axis!.strokeWidth).toBe(3);
  });
});
