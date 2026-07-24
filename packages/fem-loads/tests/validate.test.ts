import { Line, Point } from '@baustatik/fem-geometry';
import { describe, expect, it } from 'vitest';
import {
  BackwardsLoadExtentError,
  DegenerateBeamError,
  DistanceOutOfRangeError,
  EmptyLoadTargetError,
  NegativeDistanceError,
  NonFiniteLoadValueError,
  UnknownLoadTargetError,
  ZeroNodeLoadError,
  ZeroProjectedLengthError,
} from '../src/errors';
import type { BeamLoad, NodeLoad } from '../src/types';
import {
  assertValidLoads,
  type LoadModelGeometry,
  validateLoad,
  validateLoads,
} from '../src/validate';

// Dasselbe Modell wie in apps/demo/fem-viewer.ts: ein waagrechter Stab der
// Laenge 100 und ein schraeger Stab nach oben (z zeigt abwaerts). Dazu ein
// senkrechter Stab als Gegenprobe fuer die Bezugslaenge.
const HORIZONTAL = Line.make(Point.make(0, 0), Point.make(100, 0));
const SLOPED = Line.make(Point.make(100, 0), Point.make(160, -40));
const VERTICAL = Line.make(Point.make(0, 0), Point.make(0, 50));
const SHORT = Line.make(Point.make(0, 0), Point.make(10, 0));

const model: LoadModelGeometry = {
  hasNode: (nodeId) => ['n1', 'n2', 'n3'].includes(nodeId),
  beamAxis: (beamId) =>
    ({
      horizontal: HORIZONTAL,
      sloped: SLOPED,
      vertical: VERTICAL,
      short: SHORT,
      degenerate: Line.make(Point.make(5, 5), Point.make(5, 5)),
    })[beamId],
};

function nodeLoad(load: Partial<NodeLoad> = {}): NodeLoad {
  return { id: 'load-1', target: 'node', nodeIds: ['n1'], fz: 10, ...load };
}

/** D1 aus dem Pseudocode: Gleichlast global nach unten. */
function uniformLoad(load: Partial<BeamLoad> = {}): BeamLoad {
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
  } as BeamLoad;
}

/** C1: Einzellast, absoluter Abstand vom Stabanfang. */
function pointLoad(load: Record<string, unknown> = {}): BeamLoad {
  return {
    id: 'load-1',
    target: 'beam',
    beamIds: ['horizontal'],
    kind: 'force',
    distribution: 'point',
    frame: 'global',
    axis: 'z',
    // Kein `referenceLength`: `p` ist in kN, da gibt es nichts zu skalieren.
    p: 10,
    distanceFromStart: 50,
    ...load,
  } as BeamLoad;
}

/** E3: Trapez auf einem Teilabschnitt. */
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
    from: 0,
    to: 33.333,
    ...load,
  } as BeamLoad;
}

describe('validateLoad — Knotenlast', () => {
  it('nimmt die Faelle A1 bis A5 des Pseudocodes an', () => {
    expect(validateLoad(model, nodeLoad({ fz: 10 }))).toEqual([]);
    expect(validateLoad(model, nodeLoad({ fx: 5, fz: undefined }))).toEqual([]);
    expect(validateLoad(model, nodeLoad({ fz: undefined, my: 12 }))).toEqual([]);
    expect(
      validateLoad(model, nodeLoad({ fx: 5, fz: 10, my: 12 })),
    ).toEqual([]);
  });

  it('erlaubt dieselbe Last an mehreren Knoten (A6)', () => {
    expect(validateLoad(model, nodeLoad({ nodeIds: ['n1', 'n2'] }))).toEqual([]);
  });

  it('lehnt eine leere Ziel-Liste ab', () => {
    const [error, ...rest] = validateLoad(model, nodeLoad({ nodeIds: [] }));
    expect(error).toBeInstanceOf(EmptyLoadTargetError);
    expect(rest).toEqual([]);
  });

  it('lehnt unbekannte Knoten ab und nennt die id', () => {
    const errors = validateLoad(model, nodeLoad({ nodeIds: ['n1', 'ghost'] }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(UnknownLoadTargetError);
    expect((errors[0] as UnknownLoadTargetError).targetId).toBe('ghost');
  });

  it('verlangt mindestens eine wirkende Komponente', () => {
    expect(validateLoad(model, nodeLoad({ fz: undefined }))[0]).toBeInstanceOf(
      ZeroNodeLoadError,
    );
    expect(
      validateLoad(model, nodeLoad({ fx: 0, fz: 0, my: 0 }))[0],
    ).toBeInstanceOf(ZeroNodeLoadError);
  });

  it('lehnt NaN ab, statt es in die Rechnung zu lassen', () => {
    const errors = validateLoad(model, nodeLoad({ fz: Number.NaN }));
    expect(errors[0]).toBeInstanceOf(NonFiniteLoadValueError);
    expect((errors[0] as NonFiniteLoadValueError).field).toBe('fz');
    // NaN wirkt nicht — deshalb faellt zusaetzlich die Wirkungspruefung an.
    expect(errors[1]).toBeInstanceOf(ZeroNodeLoadError);
  });
});

describe('validateLoad — Stablast, Ziele und Werte', () => {
  it('nimmt die Regelfaelle C1, D1 und E3 an', () => {
    expect(validateLoad(model, pointLoad())).toEqual([]);
    expect(validateLoad(model, uniformLoad())).toEqual([]);
    expect(validateLoad(model, trapezoidalLoad())).toEqual([]);
  });

  it('lehnt eine leere Stabliste und unbekannte Staebe ab', () => {
    expect(
      validateLoad(model, uniformLoad({ beamIds: [] }))[0],
    ).toBeInstanceOf(EmptyLoadTargetError);
    expect(
      validateLoad(model, uniformLoad({ beamIds: ['ghost'] }))[0],
    ).toBeInstanceOf(UnknownLoadTargetError);
  });

  it('meldet den entarteten Stab, statt spaeter durch L = 0 zu teilen', () => {
    expect(
      validateLoad(model, uniformLoad({ beamIds: ['degenerate'] }))[0],
    ).toBeInstanceOf(DegenerateBeamError);
  });

  it('prueft die Lastwerte jeder Variante auf Endlichkeit', () => {
    const cases: [BeamLoad, string][] = [
      [pointLoad({ p: Number.NaN }), 'p'],
      [uniformLoad({ q: Number.POSITIVE_INFINITY }), 'q'],
      [trapezoidalLoad({ q2: Number.NaN }), 'q2'],
      [
        {
          id: 'load-1',
          target: 'beam',
          beamIds: ['horizontal'],
          kind: 'moment',
          distribution: 'point',
          m: Number.NaN,
          distanceFromStart: 50,
        },
        'm',
      ],
      [
        {
          id: 'load-1',
          target: 'beam',
          beamIds: ['horizontal'],
          kind: 'moment',
          distribution: 'trapezoidal',
          m1: 2,
          m2: Number.NaN,
          fullLength: true,
        },
        'm2',
      ],
    ];
    for (const [load, field] of cases) {
      const errors = validateLoad(model, load);
      expect(errors[0]).toBeInstanceOf(NonFiniteLoadValueError);
      expect((errors[0] as NonFiniteLoadValueError).field).toBe(field);
    }
  });
});

describe('validateLoad — Abstaende', () => {
  it('nimmt einen Abstand genau am Stabende an', () => {
    expect(validateLoad(model, pointLoad({ distanceFromStart: 100 }))).toEqual(
      [],
    );
    // Der schraege Stab ist sqrt(60^2 + 40^2) lang — keine glatte Zahl.
    expect(
      validateLoad(
        model,
        pointLoad({
          beamIds: ['sloped'],
          distanceFromStart: Math.hypot(60, 40),
        }),
      ),
    ).toEqual([]);
  });

  it('lehnt einen Abstand jenseits des Stabendes ab', () => {
    const errors = validateLoad(model, pointLoad({ distanceFromStart: 120 }));
    expect(errors[0]).toBeInstanceOf(DistanceOutOfRangeError);
    expect((errors[0] as DistanceOutOfRangeError).limit).toBe(100);
    expect((errors[0] as DistanceOutOfRangeError).beamId).toBe('horizontal');
  });

  it('lehnt negative Abstaende ab', () => {
    expect(
      validateLoad(model, pointLoad({ distanceFromStart: -1 }))[0],
    ).toBeInstanceOf(NegativeDistanceError);
    expect(
      validateLoad(model, trapezoidalLoad({ from: -5, to: 10 }))[0],
    ).toBeInstanceOf(NegativeDistanceError);
  });

  it('lehnt einen nicht endlichen Abstand ab, ohne ihn zu vergleichen', () => {
    const errors = validateLoad(
      model,
      pointLoad({ distanceFromStart: Number.NaN }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(NonFiniteLoadValueError);
    expect((errors[0] as NonFiniteLoadValueError).field).toBe(
      'distanceFromStart',
    );
  });

  it('lehnt einen rueckwaerts laufenden Lastabschnitt ab', () => {
    const errors = validateLoad(model, trapezoidalLoad({ from: 60, to: 20 }));
    expect(errors[0]).toBeInstanceOf(BackwardsLoadExtentError);
  });

  it('misst relative Abstaende gegen 100 % statt gegen die Stablaenge', () => {
    // 50 % passt auf jeden Stab, auch auf den kurzen.
    expect(
      validateLoad(
        model,
        pointLoad({
          beamIds: ['horizontal', 'short'],
          distanceFromStart: 50,
          relativeDistances: true,
        }),
      ),
    ).toEqual([]);

    const errors = validateLoad(
      model,
      pointLoad({ distanceFromStart: 150, relativeDistances: true }),
    );
    expect(errors[0]).toBeInstanceOf(DistanceOutOfRangeError);
    expect((errors[0] as DistanceOutOfRangeError).limit).toBe(100);
    // Ohne Geometrie geprueft: die Beanstandung haengt an keinem Stab.
    expect((errors[0] as DistanceOutOfRangeError).beamId).toBeUndefined();
  });

  it('prueft absolute Abstaende je Stab', () => {
    const errors = validateLoad(
      model,
      pointLoad({ beamIds: ['horizontal', 'short'], distanceFromStart: 50 }),
    );
    expect(errors).toHaveLength(1);
    expect((errors[0] as DistanceOutOfRangeError).beamId).toBe('short');
  });

  it('prueft bei fullLength und bei der Gleichlast keine Abstaende', () => {
    expect(
      validateLoad(
        model,
        trapezoidalLoad({
          beamIds: ['short'],
          from: undefined,
          to: undefined,
          fullLength: true,
        }),
      ),
    ).toEqual([]);
    expect(validateLoad(model, uniformLoad({ beamIds: ['short'] }))).toEqual([]);
  });
});

describe('validateLoad — Bezugslaenge', () => {
  it('nimmt den Schneefall auf dem schraegen Stab an (D4)', () => {
    expect(
      validateLoad(
        model,
        uniformLoad({
          beamIds: ['sloped'],
          referenceLength: 'horizontalProjection',
          q: 0.85,
        }),
      ),
    ).toEqual([]);
  });

  it('lehnt verticalProjection am waagrechten Stab ab', () => {
    const errors = validateLoad(
      model,
      uniformLoad({ referenceLength: 'verticalProjection' }),
    );
    expect(errors[0]).toBeInstanceOf(ZeroProjectedLengthError);
    expect((errors[0] as ZeroProjectedLengthError).beamId).toBe('horizontal');
  });

  it('lehnt horizontalProjection am senkrechten Stab ab', () => {
    const errors = validateLoad(
      model,
      uniformLoad({
        beamIds: ['vertical'],
        referenceLength: 'horizontalProjection',
      }),
    );
    expect(errors[0]).toBeInstanceOf(ZeroProjectedLengthError);
  });

  it('nimmt die jeweils andere Projektion am selben Stab an', () => {
    expect(
      validateLoad(
        model,
        uniformLoad({ referenceLength: 'horizontalProjection' }),
      ),
    ).toEqual([]);
    expect(
      validateLoad(
        model,
        uniformLoad({
          beamIds: ['vertical'],
          referenceLength: 'verticalProjection',
        }),
      ),
    ).toEqual([]);
  });

  it('prueft die Bezugslaenge auch am Trapez', () => {
    expect(
      validateLoad(
        model,
        trapezoidalLoad({ referenceLength: 'verticalProjection' })
      )[0],
    ).toBeInstanceOf(ZeroProjectedLengthError);
  });

  it('laesst die wirkungslose Bezugslaenge der Einzellast unbeanstandet', () => {
    // p ist in kN angegeben, nicht je Laenge — referenceLength hat dort keine
    // Wirkung und darf deshalb auch nicht zum Fehler fuehren.
    expect(
      validateLoad(model, pointLoad({ referenceLength: 'verticalProjection' })),
    ).toEqual([]);
  });

  it('kennt bei der Momentlast gar keine Bezugslaenge (F3)', () => {
    expect(
      validateLoad(model, {
        id: 'load-1',
        target: 'beam',
        beamIds: ['horizontal'],
        kind: 'moment',
        distribution: 'constant',
        m: 2,
      }),
    ).toEqual([]);
  });
});

describe('validateLoads und assertValidLoads', () => {
  it('sammelt die Beanstandungen aller Lasten in Eingabereihenfolge', () => {
    const errors = validateLoads(model, [
      uniformLoad(),
      nodeLoad({ id: 'load-2', fz: 0 }),
      uniformLoad({ id: 'load-3', beamIds: ['ghost'] }),
    ]);
    expect(errors.map((error) => error.loadId)).toEqual(['load-2', 'load-3']);
  });

  it('wirft den ersten Fehler als benannte Klasse', () => {
    expect(() =>
      assertValidLoads(model, [nodeLoad({ nodeIds: ['ghost'] })]),
    ).toThrow(UnknownLoadTargetError);
  });

  it('wirft nicht, wenn alles zulaessig ist', () => {
    expect(() =>
      assertValidLoads(model, [nodeLoad(), uniformLoad(), pointLoad()]),
    ).not.toThrow();
  });
});
