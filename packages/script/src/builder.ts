import { BaustatikError } from '@baustatik/errors';
import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { BeamLoad, LoadCase, NodeLoad } from '@baustatik/fem-loads';
import type {
  BeamHandle,
  BeamInput,
  BeamLoadInput,
  FEMModelSnapshot,
  FEMModelSnapshotBuilder,
  LoadCaseHandle,
  LoadCaseInput,
  ModelDefinition,
  NodeHandle,
  NodeLoadInput,
  Position,
  SupportInput,
} from './types';

export class FEMScriptError extends BaustatikError {}

export function defineModel(definition: ModelDefinition): ModelDefinition {
  return definition;
}

export function createFEMModelBuilder(): FEMModelSnapshotBuilder {
  return new FEMModelBuilderImpl();
}

const nodeRecords = new WeakMap<NodeHandleImpl, Node>();
const beamRecords = new WeakMap<BeamHandleImpl, Beam>();
const loadCaseRecords = new WeakMap<LoadCaseHandleImpl, LoadCase>();

class NodeHandleImpl implements NodeHandle {
  readonly position: Readonly<Position>;
  readonly #owner: FEMModelBuilderImpl;

  constructor(owner: FEMModelBuilderImpl, position: Position) {
    this.#owner = owner;
    this.position = Object.freeze(position);
  }

  support(input: SupportInput): this {
    this.#owner.addSupport(this, input);
    return this;
  }

  load(loadCase: LoadCaseHandle, input: NodeLoadInput): this {
    this.#owner.addNodeLoad(loadCase, [this], input);
    return this;
  }
}

class BeamHandleImpl implements BeamHandle {
  readonly #owner: FEMModelBuilderImpl;

  constructor(
    owner: FEMModelBuilderImpl,
    readonly startNode: NodeHandle,
    readonly endNode: NodeHandle,
  ) {
    this.#owner = owner;
  }

  load(loadCase: LoadCaseHandle, input: BeamLoadInput): this {
    this.#owner.addBeamLoad(loadCase, [this], input);
    return this;
  }
}

class LoadCaseHandleImpl implements LoadCaseHandle {
  readonly #owner: FEMModelBuilderImpl;

  constructor(owner: FEMModelBuilderImpl) {
    this.#owner = owner;
  }

  get name(): string {
    return loadCaseRecord(this).name;
  }

  nodeLoad(
    target: NodeHandle | readonly NodeHandle[],
    input: NodeLoadInput,
  ): this {
    this.#owner.addNodeLoad(this, toArray(target), input);
    return this;
  }

  beamLoad(
    target: BeamHandle | readonly BeamHandle[],
    input: BeamLoadInput,
  ): this {
    this.#owner.addBeamLoad(this, toArray(target), input);
    return this;
  }
}

class FEMModelBuilderImpl implements FEMModelSnapshotBuilder {
  readonly #nodes: Node[] = [];
  readonly #beams: Beam[] = [];
  readonly #supports: NodeSupport[] = [];
  readonly #loadCases: LoadCase[] = [];
  readonly #nodeHandles = new WeakSet<NodeHandleImpl>();
  readonly #beamHandles = new WeakSet<BeamHandleImpl>();
  readonly #loadCaseHandles = new WeakSet<LoadCaseHandleImpl>();

  node(position: Position): NodeHandle {
    const record: Node = {
      id: crypto.randomUUID(),
      position: { x: position.x, z: position.z },
    };
    const handle = new NodeHandleImpl(this, record.position);
    nodeRecords.set(handle, record);
    this.#nodes.push(record);
    this.#nodeHandles.add(handle);
    return handle;
  }

  beam(
    startNode: NodeHandle,
    endNode: NodeHandle,
    input: BeamInput,
  ): BeamHandle {
    const start = this.requireNode(startNode, 'Der Startknoten');
    const end = this.requireNode(endNode, 'Der Endknoten');
    const copy = structuredClone(input);
    const record: Beam = {
      ...copy,
      id: crypto.randomUUID(),
      startNodeId: nodeRecord(start).id,
      endNodeId: nodeRecord(end).id,
    };
    const handle = new BeamHandleImpl(this, startNode, endNode);
    beamRecords.set(handle, record);
    this.#beams.push(record);
    this.#beamHandles.add(handle);
    return handle;
  }

  loadCase(input: LoadCaseInput): LoadCaseHandle {
    const copy = structuredClone(input);
    const record: LoadCase = {
      ...copy,
      id: crypto.randomUUID(),
      loads: [],
    };
    const handle = new LoadCaseHandleImpl(this);
    loadCaseRecords.set(handle, record);
    this.#loadCases.push(record);
    this.#loadCaseHandles.add(handle);
    return handle;
  }

  addSupport(node: NodeHandle, input: SupportInput): void {
    const target = this.requireNode(node, 'Der Knoten');
    this.#supports.push({
      ...structuredClone(input),
      id: crypto.randomUUID(),
      nodeId: nodeRecord(target).id,
    });
  }

  addNodeLoad(
    loadCase: LoadCaseHandle,
    targets: readonly NodeHandle[],
    input: NodeLoadInput,
  ): void {
    const targetCase = this.requireLoadCase(loadCase);
    const nodes = targets.map((target) =>
      this.requireNode(target, 'Der Knoten'),
    );
    const load: NodeLoad = {
      ...structuredClone(input),
      id: crypto.randomUUID(),
      target: 'node',
      nodeIds: nodes.map((node) => nodeRecord(node).id),
    };
    const record = loadCaseRecord(targetCase);
    record.loads = [...record.loads, load];
  }

  addBeamLoad(
    loadCase: LoadCaseHandle,
    targets: readonly BeamHandle[],
    input: BeamLoadInput,
  ): void {
    const targetCase = this.requireLoadCase(loadCase);
    const beams = targets.map((target) => this.requireBeam(target));
    const copy = structuredClone(input);
    const load = {
      ...copy,
      ...(copy.kind === 'force' &&
      copy.distribution !== 'point' &&
      copy.referenceLength === undefined
        ? { referenceLength: 'trueLength' as const }
        : {}),
      id: crypto.randomUUID(),
      target: 'beam' as const,
      beamIds: beams.map((beam) => beamRecord(beam).id),
    } as BeamLoad;
    const record = loadCaseRecord(targetCase);
    record.loads = [...record.loads, load];
  }

  finish(): FEMModelSnapshot {
    return structuredClone({
      schemaVersion: 1,
      nodes: this.#nodes,
      beams: this.#beams,
      supports: this.#supports,
      loadCases: this.#loadCases,
    });
  }

  private requireNode(handle: NodeHandle, label: string): NodeHandleImpl {
    if (!this.#nodeHandles.has(handle as NodeHandleImpl)) {
      throw new FEMScriptError(`${label} gehört nicht zu diesem FEM-Modell.`);
    }
    return handle as NodeHandleImpl;
  }

  private requireBeam(handle: BeamHandle): BeamHandleImpl {
    if (!this.#beamHandles.has(handle as BeamHandleImpl)) {
      throw new FEMScriptError('Der Stab gehört nicht zu diesem FEM-Modell.');
    }
    return handle as BeamHandleImpl;
  }

  private requireLoadCase(handle: LoadCaseHandle): LoadCaseHandleImpl {
    if (!this.#loadCaseHandles.has(handle as LoadCaseHandleImpl)) {
      throw new FEMScriptError(
        'Der verwendete Lastfall gehört zu einem anderen FEM-Modell.',
      );
    }
    return handle as LoadCaseHandleImpl;
  }
}

function nodeRecord(handle: NodeHandleImpl): Node {
  const record = nodeRecords.get(handle);
  if (record === undefined) throw new Error('Unbekannter Knoten-Handle.');
  return record;
}

function beamRecord(handle: BeamHandleImpl): Beam {
  const record = beamRecords.get(handle);
  if (record === undefined) throw new Error('Unbekannter Stab-Handle.');
  return record;
}

function loadCaseRecord(handle: LoadCaseHandleImpl): LoadCase {
  const record = loadCaseRecords.get(handle);
  if (record === undefined) throw new Error('Unbekannter Lastfall-Handle.');
  return record;
}

function toArray<T>(value: T | readonly T[]): readonly T[] {
  return Array.isArray(value) ? value : [value as T];
}
