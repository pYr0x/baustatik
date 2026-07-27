import { Line, Point } from '@baustatik/fem-geometry';
import { describe, expect, it } from 'vitest';
import { InvalidLoadCaseError } from '../src/errors';
import {
  assertValidLoadCase,
  effectiveLoads,
  type LoadCase,
} from '../src/load-case';
import type {
  BeamForceConstantLoad,
  BeamForcePointLoad,
  BeamLoad,
  BeamMomentPointLoad,
  FEMLoad,
  NodeLoad,
} from '../src/types';
import { type LoadModelGeometry, validateLoads } from '../src/validate';

// Dasselbe Modell wie in tests/validate.test.ts.
const HORIZONTAL = Line.make(Point.make(0, 0), Point.make(100, 0));
const SLOPED = Line.make(Point.make(100, 0), Point.make(160, -40));

const model: LoadModelGeometry = {
  hasNode: (nodeId) => ['n1', 'n2'].includes(nodeId),
  beamAxis: (beamId) =>
    ({ horizontal: HORIZONTAL, sloped: SLOPED })[beamId],
};

function nodeLoad(load: Partial<NodeLoad> = {}): NodeLoad {
  return { id: 'load-1', target: 'node', nodeIds: ['n1'], fz: 10, ...load };
}

function pointLoad(load: Partial<BeamForcePointLoad> = {}): BeamForcePointLoad {
  return {
    id: 'load-1',
    target: 'beam',
    beamIds: ['horizontal'],
    kind: 'force',
    distribution: 'point',
    frame: 'global',
    axis: 'z',
    p: 10,
    distanceFromStart: 50,
    ...load,
  };
}

function uniformLoad(
  load: Partial<BeamForceConstantLoad> = {},
): BeamForceConstantLoad {
  return {
    id: 'load-1',
    target: 'beam',
    beamIds: ['horizontal'],
    kind: 'force',
    distribution: 'constant',
    frame: 'global',
    axis: 'z',
    referenceLength: 'trueLength',
    q: 5,
    ...load,
  };
}

function momentLoad(
  load: Partial<BeamMomentPointLoad> = {},
): BeamMomentPointLoad {
  return {
    id: 'load-1',
    target: 'beam',
    beamIds: ['horizontal'],
    kind: 'moment',
    distribution: 'point',
    m: 8,
    distanceFromStart: 25,
    ...load,
  };
}

// Wie `trapezoidalLoad` in validate.test.ts: ungetypt, weil ein Spread die
// Variante von `TrapezoidalExtent` nicht wechseln kann.
function trapezoidalLoad(load: Record<string, unknown> = {}): BeamLoad {
  return {
    id: 'load-1',
    target: 'beam',
    beamIds: ['horizontal'],
    kind: 'force',
    distribution: 'trapezoidal',
    frame: 'global',
    axis: 'z',
    referenceLength: 'trueLength',
    q1: 10,
    q2: 100,
    from: 10,
    to: 80,
    ...load,
  } as BeamLoad;
}

/** Trapezfoermiges Streckenmoment — traegt m1/m2 und keine Richtung. */
function trapezoidalMoment(load: Record<string, unknown> = {}): BeamLoad {
  return {
    id: 'load-1',
    target: 'beam',
    beamIds: ['horizontal'],
    kind: 'moment',
    distribution: 'trapezoidal',
    m1: 3,
    m2: 9,
    from: 10,
    to: 80,
    ...load,
  } as BeamLoad;
}

function loadCase(over: Partial<LoadCase> = {}): LoadCase {
  return { id: 'lf-1', name: 'Lastfall 1', loads: [], ...over };
}

describe('assertValidLoadCase', () => {
  it('laesst den fehlenden Faktor, den negativen und den gebrochenen durch', () => {
    expect(() => assertValidLoadCase(loadCase())).not.toThrow();
    // -1 ist der Hauptzweck: kopierter Windlastfall, umgekehrt.
    expect(() => assertValidLoadCase(loadCase({ factor: -1 }))).not.toThrow();
    // 1-fach eingegeben, auf den echten Wert skaliert.
    expect(() => assertValidLoadCase(loadCase({ factor: 1.75 }))).not.toThrow();
  });

  it('weist den Faktor 0 ab — das waere Loeschen durch die Hintertuer', () => {
    expect(() => assertValidLoadCase(loadCase({ factor: 0 }))).toThrow(
      InvalidLoadCaseError,
    );
    // -0 === 0, also faengt dieselbe Regel beide.
    expect(() => assertValidLoadCase(loadCase({ factor: -0 }))).toThrow(
      InvalidLoadCaseError,
    );
  });

  it('weist nicht endliche Faktoren ab', () => {
    for (const factor of [Number.NaN, Infinity, -Infinity]) {
      expect(() => assertValidLoadCase(loadCase({ factor }))).toThrow(
        InvalidLoadCaseError,
      );
    }
  });

  it('nennt den Lastfall in der Meldung und im Feld', () => {
    try {
      assertValidLoadCase(loadCase({ id: 'lf-wind', factor: 0 }));
      expect.unreachable('haette werfen muessen');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidLoadCaseError);
      expect((error as InvalidLoadCaseError).loadCaseId).toBe('lf-wind');
      expect((error as Error).message).toContain('lf-wind');
    }
  });

  it('laesst einen Lastfall OHNE Lasten durch — der ist nicht falsch', () => {
    // Der Anwender ist nur nicht fertig. Das meldet der Solver als Zustand
    // `unloaded`, nicht als Beanstandung.
    expect(() => assertValidLoadCase(loadCase({ loads: [] }))).not.toThrow();
  });
});

describe('effectiveLoads', () => {
  it('liefert ohne Faktor und bei Faktor 1 DASSELBE Array', () => {
    const loads = [nodeLoad(), pointLoad()];
    expect(effectiveLoads(loadCase({ loads }))).toBe(loads);
    expect(effectiveLoads(loadCase({ loads, factor: 1 }))).toBe(loads);
  });

  it('skaliert die drei Komponenten der Knotenlast', () => {
    const [scaled] = effectiveLoads(
      loadCase({ loads: [nodeLoad({ fx: 4, fz: 10, my: -6 })], factor: 1.75 }),
    ) as NodeLoad[];

    expect(scaled.fx).toBeCloseTo(7);
    expect(scaled.fz).toBeCloseTo(17.5);
    expect(scaled.my).toBeCloseTo(-10.5);
  });

  it('laesst eine weggelassene Komponente weggelassen', () => {
    // Sonst stuende `fx: undefined` im Objekt, und `'fx' in load` waere wahr —
    // ein Unterschied, den die Validierung und der Viewer sehen koennen.
    const [scaled] = effectiveLoads(
      loadCase({ loads: [nodeLoad({ fz: 10 })], factor: -1 }),
    ) as NodeLoad[];

    expect('fx' in scaled).toBe(false);
    expect('my' in scaled).toBe(false);
    expect(scaled.fz).toBe(-10);

    // Gegenprobe ohne fz: waagrechte Windlast mit Moment, keine Vertikalkraft.
    const [horizontal] = effectiveLoads(
      loadCase({
        loads: [{ id: 'w1', target: 'node', nodeIds: ['n1'], fx: 5, my: 2 }],
        factor: -1,
      }),
    ) as NodeLoad[];

    expect('fz' in horizontal).toBe(false);
    expect(horizontal.fx).toBe(-5);
    expect(horizontal.my).toBe(-2);
  });

  it('haelt 0 bei 0 und macht daraus kein -0', () => {
    // `0 * -1` ist `-0`, und das stuende als "-0 kN" am Pfeil.
    const [scaled] = effectiveLoads(
      loadCase({ loads: [nodeLoad({ fx: 0, fz: 10 })], factor: -1 }),
    ) as NodeLoad[];

    expect(Object.is(scaled.fx, 0)).toBe(true);
  });

  it('skaliert je Lastart genau die Lastwerte', () => {
    const loads: FEMLoad[] = [
      pointLoad({ p: 10 }),
      uniformLoad({ q: 5 }),
      trapezoidalLoad(),
      momentLoad({ m: 8 }),
      trapezoidalMoment(),
    ];

    const [point, uniform, trapezoid, moment, momentTrapezoid] = effectiveLoads(
      loadCase({ loads, factor: -1 }),
    );

    expect(point).toMatchObject({ p: -10 });
    expect(uniform).toMatchObject({ q: -5 });
    expect(trapezoid).toMatchObject({ q1: -10, q2: -100 });
    expect(moment).toMatchObject({ m: -8 });
    expect(momentTrapezoid).toMatchObject({ m1: -3, m2: -9 });
  });

  it('laesst die GEOMETRIE unangetastet, auch bei negativem Faktor', () => {
    // Der wichtigste Test dieser Datei. Ein naives „alle Zahlen
    // multiplizieren" wuerde hier negative Abstaende erzeugen.
    const [point, trapezoid] = effectiveLoads(
      loadCase({
        loads: [pointLoad({ distanceFromStart: 50 }), trapezoidalLoad()],
        factor: -1,
      }),
    );

    expect(point).toMatchObject({ distanceFromStart: 50, axis: 'z' });
    expect(trapezoid).toMatchObject({
      from: 10,
      to: 80,
      referenceLength: 'trueLength',
    });
  });

  it('behaelt die id — es ist dieselbe Last, durch den Faktor gesehen', () => {
    const [scaled] = effectiveLoads(
      loadCase({ loads: [pointLoad({ id: 'load-42' })], factor: 2 }),
    );

    expect(scaled.id).toBe('load-42');
  });
});

/**
 * DIE INVARIANTE AUS ADR 0013.
 *
 * Das Tor prueft die EINGEGEBENEN Werte, gerechnet und gezeichnet werden die
 * gefakterten. Tragfaehig ist das nur, solange keine Validierungsregel ihr
 * Urteil aendert, wenn der Faktor angewandt wird.
 *
 * Schlaegt dieser Block fehl, ist eine wertabhaengige Regel dazugekommen. Dann
 * ist NICHT dieser Test zu reparieren, sondern die Entscheidung neu zu treffen:
 * entweder prueft das Tor kuenftig die gefakterten Werte (und Meldungen nennen
 * Zahlen, die niemand eingegeben hat), oder die neue Regel muss den Faktor
 * selbst beruecksichtigen.
 */
describe('Invariante: roh gueltig heisst effektiv gueltig', () => {
  const loads: FEMLoad[] = [
    nodeLoad({ fx: 4, fz: 10, my: -6 }),
    pointLoad({ distanceFromStart: 100 }),
    uniformLoad({ beamIds: ['sloped'], referenceLength: 'horizontalProjection' }),
    trapezoidalLoad(),
    momentLoad(),
  ];

  it('haelt fuer die rohen Werte', () => {
    expect(validateLoads(model, loads).errors).toEqual([]);
  });

  it.each([-1, 1.75, -0.5, 1e6])('haelt bei Faktor %s', (factor) => {
    const effective = effectiveLoads(loadCase({ loads, factor }));
    expect(validateLoads(model, effective).errors).toEqual([]);
  });
});
