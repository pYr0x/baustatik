/**
 * Die ERZEUGUNGS-Einstellungen des Querschnitts: was steuert, welche Figur und
 * welche Zahlen aus einer Eingabe entstehen
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 *
 * EIGENE WURZEL, KEINE SCHEIBE VON `AnalysisPolicy`, und die Trennlinie steht
 * schon in
 * [ADR 0011](../../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md):
 * eine Analyse-Einstellung *„steuert die Rechnung, OHNE DAS MODELL ZU AENDERN"*.
 * `arcTolerance` aendert es. Der abgeleitete Umriss reist nach
 * [ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)
 * IM SATZ mit, und seine Punktzahl haengt an dieser Zahl — aus ihr fallen `A`,
 * `Iy` und `Iz`. Der Loeser truege eine Zahl mit, die er nie liest: die
 * Rechenstrecke liest den MITGEFUEHRTEN Umriss, nie das Rezept.
 *
 * ZWEI EINGAENGE, wie bei `LoadValidationPolicy` in `@baustatik/fem-loads`, und
 * die Arbeitsteilung ist dieselbe:
 *
 *   `createSectionPolicy` bekommt ein GETYPTES Argument und prueft deshalb nur
 *   WERTE — dass die Felder heissen, wie sie heissen, hat der Compiler gesagt.
 *
 *   `parseSectionPolicy` ist der Grenzuebertritt aus JSON. Nur er prueft die
 *   FORM: vollstaendig, keine unbekannten Felder, jedes Feld eine Zahl.
 *
 * KEINE EIGENE `schemaVersion`. Eine Version je Datensatz, und der Datensatz
 * ist der Snapshot; `LoadValidationPolicy` als Scheibe traegt ebenfalls keine.
 * Zwei Versionsnummern ueber denselben Bytes waeren eine zweite Wahrheit ueber
 * die Form der Daten.
 *
 * UNVERAENDERLICH UND MIT DEFAULT-IDENTITAET: die Objekte sind eingefroren und
 * readonly, deshalb liefert die Fabrik ohne Overrides den Default SELBST
 * zurueck statt einer Kopie. Der Parser baut immer neu — seine Eingabe sind
 * Fremddaten.
 */

import { DEFAULT_ARC_TOLERANCE } from '@baustatik/section-geometry';
import type { mm } from '@baustatik/units';
import { InvalidSectionPolicyError } from './errors';

/**
 * Die Stellschrauben der Querschnitts-ERZEUGUNG.
 *
 * HEUTE EIN FELD, und die Scheibenform steht trotzdem vollstaendig da: drei
 * weitere Kandidaten sind bereits datiert, und sie sollen spaeter EINRASTEN
 * statt die Fabrik samt Merge-Semantik neu zu erfinden.
 *
 * | Kandidat                                   | faellig |
 * | ------------------------------------------ | ------- |
 * | Miter-Limit + `JoinType` (die Umrissecke)   | P3      |
 * | Schwelle „`Iyz` ist null"                   | P2      |
 * | Schwelle „dicke Wand" (`t/h`)               | P5      |
 *
 * AUSDRUECKLICH KEIN KANDIDAT: DIE GAUSS-PUNKTE fuer Grashof (P4). Sie werden
 * von `sectionProperties` gelesen, und das liegt auf der RECHENSTRECKE
 * (`getSectionStiffness` in `@baustatik/fem-section-resolve`, je Stab in
 * `solve()`/`check()`) — eine Einstellung dort waere nach ADR 0011 eine
 * *Analyse*-Einstellung und gehoerte in `AnalysisPolicy`, nicht hierher. Sie
 * werden ueberhaupt keine Einstellung, sondern eine KONSTANTE: bei senkrechten
 * Kanten ist `t(z)` je Streifen konstant, der Integrand ein Polynom 6. Grades
 * und 4-Punkt-Gauss damit EXAKT; bei schraegen bringen rund 8 Punkte `1e-12`.
 * Das ist Konvergenz und keine Wahl — ein Schalter luede dazu ein, ein exaktes
 * Ergebnis zu verschlechtern.
 *
 * DIE KNICKSCHRANKE IST EBENFALLS KEIN FELD: sie wird nach ADR 0032 aus
 * `arcTolerance` ABGELEITET (`notch > arcTolerance`), nicht gesetzt.
 */
export type SectionPolicy = {
  /**
   * Zulaessige Sehnenabweichung der Diskretisierung [mm].
   *
   * GEBRANDET, weil das Feld kuenftig im Modellsatz neben `Wall.t` und
   * `SectionNode.y` steht, die alle `mm` tragen. ADR 0032 hat die Einheit so
   * geschrieben, der Code hatte ein nacktes `number` — die Abweichung wird hier
   * aufgeraeumt und nicht zementiert.
   *
   * SIE WIRKT ZWEIMAL, und das ist eine Modellannahme und nicht zwei: sie sagt,
   * wie fein ein Bogen zerlegt wird, UND ab wann er als Gerade gilt
   * (`Bulge.isStraight`). Aus ihr faellt ausserdem die Knickschranke des
   * Gates (ADR 0032).
   */
  readonly arcTolerance: mm;
};

/** Was ein Aufrufer abweichend setzen darf; der Rest kommt aus dem Default. */
export type SectionPolicyOverrides = Partial<SectionPolicy>;

/**
 * Die Voreinstellung.
 *
 * `DEFAULT_ARC_TOLERANCE` ZIEHT NICHT UM: die Policy LIEST die Zahl aus
 * `@baustatik/section-geometry`, wo die Diskretisierung wohnt. Sie hier neu zu
 * setzen brachte den Zustand zurueck, den P0 gerade beseitigt hat — zwei Zahlen
 * fuer eine Annahme (ADR 0032).
 */
export const DEFAULT_SECTION_POLICY: SectionPolicy = Object.freeze({
  arcTolerance: DEFAULT_ARC_TOLERANCE,
});

const FIELDS = ['arcTolerance'] as const;

/**
 * Eine vollstaendige, eingefrorene Policy aus optionalen Abweichungen.
 *
 * Ohne Overrides ist das Ergebnis `DEFAULT_SECTION_POLICY` SELBST.
 */
export function createSectionPolicy(
  overrides?: SectionPolicyOverrides,
): SectionPolicy {
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    return DEFAULT_SECTION_POLICY;
  }

  const policy: SectionPolicy = {
    arcTolerance: overrides.arcTolerance ?? DEFAULT_SECTION_POLICY.arcTolerance,
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
export function parseSectionPolicy(input: unknown): SectionPolicy {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidSectionPolicyError(
      `erwartet wird ein Objekt (war: ${input === null ? 'null' : typeof input}).`,
    );
  }
  const record = input as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(FIELDS as readonly string[]).includes(key)) {
      throw new InvalidSectionPolicyError(`unbekanntes Feld "${key}".`, key);
    }
  }

  const arcTolerance = record.arcTolerance;
  if (typeof arcTolerance !== 'number') {
    throw new InvalidSectionPolicyError(
      arcTolerance === undefined
        ? '"arcTolerance" fehlt.'
        : `"arcTolerance" muss eine Zahl sein (war: ${typeof arcTolerance}).`,
      'arcTolerance',
    );
  }

  const policy: SectionPolicy = { arcTolerance };
  assertValidValues(policy);
  return Object.freeze(policy);
}

/**
 * Die Werteregeln — dieselben fuer beide Eingaenge.
 *
 * ECHT POSITIV und nicht bloss endlich: `arcTolerance = 0` verlangte eine
 * Zerlegung ohne jede Sehnenabweichung, also unendlich viele Punkte, und
 * `Arc.toPolyline` weist die 0 aus genau diesem Grund selbst zurueck. Eine
 * negative Toleranz liesse `Bulge.isStraight` nie mehr wahr werden — die
 * Gerade waere abgeschafft.
 */
function assertValidValues(policy: SectionPolicy): void {
  const { arcTolerance } = policy;
  if (!Number.isFinite(arcTolerance) || arcTolerance <= 0) {
    throw new InvalidSectionPolicyError(
      `"arcTolerance" muss endlich und groesser als 0 sein (war: ${arcTolerance}).`,
      'arcTolerance',
    );
  }
}
