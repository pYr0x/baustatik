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
 * Ein freigesetzter Freiheitsgrad trifft bei der Kondensation ein Pivot, das
 * gegenueber seinem unkondensierten Wert zusammengebrochen ist: das Element hat
 * eine Starrkoerperbewegung IN SICH.
 *
 * Beispiele: `u` an beiden Enden (der Stab gleitet laengs), `w` an beiden Enden
 * (er gleitet quer), oder drei Freisetzungen aus `w`/`theta` — der Biegeblock
 * hat Rang 2 und traegt nur zwei. NICHT betroffen ist `theta` an beiden Enden,
 * der Pendelstab: dort steht nach dem ersten Schritt `K[theta2][theta2] =
 * 3EI/L != 0`, und der Stab uebertraegt weiter die Normalkraft. (Querkraft
 * traegt er ohne Stablast nicht mehr — mit Momentengelenken an beiden Enden
 * verlangt das Momentengleichgewicht dann `V = 0`. Das ist die Sache selbst
 * und kein Mechanismus.)
 *
 * DAS ZWEITE TOR. `@baustatik/fem` beanstandet denselben Befund als
 * `UnrestrainedBeamError` schon am Modell, aus der blossen
 * Freisetzungskombination — statisch entscheidbar, weil sich `EA`, `EI`, `L`
 * und `phi` in der Bedingung herauskuerzen. Dieses Package ist oeffentlich und
 * darf sich darauf nicht verlassen; es MISST das Pivot.
 */
export class UnrestrainedElementError extends BaustatikError {
  /** Der Freiheitsgrad in der Schreibweise von `ElementReleases`. */
  readonly dof: string;
  readonly pivot: number;
  readonly originalPivot: number;

  constructor(dof: string, pivot: number, originalPivot: number) {
    super(
      `Freisetzung "${dof}": das Pivot ist bei der Kondensation von ` +
        `${originalPivot} auf ${pivot} zusammengebrochen — das Element hat ` +
        'eine Starrkoerperbewegung in sich und traegt in dieser Richtung ' +
        'nichts mehr. Ein Momentengelenk an beiden Enden (der Pendelstab) ' +
        'ist davon nicht betroffen.',
    );
    this.dof = dof;
    this.pivot = pivot;
    this.originalPivot = originalPivot;
  }
}

/** Die Abfragestelle `x` liegt nicht auf dem Stab. */
export class StationOutsideElementError extends BaustatikError {
  readonly x: number;
  readonly L: number;

  constructor(x: number, L: number) {
    super(`Auswertungsstelle liegt nicht in [0, ${L}] (war: ${x}).`);
    this.x = x;
    this.L = L;
  }
}
