/**
 * Die Ausgabe der Lastaufloesung.
 *
 * ACHTUNG, zwei Pipeline-Stufen in einem Objekt: `beams` ist LOKAL und braucht
 * noch die Elementformulierung und die Transformation, bevor es im globalen
 * Lastvektor landet; `nodes` ist bereits GLOBAL und geht direkt hinein. Das ist
 * bewusst so gebuendelt, damit der Aufrufer die Union `FEMLoad` nie selbst nach
 * `target` aufteilen muss — wer das taete, traefe Lastentscheidungen ausserhalb
 * der Lastdomaene. Die Typnamen halten den Unterschied sichtbar.
 */

import type { LocalElementLoad } from '@baustatik/fem-element';

/**
 * Alle Knotenlasten EINES Knotens, aufsummiert, im GLOBALEN System.
 *
 * `my` traegt den Drehsinn der Eingabe unveraendert weiter (positiv im Bild
 * gegen den Uhrzeigersinn, siehe `fem-loads/src/types.ts`): eine Knotenlast
 * laeuft nie durch ein Element und braucht deshalb den Vorzeichenwechsel nach
 * `theta` NICHT, den eine Stab-Momentlast braucht.
 *
 * Fehlende Komponenten sind hier 0, nicht `undefined` — summiert wird ohnehin.
 */
export type GlobalNodeLoad = {
  /** kN, global */
  fx: number;
  /** kN, global, positiv nach unten */
  fz: number;
  /** kNm, global, positiv gegen den Uhrzeigersinn */
  my: number;
};

/**
 * Nur Staebe und Knoten mit tatsaechlichen Lasten tauchen auf. Ein fehlender
 * Eintrag heisst "lastfrei"; der Solver braucht dafuer keine Sonderbehandlung,
 * er behandelt `undefined` wie ein leeres `LocalElementLoad`.
 */
export type ResolvedLoads = {
  /** je `beamId`, in LOKALEN Stabkoordinaten. */
  beams: Map<string, LocalElementLoad>;
  /** je `nodeId`, im GLOBALEN System. */
  nodes: Map<string, GlobalNodeLoad>;
};
