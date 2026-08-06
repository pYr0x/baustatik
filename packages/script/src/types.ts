import type { CrossSection, ShapeSpec } from '@baustatik/cross-section';
import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type {
  BeamLoad,
  LoadOrigin as FEMLoadOrigin,
  ReferenceLength as FEMReferenceLength,
  LoadCase,
  NodeLoad,
} from '@baustatik/fem-loads';
import type { Material, MaterialKind } from '@baustatik/material';

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
 * Ein Querschnitt, wie man ihn HINSCHREIBT — nicht der Satz ohne seine ID.
 *
 * Zwei Dinge beschafft das Modell: die ID, wie bei Knoten und Staeben, und
 * seit [ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md) die
 * TABELLENZEILE. Der Autor nennt weiterhin nur `'IPE 300'`; `crossSection()`
 * schlaegt nach und legt die Zeile daneben in den Satz. Deshalb steht hier
 * nicht mehr `Without<CrossSection, 'id'>`: die Eingabe ist echt kleiner als
 * der Satz geworden.
 *
 * Ein Profil, das der Katalog nicht kennt, ist ab hier ein Fehler AN DIESER
 * ZEILE (`FEMScriptError`) und nicht mehr ein `undefined` im Solver-Bericht.
 */
export type CrossSectionInput =
  | { kind: 'shape'; shape: ShapeSpec }
  | { kind: 'profile'; profile: string };
/**
 * Ein Material, wie man es hinschreibt — dieselbe Regel wie beim Querschnitt.
 *
 * Das Modell beschafft ID und Moduln. Fuer das Nachschlagen braucht es KEINEN
 * Nationalen Anhang: `E` und `G` sind charakteristische Werte (ADR 0026), und
 * `lookupMaterial` hat deshalb gar keinen Parameter dafuer.
 */
export type MaterialInput = { kind: MaterialKind; grade: string };
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

/**
 * Der Griff auf ein Material im Modell — wortgleich zu `CrossSectionHandle`
 * und aus demselben Grund.
 *
 * `Beam.materialId` bleibt ein String (ADR 0026), also reicht der Griff seine
 * ID heraus, statt selbst als Argument zu reisen. Ein Stab darf ein Material
 * nennen, das es (noch) nicht gibt; der Bericht des Solvers meldet den
 * unaufloesbaren Verweis, nicht der Compiler.
 */
export interface MaterialHandle {
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

  material(input: MaterialInput): MaterialHandle;

  loadCase(input: LoadCaseInput): LoadCaseHandle;
}

export interface FEMModelSnapshotBuilder extends FEMModelBuilder {
  finish(): FEMModelSnapshot;
}

/**
 * Das serialisierbare Modell.
 *
 * SELBSTTRAGEND IN DEN VERWEISEN seit v2/v3: `crossSections` und `materials`
 * tragen mit, worauf `Beam.crossSectionId` und `Beam.materialId` zeigen. Bis v1
 * zeigte der erste Verweis ins Leere, bis v2 der zweite — `materialId` war die
 * Guete-Bezeichnung selbst und wurde am Ende der Kette blind als Stahlsorte
 * gelesen.
 *
 * SELBSTTRAGEND IN DEN ZAHLEN seit v4: die Saetze fuehren die Profilzeile und
 * die Moduln als KOPIE. Bis v3 rechnete ein gespeichertes Modell gegen die
 * Tabellen der gerade laufenden Programmversion — eine korrigierte Zeile, und
 * jedes alte Modell antwortete still anders
 * ([ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md)).
 *
 * v5 benennt EINE FORM UM: `ShapeSpec.kind` heisst `'t-section'` statt
 * `'t-beam'` — der Name nennt jetzt die Form und nicht den Baustoff. Ein v4
 * traegt das alte Literal und ist damit kein gueltiger v5-Satz.
 *
 * `schemaVersion` ist eine feste Zahl und kein Bereich: ein aelterer Snapshot
 * wird ABGELEHNT. Ein v3 per Lookup zu ergaenzen waere genau die stille
 * Aufloesung, die v4 abschafft — einmal ausgefuehrt im unguenstigsten Moment
 * und danach nicht mehr von einer bewussten Wahl zu unterscheiden. Beim
 * Formnamen waere die Umschreibung sogar trivial, und genau deshalb steht sie
 * hier nicht: eine Migration ist ein Werkzeug, das jemand AUFRUFT, sieht und
 * ablehnen kann.
 */
export interface FEMModelSnapshot {
  readonly schemaVersion: 5;
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly crossSections: readonly CrossSection[];
  readonly materials: readonly Material[];
  readonly supports: readonly NodeSupport[];
  readonly loadCases: readonly LoadCase[];
}

export type ModelDefinition = (model: FEMModelBuilder) => void;
