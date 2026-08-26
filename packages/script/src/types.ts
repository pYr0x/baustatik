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
import type { AnalysisPolicy } from '@baustatik/fem-solver';
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
 * Was `createFEMModelBuilder` beim Aufbau braucht — die beiden Policies des
 * Dokuments.
 *
 * VOLLSTAENDIGE POLICIES, KEINE OVERRIDES, wie `SolverConfig.analysisPolicy`
 * und aus demselben Grund: die Anwendung ruft einmal `createSectionPolicy(…)`
 * beziehungsweise `createAnalysisPolicy(…)` und reicht exakt dasselbe
 * unveränderliche Objekt an den Builder, an das Gate und an den Viewer weiter.
 * Nähme diese Stelle Abweichungen entgegen, gäbe es zwei Orte, an denen
 * derselbe Satz unterschiedlich zusammengesetzt werden könnte.
 *
 * Auslassen heißt `DEFAULT_SECTION_POLICY` beziehungsweise
 * `DEFAULT_ANALYSIS_POLICY` — im SATZ steht danach trotzdem der vollständige,
 * effektive Wert (ADR 0033, ADR 0049).
 */
export type FEMModelBuilderConfig = {
  readonly sectionPolicy?: SectionPolicy;
  readonly analysisPolicy?: AnalysisPolicy;
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
 * Sie steht dort aus WÖRTLICH demselben Grund wie `discretisationTolerance`: sie verändert
 * den GESPEICHERTEN Umriss und damit `A`, `Iy`, `Iz` — das Kriterium von
 * ADR 0033. Pflicht, wie ihre beiden Vorgängerinnen, und `parseSectionPolicy`
 * ist strikt, also weist jede v8-Datei ab.
 *
 * v10 setzt die BEIDEN LETZTEN Felder in die `SectionPolicy`:
 * `thickWallRatio` und `shearCentreTolerance`
 * ([ADR 0040](../../../docs/adr/0040-the-wall-path-is-positioned.md),
 * [ADR 0041](../../../docs/adr/0041-two-figures-for-the-wall-path.md)). Beide
 * sind BEURTEILUNGSFELDER — sie ändern den gespeicherten Umriss nicht, sie
 * urteilen über ihn — und stehen trotzdem aus dem Grund im Satz, aus dem
 * `principalAxisTolerance` es seit v8 tut: die Policy führt die EFFEKTIVEN
 * Werte, und derselbe Bericht soll nach einer Änderung der Software-Defaults
 * nicht still andere Warnungen zeigen. Pflicht, wie alle vor ihnen, und
 * `parseSectionPolicy` ist strikt, also weist jede v9-Datei ab.
 *
 * DASS DER BRUCH IN VIER TEILPROJEKTEN NACHEINANDER FÄLLT, IST EIN MUSTER —
 * und mit v10 war die Liste der datierten Kandidaten abgearbeitet. Die Frage,
 * ob ein Monorepo ohne Abnehmer überhaupt Schemabrüche zählen sollte, steht in
 * `packages/TODO.md`.
 *
 * **v11 — die FE des Vollquerschnitts.** Drei Dinge zugleich, und alle drei
 * gehören demselben Vorgang: `SectionPolicy` bekommt `FEElements`, die
 * Netzdichte, unter der gerechnet wurde; `SectionGeometry` bekommt in BEIDEN
 * Varianten den optionalen Block `feValues` mit `It`, dem Schubmittelpunkt und
 * den beiden ν-freien κ-Koeffizientenpaaren; und `ElasticModuli` bekommt
 * `nu?`, ohne das aus den Koeffizienten kein κ wird
 * ([ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md),
 * [ADR 0047](../../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md)).
 * `feValues` und `nu` sind OPTIONAL, `FEElements` ist es nicht — deshalb weist
 * `parseSectionPolicy` jede v10-Datei ab, und deshalb ist es ein Bruch.
 *
 * **v12 — ein Verweigerungsgrund weniger.** `feValues.reason` kannte
 * `'hole-off-bending-axis'`; seit
 * [ADR 0048](../../../docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md)
 * rechnet das Schubproblem über eine Verschiebung statt über eine
 * Spannungsfunktion, und die Bedingung — der Schwerpunkt jedes Lochs auf der
 * Biegeachse — verschwindet ersatzlos. Sie war eine Eigenschaft der
 * FORMULIERUNG und keine der Figur.
 *
 * DAS IST EIN ECHTER BRUCH, obwohl die Union nur SCHRUMPFT: ein v11-Snapshot
 * kann `reason: 'hole-off-bending-axis'` tragen, und `parseFEValues` weist ihn
 * künftig ab. Dieselbe Figur liefert heute `status: 'computed'` — den Wert
 * still umzuschreiben hieße, eine Verweigerung in Zahlen zu verwandeln, die
 * niemand nachgerechnet hat.
 *
 * **v13 — das Tool-Dokument ist die Datensatz-Einheit.** `analysisPolicy` wird
 * PFLICHTFELD neben `sectionPolicy`, und die `AnalysisPolicy` verliert im
 * selben Zug ihre eigene `schemaVersion`
 * ([ADR 0049](../../../docs/adr/0049-the-tool-document-is-the-versioned-record-unit.md)).
 *
 * ZWEI ZÄHLER ÜBER DENSELBEN BYTES SIND EINER ZU VIEL. Die Analyse-Einstellung
 * zählte seit ADR 0011 für sich (`ANALYSIS_POLICY_SCHEMA_VERSION`, zuletzt
 * `3`), weil sie damals allein reiste — sie stand in keinem Dokument. Sobald
 * sie IN diesem Satz steht, beantwortet dessen `schemaVersion` die einzige
 * Frage, die ein eigener Zähler stellte („ist diese Datei neuer als das
 * Programm?"), und zwar FRÜHER: `parseFEMModelSnapshot` weist ab, bevor
 * `parseAnalysisPolicy` den Teilsatz überhaupt sieht. Zwei Zähler könnten
 * einander widersprechen, und dann gäbe es keine Regel, welcher gilt.
 *
 * PFLICHT UND NICHT OPTIONAL, aus dem Grund, aus dem `sectionPolicy` es seit
 * v7 ist: die Policy führt die EFFEKTIVEN Werte. Wäre sie auslassbar, hinge
 * dasselbe Modell still an den Defaults der gerade laufenden Fassung — ein
 * geändertes `shearDeformation` oder `linearSystem` rechnete andere Zahlen,
 * ohne dass jemand etwas gewählt hätte. Ein v12 hat das Feld nicht und wird
 * ABGEWIESEN.
 *
 * **v14 — die parametrische Form trägt einen FE-Block.** `CrossSection` bekommt
 * in der `shape`-Variante das optionale Feld `feValues`, denselben
 * `FESectionState` wie beide `SectionGeometry`-Varianten
 * ([ADR 0062](../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)).
 * Die Form schreibt sich über `shapeOutline` als Polygonzug aus und läuft durch
 * dieselbe FE wie die gezeichnete Figur; κ, `It` und `yM`/`zM` des
 * Vollquerschnitts kommen von dort. `parseFEValues` existiert seit v11 und wird
 * mitbenutzt — geprüft wird die GESTALT, nicht die Auflösbarkeit.
 *
 * DER BRUCH FÄLLT IN DIE ANDERE RICHTUNG als bei v11 oder v13: eine v13-Datei
 * ist am Satz unverändert gültig — das Feld ist optional, und ein v13 hat es
 * schlicht nicht. Was sich ändert, ist die BEDEUTUNG seiner Abwesenheit. Bis
 * v13 rechnete der parametrische Vollquerschnitt sein κ nach Grashof und hatte
 * immer eine Zahl; ab v14 heißt „kein Block" schubstarr plus
 * `ShearDeformationUnavailableWarning`. Dieselbe Datei durchzulassen hieße,
 * sie anders rechnen zu lassen als beim letzten Mal, ohne dass jemand etwas
 * gewählt hätte. Ein Auflösungslauf füllt das Feld; die Version sagt, dass er
 * fällig ist. Präzedenz ist v12 — auch dort schrumpfte nur eine Union, und
 * auch dort war der Grund die stille Bedeutungsänderung.
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
  readonly schemaVersion: 14;
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly crossSections: readonly CrossSection[];
  readonly materials: readonly Material[];
  /**
   * Die Erzeugungs-Einstellung des Projekts, VOLLSTAENDIG und PFLICHT.
   *
   * PROJEKTEBENE UND NICHT JE `CrossSection`: drei der fünf Felder
   * (`principalAxisTolerance`, `thickWallRatio`, `shearCentreTolerance`)
   * BEURTEILEN, sie erzeugen nicht — sie je Querschnitt zu speichern hieße,
   * dass derselbe Bericht für zwei Querschnitte unter zwei Maßstäben schweigen
   * darf.
   */
  readonly sectionPolicy: SectionPolicy;
  /**
   * Die Analyse-Einstellung des Projekts, VOLLSTAENDIG und PFLICHT (seit v13,
   * ADR 0049).
   *
   * DIE ZWEITE POLICY DESSELBEN DOKUMENTS, und die Trennlinie zwischen beiden
   * ist ADR 0011s: `sectionPolicy` ändert das MODELL — unter ihr entsteht der
   * mitgeführte Umriss —, `analysisPolicy` ändert nur die RECHNUNG darüber.
   * Deshalb sind es zwei Felder und nicht eines.
   *
   * SIE TRÄGT KEINE EIGENE `schemaVersion` mehr: dieser Satz versioniert sie
   * mit. Was sie NICHT enthält, sind die Ports (`formulation`,
   * `solveLinearSystem`, `getSectionStiffness`) — Fähigkeit ist Code und hat
   * keine JSON-Form, sie bleibt in `SolverConfig`.
   */
  readonly analysisPolicy: AnalysisPolicy;
  readonly supports: readonly NodeSupport[];
  readonly loadCases: readonly LoadCase[];
}

export type ModelDefinition = (model: FEMModelBuilder) => void;
