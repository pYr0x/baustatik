/**
 * Auflagerreaktionen -> Specs.
 *
 * Gespiegelt zu `tests/loads/point-forces.test.ts`, und der Vergleich ist Teil
 * der Aussage: dieselben Symbole, dieselbe Schema-Regel, eine andere Farbe und
 * ein anderes Band. Was hier NICHT wie dort funktioniert, waere ein Befund.
 */

import { describe, expect, it } from 'vitest';

import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type {
  ArcPathSpec,
  ArrowSpec,
  LabelSpec,
  Spec,
} from '@baustatik/render-core';
import { validateSpecs } from '@baustatik/render-core';
import { pan, screenPoint, type Viewport, viewport } from '@baustatik/viewport-2d';

import { UnknownNodeReferenceError } from '../../src/errors';
import { femSpecs } from '../../src/scene';

const vp1 = viewport(screenPoint(0, 0), 1);
const vp4 = viewport(screenPoint(0, 0), 4);

/** Abstand zwischen Knoten und Pfeilspitze — derselbe wie bei der Last. */
const GAP = 10;
/** Schematische Pfeillaenge — dieselbe wie bei der Last. */
const FULL = 48;

const nodeA: Node = { id: 'a', position: { x: 0, z: 0 } };
const nodeB: Node = { id: 'b', position: { x: 100, z: 0 } };

const beamAB: Beam = {
  id: 'ab',
  startNodeId: 'a',
  endNodeId: 'b',
  crossSectionId: 'default',
  materialId: 'default',
};

const supportA: NodeSupport = {
  id: 'support-a',
  nodeId: 'a',
  ux: 'fixed',
  uz: 'fixed',
  phiY: 'fixed',
};

type Reaction = { fx: number; fz: number; my: number };

/** Ein Auflager, das nur haelt, was ausdruecklich gesetzt ist. */
const reaction = (fields: Partial<Reaction> = {}): Reaction => ({
  fx: 0,
  fz: 0,
  my: 0,
  ...fields,
});

function specsFor(
  reactions: ReadonlyMap<string, Reaction>,
  vp: Viewport = vp1,
): readonly Spec[] {
  return femSpecs({
    nodes: [nodeA, nodeB],
    beams: [beamAB],
    supports: [supportA],
    loads: [],
    reactions,
    viewport: vp,
  });
}

/** Nur die Ergebnisspecs: `femSpecs` liefert immer die ganze Szene. */
function reactionOnly(
  reactions: ReadonlyMap<string, Reaction>,
  vp: Viewport = vp1,
): readonly Spec[] {
  return specsFor(reactions, vp).filter((spec) =>
    spec.id.startsWith('reaction:'),
  );
}

function specById<T>(
  reactions: ReadonlyMap<string, Reaction>,
  id: string,
  vp: Viewport = vp1,
): T {
  const spec = specsFor(reactions, vp).find((s) => s.id === id);
  expect(spec, `kein Spec mit id ${id}`).toBeDefined();
  return spec as T;
}

const at = (r: Partial<Reaction>) => new Map([['a', reaction(r)]]);

describe('Leserichtung: die Kraft AUF das Tragwerk', () => {
  it('points the arrow UP for a support that carries a downward load', () => {
    // `fz` negativ = die Stuetze drueckt nach oben. Dieselbe Regel wie bei der
    // Last: die Spitze steht `GAP` vor dem Knoten, der Schaft dahinter — also
    // UNTERHALB, der Pfeil zeigt nach oben.
    const spec = specById<ArrowSpec>(at({ fz: -10 }), 'reaction:a:fz:arrow');

    expect(spec.tip).toEqual({ u: 0, v: GAP });
    expect(spec.tail).toEqual({ u: 0, v: GAP + FULL });
  });

  it('flips with the sign and labels the plain magnitude', () => {
    const down = specById<ArrowSpec>(at({ fz: 10 }), 'reaction:a:fz:arrow');
    const text = specById<LabelSpec>(at({ fz: -10 }), 'reaction:a:fz:label');

    expect(down.tail).toEqual({ u: 0, v: -(GAP + FULL) });
    expect(text.text).toBe('10 kN');
  });

  it('reads equilibrium off the picture: load and reaction point opposite ways', () => {
    // Die eigentliche Aussage der Leserichtung. Last `fz = +10` nach unten,
    // Reaktion `fz = -10` nach oben — beide nach DERSELBEN Regel gezeichnet, also
    // spiegelbildlich um den Knoten: gleicher Abstand, entgegengesetzte Seite.
    const specs = femSpecs({
      nodes: [nodeA, nodeB],
      beams: [beamAB],
      supports: [supportA],
      loads: [{ id: 'nl', target: 'node', nodeIds: ['a'], fz: 10 } as never],
      reactions: at({ fz: -10 }),
      viewport: vp1,
    });

    const load = specs.find((s) => s.id === 'load:nl:a:fz:arrow') as ArrowSpec;
    const held = specs.find((s) => s.id === 'reaction:a:fz:arrow') as ArrowSpec;

    // Derselbe Gap fuer beide: die zwei Pfeile liegen zum Knoten hin gleich weit
    // ab. Waere er verschieden, saehe es aus, als griffen sie an verschiedenen
    // Stellen an.
    expect(load.tip.v).toBe(-GAP);
    expect(held.tip.v).toBe(GAP);
    expect(load.tail.v).toBe(-(GAP + FULL));
    expect(held.tail.v).toBe(GAP + FULL);
  });

  it('setzt an einer Reaktion keine Marke — sie sitzt auf einem Knoten', () => {
    // Die Marke gibt es nur fuer eine Last AUF einem Stab (`beam-loads.ts`).
    const ids = reactionOnly(at({ fz: -10 })).map((s) => s.id);

    expect(ids).toEqual(['reaction:a:fz:arrow', 'reaction:a:fz:label']);
  });

  it('turns the moment counter-clockwise for a positive my', () => {
    // Dieselbe Regel wie beim Lastmoment: global y zeigt aus der Ebene, positiv
    // dreht im Bild gegen den Uhrzeigersinn, auf dem Schirm also mit NEGATIVEM
    // sweepAngle.
    const positive = specById<ArcPathSpec>(at({ my: 5 }), 'reaction:a:my:arc');
    const negative = specById<ArcPathSpec>(at({ my: -5 }), 'reaction:a:my:arc');

    expect(positive.sweepAngle).toBeLessThan(0);
    expect(negative.sweepAngle).toBeGreaterThan(0);
    expect(specById<LabelSpec>(at({ my: -5 }), 'reaction:a:my:label').text).toBe(
      '5 kNm',
    );
  });
});

describe('Was gehalten wird, sagt das Ergebnis', () => {
  it('draws one symbol per non-zero component', () => {
    const ids = reactionOnly(at({ fx: 3, fz: -4, my: 5 })).map((s) => s.id);

    expect(ids).toEqual([
      'reaction:a:fx:arrow',
      'reaction:a:fx:label',
      'reaction:a:fz:arrow',
      'reaction:a:fz:label',
      'reaction:a:my:arc',
      'reaction:a:my:head',
      'reaction:a:my:label',
    ]);
  });

  it('leaves a released direction out — it carries exactly 0', () => {
    // Ein Zweiwertlager: `phiY` ist frei, `my` ist deshalb exakt 0 und erzeugt
    // von selbst kein drittes Symbol. Ohne Fallunterscheidung ueber NodeSupport.
    const ids = reactionOnly(at({ fx: 3, fz: -4 })).map((s) => s.id);

    expect(ids).toEqual([
      'reaction:a:fx:arrow',
      'reaction:a:fx:label',
      'reaction:a:fz:arrow',
      'reaction:a:fz:label',
    ]);
  });

  it('emits nothing at all for a support that holds nothing', () => {
    expect(reactionOnly(at({}))).toHaveLength(0);
  });

  it('fans out over every supported node', () => {
    const ids = reactionOnly(
      new Map([
        ['a', reaction({ fz: -4 })],
        ['b', reaction({ fz: -6 })],
      ]),
    ).map((s) => s.id);

    expect(ids).toEqual([
      'reaction:a:fz:arrow',
      'reaction:a:fz:label',
      'reaction:b:fz:arrow',
      'reaction:b:fz:label',
    ]);
  });

  it('throws UnknownNodeReferenceError for a node that does not exist', () => {
    // MODELLfehler, nicht Lastfehler: ein Ergebnis, das einen fremden Knoten
    // nennt, gehoert nicht zu diesem Modell.
    expect(() =>
      specsFor(new Map([['missing', reaction({ fz: -1 })]])),
    ).toThrow(UnknownNodeReferenceError);
  });
});

describe('Schema statt Abbild — wie bei der Last', () => {
  it('keeps arrow length, pointer, font and gap screen-constant', () => {
    const at1 = specById<ArrowSpec>(at({ fz: -10 }), 'reaction:a:fz:arrow');
    const at4 = specById<ArrowSpec>(at({ fz: -10 }), 'reaction:a:fz:arrow', vp4);
    const text1 = specById<LabelSpec>(at({ fz: -10 }), 'reaction:a:fz:label');
    const text4 = specById<LabelSpec>(
      at({ fz: -10 }),
      'reaction:a:fz:label',
      vp4,
    );

    expect(at1.tail.v - at1.tip.v).toBe(48);
    expect(at4.tail.v - at4.tip.v).toBe(12);
    expect(at4.pointerLength).toBe(at1.pointerLength / 4);
    expect(text4.gap).toBe(text1.gap / 4);
    expect(text4.fontSize).toBe(text1.fontSize / 4);
  });

  it('says nothing about the magnitude through its length', () => {
    // Der Kern der Schema-Regel: 10 kN und 1000 kN zeichnen denselben Pfeil.
    const small = specById<ArrowSpec>(at({ fz: -10 }), 'reaction:a:fz:arrow');
    const large = specById<ArrowSpec>(at({ fz: -1000 }), 'reaction:a:fz:arrow');

    expect(large.tail).toEqual(small.tail);
    expect(
      specById<LabelSpec>(at({ fz: -1000 }), 'reaction:a:fz:label').text,
    ).toBe('1000 kN');
  });

  it('keeps ids stable across pan and zoom so the renderer patches', () => {
    const r = at({ fx: 1, fz: -2, my: 3 });
    const before = reactionOnly(r).map((s) => s.id);

    expect(reactionOnly(r, pan(vp1, 3, 7)).map((s) => s.id)).toEqual(before);
    expect(reactionOnly(r, vp4).map((s) => s.id)).toEqual(before);
  });
});

describe('Szene bleibt gueltig', () => {
  it('puts every reaction spec into the topmost paint band', () => {
    const specs = reactionOnly(at({ fx: 3, fz: -4, my: 5 }));

    expect(specs).toHaveLength(7);
    expect(specs.every((s) => s.layer === 'reactions')).toBe(true);
  });

  it('produces specs that pass render-core validation', () => {
    expect(() =>
      validateSpecs(specsFor(at({ fx: 3, fz: -4, my: 5 }))),
    ).not.toThrow();
  });
});
