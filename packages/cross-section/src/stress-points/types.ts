import type { cm3, mm } from '@baustatik/units';
import { MM3_TO_CM3 } from '../calculation/units';

/**
 * Ein Spannungspunkt: die Stelle, an der ein Nachweis spaeter `sigma` und `tau`
 * bildet.
 *
 * DIESES PACKAGE RECHNET DIE SPANNUNGEN NICHT. Es liefert den NENNER — `t` und
 * `S` — und die Koordinaten; `sigma = N/A + My*z/Iy` und `tau = V*S/(I*t)`
 * brauchen eine SCHNITTGROESSE und gehoeren damit ins Bemessungspaket.
 *
 * EINHEITEN WIE DER GEDRUCKTE AUSDRUCK: Koordinaten und Dicken in mm,
 * statische Momente in cm³. Das ist die Form der
 * Referenz-Fixture, und es ist die Form, in der die Abmessungen ohnehin
 * hereinkommen — der Vergleich mit der Quelle braucht damit keinen
 * Umrechnungsfaktor mehr, in dem sich ein Fehler verstecken koennte
 * ([ADR 0024](../../../../docs/adr/0024-units-at-the-package-boundary.md)).
 */
export type StressPoint = {
  /** Ordnungsnummer im Bericht, 1-basiert. */
  readonly nr: number;
  /** Ort, RELATIV ZUM SCHWERPUNKT [mm]. */
  readonly y: mm;
  readonly z: mm;
  /** Die massgebende Breite an dieser Stelle [mm] — der Nenner in tau. */
  readonly t: mm;
  /** Statisches Moment des abgeschnittenen Teils [cm³]. */
  readonly Sy: cm3;
  readonly Sz: cm3;
};

/**
 * Die EINE Stelle, an der ein Spannungspunkt entsteht — und damit die einzige,
 * an der `S` von mm³ nach cm³ wechselt.
 *
 * Beide Vorlagen (`compact.ts` und `rolled-i.ts`) rechnen in mm, weil die
 * Abmessungen so hereinkommen. Der Faktor tausend an zwei Stellen zu verteilen
 * waeren zwei Gelegenheiten, ihn einmal zu vergessen — und ein um Faktor 1000
 * falsches `S` sieht in einer Ergebnisliste vollkommen plausibel aus.
 */
export function stressPoint(
  nr: number,
  y: mm,
  z: mm,
  t: mm,
  /** Statisches Moment in mm³ — so, wie die Vorlagen es rechnen. */
  SyInMm3: number,
  SzInMm3: number,
): StressPoint {
  return {
    nr,
    y,
    z,
    t,
    Sy: SyInMm3 * MM3_TO_CM3,
    Sz: SzInMm3 * MM3_TO_CM3,
  };
}
