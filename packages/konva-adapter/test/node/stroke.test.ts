import { describe, expect, it } from 'vitest';
import { DASH_PATTERNS, strokeConfig } from '../../src/stroke';

describe('DASH_PATTERNS', () => {
  it('maps solid to no dash', () => {
    expect(DASH_PATTERNS.solid).toBeUndefined();
  });

  it('maps dashed and dotted to screen-pixel patterns', () => {
    expect(DASH_PATTERNS.dashed).toEqual([8, 4]);
    expect(DASH_PATTERNS.dotted).toEqual([1, 3]);
  });
});

describe('strokeConfig()', () => {
  it('always disables stroke scaling', () => {
    expect(strokeConfig({}).strokeScaleEnabled).toBe(false);
  });

  it('passes stroke color and width through', () => {
    expect(strokeConfig({ strokeColor: 'red', strokeWidth: 3 })).toMatchObject({
      stroke: 'red',
      strokeWidth: 3,
    });
  });

  it('defaults an unset strokeStyle to solid (no dash)', () => {
    expect(strokeConfig({}).dash).toBeUndefined();
  });

  it('translates strokeStyle to a dash array', () => {
    expect(strokeConfig({ strokeStyle: 'dashed' }).dash).toEqual([8, 4]);
    expect(strokeConfig({ strokeStyle: 'dotted' }).dash).toEqual([1, 3]);
  });

  it('emits a fresh dash array, decoupled from DASH_PATTERNS', () => {
    const cfg = strokeConfig({ strokeStyle: 'dashed' });
    expect(cfg.dash).not.toBe(DASH_PATTERNS.dashed);
  });

  it('reports undefined for unset color/width so a patch can reset them', () => {
    const cfg = strokeConfig({});
    expect(cfg.stroke).toBeUndefined();
    expect(cfg.strokeWidth).toBeUndefined();
  });
});
