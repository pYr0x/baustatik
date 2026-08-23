import { convert } from '@baustatik/units';

/**
 * Die Umrechnungsfaktoren dieses Packages — gezogen aus `@baustatik/units`, nie
 * als Literal hingeschrieben
 * ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md)).
 *
 * KEINE ZENTIMETER-ZWISCHENWELT, anders als in `@baustatik/cross-section`.
 * Dort gibt es sie, damit man ein Ergebnis gegen die gedruckte Profiltabelle
 * diffen kann. Hier gibt es keine Tabelle: `It` und der Schubmittelpunkt einer
 * gezeichneten Figur stehen in keinem Katalog, und κ ist ohnehin dimensionslos.
 *
 * GERECHNET WIRD IN SI. Der Umriss fuehrt Millimeter, `mesh.ts` rechnet ihn
 * EINMAL nach Meter um, und ab dort sind Netz, Loesung und Satz-Anteil SI.
 *
 * DIE SPANNUNG GEHT IN MPa UND mm HERAUS, weil eine Festigkeit in MPa steht
 * (ADR 0024/0061). Die Rechnung geht in SI glatt auf — `V[N]·τ_feld[1/m²]` ist
 * Pa, `Mt[Nm]/It[m⁴]·[m]` ebenso —, deshalb wird am EINGANG fuer die
 * Schnittgroessen und am AUSGANG fuer drei Spannungen und zwei Koordinaten
 * umgerechnet.
 *
 * WARUM NICHT WIE IN `@baustatik/cross-section-stress` „der Ausgang ist die
 * Identitaet": dort war der Eingang schon mm. Hier hiesse es, ein GELOESTES
 * FELD nachtraeglich umzuskalieren — sieben Skalare und sieben Arrays, jedes
 * eine Gelegenheit, eines zu vergessen. Ein vergessener Faktor am Ausgang ist
 * sichtbar, ein vergessenes `psi1Y` nicht.
 *
 * `toExact` UND NICHT `to`: `to` rundet atomar und machte aus `139,5 mm`
 * `0,14 m`.
 */

/** mm -> m: der Umriss beim Eintritt in die Vernetzung. */
export const MM_TO_M = convert(1).from('mm').toExact('m');
/** m -> mm: die Knotenkoordinaten am Ausgang der Spannungsrueckrechnung. */
export const M_TO_MM = convert(1).from('m').toExact('mm');
/** kN -> N: die Normalkraft und beide Querkraefte. */
export const KN_TO_N = convert(1).from('kN').toExact('N');
/**
 * kNm -> Nm: beide Biegemomente und das Torsionsmoment.
 *
 * ES IST DERSELBE FAKTOR WIE `KN_TO_N` und steht trotzdem unter eigenem Namen:
 * `units` fuehrt kein Moment als Kategorie, und eine Kraft mal einer
 * unveraenderten Laenge ist genau der Kraftfaktor. Der Name sagt an der
 * Aufrufstelle, welche Groesse gemeint ist.
 */
export const KNM_TO_NM = KN_TO_N;
/**
 * Pa -> MPa: σ, τ und σv am Ausgang.
 *
 * ZUSAMMENGESETZT AUS DEN NAMEN, DIE `units` FUEHRT — `Pa` und `MPa` stehen
 * dort nicht als Einheit, `N/m^2` und `N/mm^2` schon, und sie sind dasselbe.
 */
export const PA_TO_MPA = convert(1).from('N/m^2').toExact('N/mm^2');
