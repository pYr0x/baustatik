import { lookupProfile, profileData } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import {
  type CrossSection,
  type SectionProperties,
  type ShapeSpec,
  sectionProperties,
} from '../src/index';
// NICHT aus dem Barrel: der allgemeine Zweig hat heute keine Quelle, die ihn
// erreicht, und gehoert deshalb nicht in die oeffentliche Tuer des Packages.
import { principalAxes } from '../src/to-si';

/**
 * Die Hauptachsenlage — `alpha`, `Iu`, `Iv` — und der Schubmittelpunkt.
 *
 * Beides sind PFLICHT- bzw. benannte Optionalfelder seit
 * [ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md); die Tests hier
 * halten fest, dass sie fuer JEDE Quelle fallen und was sie dabei bedeuten.
 */

function shape(spec: ShapeSpec) {
  const properties = sectionProperties({ kind: 'shape', id: 'cs', shape: spec });
  if (properties === undefined) throw new Error('unsinnige Abmessungen');
  return properties;
}

function profile(name: string) {
  const row = lookupProfile(name);
  if (row === undefined) throw new Error(`${name} fehlt im Katalog`);
  const properties = sectionProperties({
    kind: 'profile',
    id: 'cs',
    profile: row.id,
    data: profileData(row),
  });
  if (properties === undefined) throw new Error('kein Profilsatz');
  return properties;
}

/**
 * Alle Quellen des Packages, aufrecht bemasst.
 *
 * AUFRECHT ist hier keine Nebensache: `alpha = 0` ist kein hingeschriebener
 * Wert, sondern das Ergebnis der Algebra fuer einen Querschnitt, dessen starke
 * Achse `y` ist. Der liegende Fall steht weiter unten und faellt anders aus.
 */
const SOURCES: readonly (readonly [string, SectionProperties])[] = [
  ['rectangle', shape({ kind: 'rectangle', b: 200, h: 500 })],
  [
    'hollow-rectangle',
    shape({
      kind: 'hollow-rectangle',
      b: 200,
      h: 300,
      t: 10,
      idealisation: 'thin-walled',
    }),
  ],
  [
    'i-symmetric',
    shape({
      kind: 'i-symmetric',
      h: 200,
      b: 100,
      tw: 6,
      tf: 10,
      idealisation: 'thin-walled',
    }),
  ],
  [
    't-section',
    // Schmaler Gurt: ein Stahl-T, nicht der Plattenbalken. Bei `bf = 2000`
    // waere `Iz` groesser als `Iy`, und die starke Achse laege auf `z`.
    shape({
      kind: 't-section',
      bf: 200,
      hf: 20,
      bw: 10,
      h: 300,
      idealisation: 'solid',
    }),
  ],
  ['IPE 300', profile('IPE 300')],
  ['HEA 200', profile('HEA 200')],
];

describe('Die Hauptachsen fallen aus jeder Quelle', () => {
  it.each(SOURCES)(
    '%s: die Spur bleibt erhalten, Iy + Iz === Iu + Iv',
    (_name, p) => {
      // Die Invariante der Drehung: eine Drehung des Bezugssystems aendert die
      // Summe der beiden Traegheitsmomente nicht. Sie gilt QUELLENUNABHAENGIG
      // und ist damit der eine Test, den auch die Green-Rechnung aus P2
      // bestehen muss.
      const sum = p.Iy + p.Iz;
      expect(Math.abs(p.Iu + p.Iv - sum) / sum).toBeLessThan(1e-15);
    },
  );

  it.each(SOURCES)('%s: Iu >= Iv und alpha in (-pi/2, +pi/2]', (_name, p) => {
    // Die beiden Rider zusammen machen die Angabe EINDEUTIG: ohne `Iu >= Iv`
    // waere jede Lage zweimal beschreibbar, einmal um 90 Grad gedreht.
    expect(p.Iu).toBeGreaterThanOrEqual(p.Iv);
    expect(p.alpha).toBeGreaterThan(-Math.PI / 2);
    expect(p.alpha).toBeLessThanOrEqual(Math.PI / 2);
  });

  it.each(SOURCES)(
    '%s: aufrecht bemasst sind y und z bereits die Hauptachsen',
    (_name, p) => {
      // EXAKTE Gleichheit, nicht `toBeCloseTo`: `Iyz === 0` heisst, dass `y`
      // und `z` die Hauptachsen SIND, und die Rechnung kuerzt diesen Fall ab,
      // statt ihn ueber Wurzel und Division zu fuehren. Bewegt sich hier die
      // letzte Stelle, ist die Abkuerzung verloren gegangen.
      expect(p.Iyz).toBe(0);
      expect(p.alpha).toBe(0);
      expect(p.Iu).toBe(p.Iy);
      expect(p.Iv).toBe(p.Iz);
    },
  );

  it('dreht die starke Achse auf +pi/2, wenn der Querschnitt liegt', () => {
    // DER GEGENBELEG zum Test darueber: `alpha = 0` ist nichts, was jede Form
    // hinschreibt, sondern das Ergebnis fuer eine aufrechte Figur. Der
    // Plattenbalken mit 2 m breitem Gurt hat sein groesseres
    // Traegheitsmoment um `z` — und der Rider `Iu >= Iv` erzwingt dann die
    // Drehung, statt ein `Iu` unter `Iv` durchzulassen.
    const plate = shape({
      kind: 't-section',
      bf: 2000,
      hf: 200,
      bw: 250,
      h: 500,
      idealisation: 'solid',
    });
    expect(plate.Iz).toBeGreaterThan(plate.Iy);
    expect(plate.alpha).toBe(Math.PI / 2);
    expect(plate.Iu).toBe(plate.Iz);
    expect(plate.Iv).toBe(plate.Iy);
  });
});

describe('Der Schubmittelpunkt liegt im System von ys/zs', () => {
  it.each(SOURCES)('%s: yM steht, denn y ist Symmetrieachse', (_name, p) => {
    // Alle sechs Quellen haben eine Symmetrieachse in y, also liegt M auf ihr.
    // Damit ist Satz 2 des Gatters fuer sie beantwortet und Satz 4 still.
    expect(p.yM).toBe(p.ys);
  });

  it('haelt zM beim t-section auf `undefined`', () => {
    // CHARAKTERISIERUNG (Befund B6): der T-Querschnitt ist NUR EINFACH
    // symmetrisch. `yM = ys = 0` steht, aber `zM != zs` — und die Zahl faellt
    // erst aus dem Wandweg. `zs` hier hinzuschreiben waere eine Unwahrheit.
    const t = shape({
      kind: 't-section',
      bf: 200,
      hf: 20,
      bw: 10,
      h: 300,
      idealisation: 'solid',
    });
    expect(t.zM).toBeUndefined();
    expect(t.zs).toBeGreaterThan(0);
  });

  it.each(
    SOURCES.filter(([name]) => name !== 't-section'),
  )('%s: zM === zs, weil die Form doppeltsymmetrisch ist', (_name, p) => {
    expect(p.zM).toBe(p.zs);
  });
});

describe('Der allgemeine Zweig: schiefe Hauptachsen', () => {
  // Er hat heute KEINE Quelle — jede Form und jede Katalogzeile setzt
  // `Iyz = 0`. Geprueft wird er trotzdem: er wartet auf die Green-Rechnung aus
  // P2, und ein ungeprueftes Vorzeichen in einer Winkelkonvention ist genau
  // der Fehler, den ADR 0031 verhindern soll.
  it('dreht bei Iy === Iz auf +-45 Grad, und das Vorzeichen folgt Iyz', () => {
    // `tan 2α = −2·Iyz / (Iy − Iz)`: bei gleichem `Iy` und `Iz` steht der
    // Nenner auf 0, der Winkel also auf +-45 Grad — und welches der beiden,
    // entscheidet allein das Vorzeichen von `Iyz`.
    const positive = principalAxes(2, 2, -1);
    expect(positive.alpha).toBeCloseTo(Math.PI / 4, 15);
    expect(positive.Iu).toBeCloseTo(3, 15);
    expect(positive.Iv).toBeCloseTo(1, 15);

    // POSITIV DREHT VON `+y` NACH `+z` (ADR 0031). Gegen Dlubal ist das
    // Vorzeichen gespiegelt; gespiegelt wird EINMAL, in der Berichtsausgabe.
    const negative = principalAxes(2, 2, 1);
    expect(negative.alpha).toBeCloseTo(-Math.PI / 4, 15);
  });

  it('trifft 30 Grad und haelt dabei die Spur', () => {
    const { alpha, Iu, Iv } = principalAxes(3, 1, -Math.sqrt(3));
    expect(alpha).toBeCloseTo(Math.PI / 6, 15);
    expect(Iu).toBeCloseTo(4, 15);
    expect(Iv).toBeCloseTo(0, 15);
    expect(Iu + Iv).toBeCloseTo(3 + 1, 15);
  });

  it('bleibt im Bereich (-pi/2, +pi/2] und haelt Iu >= Iv', () => {
    // Eine Stichprobe quer durch den Quadranten — die beiden Rider gelten per
    // KONSTRUKTION (`atan2` halbiert einen Winkel aus `(-pi, +pi]`), nicht
    // per Nachbesserung.
    for (const Iyz of [-5, -1, -0.001, 0.001, 1, 5]) {
      for (const Iy of [1, 4]) {
        const { alpha, Iu, Iv } = principalAxes(Iy, 4 - Iy + 1, Iyz);
        expect(alpha).toBeGreaterThan(-Math.PI / 2);
        expect(alpha).toBeLessThanOrEqual(Math.PI / 2);
        expect(Iu).toBeGreaterThanOrEqual(Iv);
      }
    }
  });
});

describe('Die dritte Quelle traegt in P0 nur ihren Vertrag', () => {
  it('gibt fuer einen section-geometry-Querschnitt keine Werte heraus', () => {
    // `undefined` heisst „kenne ich nicht" — ehrlicher als eine geratene Zahl.
    // Die Werte fallen mit P2 aus dem mitgefuehrten Umriss.
    const cs: CrossSection = {
      kind: 'section-geometry',
      id: 'cs',
      geometry: {
        kind: 'outline',
        rings: [
          {
            vertices: [
              { y: 0, z: 0 },
              { y: 100, z: 0 },
              { y: 100, z: 200 },
              { y: 0, z: 200 },
            ],
          },
        ],
        outline: [
          {
            points: [
              { y: 0, z: 0 },
              { y: 100, z: 0 },
              { y: 100, z: 200 },
              { y: 0, z: 200 },
            ],
          },
        ],
      },
    };
    expect(sectionProperties(cs)).toBeUndefined();
  });
});
