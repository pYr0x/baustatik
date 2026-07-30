/**
 * Die Fehler und Hinweise des Solvers.
 *
 * DREI SORTEN, und die Zuordnung ist kein Zufall:
 *
 *   - Zwei erweitern die HIERARCHIEN anderer Packages
 *     (`ModelValidationError` aus `@baustatik/fem`, `LoadValidationWarning` aus
 *     `@baustatik/fem-loads`). Sie gehoeren fachlich dorthin, koennen dort aber
 *     nicht wohnen: die eine braucht `SectionStiffness`, das `fem` nicht kennt;
 *     die andere braucht Modell UND Lasten, und keins der beiden Packages sieht
 *     beides. Die abstrakte Basisklasse ist genau dafuer die Erweiterungsstelle
 *     — der Bericht bleibt dadurch EINE Liste je Sorte.
 *   - Eigene Fehler der Rechnung. Sie fallen erst am Gleichungssystem oder an
 *     seiner Loesung auf und haben deshalb nirgendwo sonst ein Zuhause.
 *   - Eine eigene schmale Warnungswurzel, `SolveWarning`, fuer Befunde am
 *     ERGEBNIS. Sie steht neben den beiden fremden Warnungswurzeln, weil ein
 *     Befund an der Rechnung weder das Modell noch die Eingabe betrifft,
 *     sondern das, was aus beiden geworden ist.
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
 * Ein gerissener Verformungsgrenzwert in einem Satz.
 *
 * Einmal formuliert, weil `ImplausibleDisplacementError` und
 * `SmallRotationAssumptionWarning` DENSELBEN Befund melden und sich nur in der
 * Schaerfe unterscheiden; zwei Formulierungen waeren zwei Wahrheiten ueber
 * dieselbe Messung.
 *
 * Bei `ux`/`uz` ist `value` die RESULTIERENDE Verschiebung, bezogen auf die
 * Stablaenge — `dof` nennt nur den groesseren der beiden Anteile. Der Satz sagt
 * das auch so, sonst stuende dort eine Zahl, die zur genannten Richtung nicht
 * passt.
 */
function describeExcess(
  dof: DegreeOfFreedom,
  value: number,
  limit: number,
): string {
  const measured =
    dof === 'phiY'
      ? `die ${DOF_LABEL[dof]} (${dof}) betraegt ${value.toExponential(2)} rad`
      : `die Verschiebung betraegt ${value.toExponential(2)} Stablaengen, ` +
        `ueberwiegend in ${dof === 'ux' ? 'x' : 'z'} (${dof})`;

  return `${measured} und liegt damit ueber der Grenze ${limit.toExponential(2)}`;
}

/**
 * Zu einem Stab gibt es keine Steifigkeiten (M7).
 *
 * Ein MODELLfehler, kein Rechenfehler: die `crossSectionId` oder `materialId`
 * des Stabs zeigt ins Leere. Er entsteht hier und nicht in `@baustatik/fem`,
 * weil nur dieses Package den Port kennt, der die Steifigkeiten liefert — `fem`
 * weiss nichts von `SectionStiffness`.
 *
 * WARUM ER IM BERICHT LANDET UND NICHT ERST IN `solve()`: sonst meldete
 * `check()` „ready" und `solve()` schluege trotzdem fehl. Genau diese
 * Zweideutigkeit soll der Bericht beseitigen.
 */
export class UnknownSectionStiffnessError extends ModelValidationError {
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
 * `check(loadCaseId)` oder `solve(loadCaseId)` mit einer id, die `getLoadCases()`
 * nicht kennt.
 *
 * KEIN BERICHTSBEFUND, sondern eine verletzte Vorbedingung des Aufrufers: das
 * Modell ist in Ordnung, die Frage war falsch gestellt. Deshalb ein Wurf und
 * kein sechster Zustand im Bericht — ein Zustand beschreibt, wie weit das Modell
 * ist, nicht ob der Aufrufer sich vertippt hat.
 *
 * WIE ES DAZU KOMMT, obwohl ids UUIDs sind: eine VERALTETE id. Der Anwender
 * loescht den aktiven Lastfall, die Oberflaeche haelt die alte id noch und fragt
 * damit weiter. Kollisionen sind es nicht — die schliesst die id-Erzeugung aus.
 */
export class UnknownLoadCaseError extends BaustatikError {
  readonly loadCaseId: string;

  constructor(loadCaseId: string) {
    super(`Kein Lastfall mit der id "${loadCaseId}".`);
    this.loadCaseId = loadCaseId;
  }
}

/**
 * Die Verlauf-API wurde nach einem Stab gefragt, den das Ergebnis nicht kennt.
 *
 * Ein eigener Name und kein `undefined`: das Ergebnis traegt jeden gerechneten
 * Stab, eine unbekannte id ist also ein Tippfehler oder ein Ergebnis aus einem
 * anderen Modell — beides Fehler des Aufrufers, keine Auskunft.
 */
export class UnknownBeamError extends BaustatikError {
  readonly beamId: string;
  readonly loadCaseId: string;

  constructor(beamId: string, loadCaseId: string) {
    super(
      `Das Ergebnis des Lastfalls "${loadCaseId}" kennt keinen Stab ` +
        `"${beamId}".`,
    );
    this.beamId = beamId;
    this.loadCaseId = loadCaseId;
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
 * Das Gleichungssystem ist nicht loesbar: das Modell ist kinematisch.
 *
 * Das zweite Netz nach `UnrestrainedDegreeOfFreedomError`, fuer die Kinematik,
 * die eine besetzte Diagonale hat — verschieblicher Rahmen, Gelenkkette, lauter
 * parallele Auflager. Diese Sorte ist VOR dem Loesen nicht zu sehen; sie
 * entsteht erst aus dem Zusammenspiel mehrerer Zeilen und faellt deshalb erst
 * in der Zerlegung auf.
 *
 * Der Befund kommt aus dem Port (`LinearSolveOutcome`), wo `faer` die
 * Cholesky-Zerlegung rechnet: `K` ist symmetrisch positiv SEMIdefinit, und
 * genau an der Grenze zur Kinematik scheitert Cholesky. Erfasst wird dabei auch
 * die FAST singulaere Matrix, die frueher grosse, aber endliche Zahlen lieferte
 * und durch jedes Netz rutschte.
 *
 * KNOTEN UND RICHTUNG SIND EIN HINWEIS, KEIN BEWEIS — anders als bei
 * `UnrestrainedDegreeOfFreedomError`. Genannt wird die Stelle, an der der
 * Rangabfall waehrend der Zerlegung sichtbar wird; der Mechanismus kann
 * anderswo sitzen und mehrere Knoten umfassen. Ein Beweis waere der Eigenvektor
 * zum kleinsten Eigenwert und kostet ein Vielfaches der Rechnung.
 */
export class SingularStiffnessMatrixError extends BaustatikError {
  readonly nodeId: string | undefined;
  readonly dof: DegreeOfFreedom | undefined;
  /** Kleinstes skaliertes Pivot; `0` heisst exakter Fehlschlag. */
  readonly pivotRatio: number | undefined;

  constructor(nodeId?: string, dof?: DegreeOfFreedom, pivotRatio?: number) {
    super(
      'Das Gleichungssystem ist nicht loesbar — das Modell ist kinematisch: ' +
        'ein verschieblicher Rahmen, eine Gelenkkette, oder lauter parallel ' +
        'wirkende Auflager.' +
        (nodeId !== undefined && dof !== undefined
          ? ` Sichtbar wird es bei Knoten "${nodeId}" in der ` +
            `${DOF_LABEL[dof]} (${dof}) — dort ist es aufgefallen, dort muss ` +
            'die Ursache aber nicht liegen.'
          : ''),
    );
    this.nodeId = nodeId;
    this.dof = dof;
    this.pivotRatio = pivotRatio;
  }
}

/**
 * Das Ergebnis ist keine Verformung mehr, sondern eine Bewegung — das Modell
 * ist (nahezu) kinematisch.
 *
 * DAS VIERTE NETZ, und es haengt am ERGEBNIS statt an der Matrix. Der Grund ist
 * ein Rueckwaertsfehler: ein schraeger Stab mischt ueber die Transformation
 * `EA/L` und `12EI/L^3` in dieselbe Zeile, und was die Assemblierung dabei an
 * Stellen verliert, holt keine Zerlegung zurueck. In `K` steht danach nicht die
 * Matrix des Modells, sondern die exakte Matrix eines geringfuegig anderen — und
 * dieses andere Modell ist nicht kinematisch. Der Mechanismus zerstoert das
 * Pivot in der zwoelften Stelle, blueht in der Loesung aber um zehn
 * Groessenordnungen auf. Ausfuehrlich in ADR 0016.
 *
 * DER KNOTEN IST EXAKT, nicht nur ein Hinweis — das ist der Unterschied zu
 * `SingularStiffnessMatrixError`. Dort wird die Zeile genannt, in der der
 * Rangabfall waehrend der Zerlegung sichtbar wurde; hier wird der Knoten
 * genannt, der sich tatsaechlich bewegt.
 *
 * `dof` sagt zugleich, WELCHE Groesse die Grenze gerissen hat: `phiY` ist die
 * Verdrehung in rad, `ux`/`uz` die auf die Stablaenge bezogene Verschiebung.
 * Beide sind dimensionslos, weshalb die Grenzen ohne Einheiten auskommen.
 */
export class ImplausibleDisplacementError extends BaustatikError {
  readonly nodeId: string;
  readonly dof: DegreeOfFreedom;
  /** rad bei `phiY`, sonst `|u|/L` gegen den angehaengten Stab. */
  readonly value: number;
  /** Die gerissene Grenze aus `AnalysisPolicy.deformationLimits.fail`. */
  readonly limit: number;

  constructor(
    nodeId: string,
    dof: DegreeOfFreedom,
    value: number,
    limit: number,
  ) {
    super(
      `Knoten "${nodeId}": ${describeExcess(dof, value, limit)}. Das ist ` +
        'keine Verformung mehr, sondern eine Bewegung — das Modell ist ' +
        '(nahezu) kinematisch, auch wenn das Gleichungssystem sich loesen ' +
        'liess.',
    );
    this.nodeId = nodeId;
    this.dof = dof;
    this.value = value;
    this.limit = limit;
  }
}

/**
 * Gemeinsame Basis aller Befunde am ERGEBNIS der Rechnung.
 *
 * Die dritte schmale Warnungswurzel neben `ModelValidationWarning` (Modell) und
 * `LoadValidationWarning` (Eingabe), und sie steht aus demselben Grund fuer sich:
 * eine Warnung an der Rechnung betrifft weder das Modell noch die Lasten,
 * sondern das, was aus beiden geworden ist. Sie wird NIE geworfen — sie reist in
 * `SolveResult.warnings` mit dem Ergebnis, zu dem sie gehoert.
 *
 * SCHMAL wie ihre beiden Geschwister: der Knoten ist die Identitaet des Befunds
 * (wie `loadId` bei `LoadValidationWarning`), alles Weitere gehoert der
 * einzelnen Warnung. Was die Verformungspruefung misst, ist keine Eigenschaft
 * von Befunden am Ergebnis ueberhaupt — ein spaeterer Hinweis auf einen
 * Gleichgewichtsrest haette weder `dof` noch `limit`.
 */
export abstract class SolveWarning extends BaustatikError {
  /** Der betroffene Knoten. Am Ergebnis ist er immer exakt bekannt. */
  readonly nodeId: string;

  protected constructor(nodeId: string, message: string) {
    super(`Knoten "${nodeId}": ${message}`);
    this.nodeId = nodeId;
  }
}

/**
 * Das Ergebnis verlaesst den Gueltigkeitsbereich der Theorie I. Ordnung.
 *
 * HINWEIS und kein Fehler: gerechnet wurde richtig, nur gilt die gerechnete
 * Theorie hier nicht mehr. Sie setzt `sin phi ~ phi` und das Gleichgewicht am
 * UNVERFORMTEN System voraus; oberhalb von rund `0.1 rad` beziehungsweise
 * `0.1` Stablaengen ist beides keine Naeherung mehr, sondern eine Behauptung.
 *
 * Die Grenze ist keine Plausibilitaetsschaetzung, sondern die Grenze der
 * Theorie — und einheitenfrei, weil `rad` und `u/L` dimensionslos sind.
 */
export class SmallRotationAssumptionWarning extends SolveWarning {
  /**
   * Welche Groesse die Grenze gerissen hat: `phiY` die Verdrehung in rad,
   * `ux`/`uz` die auf die Stablaenge bezogene Verschiebung.
   */
  readonly dof: DegreeOfFreedom;
  /** rad bei `phiY`, sonst `|u|/L` gegen den angehaengten Stab. */
  readonly value: number;
  /** Die gerissene Grenze aus `AnalysisPolicy.deformationLimits.warn`. */
  readonly limit: number;

  constructor(
    nodeId: string,
    dof: DegreeOfFreedom,
    value: number,
    limit: number,
  ) {
    super(
      nodeId,
      `${describeExcess(dof, value, limit)} — das Ergebnis verlaesst den ` +
        'Gueltigkeitsbereich der Theorie I. Ordnung.',
    );
    this.dof = dof;
    this.value = value;
    this.limit = limit;
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
  /**
   * Das beanstandete Feld, sofern es benennbar ist — als Pfad, wenn es
   * geschachtelt liegt (`deformationLimits.warn.rotation`).
   */
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
