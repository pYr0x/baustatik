/**
 * DIE BEWEHRUNGSBANDE
 * ([ADR 0064](../../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
 *
 * Sie ist EINGABE und kein Ergebnis — deshalb steht sie nicht in `symbols` —
 * und der weggelassene Pull heisst „keine Bewehrung" statt „noch nicht
 * gerechnet". Beide Aussagen stehen hier als `expect`.
 */

import type { ReinforcementLayer } from '@baustatik/cross-section';
import type { GroupSpec } from '@baustatik/render-core';
import { describe, expect, it } from 'vitest';

import { REBAR_LAYER } from '../../src/rebar';
import { DEFAULT_STYLE } from '../../src/style';
import { inLayer, specById, specsOf, vp1, vp2 } from '../helpers';

const LAYERS: readonly ReinforcementLayer[] = [
  {
    id: 'unten',
    elements: [
      { id: 'u1', y: -100, z: 450, As: 4.52, Asmax: 8.04 },
      { id: 'u2', y: 0, z: 450, As: 4.52, Asmax: 8.04 },
      { id: 'u3', y: 100, z: 450, As: 4.52, Asmax: 8.04 },
    ],
  },
  {
    id: 'oben',
    elements: [
      { id: 'o1', y: -100, z: 50, As: 2.01, Asmax: 2.01 },
      { id: 'o2', y: 100, z: 50, As: 2.01, Asmax: 2.01 },
    ],
  },
];

describe('Die Bande zeichnet einen Kreis je Element', () => {
  it('baut EINE Gruppe mit n Kindern und den erwarteten Spec-Ids', () => {
    const group = specById<GroupSpec>(
      specsOf({ reinforcement: LAYERS }),
      'cross-section:rebar',
    );

    expect(group.kind).toBe('group');
    expect(group.layer).toBe(REBAR_LAYER);
    expect(group.children.map((child) => child.id)).toEqual([
      'cross-section:rebar:unten:u1',
      'cross-section:rebar:unten:u2',
      'cross-section:rebar:unten:u3',
      'cross-section:rebar:oben:o1',
      'cross-section:rebar:oben:o2',
    ]);
  });

  it('setzt den Kreis auf die ABSOLUTE Koordinate des Elements', () => {
    // Anders als die Spannungspunkte: deren Koordinaten sind
    // schwerpunktsbezogen, diese nicht (ADR 0064).
    const group = specById<GroupSpec>(
      specsOf({ reinforcement: LAYERS }),
      'cross-section:rebar',
    );
    const [erstes] = group.children;
    expect(erstes).toMatchObject({
      kind: 'circle',
      center: { u: -100, v: 450 },
      fillColor: DEFAULT_STYLE.rebarColor,
    });
  });

  it('haelt den Radius schirmkonstant — er sagt nichts ueber As', () => {
    const bei1 = specById<GroupSpec>(
      specsOf({ reinforcement: LAYERS, viewport: vp1 }),
      'cross-section:rebar',
    );
    const bei2 = specById<GroupSpec>(
      specsOf({ reinforcement: LAYERS, viewport: vp2 }),
      'cross-section:rebar',
    );

    const radiusOf = (group: GroupSpec) =>
      (group.children[0] as { radius: number }).radius;

    expect(radiusOf(bei1)).toBe(DEFAULT_STYLE.rebarRadiusPx);
    expect(radiusOf(bei2)).toBe(DEFAULT_STYLE.rebarRadiusPx / 2);

    // Zwei Elemente mit VERSCHIEDENEM As bekommen denselben Radius.
    const kinder = bei1.children as { radius: number }[];
    expect(kinder[0]?.radius).toBe(kinder[4]?.radius);
  });
});

describe('Ohne Bewehrung entsteht nichts', () => {
  it('erzeugt bei weggelassener Bewehrung kein einziges Spec im Band', () => {
    expect(inLayer(specsOf(), REBAR_LAYER)).toEqual([]);
  });

  it('erzeugt auch bei einer leeren Lagenliste nichts', () => {
    expect(inLayer(specsOf({ reinforcement: [] }), REBAR_LAYER)).toEqual([]);
  });

  it('erzeugt nichts bei Lagen ohne Elemente', () => {
    expect(
      inLayer(specsOf({ reinforcement: [{ id: 'leer', elements: [] }] }), REBAR_LAYER),
    ).toEqual([]);
  });
});
