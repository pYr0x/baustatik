import { convert } from '@baustatik/units';

/**
 * Die Umrechnungsfaktoren dieses Packages — gezogen aus `@baustatik/units`,
 * nicht als Literal hingeschrieben.
 *
 * WARUM `toExact` UND NICHT `to`: `convert(...).to(...)` rundet ATOMAR, also
 * auf ganze Millimeter bzw. mm²/mm³/mm⁴. Für einen Bericht ist das richtig,
 * für einen Rechenkern zerstört es genau die Zahlen, um die es hier geht — aus
 * `139,5 mm` würde `0,14 m`, aus dem Spannungspunkt bei `6,9 mm` würde
 * `0,007 m` ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md)).
 *
 * WARUM MODULKONSTANTEN: der Faktor ist eine Zahl, keine Umrechnung. Ihn
 * einmal beim Laden zu ziehen spart bei jedem Spannungspunkt einen Regex und
 * lässt die Herkunft trotzdem im Code stehen — `1e-8` allein sagt nicht, ob es
 * cm⁴ oder cm³ war.
 */

/** cm² -> m². */
export const CM2_TO_M2 = convert(1).from('cm^2').toExact('m^2');
/** cm⁴ -> m⁴. */
export const CM4_TO_M4 = convert(1).from('cm^4').toExact('m^4');
/** cm -> m. */
export const CM_TO_M = convert(1).from('cm').toExact('m');
/** mm -> cm: die Eingabe der parametrischen Formen in die Rechnung. */
export const MM_TO_CM = convert(1).from('mm').toExact('cm');
/** mm³ -> cm³: das statische Moment eines Spannungspunkts in die Druckform. */
export const MM3_TO_CM3 = convert(1).from('mm^3').toExact('cm^3');
