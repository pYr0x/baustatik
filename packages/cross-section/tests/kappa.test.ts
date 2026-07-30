import { profilesIn } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import type { SectionProperties } from '../src/index';
import { type CrossSection, sectionProperties } from '../src/index';
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

// ---------------------------------------------------------------------------
// Die Wege, unabhaengig noch einmal hingeschrieben — Eingabe fuer das Orakel.
// ---------------------------------------------------------------------------

/** Eine Bandfolge laengs der Schubrichtung als EIN Ast. */
function bandBranch(
  start: number,
  bands: readonly { extent: number; width: number }[],
): OracleBranch {
  return {
    S0: 0,
    pieces: bands.map((band, i) => {
      const offset = bands
        .slice(0, i)
        .reduce((sum, b) => sum + b.extent, start);
      return alongPiece(offset, band.extent, band.width);
    }),
  };
}

const rectanglePaths = (b: number, h: number) => ({
  z: [bandBranch(-h / 2, [{ extent: h, width: b }])],
  y: [bandBranch(-b / 2, [{ extent: b, width: h }])],
});

const iSolidPaths = (h: number, b: number, tw: number, tf: number) => {
  const hw = h - 2 * tf;
  return {
    z: [
      bandBranch(-h / 2, [
        { extent: tf, width: b },
        { extent: hw, width: tw },
        { extent: tf, width: b },
      ]),
    ],
    y: [
      bandBranch(-b / 2, [
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
      bandBranch(-b / 2, [{ extent: b, width: tf }]),
      bandBranch(-b / 2, [{ extent: b, width: tf }]),
    ],
  };
};

const boxSolidPaths = (b: number, h: number, t: number) => ({
  z: [
    bandBranch(-h / 2, [
      { extent: t, width: b },
      { extent: h - 2 * t, width: 2 * t },
      { extent: t, width: b },
    ]),
  ],
  y: [
    bandBranch(-b / 2, [
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
 */
function boxHalf(across: number, along: number, t: number): OracleBranch {
  const arm = along / 2;
  return {
    S0: 0,
    pieces: [
      acrossPiece(-arm, across / 2, t),
      alongPiece(-arm, along, t),
      acrossPiece(arm, across / 2, t),
    ],
  };
}

const boxThinPaths = (b: number, h: number, t: number) => ({
  z: [boxHalf(b - t, h - t, t), boxHalf(b - t, h - t, t)],
  y: [boxHalf(h - t, b - t, t), boxHalf(h - t, b - t, t)],
});

const tSolidPaths = (
  bf: number,
  hf: number,
  bw: number,
  h: number,
  zs: number,
) => ({
  z: [
    bandBranch(-zs, [
      { extent: hf, width: bf },
      { extent: h - hf, width: bw },
    ]),
  ],
  y: [
    bandBranch(-bf / 2, [
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
    y: [bandBranch(-bf / 2, [{ extent: bf, width: hf }])],
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
      name: 'rectangle 0,2 x 0,5',
      cs: { kind: 'shape', id: 'r', shape: { kind: 'rectangle', b: 0.2, h: 0.5 } },
      paths: rectanglePaths(0.2, 0.5),
    },
    {
      name: 'hollow-rectangle solid 0,3 x 0,5 x 0,02',
      cs: {
        kind: 'shape',
        id: 'b',
        shape: {
          kind: 'hollow-rectangle',
          b: 0.3,
          h: 0.5,
          t: 0.02,
          idealisation: 'solid',
        },
      },
      paths: boxSolidPaths(0.3, 0.5, 0.02),
    },
    {
      name: 'hollow-rectangle thin-walled 0,3 x 0,5 x 0,02',
      cs: {
        kind: 'shape',
        id: 'b',
        shape: {
          kind: 'hollow-rectangle',
          b: 0.3,
          h: 0.5,
          t: 0.02,
          idealisation: 'thin-walled',
        },
      },
      paths: boxThinPaths(0.3, 0.5, 0.02),
    },
    {
      name: 'i-symmetric solid (IPE-300-Masse)',
      cs: {
        kind: 'shape',
        id: 'i',
        shape: {
          kind: 'i-symmetric',
          h: 0.3,
          b: 0.15,
          tw: 0.0071,
          tf: 0.0107,
          idealisation: 'solid',
        },
      },
      paths: iSolidPaths(0.3, 0.15, 0.0071, 0.0107),
    },
    {
      name: 'i-symmetric thin-walled (IPE-300-Masse)',
      cs: {
        kind: 'shape',
        id: 'i',
        shape: {
          kind: 'i-symmetric',
          h: 0.3,
          b: 0.15,
          tw: 0.0071,
          tf: 0.0107,
          idealisation: 'thin-walled',
        },
      },
      paths: iThinPaths(0.3, 0.15, 0.0071, 0.0107),
    },
    {
      name: 't-beam solid (breiter Gurt)',
      cs: {
        kind: 'shape',
        id: 't',
        shape: {
          kind: 't-beam',
          bf: 2.0,
          hf: 0.2,
          bw: 0.25,
          h: 0.5,
          idealisation: 'solid',
        },
      },
      paths: tSolidPaths(2.0, 0.2, 0.25, 0.5, 0.06625 / 0.475),
    },
    {
      name: 't-beam thin-walled (breiter Gurt)',
      cs: {
        kind: 'shape',
        id: 't',
        shape: {
          kind: 't-beam',
          bf: 2.0,
          hf: 0.2,
          bw: 0.25,
          h: 0.5,
          idealisation: 'thin-walled',
        },
      },
      paths: tThinPaths(2.0, 0.2, 0.25, 0.5),
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
      { name: 'rectangle z', branches: rectanglePaths(0.2, 0.5).z },
      { name: 'rectangle y', branches: rectanglePaths(0.2, 0.5).y },
      { name: 'box solid z', branches: boxSolidPaths(0.3, 0.5, 0.02).z },
      { name: 'box solid y', branches: boxSolidPaths(0.3, 0.5, 0.02).y },
      { name: 'box thin z', branches: boxThinPaths(0.3, 0.5, 0.02).z },
      { name: 'box thin y', branches: boxThinPaths(0.3, 0.5, 0.02).y },
      { name: 'i solid z', branches: iSolidPaths(0.3, 0.15, 0.0071, 0.0107).z },
      { name: 'i solid y', branches: iSolidPaths(0.3, 0.15, 0.0071, 0.0107).y },
      { name: 'i thin y', branches: iThinPaths(0.3, 0.15, 0.0071, 0.0107).y },
      { name: 't solid z', branches: tSolidPaths(2, 0.2, 0.25, 0.5, 0.06625 / 0.475).z },
      { name: 't solid y', branches: tSolidPaths(2, 0.2, 0.25, 0.5, 0.06625 / 0.475).y },
      { name: 't thin y', branches: tThinPaths(2, 0.2, 0.25, 0.5).y },
      // Der Steg des duennwandigen T: er erbt beide Gurthaelften und laeuft
      // bis zum freien Ende. Dass er auf null schliesst, haengt daran, dass
      // `S` um den Schwerpunkt des WANDMODELLS gerechnet wird — mit dem
      // Schwerpunkt der Umrissfigur bliebe ein Rest stehen.
      { name: 't thin z (Steg)', branches: [tThinPaths(2, 0.2, 0.25, 0.5).z[2]] },
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
  const dims = { h: 0.08, b: 0.046, tw: 0.0038, tf: 0.0052 } as const;
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
  // rechnen wie RSTAB und die Restluecke die Ausrundung ist: das fehlende
  // Material sitzt am Steg-Gurt-Uebergang und traegt fuer Vz viel, fuer Vy
  // fast nichts. Genau dieses Muster steht in den Zahlen, ueber alle 42
  // Profile gleichgerichtet.
  const shearAreas = (h: number, b: number, tw: number, tf: number) => {
    const p = values({
      kind: 'shape',
      id: 'i',
      shape: {
        kind: 'i-symmetric',
        h: h / 1000,
        b: b / 1000,
        tw: tw / 1000,
        tf: tf / 1000,
        idealisation: 'thin-walled',
      },
    });
    // cm2, wie im Katalog.
    return {
      Ay: (p.kappaY as number) * p.A * 1e4,
      Az: (p.kappaZ as number) * p.A * 1e4,
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
