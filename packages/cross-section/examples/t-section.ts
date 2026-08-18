import type { CrossSection } from '@baustatik/cross-section';
import { report } from './report.ts';

/**
 * T-Querschnitt: Gurt oben, Steg darunter, `h` ist die GESAMTHOEHE.
 *
 * Der Name nennt die Form, nicht den Baustoff. Dieselben vier Zahlen heissen im
 * Betonbau Plattenbalken und im Stahlbau T-Profil; getrennt werden die beiden
 * von `idealisation`.
 *
 * Der Plattenbalken unten ist der Fall, der Steiner prueft: `zs = 139,5 mm`
 * liegt IM GURT (`hf = 200 mm`). Der Spannungspunkt „Schwerpunkt" trifft das
 * ohne Sonderfall und traegt dort kompakt `t = bf`; „Mitte Steg" haette ihn an
 * die falsche Stelle gesetzt.
 *
 * 9 Punkte: fuenf im Gurt auf der AUSSENfaser (Spitzen, Stegflanken,
 * Stegachse), einer im STEG unter dem Gurt — dort springt tau um `hf/bw` —,
 * der Schwerpunkt und die beiden Ecken am freien Stegende (ADR 0052).
 */
export function tSectionExample(): void {
  // Stahlbeton-Plattenbalken — kompakt.
  const plattenbalken: CrossSection = {
    kind: 'shape',
    id: 'plattenbalken',
    shape: {
      kind: 't-section',
      bf: 2000, // Gurtbreite [mm]
      hf: 200, // Gurtdicke [mm]
      bw: 250, // Stegbreite [mm]
      h: 500, // Gesamthoehe [mm]
      idealisation: 'solid',
    },
  };

  // Geschweisster Stahl-T — duennwandig. `S` und die Koordinaten laufen um
  // DENSELBEN Schwerpunkt, den der Umrissfigur: Gurt und Steg kacheln die
  // Figur, ihr Schwerpunkt ist `zs` (ADR 0053). Bis dahin lief `S` um den
  // Schwerpunkt des Mittellinienmodells, 0,88 mm daneben.
  const stahlT: CrossSection = {
    kind: 'shape',
    id: 'stahl-t',
    shape: {
      kind: 't-section',
      bf: 200,
      hf: 15,
      bw: 10,
      h: 300,
      idealisation: 'thin-walled',
    },
  };

  report('Plattenbalken 2000/200/250/500 — solid', plattenbalken);
  report('Stahl-T geschweisst 200/15/10/300 — thin-walled', stahlT);
}
