import { describe, expect, it } from 'vitest';

import type { FEMLoad } from '@baustatik/fem-loads';
import { UnknownLoadTargetError } from '@baustatik/fem-loads';
import type { ArrowSpec, LabelSpec, RectangleSpec } from '@baustatik/render-core';
import { validateSpecs } from '@baustatik/render-core';
import { pan, type Viewport } from '@baustatik/viewport-2d';

import {
  beamAB,
  beamBC,
  drawingOf,
  nodeA,
  nodeB,
  nodeC,
  vp1,
  vp4,
} from './helpers';

const NODES = [nodeA, nodeB, nodeC];
const BEAMS = [beamAB, beamBC];
const S = Math.SQRT1_2;
/** Abstand zwischen Angriffspunkt und Pfeilspitze. */
const GAP = 10;
/** Schematische Pfeillaenge — fuer jede Kraft dieselbe. */
const FULL = 48;
/** Kantenlaenge der Marke; sie sitzt mittig, also zaehlt ueberall die Haelfte. */
const MARKER = 4;

const { specsFor, loadOnly, specById } = drawingOf(NODES, BEAMS);

function arrow(
  loads: readonly FEMLoad[],
  id: string,
  vp: Viewport = vp1,
): ArrowSpec {
  const spec = specById<ArrowSpec>(loads, id, vp);
  expect(spec.kind).toBe('arrow');
  return spec;
}

function label(
  loads: readonly FEMLoad[],
  id: string,
  vp: Viewport = vp1,
): LabelSpec {
  const spec = specById<LabelSpec>(loads, id, vp);
  expect(spec.kind).toBe('label');
  return spec;
}

function marker(
  loads: readonly FEMLoad[],
  id: string,
  vp: Viewport = vp1,
): RectangleSpec {
  const spec = specById<RectangleSpec>(loads, id, vp);
  expect(spec.kind).toBe('rectangle');
  return spec;
}

const nodeLoad = (fields: Partial<FEMLoad> & object = {}): FEMLoad =>
  ({
    id: 'nl',
    target: 'node',
    nodeIds: ['b'],
    fz: 10,
    ...fields,
  }) as FEMLoad;

const beamPointLoad = (fields: Record<string, unknown> = {}): FEMLoad =>
  ({
    id: 'bl',
    target: 'beam',
    beamIds: ['ab'],
    kind: 'force',
    distribution: 'point',
    frame: 'global',
    axis: 'z',
    p: 10,
    distanceFromStart: 50,
    ...fields,
  }) as FEMLoad;

describe('Knotenkraefte', () => {
  it('haelt die Spitze GAP vor dem Knoten und traegt die Laenge dahinter ab', () => {
    const spec = arrow([nodeLoad()], 'load:nl:b:fz:arrow');

    // fz positiv = nach unten: die Spitze steht ueber dem Knoten, der Schaft
    // darueber. Der Pfeil beruehrt den Knoten nicht — wie die Streckenlast den
    // Stab nicht beruehrt.
    expect(spec.tip).toEqual({ u: 100, v: -GAP });
    expect(spec.tail).toEqual({ u: 100, v: -(GAP + FULL) });
  });

  it('flips the arrow for a negative value but labels the plain magnitude', () => {
    const spec = arrow([nodeLoad({ fz: -10 })], 'load:nl:b:fz:arrow');
    const text = label([nodeLoad({ fz: -10 })], 'load:nl:b:fz:label');

    expect(spec.tip).toEqual({ u: 100, v: GAP });
    expect(spec.tail).toEqual({ u: 100, v: GAP + FULL });
    expect(text.text).toBe('10 kN');
  });

  it('draws fx along global x, positive to the right', () => {
    const positive = arrow([nodeLoad({ fx: 10, fz: undefined })], 'load:nl:b:fx:arrow');
    const negative = arrow([nodeLoad({ fx: -10, fz: undefined })], 'load:nl:b:fx:arrow');

    expect(positive.tip).toEqual({ u: 100 - GAP, v: 0 });
    expect(positive.tail).toEqual({ u: 100 - GAP - FULL, v: 0 });
    expect(negative.tail).toEqual({ u: 100 + GAP + FULL, v: 0 });
  });

  it('setzt an einem Knoten KEINE Marke — der Knoten ist die Stelle', () => {
    // Sie laege unter dem groesseren roten Knotenkreis und sagte nichts, was das
    // Bild nicht schon sagt.
    const ids = loadOnly([nodeLoad()]).map((s) => s.id);

    expect(ids).toEqual(['load:nl:b:fz:arrow', 'load:nl:b:fz:label']);
  });

  it('emits one arrow-label pair per effective component', () => {
    const ids = loadOnly([nodeLoad({ fx: 3, fz: 4 })]).map((s) => s.id);

    expect(ids).toEqual([
      'load:nl:b:fx:arrow',
      'load:nl:b:fx:label',
      'load:nl:b:fz:arrow',
      'load:nl:b:fz:label',
    ]);
  });

  it('draws force and moment of the SAME load side by side', () => {
    // `fx`/`fz` und `my` stehen im selben Lastobjekt — kein Entweder-Oder.
    const ids = loadOnly([nodeLoad({ fz: 4, my: 5 })]).map((s) => s.id);

    expect(ids).toEqual([
      'load:nl:b:fz:arrow',
      'load:nl:b:fz:label',
      'load:nl:b:my:arc',
      'load:nl:b:my:head',
      'load:nl:b:my:label',
    ]);
  });

  it('skips components that are absent or zero', () => {
    expect(
      loadOnly([nodeLoad({ fx: 0, fz: undefined, my: 0 })]),
    ).toHaveLength(0);
  });

  it('fans out over every target node', () => {
    const specs = loadOnly([nodeLoad({ nodeIds: ['a', 'b'] })]);

    expect(specs.map((s) => s.id)).toEqual([
      'load:nl:a:fz:arrow',
      'load:nl:a:fz:label',
      'load:nl:b:fz:arrow',
      'load:nl:b:fz:label',
    ]);
  });

  it('throws UnknownLoadTargetError for a node that does not exist', () => {
    // LASTfehler, nicht Modellfehler: der bestehende Fehler aus fem-loads.
    expect(() => specsFor([nodeLoad({ nodeIds: ['missing'] })])).toThrow(
      UnknownLoadTargetError,
    );
  });
});

describe('Punktuelle Stabkraefte', () => {
  it('interpolates the point of application along the beam axis', () => {
    const spec = arrow([beamPointLoad()], 'load:bl:ab:arrow');

    // Der Angriffspunkt ist (50|0); der Pfeil endet GAP darueber.
    expect(spec.tip).toEqual({ u: 50, v: -GAP });
    expect(spec.tail).toEqual({ u: 50, v: -(GAP + FULL) });
  });

  it('setzt die Marke IN den Angriffspunkt, auf die Stabachse', () => {
    // Die Gegenrechnung zum Gap: der Pfeil endet daneben, die Stelle sagt die
    // Marke — genau wie bei der Streckenlast an den Enden ihres Abschnitts.
    const spec = marker([beamPointLoad()], 'load:bl:ab:marker');

    expect(spec.topLeft).toEqual({ u: 50 - MARKER / 2, v: 0 - MARKER / 2 });
    expect(spec.width).toBe(MARKER);
    expect(spec.height).toBe(MARKER);
  });

  it('reads a relative station as PERCENT of the beam length', () => {
    const spec = marker(
      [beamPointLoad({ distanceFromStart: 25, relativeDistances: true })],
      'load:bl:ab:marker',
    );

    expect(spec.topLeft.u).toBeCloseTo(25 - MARKER / 2, 10);
  });

  it('measures the station from the start node along a skewed beam', () => {
    // b — c faellt unter 45 Grad, halbe Laenge liegt bei (150, 50).
    const spec = marker(
      [beamPointLoad({ beamIds: ['bc'], relativeDistances: true, distanceFromStart: 50 })],
      'load:bl:bc:marker',
    );

    expect(spec.topLeft.u).toBeCloseTo(150 - MARKER / 2, 10);
    expect(spec.topLeft.v).toBeCloseTo(50 - MARKER / 2, 10);
  });

  it('haelt die Marke im Angriffspunkt, egal wohin die Last zeigt', () => {
    // Der Pfeil dreht sich mit der Richtung, die Marke nicht: sie zeigt eine
    // STELLE. Bei umgekehrtem Vorzeichen steht der Pfeil auf der anderen Seite
    // des Stabs, die Marke bleibt, wo sie ist.
    const down = marker([beamPointLoad()], 'load:bl:ab:marker');
    const up = marker([beamPointLoad({ p: -10 })], 'load:bl:ab:marker');

    expect(up.topLeft).toEqual(down.topLeft);
    expect(arrow([beamPointLoad({ p: -10 })], 'load:bl:ab:arrow').tip).toEqual({
      u: 50,
      v: GAP,
    });
  });

  it('keeps a global direction global on a skewed beam', () => {
    const spec = arrow([beamPointLoad({ beamIds: ['bc'] })], 'load:bl:bc:arrow');

    // frame global, axis z: senkrecht nach unten, unabhaengig von der Neigung.
    expect(spec.tip.v - spec.tail.v).toBeCloseTo(48, 10);
    expect(spec.tip.u - spec.tail.u).toBeCloseTo(0, 10);
  });

  it('rotates a local direction into the beam frame', () => {
    const localZ = arrow(
      [beamPointLoad({ beamIds: ['bc'], frame: 'local', axis: 'z' })],
      'load:bl:bc:arrow',
    );
    const localX = arrow(
      [beamPointLoad({ beamIds: ['bc'], frame: 'local', axis: 'x' })],
      'load:bl:bc:arrow',
    );

    // ex = (1,1)/√2 zeigt vom Anfangs- zum Endknoten, ez = (-1,1)/√2.
    expect(localX.tip.u - localX.tail.u).toBeCloseTo(48 * S, 10);
    expect(localX.tip.v - localX.tail.v).toBeCloseTo(48 * S, 10);
    expect(localZ.tip.u - localZ.tail.u).toBeCloseTo(-48 * S, 10);
    expect(localZ.tip.v - localZ.tail.v).toBeCloseTo(48 * S, 10);
  });

  it('is identical to a global direction on a horizontal beam', () => {
    const local = arrow([beamPointLoad({ frame: 'local' })], 'load:bl:ab:arrow');
    const global = arrow([beamPointLoad()], 'load:bl:ab:arrow');

    expect(local.tail.u).toBeCloseTo(global.tail.u, 10);
    expect(local.tail.v).toBeCloseTo(global.tail.v, 10);
  });

  it('fans out over every target beam', () => {
    const specs = loadOnly([beamPointLoad({ beamIds: ['ab', 'bc'] })]);

    expect(specs.map((s) => s.id)).toEqual([
      'load:bl:ab:arrow',
      'load:bl:ab:label',
      'load:bl:ab:marker',
      'load:bl:bc:arrow',
      'load:bl:bc:label',
      'load:bl:bc:marker',
    ]);
  });

  it('laesst mit der Last auch ihre Marke weg, wenn p 0 ist', () => {
    // Ein Wert ohne Betrag hat keine Richtung — und keine Stelle, die zu
    // markieren waere. Die Marke allein saehe aus wie eine Last ohne Pfeil.
    expect(loadOnly([beamPointLoad({ p: 0 })])).toHaveLength(0);
  });

  it('throws UnknownLoadTargetError for a beam that does not exist', () => {
    expect(() => specsFor([beamPointLoad({ beamIds: ['missing'] })])).toThrow(
      UnknownLoadTargetError,
    );
  });
});

describe('Noch nicht dargestellte Lastarten', () => {
  it('ignores line moments instead of failing', () => {
    // Streckenlasten als KRAFT werden gezeichnet (`distributed-forces.test.ts`);
    // uebrig bleiben die Streckenmomente, fuer die es kein Symbol gibt.
    const ignored: FEMLoad[] = [
      {
        id: 'm1',
        target: 'beam',
        beamIds: ['ab'],
        kind: 'moment',
        distribution: 'constant',
        m: 3,
      },
      {
        id: 'm2',
        target: 'beam',
        beamIds: ['bc'],
        kind: 'moment',
        distribution: 'trapezoidal',
        fullLength: true,
        m1: 1,
        m2: 2,
      },
    ];

    // Ein nicht darstellbares Streckenmoment darf das Zeichnen der Einzellast
    // nicht verhindern.
    const specs = loadOnly([...ignored, beamPointLoad()]);

    expect(specs.map((s) => s.id)).toEqual([
      'load:bl:ab:arrow',
      'load:bl:ab:label',
      'load:bl:ab:marker',
    ]);
  });
});

describe('Label', () => {
  it('formats the magnitude with roundSmart and a kN unit', () => {
    expect(label([nodeLoad({ fz: 10 })], 'load:nl:b:fz:label').text).toBe('10 kN');
    expect(label([nodeLoad({ fz: 0.85 })], 'load:nl:b:fz:label').text).toBe(
      '0.85 kN',
    );
    expect(label([nodeLoad({ fz: -1.23456 })], 'load:nl:b:fz:label').text).toBe(
      '1.235 kN',
    );
  });

  it('anchors 6 px behind the outer arrow end, pointing away from the tip', () => {
    const spec = label([nodeLoad()], 'load:nl:b:fz:label');
    const shaft = arrow([nodeLoad()], 'load:nl:b:fz:arrow');

    expect(spec.anchor).toEqual(shaft.tail);
    // fz zeigt nach unten, das Label liegt also oberhalb.
    expect(spec.direction).toEqual({ u: 0, v: -1 });
    expect(spec.gap).toBe(6);
  });

  it('stays horizontal — the direction only picks a side', () => {
    // Auch am schraegen Stab traegt das Label keine Drehung; `LabelSpec` hat
    // ueberhaupt kein Rotationsfeld, und die Richtung waehlt nur die Seite.
    const spec = label(
      [beamPointLoad({ beamIds: ['bc'], frame: 'local', axis: 'z' })],
      'load:bl:bc:label',
    );

    expect(spec).not.toHaveProperty('rotationDeg');
    expect(Math.hypot(spec.direction.u, spec.direction.v)).toBeCloseTo(1, 12);
  });
});

describe('Schema statt Abbild', () => {
  it('keeps arrow length, pointer, font and gap screen-constant', () => {
    const at1 = arrow([nodeLoad()], 'load:nl:b:fz:arrow');
    const at4 = arrow([nodeLoad()], 'load:nl:b:fz:arrow', vp4);
    const text1 = label([nodeLoad()], 'load:nl:b:fz:label');
    const text4 = label([nodeLoad()], 'load:nl:b:fz:label', vp4);

    expect(at1.tip.v - at1.tail.v).toBe(48);
    expect(at4.tip.v - at4.tail.v).toBe(12);
    // Der Gap zoomt mit — sonst risse die Luecke beim Herauszoomen auf.
    expect(at1.tip.v).toBe(-GAP);
    expect(at4.tip.v).toBe(-GAP / 4);
    expect(at4.pointerLength).toBe(at1.pointerLength / 4);
    expect(at4.pointerWidth).toBe(at1.pointerWidth / 4);
    expect(text4.gap).toBe(text1.gap / 4);
    expect(text4.fontSize).toBe(text1.fontSize / 4);
    expect(text4.padding).toBe(text1.padding / 4);
    expect(text4.cornerRadius!).toBe(text1.cornerRadius! / 4);
  });

  it('haelt auch die Marke bildschirmkonstant, mittig auf dem Angriffspunkt', () => {
    const near = marker([beamPointLoad()], 'load:bl:ab:marker');
    const far = marker([beamPointLoad()], 'load:bl:ab:marker', vp4);

    expect(far.width).toBe(near.width / 4);
    expect(far.topLeft).toEqual({ u: 50 - MARKER / 8, v: -MARKER / 8 });
  });

  it('leaves stroke and border widths untouched — the adapter draws them in screen px', () => {
    const at1 = arrow([nodeLoad()], 'load:nl:b:fz:arrow');
    const at4 = arrow([nodeLoad()], 'load:nl:b:fz:arrow', vp4);

    expect(at4.strokeWidth).toBe(at1.strokeWidth);
    expect(label([nodeLoad()], 'load:nl:b:fz:label', vp4).borderWidth).toBe(
      label([nodeLoad()], 'load:nl:b:fz:label').borderWidth,
    );
  });

  it('keeps ids stable across pan and zoom so the renderer patches', () => {
    const loads = [nodeLoad({ fx: 1, fz: 2 }), beamPointLoad()];
    const before = loadOnly(loads).map((s) => s.id);

    expect(loadOnly(loads, pan(vp1, 3, 7)).map((s) => s.id)).toEqual(before);
    expect(loadOnly(loads, vp4).map((s) => s.id)).toEqual(before);
  });
});

describe('Szene bleibt gueltig', () => {
  it('puts loads into the topmost paint band', () => {
    const specs = loadOnly([nodeLoad(), beamPointLoad()]);

    // Knotenlast: Pfeil und Label. Stablast: dazu die Marke.
    expect(specs).toHaveLength(5);
    expect(specs.every((s) => s.layer === 'loads')).toBe(true);
  });

  it('produces specs that pass render-core validation', () => {
    const specs = specsFor([
      nodeLoad({ fx: 3, fz: -4 }),
      beamPointLoad({ beamIds: ['ab', 'bc'] }),
    ]);

    expect(() => validateSpecs(specs)).not.toThrow();
  });
});
