/**
 * Der ambiente `.d.ts`-Text, den der Editor einem SKRIPTAUTOR zeigt.
 *
 * KEIN `SectionPolicy` HIER, obwohl v8 sie im Satz führt: dieser Block
 * beschreibt, was ein Skriptautor SCHREIBT, und der bekommt `defineModel` und
 * `FEMModelBuilder` — nicht `createFEMModelBuilder`. Er kann also keine Policy
 * uebergeben, und ein Typ in der Autovervollstaendigung, zu dem es keinen Weg
 * gibt, wäre ein Angebot ohne Tür. Die Einstellung setzt die ANWENDUNG, die
 * den Bauer erzeugt (ADR 0033).
 */
export const femScriptDeclarations = `
declare module '@baustatik/script' {
  export type Position = { x: number; z: number };
  export type SupportInput = {
    ux: 'fixed' | 'free';
    uz: 'fixed' | 'free';
    phiY: 'fixed' | 'free';
  };
  export type Idealisation = 'solid' | 'thin-walled';
  /** Alle Abmessungen in MILLIMETERN. */
  export type ShapeSpec =
    /** @param b Breite [mm] @param h Hoehe [mm] */
    | { kind: 'rectangle'; b: number; h: number }
    /** @param b Breite [mm] @param h Hoehe [mm] @param t Wandstaerke [mm] */
    | { kind: 'hollow-rectangle'; b: number; h: number; t: number; idealisation: Idealisation }
    /** @param h Hoehe [mm] @param b Gurtbreite [mm] @param tw Stegdicke [mm] @param tf Gurtdicke [mm] */
    | { kind: 'i-symmetric'; h: number; b: number; tw: number; tf: number; idealisation: Idealisation }
    /** @param bf Gurtbreite [mm] @param hf Gurtdicke [mm] @param bw Stegbreite [mm] @param h Gesamthoehe [mm] */
    | { kind: 't-section'; bf: number; hf: number; bw: number; h: number; idealisation: Idealisation };
  /** Ein Knoten des Wandgraphen. Koordinaten in MILLIMETERN. */
  export type SectionNode = { id: string; y: number; z: number };
  /** @param t Wandstaerke [mm] @param bulge DXF-Woelbung tan(D/4), 0 = Gerade */
  export type Wall = { id: string; startNodeId: string; endNodeId: string; t: number; bulge?: number };
  export type Vertex = { y: number; z: number; bulge?: number };
  /** EINGABE — Material läuft mit signedArea > 0, ein Loch mit < 0 (linear ring nach OGC / RFC 7946). */
  export type Ring = { vertices: Vertex[] };
  /** ERGEBNIS — diskretisiert, ohne bulge. Dieselbe Windungsregel wie Ring. */
  export type Polygon = { points: { y: number; z: number }[] };
  /** Die frei gezeichnete Geometrie. Der abgeleitete Umriss reist MIT. */
  export type SectionGeometry =
    | { kind: 'midline'; nodes: SectionNode[]; walls: Wall[]; idealisation: Idealisation; outline: Polygon[] }
    | { kind: 'outline'; rings: Ring[]; outline: Polygon[] };
  /** EINGABE — dieselbe Figur OHNE ihren Umriss; den leitet das Modell ab. */
  export type SectionGeometryInput =
    | { kind: 'midline'; nodes: SectionNode[]; walls: Wall[]; idealisation: Idealisation }
    | { kind: 'outline'; rings: Ring[] };
  export type CrossSectionInput =
    | { kind: 'shape'; shape: ShapeSpec }
    | { kind: 'profile'; profile: string }
    | { kind: 'section-geometry'; geometry: SectionGeometry }
    /** Der Umriss wird unter der Projekt-Policy ABGELEITET statt mitgegeben. */
    | { kind: 'section-input'; input: SectionGeometryInput };
  export interface CrossSectionHandle {
    readonly id: string;
  }
  /** Die Guete ist ein freier String; ob es sie gibt, entscheidet der Katalog. */
  export type MaterialInput =
    | { kind: 'steel'; grade: string }
    | { kind: 'concrete'; grade: string }
    | { kind: 'timber'; grade: string };
  export interface MaterialHandle {
    readonly id: string;
  }
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
    crossSection(input: CrossSectionInput): CrossSectionHandle;
    material(input: MaterialInput): MaterialHandle;
    loadCase(input: LoadCaseInput): LoadCaseHandle;
  }
  export type ModelDefinition = (model: FEMModelBuilder) => void;
  export function defineModel(definition: ModelDefinition): ModelDefinition;
}
`;
