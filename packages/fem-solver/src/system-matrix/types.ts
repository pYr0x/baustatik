/**
 * Die Steifigkeitsmatrix als FÄHIGKEIT statt als Datenstruktur.
 *
 * WOZU: `solve.ts` hat mit `K` genau vier Dinge vor — eintragen, die Diagonale
 * eines freien Freiheitsgrads lesen, eine volle Zeile mit `d` multiplizieren
 * und das reduzierte System lösen lassen. Keines davon braucht ein
 * Matrixformat. Steht das Format trotzdem in `solve.ts`, gibt es die
 * Rechenkette zweimal, einmal je Format — und die beiden laufen auseinander.
 *
 * DIE MATRIX BESITZT IHREN PORT. Nicht `solve.ts` ruft den Löser und die
 * Matrix liefert ihm Zahlen, sondern die Matrix löst sich selbst. Andersherum
 * müsste `solve.ts` wissen, in welcher Form es die Zahlen herausreicht, und
 * genau das ist das Format (ADR 0043).
 *
 * PACKAGE-INTERN. Nach außen gibt es die beiden Ports und die Policy; welche
 * Fassung daraus wird, ist Verdrahtung.
 */

import type { LinearSolveOutcome } from '../config';

export interface SystemMatrix {
  /**
   * Einen Beitrag der Assemblierung auftragen — SUMMIEREND, nicht setzend: an
   * derselben Stelle trägt jeder angrenzende Stab ein.
   */
  add(row: number, col: number, value: number): void;

  /**
   * Netz 1: die leere Diagonale eines freien Freiheitsgrads.
   *
   * Ein exakter Vergleich gegen 0 genügt beim Aufrufer, weil ein
   * Diagonalwert entweder aus einem Element stammt (dann ist er positiv) oder
   * gar nicht erst gesetzt wurde.
   */
  diagonal(index: number): number;

  /**
   * Auflagerkräfte: die VOLLE Zeile mal `d`.
   *
   * Volle Zeile heißt volle Zeile — auch die Spalten der gesperrten
   * Freiheitsgrade. `r = K d - F` an den gesperrten Zeilen ist gerade das,
   * was das reduzierte System weggelassen hat.
   */
  rowDot(row: number, d: Float64Array): number;

  /**
   * Das reduzierte System mit `rhsColumns` rechten Seiten.
   *
   * `free` sind die globalen Zeilen in aufsteigender Nummer; `F` ist BEREITS
   * reduziert und liegt spaltenweise flach als `free.length x rhsColumns` vor.
   * Zurück kommt `d` in derselben Form — die Umnummerierung ins globale
   * System macht der Aufrufer, der die Knoten kennt.
   */
  solve(
    free: readonly number[],
    F: Float64Array,
    rhsColumns: number,
  ): Promise<LinearSolveOutcome>;
}
