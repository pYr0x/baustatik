import { convert } from '@baustatik/units';

/**
 * Der eine Umrechnungsfaktor dieses Packages — gezogen aus `@baustatik/units`,
 * nicht als Literal hingeschrieben.
 *
 * KEINE ZENTIMETER-ZWISCHENWELT, anders als in `@baustatik/cross-section`.
 * Dort gibt es sie, damit man ein Ergebnis gegen die gedruckte Profiltabelle
 * diffen kann ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md)).
 * Hier gibt es keine Tabelle: `It` und der Schubmittelpunkt einer gezeichneten
 * Figur stehen in keinem Katalog, und κ ist ohnehin dimensionslos. Es wird
 * deshalb in SI gerechnet und in SI geliefert — eine Umrechnung, an einer
 * Stelle.
 *
 * `toExact` UND NICHT `to`: `to` rundet atomar und machte aus `139,5 mm`
 * `0,14 m`.
 */
export const MM_TO_M = convert(1).from('mm').toExact('m');
