export const femScriptDeclarations = `
declare module '@baustatik/script' {
  export type Position = { x: number; z: number };
  export type SupportInput = {
    ux: 'fixed' | 'free';
    uz: 'fixed' | 'free';
    phiY: 'fixed' | 'free';
  };
  export type BeamInput = {
    crossSectionId: string;
    materialId: string;
    releases?: {
      start?: { u?: true; w?: true; theta?: true };
      end?: { u?: true; w?: true; theta?: true };
    };
  };
  export type LoadOrigin =
    | { kind: 'manual' }
    | { kind: 'self-weight' }
    | { kind: 'generated'; generatorId: string };
  type LoadInputBase = { origin?: LoadOrigin; comment?: string };
  export type NodeLoadInput = LoadInputBase & {
    fx?: number;
    fz?: number;
    my?: number;
  };
  export type ReferenceLength =
    | 'trueLength'
    | 'horizontalProjection'
    | 'verticalProjection';
  type Direction = { frame: 'global' | 'local'; axis: 'x' | 'z' };
  type Placement = { distanceFromStart: number; relativeDistances?: boolean };
  type Extent =
    | { fullLength: true }
    | { fullLength?: false; from: number; to: number; relativeDistances?: boolean };
  export type BeamLoadInput = LoadInputBase & (
    | (Direction & Placement & { kind: 'force'; distribution: 'point'; p: number })
    | (Direction & { kind: 'force'; distribution: 'constant'; referenceLength?: ReferenceLength; q: number })
    | (Direction & Extent & { kind: 'force'; distribution: 'trapezoidal'; referenceLength?: ReferenceLength; q1: number; q2: number })
    | (Placement & { kind: 'moment'; distribution: 'point'; m: number })
    | { kind: 'moment'; distribution: 'constant'; m: number }
    | (Extent & { kind: 'moment'; distribution: 'trapezoidal'; m1: number; m2: number })
  );
  export type ActionCategory =
    | { action: 'permanent' }
    | { action: 'variable'; kind: 'imposed'; useCategory: 'A' | 'B' | 'C' | 'D' | 'E' }
    | { action: 'variable'; kind: 'snow' | 'wind' | 'temperature' }
    | { action: 'accidental' };
  export type LoadCaseInput = {
    name: string;
    factor?: number;
    category?: ActionCategory;
  };
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
    nodeLoad(target: NodeHandle | readonly NodeHandle[], input: NodeLoadInput): this;
    beamLoad(target: BeamHandle | readonly BeamHandle[], input: BeamLoadInput): this;
  }
  export interface FEMModelBuilder {
    node(position: Position): NodeHandle;
    beam(startNode: NodeHandle, endNode: NodeHandle, input: BeamInput): BeamHandle;
    loadCase(input: LoadCaseInput): LoadCaseHandle;
  }
  export type ModelDefinition = (model: FEMModelBuilder) => void;
  export function defineModel(definition: ModelDefinition): ModelDefinition;
}
`;
