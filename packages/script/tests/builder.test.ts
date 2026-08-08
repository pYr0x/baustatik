import { BaustatikError } from '@baustatik/errors';
import { describe, expect, it } from 'vitest';
import {
  createFEMModelBuilder,
  FEMScriptError,
  type NodeHandle,
  parseFEMModelSnapshot,
  SnapshotValidationError,
} from '../src';
import { SCHEMA_VERSION, snapshot } from './helpers';

describe('FEM model builder', () => {
  it('uses the shared package error hierarchy', () => {
    expect(new FEMScriptError('test')).toBeInstanceOf(BaustatikError);
    expect(new SnapshotValidationError('test')).toBeInstanceOf(BaustatikError);
  });

  it('builds a serializable model through handles and batches', () => {
    const model = createFEMModelBuilder();
    const loadCase = model.loadCase({ name: 'Schnee' });
    const left = model
      .node({ x: 0, z: 0 })
      .support({ ux: 'fixed', uz: 'fixed', phiY: 'free' });
    const right = model
      .node({ x: 5, z: 0 })
      .support({ ux: 'free', uz: 'fixed', phiY: 'free' });
    const beam = model.beam(left, right, {
      crossSectionId: model.crossSection({
        kind: 'profile',
        profile: 'IPE 200',
      }).id,
      materialId: model.material({ kind: 'steel', grade: 'S235' }).id,
    });

    loadCase.nodeLoad([left, right], { fz: 10 }).beamLoad([beam], {
      kind: 'force',
      distribution: 'constant',
      frame: 'global',
      axis: 'z',
      q: 5,
    });

    const snapshot = model.finish();
    const parsed = parseFEMModelSnapshot(structuredClone(snapshot));

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.beams[0]).toMatchObject({
      startNodeId: parsed.nodes[0].id,
      endNodeId: parsed.nodes[1].id,
    });
    expect(parsed.loadCases[0].loads).toEqual([
      expect.objectContaining({
        target: 'node',
        nodeIds: [parsed.nodes[0].id, parsed.nodes[1].id],
      }),
      expect.objectContaining({
        target: 'beam',
        beamIds: [parsed.beams[0].id],
        referenceLength: 'trueLength',
      }),
    ]);
  });

  it('returns the same handles from chaining methods', () => {
    const model = createFEMModelBuilder();
    const loadCase = model.loadCase({ name: 'G' });
    const node = model.node({ x: 0, z: 0 });
    const other = model.node({ x: 1, z: 0 });
    const beam = model.beam(node, other, {
      crossSectionId: 'default',
      materialId: 'default',
    });

    expect(
      node.support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' }),
    ).toBe(node);
    expect(node.load(loadCase, { fz: 1 })).toBe(node);
    expect(beam.load(loadCase, { kind: 'moment', distribution: 'constant', m: 1 })).toBe(
      beam,
    );
    expect((node as NodeHandle & { record?: unknown }).record).toBeUndefined();
  });

  it('rejects node handles from another model', () => {
    const modelA = createFEMModelBuilder();
    const modelB = createFEMModelBuilder();
    const nodeA = modelA.node({ x: 0, z: 0 });
    const nodeB = modelB.node({ x: 5, z: 0 });

    expect(() =>
      modelA.beam(nodeA, nodeB, {
        crossSectionId: 'IPE200',
        materialId: 'S235',
      }),
    ).toThrowError(
      new FEMScriptError('Der Endknoten gehört nicht zu diesem FEM-Modell.'),
    );
  });

  it('rejects load-case handles from another model', () => {
    const modelA = createFEMModelBuilder();
    const modelB = createFEMModelBuilder();
    const node = modelA.node({ x: 0, z: 0 });
    const loadCase = modelB.loadCase({ name: 'Fremd' });

    expect(() => node.load(loadCase, { fz: 10 })).toThrowError(
      new FEMScriptError(
        'Der verwendete Lastfall gehört zu einem anderen FEM-Modell.',
      ),
    );
  });
});

describe('snapshot validation', () => {
  it('rejects malformed snapshots before domain validation', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({ nodes: [{ id: 'n1', position: { x: Number.NaN, z: 0 } }] }),
      ),
    ).toThrowError(SnapshotValidationError);
  });

  it('rejects unknown fields and duplicate load targets', () => {
    expect(() =>
      parseFEMModelSnapshot(snapshot({ internal: true })),
    ).toThrow('Snapshot.internal ist kein erlaubtes Feld.');

    const model = createFEMModelBuilder();
    const node = model.node({ x: 0, z: 0 });
    model.loadCase({ name: 'G' }).nodeLoad([node, node], { fz: 1 });
    expect(() => parseFEMModelSnapshot(model.finish())).toThrow(
      'darf keine doppelten IDs enthalten',
    );
  });

  it('applies the existing model validation rules', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          nodes: [{ id: 'n1', position: { x: 0, z: 0 } }],
          beams: [
            {
              id: 'b1',
              startNodeId: 'n1',
              endNodeId: 'n1',
              crossSectionId: 'IPE200',
              materialId: 'S235',
            },
          ],
        }),
      ),
    ).toThrow('Stab "b1": Laenge 0');
  });
});
