import type { Idealisation } from '../section';
import { bandSegments, crossWallSegment, endMoment } from '../shear';
import { allPositive, type ShapeResult } from './kernel';

/**
 * Der Plattenbalken — die einzige UNSYMMETRISCHE Form dieses Standes und damit
 * der einzige Fall mit `zs != h/2` und einem Steiner-Anteil. Ein
 * Vorzeichenfehler im Steiner-Anteil oder eine verkehrte z-Richtung faellt nur
 * hier auf.
 *
 * `bf`/`hf` sind Breite und Dicke des Gurts OBEN, `bw` die Stegbreite, `h` die
 * GESAMThoehe. Eingabesystem: `y = 0` auf der Symmetrieachse, `z = 0` an der
 * Gurtoberkante — damit ist `zs` die Zahl, die man von Hand nachrechnet.
 */
export function tBeam(
  bf: number,
  hf: number,
  bw: number,
  h: number,
  idealisation: Idealisation,
): ShapeResult | undefined {
  const hs = h - hf; // Steghoehe unter dem Gurt
  // `bf === bw` ist erlaubt (dann ist es ein Rechteck), `bw > bf` nicht: das
  // waere kein Plattenbalken mehr, und die Bandfolge fuer Vy bekaeme eine
  // negative Laenge.
  if (!allPositive(bf, hf, bw, h, hs) || bw > bf) return undefined;

  const Af = bf * hf;
  const As = bw * hs;
  const A = Af + As;

  // Schwerpunkt von der Gurtoberkante aus.
  const zs = (Af * (hf / 2) + As * (hf + hs / 2)) / A;

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

  return { A, Iy, Iz, Iyz: 0, ys: 0, zs, ...paths };
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
    pathZ: bandSegments(-zs, [
      { extent: hf, width: bf },
      { extent: hs, width: bw },
    ]).segments,
    // Senkrecht: ausserhalb des Stegs nur der Gurt, ueber dem Steg die volle
    // Hoehe.
    pathY: bandSegments(-bf / 2, [
      { extent: (bf - bw) / 2, width: hf },
      { extent: bw, width: h },
      { extent: (bf - bw) / 2, width: hf },
    ]).segments,
  };
}

/**
 * Duennwandig: Gurt- und Stegmittellinie.
 *
 * EIN UNTERSCHIED ZU DEN SYMMETRISCHEN FORMEN, und er ist der Grund fuer die
 * eigene Schwerpunktrechnung hier: das Wandmodell hat eine andere Flaeche als
 * die Umrissfigur (der Steg reicht bis zur Gurtmitte), und bei einer
 * unsymmetrischen Form liegt sein Schwerpunkt deshalb woanders. Rechnete man
 * `S` um den Schwerpunkt der Umrissfigur, schloesse der Weg am freien Stegende
 * nicht auf null — `S` waere zweideutig, je nachdem, von welcher Seite man
 * schneidet.
 *
 * `Iy` bleibt das der Umrissfigur (siehe `ShapeResult`); nur `S` lebt
 * vollstaendig im Wandmodell.
 */
function thinPaths(bf: number, hf: number, bw: number, h: number) {
  const webLength = h - hf / 2; // Gurtmitte bis Stegunterkante
  const Af = bf * hf;
  const Aw = bw * webLength;
  const zsWall = (Af * (hf / 2) + Aw * (hf / 2 + webLength / 2)) / (Af + Aw);

  const armF = hf / 2 - zsWall; // Gurtmittellinie relativ zum Wandschwerpunkt

  const flangeHalf = crossWallSegment(armF, hf, bf / 2);
  const web = bandSegments(
    armF,
    [{ extent: webLength, width: bw }],
    2 * endMoment(flangeHalf),
  ).segments[0];

  return {
    pathZ: [flangeHalf, flangeHalf, web],
    // Wie beim I: der Steg traegt fuer Vy nichts, der Gurt alles — nur gibt es
    // hier eben nur EINEN Gurt.
    pathY: [bandSegments(-bf / 2, [{ extent: bf, width: hf }]).segments[0]],
  };
}
