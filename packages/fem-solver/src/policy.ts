/**
 * Die Analyse-Einstellungen der gesamten Rechnung — dieses Package ist ihr
 * Composition Root.
 *
 * EINE ANALYSE-EINSTELLUNG ist alles, was die Rechnung steuert, ohne das Modell
 * zu aendern. Der Querschnitt einer Stuetze gehoert zum Modell; ob ihre
 * Schubverformung beruecksichtigt wird, ist eine Einstellung.
 *
 * SIE ZERFALLEN IN ZWEI SORTEN, und die Trennlinie ist der ganze Entwurf:
 *
 *   DATEN — schreibbar als JSON. Toleranzen, Warnschwellen,
 *           `shearDeformation`. Sie wohnen HIER, in der `AnalysisPolicy`, und
 *           werden persistiert — VERSIONIERT WIRD SIE NICHT MEHR HIER, sondern
 *           von dem Dokument, das sie traegt (ADR 0049).
 *   FAEHIGKEIT — ist Code. `formulation`, `solveLinearSystem`,
 *           `getSectionStiffness`. Sie bleiben Ports in `SolverConfig`.
 *
 * `formulation` ist begrifflich sehr wohl eine Analyse-Einstellung — sie laesst
 * sich nur nicht schreiben. Ein Funktionsobjekt hat keine JSON-Form, und die
 * JSON-Form ist der Zweck dieser Datei. Ausfuehrlich in
 * [ADR 0011](../../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md).
 *
 * WARUM DIE SCHEIBEN NICHT HIER DEFINIERT WERDEN: jede Regel bringt ihre
 * Stellschrauben, ihren Default und ihre Werteprueferei selbst mit
 * (`@baustatik/fem-loads` -> `LoadValidationPolicy`). Dieses Package setzt sie
 * mit seinen EIGENEN Entscheidungen zusammen. Dafuer kommt keine
 * Package-Grenze hinzu — die Abhaengigkeit besteht ohnehin aus fachlichen
 * Gruenden.
 */

import {
  createLoadValidationPolicy,
  DEFAULT_LOAD_VALIDATION_POLICY,
  type LoadValidationPolicy,
  type LoadValidationPolicyOverrides,
  parseLoadValidationPolicy,
} from '@baustatik/fem-loads';
import { InvalidAnalysisPolicyError } from './errors';

/**
 * Die beiden Rechenwege durch `K d = F`.
 *
 * KEIN `enum`, sondern eine string-literal union: sie ist das, was im
 * Datensatz steht (`AGENTS.md`, Coding principles). Das Array trägt die
 * Laufzeitseite für den Parser, der Typ die Compilerseite — eine Wahrheit,
 * zwei Blickrichtungen.
 *
 * EINGEFROREN, weil es das Package verlässt: `assertValidLinearSystem` liest es
 * bei jedem `createAnalysisPolicy` und bei jedem `parseAnalysisPolicy`. Ein
 * Aufrufer aus reinem JavaScript könnte sonst `push('iterativ')` schreiben und
 * damit die Werteprüfung des Parsers verändern — der Typ hält ihn nicht auf.
 */
export const LINEAR_SYSTEM_KINDS = Object.freeze(['dense', 'sparse'] as const);

export type LinearSystemKind = (typeof LINEAR_SYSTEM_KINDS)[number];

/**
 * Die zwei Stufen, an denen eine Verformung beurteilt wird.
 *
 * BEIDE GROESSEN SIND DIMENSIONSLOS — `rad` ist ein Verhaeltnis, `u/L` auch.
 * Deshalb brauchen die Grenzen keine Einheit und gelten fuer jedes Modell
 * gleich, unabhaengig von Querschnitt, Spannweite und Material.
 */
export type DeformationLimit = {
  /** `|phiY|` je Knoten, in rad. */
  readonly rotation: number;
  /** `|u| / L` je Stabende, bezogen auf den ANGEHAENGTEN Stab. */
  readonly relativeDisplacement: number;
};

/**
 * Wann eine Verformung auffaellt und wann sie keine mehr ist.
 *
 * DIE GRENZEN SIND KEINE PLAUSIBILITAETSSCHAETZUNG, sondern die
 * Gueltigkeitsgrenze der gerechneten Theorie: Theorie I. Ordnung setzt
 * `sin phi ~ phi` und das Gleichgewicht am UNVERFORMTEN System voraus.
 *
 *   `warn` — das Ergebnis verlaesst diesen Bereich. Gerechnet wurde richtig,
 *            nur gilt die Theorie hier nicht mehr.
 *   `fail` — das ist keine Verformung mehr, sondern eine Bewegung. Das Modell
 *            ist (nahezu) kinematisch, und das Ergebnis ist unbrauchbar.
 *
 * Die `fail`-Stufe ist das VIERTE Netz gegen Kinematik (ADR 0016) und nicht der
 * Ersatz fuer das Pivot: eine Last, deren Resultierende durch den Drehpunkt des
 * Mechanismus zeigt, erzeugt keine Bewegung und bleibt hier unsichtbar.
 */
export type DeformationLimits = {
  readonly warn: DeformationLimit;
  readonly fail: DeformationLimit;
};

/**
 * Die gemessenen Grenzen; der Beleg steht in
 * `docs/messungen/kinematik-abstand.md`.
 *
 * `warn` ist die Grenze der Theorie I. Ordnung. `fail` liegt darueber, wo kein
 * tragfaehiges System des Messkorpus mehr hinkommt (der Hoechstwert dort ist
 * `1.2e1 rad` bei einem masslos ueberlasteten IPE 80) und immer noch sieben
 * Groessenordnungen unter dem mildesten gemessenen Mechanismus (`3.3e10 rad`).
 *
 * WARUM `relativeDisplacement` EINE DEKADE MEHR LUFT HAT: sie haengt an der
 * Feinheit der Eingabe. Derselbe 20-m-Kragarm liefert `7.9` als ein Element und
 * `1.6e2` als zwanzig, weil die Bezugslaenge der angehaengte Stab ist. Die
 * Verdrehung tut das nicht — sie ist die belastbarere der beiden Groessen.
 */
export const DEFAULT_DEFORMATION_LIMITS: DeformationLimits = Object.freeze({
  warn: Object.freeze({ rotation: 0.1, relativeDisplacement: 0.1 }),
  fail: Object.freeze({ rotation: 1e3, relativeDisplacement: 1e4 }),
});

/**
 * Die vollstaendige, reproduzierbare Analyse-Einstellung eines Projekts.
 *
 * VOLLSTAENDIG heisst: hier stehen die effektiven Werte, nicht die
 * Abweichungen. Sonst rechnete dasselbe Projekt nach einer Aenderung der
 * Software-Defaults still anders.
 *
 * OHNE EIGENE `schemaVersion` (ADR 0049). Sie stand hier, solange die Policy
 * fuer sich allein reiste; seit sie Pflichtfeld des `FEMModelSnapshot` ist,
 * versioniert ihn dessen `schemaVersion` mit. Ein zweiter Zaehler auf einem
 * Teilsatz waere eine zweite Wahrheit ueber dieselben Bytes — und die einzige
 * Antwort, die er gab („diese Datei ist neuer als das Programm"), gibt jetzt
 * das Dokument.
 */
export type AnalysisPolicy = {
  /** Die Scheibe von `@baustatik/fem-loads` — dort wohnen ihre Regeln. */
  readonly loads: LoadValidationPolicy;

  /**
   * Ob die Schubverformung beruecksichtigt wird. Voreinstellung `true` — das
   * ist die native Betriebsart der Timoshenko-Formulierung.
   *
   * Bei `false` ersetzt `solve()` das `GAs` aus `getSectionStiffness` durch
   * `'rigid'`. Der QUERSCHNITT bleibt unangetastet: eine vorhandene
   * Schubsteifigkeit zu vernachlässigen ist eine Entscheidung über die
   * ANALYSE (vorweggenommen in `fem-element/src/types.ts`).
   *
   * DER SCHALTER WIRKT NUR IN EINE RICHTUNG. „Jeder Querschnitt HAT eine
   * Schubsteifigkeit" stand hier bis P2 und ist seither FALSCH: der
   * Editor-Querschnitt liefert `EA` und `EI`, aber kein kappa, also `GAs:
   * 'rigid'` — und `true` macht daraus keine Schubverformung, sondern rechnet
   * still steifer als eingestellt. Genau dafür meldet `check()` die
   * `ShearDeformationUnavailableWarning`
   * ([ADR 0035](../../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md)).
   *
   * Der einzige Schalter hier, den ein Anwender tatsächlich dreht — die
   * übrigen Felder sind numerische Wächter. Er stand früher auf
   * `SolverConfig` und ist hierher UMGEZOGEN, nicht verdoppelt.
   */
  readonly shearDeformation: boolean;

  /**
   * Ab wann `solve()` eine Verformung anmerkt und ab wann es sie ablehnt.
   *
   * Steht HIER und nicht in einem Port, weil es vier Zahlen sind und keine
   * Faehigkeit — die Trennlinie dieser Datei. Und in diesem Package und nicht
   * im Loeser, weil erst hier die Uebersetzung von Zeilennummer auf Knoten und
   * Richtung liegt: `linear-solver-wasm` kennt nur Zahlen.
   */
  readonly deformationLimits: DeformationLimits;

  /**
   * Welcher der beiden Rechenwege durch `K d = F` geht. Voreinstellung
   * `'sparse'`.
   *
   * DIE WAHL IST EINE EINSTELLUNG, DIE FÄHIGKEIT IST EIN PORT — die Trennlinie
   * dieser Datei, angewandt auf den Löser. „Direkt oder iterativ lösen" nennt
   * die Doku oben als Beispiel einer persistierbaren Einstellung; „dicht oder
   * dünnbesetzt" ist derselbe Fall. Welcher Code das dann tut, sagt
   * `SolverConfig.solveLinearSystem` beziehungsweise `solveSparseSystem`.
   *
   * WARUM DÜNNBESETZT DIE VOREINSTELLUNG IST: 2 000 Knoten sind 6 000
   * Freiheitsgrade und damit `36e6` Zahlen — 288 MB allein für `K` im
   * Hauptthread, bei rund zwölf besetzten Einträgen je Zeile. Das ist eine
   * Speicherfrage und keine Geschwindigkeitsfrage
   * ([ADR 0043](../../../docs/adr/0043-the-solver-is-an-analysis-setting.md)).
   */
  readonly linearSystem: LinearSystemKind;
};

/** Was ein Aufrufer abweichend setzen darf — verschachtelt nach Eigentuemer. */
export type AnalysisPolicyOverrides = {
  readonly loads?: LoadValidationPolicyOverrides;
  readonly shearDeformation?: boolean;
  readonly deformationLimits?: {
    readonly warn?: Partial<DeformationLimit>;
    readonly fail?: Partial<DeformationLimit>;
  };
  readonly linearSystem?: LinearSystemKind;
};

/** Die Voreinstellung der gesamten Rechenkette. */
export const DEFAULT_ANALYSIS_POLICY: AnalysisPolicy = Object.freeze({
  loads: DEFAULT_LOAD_VALIDATION_POLICY,
  shearDeformation: true,
  deformationLimits: DEFAULT_DEFORMATION_LIMITS,
  linearSystem: 'sparse',
});

const FIELDS = [
  'loads',
  'shearDeformation',
  'deformationLimits',
  'linearSystem',
] as const;

const STAGES = ['warn', 'fail'] as const;
const MEASURES = ['rotation', 'relativeDisplacement'] as const;

/**
 * Eine vollstaendige, tief eingefrorene Policy der aktuellen Version.
 *
 * Ohne Argument ist das Ergebnis `DEFAULT_ANALYSIS_POLICY` SELBST; ohne
 * `loads`-Overrides bleibt das Blatt identisch zum Default-Blatt. Jede fremde
 * Scheibe geht durch die Factory ihres Regel-Eigentuemers — auch deren Fehler
 * kommen unveraendert von dort.
 */
export function createAnalysisPolicy(
  overrides?: AnalysisPolicyOverrides,
): AnalysisPolicy {
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    return DEFAULT_ANALYSIS_POLICY;
  }

  return Object.freeze({
    loads: createLoadValidationPolicy(overrides.loads),
    shearDeformation:
      overrides.shearDeformation ?? DEFAULT_ANALYSIS_POLICY.shearDeformation,
    deformationLimits: createDeformationLimits(overrides.deformationLimits),
    linearSystem: assertValidLinearSystem(
      overrides.linearSystem ?? DEFAULT_ANALYSIS_POLICY.linearSystem,
    ),
  });
}

/**
 * Die Werteregel für `linearSystem` — dieselbe für Factory und Parser.
 *
 * Die Factory braucht sie trotz des Typs: ein Aufrufer aus reinem JavaScript
 * hat ihn nicht, und die Voreinstellung `'sparse'` wäre dann still eine
 * unbekannte Zeichenkette.
 */
function assertValidLinearSystem(value: unknown): LinearSystemKind {
  if (!(LINEAR_SYSTEM_KINDS as readonly unknown[]).includes(value)) {
    throw new InvalidAnalysisPolicyError(
      `"linearSystem" muss ${LINEAR_SYSTEM_KINDS.map(
        (kind) => `"${kind}"`,
      ).join(
        ' oder ',
      )} sein (war: ${typeof value === 'string' ? `"${value}"` : typeof value}).`,
      'linearSystem',
    );
  }
  return value as LinearSystemKind;
}

/**
 * Die Verformungsgrenzen aus optionalen Abweichungen — dieselbe
 * Identitaetsregel wie oben: ein unveraendertes Blatt wird nicht kopiert.
 *
 * Die Scheibe bleibt HIER und wandert nicht in ein eigenes Modul, anders als die
 * `LoadValidationPolicy`: sie gehoert diesem Package. Was eine brauchbare
 * Verformung ist, entscheidet, wer rechnet.
 */
function createDeformationLimits(
  overrides: AnalysisPolicyOverrides['deformationLimits'],
): DeformationLimits {
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    return DEFAULT_DEFORMATION_LIMITS;
  }

  const limits: DeformationLimits = Object.freeze({
    warn: mergeLimit(DEFAULT_DEFORMATION_LIMITS.warn, overrides.warn),
    fail: mergeLimit(DEFAULT_DEFORMATION_LIMITS.fail, overrides.fail),
  });

  assertValidDeformationLimits(limits);
  return limits;
}

function mergeLimit(
  base: DeformationLimit,
  overrides: Partial<DeformationLimit> | undefined,
): DeformationLimit {
  return Object.freeze({
    rotation: overrides?.rotation ?? base.rotation,
    relativeDisplacement:
      overrides?.relativeDisplacement ?? base.relativeDisplacement,
  });
}

/**
 * Die Werteregeln — dieselben fuer Factory und Parser.
 *
 * `> 0` und nicht `>= 0`: eine Grenze von 0 beanstandete jedes Ergebnis, auch
 * das exakt unverformte. `warn < fail` ist ein FENSTER und kein Punkt — fallen
 * die Stufen zusammen, gibt es die Warnung nicht mehr, und der Anwender bekaeme
 * ohne Vorwarnung einen Wurf.
 */
function assertValidDeformationLimits(limits: DeformationLimits): void {
  for (const stage of STAGES) {
    for (const measure of MEASURES) {
      const value = limits[stage][measure];
      if (!Number.isFinite(value) || value <= 0) {
        throw new InvalidAnalysisPolicyError(
          `"deformationLimits.${stage}.${measure}" muss endlich und > 0 sein ` +
            `(war: ${value}).`,
          `deformationLimits.${stage}.${measure}`,
        );
      }
    }
  }

  for (const measure of MEASURES) {
    if (limits.warn[measure] >= limits.fail[measure]) {
      throw new InvalidAnalysisPolicyError(
        `es muss deformationLimits.warn.${measure} < ` +
          `deformationLimits.fail.${measure} gelten (war: ` +
          `${limits.warn[measure]} und ${limits.fail[measure]}).`,
        `deformationLimits.fail.${measure}`,
      );
    }
  }
}

/**
 * Eine Policy aus einem Projektdatensatz.
 *
 * PRUEFT NUR NOCH DIE FORM — vollstaendig, keine unbekannten Felder,
 * Werteregeln. Die Frage „ist diese Datei neuer als das Programm?" beantwortet
 * seit ADR 0049 die `schemaVersion` DES DOKUMENTS, und sie beantwortet sie
 * ZUERST: `parseFEMModelSnapshot` lehnt einen fremden Satz ab, bevor er hier
 * ankommt. Deshalb ist „unbekanntes Feld" hier die richtige Auskunft — wer bis
 * hierher kommt, hat die passende Dokumentversion.
 */
export function parseAnalysisPolicy(input: unknown): AnalysisPolicy {
  const record = asRecord(input);

  for (const key of Object.keys(record)) {
    if (!(FIELDS as readonly string[]).includes(key)) {
      throw new InvalidAnalysisPolicyError(`unbekanntes Feld "${key}".`, key);
    }
  }

  const shearDeformation = record.shearDeformation;
  if (typeof shearDeformation !== 'boolean') {
    throw new InvalidAnalysisPolicyError(
      shearDeformation === undefined
        ? '"shearDeformation" fehlt.'
        : '"shearDeformation" muss ein Wahrheitswert sein (war: ' +
            `${typeof shearDeformation}).`,
      'shearDeformation',
    );
  }

  if (record.loads === undefined) {
    throw new InvalidAnalysisPolicyError('"loads" fehlt.', 'loads');
  }

  if (record.linearSystem === undefined) {
    throw new InvalidAnalysisPolicyError(
      '"linearSystem" fehlt.',
      'linearSystem',
    );
  }

  return Object.freeze({
    // Das Blatt prueft sein Eigentuemer — samt seiner eigenen Fehlerklasse.
    loads: parseLoadValidationPolicy(record.loads),
    shearDeformation,
    deformationLimits: parseDeformationLimits(record.deformationLimits),
    linearSystem: assertValidLinearSystem(record.linearSystem),
  });
}

/**
 * Die Verformungsgrenzen aus Fremddaten.
 *
 * Prueft die FORM vollstaendig — beide Stufen, beide Groessen, keine unbekannten
 * Felder — und uebergibt die WERTE derselben Pruefung, die auch die Factory
 * benutzt. Zwei Formpruefungen waeren zwei Wahrheiten ueber dieselbe Form; zwei
 * Werteprueferein waeren zwei Wahrheiten ueber dieselben Regeln.
 */
function parseDeformationLimits(input: unknown): DeformationLimits {
  if (input === undefined) {
    throw new InvalidAnalysisPolicyError(
      '"deformationLimits" fehlt.',
      'deformationLimits',
    );
  }
  const record = asNestedRecord(input, 'deformationLimits');

  for (const key of Object.keys(record)) {
    if (!(STAGES as readonly string[]).includes(key)) {
      throw new InvalidAnalysisPolicyError(
        `unbekannte Stufe "deformationLimits.${key}".`,
        `deformationLimits.${key}`,
      );
    }
  }

  const stages = {} as { warn: DeformationLimit; fail: DeformationLimit };
  for (const stage of STAGES) {
    const path = `deformationLimits.${stage}`;
    if (record[stage] === undefined) {
      throw new InvalidAnalysisPolicyError(`"${path}" fehlt.`, path);
    }
    const values = asNestedRecord(record[stage], path);

    for (const key of Object.keys(values)) {
      if (!(MEASURES as readonly string[]).includes(key)) {
        throw new InvalidAnalysisPolicyError(
          `unbekanntes Feld "${path}.${key}".`,
          `${path}.${key}`,
        );
      }
    }

    const limit = {} as { rotation: number; relativeDisplacement: number };
    for (const measure of MEASURES) {
      const value = values[measure];
      if (typeof value !== 'number') {
        throw new InvalidAnalysisPolicyError(
          value === undefined
            ? `"${path}.${measure}" fehlt.`
            : `"${path}.${measure}" muss eine Zahl sein (war: ${typeof value}).`,
          `${path}.${measure}`,
        );
      }
      limit[measure] = value;
    }
    stages[stage] = Object.freeze(limit);
  }

  const limits: DeformationLimits = Object.freeze(stages);
  assertValidDeformationLimits(limits);
  return limits;
}

function asNestedRecord(input: unknown, path: string): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidAnalysisPolicyError(
      `"${path}" muss ein Objekt sein (war: ` +
        `${input === null ? 'null' : typeof input}).`,
      path,
    );
  }
  return input as Record<string, unknown>;
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidAnalysisPolicyError(
      `erwartet wird ein Objekt (war: ${input === null ? 'null' : typeof input}).`,
    );
  }
  return input as Record<string, unknown>;
}
