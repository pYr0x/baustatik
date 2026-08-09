import type {
  CrossSection,
  SectionGeometry,
  SectionGeometryInput,
  SectionPolicy,
  ShapeSpec,
} from '@baustatik/cross-section';
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
 * Zwei Dinge beschafft das Modell: die ID, wie bei Knoten und Stäben, und
 * seit [ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md) die
 * TABELLENZEILE. Der Autor nennt weiterhin nur `'IPE 300'`; `crossSection()`
 * schlägt nach und legt die Zeile daneben in den Satz. Deshalb steht hier
 * nicht mehr `Without<CrossSection, 'id'>`: die Eingabe ist echt kleiner als
 * der Satz geworden.
 *
 * Ein Profil, das der Katalog nicht kennt, ist ab hier ein Fehler AN DIESER
 * ZEILE (`FEMScriptError`) und nicht mehr ein `undefined` im Solver-Bericht.
 */
export type CrossSectionInput =
  | { kind: 'shape'; shape: ShapeSpec }
  | { kind: 'profile'; profile: string }
  /**
   * Die freie Geometrie des Editors
   * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
   *
   * Hier beschafft das Modell NUR die ID: es gibt keinen Katalog, in dem
   * nachzuschlagen wäre, und der mitgeführte Umriss kommt fertig aus dem
   * Editor. Ob die Figur in sich stimmt, sagt `validateSectionGeometry` — und
   * zwar dort, wo sie GEZEICHNET wird, nicht hier.
   */
  | { kind: 'section-geometry'; geometry: SectionGeometry }
  /**
   * Dieselbe freie Geometrie, aber OHNE ihren Umriss — der Bauer leitet ihn ab
   * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
   *
   * DIE DRITTE STELLE, AN DER DAS MODELL ETWAS BESCHAFFT, und sie beschafft
   * genau das, was der Autor hier gar nicht beschaffen KANN: der Umriss hängt
   * an der `SectionPolicy`, und die kennt der Bauer — der Skriptautor bekommt
   * sie nie zu sehen (`declarations.ts`). Ohne diese Variante müsste er die
   * Toleranz von außen hereinreichen, um `createSectionGeometry` selbst
   * aufzurufen, und genau dabei entstünde die stille Abweichung, gegen die
   * ADR 0033 das Rezept überhaupt neben das Ergebnis legt.
   *
   * `section-geometry` BLEIBT DANEBEN: ein Satz, der aus einer Datei kommt,
   * trägt seinen Umriss bereits, und ihn hier neu abzuleiten hieße, die
   * gespeicherten Zahlen stillschweigend zu ersetzen.
   */
  | { kind: 'section-input'; input: SectionGeometryInput };
/**
 * Ein Material, wie man es hinschreibt — dieselbe Regel wie beim Querschnitt.
 *
 * Das Modell beschafft ID und Moduln. Für das Nachschlagen braucht es KEINEN
 * Nationalen Anhang: `E` und `G` sind charakteristische Werte (ADR 0026), und
 * `lookupMaterial` hat deshalb gar keinen Parameter dafür.
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
 * den es (noch) nicht gibt. Diese Freiheit ist keine Nachlässigkeit — der
 * Bericht des Solvers meldet den unauflösbaren Verweis als Modellfehler, und
 * genau dort gehört er hin.
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
 * unauflösbaren Verweis, nicht der Compiler.
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
 * Was `createFEMModelBuilder` beim Aufbau braucht — heute genau eine Sache.
 *
 * EINE VOLLSTAENDIGE POLICY, KEINE OVERRIDES, wie `SolverConfig.analysisPolicy`
 * und aus demselben Grund: die Anwendung ruft einmal `createSectionPolicy(…)`
 * und reicht exakt dasselbe unveränderliche Objekt an den Builder, an das
 * Gate und an den Viewer weiter. Nähme diese Stelle Abweichungen entgegen,
 * gäbe es zwei Orte, an denen derselbe Satz unterschiedlich zusammengesetzt
 * werden könnte.
 *
 * Auslassen heißt `DEFAULT_SECTION_POLICY` — im SATZ steht danach trotzdem
 * der vollständige, effektive Wert (ADR 0033).
 */
export type FEMModelBuilderConfig = {
  readonly sectionPolicy?: SectionPolicy;
};

/**
 * Das serialisierbare Modell.
 *
 * SELBSTTRAGEND IN DEN VERWEISEN seit v2/v3: `crossSections` und `materials`
 * tragen mit, worauf `Beam.crossSectionId` und `Beam.materialId` zeigen. Bis v1
 * zeigte der erste Verweis ins Leere, bis v2 der zweite — `materialId` war die
 * Güte-Bezeichnung selbst und wurde am Ende der Kette blind als Stahlsorte
 * gelesen.
 *
 * SELBSTTRAGEND IN DEN ZAHLEN seit v4: die Sätze führen die Profilzeile und
 * die Moduln als KOPIE. Bis v3 rechnete ein gespeichertes Modell gegen die
 * Tabellen der gerade laufenden Programmversion — eine korrigierte Zeile, und
 * jedes alte Modell antwortete still anders
 * ([ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md)).
 *
 * v5 benennt EINE FORM UM: `ShapeSpec.kind` heißt `'t-section'` statt
 * `'t-beam'` — der Name nennt jetzt die Form und nicht den Baustoff. Ein v4
 * trägt das alte Literal und ist damit kein gültiger v5-Satz.
 *
 * v6 nimmt eine DRITTE QUERSCHNITTSQUELLE auf: `{ kind: 'section-geometry' }`
 * trägt die frei gezeichnete Figur des Editors samt abgeleitetem Umriss
 * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
 * Rein additiv am Satz — und trotzdem eine neue Zahl, weil ein v6 Querschnitte
 * enthalten kann, die ein v5-Leser nicht kennt. AB HIER IST JEDE v5-DATEI
 * VERLOREN, und das ist bewusst gewählt: gespeicherte v5-Modelle, die
 * überleben müssten, gibt es nicht, und ein Migrationswerkzeug existiert
 * nirgends im Repo.
 *
 * v7 legt das REZEPT neben das Ergebnis: `sectionPolicy` steht als
 * PFLICHTFELD auf Projektebene, neben `crossSections` und `materials`
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 * Vollständig und nicht als Abweichungsliste — hier stehen die EFFEKTIVEN
 * Werte, sonst rechnete dasselbe Projekt nach einer Aenderung der
 * Software-Defaults still anders. Der Gewinn, der die Denormalisierung
 * rechtfertigt: die Drift-Prüfung wird erstmals wohldefiniert. Mit der
 * Toleranz im SELBEN Satz wie dem Umriss kann ein Gate sagen „dieser Umriss
 * wurde unter einer anderen Toleranz erzeugt als die, die hier steht", ohne
 * eine einzige Geometrieoperation — ADR 0027s Figur zu Ende gebracht: nicht
 * nur das Ergebnis wird kopiert, sondern auch das Rezept. AB HIER IST JEDE
 * v6-DATEI VERLOREN, aus demselben Grund wie bei v5.
 *
 * v8 setzt das ZWEITE Feld in die `SectionPolicy`: `principalAxisTolerance`,
 * die Schranke, ab der `Iyz` als null gilt. Sie ist PFLICHT — die Policy führt
 * die EFFEKTIVEN Werte, und ein optionales Feld wäre genau die stille
 * Default-Abhängigkeit, gegen die `fem-solver/src/policy.ts` argumentiert.
 * `parseSectionPolicy` ist strikt, also weist jede v7-Datei ab; kein
 * Migrationswerkzeug, aus demselben Grund wie bei v5 und v6.
 *
 * v9 setzt das DRITTE Feld in die `SectionPolicy`: `miterLimit`, die Schranke,
 * ab der Clipper2 die Umrissecke am spitzen Stoß kappt
 * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
 * Sie steht dort aus WÖRTLICH demselben Grund wie `arcTolerance`: sie verändert
 * den GESPEICHERTEN Umriss und damit `A`, `Iy`, `Iz` — das Kriterium von
 * ADR 0033. Pflicht, wie ihre beiden Vorgängerinnen, und `parseSectionPolicy`
 * ist strikt, also weist jede v8-Datei ab.
 *
 * DASS DER BRUCH IN DREI TEILPROJEKTEN NACHEINANDER FÄLLT, IST EIN MUSTER: P5
 * (dicke Wand) ist als weiteres Policy-Feld bereits datiert. Die Frage, ob ein
 * Monorepo ohne Abnehmer überhaupt Schemabrüche zählen sollte, steht in
 * `packages/TODO.md` — hier bleibt das Verfahren unverändert.
 *
 * `schemaVersion` ist eine feste Zahl und kein Bereich: ein älterer Snapshot
 * wird ABGELEHNT. Ein v3 per Lookup zu ergänzen wäre genau die stille
 * Auflösung, die v4 abschafft — einmal ausgeführt im ungünstigsten Moment
 * und danach nicht mehr von einer bewussten Wahl zu unterscheiden. Beim
 * Formnamen wäre die Umschreibung sogar trivial, und genau deshalb steht sie
 * hier nicht: eine Migration ist ein Werkzeug, das jemand AUFRUFT, sieht und
 * ablehnen kann.
 */
export interface FEMModelSnapshot {
  readonly schemaVersion: 9;
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly crossSections: readonly CrossSection[];
  readonly materials: readonly Material[];
  /**
   * Die Erzeugungs-Einstellung des Projekts, VOLLSTAENDIG und PFLICHT.
   *
   * PROJEKTEBENE UND NICHT JE `CrossSection`: zwei der drei künftigen Felder
   * (`Iyz`-Schwelle, dicke Wand) BEURTEILEN, sie erzeugen nicht — sie je
   * Querschnitt zu speichern hieße, dass derselbe Bericht für zwei
   * Querschnitte unter zwei Maßstäben schweigen darf.
   */
  readonly sectionPolicy: SectionPolicy;
  readonly supports: readonly NodeSupport[];
  readonly loadCases: readonly LoadCase[];
}

export type ModelDefinition = (model: FEMModelBuilder) => void;
