import { UnknownNodeReferenceError } from '@baustatik/fem';
import {
  type FrameElement2DFormulation,
  type SectionProperties,
  Timoshenko2D,
  Timoshenko2DIntegrated,
} from '@baustatik/fem-element';
import { ZeroNodeLoadError } from '@baustatik/fem-loads';
import { describe, expect, it } from 'vitest';
import {
  SingularStiffnessMatrixError,
  UnrestrainedDegreeOfFreedomError,
} from '../src/errors';
import {
  createAnalysisPolicy,
  DEFAULT_ANALYSIS_POLICY,
} from '../src/policy';
import { solve } from '../src/solve';
import { createFEMSolver } from '../src/solver';
import {
  beam,
  configOver,
  fakeFormulation,
  gaussSolve,
  node,
  resultant,
  STIFF,
  type Store,
  support,
} from './support';

const { EI, GAs } = STIFF;

/**
 * Kragarm: bei n1 eingespannt, Laenge L, Einzellast P nach unten am freien Ende.
 * Das Modell aus `apps/demo/fem-cantilever.ts`.
 */
function cantilever(L = 2, P = 10): Store {
  return {
    nodes: [node('n1', 0, 0), node('n2', L, 0)],
    beams: [beam('b1', 'n1', 'n2')],
    supports: [support('s1', 'n1')],
    loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: P }],
  };
}

describe('solve — Assemblierung mit trivialer Formulierung', () => {
  /**
   * Einheitssteifigkeit und fester Lastvektor: damit sind
   * Freiheitsgrad-Nummerierung, Assemblierung, Transformation von `f` und die
   * Elimination mit Zahlen pruefbar, die im Kopf nachzurechnen sind.
   */
  it('nummeriert, dreht und assembliert nachrechenbar', async () => {
    const store: Store = {
      nodes: [node('n1', 0, 0), node('n2', 1, 0), node('n3', 2, 0)],
      beams: [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3')],
      supports: [support('s1', 'n1')],
      loads: [],
    };

    const result = await solve(
      configOver(store, { formulation: fakeFormulation() }),
    );

    // f_lokal = [1,2,3,4,5,6]; die Transformation dreht nur das Vorzeichen der
    // Verdrehungszeilen (das -1 aus phiY = -theta), also T^T f = [1,2,-3,4,5,-6].
    // n2 bekommt das Ende von b1 UND den Anfang von b2 — sowohl in F (5, 7, -9)
    // als auch auf der Diagonale von K (1 + 1 = 2). Genau daran zeigt sich,
    // dass wirklich assembliert und nicht bloss eingetragen wird.
    expect(result.displacements.get('n2')).toEqual({
      ux: 2.5,
      uz: 3.5,
      phiY: -4.5,
    });
    expect(result.displacements.get('n3')).toEqual({ ux: 4, uz: 5, phiY: -6 });
    // n1 ist voll gehalten.
    expect(result.displacements.get('n1')).toEqual({ ux: 0, uz: 0, phiY: 0 });
    // r = K d - F; die Einheitsmatrix koppelt die Knoten nicht.
    expect(result.reactions.get('n1')).toEqual({ fx: -1, fz: -2, my: 3 });
  });
});

describe('solve — Kragarm gegen die Handrechnung', () => {
  it('trifft w = PL^3/3EI und phi = -PL^2/2EI ohne Schub', async () => {
    const result = await solve(configOver(cantilever()));

    const tip = result.displacements.get('n2');
    expect(tip?.uz).toBeCloseTo((10 * 2 ** 3) / (3 * EI), 12);
    // Negativ: die Tangente dreht im Bild im Uhrzeigersinn, phiY zaehlt
    // dagegen. Das ist die Konvention aus ADR 0005, hier zum ersten Mal am
    // Ergebnis sichtbar.
    expect(tip?.phiY).toBeCloseTo(-(10 * 2 ** 2) / (2 * EI), 12);
    expect(tip?.ux).toBeCloseTo(0, 12);
  });

  it('addiert mit Schub den Anteil PL/GAs', async () => {
    // Der Schalter kommt aus der Policy, nicht aus der Config — und `true` ist
    // dort die Voreinstellung, also genuegt die Default-Policy.
    const result = await solve(
      configOver(cantilever(), { analysisPolicy: DEFAULT_ANALYSIS_POLICY }),
    );

    expect(result.displacements.get('n2')?.uz).toBeCloseTo(
      (10 * 2 ** 3) / (3 * EI) + (10 * 2) / GAs,
      12,
    );
    // Die Verdrehung bleibt schubunabhaengig.
    expect(result.displacements.get('n2')?.phiY).toBeCloseTo(
      -(10 * 2 ** 2) / (2 * EI),
      12,
    );
  });

  it('rechnet die Einspannung zurueck', async () => {
    const result = await solve(configOver(cantilever()));

    // Die Kraft, die das Auflager auf das TRAGWERK ausuebt: die Last zeigt nach
    // unten (fz positiv), das Auflager haelt dagegen.
    expect(result.reactions.get('n1')?.fz).toBeCloseTo(-10, 10);
    expect(result.reactions.get('n1')?.fx).toBeCloseTo(0, 10);
    expect(result.reactions.get('n1')?.my).toBeCloseTo(20, 10);
  });

  it('liefert dieselben Zahlen mit beiden Formulierungen', async () => {
    const closed = await solve(
      configOver(cantilever(), { formulation: Timoshenko2D }),
    );
    const integrated = await solve(
      configOver(cantilever(), { formulation: Timoshenko2DIntegrated }),
    );

    expect(integrated.displacements.get('n2')?.uz).toBeCloseTo(
      closed.displacements.get('n2')?.uz as number,
      12,
    );
  });
});

describe('solve — die Analyse-Einstellung', () => {
  /** Eine Formulierung, die nur festhaelt, WAS bei ihr ankommt. */
  function recording(): {
    formulation: FrameElement2DFormulation;
    seen: SectionProperties[];
  } {
    const seen: SectionProperties[] = [];
    const inner = fakeFormulation();

    return {
      seen,
      formulation: {
        prepare: (props, L) => {
          seen.push(props);
          return inner.prepare(props, L);
        },
      },
    };
  }

  it('nimmt den Schubschalter aus der Policy, nicht aus der Config', async () => {
    // Der Schalter ERSETZT `GAs` auf dem Weg ins Element; der Querschnitt aus
    // dem Port bleibt unangetastet.
    const withShear = recording();
    await solve(
      configOver(cantilever(), {
        formulation: withShear.formulation,
        analysisPolicy: createAnalysisPolicy({ shearDeformation: true }),
      }),
    );
    expect(withShear.seen[0]).toEqual(STIFF);

    const without = recording();
    await solve(
      configOver(cantilever(), {
        formulation: without.formulation,
        analysisPolicy: createAnalysisPolicy({ shearDeformation: false }),
      }),
    );
    expect(without.seen[0]).toEqual({ ...STIFF, GAs: 'rigid' });
    expect(STIFF.GAs).toBe(500);
  });

  it('rechnet ohne analysisPolicy mit dem Default — also MIT Schub', async () => {
    const result = await solve(
      configOver(cantilever(), { analysisPolicy: undefined }),
    );

    expect(result.displacements.get('n2')?.uz).toBeCloseTo(
      (10 * 2 ** 3) / (3 * EI) + (10 * 2) / GAs,
      12,
    );
  });

  it('laesst die Custom-Formulierung gewinnen — per Objektidentitaet', async () => {
    // Kein Wrapper, keine Kompatibilitaetspruefung: was in der Config steht,
    // rechnet. Genau dafuer ist die Formulierung ein Port und keine
    // schreibbare Einstellung.
    const custom = recording();

    await solve(configOver(cantilever(), { formulation: custom.formulation }));

    expect(custom.seen).toHaveLength(1);
  });
});

describe('solve — Einfeldtraeger mit Gleichlast', () => {
  /** Zwei Elemente, damit die Durchbiegung in Feldmitte an einem Knoten liegt. */
  function simplySupported(L = 4, q = 6): Store {
    return {
      nodes: [node('n1', 0, 0), node('n2', L / 2, 0), node('n3', L, 0)],
      beams: [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3')],
      supports: [
        support('s1', 'n1', 'fixed', 'fixed', 'free'),
        support('s2', 'n3', 'free', 'fixed', 'free'),
      ],
      loads: [
        {
          id: 'l1',
          target: 'beam',
          beamIds: ['b1', 'b2'],
          kind: 'force',
          distribution: 'constant',
          frame: 'global',
          axis: 'z',
          referenceLength: 'trueLength',
          q,
        },
      ],
    };
  }

  it('trifft w_mitte = 5qL^4/384EI', async () => {
    // Prueft die Ersatzknotenlast in der Kette: eine Streckenlast wird nur
    // ueber `consistentLoad` zu Knotenkraeften.
    const result = await solve(configOver(simplySupported()));

    expect(result.displacements.get('n2')?.uz).toBeCloseTo(
      (5 * 6 * 4 ** 4) / (384 * EI),
      12,
    );
  });

  it('teilt die Auflagerkraefte je qL/2', async () => {
    const result = await solve(configOver(simplySupported()));

    expect(result.reactions.get('n1')?.fz).toBeCloseTo(-12, 10);
    expect(result.reactions.get('n3')?.fz).toBeCloseTo(-12, 10);
    // Ein freigegebener Freiheitsgrad haelt exakt nichts.
    expect(result.reactions.get('n1')?.my).toBe(0);
    expect(result.reactions.get('n3')?.fx).toBe(0);
  });
});

describe('solve — schraeger Stab', () => {
  /**
   * Der einzige Test, der die 6x6-Transformation wirklich prueft: derselbe
   * Kragarm, um 30 Grad gedreht, mit mitgedrehter Last. Das Ergebnis muss die
   * gedrehte Fassung des ungedrehten sein — und `phiY` muss unveraendert
   * bleiben, weil eine Drehung um y die Verdrehung um y nicht aendert.
   */
  it('liefert das gedrehte Ergebnis des ungedrehten Modells', async () => {
    const alpha = Math.PI / 6;
    const cos = Math.cos(alpha);
    const sin = Math.sin(alpha);
    const L = 2;
    const P = 10;

    const straight = await solve(configOver(cantilever(L, P)));

    const rotated: Store = {
      nodes: [node('n1', 0, 0), node('n2', L * cos, L * sin)],
      beams: [beam('b1', 'n1', 'n2')],
      supports: [support('s1', 'n1')],
      // Der Lastvektor (0, P), mit derselben Drehung: (-P sin, P cos).
      loads: [
        {
          id: 'l1',
          target: 'node',
          nodeIds: ['n2'],
          fx: -P * sin,
          fz: P * cos,
        },
      ],
    };

    const result = await solve(configOver(rotated));

    const before = straight.displacements.get('n2');
    const after = result.displacements.get('n2');
    expect(after?.ux).toBeCloseTo(
      (before?.ux as number) * cos - (before?.uz as number) * sin,
      12,
    );
    expect(after?.uz).toBeCloseTo(
      (before?.ux as number) * sin + (before?.uz as number) * cos,
      12,
    );
    expect(after?.phiY).toBeCloseTo(before?.phiY as number, 12);
  });
});

describe('solve — Gelenke', () => {
  /**
   * Kragarm mit gefuehrtem Ende: n2 kann sich nur verschieben, nicht verdrehen.
   * Damit haengt die Durchbiegung direkt an der Quersteifigkeit — ohne Gelenk
   * 12EI/L^3, mit Gelenk am Anfang 3EI/L^3.
   */
  function guided(releases?: Parameters<typeof beam>[3]): Store {
    return {
      nodes: [node('n1', 0, 0), node('n2', 2, 0)],
      beams: [beam('b1', 'n1', 'n2', releases)],
      supports: [
        support('s1', 'n1'),
        support('s2', 'n2', 'fixed', 'free', 'fixed'),
      ],
      loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: 10 }],
    };
  }

  it('macht aus 12EI/L^3 die 3EI/L^3', async () => {
    const rigid = await solve(configOver(guided()));
    const hinged = await solve(
      configOver(guided({ start: { phiY: true } })),
    );

    expect(rigid.displacements.get('n2')?.uz).toBeCloseTo(
      (10 * 2 ** 3) / (12 * EI),
      12,
    );
    expect(hinged.displacements.get('n2')?.uz).toBeCloseTo(
      (10 * 2 ** 3) / (3 * EI),
      12,
    );
  });

  it('uebertraegt am Gelenk kein Moment', async () => {
    const result = await solve(
      configOver(guided({ start: { phiY: true } })),
    );

    // Selbstpruefende Eigenschaft der Kondensation: an der freigesetzten Stelle
    // steht exakt 0, nicht „fast 0".
    expect(result.elementEndForces.get('b1')?.[2]).toBe(0);
    expect(result.reactions.get('n1')?.my).toBeCloseTo(0, 10);
  });

  it('kondensiert auch die Ersatzknotenlast', async () => {
    /**
     * Der Test, den nur die MITkondensierte Last besteht. Kragtraeger mit
     * Stuetze am Ende unter Gleichlast: ohne Gelenk 5qL/8 und 3qL/8, mit
     * Gelenk am eingespannten Ende wird daraus der Einfeldtraeger mit qL/2 und
     * qL/2. Wer nur K kondensiert, bekommt hier plausible falsche Zahlen.
     */
    function propped(releases?: Parameters<typeof beam>[3]): Store {
      return {
        nodes: [node('n1', 0, 0), node('n2', 4, 0)],
        beams: [beam('b1', 'n1', 'n2', releases)],
        supports: [
          support('s1', 'n1'),
          support('s2', 'n2', 'free', 'fixed', 'free'),
        ],
        loads: [
          {
            id: 'l1',
            target: 'beam',
            beamIds: ['b1'],
            kind: 'force',
            distribution: 'constant',
            frame: 'global',
            axis: 'z',
            referenceLength: 'trueLength',
            q: 6,
          },
        ],
      };
    }

    const rigid = await solve(configOver(propped()));
    expect(rigid.reactions.get('n1')?.fz).toBeCloseTo(-15, 10);
    expect(rigid.reactions.get('n2')?.fz).toBeCloseTo(-9, 10);

    const hinged = await solve(
      configOver(propped({ start: { phiY: true } })),
    );
    expect(hinged.reactions.get('n1')?.fz).toBeCloseTo(-12, 10);
    expect(hinged.reactions.get('n2')?.fz).toBeCloseTo(-12, 10);
  });
});

describe('solve — Gleichgewicht', () => {
  /**
   * Der einzige Test, der die GANZE Kette auf einmal prueft: Aufloesung,
   * Ersatzknotenlast, Kondensation, Transformation, Assemblierung,
   * Randbedingungen und Rueckrechnung muessen alle stimmen, damit die Summe 0
   * ergibt.
   */
  const cases: [string, Store][] = [
    ['Kragarm', cantilever()],
    [
      'schraeger Stab mit Streckenlast',
      {
        nodes: [node('n1', 0, 0), node('n2', 3, 4)],
        beams: [beam('b1', 'n1', 'n2')],
        supports: [support('s1', 'n1')],
        loads: [
          {
            id: 'l1',
            target: 'beam',
            beamIds: ['b1'],
            kind: 'force',
            distribution: 'trapezoidal',
            frame: 'global',
            axis: 'z',
            referenceLength: 'horizontalProjection',
            q1: 2,
            q2: 8,
            fullLength: true,
          },
        ],
      },
    ],
    [
      'Rahmen mit Gelenk und Momentlast',
      {
        nodes: [node('n1', 0, 0), node('n2', 0, -3), node('n3', 4, -3)],
        beams: [
          beam('b1', 'n1', 'n2'),
          beam('b2', 'n2', 'n3', { end: { phiY: true } }),
        ],
        supports: [support('s1', 'n1'), support('s2', 'n3')],
        loads: [
          { id: 'l1', target: 'node', nodeIds: ['n2'], fx: 5, my: 7 },
          {
            id: 'l2',
            target: 'beam',
            beamIds: ['b2'],
            kind: 'moment',
            distribution: 'point',
            m: 9,
            distanceFromStart: 1.5,
          },
        ],
      },
    ],
  ];

  for (const [name, store] of cases) {
    it(`haelt beim ${name} das Gleichgewicht`, async () => {
      const config = configOver(store);
      const result = await solve(config);

      const positionOf = new Map(
        store.nodes.map((n) => [n.id, n.position] as const),
      );
      const entries = [
        // Nur Knotenlasten stehen direkt zur Verfuegung; Stablasten werden
        // ueber die Resultierende der Auflagerkraefte geprueft (siehe unten).
        ...store.loads
          .filter((load) => load.target === 'node')
          .flatMap((load) =>
            load.nodeIds.map((nodeId) => ({
              at: positionOf.get(nodeId) as { x: number; z: number },
              fx: load.fx ?? 0,
              fz: load.fz ?? 0,
              my: load.my ?? 0,
            })),
          ),
        ...[...result.reactions].map(([nodeId, reaction]) => ({
          at: positionOf.get(nodeId) as { x: number; z: number },
          ...reaction,
        })),
      ];

      const total = resultant(entries);
      const beamLoadResultant = resultantOfBeamLoads(store);

      expect(total.fx + beamLoadResultant.fx).toBeCloseTo(0, 8);
      expect(total.fz + beamLoadResultant.fz).toBeCloseTo(0, 8);
      expect(total.my + beamLoadResultant.my).toBeCloseTo(0, 8);
    });
  }
});

describe('solve — das Tor und die Kinematik', () => {
  it('wirft den Modellfehler, bevor irgendetwas gerechnet wird', async () => {
    const store = cantilever();
    store.beams = [beam('b1', 'n1', 'weg')];

    await expect(solve(configOver(store))).rejects.toBeInstanceOf(
      UnknownNodeReferenceError,
    );
  });

  it('wirft den Lastfehler nach dem Modell', async () => {
    const store = cantilever();
    store.loads = [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: 0 }];

    await expect(solve(configOver(store))).rejects.toBeInstanceOf(
      ZeroNodeLoadError,
    );
  });

  it('nennt beim unverspannten Pendelstab Knoten und Richtung', async () => {
    // Gelenke an BEIDEN Enden: nach der Kondensation bleibt vom Biegeanteil
    // nichts uebrig (3k - 9L^2k^2/(3L^2k) = 0) — ein Pendelstab traegt nur
    // laengs. Als alleinstehender Kragarm ist er damit selbst der Mechanismus,
    // und die Querverschiebung faellt vor der Verdrehung auf.
    const store = cantilever();
    store.beams = [
      beam('b1', 'n1', 'n2', { start: { phiY: true }, end: { phiY: true } }),
    ];

    const failure = await solve(configOver(store)).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(UnrestrainedDegreeOfFreedomError);
    const unrestrained = failure as UnrestrainedDegreeOfFreedomError;
    expect(unrestrained.nodeId).toBe('n2');
    expect(unrestrained.dof).toBe('uz');
  });

  it('rechnet den Pendelstab, sobald ihn etwas verspannt', async () => {
    // Die Gegenprobe: derselbe Stab ist fachlich voellig zulaessig. Verspannt
    // ein biegesteifer Traeger denselben Knoten, traegt der Pendelstab laengs
    // mit, und es gibt nichts zu melden.
    const store: Store = {
      nodes: [node('n1', 0, 0), node('n2', 4, 0), node('n3', 4, 3)],
      beams: [
        beam('b1', 'n1', 'n2'),
        beam('b2', 'n3', 'n2', { start: { phiY: true }, end: { phiY: true } }),
      ],
      supports: [support('s1', 'n1'), support('s2', 'n3')],
      loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: 10 }],
    };

    const result = await solve(configOver(store));

    // Der Pendelstab steht senkrecht unter dem Lastknoten und nimmt Laengskraft
    // auf: die Durchbiegung bleibt weit unter der des freien Kragarms.
    const tip = result.displacements.get('n2')?.uz as number;
    expect(tip).toBeGreaterThan(0);
    expect(tip).toBeLessThan((10 * 4 ** 3) / (3 * EI));
    expect(result.elementEndForces.get('b2')?.[2]).toBe(0);
  });

  it('meldet die Kinematik mit besetzter Diagonale am Ergebnis', async () => {
    // Beide Knoten nur vertikal gehalten: die Laengsverschiebung ist ein
    // Starrkoerpermodus. Die Diagonale ist besetzt (EA/L), also faellt es erst
    // beim Loesen auf.
    const store = cantilever();
    store.supports = [
      support('s1', 'n1', 'free', 'fixed', 'free'),
      support('s2', 'n2', 'free', 'fixed', 'free'),
    ];

    await expect(solve(configOver(store))).rejects.toBeInstanceOf(
      SingularStiffnessMatrixError,
    );
  });

  it('kommt mit einem vollstaendig gehaltenen Modell zurecht', async () => {
    const store = cantilever();
    store.supports = [support('s1', 'n1'), support('s2', 'n2')];

    const result = await solve(configOver(store));

    expect(result.displacements.get('n2')).toEqual({ ux: 0, uz: 0, phiY: 0 });
  });

  it('rechnet auch ueber den Rechenkopf', async () => {
    const result = await createFEMSolver(configOver(cantilever())).solve();

    expect(result.displacements.get('n2')?.uz).toBeCloseTo(
      (10 * 2 ** 3) / (3 * EI),
      12,
    );
  });

  it('nimmt einen asynchronen Linearsolver an', async () => {
    // Die produktive Fassung laeuft ueber einen Worker.
    const result = await solve(
      configOver(cantilever(), {
        solveLinearSystem: async (n, K, F) =>
          await Promise.resolve(gaussSolve(n, K, F)),
      }),
    );

    expect(result.displacements.get('n2')?.uz).toBeCloseTo(
      (10 * 2 ** 3) / (3 * EI),
      12,
    );
  });
});

/**
 * Die Resultierende aller Stablasten, unabhaengig vom Solver gerechnet.
 *
 * Bewusst NICHT ueber `resolveLoads`: sonst pruefte die Gleichgewichtsprobe die
 * Aufloesung gegen sich selbst. Deckt genau die Faelle ab, die oben vorkommen.
 */
function resultantOfBeamLoads(store: Store): {
  fx: number;
  fz: number;
  my: number;
} {
  const positionOf = new Map(store.nodes.map((n) => [n.id, n.position] as const));
  const entries: Parameters<typeof resultant>[0][number][] = [];

  for (const load of store.loads) {
    if (load.target !== 'beam') continue;
    for (const beamId of load.beamIds) {
      const target = store.beams.find((b) => b.id === beamId) as {
        startNodeId: string;
        endNodeId: string;
      };
      const p1 = positionOf.get(target.startNodeId) as { x: number; z: number };
      const p2 = positionOf.get(target.endNodeId) as { x: number; z: number };
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const L = Math.hypot(dx, dz);

      if (load.kind === 'moment' && load.distribution === 'point') {
        entries.push({ at: p1, fx: 0, fz: 0, my: load.m });
        continue;
      }
      if (load.kind === 'force' && load.distribution === 'trapezoidal') {
        // Bezugslaenge auf die Waagrechte: der Faktor ist |dx| / L.
        const factor =
          load.referenceLength === 'horizontalProjection'
            ? Math.abs(dx) / L
            : load.referenceLength === 'verticalProjection'
              ? Math.abs(dz) / L
              : 1;
        const total = (((load.q1 + load.q2) / 2) * factor * L);
        // Schwerpunkt der Trapezflaeche entlang der Stabachse.
        const s = (L * (load.q1 + 2 * load.q2)) / (3 * (load.q1 + load.q2));
        entries.push({
          at: { x: p1.x + (dx / L) * s, z: p1.z + (dz / L) * s },
          fx: load.axis === 'x' ? total : 0,
          fz: load.axis === 'z' ? total : 0,
          my: 0,
        });
        continue;
      }
      throw new Error(`Lastfall im Testhelfer nicht abgedeckt: ${load.id}`);
    }
  }

  return resultant(entries);
}
