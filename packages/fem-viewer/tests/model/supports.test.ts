import { describe, expect, it } from 'vitest';

import type { NodeSupport } from '@baustatik/fem';
import type { GroupSpec } from '@baustatik/render-core';

import { UnsupportedSupportError } from '../../src/errors';
import { supportSpec } from '../../src/model/support';
import { nodeA, specsOf, supportA, vp1, vp2 } from '../helpers';

// Welcher Auflagerfall welches Symbol bekommt. Geprueft werden die Bausteine
// (`children`) und wie das Symbol am Knoten haengt (Translation, Drehung) —
// nicht die einzelnen Koordinaten, die stehen in `support-symbols.ts`.
describe('Auflagerfall -> Symbol', () => {
  const baseOptions = {
    position: { x: 10, z: 20 },
    scale: 2,
    color: '#ff0000',
  };

  const support = (
    id: string,
    ux: NodeSupport['ux'],
    uz: NodeSupport['uz'],
    phiY: NodeSupport['phiY'],
  ): NodeSupport => ({ id, nodeId: 'node-1', ux, uz, phiY });

  it('festes Gelenklager (ux fixed, uz fixed, phiY free): Kreis und Dreieck', () => {
    const spec = supportSpec({
      support: support('supp-1', 'fixed', 'fixed', 'free'),
      ...baseOptions,
    });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 3.5 }); // (10 * 0.7) / scale
    expect(spec.children.map((c) => c.kind)).toEqual(['circle', 'polygon']);
  });

  it('Rollenlager quer (ux fixed, uz free, phiY free): dazu die Bahn, um 90 Grad gekippt', () => {
    const spec = supportSpec({
      support: support('supp-2', 'fixed', 'free', 'free'),
      ...baseOptions,
    });
    expect(spec.rotationDeg).toBe(90);
    expect(spec.translation).toEqual({ u: 0, v: 3.5 });
    expect(spec.children.map((c) => c.kind)).toEqual([
      'circle',
      'polygon',
      'line',
    ]);
  });

  it('Rollenlager laengs (ux free, uz fixed, phiY free): dieselbe Figur, ungedreht', () => {
    const spec = supportSpec({
      support: support('supp-3', 'free', 'fixed', 'free'),
      ...baseOptions,
    });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 3.5 });
    expect(spec.children.map((c) => c.kind)).toEqual([
      'circle',
      'polygon',
      'line',
    ]);
  });

  it('haelt nichts (alles free): kein Symbol, aber die Gruppe bleibt stehen', () => {
    const spec = supportSpec({
      support: support('supp-4', 'free', 'free', 'free'),
      ...baseOptions,
    });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 3.5 });
    expect(spec.children).toEqual([]);
  });

  it('Einspannung (alles fixed): nur der dicke Strich', () => {
    const spec = supportSpec({
      support: support('supp-5', 'fixed', 'fixed', 'fixed'),
      ...baseOptions,
    });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 1.75 }); // (5 * 0.7) / scale
    expect(spec.children.map((c) => c.kind)).toEqual(['line']);
  });

  it('gleitende Einspannung laengs (ux free, uz fixed, phiY fixed): Strich und Bahn', () => {
    const spec = supportSpec({
      support: support('supp-6', 'free', 'fixed', 'fixed'),
      ...baseOptions,
    });
    expect(spec.rotationDeg).toBe(0);
    expect(spec.translation).toEqual({ u: 0, v: 1.75 });
    expect(spec.children.map((c) => c.kind)).toEqual(['line', 'line']);
  });

  it('gleitende Einspannung quer (ux fixed, uz free, phiY fixed): dieselbe Figur, gekippt', () => {
    const spec = supportSpec({
      support: support('supp-7', 'fixed', 'free', 'fixed'),
      ...baseOptions,
    });
    expect(spec.rotationDeg).toBe(90);
    expect(spec.translation).toEqual({ u: 0, v: 1.75 });
    expect(spec.children.map((c) => c.kind)).toEqual(['line', 'line']);
  });

  it('nur die Verdrehung gehalten (ux free, uz free, phiY fixed): Kasten mit vier Bahnen', () => {
    const spec = supportSpec({
      support: support('supp-8', 'free', 'free', 'fixed'),
      ...baseOptions,
    });
    expect(spec.rotationDeg).toBe(0);
    // Mittig auf dem Knoten: der Kasten umschliesst ihn, statt darunter zu haengen.
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
    const invalid = {
      id: 'invalid-supp',
      nodeId: 'node-1',
      ux: 'invalid',
      uz: 'fixed',
      phiY: 'fixed',
    } as unknown as NodeSupport;

    expect(() => supportSpec({ support: invalid, ...baseOptions })).toThrow(
      UnsupportedSupportError,
    );
  });
});

describe('Das Auflager in der Szene', () => {
  it('anchors a support group at its node and keeps its relative gap on zoom', () => {
    const at1 = specsOf([nodeA], [], { supports: [supportA], viewport: vp1 });
    const at2 = specsOf([nodeA], [], { supports: [supportA], viewport: vp2 });
    const group1 = at1.find((spec) => spec.kind === 'group') as GroupSpec;
    const group2 = at2.find((spec) => spec.kind === 'group') as GroupSpec;

    expect(group1).toMatchObject({
      id: 'support:support-a',
      layer: 'supports',
      position: { u: 0, v: 0 },
      translation: { u: 0, v: 7 },
      rotationDeg: 0,
    });
    expect(group2.translation).toEqual({ u: 0, v: 3.5 });

    const circle1 = group1.children.find((child) => child.kind === 'circle');
    const circle2 = group2.children.find((child) => child.kind === 'circle');
    expect(circle1).toMatchObject({ center: { u: 0, v: 0 }, radius: 7 });
    expect(circle2).toMatchObject({ center: { u: 0, v: 0 }, radius: 3.5 });

    // Stage-Skalierung * lokale Weltgroesse bleibt fuer Abstand und Radius
    // gleich; damit bleibt auch ihr Verhaeltnis bei jedem Zoom konstant.
    expect(group1.translation.v / (circle1 as { radius: number }).radius).toBe(1);
    expect(group2.translation.v / (circle2 as { radius: number }).radius).toBe(1);
  });

  it('throws instead of silently drawing the wrong symbol', () => {
    const notImplemented: NodeSupport = {
      ...supportA,
      id: 'fixed-support',
      phiY: '300deg' as NodeSupport['phiY'], // noch nicht implementiert
    };

    expect(() =>
      specsOf([nodeA], [], { supports: [notImplemented] }),
    ).toThrow(UnsupportedSupportError);
  });

  it('throws when a support references an unknown node', () => {
    const orphan: NodeSupport = { ...supportA, nodeId: 'missing' };

    expect(() => specsOf([nodeA], [], { supports: [orphan] })).toThrow(
      /NodeSupport.*"missing"/,
    );
  });
});
