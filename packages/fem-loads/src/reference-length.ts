/**
 * Der Bezugslaengen-FAKTOR: die dimensionslose Zahl, mit der ein eingegebener
 * Streckenlastwert multipliziert wird, damit er sich auf die WAHRE Stablaenge
 * bezieht.
 *
 * WARUM EIGENE DATEI UND WARUM DER FAKTOR: die Rechnung stand frueher privat in
 * `validate.ts` und lieferte eine LAENGE. Sie hat aber zwei Konsumenten, und
 * beide wollen denselben Quotienten:
 *
 *   - `validate.ts` fragt "ist die Bezugslaenge 0?" — das ist `faktor <= tol`,
 *     nicht `laenge <= L * tol`, nur umstaendlicher geschrieben.
 *   - `@baustatik/fem-load-resolve` rechnet `q * faktor`.
 *
 * Der geteilte Begriff ist also der Faktor. Ihn zu teilen statt der Laenge
 * spart auf beiden Seiten die Division.
 *
 * WARUM NICHT IN `@baustatik/fem-geometry`: die Funktion besteht aus zwei
 * Teilen in zwei Fachsprachen. "Wie gross ist die x-Ausdehnung dieser Linie"
 * ist Geometrie — und steht dort bereits (`Vector.fromPoints` liefert
 * `{dx, dz}`, `Math.abs` ist JavaScript). Es gibt nichts Geometrisches zu
 * verschieben. Uebrig bliebe nur die Zuordnung "welche Ausdehnung meint
 * `'horizontalProjection'`", und das ist reines Lastvokabular samt der
 * RFEM-Umkehrfalle (siehe `types.ts`: RFEM benennt nach der BLICKRICHTUNG, wir
 * nach der GEMESSENEN Achse). Die nach `fem-geometry` zu ziehen verlangte dort
 * den Typ `ReferenceLength` aus diesem Package, das seinerseits von
 * `fem-geometry` abhaengt — zirkulaer.
 *
 * Kurz: `referenceFactor` ist eine UEBERSETZUNG zwischen zwei Fachsprachen, und
 * die gehoert auf die Seite mit dem reicheren Begriff.
 */

import { Line, Vector } from '@baustatik/fem-geometry';
import type { ReferenceLength } from './types';

/**
 * Der Faktor `L_proj / L` fuer eine Stablast auf der Achse `axis`.
 *
 * Gilt unabhaengig vom Bezugssystem der Richtung: auch eine Last mit
 * `frame: 'local'` darf sich auf eine Projektion beziehen (Wert je
 * Grundrissflaeche, Wirkung senkrecht zur Stabachse).
 *
 * Der Faktor ist ueber den geraden Stab KONSTANT (`Δx/L` aendert sich entlang
 * einer Geraden nicht), deshalb bleibt eine lineare Last linear und ein
 * Teilabschnitt bekommt denselben Faktor wie der ganze Stab.
 */
export function referenceFactor(
  reference: ReferenceLength,
  axis: Line,
): number {
  // Bewusst die exakte 1 statt `L / L`: der haeufigste Fall soll gar kein
  // Rundungsrauschen erst einschleppen.
  if (reference === 'trueLength') {
    return 1;
  }

  const along = Vector.fromPoints(axis.p1, axis.p2);
  const projected =
    reference === 'horizontalProjection'
      ? Math.abs(along.dx)
      : Math.abs(along.dz);

  return projected / Line.length(axis);
}
