import type { CrossSection, Idealisation, ShapeSpec } from '@baustatik/cross-section';
import { BaustatikError } from '@baustatik/errors';
import { assertValidModel } from '@baustatik/fem';
import {
  assertValidLoadCase,
  assertValidLoads,
  type BeamLoad,
  type FEMLoad,
  type LoadCase,
  modelGeometry,
  type NodeLoad,
} from '@baustatik/fem-loads';
import type { FEMModelSnapshot } from './types';

export class SnapshotValidationError extends BaustatikError {}

export function parseFEMModelSnapshot(input: unknown): FEMModelSnapshot {
  const snapshot = record(input, 'Snapshot');
  exactKeys(snapshot, 'Snapshot', [
    'schemaVersion',
    'nodes',
    'beams',
    'crossSections',
    'supports',
    'loadCases',
  ]);
  // Ein v1-Snapshot wird ABGELEHNT und nicht um ein leeres `crossSections`
  // ergaenzt: er beschreibt ein Modell, dessen `crossSectionId` ins Leere
  // zeigt. Ein stillschweigendes Ergaenzen taeuschte vor, es liesse sich
  // rechnen.
  if (snapshot.schemaVersion !== 2) {
    fail('Snapshot.schemaVersion muss 2 sein.');
  }

  const nodes = array(snapshot.nodes, 'Snapshot.nodes').map((value, index) => {
    const node = record(value, `Snapshot.nodes[${index}]`);
    exactKeys(node, `Snapshot.nodes[${index}]`, ['id', 'position']);
    const position = record(node.position, `Snapshot.nodes[${index}].position`);
    exactKeys(position, `Snapshot.nodes[${index}].position`, ['x', 'z']);
    return {
      id: text(node.id, `Snapshot.nodes[${index}].id`),
      position: {
        x: finite(position.x, `Snapshot.nodes[${index}].position.x`),
        z: finite(position.z, `Snapshot.nodes[${index}].position.z`),
      },
    };
  });

  const beams = array(snapshot.beams, 'Snapshot.beams').map((value, index) => {
    const beam = record(value, `Snapshot.beams[${index}]`);
    exactKeys(beam, `Snapshot.beams[${index}]`, [
      'id',
      'startNodeId',
      'endNodeId',
      'crossSectionId',
      'materialId',
      'releases',
    ]);
    return {
      id: text(beam.id, `Snapshot.beams[${index}].id`),
      startNodeId: text(
        beam.startNodeId,
        `Snapshot.beams[${index}].startNodeId`,
      ),
      endNodeId: text(beam.endNodeId, `Snapshot.beams[${index}].endNodeId`),
      crossSectionId: text(
        beam.crossSectionId,
        `Snapshot.beams[${index}].crossSectionId`,
      ),
      materialId: text(beam.materialId, `Snapshot.beams[${index}].materialId`),
      ...(beam.releases === undefined
        ? {}
        : {
            releases: releases(
              beam.releases,
              `Snapshot.beams[${index}].releases`,
            ),
          }),
    };
  });

  const crossSections = array(
    snapshot.crossSections,
    'Snapshot.crossSections',
  ).map((value, index) =>
    parseCrossSection(value, `Snapshot.crossSections[${index}]`),
  );

  const supports = array(snapshot.supports, 'Snapshot.supports').map(
    (value, index) => {
      const support = record(value, `Snapshot.supports[${index}]`);
      exactKeys(support, `Snapshot.supports[${index}]`, [
        'id',
        'nodeId',
        'ux',
        'uz',
        'phiY',
      ]);
      return {
        id: text(support.id, `Snapshot.supports[${index}].id`),
        nodeId: text(support.nodeId, `Snapshot.supports[${index}].nodeId`),
        ux: restraint(support.ux, `Snapshot.supports[${index}].ux`),
        uz: restraint(support.uz, `Snapshot.supports[${index}].uz`),
        phiY: restraint(support.phiY, `Snapshot.supports[${index}].phiY`),
      };
    },
  );

  const loadIds = new Set<string>();
  const loadCases = array(snapshot.loadCases, 'Snapshot.loadCases').map(
    (value, index): LoadCase => {
      const path = `Snapshot.loadCases[${index}]`;
      const loadCase = record(value, path);
      exactKeys(loadCase, path, ['id', 'name', 'loads', 'factor', 'category']);
      const loads = array(loadCase.loads, `${path}.loads`).map(
        (load, loadIndex) =>
          parseLoad(load, `${path}.loads[${loadIndex}]`, loadIds),
      );
      return {
        id: text(loadCase.id, `${path}.id`),
        name: text(loadCase.name, `${path}.name`, true),
        loads,
        ...(loadCase.factor === undefined
          ? {}
          : { factor: finite(loadCase.factor, `${path}.factor`) }),
        ...(loadCase.category === undefined
          ? {}
          : {
              category: actionCategory(loadCase.category, `${path}.category`),
            }),
      };
    },
  );

  unique(nodes, 'Knoten');
  unique(beams, 'Stab');
  unique(crossSections, 'Querschnitt');
  unique(supports, 'Lager');
  unique(loadCases, 'Lastfall');

  assertValidModel(nodes, beams, supports);
  const geometry = modelGeometry(nodes, beams);
  for (const loadCase of loadCases) {
    assertValidLoadCase(loadCase);
    assertValidLoads(geometry, loadCase.loads);
  }

  return { schemaVersion: 2, nodes, beams, crossSections, supports, loadCases };
}

/**
 * Der Querschnitt an der Snapshot-Grenze.
 *
 * NUR DIE GESTALT, nicht die Aufloesbarkeit: ob ein `profileId` im Katalog
 * steht oder ob ein Stab auf einen vorhandenen Querschnitt zeigt, prueft diese
 * Stelle NICHT. Beides meldet der Bericht des Solvers als Modellfehler
 * (`UnknownSectionStiffnessError`), und eine zweite Regel an der zweiten Stelle
 * gaebe zwei Wahrheiten darueber, was ein gueltiges Modell ist.
 *
 * `idealisation` ist Pflicht, wo `ShapeSpec` es verlangt — ein fehlendes Feld
 * hier stillschweigend auf `'solid'` zu setzen, waere genau der Default, den
 * `cross-section` bewusst nicht anbietet.
 */
function parseCrossSection(input: unknown, path: string): CrossSection {
  const value = record(input, path);
  const kind = oneOf(value.kind, ['shape', 'profile'] as const, `${path}.kind`);
  const id = text(value.id, `${path}.id`);

  if (kind === 'profile') {
    exactKeys(value, path, ['kind', 'id', 'profileId']);
    return {
      kind,
      id,
      profileId: text(value.profileId, `${path}.profileId`),
    };
  }

  exactKeys(value, path, ['kind', 'id', 'shape']);
  return { kind, id, shape: parseShape(value.shape, `${path}.shape`) };
}

function parseShape(input: unknown, path: string): ShapeSpec {
  const value = record(input, path);
  const kind = oneOf(
    value.kind,
    ['rectangle', 'hollow-rectangle', 'i-symmetric', 't-beam'] as const,
    `${path}.kind`,
  );
  const size = (key: string) => positive(value[key], `${path}.${key}`);

  switch (kind) {
    case 'rectangle':
      // Das Vollrechteck traegt KEIN `idealisation`: ein duennwandiges
      // Vollrechteck gibt es nicht.
      exactKeys(value, path, ['kind', 'b', 'h']);
      return { kind, b: size('b'), h: size('h') };
    case 'hollow-rectangle':
      exactKeys(value, path, ['kind', 'b', 'h', 't', 'idealisation']);
      return {
        kind,
        b: size('b'),
        h: size('h'),
        t: size('t'),
        idealisation: parseIdealisation(value.idealisation, path),
      };
    case 'i-symmetric':
      exactKeys(value, path, ['kind', 'h', 'b', 'tw', 'tf', 'idealisation']);
      return {
        kind,
        h: size('h'),
        b: size('b'),
        tw: size('tw'),
        tf: size('tf'),
        idealisation: parseIdealisation(value.idealisation, path),
      };
    case 't-beam':
      exactKeys(value, path, ['kind', 'bf', 'hf', 'bw', 'h', 'idealisation']);
      return {
        kind,
        bf: size('bf'),
        hf: size('hf'),
        bw: size('bw'),
        h: size('h'),
        idealisation: parseIdealisation(value.idealisation, path),
      };
  }
}

function parseIdealisation(value: unknown, path: string): Idealisation {
  return oneOf(
    value,
    ['solid', 'thin-walled'] as const,
    `${path}.idealisation`,
  );
}

/** Eine Abmessung. Null und negativ sind keine Masse, sondern Tippfehler. */
function positive(value: unknown, path: string): number {
  const number = finite(value, path);
  if (number <= 0) fail(`${path} muss groesser als 0 sein.`);
  return number;
}

function parseLoad(input: unknown, path: string, ids: Set<string>): FEMLoad {
  const load = record(input, path);
  const id = text(load.id, `${path}.id`);
  if (ids.has(id)) fail(`Die Last-ID "${id}" kommt mehrfach vor.`);
  ids.add(id);

  const common = {
    id,
    ...(load.comment === undefined
      ? {}
      : { comment: text(load.comment, `${path}.comment`, true) }),
    ...(load.origin === undefined
      ? {}
      : { origin: origin(load.origin, `${path}.origin`) }),
  };

  if (load.target === 'node') {
    exactKeys(load, path, [
      'id',
      'target',
      'nodeIds',
      'fx',
      'fz',
      'my',
      'origin',
      'comment',
    ]);
    const result: NodeLoad = {
      ...common,
      target: 'node',
      nodeIds: stringArray(load.nodeIds, `${path}.nodeIds`),
      ...(load.fx === undefined ? {} : { fx: finite(load.fx, `${path}.fx`) }),
      ...(load.fz === undefined ? {} : { fz: finite(load.fz, `${path}.fz`) }),
      ...(load.my === undefined ? {} : { my: finite(load.my, `${path}.my`) }),
    };
    return result;
  }

  if (load.target !== 'beam')
    fail(`${path}.target muss "node" oder "beam" sein.`);
  const beamIds = stringArray(load.beamIds, `${path}.beamIds`);

  if (load.kind === 'force') {
    const direction = {
      frame: oneOf(load.frame, ['global', 'local'] as const, `${path}.frame`),
      axis: oneOf(load.axis, ['x', 'z'] as const, `${path}.axis`),
    };
    if (load.distribution === 'point') {
      exactKeys(load, path, [
        ...beamLoadBaseKeys,
        'frame',
        'axis',
        'p',
        'distanceFromStart',
        'relativeDistances',
      ]);
      return {
        ...common,
        ...direction,
        ...placementFields(load, path),
        target: 'beam',
        beamIds,
        kind: 'force',
        distribution: 'point',
        p: finite(load.p, `${path}.p`),
      };
    }
    const referenceLength = oneOf(
      load.referenceLength,
      ['trueLength', 'horizontalProjection', 'verticalProjection'] as const,
      `${path}.referenceLength`,
    );
    if (load.distribution === 'constant') {
      exactKeys(load, path, [
        ...beamLoadBaseKeys,
        'frame',
        'axis',
        'referenceLength',
        'q',
      ]);
      return {
        ...common,
        ...direction,
        target: 'beam',
        beamIds,
        kind: 'force',
        distribution: 'constant',
        referenceLength,
        q: finite(load.q, `${path}.q`),
      };
    }
    if (load.distribution === 'trapezoidal') {
      exactKeys(load, path, [
        ...beamLoadBaseKeys,
        'frame',
        'axis',
        'referenceLength',
        'q1',
        'q2',
        ...extentKeys,
      ]);
      return {
        ...common,
        ...direction,
        ...extentFields(load, path),
        target: 'beam',
        beamIds,
        kind: 'force',
        distribution: 'trapezoidal',
        referenceLength,
        q1: finite(load.q1, `${path}.q1`),
        q2: finite(load.q2, `${path}.q2`),
      } as BeamLoad;
    }
  }

  if (load.kind === 'moment') {
    if (load.distribution === 'point') {
      exactKeys(load, path, [
        ...beamLoadBaseKeys,
        'm',
        'distanceFromStart',
        'relativeDistances',
      ]);
      return {
        ...common,
        ...placementFields(load, path),
        target: 'beam',
        beamIds,
        kind: 'moment',
        distribution: 'point',
        m: finite(load.m, `${path}.m`),
      };
    }
    if (load.distribution === 'constant') {
      exactKeys(load, path, [...beamLoadBaseKeys, 'm']);
      return {
        ...common,
        target: 'beam',
        beamIds,
        kind: 'moment',
        distribution: 'constant',
        m: finite(load.m, `${path}.m`),
      };
    }
    if (load.distribution === 'trapezoidal') {
      exactKeys(load, path, [...beamLoadBaseKeys, 'm1', 'm2', ...extentKeys]);
      return {
        ...common,
        ...extentFields(load, path),
        target: 'beam',
        beamIds,
        kind: 'moment',
        distribution: 'trapezoidal',
        m1: finite(load.m1, `${path}.m1`),
        m2: finite(load.m2, `${path}.m2`),
      } as BeamLoad;
    }
  }

  fail(`${path} enthält eine unbekannte Stablastvariante.`);
}

function placementFields(value: Record<string, unknown>, path: string) {
  return {
    distanceFromStart: finite(
      value.distanceFromStart,
      `${path}.distanceFromStart`,
    ),
    ...(value.relativeDistances === undefined
      ? {}
      : {
          relativeDistances: bool(
            value.relativeDistances,
            `${path}.relativeDistances`,
          ),
        }),
  };
}

function extentFields(value: Record<string, unknown>, path: string) {
  if (value.fullLength === true) {
    if (
      value.from !== undefined ||
      value.to !== undefined ||
      value.relativeDistances !== undefined
    ) {
      fail(`${path} darf bei fullLength: true keine Abstände enthalten.`);
    }
    return { fullLength: true as const };
  }
  return {
    ...(value.fullLength === undefined
      ? {}
      : { fullLength: literalFalse(value.fullLength, `${path}.fullLength`) }),
    from: finite(value.from, `${path}.from`),
    to: finite(value.to, `${path}.to`),
    ...(value.relativeDistances === undefined
      ? {}
      : {
          relativeDistances: bool(
            value.relativeDistances,
            `${path}.relativeDistances`,
          ),
        }),
  };
}

function releases(input: unknown, path: string) {
  const value = record(input, path);
  exactKeys(value, path, ['start', 'end']);
  const end = (input: unknown, endPath: string) => {
    const fields = record(input, endPath);
    exactKeys(fields, endPath, ['u', 'w', 'theta']);
    return {
      ...(fields.u === undefined
        ? {}
        : { u: literalTrue(fields.u, `${endPath}.u`) }),
      ...(fields.w === undefined
        ? {}
        : { w: literalTrue(fields.w, `${endPath}.w`) }),
      ...(fields.theta === undefined
        ? {}
        : { theta: literalTrue(fields.theta, `${endPath}.theta`) }),
    };
  };
  return {
    ...(value.start === undefined
      ? {}
      : { start: end(value.start, `${path}.start`) }),
    ...(value.end === undefined ? {} : { end: end(value.end, `${path}.end`) }),
  };
}

function actionCategory(input: unknown, path: string) {
  const value = record(input, path);
  const action = oneOf(
    value.action,
    ['permanent', 'variable', 'accidental'] as const,
    `${path}.action`,
  );
  if (action === 'permanent') {
    exactKeys(value, path, ['action']);
    return { action } as const;
  }
  if (action === 'accidental') {
    exactKeys(value, path, ['action']);
    return { action } as const;
  }
  const kind = oneOf(
    value.kind,
    ['imposed', 'snow', 'wind', 'temperature'] as const,
    `${path}.kind`,
  );
  if (kind === 'imposed') {
    exactKeys(value, path, ['action', 'kind', 'useCategory']);
    return {
      action,
      kind,
      useCategory: oneOf(
        value.useCategory,
        ['A', 'B', 'C', 'D', 'E'] as const,
        `${path}.useCategory`,
      ),
    };
  }
  exactKeys(value, path, ['action', 'kind']);
  return { action, kind };
}

function origin(input: unknown, path: string) {
  const value = record(input, path);
  const kind = oneOf(
    value.kind,
    ['manual', 'self-weight', 'generated'] as const,
    `${path}.kind`,
  );
  if (kind === 'generated') {
    exactKeys(value, path, ['kind', 'generatorId']);
    return {
      kind,
      generatorId: text(value.generatorId, `${path}.generatorId`),
    };
  }
  exactKeys(value, path, ['kind']);
  return { kind };
}

function unique(values: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id))
      fail(`${label}-ID "${value.id}" kommt mehrfach vor.`);
    ids.add(value.id);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} muss ein Objekt sein.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} muss ein Array sein.`);
  return value;
}

function text(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    fail(
      `${path} muss eine ${allowEmpty ? '' : 'nicht leere '}Zeichenkette sein.`,
    );
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${path} muss eine endliche Zahl sein.`);
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} muss ein Boolean sein.`);
  return value;
}

function literalTrue(value: unknown, path: string): true {
  if (value !== true) fail(`${path} darf nur true sein.`);
  return true;
}

function literalFalse(value: unknown, path: string): false {
  if (value !== false) fail(`${path} darf nur false sein.`);
  return false;
}

function restraint(value: unknown, path: string): 'fixed' | 'free' {
  return oneOf(value, ['fixed', 'free'] as const, path);
}

function stringArray(value: unknown, path: string): string[] {
  const values = array(value, path).map((item, index) =>
    text(item, `${path}[${index}]`),
  );
  if (new Set(values).size !== values.length) {
    fail(`${path} darf keine doppelten IDs enthalten.`);
  }
  return values;
}

const beamLoadBaseKeys = [
  'id',
  'target',
  'beamIds',
  'kind',
  'distribution',
  'origin',
  'comment',
] as const;

const extentKeys = ['fullLength', 'from', 'to', 'relativeDistances'] as const;

function exactKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected !== undefined) {
    fail(`${path}.${unexpected} ist kein erlaubtes Feld.`);
  }
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) {
    fail(
      `${path} muss ${choices.map((choice) => `"${choice}"`).join(' oder ')} sein.`,
    );
  }
  return value as T[number];
}

function fail(message: string): never {
  throw new SnapshotValidationError(message);
}
