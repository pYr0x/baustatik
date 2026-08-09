import { DEFAULT_ARC_TOLERANCE } from '@baustatik/section-geometry';
import { describe, expect, it } from 'vitest';
import {
  type CrossSection,
  createSectionPolicy,
  deriveOutlineFromRings,
  type Polygon,
  type SectionProperties,
  type ShapeSpec,
  sectionProperties,
  type Vertex,
} from '../src/index';

/**
 * Die Green-Rechnung auf dem mitgeführten Umriss (P2).
 *
 * VIER ORAKEL, und sie prüfen Verschiedenes: die geschlossene Formel derselben
 * Figur, eine Handrechnung mit `Iyz != 0`, die quellenunabhängigen
 * Invarianten, und der Kreis gegen `πr⁴/4` mit HERGELEITETER Toleranz.
 */

const POLICY = createSectionPolicy();

/** Der Querschnitt aus einem fertigen Umriss — der Weg, den `outline` geht. */
function fromOutline(outline: Polygon[]): SectionProperties {
  const cs: CrossSection = {
    kind: 'section-geometry',
    id: 'cs',
    geometry: { kind: 'outline', rings: [], outline },
  };
  const properties = sectionProperties(cs);
  if (properties === undefined) throw new Error('kein Umriss-Satz');
  return properties;
}

/** Dieselbe Figur über die geschlossene Formel. */
function fromShape(spec: ShapeSpec): SectionProperties {
  const properties = sectionProperties({ kind: 'shape', id: 'cs', shape: spec });
  if (properties === undefined) throw new Error('unsinnige Abmessungen');
  return properties;
}

/** Ein Ring aus rohen mm-Paaren. */
function ring(...points: readonly (readonly [number, number])[]): Polygon {
  return { points: points.map(([y, z]) => ({ y, z })) };
}

/**
 * Das schärfste Orakel: DIESELBE ZAHL AUF ZWEI VÖLLIG VERSCHIEDENEN WEGEN.
 *
 * Links die geschlossene Formel der parametrischen Form, rechts die
 * Green-Summe über ein von Hand gezeichnetes Polygon derselben Figur. Beide
 * rechnen im SELBEN Eingabesystem (`y = 0` auf der Symmetrieachse, `z = 0` an
 * der Oberkante), also sind auch `ys` und `zs` vergleichbar.
 */
describe('Die parametrischen Formen als Polygon gegen ihre geschlossene Formel', () => {
  it('i-symmetric: das geschweißte I ohne Ausrundung', () => {
    const h = 200;
    const b = 100;
    const tw = 6;
    const tf = 10;
    const shape = fromShape({
      kind: 'i-symmetric',
      h,
      b,
      tw,
      tf,
      idealisation: 'solid',
    });

    // Positiv gewickelt: erst nach +y, dann nach +z.
    const green = fromOutline([
      ring(
        [-b / 2, 0],
        [b / 2, 0],
        [b / 2, tf],
        [tw / 2, tf],
        [tw / 2, h - tf],
        [b / 2, h - tf],
        [b / 2, h],
        [-b / 2, h],
        [-b / 2, h - tf],
        [-tw / 2, h - tf],
        [-tw / 2, tf],
        [-b / 2, tf],
      ),
    ]);

    expectSameFigure(green, shape);
  });

  it('t-section: die einzige unsymmetrische Form, also mit Steiner-Anteil', () => {
    const bf = 200;
    const hf = 20;
    const bw = 10;
    const h = 300;
    const shape = fromShape({
      kind: 't-section',
      bf,
      hf,
      bw,
      h,
      idealisation: 'solid',
    });

    const green = fromOutline([
      ring(
        [-bf / 2, 0],
        [bf / 2, 0],
        [bf / 2, hf],
        [bw / 2, hf],
        [bw / 2, h],
        [-bw / 2, h],
        [-bw / 2, hf],
        [-bf / 2, hf],
      ),
    ]);

    expectSameFigure(green, shape);
    // Der Schwerpunkt liegt NICHT auf halber Höhe — sonst wäre der
    // Steiner-Anteil gar nicht geprüft.
    expect(green.zs).not.toBeCloseTo(h / 2000, 6);
  });

  it('hollow-rectangle: das Loch trägt sich über seinen Umlaufsinn selbst bei', () => {
    // DER SCHÄRFSTE FALL DER REIHE: ein vertauschtes Loch-Vorzeichen fällt
    // sofort auf, weil `A` dann die volle Rechteckfläche wäre.
    const b = 200;
    const h = 300;
    const t = 10;
    const shape = fromShape({
      kind: 'hollow-rectangle',
      b,
      h,
      t,
      idealisation: 'solid',
    });

    const green = fromOutline([
      // Material: positiv gewickelt.
      ring([-b / 2, 0], [b / 2, 0], [b / 2, h], [-b / 2, h]),
      // Loch: NEGATIV gewickelt — dieselben Ecken, andere Reihenfolge.
      ring(
        [-b / 2 + t, t],
        [-b / 2 + t, h - t],
        [b / 2 - t, h - t],
        [b / 2 - t, t],
      ),
    ]);

    expectSameFigure(green, shape);
    expect(green.A).toBeLessThan((b * h) / 1e6);
  });
});

/**
 * Der erste Fall mit `Iyz != 0` — und damit der erste, der den ALLGEMEINEN
 * Zweig von `principalAxes` produktiv befährt.
 *
 * DIE FIXTURE TRÄGT DIE POLYGONKOORDINATEN, NICHT DIE TABELLENZEILE: `Iyz`
 * hängt an der Zeichenlage, und eine Katalogzeile ohne Bild ist dafür kein
 * Orakel. `alpha` wird aus der Handrechnung hergeleitet, nicht aus dem
 * gedruckten Wert übernommen.
 */
describe('L 30x20x3: der allgemeine Zweig, aus der Zeichenlage hergeleitet', () => {
  // Zwei Rechtecke, Ecke im Ursprung, ohne Ausrundung: der lange Schenkel
  // (30 x 3) längs `+z`, der kurze (20 x 3) längs `+y`.
  const green = fromOutline([
    ring([0, 0], [20, 0], [20, 3], [3, 3], [3, 30], [0, 30]),
  ]);

  // Handrechnung in cm, Ursprung in der Außenecke, zwei Teilrechtecke:
  //   Schenkel längs z: A = 0,3·3,0  = 0,90, Schwerpunkt (0,15 | 1,50)
  //   Schenkel längs y: A = 1,7·0,3  = 0,51, Schwerpunkt (1,15 | 0,15)
  //   A  = 1,41 cm²
  //   ys = (0,90·0,15 + 0,51·1,15) / 1,41 = 0,51170 cm
  //   zs = (0,90·1,50 + 0,51·0,15) / 1,41 = 1,01170 cm
  //   Σ∫y·z dA um den Ursprung = 0,90·0,15·1,50 + 0,51·1,15·0,15 = 0,290475 cm⁴
  //   Iyz = 0,290475 − 1,41·0,51170·1,01170 = −0,4395 cm⁴
  const CM4 = 1e-8;

  it('rechnet A und den Schwerpunkt aus der Zeichnung', () => {
    expect(green.A).toBeCloseTo(1.41e-4, 10);
    expect(green.ys * 100).toBeCloseTo(0.5117, 3);
    expect(green.zs * 100).toBeCloseTo(1.0117, 3);
  });

  it('liefert Iyz = -0,4395 cm4 — das nackte Green-Integral, ohne Negation', () => {
    // `Iyz = +∫y·z dA` (ADR 0031/0034). Wer hier eine Negation einbaut, kippt
    // `alpha` still für JEDEN künftigen Querschnitt.
    expect(green.Iyz / CM4).toBeCloseTo(-0.4395, 3);
  });

  it('liefert alpha = +23,55 Grad, hergeleitet und nicht abgeschrieben', () => {
    // Aus derselben Handrechnung:
    //   Iy = 1,27209 cm⁴, Iz = 0,45512 cm⁴
    //   tan 2α = −2·(−0,4395) / (1,27209 − 0,45512) = 1,07584
    //   α = ½·atan2(0,87893 | 0,81697) = 23,546°
    //
    // ADR 0031 nennt `+23,12°` — für den KATALOG-L-Winkel MIT Ausrundung. Die
    // Abweichung ist ein Befund über den ADR und über die Zeichenlage, NICHT
    // die Aufforderung, das Integral zu negieren: die Negation ergäbe
    // `−23,55°`, also das falsche Vorzeichen, und kippte `alpha` still für
    // jeden künftigen Querschnitt.
    expect((green.alpha * 180) / Math.PI).toBeCloseTo(23.546, 2);
    expect(green.Iy / CM4).toBeCloseTo(1.27209, 4);
    expect(green.Iz / CM4).toBeCloseTo(0.45512, 4);
  });

  it('hält die Invarianten trotz Iyz != 0', () => {
    expectInvariants(green);
    expect(green.Iu).toBeGreaterThan(green.Iv);
    expect(green.Iu).not.toBe(green.Iy);
  });
});

/**
 * Der Kreis als Vieleck gegen `πr⁴/4` — mit HERGELEITETER Toleranz.
 *
 * Eine Zahl, die man herleiten kann, ist besser als eine geratene Stellenzahl:
 * bei der Sehnenabweichung `s` und dem Radius `r` deckt ein Sehnenpolygon den
 * Anteil `cos²(φ/2)` der Kreisfläche ab, mit `φ = 2·acos(1 − s/r)` als
 * Zentriwinkel der gröbsten zulässigen Sehne. Der relative FLÄCHENfehler
 * bleibt darunter, der Fehler in `Iy` unter dem doppelten — beides nach unten,
 * weil ein einbeschriebenes Vieleck immer zu klein ist.
 */
describe('Ein Kreis als Vieleck gegen die geschlossene Formel', () => {
  const r = 50;
  const circle = fromOutline(
    deriveOutlineFromRings(
      [
        {
          // Zwei Halbkreise: `bulge = tan(Δ/4) = tan(π/4) = 1`.
          vertices: [
            { y: -r, z: 0, bulge: 1 },
            { y: r, z: 0, bulge: 1 },
          ] satisfies Vertex[],
        },
      ],
      POLICY,
    ),
  );

  // Der Zentriwinkel der gröbsten Sehne unter `DEFAULT_ARC_TOLERANCE`.
  const phi = 2 * Math.acos(1 - DEFAULT_ARC_TOLERANCE / r);
  const areaShortfall = 1 - Math.cos(phi / 2) ** 2;

  it('trifft die Kreisfläche bis auf den hergeleiteten Sehnenfehlbetrag', () => {
    const exact = Math.PI * (r / 1000) ** 2;
    expect(circle.A).toBeLessThanOrEqual(exact);
    expect((exact - circle.A) / exact).toBeLessThan(areaShortfall);
  });

  it('trifft Iy = pi*r^4/4 ebenso', () => {
    const exact = (Math.PI * (r / 1000) ** 4) / 4;
    expect(circle.Iy).toBeLessThanOrEqual(exact);
    expect((exact - circle.Iy) / exact).toBeLessThan(2 * areaShortfall);
  });

  it('ist rund: Iy und Iz stimmen überein und der Mittelpunkt liegt im Ursprung', () => {
    expect(circle.Iy).toBeCloseTo(circle.Iz, 12);
    expect(circle.ys).toBeCloseTo(0, 10);
    expect(circle.zs).toBeCloseTo(0, 10);
  });
});

/**
 * Die Invarianten — QUELLENUNABHÄNGIG, und deshalb der Test, den auch die
 * Green-Rechnung bestehen muss.
 */
function expectInvariants(p: SectionProperties): void {
  const sum = p.Iy + p.Iz;
  expect(Math.abs(p.Iu + p.Iv - sum) / sum).toBeLessThan(1e-12);
  expect(p.Iu).toBeGreaterThanOrEqual(p.Iv);
  expect(p.alpha).toBeGreaterThan(-Math.PI / 2);
  expect(p.alpha).toBeLessThanOrEqual(Math.PI / 2);
}

/**
 * Zwei Sätze über DIESELBE Figur, auf verschiedenen Wegen gerechnet.
 *
 * `toBeCloseTo` mit 12 Nachkommastellen auf SI-Werten ist bei Flächen in der
 * Größenordnung `1e-3 m²` und Momenten um `1e-6 m⁴` deutlich schärfer, als
 * jede Abweichung der beiden Wege sein dürfte — die Rechnung ist exakt, nur
 * die Reihenfolge der Additionen unterscheidet sich.
 */
function expectSameFigure(
  green: SectionProperties,
  shape: SectionProperties,
): void {
  expect(green.A).toBeCloseTo(shape.A, 12);
  expect(green.Iy).toBeCloseTo(shape.Iy, 12);
  expect(green.Iz).toBeCloseTo(shape.Iz, 12);
  expect(green.ys).toBeCloseTo(shape.ys, 12);
  expect(green.zs).toBeCloseTo(shape.zs, 12);
  // Symmetrisch gezeichnet, also Hauptachsenlage — aber nur auf Rauschen
  // genau, nie bit-exakt wie bei Form und Katalog. Das ist der ausgesprochene
  // Preis der dritten Quelle.
  expect(Math.abs(green.Iyz)).toBeLessThan(
    1e-9 * Math.max(Math.abs(green.Iy), Math.abs(green.Iz)),
  );
  expectInvariants(green);
}
