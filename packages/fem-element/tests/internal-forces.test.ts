/**
 * Die Anker der Schnittgroessen-Rekonstruktion.
 *
 * ZWEI SORTEN, und beide werden gebraucht:
 *
 *   GESCHLOSSENE LOESUNGEN — Kragarm, Einfeldtraeger, beidseitig eingespannt.
 *   Sie pruefen die ZAHL. Der beidseitig eingespannte Traeger ist dabei der
 *   entscheidende: dort sind alle Knotenfreiheitsgrade null, und der
 *   Stoffgesetz-Weg (`M = EI * theta'` aus den Ansatzfunktionen) liefert
 *   `M == 0` statt `-qL^2/12`. Er ist der Testfall, an dem sich ADR 0018
 *   entscheidet.
 *
 *   STRUKTURELLE ANKER — Randidentitaeten, Gelenke, Stabrichtung, Sprungstellen,
 *   Schubunabhaengigkeit. Sie pruefen die VORZEICHEN und die Eigenschaften, die
 *   ueber alle Faelle gelten muessen.
 */

import { describe, expect, it } from 'vitest';
import {
  internalForcesAt,
  internalForcesStations,
} from '../src/internal-forces';
import { Timoshenko2D, Timoshenko2DIntegrated } from '../src/timoshenko';
import type {
  ElementEvaluationState,
  ElementReleases,
  LocalElementLoad,
  SectionStiffness,
  Vector6,
} from '../src/types';
import { solveDense } from './references/chain';
import { expectClose } from './helpers';

const L = 3;
const rigid: SectionStiffness = { EA: 1e5, EI: 2e4, GAs: 'rigid' };
const shear: SectionStiffness = { EA: 1e5, EI: 2e4, GAs: 5e4 };
const noLoad: LocalElementLoad = { segments: [], points: [] };

/** Eine konstante Streckenlast ueber die volle Laenge. */
function span(
  values: Partial<{ qx: number; qz: number; my: number }>,
  from = 0,
  to = L,
): LocalElementLoad {
  const { qx = 0, qz = 0, my = 0 } = values;
  return {
    segments: [
      { from, to, qx1: qx, qx2: qx, qz1: qz, qz2: qz, my1: my, my2: my },
    ],
    points: [],
  };
}

type Case = {
  props?: SectionStiffness;
  Le?: number;
  load?: LocalElementLoad;
  /** Gesperrte lokale Freiheitsgrade, Indizes 0..5. */
  fixed: number[];
  /** Zusaetzliche Knotenlasten, je lokalem Freiheitsgrad. */
  nodalLoads?: Record<number, number>;
  releases?: ElementReleases;
  formulation?: typeof Timoshenko2D;
};

/**
 * EIN Element loesen und auswerten — die kleinste Konstruktion, die einen
 * Auswertungszustand hervorbringt.
 *
 * Ein FREIGESETZTER Freiheitsgrad wird mitgesperrt: nach der Kondensation steht
 * in seiner Zeile eine Null, das Element haelt den KNOTEN dort nicht mehr, und
 * im echten Modell haelt ihn ein anderer Stab oder ein Auflager. Welchen Wert
 * der Knoten dabei traegt, ist gleichgueltig — das Element ist von ihm
 * abgekoppelt, und `evaluate` rechnet seine eigene Endverformung zurueck. Genau
 * das ist hier zu pruefen.
 */
function evaluateSingle(spec: Case): ElementEvaluationState {
  const {
    props = rigid,
    Le = L,
    load = noLoad,
    fixed,
    nodalLoads = {},
    releases,
    formulation = Timoshenko2D,
  } = spec;

  const element = formulation.prepare(props, Le, releases);
  const loaded = element.withLoad(load);
  const K = element.stiffness();
  const f = loaded.consistentLoad();

  // Ein Freiheitsgrad, zu dem das Element nach der Kondensation nichts mehr
  // beitraegt, wird mitgesperrt. RELATIV gemessen, nicht `=== 0`: bei
  // `theta`/`theta` bleibt in der Quer-Diagonale ein Rundungsrest von ~1e-13
  // stehen, und ein exakter Vergleich liesse ihn als Steifigkeit durchgehen —
  // der Testaufbau produzierte dann eine riesige Verschiebung und daraus
  // plausibel aussehende Schnittgroessen.
  const scale = Math.max(...K.map((row, i) => Math.abs(row[i])));
  const blocked = new Set(fixed);
  for (let i = 0; i < 6; i += 1) {
    if (Math.abs(K[i][i]) <= 1e-9 * scale) blocked.add(i);
  }
  const free = [0, 1, 2, 3, 4, 5].filter((i) => !blocked.has(i));

  const d = [0, 0, 0, 0, 0, 0];
  if (free.length > 0) {
    const solved = solveDense(
      free.map((i) => free.map((j) => K[i][j])),
      free.map((i) => f[i] + (nodalLoads[i] ?? 0)),
    );
    free.forEach((i, k) => {
      d[i] = solved[k];
    });
  }

  return loaded.evaluate(d as unknown as Vector6);
}

describe('internalForcesAt: geschlossene Loesungen', () => {
  it('Kragarm mit Endlast P: M laeuft linear von -P*L auf 0, V ist konstant', () => {
    const P = 7;
    const state = evaluateSingle({ fixed: [0, 1, 2], nodalLoads: { 4: P } });

    expectClose(internalForcesAt(state, 0).M, -P * L);
    expectClose(internalForcesAt(state, L).M, 0);
    for (const x of [0, 0.7, L / 2, 2.9, L]) {
      expectClose(internalForcesAt(state, x).V, P);
      expectClose(internalForcesAt(state, x).M, -P * (L - x));
    }
  });

  it('Einfeldtraeger unter Gleichlast: M(L/2) = +qL^2/8, V kippt von +qL/2 auf -qL/2', () => {
    const q = 5;
    const state = evaluateSingle({ fixed: [0, 1, 4], load: span({ qz: q }) });

    expectClose(internalForcesAt(state, L / 2).M, (q * L * L) / 8);
    expectClose(internalForcesAt(state, 0).V, (q * L) / 2);
    expectClose(internalForcesAt(state, L).V, -(q * L) / 2);
    expectClose(internalForcesAt(state, 0).M, 0);
    expectClose(internalForcesAt(state, L).M, 0);
  });

  it('beidseitig eingespannt unter Gleichlast: -qL^2/12 am Rand, +qL^2/24 in der Mitte', () => {
    // DER Testfall fuer ADR 0018. Alle Knotenfreiheitsgrade sind null; wer die
    // Schnittgroessen aus den Ansatzfunktionen und `d` bildet, bekommt hier
    // M == 0 ueber die ganze Laenge — plausibel aussehend und komplett falsch.
    const q = 5;
    const state = evaluateSingle({
      fixed: [0, 1, 2, 3, 4, 5],
      load: span({ qz: q }),
    });

    expect(state.endDisplacements).toEqual([0, 0, 0, 0, 0, 0]);
    expectClose(internalForcesAt(state, 0).M, -(q * L * L) / 12);
    expectClose(internalForcesAt(state, L).M, -(q * L * L) / 12);
    expectClose(internalForcesAt(state, L / 2).M, (q * L * L) / 24);
  });

  it('Zugstab und Druckstab: N ist konstant und traegt das Vorzeichen der Last', () => {
    const P = 11;
    for (const sign of [1, -1]) {
      const state = evaluateSingle({
        fixed: [0, 1, 2, 4, 5],
        nodalLoads: { 3: sign * P },
      });
      for (const x of [0, 1.4, L]) {
        expectClose(internalForcesAt(state, x).N, sign * P);
        expectClose(internalForcesAt(state, x).V, 0);
      }
    }
  });

  it('Kragarm unter Streckenmoment: V bleibt 0 und M laeuft von m*L auf 0', () => {
    // Der Anker fuer `dM/dx = V + my_e`. Mit `dM/dx = V` bliebe M konstant, mit
    // `+m` statt `my_e = -m` (ADR 0005) kaeme M(L) = 2*m*L heraus. Nur die
    // richtige Kombination trifft die Null am freien Ende.
    const m = 4;
    const state = evaluateSingle({
      fixed: [0, 1, 2],
      load: span({ my: -m }),
    });

    for (const x of [0, 0.9, L]) {
      expectClose(internalForcesAt(state, x).V, 0, 1e-10);
      expectClose(internalForcesAt(state, x).M, m * (L - x));
    }
  });
});

describe('internalForcesAt: Randidentitaeten', () => {
  const cases: [string, Case][] = [
    ['Kragarm mit Endlast', { fixed: [0, 1, 2], nodalLoads: { 4: 7 } }],
    ['Einfeldtraeger unter Gleichlast', { fixed: [0, 1, 4], load: span({ qz: 5 }) }],
    [
      'beidseitig eingespannt',
      { fixed: [0, 1, 2, 3, 4, 5], load: span({ qz: 5, qx: 2, my: -1 }) },
    ],
    [
      'schubweicher Traeger mit Trapezlast',
      {
        props: shear,
        fixed: [0, 1, 4],
        load: {
          segments: [
            { from: 0.3, to: 2.4, qx1: 1, qx2: 3, qz1: 2, qz2: 8, my1: -1, my2: 2 },
          ],
          points: [{ a: 1.6, px: 2, pz: 5, my: -3 }],
        },
      },
    ],
  ];

  it.each(cases)(
    'trifft bei %s die Stabendkraefte an beiden Raendern',
    (_name, spec) => {
      // Ein Vorzeichendreher in der Umrechnungstabelle schlaegt hier sofort
      // durch: `links(0)` MUSS `[-e0, -e1, +e2]` sein, `rechts(L)` `[+e3, +e4,
      // -e5]`. Das haelt Gleichgewichtsweg und Stabendkraefte aneinander.
      const state = evaluateSingle(spec);
      const e = state.endForces;

      const left = internalForcesAt(state, 0, 'left');
      expectClose(left.N, -e[0]);
      expectClose(left.V, -e[1]);
      expectClose(left.M, e[2]);

      const right = internalForcesAt(state, state.L, 'right');
      expectClose(right.N, e[3]);
      expectClose(right.V, e[4]);
      expectClose(right.M, -e[5]);
    },
  );
});

/** `-0` ist mathematisch 0; `toBe(0)` unterscheidet die beiden. */
function expectExactlyZero(value: number): void {
  expect(Math.abs(value)).toBe(0);
}

describe('internalForcesAt: Gelenke', () => {
  it('setzt N(0) exakt auf 0, wenn `start.u` freigesetzt ist', () => {
    const state = evaluateSingle({
      fixed: [0, 1, 2, 3, 4, 5],
      releases: { start: { u: true } },
      load: span({ qx: 2 }),
    });

    expectExactlyZero(internalForcesAt(state, 0).N);
    // Und am anderen Ende steht die ganze Laengskraft: das Gelenk nimmt die
    // Normalkraft weg, es macht die Last nicht verschwinden.
    expectClose(internalForcesAt(state, L).N, -2 * L);
  });

  it('setzt V(0) exakt auf 0, wenn `start.w` freigesetzt ist', () => {
    const state = evaluateSingle({
      fixed: [0, 1, 2, 3, 4, 5],
      releases: { start: { w: true } },
      load: span({ qz: 5 }),
    });

    expectExactlyZero(internalForcesAt(state, 0).V);
    expectClose(internalForcesAt(state, L).V, -5 * L);
  });

  it('setzt M(0) exakt auf 0, wenn `start.theta` freigesetzt ist', () => {
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      load: span({ qz: 5 }),
      releases: { start: { theta: true } },
    });

    expectExactlyZero(internalForcesAt(state, 0).M);
    // Das Gelenk nimmt das MOMENT weg, nicht die Querkraft — mit `theta2` frei
    // am Knoten ist das der Einfeldtraeger.
    expectClose(internalForcesAt(state, 0).V, (5 * L) / 2);
    expectClose(internalForcesAt(state, L / 2).M, (5 * L * L) / 8);
  });

  it('laesst den Pendelstab die Normalkraft uebertragen und sonst nichts', () => {
    // `theta` an BEIDEN Enden bleibt zulaessig — nach der Kondensation von
    // `theta1` steht `K[theta2][theta2] = 3EI/L != 0`, kein Pivot 0. Was der
    // Stab danach noch traegt, ist allerdings nur die Normalkraft: mit
    // Momentengelenken an beiden Enden und ohne Stablast verlangt das
    // Momentengleichgewicht `V == 0`. Der Biegeblock hat Rang 2, zwei
    // Kondensationen raeumen ihn vollstaendig leer.
    const P = 6;
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      nodalLoads: { 3: P },
      releases: { start: { theta: true }, end: { theta: true } },
    });

    expectClose(internalForcesAt(state, L / 2).N, P);
    for (const x of [0, L / 2, L]) {
      expectClose(internalForcesAt(state, x).V, 0, 1e-12);
      expectClose(internalForcesAt(state, x).M, 0, 1e-12);
    }
  });

  it('rechnet mehrere Gelenke am selben Ende in umgekehrter Reihenfolge zurueck', () => {
    // `start.u` und `start.theta`: die aufgehobene Zeile 2 traegt in Spalte 0
    // bereits eine Null, die Originalzeile 0 aber sehr wohl einen Eintrag in
    // Spalte 2. Vorwaerts gerechnet fehlte im ersten Schritt ein Wert.
    const state = evaluateSingle({
      fixed: [0, 1, 2, 3, 4, 5],
      load: span({ qz: 4, qx: 3 }),
      releases: { start: { u: true, theta: true } },
    });

    expectExactlyZero(internalForcesAt(state, 0).N);
    expectExactlyZero(internalForcesAt(state, 0).M);
    // Die Endverformungen der freigesetzten Richtungen sind NICHT null,
    // obwohl jeder Knotenfreiheitsgrad gesperrt ist — genau das ist der Punkt.
    expect(Math.abs(state.endDisplacements[0])).toBeGreaterThan(0);
    expect(Math.abs(state.endDisplacements[2])).toBeGreaterThan(0);

    // Die Probe: die zurueckgerechneten Endverformungen erfuellen die
    // UNKONDENSIERTE Gleichung wieder, also `K0 d - f0 = e` mit e[0] = e[2] = 0.
    const K0 = Timoshenko2D.prepare(rigid, L).stiffness();
    const f0 = Timoshenko2D.prepare(rigid, L)
      .withLoad(state.load)
      .consistentLoad();
    for (const row of [0, 2]) {
      const residual = K0[row].reduce(
        (sum, k, j) => sum + k * state.endDisplacements[j],
        -f0[row],
      );
      expectClose(residual, 0, 1e-9);
    }
  });
});

describe('internalForcesAt: Sprungstellen', () => {
  it('trennt links und rechts an einer Einzellast in Feldmitte', () => {
    const P = 8;
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      load: { segments: [], points: [{ a: L / 2, px: 0, pz: P, my: 0 }] },
    });

    const left = internalForcesAt(state, L / 2, 'left');
    const right = internalForcesAt(state, L / 2, 'right');

    expectClose(left.V, P / 2);
    expectClose(right.V, -P / 2);
    // `M` ist an einer Einzelkraft STETIG — der Sprung sitzt in der Kraft, und
    // der Hebelarm der Last ist an ihrer eigenen Stelle null.
    expectClose(left.M, (P * L) / 4);
    expectClose(right.M, (P * L) / 4);
  });

  it('unterscheidet links und rechts an einer Randlast bei x = 0', () => {
    // Ohne die Seitenwahl zeigte das Diagramm am Rand einen Phantomsprung oder
    // verschluckte den echten.
    const P = 8;
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      load: { segments: [], points: [{ a: 0, px: 0, pz: P, my: 0 }] },
    });

    const left = internalForcesAt(state, 0, 'left');
    const right = internalForcesAt(state, 0, 'right');
    expectClose(left.V - right.V, P);
    // Der linksseitige Grenzwert am linken Rand ist die Stabendkraft — die Last
    // AUF dem Knoten zaehlt dort noch nicht mit.
    expectClose(left.V, -state.endForces[1]);
  });

  it('unterscheidet links und rechts an einer Randlast bei x = L', () => {
    // Das Gegenstueck am anderen Rand, und der schaerfere Fall: hier muss der
    // RECHTSseitige Grenzwert die Stabendkraft `+e[4]` treffen, obwohl die Last
    // genau auf der Abfragestelle sitzt. Trifft ihn stattdessen der linke, ist
    // die Ungleichung in `counts` verdreht.
    const P = 8;
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      load: { segments: [], points: [{ a: L, px: 0, pz: P, my: 0 }] },
    });

    const left = internalForcesAt(state, L, 'left');
    const right = internalForcesAt(state, L, 'right');

    expectClose(left.V - right.V, P);
    expectClose(right.V, state.endForces[4]);
    // `M` bleibt an der Einzelkraft stetig, auch am Rand.
    expectClose(left.M, right.M);
    expectClose(right.M, -state.endForces[5]);
  });

  it('laesst `M` an einem Einzelmoment springen', () => {
    const M = 6;
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      load: { segments: [], points: [{ a: 1.2, px: 0, pz: 0, my: M }] },
    });

    const left = internalForcesAt(state, 1.2, 'left');
    const right = internalForcesAt(state, 1.2, 'right');
    expectClose(right.M - left.M, M);
    expectClose(left.V, right.V);
  });

  it('wirft ausserhalb von [0, L], mit relativer Schranke', () => {
    const state = evaluateSingle({ fixed: [0, 1, 2] });

    expect(() => internalForcesAt(state, -0.5)).toThrow(/nicht in \[0, 3\]/);
    expect(() => internalForcesAt(state, L + 0.5)).toThrow();
    // 1e-10 * max(1, L) liegt innerhalb der Toleranz und wird auf den Stab
    // geklemmt statt beanstandet.
    expect(() => internalForcesAt(state, L + 1e-10)).not.toThrow();
  });
});

describe('internalForcesStations', () => {
  it('enthaelt die Raender, die Segmentgrenzen und die Lastpositionen', () => {
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      load: {
        segments: [
          { from: 0.4, to: 2.2, qx1: 0, qx2: 0, qz1: 3, qz2: 3, my1: 0, my2: 0 },
        ],
        points: [{ a: 1.5, px: 0, pz: 4, my: 0 }],
      },
    });

    const stations = internalForcesStations(state);
    for (const x of [0, 0.4, 1.5, 2.2, L]) {
      expect(stations.some((s) => Math.abs(s - x) < 1e-9)).toBe(true);
    }
    expect([...stations].sort((a, b) => a - b)).toEqual(stations);
  });

  it('trifft das Moment-Maximum einer Dreieckslast an krummer Stelle exakt', () => {
    // V(x) = qL/6 - q x^2/(2L) hat seine Nullstelle bei x = L/sqrt(3) — keine
    // Rasterstelle. Ueber die Stuetzstellenliste muss der analytische Wert
    // qL^2/(9*sqrt(3)) trotzdem exakt herauskommen; DAS ist der Grund fuer
    // Punkt 4 der Liste.
    const q = 6;
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      load: {
        segments: [
          { from: 0, to: L, qx1: 0, qx2: 0, qz1: 0, qz2: q, my1: 0, my2: 0 },
        ],
        points: [],
      },
    });

    const xExact = L / Math.sqrt(3);
    const stations = internalForcesStations(state);
    expect(stations.some((s) => Math.abs(s - xExact) < 1e-9)).toBe(true);

    const maximum = Math.max(
      ...stations.map((x) => internalForcesAt(state, x).M),
    );
    expectClose(maximum, (q * L * L) / (9 * Math.sqrt(3)), 1e-9);
  });

  it('meldet das Maximum unter einer Einzellast ueber die Lastposition', () => {
    // Hier geht `V` nur DURCH den Sprung durch null, es gibt keine Wurzel —
    // Punkt 3 der Liste deckt den Fall ab.
    const P = 8;
    const state = evaluateSingle({
      fixed: [0, 1, 4],
      load: { segments: [], points: [{ a: L / 2, px: 0, pz: P, my: 0 }] },
    });

    const maximum = Math.max(
      ...internalForcesStations(state).map((x) => internalForcesAt(state, x).M),
    );
    expectClose(maximum, (P * L) / 4);
  });

  it('kommt ohne Last mit den beiden Raendern aus', () => {
    const state = evaluateSingle({ fixed: [0, 1, 2], nodalLoads: { 4: 3 } });

    expect(internalForcesStations(state)).toEqual([0, L]);
  });
});

describe('internalForcesAt: strukturelle Invarianzen', () => {
  it('kippt `M` mit der lokalen z-Achse, wenn die Knoten vertauscht werden', () => {
    // Derselbe physikalische Kragarm, einmal vom eingespannten und einmal vom
    // freien Ende aus modelliert. `ez` entsteht aus `ex` durch dieselbe Drehung
    // (fem-geometry) — dreht sich `ex` um, dreht sich `ez` mit. Damit dreht
    // sich die Zugseite um und `M` kippt.
    //
    // `V` KIPPT NICHT, und das ist keine Schlamperei, sondern `dM/dx = V`:
    // kippen `M` und `x` beide, bleibt der Quotient stehen. Anschaulich: die
    // Umkehr vertauscht, welches Schnittufer das positive ist, UND dreht die
    // Bezugsrichtung — zwei Vorzeichenwechsel. `N` (Zug ist Zug) bleibt ohnehin.
    const q = 5;
    const forward = evaluateSingle({ fixed: [0, 1, 2], load: span({ qz: q }) });
    const reversed = evaluateSingle({
      fixed: [3, 4, 5],
      load: span({ qz: -q }),
    });

    for (const x of [0, 0.8, L / 2, 2.5, L]) {
      const a = internalForcesAt(forward, x);
      const b = internalForcesAt(reversed, L - x);
      expectClose(b.N, a.N, 1e-9);
      expectClose(b.V, a.V, 1e-9);
      expectClose(b.M, -a.M, 1e-9);
    }
    // Der Kragarm ist kein Nullfall: ohne echte Zahlen wuerde die Invarianz
    // trivial gelten.
    expectClose(internalForcesAt(forward, 0).M, -(q * L * L) / 2);
  });

  it('liefert mit und ohne Schub DIESELBEN Schnittgroessen', () => {
    // Die Rekonstruktion ist theoriefrei: der Schub steckt vollstaendig in den
    // Stabendkraeften. Die VERFORMUNGEN unterscheiden sich sehr wohl — genau
    // das macht den Anker aussagekraeftig.
    const load = span({ qz: 5 });
    const spec: Case = { fixed: [0, 1, 2, 3, 4, 5], load };
    const stiff = evaluateSingle({ ...spec, props: rigid });
    const soft = evaluateSingle({ ...spec, props: shear });

    for (const x of [0, 0.8, L / 2, 2.5, L]) {
      const a = internalForcesAt(stiff, x);
      const b = internalForcesAt(soft, x);
      expectClose(b.N, a.N, 1e-9);
      expectClose(b.V, a.V, 1e-9);
      expectClose(b.M, a.M, 1e-9);
    }
    expect(stiff.deformation.phi).toBe(0);
    expect(soft.deformation.phi).toBeGreaterThan(0);
  });

  it('liefert fuer die integrierte Formulierung dieselben Zahlen', () => {
    const load = span({ qz: 5 });
    const spec: Case = { props: shear, fixed: [0, 1, 4], load };
    const closed = evaluateSingle(spec);
    const integrated = evaluateSingle({
      ...spec,
      formulation: Timoshenko2DIntegrated,
    });

    expect(integrated.deformation.kind).toBe(closed.deformation.kind);
    for (const x of [0, 1.1, L]) {
      expectClose(
        internalForcesAt(integrated, x).M,
        internalForcesAt(closed, x).M,
        1e-9,
      );
    }
  });
});
