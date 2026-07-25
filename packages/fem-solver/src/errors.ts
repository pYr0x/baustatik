/**
 * Die Fehler und Hinweise des Solvers.
 *
 * DREI SORTEN, und die Zuordnung ist kein Zufall:
 *
 *   - Zwei erweitern die HIERARCHIEN anderer Packages
 *     (`ModelValidationError` aus `@baustatik/fem`, `LoadValidationWarning` aus
 *     `@baustatik/fem-loads`). Sie gehoeren fachlich dorthin, koennen dort aber
 *     nicht wohnen: die eine braucht `SectionProperties`, das `fem` nicht kennt;
 *     die andere braucht Modell UND Lasten, und keins der beiden Packages sieht
 *     beides. Die abstrakte Basisklasse ist genau dafuer die Erweiterungsstelle
 *     — der Bericht bleibt dadurch EINE Liste je Sorte.
 *   - Zwei sind eigene Fehler der Rechnung. Sie fallen erst am
 *     Gleichungssystem auf und haben deshalb nirgendwo sonst ein Zuhause.
 *
 * Die Lastfehler kommen NICHT von hier: die definiert `@baustatik/fem-loads`
 * und dieses Package reicht sie unveraendert durch — sonst gaebe es zwei Namen
 * fuer denselben Eingabefehler.
 */

import { BaustatikError } from '@baustatik/errors';
import { ModelValidationError } from '@baustatik/fem';
import { LoadValidationWarning } from '@baustatik/fem-loads';

/** Die drei Freiheitsgrade eines Knotens, in Nummerierungsreihenfolge. */
export type DegreeOfFreedom = 'ux' | 'uz' | 'phiY';

const DOF_LABEL: Record<DegreeOfFreedom, string> = {
  ux: 'Verschiebung in x',
  uz: 'Verschiebung in z',
  phiY: 'Verdrehung um y',
};

/**
 * Zu einem Stab gibt es keine Steifigkeiten (M7).
 *
 * Ein MODELLfehler, kein Rechenfehler: die `crossSectionId` oder `materialId`
 * des Stabs zeigt ins Leere. Er entsteht hier und nicht in `@baustatik/fem`,
 * weil nur dieses Package den Port kennt, der die Steifigkeiten liefert — `fem`
 * weiss nichts von `SectionProperties`.
 *
 * WARUM ER IM BERICHT LANDET UND NICHT ERST IN `solve()`: sonst meldete
 * `check()` „ready" und `solve()` schluege trotzdem fehl. Genau diese
 * Zweideutigkeit soll der Bericht beseitigen.
 */
export class UnknownSectionPropertiesError extends ModelValidationError {
  readonly beamId: string;
  readonly crossSectionId: string;
  readonly materialId: string;

  constructor(beamId: string, crossSectionId: string, materialId: string) {
    super(
      `Stab "${beamId}": keine Steifigkeiten zu Querschnitt ` +
        `"${crossSectionId}" und Material "${materialId}".`,
    );
    this.beamId = beamId;
    this.crossSectionId = crossSectionId;
    this.materialId = materialId;
  }
}

/**
 * Eine Knotenlast auf einem Knoten, an dem kein Stab haengt.
 *
 * HINWEIS und kein Fehler: die Last ist zulaessig eingegeben. Sie traegt nur
 * nirgends ein, weil kein Element an diesem Knoten haengt — sie verschwindet
 * spurlos aus der Rechnung, waehrend die Zeichnung sie zeigt.
 *
 * Sie entsteht hier, weil sie Modell UND Lasten braucht: `fem` sieht die Lasten
 * nicht, und `fem-loads` muesste dafuer eine dritte Auskunft an
 * `LoadModelGeometry` bekommen („haengt an diesem Knoten ein Stab") — und das
 * ist eine Modell-, keine Lastfrage. Der Graph selbst kommt aus
 * `isolatedNodeIds` in `@baustatik/fem`; er wird nicht zweimal gerechnet.
 */
export class LoadOnIsolatedNodeWarning extends LoadValidationWarning {
  readonly nodeId: string;

  constructor(loadId: string, nodeId: string) {
    super(
      loadId,
      `liegt auf Knoten "${nodeId}", an dem kein Stab haengt — sie traegt ` +
        'nirgends ein.',
    );
    this.nodeId = nodeId;
  }
}

/**
 * Ein freier Freiheitsgrad, den kein Element haelt — die Diagonale der
 * reduzierten Steifigkeitsmatrix ist dort 0.
 *
 * Die eine Sorte Kinematik, die VOR dem Loesen erkennbar ist, und die einzige,
 * die Knoten und Richtung beim Namen nennen kann. Typischer Fall: an einem
 * Knoten haengen nur Staebe, die dort ein Gelenk haben — die Verdrehung des
 * Knotens ist dann an nichts gekoppelt. Das ist die Pendelstabkette, die die
 * Modellpruefung bewusst dem Loeser ueberlassen hat.
 */
export class UnrestrainedDegreeOfFreedomError extends BaustatikError {
  readonly nodeId: string;
  readonly dof: DegreeOfFreedom;

  constructor(nodeId: string, dof: DegreeOfFreedom) {
    super(
      `Knoten "${nodeId}": die ${DOF_LABEL[dof]} (${dof}) wird von keinem ` +
        'Element gehalten — das Modell ist an dieser Stelle frei beweglich.',
    );
    this.nodeId = nodeId;
    this.dof = dof;
  }
}

/**
 * Das Gleichungssystem hat keine brauchbare Loesung: im Ergebnis stehen `NaN`
 * oder `Infinity`.
 *
 * Das zweite Netz nach `UnrestrainedDegreeOfFreedomError`, fuer die Kinematik,
 * die eine besetzte Diagonale hat — verschieblicher Rahmen, Gelenkkette, lauter
 * parallele Auflager.
 *
 * ES IST EIN GROBES NETZ, und das ist ehrlich zu sagen: eine FAST singulaere
 * Matrix liefert grosse, aber endliche Zahlen und kommt hier durch. Sie zu
 * erkennen braucht eine Konditionsschaetzung aus `faer`, also die Rust-Seite
 * von `@baustatik/linear-solver-wasm`. Eine Residuenprobe hilft dagegen NICHT:
 * LU mit Spaltenpivotierung hat auch bei fast singulaerer Matrix einen winzigen
 * Rueckwaertsfehler.
 */
export class SingularStiffnessMatrixError extends BaustatikError {
  constructor() {
    super(
      'Das Gleichungssystem ist nicht loesbar — im Ergebnis stehen nicht ' +
        'endliche Werte. Das Modell ist kinematisch: ein verschieblicher ' +
        'Rahmen, eine Gelenkkette, oder lauter parallel wirkende Auflager.',
    );
  }
}

/**
 * Die Analyse-Einstellung selbst ist unbrauchbar (`src/policy.ts`).
 *
 * Betrifft nur die AGGREGAT-Form: Version, Top-Level-Felder, die eigenen
 * Entscheidungen dieses Packages. Die Blaetter fremder Packages melden sich mit
 * der Fehlerklasse ihres Eigentuemers (`InvalidLoadValidationPolicyError`) —
 * sonst gaebe es zwei Namen fuer denselben Befund, und der Anwender erfuehre
 * nicht, wessen Regel er verletzt hat.
 */
export class InvalidAnalysisPolicyError extends BaustatikError {
  /** Das beanstandete Top-Level-Feld, sofern es eines ist. */
  readonly field: string | undefined;

  constructor(reason: string, field?: string) {
    super(`Analyse-Einstellung: ${reason}`);
    this.field = field;
  }
}

/**
 * Der Datensatz traegt eine Schema-Version, die diese Fassung nicht kennt.
 *
 * EIGENE KLASSE und nicht `InvalidAnalysisPolicyError`, weil der Anwender
 * verschiedene Dinge tun kann: eine kaputte Einstellung repariert er, eine
 * neuere Datei oeffnet er mit einer neueren Fassung. Die Unterscheidung geht
 * verloren, sobald beides derselbe Fehler ist.
 */
export class UnsupportedAnalysisPolicySchemaVersionError extends BaustatikError {
  readonly schemaVersion: number;
  readonly supportedSchemaVersion: number;

  // Die unterstuetzte Version kommt als Argument und nicht aus `policy.ts`:
  // andersherum importierte `errors.ts` aus dem Modul, das es selbst importiert.
  constructor(schemaVersion: number, supportedSchemaVersion: number) {
    super(
      `Analyse-Einstellung: Schema-Version ${schemaVersion} wird nicht ` +
        `unterstuetzt (unterstuetzt wird ${supportedSchemaVersion}).`,
    );
    this.schemaVersion = schemaVersion;
    this.supportedSchemaVersion = supportedSchemaVersion;
  }
}
