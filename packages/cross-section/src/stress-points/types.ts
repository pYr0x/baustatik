/**
 * Ein Spannungspunkt: die Stelle, an der ein Nachweis spaeter `sigma` und `tau`
 * bildet.
 *
 * DIESES PACKAGE RECHNET DIE SPANNUNGEN NICHT. Es liefert den NENNER — `t` und
 * `S` — und die Koordinaten; `sigma = N/A + My*z/Iy` und `tau = V*S/(I*t)`
 * brauchen eine SCHNITTGROESSE und gehoeren damit ins Bemessungspaket.
 */
export type StressPoint = {
  /** Ordnungsnummer im Bericht, 1-basiert. */
  readonly nr: number;
  /** Ort, RELATIV ZUM SCHWERPUNKT [m]. */
  readonly y: number;
  readonly z: number;
  /** Die massgebende Breite an dieser Stelle [m] — der Nenner in tau. */
  readonly t: number;
  /** Statisches Moment des abgeschnittenen Teils [m^3]. */
  readonly Sy: number;
  readonly Sz: number;
};
