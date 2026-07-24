/**
 * Die benannten Fehler des Packages.
 *
 * Alle erben von `BaustatikError` (Policy `error-hierarchy-policy.md`), damit
 * ein Aufrufer per `instanceof` unterscheiden kann, WAS schiefging, statt
 * Meldungstexte zu parsen. Sie markieren durchweg verletzte Preconditions am
 * Eingangstor `prepare()` bzw. an `consistentLoad()`: das Package rechnet
 * lieber gar nicht, als still `NaN` in die globale Steifigkeitsmatrix zu
 * schreiben, wo die Ursache nicht mehr auffindbar waere.
 */

import { BaustatikError } from '@baustatik/errors';

/** `L`, `EA` oder `EI` ist nicht endlich oder nicht groesser 0. */
export class InvalidElementInputError extends BaustatikError {
  constructor(name: string, value: number) {
    super(`${name} muss endlich und groesser 0 sein (war: ${value}).`);
  }
}

/**
 * Die Schubsteifigkeit laesst sich nicht auf ein brauchbares `phi` abbilden:
 * entweder ist `GAs` selbst unzulaessig, oder das daraus berechnete
 * `phi = 12*EI/(GAs*L^2)` laeuft ueber.
 */
export class InvalidShearStiffnessError extends BaustatikError {
  constructor(reason: string) {
    super(`GAs ungueltig: ${reason}`);
  }
}

/** Ein Lastabschnitt-Ende oder eine Einzellast liegt nicht auf dem Stab. */
export class LoadOutsideElementError extends BaustatikError {
  constructor(what: string, value: number, L: number) {
    super(`${what} liegt nicht in [0, ${L}] (war: ${value}).`);
  }
}

/** Ein Lastabschnitt laeuft rueckwaerts (`from > to`). */
export class BackwardsLoadSegmentError extends BaustatikError {
  constructor(from: number, to: number) {
    super(`Lastabschnitt laeuft rueckwaerts: from=${from} > to=${to}.`);
  }
}

/**
 * `internalForces` ist ein bewusster Stub. Kein Teilausbau mit
 * Endkraft-Semantik: der waere an `x=0`/`x=L` richtig und dazwischen still
 * falsch.
 */
export class InternalForcesNotImplementedError extends BaustatikError {
  constructor() {
    super(
      'internalForces: spaeteres Inkrement. Der Schnittgroessenverlauf ' +
        'zwischen den Knoten braucht zusaetzlich die Partikulaerloesung ' +
        'der Stablast; der Ersatzknotenvektor allein rekonstruiert ihn nicht.',
    );
  }
}
