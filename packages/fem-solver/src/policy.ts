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
 *           `getSectionProperties`. Sie bleiben Ports in `SolverConfig`.
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
export const ANALYSIS_POLICY_SCHEMA_VERSION = 1;

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
   * Bei `false` ersetzt `solve()` das `GAs` aus `getSectionProperties` durch
   * `'rigid'`. Der QUERSCHNITT bleibt unangetastet: jeder Querschnitt HAT eine
   * Schubsteifigkeit, sie zu vernachlaessigen ist eine Entscheidung ueber die
   * ANALYSE (RSTAB-Konvention, vorweggenommen in `fem-element/src/types.ts`).
   *
   * Der einzige Schalter hier, den ein Anwender tatsaechlich dreht — die
   * uebrigen Felder sind numerische Waechter. Er stand frueher auf
   * `SolverConfig` und ist hierher UMGEZOGEN, nicht verdoppelt.
   */
  readonly shearDeformation: boolean;
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
};

/** Die Voreinstellung der gesamten Rechenkette. */
export const DEFAULT_ANALYSIS_POLICY: AnalysisPolicy = Object.freeze({
  schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION,
  loads: DEFAULT_LOAD_VALIDATION_POLICY,
  shearDeformation: true,
});

const FIELDS = ['schemaVersion', 'loads', 'shearDeformation'] as const;

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
  });
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
  });
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidAnalysisPolicyError(
      `erwartet wird ein Objekt (war: ${input === null ? 'null' : typeof input}).`,
    );
  }
  return input as Record<string, unknown>;
}
