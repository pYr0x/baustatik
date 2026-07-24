/**
 * Die benannten Fehler der Lastvalidierung.
 *
 * Alle erben von `LoadValidationError` und damit von `BaustatikError` (Policy
 * `error-hierarchy-policy.md`): ein Aufrufer unterscheidet per `instanceof`,
 * WAS schiefging, statt Meldungstexte zu parsen. `LoadValidationError` selbst
 * ist die Gruppenklammer — damit kann `fem-load-resolve` oder der Viewer
 * "irgendein Lastfehler" fangen, ohne alle acht Faelle aufzuzaehlen.
 *
 * BESONDERHEIT gegenueber `fem-element/src/errors.ts`: diese Fehler werden
 * nicht nur geworfen, sondern von `validateLoads` auch ZURUECKGEGEBEN. Eine
 * Lasteingabe kommt aus einem Dialog; der muss alle Beanstandungen auf einmal
 * zeigen koennen und darf am ersten nicht abbrechen. Deshalb tragen die Klassen
 * ihre Daten (`loadId`, betroffenes Ziel, Feldname) als Felder und nicht nur im
 * Text — die Oberflaeche kann daran das falsche Eingabefeld markieren.
 */

import { BaustatikError } from '@baustatik/errors';

/** Zielart einer Last. Entspricht der Diskriminante `target` in `types.ts`. */
export type LoadTargetKind = 'node' | 'beam';

const TARGET_LABEL: Record<LoadTargetKind, string> = {
  node: 'Knoten',
  beam: 'Stab',
};

/**
 * Gemeinsame Basis aller Beanstandungen. Abstrakt, damit jede Regelverletzung
 * einen eigenen Namen bekommt und niemand einen generischen Fehler wirft.
 */
export abstract class LoadValidationError extends BaustatikError {
  /** Die beanstandete Last (`FEMLoad.id`). */
  readonly loadId: string;

  protected constructor(loadId: string, message: string) {
    super(`Last "${loadId}": ${message}`);
    this.loadId = loadId;
  }
}

/** `nodeIds` bzw. `beamIds` ist leer — eine Last ohne Ziel wirkt nirgends. */
export class EmptyLoadTargetError extends LoadValidationError {
  readonly targetKind: LoadTargetKind;

  constructor(loadId: string, targetKind: LoadTargetKind) {
    super(
      loadId,
      `die Ziel-Liste (${targetKind === 'node' ? 'nodeIds' : 'beamIds'}) ist leer.`,
    );
    this.targetKind = targetKind;
  }
}

/**
 * Eine Last verweist auf einen Knoten oder Stab, den es im Modell nicht gibt.
 * Bewusst ein Fehler und keine stille Auslassung — dieselbe Begruendung wie bei
 * `UnknownNodeReferenceError` im `fem-viewer`: eine still uebersprungene Last
 * verschwindet spurlos aus Zeichnung und Rechnung.
 */
export class UnknownLoadTargetError extends LoadValidationError {
  readonly targetKind: LoadTargetKind;
  readonly targetId: string;

  constructor(loadId: string, targetKind: LoadTargetKind, targetId: string) {
    super(
      loadId,
      `verweist auf unbekannten ${TARGET_LABEL[targetKind]} "${targetId}".`,
    );
    this.targetKind = targetKind;
    this.targetId = targetId;
  }
}

/**
 * Der belastete Stab hat die Laenge 0 (beide Knoten an derselben Stelle).
 * Damit ist jede Lagepruefung sinnlos und `resolve` haette ein `L = 0` im
 * Nenner. Der Modellfehler wird hier gemeldet, weil er hier auffaellt.
 */
export class DegenerateBeamError extends LoadValidationError {
  readonly beamId: string;

  constructor(loadId: string, beamId: string) {
    super(loadId, `liegt auf dem entarteten Stab "${beamId}" (Laenge 0).`);
    this.beamId = beamId;
  }
}

/** Eine Knotenlast, deren Komponenten alle fehlen oder 0 sind. */
export class ZeroNodeLoadError extends LoadValidationError {
  constructor(loadId: string) {
    super(
      loadId,
      'keine Komponente ungleich 0 — mindestens eines von fx, fz, my muss wirken.',
    );
  }
}

/**
 * Ein Lastwert oder Abstand ist `NaN` oder unendlich. Ungeprueft landete das
 * still in der globalen Steifigkeitsmatrix, weit weg von der Ursache.
 */
export class NonFiniteLoadValueError extends LoadValidationError {
  readonly field: string;
  readonly value: number;

  constructor(loadId: string, field: string, value: number) {
    super(loadId, `"${field}" ist nicht endlich (war: ${value}).`);
    this.field = field;
    this.value = value;
  }
}

/**
 * Ein Abstand ist negativ. Eigene Klasse und nicht `DistanceOutOfRangeError`
 * mit Grenze 0, weil die untere Grenze ohne jede Geometrie feststeht: sie gilt
 * fuer relative wie absolute Abstaende und fuer jeden Stab gleich.
 */
export class NegativeDistanceError extends LoadValidationError {
  readonly field: string;
  readonly value: number;

  constructor(loadId: string, field: string, value: number) {
    super(loadId, `"${field}" darf nicht negativ sein (war: ${value}).`);
    this.field = field;
    this.value = value;
  }
}

/**
 * Ein Abstand ueberschreitet die Obergrenze: die Stablaenge, bei
 * `relativeDistances` die 100 %. Bei absoluten Abstaenden haengt die Grenze am
 * Stab, deshalb steht dann auch `beamId` drin — dieselbe Last kann auf einem
 * langen Stab passen und auf einem kurzen nicht.
 */
export class DistanceOutOfRangeError extends LoadValidationError {
  readonly field: string;
  readonly value: number;
  readonly limit: number;
  readonly beamId: string | undefined;

  constructor(
    loadId: string,
    field: string,
    value: number,
    limit: number,
    beamId?: string,
  ) {
    super(
      loadId,
      `"${field}" ueberschreitet ${limit}${
        beamId === undefined ? '' : ` (Laenge von Stab "${beamId}")`
      } (war: ${value}).`,
    );
    this.field = field;
    this.value = value;
    this.limit = limit;
    this.beamId = beamId;
  }
}

/** Der Lastabschnitt laeuft rueckwaerts (`from > to`). */
export class BackwardsLoadExtentError extends LoadValidationError {
  readonly from: number;
  readonly to: number;

  constructor(loadId: string, from: number, to: number) {
    super(loadId, `Lastabschnitt laeuft rueckwaerts: from=${from} > to=${to}.`);
    this.from = from;
    this.to = to;
  }
}

/**
 * Die Bezugslaenge misst am belasteten Stab 0: `'verticalProjection'` am
 * waagrechten Stab, `'horizontalProjection'` am senkrechten. Die Last waere
 * dann in Summe 0 — der Anwender hat sich in der Bezugslaenge vertan (die
 * RFEM-Option heisst nach der BLICKRICHTUNG, nicht nach der gemessenen Achse,
 * siehe `types.ts`).
 */
export class ZeroProjectedLengthError extends LoadValidationError {
  readonly beamId: string;
  readonly referenceLength: string;

  constructor(loadId: string, beamId: string, referenceLength: string) {
    super(
      loadId,
      `Bezugslaenge "${referenceLength}" misst am Stab "${beamId}" 0.`,
    );
    this.beamId = beamId;
    this.referenceLength = referenceLength;
  }
}
