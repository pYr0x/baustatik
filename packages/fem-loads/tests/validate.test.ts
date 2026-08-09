import { Line, Point } from '@baustatik/fem-geometry';
import { describe, expect, it } from 'vitest';
import {
  BackwardsLoadExtentError,
  DegenerateBeamError,
  DistanceOutOfRangeError,
  EmptyLoadTargetError,
  type LoadValidationError,
  NearlyDegenerateReferenceLengthWarning,
  NegativeDistanceError,
  NonFiniteLoadValueError,
  ReferenceFactorBelowMinimumError,
  UnknownLoadTargetError,
  ZeroBeamLoadError,
  ZeroExtentLoadSegmentWarning,
  ZeroNodeLoadError,
} from '../src/errors';
import type {
  BeamForceConstantLoad,
  BeamForcePointLoad,
  BeamLoad,
  FEMLoad,
  NodeLoad,
} from '../src/types';
import { createLoadValidationPolicy } from '../src/policy';
import {
  assertValidLoads,
  createLoadValidator,
  type LoadModelGeometry,
  validateLoad as checkLoad,
  validateLoads as checkLoads,
} from '../src/validate';

// Die Bloecke bis „Hinweise" pruefen das HARTE Tor. Sie lesen deshalb nur
// `errors`; die Hinweise haben ihren eigenen Block am Ende, samt der Zusage,
// dass die Regelfaelle keinen davon auslesen.
function validateLoad(
  m: LoadModelGeometry,
  load: FEMLoad,
): LoadValidationError[] {
  return checkLoad(m, load).errors;
}

function validateLoads(
  m: LoadModelGeometry,
  loads: readonly FEMLoad[],
): LoadValidationError[] {
  return checkLoads(m, loads).errors;
}

// Dasselbe Modell wie in apps/demo/fem/fem-viewer.ts: ein waagrechter Stab der
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

/**
 * C1: Einzellast, absoluter Abstand vom Stabanfang.
 *
 * Kein `referenceLength`: `p` ist in kN, da gibt es nichts zu skalieren — der
 * Typ traegt das Feld gar nicht erst (`types.ts`, `BeamForceReference`).
 */
function pointLoad(
  load: Partial<BeamForcePointLoad> = {},
): BeamForcePointLoad {
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

/**
 * E3: Trapez auf einem Teilabschnitt.
 *
 * Bleibt bewusst ungetypt, anders als `uniformLoad` und `pointLoad`: die Tests
 * schalten hier zwischen den beiden Varianten von `TrapezoidalExtent` hin und
 * her (`{from, to}` gegen `{fullLength: true}`, siehe den Test zu fullLength).
 * Ein Spread kann eine Union-Variante nicht wechseln — `Partial<...>` waere
 * hier eine Verrenkung, die den Test schlechter lesbar macht als der Cast.
 */
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

  it('lehnt eine Stablast ab, deren Werte alle 0 sind', () => {
    // Symmetrisch zu ZeroNodeLoadError: eine Last, die nichts eintraegt, ist
    // keine Last. Vorher ging das still durch — nur am Knoten war es ein
    // Fehler.
    const zeroLoads: [BeamLoad, string[]][] = [
      [pointLoad({ p: 0 }), ['p']],
      [uniformLoad({ q: 0 }), ['q']],
      [trapezoidalLoad({ q1: 0, q2: 0 }), ['q1', 'q2']],
      [
        {
          id: 'load-1',
          target: 'beam',
          beamIds: ['horizontal'],
          kind: 'moment',
          distribution: 'constant',
          m: 0,
        },
        ['m'],
      ],
      [
        {
          id: 'load-1',
          target: 'beam',
          beamIds: ['horizontal'],
          kind: 'moment',
          distribution: 'trapezoidal',
          m1: 0,
          m2: 0,
          fullLength: true,
        },
        ['m1', 'm2'],
      ],
    ];

    for (const [load, fields] of zeroLoads) {
      const [error] = validateLoad(model, load);
      expect(error).toBeInstanceOf(ZeroBeamLoadError);
      expect((error as ZeroBeamLoadError).fields).toEqual(fields);
    }
  });

  it('laesst die Dreieckslast zu — ein Wert 0 genuegt nicht (E2)', () => {
    // Der Verlauf mit einer Null an einem Ende ist ein vorgesehener Fall.
    // Beanstandet wird nur, wenn KEIN Wert wirkt.
    expect(validateLoad(model, trapezoidalLoad({ q1: 0, q2: 8 }))).toEqual([]);
    expect(validateLoad(model, trapezoidalLoad({ q1: 8, q2: 0 }))).toEqual([]);
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
    expect(errors[0]).toBeInstanceOf(ReferenceFactorBelowMinimumError);
    expect((errors[0] as ReferenceFactorBelowMinimumError).beamId).toBe('horizontal');
  });

  it('lehnt horizontalProjection am senkrechten Stab ab', () => {
    const errors = validateLoad(
      model,
      uniformLoad({
        beamIds: ['vertical'],
        referenceLength: 'horizontalProjection',
      }),
    );
    expect(errors[0]).toBeInstanceOf(ReferenceFactorBelowMinimumError);
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
    ).toBeInstanceOf(ReferenceFactorBelowMinimumError);
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

describe('Hinweise', () => {
  it('gibt fuer die Regelfaelle keine Hinweise aus', () => {
    // Der wichtigste Test des Blocks: eine Warnung, die aus Versehen bei jeder
    // gesunden Last anschlaegt, wird weggeklickt und schuetzt danach nichts.
    for (const load of [
      nodeLoad(),
      pointLoad(),
      uniformLoad(),
      trapezoidalLoad(),
    ]) {
      expect(checkLoad(model, load).warnings).toEqual([]);
    }
  });

  describe('fast entartete Bezugslaenge', () => {
    /** Ein Stab mit gegebener Neigung, Laenge rund 100. */
    function slopedBy(dz: number): LoadModelGeometry {
      return {
        ...model,
        beamAxis: () => Line.make(Point.make(0, 0), Point.make(100, dz)),
      };
    }

    it('warnt beim 0,57-Grad-Stab und nennt den gerechneten Wert', () => {
      // Der namentlich dokumentierte Vertipper: aus q = 5 werden 0,05.
      const { errors, warnings } = checkLoad(
        slopedBy(1),
        uniformLoad({ referenceLength: 'verticalProjection', q: 5 }),
      );

      expect(errors).toEqual([]);
      expect(warnings).toHaveLength(1);
      const warning = warnings[0] as NearlyDegenerateReferenceLengthWarning;
      expect(warning).toBeInstanceOf(NearlyDegenerateReferenceLengthWarning);
      expect(warning.factor).toBeCloseTo(0.01, 4);
      expect(warning.values).toEqual([
        { field: 'q', value: 5, effective: expect.closeTo(0.05, 4) },
      ]);
      // Die Meldung nennt die FOLGE, nicht nur den Faktor.
      expect(warning.message).toContain('5 ->');
    });

    it('warnt bei der Stuetze 1 Grad aus dem Lot', () => {
      const vertical: LoadModelGeometry = {
        ...model,
        beamAxis: () =>
          Line.make(Point.make(0, 0), Point.make(Math.tan(Math.PI / 180) * 50, 50)),
      };

      const { warnings } = checkLoad(
        vertical,
        uniformLoad({ referenceLength: 'horizontalProjection' }),
      );

      expect(warnings[0]).toBeInstanceOf(NearlyDegenerateReferenceLengthWarning);
    });

    it('warnt NICHT beim 5-Grad-Flachdach — das ist ein Realfall', () => {
      // Winddruck auf eine flach geneigte Flaeche, bezogen auf die
      // Ansichtsflaeche. Faktor 0,087, ueber der Schranke von 0,05.
      const { warnings } = checkLoad(
        slopedBy(Math.tan((5 * Math.PI) / 180) * 100),
        uniformLoad({ referenceLength: 'verticalProjection' }),
      );

      expect(warnings).toEqual([]);
    });

    it('warnt nicht zusaetzlich, wo der Faktor bereits ein FEHLER ist', () => {
      const { errors, warnings } = checkLoad(
        model,
        uniformLoad({ referenceLength: 'verticalProjection' }),
      );

      expect(errors[0]).toBeInstanceOf(ReferenceFactorBelowMinimumError);
      expect(warnings).toEqual([]);
    });
  });

  describe('Lastabschnitt ohne Ausdehnung', () => {
    it('warnt bei from === to', () => {
      const { errors, warnings } = checkLoad(
        model,
        trapezoidalLoad({ from: 30, to: 30 }),
      );

      expect(errors).toEqual([]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toBeInstanceOf(ZeroExtentLoadSegmentWarning);
      expect(warnings[0]).toMatchObject({ at: 30, relative: false });
    });

    it('nennt bei relativen Abstaenden die Prozentangabe', () => {
      const { warnings } = checkLoad(
        model,
        trapezoidalLoad({ from: 40, to: 40, relativeDistances: true }),
      );

      expect(warnings[0]).toMatchObject({ at: 40, relative: true });
      expect(warnings[0]?.message).toContain('40 %');
    });

    it('warnt nicht zusaetzlich, wenn der Abschnitt rueckwaerts laeuft', () => {
      const { errors, warnings } = checkLoad(
        model,
        trapezoidalLoad({ from: 60, to: 20 }),
      );

      expect(errors[0]).toBeInstanceOf(BackwardsLoadExtentError);
      expect(warnings).toEqual([]);
    });
  });

  it('haelt assertValidLoads nicht auf', () => {
    // Der ganze Sinn der zweiten Hierarchie: die Eingabe ist zulaessig.
    expect(() =>
      assertValidLoads(model, [trapezoidalLoad({ from: 30, to: 30 })]),
    ).not.toThrow();
  });
});

describe('validateLoad — die Schranken der Policy', () => {
  /** Ein 3-4-5-Stab: der Faktor ist exakt 0,6 bzw. 0,8, ohne Rundungsrest. */
  const exact: LoadModelGeometry = {
    ...model,
    beamAxis: () => Line.make(Point.make(0, 0), Point.make(3, 4)),
  };

  it('haelt den EXAKTEN Faktor 0 auch bei minimumReferenceFactor 0 fest', () => {
    // Die Invariante, die keine Policy wegdrehen darf: sie haengt allein am
    // `<=` in validate.ts. Eine Last, deren Bezugslaenge am Stab exakt 0 misst,
    // traegt nichts ein — das bleibt ein Fehler, egal wie die Schranke steht.
    const validator = createLoadValidator(
      createLoadValidationPolicy({ minimumReferenceFactor: 0 }),
    );

    const { errors } = validator.validateLoad(
      model,
      uniformLoad({ referenceLength: 'verticalProjection' }),
    );

    expect(errors[0]).toBeInstanceOf(ReferenceFactorBelowMinimumError);
    expect(errors[0]).toMatchObject({ factor: 0, minimumReferenceFactor: 0 });
  });

  it('lehnt genau AUF der Mindestschranke ab und knapp darueber nicht', () => {
    const load = uniformLoad({ referenceLength: 'horizontalProjection' });

    // factor === 0.6 === minimumReferenceFactor -> `<=` schlaegt an.
    expect(
      createLoadValidator(
        createLoadValidationPolicy({
          minimumReferenceFactor: 0.6,
          suspiciousReferenceFactor: 0.7,
        }),
      ).validateLoad(exact, load).errors[0],
    ).toBeInstanceOf(ReferenceFactorBelowMinimumError);

    expect(
      createLoadValidator(
        createLoadValidationPolicy({
          minimumReferenceFactor: 0.5,
          suspiciousReferenceFactor: 0.6,
        }),
      ).validateLoad(exact, load).errors,
    ).toEqual([]);
  });

  it('warnt unterhalb der Warnschwelle, nicht auf ihr', () => {
    const load = uniformLoad({ referenceLength: 'horizontalProjection' });

    // factor === 0.6 === suspiciousReferenceFactor -> `<` schlaegt NICHT an.
    expect(
      createLoadValidator(
        createLoadValidationPolicy({ suspiciousReferenceFactor: 0.6 }),
      ).validateLoad(exact, load).warnings,
    ).toEqual([]);

    const { warnings } = createLoadValidator(
      createLoadValidationPolicy({ suspiciousReferenceFactor: 0.7 }),
    ).validateLoad(exact, load);

    expect(warnings[0]).toBeInstanceOf(NearlyDegenerateReferenceLengthWarning);
    // Der Befund nennt die AKTIVE Schranke — sonst liesse sich bei
    // abweichender Policy nicht sagen, wogegen der Faktor gemessen wurde.
    expect(warnings[0]).toMatchObject({
      factor: 0.6,
      suspiciousReferenceFactor: 0.7,
    });
  });

  it('vergleicht Stationen gegen die Stablaenge mit der eingestellten Toleranz', () => {
    // Genau an der Default-Toleranz: geht durch, weil `>` und nicht `>=`.
    const atTolerance = pointLoad({ distanceFromStart: 100 * (1 + 1e-9) });

    expect(validateLoad(model, atTolerance)).toEqual([]);

    // Ohne Toleranz ist derselbe Abstand zu weit.
    expect(
      createLoadValidator(
        createLoadValidationPolicy({ stationRelativeTolerance: 0 }),
      ).validateLoad(model, atTolerance).errors[0],
    ).toBeInstanceOf(DistanceOutOfRangeError);

    // Und mit einer grosszuegigen Toleranz auch ein deutlich groesserer.
    expect(
      createLoadValidator(
        createLoadValidationPolicy({ stationRelativeTolerance: 0.1 }),
      ).validateLoad(model, pointLoad({ distanceFromStart: 105 })).errors,
    ).toEqual([]);
    expect(
      validateLoad(model, pointLoad({ distanceFromStart: 105 }))[0],
    ).toBeInstanceOf(DistanceOutOfRangeError);
  });

  it('laesst die Stationstoleranz die relative Obergrenze unberuehrt', () => {
    // 100 % ist die DEFINITION von „relativ", keine gerechnete Stablaenge —
    // an dieser Grenze hat die Policy nichts zu suchen.
    expect(
      createLoadValidator(
        createLoadValidationPolicy({ stationRelativeTolerance: 0.5 }),
      ).validateLoad(
        model,
        pointLoad({ distanceFromStart: 120, relativeDistances: true }),
      ).errors[0],
    ).toBeInstanceOf(DistanceOutOfRangeError);
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
