import { convert } from '@baustatik/units';

/**
 * Die Umrechnungsfaktoren dieses Packages — gezogen aus `@baustatik/units`,
 * nicht als Literal hingeschrieben
 * ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md)).
 *
 * INTERN WIRD IN mm UND N GERECHNET, und der AUSGANG IST DIE IDENTITAET:
 * `N[N]/A[mm²]` **ist** MPa, `q[N/mm]/t[mm]` **ist** MPa. Es gibt hier keine
 * Ausgangsumrechnung, in der sich ein Faktor verstecken könnte — und genau
 * dort bliebe ein Zehnerpotenzfehler unsichtbar, weil `S`[cm³]·`V`[kN]/`Iy`[m⁴]
 * eine vollkommen plausibel aussehende Zahl ergibt. Es deckt sich ausserdem mit
 * der internen mm-Rechnung von `@baustatik/cross-section`.
 *
 * WARUM `toExact` UND NICHT `to`: `convert(...).to(...)` rundet ATOMAR. Für
 * einen Bericht ist das richtig, für einen Rechenkern zerstört es die Zahlen,
 * um die es geht — aus dem Spannungspunkt bei `6,9 mm` würde `0,007 m`.
 *
 * WARUM MODULKONSTANTEN: der Faktor ist eine Zahl, keine Umrechnung. Ihn einmal
 * beim Laden zu ziehen spart bei jedem Spannungspunkt einen Regex und lässt die
 * Herkunft trotzdem im Code stehen.
 */

/** kN -> N: die Normalkraft und beide Querkräfte. */
export const KN_TO_N = convert(1).from('kN').toExact('N');
/** m -> mm. */
export const M_TO_MM = convert(1).from('m').toExact('mm');
/**
 * kNm -> Nmm: beide Biegemomente.
 *
 * ZUSAMMENGESETZT, WEIL `units` KEIN `kNm` FUEHRT — ein Moment ist dort keine
 * Kategorie. Aus den beiden Faktoren, die es führt, ist es trotzdem exakt: das
 * Produkt zweier Zehnerpotenzen ist in `double` exakt.
 */
export const KNM_TO_NMM = KN_TO_N * M_TO_MM;
/** m² -> mm²: die Querschnittsfläche aus `SectionProperties`. */
export const M2_TO_MM2 = convert(1).from('m^2').toExact('mm^2');
/** m⁴ -> mm⁴: die Trägheits- und das Deviationsmoment. */
export const M4_TO_MM4 = convert(1).from('m^4').toExact('mm^4');
/** cm³ -> mm³: das statische Moment eines Spannungspunkts. */
export const CM3_TO_MM3 = convert(1).from('cm^3').toExact('mm^3');
