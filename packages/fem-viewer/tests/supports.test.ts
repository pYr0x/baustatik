import { describe, expect, it } from 'vitest';
import type { NodeSupport } from '@baustatik/fem';
import { UnsupportedSupportError } from '../src/errors';
import { supportSpec } from '../src/supports';

describe('supportSpec & symbolDefinition', () => {
  const baseOptions = {
    position: { x: 10, z: 20 },
    scale: 2,
    color: '#ff0000',
  };

  it('handles pinned support (ux fixed, uz fixed, phiY free)', () => {
    const support: NodeSupport = {
      id: 'supp-1',
      nodeId: 'node-1',
      ux: 'fixed',
      uz: 'fixed',
      phiY: 'free',
    };
    const spec = supportSpec({ support, ...baseOptions });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 3.5 }); // (10 * 0.7) / scale
    expect(spec.children.map((c) => c.kind)).toEqual(['circle', 'polygon']);
  });

  it('handles roller support X (ux fixed, uz free, phiY free)', () => {
    const support: NodeSupport = {
      id: 'supp-2',
      nodeId: 'node-1',
      ux: 'fixed',
      uz: 'free',
      phiY: 'free',
    };
    const spec = supportSpec({ support, ...baseOptions });
    expect(spec.rotationDeg).toBe(90);
    expect(spec.translation).toEqual({ u: 0, v: 3.5 });
    expect(spec.children.map((c) => c.kind)).toEqual(['circle', 'polygon', 'line']);
  });

  it('handles roller support Z (ux free, uz fixed, phiY free)', () => {
    const support: NodeSupport = {
      id: 'supp-3',
      nodeId: 'node-1',
      ux: 'free',
      uz: 'fixed',
      phiY: 'free',
    };
    const spec = supportSpec({ support, ...baseOptions });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 3.5 });
    expect(spec.children.map((c) => c.kind)).toEqual(['circle', 'polygon', 'line']);
  });

  it('handles fully free support with phiY free (ux free, uz free, phiY free)', () => {
    const support: NodeSupport = {
      id: 'supp-4',
      nodeId: 'node-1',
      ux: 'free',
      uz: 'free',
      phiY: 'free',
    };
    const spec = supportSpec({ support, ...baseOptions });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 3.5 });
    expect(spec.children).toEqual([]);
  });

  it('handles fixed support (ux fixed, uz fixed, phiY fixed)', () => {
    const support: NodeSupport = {
      id: 'supp-5',
      nodeId: 'node-1',
      ux: 'fixed',
      uz: 'fixed',
      phiY: 'fixed',
    };
    const spec = supportSpec({ support, ...baseOptions });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 1.75 }); // (5 * 0.7) / scale
    expect(spec.children.map((c) => c.kind)).toEqual(['line']);
  });

  it('handles fixed roller support Z (ux free, uz fixed, phiY fixed)', () => {
    const support: NodeSupport = {
      id: 'supp-6',
      nodeId: 'node-1',
      ux: 'free',
      uz: 'fixed',
      phiY: 'fixed',
    };
    const spec = supportSpec({ support, ...baseOptions });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 1.75 });
    expect(spec.children.map((c) => c.kind)).toEqual(['line', 'line']);
  });

  it('handles fixed roller support X (ux fixed, uz free, phiY fixed)', () => {
    const support: NodeSupport = {
      id: 'supp-7',
      nodeId: 'node-1',
      ux: 'fixed',
      uz: 'free',
      phiY: 'fixed',
    };
    const spec = supportSpec({ support, ...baseOptions });
    expect(spec.rotationDeg).toBe(90);
    expect(spec.translation).toEqual({ u: 0, v: 1.75 });
    expect(spec.children.map((c) => c.kind)).toEqual(['line', 'line']);
  });

  it('handles fully fixed rotation with free translations (ux free, uz free, phiY fixed)', () => {
    const support: NodeSupport = {
      id: 'supp-8',
      nodeId: 'node-1',
      ux: 'free',
      uz: 'free',
      phiY: 'fixed',
    };
    const spec = supportSpec({ support, ...baseOptions });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 0 });
    expect(spec.children.map((c) => c.kind)).toEqual([
      'rectangle',
      'line',
      'line',
      'line',
      'line',
      'line',
    ]);
  });

  it('throws UnsupportedSupportError for invalid support values', () => {
    const support = {
      id: 'invalid-supp',
      nodeId: 'node-1',
      ux: 'invalid',
      uz: 'fixed',
      phiY: 'fixed',
    } as unknown as NodeSupport;
    expect(() => supportSpec({ support, ...baseOptions })).toThrow(UnsupportedSupportError);
  });
});
