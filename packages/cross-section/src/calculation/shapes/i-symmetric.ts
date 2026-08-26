import type { cm } from '@baustatik/units';
import type { Idealisation } from '../../model/idealisation';
import { crossWallInterval, endMoment, partIntervals } from '../shear';
import { allPositive, type ShapeResult } from './kernel';

/**
 * Das doppeltsymmetrische I — GESCHWEISST, also OHNE Ausrundung. Genau das ist
 * der Unterschied zum Walzprofil aus dem Katalog: mit denselben vier
 * Abmessungen kommt hier eine etwas kleinere Flaeche heraus, weil das Material
 * am Steg-Gurt-Uebergang fehlt.
 *
 * Eingabesystem: `y = 0` auf der Symmetrieachse, `z = 0` an der Oberkante.
 * Abmessungen in ZENTIMETERN (siehe `shapeValues`).
 */
export function iSymmetric(
  h: cm,
  b: cm,
  tw: cm,
  tf: cm,
  idealisation: Idealisation,
): ShapeResult | undefined {
  const hw = h - 2 * tf;
  if (!allPositive(h, b, tw, tf, hw, b - tw)) return undefined;

  const A = 2 * b * tf + hw * tw;
  const Iy = (b * h * h * h - (b - tw) * hw * hw * hw) / 12;
  const Iz = (2 * tf * b * b * b + hw * tw * tw * tw) / 12;

  // KOMPAKT GIBT ES KEINEN WEG MEHR (ADR 0062): der solide Vollquerschnitt
  // laeuft als Umriss durch die FE, `pathY`/`pathZ` bleiben dort weg, und κ
  // kommt aus den ν-freien Koeffizienten. Vorher standen hier
  // Flaechenschnitte durch die volle Umrissfigur — Grashof.
  const paths = idealisation === 'solid' ? {} : thinPaths(h, b, tw, tf);

  // Doppeltsymmetrisch: Schubmittelpunkt = Schwerpunkt.
  return {
    A,
    Iy,
    Iz,
    Iyz: 0,
    ys: 0,
    zs: h / 2,
    yM: 0,
    zM: h / 2,
    // Offenes Profil: `⅓ Σ l·t³` ueber die drei Wandmittellinien — zwei Gurte
    // der Laenge `b`, ein Steg von Gurtmitte zu Gurtmitte (`h − tf`, nicht
    // `h − 2tf`). Dieselbe Wandfigur, aus der `thinPaths` sein kappa zieht.
    // KOMPAKT GIBT ES IHN HIER NICHT: `It` des Vollquerschnitts ist ein
    // Randwertproblem und keine Summe — geloest wird es von der FE (ADR 0062).
    It:
      idealisation === 'thin-walled'
        ? (2 * b * tf ** 3 + (h - tf) * tw ** 3) / 3
        : undefined,
    ...paths,
  };
}

/**
 * Duennwandig: der Weg laeuft ueber die MITTELLINIEN, der Steg also von
 * Gurtmitte zu Gurtmitte (Laenge `h - tf`, nicht `h - 2tf`).
 *
 * DIESER WEG DIENT NUR NOCH KAPPA. Die Spannungspunkte haben ihn mit
 * [ADR 0053](../../../../../docs/adr/0053-the-stress-point-walls-tile-the-outline.md)
 * verlassen und kacheln die Umrissfigur; hier bleibt er, weil kappa ein
 * ENERGIEintegral ueber die ganze Wand ist und die `Az` des Profilkatalogs auf
 * der Mittellinienabwicklung definiert sind. Gekachelt laege `Az` ueber alle 42
 * IPE- und HEA-Profile UEBER der Tabelle (+1,0 bis +7,0 %) — ein geschweisstes
 * I kann aber keine groessere Schubflaeche haben als das gewalzte mit denselben
 * Aussenmassen. Mit der Mittellinie sind es −6,2 bis −3,5 %, immer zu klein,
 * genau wie es die fehlende Ausrundung verlangt.
 *
 * Die aeltere Begruendung — „diese Idealisierung reproduziert `Sy,max` des
 * Katalogs, 11,60 gegen 11,61" — ist ZURUECKGEZOGEN: der Katalogwert gehoert
 * zum gewalzten Profil, seine Ausrundungen tragen 0,361 cm3, die doppelt
 * gezaehlte Gurthaelfte 0,357. Zwei verschiedene Dinge, fast dieselbe Zahl.
 */
function thinPaths(h: number, b: number, tw: number, tf: number) {
  const zf = (h - tf) / 2;

  // Vier Gurthaelften, alle mit demselben |S|-Verlauf: vom freien Ende zur
  // Stegachse waechst S linear auf zf*tf*b/2.
  const flangeHalf = crossWallInterval(-zf, tf, b / 2);
  const web = partIntervals(
    -zf,
    [{ extent: 2 * zf, width: tw }],
    2 * endMoment(flangeHalf),
  ).intervals[0];

  return {
    // Der Steg erbt beide oberen Gurthaelften; die beiden unteren tragen
    // dieselbe Groesse spiegelbildlich zurueck auf null.
    pathZ: [flangeHalf, flangeHalf, web, flangeHalf, flangeHalf],
    // Fuer Vy traegt der Steg NICHTS: sein abgeschnittener Teil ist um y = 0
    // symmetrisch, sein erstes Flaechenmoment um z also null. Die Querkraft in
    // y laeuft vollstaendig ueber die Gurte.
    pathY: [
      partIntervals(-b / 2, [{ extent: b, width: tf }]).intervals[0],
      partIntervals(-b / 2, [{ extent: b, width: tf }]).intervals[0],
    ],
  };
}
