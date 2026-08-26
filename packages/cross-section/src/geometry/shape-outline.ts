/**
 * DIE PARAMETRISCHE FORM SCHREIBT SICH ALS UMRISS AUS
 * ([ADR 0062](../../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)).
 *
 * Vier Formen, vier Ringlisten — mehr ist es nicht. Und genau deshalb steht es
 * hier und nicht im FE-Package: die Tuer von `@baustatik/cross-section-fe`
 * nimmt eine `SectionGeometry`, und `{ kind: 'outline', rings }` ist eine. Muss
 * das FE-Package sich aendern, sitzt dieser Schreiber falsch.
 *
 * ER IST NICHT FUER DIE FE GEBAUT, sie ist nur sein erster Verbraucher. Der
 * zweite ist die nichtlineare Betonbemessung (`@baustatik/cross-section-response`,
 * [ADR 0055](../../../../docs/adr/0055-the-cross-section-response-is-the-shared-machine.md)):
 * ob sie ueber Lamellen oder ueber das Netz integriert, ist offen — den Umriss
 * brauchen beide Wege, Lamellen schneiden ihn, die FE vernetzt ihn.
 *
 * DAS EINGABESYSTEM BLEIBT DAS DER FORM: `y = 0` auf der Symmetrieachse,
 * `z = 0` an der Oberkante, `z` nach unten
 * ([ADR 0031](../../../../docs/adr/0031-the-cross-section-plane.md)). Anders
 * gelegt wanderten `ys`/`zs` gegen die Formelwerte — und der Test, der Green
 * ueber diese Ringe gegen `shapeValues` haelt, ist genau der, der den ganzen
 * Umbau traegt.
 *
 * ABMESSUNGEN IN MILLIMETERN, wie `ShapeSpec` und wie `Vertex`. Hier wird nicht
 * umgerechnet: die cm-Zwischenwelt gehoert der Rechenstrecke
 * (`calculation/shapes/`), nicht der Geometrie.
 *
 * KEIN `bulge`. Alle vier Figuren sind achsparallel; ein Bogen entstuende erst
 * mit der Ausrundung, und die tragen die Formen nicht (`i-symmetric` ist
 * ausdruecklich das GESCHWEISSTE I).
 */

import type { Ring, Vertex } from '../model/section-geometry';
import type { ShapeSpec } from '../model/shape-spec';
import { allPositive } from '../calculation/shapes/kernel';
import { tSectionCentroid } from '../calculation/shapes/t-section';

/**
 * Die Umrissringe einer parametrischen Form, oder `undefined` bei unsinnigen
 * Abmessungen.
 *
 * DIE GUELTIGKEIT WIRD GEERBT, nicht zweitgeprueft: es ist dieselbe eine
 * Pruefstelle je Form, an der auch `shapeValues` haengt — `allPositive` fuer
 * die drei symmetrischen Figuren, `tSectionCentroid` fuer das T. Eine zweite
 * Pruefung hier waere eine zweite Gelegenheit, die Grenzen verschieden zu
 * ziehen: eine Form duerfte dann Werte liefern und keinen Umriss, oder
 * umgekehrt.
 *
 * `undefined` heisst „das sind keine Abmessungen dieser Form" — derselbe Kanal
 * wie bei `sectionProperties` (CODING_STANDARDS §„Drei Fehlerkanaele").
 */
export function shapeOutline(spec: ShapeSpec): Ring[] | undefined {
  switch (spec.kind) {
    case 'rectangle':
      return rectangleRings(spec.b, spec.h);
    case 'hollow-rectangle':
      return hollowRectangleRings(spec.b, spec.h, spec.t);
    case 'i-symmetric':
      return iSymmetricRings(spec.h, spec.b, spec.tw, spec.tf);
    case 't-section':
      return tSectionRings(spec.bf, spec.hf, spec.bw, spec.h);
  }
}

/**
 * Das Vollrechteck — VIER Punkte.
 *
 * Der Umlaufsinn: von der oberen linken Ecke nach `+y`, dann nach `+z`. Das ist
 * die positive Drehung und damit `signedArea > 0` — Material
 * ([ADR 0034](../../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 * Alle folgenden Ringe laufen genauso herum; nur das Loch des Kastens nicht.
 */
function rectangleRings(b: number, h: number): Ring[] | undefined {
  if (!allPositive(b, h)) return undefined;
  const y = b / 2;
  return [
    ring([
      { y: -y, z: 0 },
      { y, z: 0 },
      { y, z: h },
      { y: -y, z: h },
    ]),
  ];
}

/**
 * Der geschlossene Kasten — ZWEI Ringe, und der zweite ist das LOCH.
 *
 * Der Innenring `(b−2t) × (h−2t)` laeuft ANDERSHERUM und traegt damit
 * `signedArea < 0`. Das ist die ganze Lochbehandlung: Green summiert beide, das
 * Loch faellt von selbst aus der Summe (ADR 0034), und der Mesher sieht dieselbe
 * Regel.
 *
 * DER KASTEN IST DIE EINE FORM, DIE MEHRFACH ZUSAMMENHAENGEND IST — und seit
 * [ADR 0048](../../../../docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md)
 * kostet das die FE nichts: kein Randdatum je Schleife, keine Nebenbedingung.
 */
function hollowRectangleRings(
  b: number,
  h: number,
  t: number,
): Ring[] | undefined {
  const bi = b - 2 * t;
  const hi = h - 2 * t;
  if (!allPositive(b, h, t, bi, hi)) return undefined;
  const yo = b / 2;
  const yi = bi / 2;

  return [
    ring([
      { y: -yo, z: 0 },
      { y: yo, z: 0 },
      { y: yo, z: h },
      { y: -yo, z: h },
    ]),
    // RUECKWAERTS gegenueber dem Aussenring: `−y → +z → +y → −z`.
    ring([
      { y: -yi, z: t },
      { y: -yi, z: h - t },
      { y: yi, z: h - t },
      { y: yi, z: t },
    ]),
  ];
}

/**
 * Das geschweisste, doppeltsymmetrische I — ZWOELF Punkte, scharfe Ecken.
 *
 * OHNE AUSRUNDUNG, und das ist der Unterschied zum Walzprofil aus dem Katalog:
 * mit denselben vier Abmessungen fehlt hier das Material am
 * Steg-Gurt-Uebergang. Dieselbe Figur steht als Vorgabe `i-200-geschweisst` in
 * `apps/demo/cross-section/outline-presets.ts` von Hand da.
 */
function iSymmetricRings(
  h: number,
  b: number,
  tw: number,
  tf: number,
): Ring[] | undefined {
  const hw = h - 2 * tf;
  if (!allPositive(h, b, tw, tf, hw, b - tw)) return undefined;
  const yf = b / 2;
  const yw = tw / 2;

  return [
    ring([
      { y: -yf, z: 0 },
      { y: yf, z: 0 },
      { y: yf, z: tf },
      { y: yw, z: tf },
      { y: yw, z: h - tf },
      { y: yf, z: h - tf },
      { y: yf, z: h },
      { y: -yf, z: h },
      { y: -yf, z: h - tf },
      { y: -yw, z: h - tf },
      { y: -yw, z: tf },
      { y: -yf, z: tf },
    ]),
  ];
}

/**
 * Der T-Querschnitt — ACHT Punkte: Gurt oben, Steg darunter, `h` ist die
 * GESAMThoehe.
 *
 * Die Gueltigkeit haengt an `tSectionCentroid`: dort steht auch `bw > bf` als
 * verboten, und das ist keine Abmessungspruefung, die man hier wiederholen
 * duerfte — waere `bw > bf`, liefe der Ring am Gurtansatz nach AUSSEN und die
 * Figur schnitte sich selbst.
 */
function tSectionRings(
  bf: number,
  hf: number,
  bw: number,
  h: number,
): Ring[] | undefined {
  if (tSectionCentroid(bf, hf, bw, h) === undefined) return undefined;
  const yf = bf / 2;
  const yw = bw / 2;

  return [
    ring([
      { y: -yf, z: 0 },
      { y: yf, z: 0 },
      { y: yf, z: hf },
      { y: yw, z: hf },
      { y: yw, z: h },
      { y: -yw, z: h },
      { y: -yw, z: hf },
      { y: -yf, z: hf },
    ]),
  ];
}

/** Ein Ring aus Punkten — ohne `bulge`, weil keine der vier Figuren einen hat. */
function ring(vertices: readonly { y: number; z: number }[]): Ring {
  return { vertices: vertices.map(({ y, z }): Vertex => ({ y, z })) };
}
