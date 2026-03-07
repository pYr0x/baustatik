import { describe, expect, it } from 'vitest';

import { Arc, Point } from '@baustatik/section-geometry';

import { sampleSectionArcToWorldPoints } from '../../src/arc-sampling';

describe('sampleSectionArcToWorldPoints', () => {
  it('samples a quarter circle including start and end points', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 2, 0, Math.PI / 2);

    const sampled = sampleSectionArcToWorldPoints(arc, { segments: 4 });

    expect(sampled[0]).toEqual({ u: 2, v: 0 });
    expect(sampled[sampled.length - 1]).toEqual({ u: 0, v: -2 });
  });

  it('samples a semicircle in traversal order', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI);

    const sampled = sampleSectionArcToWorldPoints(arc, { segments: 8 });

    expect(sampled.length).toBeGreaterThanOrEqual(3);
    expect(sampled[0]).toEqual({ u: 1, v: 0 });
    expect(sampled[sampled.length - 1]).toEqual({ u: -1, v: 0 });
  });

  it('uses deterministic default options', () => {
    const arc = Arc.fromCenter(Point.make(3, 4), 5, 0, Math.PI / 3);

    expect(sampleSectionArcToWorldPoints(arc)).toEqual(
      sampleSectionArcToWorldPoints(arc),
    );
  });

  it('supports explicit segment count', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 3, 0, Math.PI / 2);

    const sampled = sampleSectionArcToWorldPoints(arc, { segments: 6 });

    expect(sampled.length).toBe(7);
  });

  it('rejects invalid options', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 3, 0, Math.PI / 2);

    expect(() => sampleSectionArcToWorldPoints(arc, { segments: 0 })).toThrow();
    expect(() => sampleSectionArcToWorldPoints(arc, { segments: -4 })).toThrow();
    expect(() =>
      sampleSectionArcToWorldPoints(arc, {
        segments: 4,
        maxChordLength: 0,
      }),
    ).toThrow();
  });

  it('does not mutate arc input', () => {
    const arc = Object.freeze(Arc.fromCenter(Point.make(0, 0), 2, 0, Math.PI / 4));
    const before = structuredClone(arc);

    expect(() => sampleSectionArcToWorldPoints(arc)).not.toThrow();
    expect(arc).toEqual(before);
  });
});
