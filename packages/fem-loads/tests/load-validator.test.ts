import { Line, Point } from '@baustatik/fem-geometry';
import { describe, expect, it } from 'vitest';
import {
  NearlyDegenerateReferenceLengthWarning,
  ReferenceFactorBelowMinimumError,
} from '../src/errors';
import { createLoadValidationPolicy } from '../src/policy';
import type { BeamForceConstantLoad, FEMLoad } from '../src/types';
import {
  assertValidLoads,
  createLoadValidator,
  type LoadModelGeometry,
  validateLoad,
  validateLoads,
} from '../src/validate';

/**
 * Ein 3-4-5-Stab: `horizontalProjection` gibt exakt 0,6, ohne Rundungsrest.
 * Damit liegt jede Schranke im Test genau dort, wo sie hingeschrieben wird.
 */
const model: LoadModelGeometry = {
  hasNode: (nodeId) => nodeId === 'n1',
  beamAxis: (beamId) =>
    beamId === 'b1' ? Line.make(Point.make(0, 0), Point.make(3, 4)) : undefined,
};

function projected(load: Partial<BeamForceConstantLoad> = {}): FEMLoad {
  return {
    id: 'load-1',
    target: 'beam',
    beamIds: ['b1'],
    kind: 'force',
    distribution: 'constant',
    frame: 'global',
    axis: 'z',
    referenceLength: 'horizontalProjection',
    q: 5,
    ...load,
  };
}

/** Lehnt alles bis 0,7 ab — der Faktor 0,6 faellt darunter. */
const strict = createLoadValidationPolicy({
  minimumReferenceFactor: 0.7,
  suspiciousReferenceFactor: 0.8,
});

describe('die freien Exporte sind der Default-Validator', () => {
  it('liefert fuer jede Last dasselbe wie createLoadValidator()', () => {
    const bound = createLoadValidator();
    const loads: FEMLoad[] = [
      projected(),
      projected({ id: 'load-2', referenceLength: 'verticalProjection' }),
      { id: 'load-3', target: 'node', nodeIds: ['n1'], fz: 0 },
      { id: 'load-4', target: 'node', nodeIds: ['ghost'], fz: 3 },
    ];

    for (const load of loads) {
      expect(validateLoad(model, load)).toEqual(bound.validateLoad(model, load));
    }
    expect(validateLoads(model, loads)).toEqual(
      bound.validateLoads(model, loads),
    );
  });

  it('wirft dort, wo der gebundene Default-Validator wirft', () => {
    const bound = createLoadValidator();
    const loads: FEMLoad[] = [{ id: 'l1', target: 'node', nodeIds: [], fz: 3 }];

    expect(() => assertValidLoads(model, loads)).toThrow();
    expect(() => bound.assertValidLoads(model, loads)).toThrow();
  });

  it('laesst den Regelfall bei beiden durch', () => {
    // Faktor 0,6 ist unter der Default-Policy voellig unauffaellig.
    expect(validateLoad(model, projected())).toEqual({
      errors: [],
      warnings: [],
    });
  });
});

describe('ein Validator mit abweichender Policy', () => {
  it('aendert alle drei Ausgaenge', () => {
    const validator = createLoadValidator(strict);
    const loads = [projected()];

    expect(validator.validateLoad(model, loads[0]).errors[0]).toBeInstanceOf(
      ReferenceFactorBelowMinimumError,
    );
    expect(validator.validateLoads(model, loads).errors[0]).toBeInstanceOf(
      ReferenceFactorBelowMinimumError,
    );
    expect(() => validator.assertValidLoads(model, loads)).toThrow(
      ReferenceFactorBelowMinimumError,
    );

    // Gegenprobe: derselbe Fall geht am Default-Validator durch. Genau diese
    // Diskrepanz ist der Grund, warum die Policy gebunden wird und nicht als
    // vergessbares drittes Argument herumliegt.
    expect(validateLoads(model, loads).errors).toEqual([]);
    expect(() => assertValidLoads(model, loads)).not.toThrow();
  });

  it('reicht die gebundene Policy an JEDE Einzelpruefung durch', () => {
    const validator = createLoadValidator(strict);

    const { errors } = validator.validateLoads(model, [
      projected({ id: 'load-1' }),
      projected({ id: 'load-2' }),
      { id: 'load-3', target: 'node', nodeIds: ['n1'], fz: 3 },
    ]);

    expect(errors.map((error) => error.loadId)).toEqual(['load-1', 'load-2']);
    expect(errors[0]).toMatchObject({ factor: 0.6, minimumReferenceFactor: 0.7 });
  });

  it('verschiebt auch die Warnschwelle', () => {
    const validator = createLoadValidator(
      createLoadValidationPolicy({ suspiciousReferenceFactor: 0.65 }),
    );

    const { errors, warnings } = validator.validateLoad(model, projected());

    expect(errors).toEqual([]);
    expect(warnings[0]).toBeInstanceOf(NearlyDegenerateReferenceLengthWarning);
    expect(warnings[0]).toMatchObject({ suspiciousReferenceFactor: 0.65 });
  });

  it('bleibt beim Default, wenn die Fabrik ohne Policy gerufen wird', () => {
    expect(createLoadValidator().validateLoad(model, projected())).toEqual({
      errors: [],
      warnings: [],
    });
  });
});
