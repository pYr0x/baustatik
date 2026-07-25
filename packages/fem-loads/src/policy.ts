/**
 * Die Analyse-Einstellungen DIESES Packages: was die Lastvalidierung steuert,
 * ohne das Lastmodell zu aendern.
 *
 * WARUM DIE SCHEIBE HIER WOHNT UND NICHT IM SOLVER: die drei Zahlen sind
 * Stellschrauben an Regeln, die dieses Package besitzt. Wer die Regel hat, hat
 * auch ihren Default und ihre Werteprueferei; sonst stuenden die Zahlen dort,
 * wo niemand nachlesen kann, wogegen sie eigentlich pruefen.
 * `@baustatik/fem-solver` setzt diese Scheibe als Composition Root mit seinen
 * eigenen Entscheidungen zur versionierten `AnalysisPolicy` zusammen
 * ([ADR 0011](../../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md)).
 *
 * ZWEI EINGAENGE, und die Arbeitsteilung ist der ganze Entwurf:
 *
 *   `createLoadValidationPolicy` bekommt ein GETYPTES Argument und prueft
 *   deshalb nur WERTE — dass die Felder heissen, wie sie heissen, hat der
 *   Compiler schon gesagt.
 *
 *   `parseLoadValidationPolicy` ist der Grenzuebertritt aus JSON. Nur er prueft
 *   die FORM: vollstaendig, keine unbekannten Felder, jedes Feld eine Zahl.
 *   Dieselbe Formpruefung an beiden Stellen waeren zwei Wahrheiten ueber
 *   dieselbe Form.
 *
 * UNVERAENDERLICH UND MIT DEFAULT-IDENTITAET: die Objekte sind eingefroren und
 * readonly, deshalb liefert die Factory ohne Overrides den Default SELBST
 * zurueck statt einer Kopie. Der Parser baut immer neu — seine Eingabe sind
 * Fremddaten.
 */

import { InvalidLoadValidationPolicyError } from './errors';

/**
 * Die Stellschrauben der Lastvalidierung.
 *
 * `stationRelativeTolerance` heisst bewusst nicht
 * `absoluteStationRelativeTolerance`: „absolut … relativ" in einem Namen liest
 * sich widerspruechlich. Gemeint ist die relative Toleranz, mit der ABSOLUTE
 * Stationen gegen die gerechnete Stablaenge verglichen werden.
 */
export type LoadValidationPolicy = {
  /**
   * Relative Toleranz fuer den Vergleich einer absoluten Station gegen die
   * Stablaenge (`value > L * (1 + tol)` ist ausserhalb).
   *
   * Gebraucht, weil die Stablaenge aus `Math.hypot` kommt und praktisch nie
   * glatt ist — ein Abstand exakt am Stabende soll nicht an der letzten
   * Binaerstelle scheitern.
   */
  readonly stationRelativeTolerance: number;

  /**
   * Bis zu welchem Bezugslaengen-Faktor `L_proj / L` die Last ABGELEHNT wird.
   *
   * Geprueft wird `factor <= minimumReferenceFactor`. Daraus folgt die
   * Invariante, die keine Policy wegdrehen darf: auch bei `0` bleibt der
   * EXAKTE Faktor 0 ein Fehler — eine Last, deren Bezugslaenge am Stab exakt 0
   * misst, traegt nichts ein.
   */
  readonly minimumReferenceFactor: number;

  /**
   * Ab wo ein Bezugslaengen-Faktor nach einem Vertipper aussieht — der Default
   * `0.05` entspricht rund 2,9 Grad gegen die Bezugsrichtung.
   *
   * Muss echt ueber `minimumReferenceFactor` liegen, sonst gaebe es kein
   * Fenster, in dem gewarnt statt abgelehnt wird. Die Begruendung der Zahl
   * samt Wertetabelle steht in der CONTEXT.md dieses Packages.
   */
  readonly suspiciousReferenceFactor: number;
};

/** Was ein Aufrufer abweichend setzen darf; der Rest kommt aus dem Default. */
export type LoadValidationPolicyOverrides = Partial<LoadValidationPolicy>;

/** Die Voreinstellung — die Zahlen, die frueher privat in `validate.ts` standen. */
export const DEFAULT_LOAD_VALIDATION_POLICY: LoadValidationPolicy =
  Object.freeze({
    stationRelativeTolerance: 1e-9,
    minimumReferenceFactor: 1e-9,
    suspiciousReferenceFactor: 0.05,
  });

const FIELDS = [
  'stationRelativeTolerance',
  'minimumReferenceFactor',
  'suspiciousReferenceFactor',
] as const;

/**
 * Eine vollstaendige, eingefrorene Policy aus optionalen Abweichungen.
 *
 * Ohne Overrides ist das Ergebnis `DEFAULT_LOAD_VALIDATION_POLICY` SELBST.
 */
export function createLoadValidationPolicy(
  overrides?: LoadValidationPolicyOverrides,
): LoadValidationPolicy {
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    return DEFAULT_LOAD_VALIDATION_POLICY;
  }

  const policy: LoadValidationPolicy = {
    stationRelativeTolerance:
      overrides.stationRelativeTolerance ??
      DEFAULT_LOAD_VALIDATION_POLICY.stationRelativeTolerance,
    minimumReferenceFactor:
      overrides.minimumReferenceFactor ??
      DEFAULT_LOAD_VALIDATION_POLICY.minimumReferenceFactor,
    suspiciousReferenceFactor:
      overrides.suspiciousReferenceFactor ??
      DEFAULT_LOAD_VALIDATION_POLICY.suspiciousReferenceFactor,
  };

  assertValidValues(policy);
  return Object.freeze(policy);
}

/**
 * Eine Policy aus Fremddaten — der Grenzuebertritt aus einem Projektdatensatz.
 *
 * STRIKT, weil ein stillschweigend geschluckter Tippfehler eine Einstellung
 * waere, die nicht wirkt: unbekannte Felder werden abgelehnt, nicht ignoriert.
 */
export function parseLoadValidationPolicy(
  input: unknown,
): LoadValidationPolicy {
  const record = asRecord(input);

  for (const key of Object.keys(record)) {
    if (!(FIELDS as readonly string[]).includes(key)) {
      throw new InvalidLoadValidationPolicyError(
        `unbekanntes Feld "${key}".`,
        key,
      );
    }
  }

  const values: Record<string, number> = {};
  for (const field of FIELDS) {
    const value = record[field];
    if (typeof value !== 'number') {
      throw new InvalidLoadValidationPolicyError(
        value === undefined
          ? `"${field}" fehlt.`
          : `"${field}" muss eine Zahl sein (war: ${typeof value}).`,
        field,
      );
    }
    values[field] = value;
  }

  const policy: LoadValidationPolicy = {
    stationRelativeTolerance: values.stationRelativeTolerance,
    minimumReferenceFactor: values.minimumReferenceFactor,
    suspiciousReferenceFactor: values.suspiciousReferenceFactor,
  };

  assertValidValues(policy);
  return Object.freeze(policy);
}

function asRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidLoadValidationPolicyError(
      `erwartet wird ein Objekt (war: ${input === null ? 'null' : typeof input}).`,
    );
  }
  return input as Record<string, unknown>;
}

/** Die Werteregeln — dieselben fuer beide Eingaenge. */
function assertValidValues(policy: LoadValidationPolicy): void {
  const { stationRelativeTolerance, minimumReferenceFactor, suspiciousReferenceFactor } =
    policy;

  if (
    !Number.isFinite(stationRelativeTolerance) ||
    stationRelativeTolerance < 0
  ) {
    throw new InvalidLoadValidationPolicyError(
      '"stationRelativeTolerance" muss endlich und >= 0 sein (war: ' +
        `${stationRelativeTolerance}).`,
      'stationRelativeTolerance',
    );
  }

  // Ein Fenster, kein Punkt: unterhalb von `minimum` wird abgelehnt, dazwischen
  // gewarnt. Fallen die Schranken zusammen, gibt es die Warnung nicht mehr.
  if (
    !Number.isFinite(minimumReferenceFactor) ||
    !Number.isFinite(suspiciousReferenceFactor) ||
    !(
      minimumReferenceFactor >= 0 &&
      minimumReferenceFactor < suspiciousReferenceFactor &&
      suspiciousReferenceFactor <= 1
    )
  ) {
    throw new InvalidLoadValidationPolicyError(
      'es muss 0 <= minimumReferenceFactor < suspiciousReferenceFactor <= 1 ' +
        `gelten (war: ${minimumReferenceFactor} und ${suspiciousReferenceFactor}).`,
    );
  }
}
