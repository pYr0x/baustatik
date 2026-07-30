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
 *           werden versioniert persistiert.
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
import {
  InvalidAnalysisPolicyError,
  UnsupportedAnalysisPolicySchemaVersionError,
} from './errors';

/**
 * Die Version der persistierten Form.
 *
 * Steht am Datensatz und nicht am Programm, weil ein Projekt laenger lebt als
 * eine Fassung der Software: der Parser muss sagen koennen „das ist eine
 * neuere Datei", statt an einem unbekannten Feld zu scheitern.
 */
export const ANALYSIS_POLICY_SCHEMA_VERSION = 2;

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
 */
export type AnalysisPolicy = {
  readonly schemaVersion: typeof ANALYSIS_POLICY_SCHEMA_VERSION;

  /** Die Scheibe von `@baustatik/fem-loads` — dort wohnen ihre Regeln. */
  readonly loads: LoadValidationPolicy;

  /**
   * Ob die Schubverformung beruecksichtigt wird. Voreinstellung `true` — das
   * ist die native Betriebsart der Timoshenko-Formulierung.
   *
   * Bei `false` ersetzt `solve()` das `GAs` aus `getSectionStiffness` durch
   * `'rigid'`. Der QUERSCHNITT bleibt unangetastet: jeder Querschnitt HAT eine
   * Schubsteifigkeit, sie zu vernachlaessigen ist eine Entscheidung ueber die
   * ANALYSE (RSTAB-Konvention, vorweggenommen in `fem-element/src/types.ts`).
   *
   * Der einzige Schalter hier, den ein Anwender tatsaechlich dreht — die
   * uebrigen Felder sind numerische Waechter. Er stand frueher auf
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
};

/**
 * Was ein Aufrufer abweichend setzen darf — verschachtelt nach Eigentuemer.
 *
 * `schemaVersion` fehlt bewusst: die aktuelle Fassung schreibt immer die
 * aktuelle Version. Eine gewaehlte Version waere eine zweite Wahrheit ueber die
 * Form der Daten.
 */
export type AnalysisPolicyOverrides = {
  readonly loads?: LoadValidationPolicyOverrides;
  readonly shearDeformation?: boolean;
  readonly deformationLimits?: {
    readonly warn?: Partial<DeformationLimit>;
    readonly fail?: Partial<DeformationLimit>;
  };
};

/** Die Voreinstellung der gesamten Rechenkette. */
export const DEFAULT_ANALYSIS_POLICY: AnalysisPolicy = Object.freeze({
  schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION,
  loads: DEFAULT_LOAD_VALIDATION_POLICY,
  shearDeformation: true,
  deformationLimits: DEFAULT_DEFORMATION_LIMITS,
});

const FIELDS = [
  'schemaVersion',
  'loads',
  'shearDeformation',
  'deformationLimits',
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
    schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION,
    loads: createLoadValidationPolicy(overrides.loads),
    shearDeformation:
      overrides.shearDeformation ?? DEFAULT_ANALYSIS_POLICY.shearDeformation,
    deformationLimits: createDeformationLimits(overrides.deformationLimits),
  });
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
 * STRIKT und in dieser REIHENFOLGE: erst die Version, dann die Form. Ein
 * Dokument aus einer neueren Fassung hat legitim Felder, die es hier noch nicht
 * gibt — „unbekanntes Feld" waere darauf die falsche Auskunft, und der
 * Anwender braucht die andere („diese Datei ist neuer als das Programm"), um
 * etwas dagegen tun zu koennen.
 */
export function parseAnalysisPolicy(input: unknown): AnalysisPolicy {
  const record = asRecord(input);

  const schemaVersion = record.schemaVersion;
  if (typeof schemaVersion !== 'number') {
    throw new InvalidAnalysisPolicyError(
      schemaVersion === undefined
        ? '"schemaVersion" fehlt.'
        : `"schemaVersion" muss eine Zahl sein (war: ${typeof schemaVersion}).`,
      'schemaVersion',
    );
  }
  if (schemaVersion !== ANALYSIS_POLICY_SCHEMA_VERSION) {
    throw new UnsupportedAnalysisPolicySchemaVersionError(
      schemaVersion,
      ANALYSIS_POLICY_SCHEMA_VERSION,
    );
  }

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

  return Object.freeze({
    schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION,
    // Das Blatt prueft sein Eigentuemer — samt seiner eigenen Fehlerklasse.
    loads: parseLoadValidationPolicy(record.loads),
    shearDeformation,
    deformationLimits: parseDeformationLimits(record.deformationLimits),
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
