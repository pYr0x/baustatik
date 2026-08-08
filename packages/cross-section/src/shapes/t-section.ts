import type { cm } from '@baustatik/units';
import type { Idealisation } from '../section';
import { crossWallInterval, endMoment, partIntervals } from '../shear';
import { allPositive, type ShapeResult } from './kernel';

/**
 * Der Schwerpunktabstand von der GURTOBERKANTE, oder `undefined` bei
 * unsinnigen Abmessungen.
 *
 * Eigene Funktion, weil die Spannungspunkt-Vorlage denselben Wert braucht. Zwei
 * Rechnungen fuer eine Zahl waeren zwei Gelegenheiten, sie verschieden zu
 * bekommen — und die Spannungspunkte liegen SCHWERPUNKTSBEZOGEN, verschoeben
 * sich also alle neun.
 *
 * EINHEITENFREI, und das ist Absicht: `tSection` ruft sie in ZENTIMETERN,
 * `stressPoints` in MILLIMETERN. Die Formel ist ein Verhaeltnis erster
 * Flaechenmomente zu Flaechen und damit homogen vom Grad 1 — heraus kommt die
 * Einheit, die hineingeht. Wer die Parameter auf `cm` oder `mm` brandet,
 * bricht einen der beiden Aufrufer.
 *
 * Sie ist ausserdem die EINE Gueltigkeitspruefung der Form: `undefined` heisst
 * „das sind keine T-Querschnittsmasse", und `tSection` wie `stressPoints`
 * haengen beide daran.
 */
export function tSectionCentroid(
  bf: number,
  hf: number,
  bw: number,
  h: number,
): number | undefined {
  const hs = h - hf;
  // `bf === bw` ist erlaubt (dann ist es ein Rechteck), `bw > bf` nicht: das
  // waere kein T mehr, und die Teilflaechen fuer Vy bekaemen eine negative
  // Laenge.
  if (!allPositive(bf, hf, bw, h, hs) || bw > bf) return undefined;
  const Af = bf * hf;
  const As = bw * hs;
  return (Af * (hf / 2) + As * (hf + hs / 2)) / (Af + As);
}

/**
 * Der T-Querschnitt — die einzige UNSYMMETRISCHE Form dieses Standes und damit
 * der einzige Fall mit `zs != h/2` und einem Steiner-Anteil. Ein
 * Vorzeichenfehler im Steiner-Anteil oder eine verkehrte z-Richtung faellt nur
 * hier auf.
 *
 * DER NAME NENNT DIE FORM, NICHT DEN BAUSTOFF: dieselben vier Zahlen heissen im
 * Betonbau Plattenbalken und im Stahlbau T-Profil. Was die beiden trennt, ist
 * `idealisation`, nicht der Formname — deshalb `t-section` und nicht `t-beam`.
 *
 * `bf`/`hf` sind Breite und Dicke des Gurts OBEN, `bw` die Stegbreite, `h` die
 * GESAMThoehe. Eingabesystem: `y = 0` auf der Symmetrieachse, `z = 0` an der
 * Gurtoberkante — damit ist `zs` die Zahl, die man von Hand nachrechnet.
 * Abmessungen in ZENTIMETERN (siehe `shapeResult`).
 */
export function tSection(
  bf: cm,
  hf: cm,
  bw: cm,
  h: cm,
  idealisation: Idealisation,
): ShapeResult | undefined {
  const hs = h - hf; // Steghoehe unter dem Gurt
  const zs = tSectionCentroid(bf, hf, bw, h);
  if (zs === undefined) return undefined;

  const Af = bf * hf;
  const As = bw * hs;
  const A = Af + As;

  const dF = zs - hf / 2; // Hebelarm Gurt -> Schwerpunkt
  const dS = hf + hs / 2 - zs; // Hebelarm Steg -> Schwerpunkt
  const Iy =
    (bf * hf * hf * hf) / 12 +
    Af * dF * dF +
    (bw * hs * hs * hs) / 12 +
    As * dS * dS;
  // Um die z-Achse liegen beide Teile mittig; kein Steiner-Anteil.
  const Iz = (hf * bf * bf * bf) / 12 + (hs * bw * bw * bw) / 12;

  const paths =
    idealisation === 'solid'
      ? solidPaths(bf, hf, bw, h, hs, zs)
      : thinPaths(bf, hf, bw, h);

  // NUR EINFACH SYMMETRISCH, und das ist der einzige Fall dieses Standes, in
  // dem der Schubmittelpunkt nicht mit dem Schwerpunkt zusammenfaellt: `yM = 0`
  // liegt auf der Symmetrieachse und ist damit bekannt, `zM` liegt in
  // Gurtmitte-Naehe und faellt erst aus dem Wandweg ab. `undefined` heisst
  // NICHT ERMITTELT — `zs` hinzuschreiben waere eine Unwahrheit, und das Gate
  // meldete dann keine Torsion, wo es keine gibt (Satz 2 keyt allein auf `yM`).
  return { A, Iy, Iz, Iyz: 0, ys: 0, zs, yM: 0, zM: undefined, ...paths };
}

function solidPaths(
  bf: number,
  hf: number,
  bw: number,
  h: number,
  hs: number,
  zs: number,
) {
  return {
    // Waagerecht von der Gurtoberkante nach unten: erst der breite Gurt, dann
    // der schmale Steg.
    pathZ: partIntervals(-zs, [
      { extent: hf, width: bf },
      { extent: hs, width: bw },
    ]).intervals,
    // Senkrecht: ausserhalb des Stegs nur der Gurt, ueber dem Steg die volle
    // Hoehe.
    pathY: partIntervals(-bf / 2, [
      { extent: (bf - bw) / 2, width: hf },
      { extent: bw, width: h },
      { extent: (bf - bw) / 2, width: hf },
    ]).intervals,
  };
}

/**
 * Der Schwerpunkt des WANDMODELLS, ebenfalls von der Gurtoberkante gemessen —
 * und die Laenge des Stegs in diesem Modell.
 *
 * EIN UNTERSCHIED ZU DEN SYMMETRISCHEN FORMEN, und er ist der Grund fuer die
 * eigene Schwerpunktrechnung hier: das Wandmodell hat eine andere Flaeche als
 * die Umrissfigur (der Steg reicht bis zur Gurtmitte), und bei einer
 * unsymmetrischen Form liegt sein Schwerpunkt deshalb woanders. Rechnete man
 * `S` um den Schwerpunkt der Umrissfigur, schloesse der Weg am freien Stegende
 * nicht auf null — `S` waere zweideutig, je nachdem, von welcher Seite man
 * schneidet.
 *
 * Eigene Funktion aus demselben Grund wie `tSectionCentroid`: kappa und die
 * duennwandige Spannungspunkt-Vorlage brauchen DENSELBEN Wert, und zwei
 * Rechnungen fuer eine Zahl waeren zwei Gelegenheiten, sie verschieden zu
 * bekommen. EINHEITENFREI, weil kappa in cm und die Vorlage in mm ruft.
 */
export function tSectionWall(bf: number, hf: number, bw: number, h: number) {
  const webLength = h - hf / 2; // Gurtmitte bis Stegunterkante
  const Af = bf * hf;
  const Aw = bw * webLength;
  return {
    webLength,
    zsWall: (Af * (hf / 2) + Aw * (hf / 2 + webLength / 2)) / (Af + Aw),
  };
}

/**
 * Duennwandig: Gurt- und Stegmittellinie.
 *
 * `Iy` bleibt das der Umrissfigur (siehe `ShapeResult`); nur `S` lebt
 * vollstaendig im Wandmodell — siehe `tSectionWall`.
 */
function thinPaths(bf: number, hf: number, bw: number, h: number) {
  const { webLength, zsWall } = tSectionWall(bf, hf, bw, h);

  const armF = hf / 2 - zsWall; // Gurtmittellinie relativ zum Wandschwerpunkt

  const flangeHalf = crossWallInterval(armF, hf, bf / 2);
  const web = partIntervals(
    armF,
    [{ extent: webLength, width: bw }],
    2 * endMoment(flangeHalf),
  ).intervals[0];

  return {
    pathZ: [flangeHalf, flangeHalf, web],
    // Wie beim I: der Steg traegt fuer Vy nichts, der Gurt alles — nur gibt es
    // hier eben nur EINEN Gurt.
    pathY: [partIntervals(-bf / 2, [{ extent: bf, width: hf }]).intervals[0]],
  };
}
