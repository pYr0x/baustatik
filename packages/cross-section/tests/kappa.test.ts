import { profilesIn } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import type { SectionProperties } from '../src/index';
import { type CrossSection, sectionProperties } from '../src/index';
import { CM2_TO_M2 } from '../src/calculation/units';
import {
  acrossPiece,
  alongPiece,
  type OracleBranch,
  shearAreaNumeric,
  shearIntegralNumeric,
} from './oracle';

function values(cs: CrossSection): SectionProperties {
  const p = sectionProperties(cs);
  if (p === undefined) throw new Error('sectionProperties lieferte undefined');
  return p;
}

/**
 * mm -> m.
 *
 * `ShapeSpec` fuehrt Millimeter, `sectionProperties` liefert SI. Das Orakel
 * baut seinen Weg deshalb in METERN — in DERSELBEN Einheit wie `p.Iy` und
 * `p.A`, mit denen es gleich verrechnet wird.
 *
 * kappa selbst ist massstabsfrei: skaliert man alle Laengen mit `L`, wird `I`
 * zu `L^4 I`, `A_s` zu `L^2 A_s`, und der Quotient bleibt. Genau deshalb faellt
 * ein Einheitenfehler hier NUR auf, wenn die beiden Seiten verschieden
 * skaliert sind — was diese Konstante verhindert.
 */
const M = 1e-3;

/**
 * Die EXAKTE Schwerpunktlage des Plattenbalkens 2000/200/250/500 [mm]:
 * `(400000*100 + 75000*350) / 475000`. Gedruckt wird sie als 139,5 — auf
 * 139,5 gerundet weicht kappa aber schon in der vierten Stelle ab, und die
 * Quadratur vergleicht auf 1e-6. Der Bruch bleibt deshalb stehen.
 */
const T_ZS = 66_250_000 / 475_000;

// ---------------------------------------------------------------------------
// Die Wege, unabhaengig noch einmal hingeschrieben — Eingabe fuer das Orakel.
// ---------------------------------------------------------------------------

/** Eine Folge von Teilflaechen laengs der Schubrichtung als EIN Ast. */
function partBranch(
  start: number,
  parts: readonly { extent: number; width: number }[],
): OracleBranch {
  return {
    S0: 0,
    pieces: parts.map((part, i) => {
      const offset = parts
        .slice(0, i)
        .reduce((sum, p) => sum + p.extent, start);
      return alongPiece(offset, part.extent, part.width);
    }),
  };
}

const rectanglePaths = (b: number, h: number) => ({
  z: [partBranch(-h / 2, [{ extent: h, width: b }])],
  y: [partBranch(-b / 2, [{ extent: b, width: h }])],
});

const iSolidPaths = (h: number, b: number, tw: number, tf: number) => {
  const hw = h - 2 * tf;
  return {
    z: [
      partBranch(-h / 2, [
        { extent: tf, width: b },
        { extent: hw, width: tw },
        { extent: tf, width: b },
      ]),
    ],
    y: [
      partBranch(-b / 2, [
        { extent: (b - tw) / 2, width: 2 * tf },
        { extent: tw, width: h },
        { extent: (b - tw) / 2, width: 2 * tf },
      ]),
    ],
  };
};

const iThinPaths = (h: number, b: number, tw: number, tf: number) => {
  const zf = (h - tf) / 2;
  // Vier Gurthaelften; jede ist ein eigener Ast vom freien Ende her.
  const flange = (arm: number): OracleBranch => ({
    S0: 0,
    pieces: [acrossPiece(arm, b / 2, tf)],
  });
  return {
    z: [
      flange(-zf),
      flange(-zf),
      // Der Steg erbt die Summe der beiden OBEREN Gurthaelften.
      { S0: -2 * zf * tf * (b / 2), pieces: [alongPiece(-zf, 2 * zf, tw)] },
      flange(zf),
      flange(zf),
    ],
    y: [
      partBranch(-b / 2, [{ extent: b, width: tf }]),
      partBranch(-b / 2, [{ extent: b, width: tf }]),
    ],
  };
};

const boxSolidPaths = (b: number, h: number, t: number) => ({
  z: [
    partBranch(-h / 2, [
      { extent: t, width: b },
      { extent: h - 2 * t, width: 2 * t },
      { extent: t, width: b },
    ]),
  ],
  y: [
    partBranch(-b / 2, [
      { extent: t, width: h },
      { extent: b - 2 * t, width: 2 * t },
      { extent: t, width: h },
    ]),
  ],
});

/**
 * Halber Umlauf im geschlossenen Kasten, vom Symmetrieschnitt aus. Die drei
 * Abschnitte haengen aneinander, das Orakel integriert kumulativ — und am
 * zweiten Symmetrieschnitt muss `S` wieder null sein.
 *
 * DIE WAENDE PARKETTIEREN DIE UMRISSFIGUR (ADR 0051): die Querwand laeuft bis
 * zur AUSSENKANTE (`crossOuterHalf`), die Laengswand ueber die LICHTE Weite
 * (`alongClear`). Der Hebelarm bleibt die Mittellinie. Die Umlauflaenge ist
 * dieselbe wie im reinen Mittellinienmodell — es verschiebt sich nur die
 * Trennstelle, um `t/2`.
 */
function boxHalf(
  crossOuterHalf: number,
  alongClear: number,
  arm: number,
  t: number,
): OracleBranch {
  return {
    S0: 0,
    pieces: [
      acrossPiece(-arm, crossOuterHalf, t),
      alongPiece(-alongClear / 2, alongClear, t),
      acrossPiece(arm, crossOuterHalf, t),
    ],
  };
}

const boxThinPaths = (b: number, h: number, t: number) => {
  const z = () => boxHalf(b / 2, h - 2 * t, (h - t) / 2, t);
  const y = () => boxHalf(h / 2, b - 2 * t, (b - t) / 2, t);
  return { z: [z(), z()], y: [y(), y()] };
};

const tSolidPaths = (
  bf: number,
  hf: number,
  bw: number,
  h: number,
  zs: number,
) => ({
  z: [
    partBranch(-zs, [
      { extent: hf, width: bf },
      { extent: h - hf, width: bw },
    ]),
  ],
  y: [
    partBranch(-bf / 2, [
      { extent: (bf - bw) / 2, width: hf },
      { extent: bw, width: h },
      { extent: (bf - bw) / 2, width: hf },
    ]),
  ],
});

const tThinPaths = (bf: number, hf: number, bw: number, h: number) => {
  const webLength = h - hf / 2;
  const Af = bf * hf;
  const Aw = bw * webLength;
  const zsWall = (Af * (hf / 2) + Aw * (hf / 2 + webLength / 2)) / (Af + Aw);
  const armF = hf / 2 - zsWall;
  const flange: OracleBranch = { S0: 0, pieces: [acrossPiece(armF, bf / 2, hf)] };
  return {
    z: [
      flange,
      flange,
      { S0: 2 * armF * hf * (bf / 2), pieces: [alongPiece(armF, webLength, bw)] },
    ],
    y: [partBranch(-bf / 2, [{ extent: bf, width: hf }])],
  };
};

// ---------------------------------------------------------------------------

describe('kappa: geschlossene Formel gegen numerische Integration', () => {
  // Vier Herleitungen mal zwei Idealisierungen haetten sonst nur sich selbst
  // als Zeugen. Das Orakel rechnet dasselbe Integral, aber ueber eine
  // Beschreibung des Weges mit dem Hebelarm als FUNKTION statt als
  // Koeffizienten — kein Schritt kommt in beiden Rechnungen vor.
  const cases: {
    name: string;
    cs: CrossSection;
    paths: { y: OracleBranch[]; z: OracleBranch[] };
  }[] = [
    {
      name: 'rectangle 200 x 500 mm',
      cs: { kind: 'shape', id: 'r', shape: { kind: 'rectangle', b: 200, h: 500 } },
      paths: rectanglePaths(200 * M, 500 * M),
    },
    {
      name: 'hollow-rectangle solid 300 x 500 x 20 mm',
      cs: {
        kind: 'shape',
        id: 'b',
        shape: {
          kind: 'hollow-rectangle',
          b: 300,
          h: 500,
          t: 20,
          idealisation: 'solid',
        },
      },
      paths: boxSolidPaths(300 * M, 500 * M, 20 * M),
    },
    {
      name: 'hollow-rectangle thin-walled 300 x 500 x 20 mm',
      cs: {
        kind: 'shape',
        id: 'b',
        shape: {
          kind: 'hollow-rectangle',
          b: 300,
          h: 500,
          t: 20,
          idealisation: 'thin-walled',
        },
      },
      paths: boxThinPaths(300 * M, 500 * M, 20 * M),
    },
    {
      name: 'i-symmetric solid (IPE-300-Masse)',
      cs: {
        kind: 'shape',
        id: 'i',
        shape: {
          kind: 'i-symmetric',
          h: 300,
          b: 150,
          tw: 7.1,
          tf: 10.7,
          idealisation: 'solid',
        },
      },
      paths: iSolidPaths(300 * M, 150 * M, 7.1 * M, 10.7 * M),
    },
    {
      name: 'i-symmetric thin-walled (IPE-300-Masse)',
      cs: {
        kind: 'shape',
        id: 'i',
        shape: {
          kind: 'i-symmetric',
          h: 300,
          b: 150,
          tw: 7.1,
          tf: 10.7,
          idealisation: 'thin-walled',
        },
      },
      paths: iThinPaths(300 * M, 150 * M, 7.1 * M, 10.7 * M),
    },
    {
      name: 't-section solid (breiter Gurt)',
      cs: {
        kind: 'shape',
        id: 't',
        shape: {
          kind: 't-section',
          bf: 2000,
          hf: 200,
          bw: 250,
          h: 500,
          idealisation: 'solid',
        },
      },
      paths: tSolidPaths(2000 * M, 200 * M, 250 * M, 500 * M, T_ZS * M),
    },
    {
      name: 't-section thin-walled (breiter Gurt)',
      cs: {
        kind: 'shape',
        id: 't',
        shape: {
          kind: 't-section',
          bf: 2000,
          hf: 200,
          bw: 250,
          h: 500,
          idealisation: 'thin-walled',
        },
      },
      paths: tThinPaths(2000 * M, 200 * M, 250 * M, 500 * M),
    },
  ];

  for (const { name, cs, paths } of cases) {
    it(`${name}: kappaY und kappaZ treffen die Quadratur`, () => {
      const p = values(cs);
      const kappaZ = shearAreaNumeric(p.Iy, paths.z) / p.A;
      const kappaY = shearAreaNumeric(p.Iz, paths.y) / p.A;
      expect(p.kappaZ as number).toBeCloseTo(kappaZ, 6);
      expect(p.kappaY as number).toBeCloseTo(kappaY, 6);
    });
  }

  it('schliesst jeder VOLLSTAENDIGE Weg auf S = 0', () => {
    // Das erste Flaechenmoment um den Schwerpunkt verschwindet. Ein Weg, der
    // nicht auf null zurueckkommt, hat einen Abschnitt zu viel, zu wenig oder
    // an der falschen Stelle — und kappa waere trotzdem eine plausible Zahl.
    //
    // Geprueft werden nur die Aeste, die den Querschnitt ganz durchlaufen:
    // ein Gurtast eines verzweigten Weges endet an der Verzweigung und soll
    // dort gerade NICHT null sein.
    const complete: { name: string; branches: readonly OracleBranch[] }[] = [
      { name: 'rectangle z', branches: rectanglePaths(200 * M, 500 * M).z },
      { name: 'rectangle y', branches: rectanglePaths(200 * M, 500 * M).y },
      { name: 'box solid z', branches: boxSolidPaths(300 * M, 500 * M, 20 * M).z },
      { name: 'box solid y', branches: boxSolidPaths(300 * M, 500 * M, 20 * M).y },
      { name: 'box thin z', branches: boxThinPaths(300 * M, 500 * M, 20 * M).z },
      { name: 'box thin y', branches: boxThinPaths(300 * M, 500 * M, 20 * M).y },
      { name: 'i solid z', branches: iSolidPaths(300 * M, 150 * M, 7.1 * M, 10.7 * M).z },
      { name: 'i solid y', branches: iSolidPaths(300 * M, 150 * M, 7.1 * M, 10.7 * M).y },
      { name: 'i thin y', branches: iThinPaths(300 * M, 150 * M, 7.1 * M, 10.7 * M).y },
      { name: 't solid z', branches: tSolidPaths(2000 * M, 200 * M, 250 * M, 500 * M, T_ZS * M).z },
      { name: 't solid y', branches: tSolidPaths(2000 * M, 200 * M, 250 * M, 500 * M, T_ZS * M).y },
      { name: 't thin y', branches: tThinPaths(2000 * M, 200 * M, 250 * M, 500 * M).y },
      // Der Steg des duennwandigen T: er erbt beide Gurthaelften und laeuft
      // bis zum freien Ende. Dass er auf null schliesst, haengt daran, dass
      // `S` um den Schwerpunkt des WANDMODELLS gerechnet wird — mit dem
      // Schwerpunkt der Umrissfigur bliebe ein Rest stehen.
      { name: 't thin z (Steg)', branches: [tThinPaths(2000 * M, 200 * M, 250 * M, 500 * M).z[2]] },
    ];

    for (const { name, branches } of complete) {
      const { endMoments } = shearIntegralNumeric(branches);
      for (const [i, S] of endMoments.entries()) {
        expect(Math.abs(S), `${name} / Ast ${i}`).toBeLessThan(1e-9);
      }
    }
  });
});

describe('kappa: die Idealisierung ist wirksam und einseitig', () => {
  // Dieselben vier Abmessungen, zwei kappa. 18 % Unterschied, dem Ergebnis
  // nicht anzusehen — deshalb ist `idealisation` ein Pflichtfeld ohne Default.
  const dims = { h: 80, b: 46, tw: 3.8, tf: 5.2 } as const;
  const kappaZ = (idealisation: 'solid' | 'thin-walled') =>
    values({
      kind: 'shape',
      id: 'i',
      shape: { kind: 'i-symmetric', ...dims, idealisation },
    }).kappaZ as number;

  const CATALOGUE = 2.69 / 7.64; // Az/A von IPE 80 = 0,352
  const EC3 = 3.57 / 7.64; // Av,z/A = 0,467 — der falsche Wert

  it('liefert thin-walled 0,340 und solid 0,401', () => {
    expect(kappaZ('thin-walled')).toBeCloseTo(0.34, 3);
    expect(kappaZ('solid')).toBeCloseTo(0.401, 3);
  });

  it('legt thin-walled UNTER den Katalogwert — die fehlende Ausrundung', () => {
    expect(kappaZ('thin-walled')).toBeLessThan(CATALOGUE);
    expect(kappaZ('solid')).toBeGreaterThan(CATALOGUE);
  });

  it('kommt keiner der beiden in die Naehe von Av,z/A', () => {
    // Kaeme einer nahe an 0,467, stuende die EC3-Formel im Code.
    expect(EC3).toBeCloseTo(0.467, 3);
    expect(kappaZ('thin-walled')).toBeLessThan(0.44);
    expect(kappaZ('solid')).toBeLessThan(0.44);
  });
});

describe('kappa gegen den ganzen Katalog', () => {
  // Kein Toleranztest, sondern der Nachweis, dass wir DIESELBE Definition
  // rechnen wie die Katalogdefinition und die Restluecke die Ausrundung ist: das fehlende
  // Material sitzt am Steg-Gurt-Uebergang und traegt fuer Vz viel, fuer Vy
  // fast nichts. Genau dieses Muster steht in den Zahlen, ueber alle 42
  // Profile gleichgerichtet.
  // Die Abmessungen reisen UNVERAENDERT aus der Tabelle in die Form: beide
  // fuehren Millimeter. Vorher stand hier viermal `/ 1000`.
  const shearAreas = (h: number, b: number, tw: number, tf: number) => {
    const p = values({
      kind: 'shape',
      id: 'i',
      shape: { kind: 'i-symmetric', h, b, tw, tf, idealisation: 'thin-walled' },
    });
    // Zurueck nach cm2, um gegen den Katalog zu vergleichen.
    return {
      Ay: ((p.kappaY as number) * p.A) / CM2_TO_M2,
      Az: ((p.kappaZ as number) * p.A) / CM2_TO_M2,
    };
  };

  it('trifft Ay auf 1,2 %', () => {
    for (const series of ['IPE', 'HEA'] as const) {
      for (const profile of profilesIn(series)) {
        const { Ay } = shearAreas(profile.h, profile.b, profile.tw, profile.tf);
        const deviation = (Ay - (profile.Ay as number)) / (profile.Ay as number);
        expect(Math.abs(deviation), `${profile.id}: Ay ${Ay.toFixed(3)}`).toBeLessThan(
          0.012,
        );
      }
    }
  });

  it('trifft Az auf 6,5 % — und liegt IMMER zu klein', () => {
    for (const series of ['IPE', 'HEA'] as const) {
      for (const profile of profilesIn(series)) {
        const { Az } = shearAreas(profile.h, profile.b, profile.tw, profile.tf);
        const deviation = (Az - (profile.Az as number)) / (profile.Az as number);
        expect(deviation, `${profile.id}: Az ${Az.toFixed(3)}`).toBeLessThan(0);
        expect(deviation, `${profile.id}: Az ${Az.toFixed(3)}`).toBeGreaterThan(
          -0.065,
        );
      }
    }
  });
});
