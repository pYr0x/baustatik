import {
  createSectionGeometry,
  createSectionPolicy,
  type CrossSection,
  type SectionPolicy,
} from '@baustatik/cross-section';
import { BaustatikError } from '@baustatik/errors';
import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { BeamLoad, LoadCase, NodeLoad } from '@baustatik/fem-loads';
import {
  type AnalysisPolicy,
  createAnalysisPolicy,
} from '@baustatik/fem-solver';
import { lookupMaterial, type Material } from '@baustatik/material';
import {
  lookupProfile,
  profileData,
  type SteelProfileData,
} from '@baustatik/steel-profiles';
import type {
  BeamHandle,
  BeamInput,
  BeamLoadInput,
  CrossSectionHandle,
  CrossSectionInput,
  FEMModelBuilderConfig,
  FEMModelSnapshot,
  FEMModelSnapshotBuilder,
  LoadCaseHandle,
  LoadCaseInput,
  MaterialHandle,
  MaterialInput,
  ModelDefinition,
  NodeHandle,
  NodeLoadInput,
  Position,
  SupportInput,
} from './types';

export class FEMScriptError extends BaustatikError {}

/** Damit die Fehlermeldung sagt, WELCHER Katalog die Sorte nicht kennt. */
const KIND_LABEL = {
  steel: 'Stahl',
  concrete: 'Beton',
  timber: 'Holz',
} as const;

export function defineModel(definition: ModelDefinition): ModelDefinition {
  return definition;
}

/**
 * Ein Modellbauer.
 *
 * BEIDE POLICIES WERDEN GEPRUEFT UND NICHT NUR ENTGEGENGENOMMEN. `SectionPolicy`
 * ist rein strukturell über `mm = number & { __unit?: 'mm' }`, also geht
 * `{ discretisationTolerance: 0 }` durch den Compiler — und `parseFEMModelSnapshot` wiese
 * den fertigen Satz danach zurück. Der Bauer dürfte nie einen Satz ausgeben,
 * den sein eigener Parser ablehnt; `createSectionPolicy` ist die prüfende Tür,
 * und hier wird sie erzwungen statt erhofft. Ohne Argument liefert sie
 * `DEFAULT_SECTION_POLICY`.
 *
 * Für die `analysisPolicy` gilt seit v13 dasselbe Wort für Wort, mit
 * `createAnalysisPolicy` als Tür (ADR 0049): auch `{ linearSystem: 'iterativ' }`
 * käme aus reinem JavaScript ungehindert bis hierher. Die Factory nimmt
 * allerdings OVERRIDES entgegen, dieser Bauer eine VOLLSTAENDIGE Policy — sie
 * wird hier also nicht gemischt, sondern nur durchgereicht und dabei geprüft.
 */
export function createFEMModelBuilder(
  config?: FEMModelBuilderConfig,
): FEMModelSnapshotBuilder {
  return new FEMModelBuilderImpl(
    createSectionPolicy(config?.sectionPolicy),
    createAnalysisPolicy(config?.analysisPolicy),
  );
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

class CrossSectionHandleImpl implements CrossSectionHandle {
  constructor(readonly id: string) {}
}

class MaterialHandleImpl implements MaterialHandle {
  constructor(readonly id: string) {}
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
  readonly #crossSections: CrossSection[] = [];
  readonly #materials: Material[] = [];
  readonly #supports: NodeSupport[] = [];
  readonly #loadCases: LoadCase[] = [];
  readonly #nodeHandles = new WeakSet<NodeHandleImpl>();
  readonly #beamHandles = new WeakSet<BeamHandleImpl>();
  readonly #loadCaseHandles = new WeakSet<LoadCaseHandleImpl>();
  readonly #sectionPolicy: SectionPolicy;
  readonly #analysisPolicy: AnalysisPolicy;

  constructor(sectionPolicy: SectionPolicy, analysisPolicy: AnalysisPolicy) {
    this.#sectionPolicy = sectionPolicy;
    this.#analysisPolicy = analysisPolicy;
  }

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

  /**
   * Legt einen Querschnitt ins Modell und gibt seine ID heraus.
   *
   * Anders als Knoten und Stäbe reist der Griff NICHT als Argument weiter:
   * `Beam.crossSectionId` bleibt ein String, damit `@baustatik/fem` weiterhin
   * nur an `errors` hängt (ADR 0023). Aufgerufen wird also
   * `model.beam(a, b, { crossSectionId: ipe300.id, materialId: s235.id })`.
   *
   * HIER, und nur hier, wird der Profilkatalog befragt (ADR 0027). Die Zeile
   * geht als Kopie in den Satz; gespeichert wird außerdem die KANONISCHE
   * Bezeichnung, `'ipe300'` also als `'IPE 300'`.
   *
   * Die dritte Quelle, `'section-geometry'`, wird nur KOPIERT: es gibt keinen
   * Katalog dahinter, und geprüft wird sie dort, wo sie gezeichnet wird
   * (`validateSectionGeometry`). Der Builder zöge sich sonst ein Gate in
   * eine Zeile, die gar nicht darüber entscheidet.
   *
   * `'section-input'` IST DIESELBE QUELLE OHNE IHREN UMRISS (ADR 0037). Hier
   * leitet der Bauer ihn ab, unter der Policy, die er ohnehin führt — das ist
   * KEIN Prüfen, sondern dasselbe Beschaffen wie beim Profilkatalog: der
   * Autor nennt, was er weiß, und das Modell legt daneben, was ohne die
   * Projekteinstellung nicht zu haben ist.
   */
  crossSection(input: CrossSectionInput): CrossSectionHandle {
    const id = crypto.randomUUID();
    this.#crossSections.push(this.crossSectionRecord(id, input));
    return new CrossSectionHandleImpl(id);
  }

  private crossSectionRecord(
    id: string,
    input: CrossSectionInput,
  ): CrossSection {
    switch (input.kind) {
      case 'profile':
        return { kind: 'profile', id, ...this.requireProfile(input.profile) };
      case 'shape':
        return { kind: 'shape', id, shape: structuredClone(input.shape) };
      case 'section-geometry':
        return {
          kind: 'section-geometry',
          id,
          geometry: structuredClone(input.geometry),
        };
      case 'section-input':
        // DER EINE ORT, an dem der Bauer mehr tut als kopieren: er leitet den
        // Umriss unter SEINER Policy ab — derselben, die gleich neben ihm im
        // Satz landet (ADR 0033, ADR 0037). Der Skriptautor könnte das nicht,
        // er sieht die Einstellung nie.
        return {
          kind: 'section-geometry',
          id,
          geometry: createSectionGeometry(
            structuredClone(input.input),
            this.#sectionPolicy,
          ),
        };
    }
  }

  /**
   * Legt ein Material ins Modell und gibt seine ID heraus — dieselbe Mechanik
   * wie bei `crossSection`, aus demselben Grund (ADR 0026), und seit ADR 0027
   * auch dasselbe Nachschlagen.
   *
   * OHNE NATIONALEN ANHANG: `E` und `G` sind charakteristische Werte, also
   * braucht der Builder keinen Katalog und `createFEMModelBuilder()` keinen
   * Parameter.
   */
  material(input: MaterialInput): MaterialHandle {
    const found = lookupMaterial(input.kind, input.grade);
    if (found === undefined) {
      throw new FEMScriptError(
        `Die Sorte "${input.grade}" steht nicht im ${KIND_LABEL[input.kind]}-Katalog.`,
      );
    }
    const record: Material = {
      kind: input.kind,
      id: crypto.randomUUID(),
      grade: found.grade,
      moduli: found.moduli,
    };
    this.#materials.push(record);
    return new MaterialHandleImpl(record.id);
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
      schemaVersion: 14,
      nodes: this.#nodes,
      beams: this.#beams,
      crossSections: this.#crossSections,
      materials: this.#materials,
      // Der EFFEKTIVE Wert, nicht die Abweichung: was hier steht, gilt, auch
      // wenn sich der Software-Default morgen bewegt (ADR 0033).
      sectionPolicy: this.#sectionPolicy,
      // Dasselbe fuer die Rechnung (ADR 0049). `structuredClone` loest das
      // `Object.freeze` beider Policies auf — der Satz ist eine KOPIE, und der
      // Aufrufer soll an ihr nichts entdecken, was am Original haengt.
      analysisPolicy: this.#analysisPolicy,
      supports: this.#supports,
      loadCases: this.#loadCases,
    });
  }

  /**
   * Die Tabellenzeile zu einer Bezeichnung — oder ein Fehler an dieser Zeile.
   *
   * Der Wurf ist die Gegenseite von ADR 0027: weil der Katalog jetzt nur noch
   * BEIM ANLEGEN befragt wird, gibt es genau einen Moment, in dem ein
   * Tippfehler auffallen kann, und das ist dieser. Früher wanderte er als
   * `undefined` bis in den Solver-Bericht und stand dort neben echten
   * Modellfehlern.
   */
  private requireProfile(name: string): {
    profile: string;
    data: SteelProfileData;
  } {
    const row = lookupProfile(name);
    if (row === undefined) {
      throw new FEMScriptError(`Das Profil "${name}" steht nicht im Katalog.`);
    }
    return { profile: row.id, data: profileData(row) };
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
