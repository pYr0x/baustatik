import type { CrossSection } from '@baustatik/cross-section';
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
/**
 * Ein Querschnitt ohne ID — die vergibt das Modell, wie bei Knoten und Staeben.
 * `CrossSectionHandle.id` reicht sie wieder heraus, damit `BeamInput` sie
 * eintragen kann.
 */
export type CrossSectionInput = Without<CrossSection, 'id'>;
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

/**
 * Der Griff auf einen Querschnitt im Modell.
 *
 * Er reicht die vom Modell vergebene ID heraus, statt — wie `NodeHandle` bei
 * `beam()` — selbst als Argument zu reisen: `Beam.crossSectionId` ist und
 * bleibt ein String (ADR 0023), und ein Stab kann einen Querschnitt nennen,
 * den es (noch) nicht gibt. Diese Freiheit ist keine Nachlaessigkeit — der
 * Bericht des Solvers meldet den unaufloesbaren Verweis als Modellfehler, und
 * genau dort gehoert er hin.
 */
export interface CrossSectionHandle {
  readonly id: string;
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

  crossSection(input: CrossSectionInput): CrossSectionHandle;

  loadCase(input: LoadCaseInput): LoadCaseHandle;
}

export interface FEMModelSnapshotBuilder extends FEMModelBuilder {
  finish(): FEMModelSnapshot;
}

/**
 * Das serialisierbare Modell.
 *
 * SEIT v2 SELBSTTRAGEND: `crossSections` traegt die Querschnitte mit, auf die
 * `Beam.crossSectionId` zeigt. Bis v1 zeigte dieser Verweis ins Leere — der
 * Snapshot beschrieb ein Modell, das sich ohne einen zweiten, nirgends
 * genannten Datenbestand nicht rechnen liess.
 *
 * `schemaVersion` ist eine feste Zahl und kein Bereich: ein v1-Snapshot wird
 * ABGELEHNT, nicht stillschweigend um ein leeres `crossSections` ergaenzt.
 * Ein Modell ohne Querschnitte rechnet nicht, und ein Ergaenzen taeuschte
 * vor, es koennte.
 */
export interface FEMModelSnapshot {
  readonly schemaVersion: 2;
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly crossSections: readonly CrossSection[];
  readonly supports: readonly NodeSupport[];
  readonly loadCases: readonly LoadCase[];
}

export type ModelDefinition = (model: FEMModelBuilder) => void;
