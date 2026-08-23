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
 * `t` und `S` GIBT ES NUR IM SCHNITTMODELL, also am dünnwandigen Querschnitt
 * und am gewalzten Profil. Der Vollquerschnitt trägt deshalb gar keine
 * Spannungspunkte: `stressPoints` antwortet dort `undefined`, und seine
 * Spannungen fallen aus der FE
 * ([ADR 0057](../../../../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)).
 *
 * EIN PUNKT LIEGT AUF EINEM WANDELEMENT, nicht auf einem Querschnitt
 * ([ADR 0059](../../../../docs/adr/0059-the-branch-node-carries-two-stress-points.md)).
 * Am Verzweigungsknoten stehen deshalb ZWEI Punkte mit derselben Koordinate und
 * verschiedener Wand — jeder mit genau EINEM Wert je Groesse. Bis dahin trug
 * ein einzelner Punkt dort ein Flag `branched` und einen von zwei moeglichen
 * Werten.
 *
 * EINHEITEN WIE DER GEDRUCKTE AUSDRUCK: Koordinaten und Dicken in mm,
 * statische Momente in cm³. Das ist die Form der
 * Referenz-Fixture, und es ist die Form, in der die Abmessungen ohnehin
 * hereinkommen — der Vergleich mit der Quelle braucht damit keinen
 * Umrechnungsfaktor mehr, in dem sich ein Fehler verstecken koennte
 * ([ADR 0024](../../../../docs/adr/0024-units-at-the-package-boundary.md)).
 */
export type StressPoint = {
  /**
   * Fortlaufende Nummer, EINDEUTIG innerhalb einer Punktliste. Sie faellt aus
   * der Laufreihenfolge und ist die Identitaet des Punktes — fuer die
   * Symbol-Id des Viewers, fuer eine Berichtszeile, fuer `data-nr` im Demo.
   *
   * SIE IST KEIN VERTRAG MEHR GEGENUEBER DEM GEDRUCKTEN KATALOGBLATT. Seit der
   * Verzweigungsknoten zwei Punkte traegt, hat das I fuenfzehn und der T zehn;
   * die Zuordnung zu den dreizehn gedruckten Nummern steht als Tabelle im Test
   * (ADR 0059).
   */
  readonly nr: number;
  /**
   * Das WANDELEMENT, auf dem der Punkt liegt.
   *
   * Zwei Punkte am selben Ort unterscheiden sich genau hierin — das ist der
   * Verzweigungsknoten, an dem zwei Gurtelemente aufeinandertreffen. Die Ids
   * gehoeren der Form (`flange-top-left`, `web`, `corner-top-right`, …) und
   * stehen in den Stellenlisten.
   */
  readonly wall: string;
  /** Ort, RELATIV ZUM SCHWERPUNKT [mm]. */
  readonly y: mm;
  readonly z: mm;
  /** Die massgebende Breite an dieser Stelle [mm] — der Nenner in tau. */
  readonly t: mm;
  /**
   * Statisches Moment des abgeschnittenen Teils [cm³] — des Teils, der auf dem
   * ELEMENT in `+s` BEREITS DURCHLAUFEN ist. Das Vorzeichen fällt daraus, es
   * wird nicht gesetzt.
   */
  readonly Sy: cm3;
  readonly Sz: cm3;
  /**
   * Die EINHEITSTANGENTE des Elements an dieser Stelle, in der (y, z)-Ebene —
   * die Richtung `+s`, auf die sich die Vorzeichen von `Sy` und `Sz` beziehen.
   *
   * OHNE SIE LIESSEN SICH ZWEI QUERKRAEFTE NICHT ADDIEREN. Der Schubfluss
   * `q = tau*t` laeuft LAENGS der Wand; die Anteile aus `Vz` (ueber `Sy`) und
   * aus `Vy` (ueber `Sz`) zeigen deshalb in DIESELBE Richtung und addieren
   * sich vorzeichenrichtig als Skalare:
   *
   *     q = -(Vz*Sy/Iy + Vy*Sz/Iz),   tau = q/t,   Richtung = (ty, tz)
   *
   * Weder `sqrt(tau_Vz² + tau_Vy²)` noch `|tau_Vz| + |tau_Vy|` ist die
   * richtige Antwort: das erste behandelt zwei Komponenten DERSELBEN Richtung
   * als orthogonal, das zweite ist eine Schranke statt einer Spannung.
   *
   * SIE WIRD ERST RECHT GEBRAUCHT, wenn `Mt` dazukommt. Bredt liefert einen
   * UMLAUFENDEN Fluss `q_T = Mt/(2*Am)`; ob er sich auf einer Wand zum
   * Querkraftanteil addiert oder ihn aufhebt, steckt ausschliesslich im
   * relativen Vorzeichen (ADR 0058).
   *
   * ZWEI PUNKTE AM SELBEN ORT tragen entgegengesetzte Tangenten. Das ist keine
   * Unentschiedenheit, sondern die Aussage: es sind zwei Elemente, und jedes
   * hat seine eigene Richtung (ADR 0059).
   */
  readonly ty: number;
  readonly tz: number;
};

/**
 * Die Wandrichtung eines Spannungspunktes — was `stressPoint` ausser den
 * Zahlen noch braucht.
 *
 * Sie steht in den STELLENLISTEN (`open-stations.ts`, `hollow-stations.ts`)
 * und nicht in den Vorlagen: eine Laufrichtung ist eine Aussage ueber die
 * Reihenfolge der Stellen, nicht ueber die Formel, die an einer Stelle
 * ausgewertet wird.
 */
export type WallDirection = {
  readonly ty: number;
  readonly tz: number;
};

/** Element, dessen Laufkoordinate global in `+y` zeigt. */
export const ALONG_Y: WallDirection = { ty: 1, tz: 0 };

/** Dasselbe Element gespiegelt: `+s` laeuft gegen die globale `y`-Achse. */
export const AGAINST_Y: WallDirection = { ty: -1, tz: 0 };

/** Element, dessen Laufkoordinate global in `+z` zeigt — der Steg. */
export const ALONG_Z: WallDirection = { ty: 0, tz: 1 };

/** Dasselbe gespiegelt; im Kasten laeuft der linke Steg so herum. */
export const AGAINST_Z: WallDirection = { ty: 0, tz: -1 };

/**
 * Eine Tangente aus zwei Vorzeichen, auf Laenge eins gebracht — die
 * Winkelhalbierende an der Aussenecke des Kastens, wo der Umlauf von einer
 * Wand in die andere laeuft.
 */
export function bisector(ty: number, tz: number): WallDirection {
  return { ty: ty * Math.SQRT1_2, tz: tz * Math.SQRT1_2 };
}

/**
 * Die EINE Stelle, an der ein Spannungspunkt entsteht — und damit die einzige,
 * an der `S` von mm³ nach cm³ wechselt.
 *
 * Beide Vorlagen (`thin.ts` und `rolled-i.ts`) rechnen in mm, weil die
 * Abmessungen so hereinkommen. Der Faktor tausend an zwei Stellen zu verteilen
 * waeren zwei Gelegenheiten, ihn einmal zu vergessen — und ein um Faktor 1000
 * falsches `S` sieht in einer Ergebnisliste vollkommen plausibel aus.
 */
export function stressPoint(
  nr: number,
  /** Die Id des Wandelements, auf dem der Punkt liegt (ADR 0059). */
  wall: string,
  y: mm,
  z: mm,
  t: mm,
  /** Statisches Moment in mm³ — so, wie die Vorlagen es rechnen. */
  SyInMm3: number,
  SzInMm3: number,
  direction: WallDirection,
): StressPoint {
  return {
    nr,
    wall,
    y,
    z,
    t,
    // `+ 0` macht aus `-0` eine Null. Seit die Vorzeichen gerechnet werden,
    // faellt an den Nullstellen `-0` an (`ty * 0`, `Math.sign(0) * x`) — eine
    // Zahl, die sich wie null verhaelt, sich aber „-0" druckt und an
    // `Object.is` scheitert.
    Sy: SyInMm3 * MM3_TO_CM3 + 0,
    Sz: SzInMm3 * MM3_TO_CM3 + 0,
    ty: direction.ty,
    tz: direction.tz,
  };
}
