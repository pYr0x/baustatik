import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type {
  BeamLoad,
  LoadOrigin as FEMLoadOrigin,
  ReferenceLength as FEMReferenceLength,
  LoadCase,
  NodeLoad,
} from '@baustatik/fem-loads';

type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type WithOptionalReferenceLength<T> = T extends {
  referenceLength: infer TReferenceLength;
}
  ? Omit<T, 'referenceLength'> & { referenceLength?: TReferenceLength }
  : T;

export type Position = Node['position'];
export type BeamInput = Omit<Beam, 'id' | 'startNodeId' | 'endNodeId'>;
export type SupportInput = Omit<NodeSupport, 'id' | 'nodeId'>;
export type NodeLoadInput = Without<NodeLoad, 'id' | 'target' | 'nodeIds'>;
export type BeamLoadInput = WithOptionalReferenceLength<
  Without<BeamLoad, 'id' | 'target' | 'beamIds'>
>;
export type LoadCaseInput = Omit<LoadCase, 'id' | 'loads'>;
export type ActionCategory = NonNullable<LoadCaseInput['category']>;
export type LoadOrigin = FEMLoadOrigin;
export type ReferenceLength = FEMReferenceLength;

export interface NodeHandle {
  readonly position: Readonly<Position>;

  support(input: SupportInput): this;

  load(loadCase: LoadCaseHandle, input: NodeLoadInput): this;
}

export interface BeamHandle {
  readonly startNode: NodeHandle;
  readonly endNode: NodeHandle;

  load(loadCase: LoadCaseHandle, input: BeamLoadInput): this;
}

export interface LoadCaseHandle {
  readonly name: string;

  nodeLoad(
    target: NodeHandle | readonly NodeHandle[],
    input: NodeLoadInput,
  ): this;

  beamLoad(
    target: BeamHandle | readonly BeamHandle[],
    input: BeamLoadInput,
  ): this;
}

export interface FEMModelBuilder {
  node(position: Position): NodeHandle;

  beam(
    startNode: NodeHandle,
    endNode: NodeHandle,
    input: BeamInput,
  ): BeamHandle;

  loadCase(input: LoadCaseInput): LoadCaseHandle;
}

export interface FEMModelSnapshotBuilder extends FEMModelBuilder {
  finish(): FEMModelSnapshot;
}

export interface FEMModelSnapshot {
  readonly schemaVersion: 1;
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly supports: readonly NodeSupport[];
  readonly loadCases: readonly LoadCase[];
}

export type ModelDefinition = (model: FEMModelBuilder) => void;
