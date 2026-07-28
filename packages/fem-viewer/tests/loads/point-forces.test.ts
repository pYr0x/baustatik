import { describe, expect, it } from 'vitest';

import type { Beam, Node } from '@baustatik/fem';
import type { FEMLoad } from '@baustatik/fem-loads';
import { UnknownLoadTargetError } from '@baustatik/fem-loads';
import type { ArrowSpec, LabelSpec } from '@baustatik/render-core';
import { validateSpecs } from '@baustatik/render-core';
import { pan, screenPoint, viewport } from '@baustatik/viewport-2d';

import { femSpecs } from '../src/scene';

const vp1 = viewport(screenPoint(0, 0), 1);

// a — b liegt waagrecht (L = 100), b — c faellt unter 45 Grad (L = 100 * √2).
const nodeA: Node = { id: 'a', position: { x: 0, z: 0 } };
const nodeB: Node = { id: 'b', position: { x: 100, z: 0 } };
const nodeC: Node = { id: 'c', position: { x: 200, z: 100 } };

const beamAB: Beam = {
  id: 'ab',
  startNodeId: 'a',
  endNodeId: 'b',
  crossSectionId: 'default',
  materialId: 'default',
};
const beamBC: Beam = { ...beamAB, id: 'bc', startNodeId: 'b', endNodeId: 'c' };

const NODES = [nodeA, nodeB, nodeC];
const BEAMS = [beamAB, beamBC];
const S = Math.SQRT1_2;

function specsFor(
  loads: readonly FEMLoad[],
  vp = vp1,
): ReturnType<typeof femSpecs> {
  return femSpecs({
    nodes: NODES,
    beams: BEAMS,
    supports: [],
    loads,
    viewport: vp,
  });
}

// Nur die Lastspecs: `femSpecs` liefert immer die ganze Szene.
function loadOnly(loads: readonly FEMLoad[], vp = vp1) {
  return specsFor(loads, vp).filter((spec) => spec.id.startsWith('load:'));
}

function arrow(loads: readonly FEMLoad[], id: string, vp = vp1): ArrowSpec {
  const spec = specsFor(loads, vp).find((s) => s.id === id);
  expect(spec, `kein Spec mit id ${id}`).toBeDefined();
  expect(spec?.kind).toBe('arrow');
  return spec as ArrowSpec;
}

function label(loads: readonly FEMLoad[], id: string, vp = vp1): LabelSpec {
  const spec = specsFor(loads, vp).find((s) => s.id === id);
  expect(spec, `kein Spec mit id ${id}`).toBeDefined();
  expect(spec?.kind).toBe('label');
  return spec as LabelSpec;
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
  it('puts the arrow tip on the node and its tail 48 px against the direction', () => {
    const spec = arrow([nodeLoad()], 'load:nl:b:fz:arrow');

    expect(spec.tip).toEqual({ u: 100, v: 0 });
    // fz positiv = nach unten, die Spitze liegt unten, der Schaft daher oben.
    expect(spec.tail).toEqual({ u: 100, v: -48 });
  });

  it('flips the arrow for a negative value but labels the plain magnitude', () => {
    const spec = arrow([nodeLoad({ fz: -10 })], 'load:nl:b:fz:arrow');
    const text = label([nodeLoad({ fz: -10 })], 'load:nl:b:fz:label');

    expect(spec.tip).toEqual({ u: 100, v: 0 });
    expect(spec.tail).toEqual({ u: 100, v: 48 });
    expect(text.text).toBe('10 kN');
  });

  it('draws fx along global x, positive to the right', () => {
    const positive = arrow([nodeLoad({ fx: 10, fz: undefined })], 'load:nl:b:fx:arrow');
    const negative = arrow([nodeLoad({ fx: -10, fz: undefined })], 'load:nl:b:fx:arrow');

    expect(positive.tail).toEqual({ u: 52, v: 0 });
    expect(negative.tail).toEqual({ u: 148, v: 0 });
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

    expect(spec.tip).toEqual({ u: 50, v: 0 });
    expect(spec.tail).toEqual({ u: 50, v: -48 });
  });

  it('reads a relative station as PERCENT of the beam length', () => {
    const spec = arrow(
      [beamPointLoad({ distanceFromStart: 25, relativeDistances: true })],
      'load:bl:ab:arrow',
    );

    expect(spec.tip).toEqual({ u: 25, v: 0 });
  });

  it('measures the station from the start node along a skewed beam', () => {
    // b — c faellt unter 45 Grad, halbe Laenge liegt bei (150, 50).
    const spec = arrow(
      [beamPointLoad({ beamIds: ['bc'], relativeDistances: true, distanceFromStart: 50 })],
      'load:bl:bc:arrow',
    );

    expect(spec.tip.u).toBeCloseTo(150, 10);
    expect(spec.tip.v).toBeCloseTo(50, 10);
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
      'load:bl:bc:arrow',
      'load:bl:bc:label',
    ]);
  });

  it('throws UnknownLoadTargetError for a beam that does not exist', () => {
    expect(() => specsFor([beamPointLoad({ beamIds: ['missing'] })])).toThrow(
      UnknownLoadTargetError,
    );
  });
});

describe('Noch nicht dargestellte Lastarten', () => {
  it('ignores distributed loads instead of failing', () => {
    const ignored: FEMLoad[] = [
      {
        id: 'q1',
        target: 'beam',
        beamIds: ['bc'],
        kind: 'force',
        distribution: 'constant',
        frame: 'global',
        axis: 'z',
        referenceLength: 'horizontalProjection',
        q: 0.85,
      },
      {
        id: 'q2',
        target: 'beam',
        beamIds: ['ab'],
        kind: 'force',
        distribution: 'trapezoidal',
        frame: 'global',
        axis: 'z',
        referenceLength: 'trueLength',
        fullLength: true,
        q1: 1,
        q2: 2,
      },
      {
        id: 'm1',
        target: 'beam',
        beamIds: ['ab'],
        kind: 'moment',
        distribution: 'constant',
        m: 3,
      },
    ];

    // Eine vorhandene Streckenlast darf das Zeichnen der Einzellast nicht
    // verhindern.
    const specs = loadOnly([...ignored, beamPointLoad()]);

    expect(specs.map((s) => s.id)).toEqual([
      'load:bl:ab:arrow',
      'load:bl:ab:label',
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
  const vp4 = viewport(screenPoint(0, 0), 4);

  it('keeps arrow length, pointer, font and gap screen-constant', () => {
    const at1 = arrow([nodeLoad()], 'load:nl:b:fz:arrow');
    const at4 = arrow([nodeLoad()], 'load:nl:b:fz:arrow', vp4);
    const text1 = label([nodeLoad()], 'load:nl:b:fz:label');
    const text4 = label([nodeLoad()], 'load:nl:b:fz:label', vp4);

    expect(at1.tip.v - at1.tail.v).toBe(48);
    expect(at4.tip.v - at4.tail.v).toBe(12);
    expect(at4.pointerLength).toBe(at1.pointerLength / 4);
    expect(at4.pointerWidth).toBe(at1.pointerWidth / 4);
    expect(text4.gap).toBe(text1.gap / 4);
    expect(text4.fontSize).toBe(text1.fontSize / 4);
    expect(text4.padding).toBe(text1.padding / 4);
    expect(text4.cornerRadius!).toBe(text1.cornerRadius! / 4);
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

    expect(specs).toHaveLength(4);
    expect(specs.every((s) => s.layer === 'loads')).toBe(true);
  });

  it('produces specs that pass render-core validation', () => {
    const specs = femSpecs({
      nodes: NODES,
      beams: BEAMS,
      supports: [],
      loads: [nodeLoad({ fx: 3, fz: -4 }), beamPointLoad({ beamIds: ['ab', 'bc'] })],
      viewport: vp1,
    });

    expect(() => validateSpecs(specs)).not.toThrow();
  });
});
