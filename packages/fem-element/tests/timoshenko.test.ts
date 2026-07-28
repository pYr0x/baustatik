import { describe, expect, it } from 'vitest';
import {
  BackwardsLoadSegmentError,
  InvalidElementInputError,
  InvalidShearStiffnessError,
  LoadOutsideElementError,
} from '../src/errors';
import { shapeFunctionsAt } from '../src/shape-functions';
import { Timoshenko2D, Timoshenko2DIntegrated } from '../src/timoshenko';
import type { LocalElementLoad, SectionProperties } from '../src/types';
import {
  assembleChain,
  chainResidual,
  fullSpanLoad,
  solveChain,
} from './references/chain';
import { ebConsistentLoad, ebStiffness } from './references/euler-bernoulli';
import {
  dot,
  expectClose,
  expectThreeRigidBodyModes,
  matVec,
  rectangleProps,
  reverseNodes,
  solve2,
  toDense,
} from './helpers';

const L = 3;
const shear: SectionProperties = { EA: 1e5, EI: 2e4, GAs: 5e4 };
const rigid: SectionProperties = { EA: 1e5, EI: 2e4, GAs: 'rigid' };
/** phi = 12*EI/(GAs*L^2) = 12*2e4/(5e4*9). */
const PHI = (12 * shear.EI) / (5e4 * L * L);

const noLoad: LocalElementLoad = { segments: [], points: [] };

describe('Timoshenko2D: phi-Normalisierung', () => {
  it('bildet schubstarr auf phi = 0 ab ("rigid" wie Infinity)', () => {
    const eb = (12 * rigid.EI) / L ** 3;
    for (const GAs of ['rigid', Number.POSITIVE_INFINITY] as const) {
      const K = Timoshenko2D.prepare({ ...rigid, GAs }, L).stiffness();
      expectClose(K[1][1], eb);
    }
  });

  it('rechnet phi = 12*EI/(GAs*L^2) fuer endliches GAs', () => {
    const K = Timoshenko2D.prepare(shear, L).stiffness();
    expectClose(K[1][1], (12 * shear.EI) / (L ** 3 * (1 + PHI)));
    // Der Schub macht das Element weicher, nie steifer.
    expect(K[1][1]).toBeLessThan((12 * shear.EI) / L ** 3);
  });

  it('lehnt unzulaessige GAs ab', () => {
    for (const GAs of [Number.NaN, 0, -1, Number.NEGATIVE_INFINITY]) {
      expect(() => Timoshenko2D.prepare({ ...shear, GAs }, L)).toThrow(
        InvalidShearStiffnessError,
      );
      expect(() => Timoshenko2D.prepare({ ...shear, GAs }, L)).toThrow(/GAs/);
    }
  });

  it('lehnt ein GAs ab, dessen phi ueberlaeuft', () => {
    // GAs ist positiv und damit formal zulaessig, aber GAs*L^2 unterlaeuft:
    // phi wird Infinity und wuerde als Infinity*0 NaN in K UND in die
    // Ansatzfunktionen tragen — weit weg von der Ursache erst im Solver.
    expect(() =>
      Timoshenko2D.prepare({ EA: 1, EI: 1, GAs: Number.MIN_VALUE }, 1),
    ).toThrow(InvalidShearStiffnessError);
    expect(() =>
      Timoshenko2D.prepare({ EA: 1, EI: 1, GAs: Number.MIN_VALUE }, 1),
    ).toThrow(/phi/);
  });

  it('lehnt unzulaessige L, EA, EI ab', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => Timoshenko2D.prepare(shear, bad)).toThrow(
        InvalidElementInputError,
      );
      expect(() => Timoshenko2D.prepare(shear, bad)).toThrow(/L/);
      expect(() => Timoshenko2D.prepare({ ...shear, EA: bad }, L)).toThrow(
        /EA/,
      );
      expect(() => Timoshenko2D.prepare({ ...shear, EI: bad }, L)).toThrow(
        /EI/,
      );
    }
  });
});

describe('Timoshenko2D: geschlossene Steifigkeit', () => {
  it('faellt bei phi = 0 FP-EXAKT auf die EB-Referenz', () => {
    const K = Timoshenko2D.prepare(rigid, L).stiffness();
    const ref = ebStiffness(rigid, L);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        // Bewusst toBe (Object.is) statt toBeCloseTo: der Grenzfall ist exakt,
        // nicht naeherungsweise — das ist der staerkste Validierungsanker.
        expect(K[i][j]).toBe(ref[i][j]);
      }
    }
  });

  it('ist symmetrisch (phi > 0)', () => {
    const K = Timoshenko2D.prepare(shear, L).stiffness();
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expectClose(K[i][j], K[j][i]);
      }
    }
  });

  it('hat genau die drei Starrkoerpermoden (phi > 0)', () => {
    const K = Timoshenko2D.prepare(shear, L).stiffness();
    const modes = [
      [1, 0, 0, 1, 0, 0], // Translation x
      [0, 1, 0, 0, 1, 0], // Translation z
      [0, 0, 1, 0, L, 1], // Starre Drehung (w = theta*x)
    ];
    for (const r of modes) {
      for (const c of matVec(K, r)) {
        expect(Math.abs(c)).toBeLessThan(1e-6);
      }
    }
  });

  it('hat GENAU drei Nulleigenwerte (Rangtest, phi = 0 und phi > 0)', () => {
    // Der Test darueber zeigt, WELCHE Moden null sind; dieser, dass es keine
    // weiteren gibt — sonst haette das Element einen inneren Mechanismus.
    for (const props of [rigid, shear]) {
      const K = Timoshenko2D.prepare(props, L).stiffness();
      expectThreeRigidBodyModes(toDense(K));
    }
  });

  it('ist invariant unter Knotenvertauschung (phi > 0)', () => {
    const K = Timoshenko2D.prepare(shear, L).stiffness();
    const rotated = reverseNodes(toDense(K));
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expectClose(rotated[i][j], K[i][j]);
      }
    }
  });
});

describe('Timoshenko2DIntegrated: K aus den Ansatzfunktionen', () => {
  it('stimmt bei phi > 0 mit der geschlossenen Formel ueberein', () => {
    const a = Timoshenko2D.prepare(shear, L).stiffness();
    const b = Timoshenko2DIntegrated.prepare(shear, L).stiffness();
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expectClose(b[i][j], a[i][j], 1e-12);
      }
    }
  });

  it('trifft bei phi = 0 die EB-Referenz (uebersprungener Schubterm)', () => {
    const K = Timoshenko2DIntegrated.prepare(rigid, L).stiffness();
    const ref = ebStiffness(rigid, L);
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        // Nur "nahe", nicht bitweise: Gauss ueber Hermite ist mathematisch
        // exakt, aber nicht dieselbe Gleitkomma-Operationsfolge.
        expectClose(K[i][j], ref[i][j], 1e-12);
      }
    }
  });

  it('hat ebenfalls GENAU drei Nulleigenwerte (Rangtest)', () => {
    // Die Integration darf keinen zusaetzlichen Mechanismus einschleppen —
    // reduzierte Integration des Schubterms taete genau das.
    for (const props of [rigid, shear]) {
      const K = Timoshenko2DIntegrated.prepare(props, L).stiffness();
      expectThreeRigidBodyModes(toDense(K));
    }
  });

  it('liefert denselben Lastvektor wie die geschlossene Variante', () => {
    const load = fullSpanLoad(L, { qz: 4, my: 1.5 });
    const a = Timoshenko2D.prepare(shear, L).withLoad(load).consistentLoad();
    const b = Timoshenko2DIntegrated.prepare(shear, L).withLoad(load).consistentLoad();
    for (let i = 0; i < 6; i++) expectClose(b[i], a[i], 1e-14);
  });
});

describe('Timoshenko2D: Ansatzfunktionen', () => {
  it('geht bei phi = 0 in Hermite ueber (Nw) bzw. deren Ableitung (Ntheta)', () => {
    const el = Timoshenko2D.prepare(rigid, L);
    for (const xi of [0, 0.25, 0.5, 0.9, 1]) {
      const { Nw, Ntheta } = el.shapeFunctions(xi * L);
      const xi2 = xi * xi;
      const xi3 = xi2 * xi;

      expectClose(Nw[1], 1 - 3 * xi2 + 2 * xi3);
      expectClose(Nw[2], L * (xi - 2 * xi2 + xi3));
      expectClose(Nw[4], 3 * xi2 - 2 * xi3);
      expectClose(Nw[5], L * (-xi2 + xi3));

      expectClose(Ntheta[1], (6 / L) * (xi2 - xi));
      expectClose(Ntheta[2], 1 - 4 * xi + 3 * xi2);
      expectClose(Ntheta[4], (6 / L) * (xi - xi2));
      expectClose(Ntheta[5], -2 * xi + 3 * xi2);
    }
  });

  it('gibt Starrkoerperbewegungen fuer jedes phi exakt wieder', () => {
    for (const props of [rigid, shear]) {
      const el = Timoshenko2D.prepare(props, L);
      const translation = [0, 1, 0, 0, 1, 0];
      const rotation = [0, 0, 1, 0, L, 1]; // w = x, theta = 1

      for (const xi of [0, 0.3, 0.75, 1]) {
        const x = xi * L;
        const { Nu, Nw, Ntheta } = el.shapeFunctions(x);

        expectClose(dot(Nw, translation), 1);
        expectClose(dot(Ntheta, translation), 0);
        expectClose(dot(Nw, rotation), x);
        expectClose(dot(Ntheta, rotation), 1);
        expectClose(dot(Nu, [1, 0, 0, 1, 0, 0]), 1);
      }
    }
  });

  it('haelt die Schubverzerrung gamma = dw/dx - theta konstant (IIE)', () => {
    const d = [0.3, -1.2, 0.05, 0.8, 2.4, -0.11];
    const gammas = [0, 0.2, 0.5, 0.85, 1].map((xi) => {
      const n = shapeFunctionsAt(xi * L, L, PHI);
      return dot(n.dNw, d) - dot(n.Ntheta, d);
    });
    for (const g of gammas) expectClose(g, gammas[0], 1e-12);
    // Bei phi > 0 ist gamma ungleich null, sonst waere der Test wertlos.
    expect(Math.abs(gammas[0])).toBeGreaterThan(1e-6);
  });
});

describe('Timoshenko2D: konsistenter Lastvektor', () => {
  it('deckt sich bei phi = 0 mit der EB-Referenz', () => {
    const load: LocalElementLoad = {
      segments: [
        { from: 0, to: L, qx1: 2, qx2: 5, qz1: 3, qz2: -1, my1: 1.5, my2: 4 },
      ],
      points: [
        { a: 0.7, px: 3, pz: -2, my: 1.1 },
        { a: L, px: 0, pz: 4, my: 0 },
      ],
    };
    const got = Timoshenko2D.prepare(rigid, L).withLoad(load).consistentLoad();
    const ref = ebConsistentLoad(load, rigid, L);
    for (let i = 0; i < 6; i++) expectClose(got[i], ref[i], 1e-12);
  });

  it('ist partitionsinvariant: ein Segment === zwei Teilsegmente', () => {
    const el = Timoshenko2D.prepare(shear, L);
    const a = 1.1;
    const at = (x: number, v1: number, v2: number) =>
      v1 + ((v2 - v1) * x) / L;
    const whole = el.withLoad({
      segments: [
        { from: 0, to: L, qx1: 2, qx2: 5, qz1: 3, qz2: -1, my1: 1.5, my2: 4 },
      ],
      points: [],
    }).consistentLoad();
    const split = el.withLoad({
      segments: [
        {
          from: 0,
          to: a,
          qx1: 2,
          qx2: at(a, 2, 5),
          qz1: 3,
          qz2: at(a, 3, -1),
          my1: 1.5,
          my2: at(a, 1.5, 4),
        },
        {
          from: a,
          to: L,
          qx1: at(a, 2, 5),
          qx2: 5,
          qz1: at(a, 3, -1),
          qz2: -1,
          my1: at(a, 1.5, 4),
          my2: 4,
        },
      ],
      points: [],
    }).consistentLoad();
    for (let i = 0; i < 6; i++) expectClose(split[i], whole[i], 1e-12);
  });

  it('ist arbeitsaequivalent zur aufgebrachten Last (Teilsegment + Punkte)', () => {
    const load: LocalElementLoad = {
      segments: [
        { from: 0.4, to: 2.2, qx1: 2, qx2: 2, qz1: 0, qz2: 6, my1: 3, my2: 3 },
      ],
      points: [{ a: 1, px: 1.5, pz: 7, my: 2.5 }],
    };
    const f = Timoshenko2D.prepare(shear, L).withLoad(load).consistentLoad();
    const [seg] = load.segments;
    const span = seg.to - seg.from;
    const xm = (seg.from + seg.to) / 2;

    // Axiale Translation: Summe = aufgebrachte Laengskraft.
    expectClose(f[0] + f[3], seg.qx1 * span + 1.5);
    // Quer-Translation: Summe = aufgebrachte Querkraft (my traegt nichts bei).
    expectClose(f[1] + f[4], ((seg.qz1 + seg.qz2) / 2) * span + 7);
    // Starre Drehung w = x, theta = 1: Arbeit = Gesamtmoment um Knoten 1.
    const qzMoment =
      ((seg.qz1 + seg.qz2) / 2) * span * xm +
      ((seg.qz2 - seg.qz1) / 2) * span * (span / 6);
    expectClose(f[2] + L * f[4] + f[5], qzMoment + seg.my1 * span + 7 * 1 + 2.5);
  });

  it('liefert fuer konstantes qz das phi-unabhaengige Handbuch-Ergebnis', () => {
    const q = 4;
    const load = fullSpanLoad(L, { qz: q });
    for (const props of [rigid, shear]) {
      const f = Timoshenko2D.prepare(props, L).withLoad(load).consistentLoad();
      expectClose(f[1], (q * L) / 2, 1e-12);
      expectClose(f[2], (q * L ** 2) / 12, 1e-12);
      expectClose(f[4], (q * L) / 2, 1e-12);
      expectClose(f[5], -(q * L ** 2) / 12, 1e-12);
    }
  });

  it('bildet ein Knoten-Einzelmoment auf ein reines Knotenmoment ab', () => {
    // Ntheta ist an den Knoten die Einheitsmatrix-Zeile: ein Moment genau am
    // Knoten darf NUR den Momenten-Freiheitsgrad belasten. Mit Nw' gewichtet
    // entstuenden hier Querkraft-Anteile ~ phi/(1+phi) — physikalisch Unsinn.
    const el = Timoshenko2D.prepare(shear, L);
    const M = 3.5;

    const atStart = el.withLoad({
      segments: [],
      points: [{ a: 0, px: 0, pz: 0, my: M }],
    }).consistentLoad();
    const atEnd = el.withLoad({
      segments: [],
      points: [{ a: L, px: 0, pz: 0, my: M }],
    }).consistentLoad();

    for (const [got, want] of [
      [atStart, [0, 0, M, 0, 0, 0]],
      [atEnd, [0, 0, 0, 0, 0, M]],
    ] as const) {
      for (let i = 0; i < 6; i++) expectClose(got[i], want[i], 1e-12);
    }
  });

  it('lehnt Lasten ausserhalb des Elements ab', () => {
    const el = Timoshenko2D.prepare(shear, L);
    expect(() =>
      el.withLoad({
        segments: [
          {
            from: 0,
            to: L + 0.5,
            qx1: 0,
            qx2: 0,
            qz1: 1,
            qz2: 1,
            my1: 0,
            my2: 0,
          },
        ],
        points: [],
      }).consistentLoad(),
    ).toThrow(LoadOutsideElementError);
    expect(() =>
      el.withLoad({ segments: [], points: [{ a: -0.1, px: 0, pz: 1, my: 0 }] }).consistentLoad(),
    ).toThrow(/Einzellast/);
    expect(() =>
      el.withLoad({
        segments: [
          { from: 2, to: 1, qx1: 0, qx2: 0, qz1: 1, qz2: 1, my1: 0, my2: 0 },
        ],
        points: [],
      }).consistentLoad(),
    ).toThrow(BackwardsLoadSegmentError);
  });

  // Die Lagetoleranz ist RELATIV zu L. Absolut waere sie ab L > 1 schaerfer als
  // das Tor davor (`fem-loads/src/validate.ts` prueft relativ), und es gaebe ein
  // Band, das die Validierung passiert und hier wirft. Dieser Test haelt das
  // fest; ein langer Stab macht den Unterschied ueberhaupt erst sichtbar.
  it('bezieht die Lagetoleranz auf die Stablaenge', () => {
    const longL = 1000;
    const el = Timoshenko2D.prepare(shear, longL);

    // 1e-7 ist absolut groesser als 1e-9, relativ aber weit innerhalb
    // 1e-9 * 1000 = 1e-6. Vor der Umstellung haette das geworfen.
    expect(() =>
      el.withLoad({
        segments: [],
        points: [{ a: longL + 1e-7, px: 0, pz: 1, my: 0 }],
      }).consistentLoad(),
    ).not.toThrow();

    // Ein echter Bereichsfehler faellt weiterhin durch.
    expect(() =>
      el.withLoad({
        segments: [],
        points: [{ a: longL + 1e-3, px: 0, pz: 1, my: 0 }],
      }).consistentLoad(),
    ).toThrow(LoadOutsideElementError);
  });

  it('ignoriert entartete Segmente (from === to) ohne Division durch null', () => {
    const f = Timoshenko2D.prepare(shear, L).withLoad({
      segments: [
        { from: 1, to: 1, qx1: 9, qx2: 9, qz1: 9, qz2: 9, my1: 9, my2: 9 },
      ],
      points: [],
    }).consistentLoad();
    for (const v of f) expect(v).toBe(0);
  });
});

describe('Timoshenko2D: Kragarm und Locking', () => {
  /** Freies Ende eines Kragarms: DOF 4 (w2) und 5 (theta2). */
  function tipDeflection(props: SectionProperties, Le: number, P: number) {
    const K = Timoshenko2D.prepare(props, Le).stiffness();
    return solve2(K[4][4], K[4][5], K[5][4], K[5][5], P, 0).x;
  }

  it('zeigt den Schubanteil: w(L) = PL^3/(3EI) + PL/S', () => {
    const P = 10;
    const w = tipDeflection(shear, L, P);
    const exact = (P * L ** 3) / (3 * shear.EI) + (P * L) / (shear.GAs as number);
    expectClose(w, exact, 1e-12);
    // Der Schubterm muss sichtbar sein, nicht bloss numerisches Rauschen.
    expect(w).toBeGreaterThan((P * L ** 3) / (3 * shear.EI) * 1.0001);
  });

  it('lockt bei keiner Schlankheit L/h (5 ... 1000)', () => {
    const h = 0.1;
    const P = 1;
    for (const slenderness of [5, 10, 20, 100, 1000]) {
      const Le = slenderness * h;
      const props = rectangleProps(0.05, h, 3e7);
      const w = tipDeflection(props, Le, P);
      const exact =
        (P * Le ** 3) / (3 * props.EI) + (P * Le) / (props.GAs as number);
      expect(Math.abs(w / exact - 1)).toBeLessThan(1e-12);
    }
  });
});

describe('Timoshenko2D: Vergleich gegen feinere Diskretisierung', () => {
  const chainProps = shear;

  function cantileverTip(n: number, load: (Le: number) => LocalElementLoad) {
    const Le = L / n;
    const lengths = new Array(n).fill(Le);
    const chain = assembleChain(
      Timoshenko2D,
      chainProps,
      lengths,
      lengths.map(() => load(Le)),
    );
    const d = solveChain(chain, [0, 1, 2]);
    return { w: d[3 * n + 1], theta: d[3 * n + 2] };
  }

  it('verteiltes Moment: trifft die geschlossene Loesung (Ntheta-Gewichtung)', () => {
    const m = 2.5;
    const one = cantileverTip(1, (Le) => fullSpanLoad(Le, { my: m }));
    const many = cantileverTip(8, (Le) => fullSpanLoad(Le, { my: m }));

    // DER Diskriminator zwischen Ntheta und Nw'. Aus dem Energiefunktional
    // (ein Moment leistet Arbeit an theta, nicht an w'):
    //   V = 0 ueberall -> gamma = 0, M(x) = m*(L-x)
    //   theta(L) = m*L^2/(2*EI),  w(L) = m*L^3/(3*EI)
    // Der Schub faellt heraus, weil die Querkraft verschwindet. Mit Nw'
    // gewichtet kaeme w(L) um Faktor ~1.13 zu gross heraus.
    expectClose(one.w, (m * L ** 3) / (3 * chainProps.EI), 1e-12);
    expectClose(one.theta, (m * L ** 2) / (2 * chainProps.EI), 1e-12);

    // Zusaetzlich nodal exakt: Verfeinerung aendert nichts.
    expectClose(many.w, one.w, 1e-10);
    expectClose(many.theta, one.theta, 1e-10);
  });

  it('Gleichlast: ein Element === acht Elemente (nodale Exaktheit)', () => {
    const q = 4;
    const one = cantileverTip(1, (Le) => fullSpanLoad(Le, { qz: q }));
    const many = cantileverTip(8, (Le) => fullSpanLoad(Le, { qz: q }));
    expectClose(many.w, one.w, 1e-10);
    expectClose(many.theta, one.theta, 1e-10);
    // Gegenprobe gegen die geschlossene Timoshenko-Loesung.
    const exact =
      (q * L ** 4) / (8 * chainProps.EI) +
      (q * L ** 2) / (2 * (chainProps.GAs as number));
    expectClose(one.w, exact, 1e-12);
  });

  it('Patch-Test: konstante Kruemmung und Dehnung ueber ungleiche Elemente', () => {
    const lengths = [1, 2.5, 1.7];
    const chain = assembleChain(Timoshenko2D, chainProps, lengths);
    const kappa = 0.01;
    const eps = 0.002;

    // Exaktes Feld: u = eps*x, w = kappa*x^2/2, theta = w' = kappa*x.
    // gamma = w' - theta = 0, Kruemmung theta' = kappa (konstant).
    const d: number[] = [];
    let x = 0;
    for (let i = 0; i <= lengths.length; i++) {
      d.push(eps * x, (kappa * x * x) / 2, kappa * x);
      x += lengths[i] ?? 0;
    }

    const r = chainResidual(chain, d);
    const scale = Math.max(...r.map(Math.abs));
    // An den inneren Knoten greift keine Last an -> Residuum muss 0 sein.
    for (const i of [3, 4, 5, 6, 7, 8]) {
      expect(Math.abs(r[i])).toBeLessThan(1e-9 * scale);
    }
    expect(scale).toBeGreaterThan(1);
  });
});

