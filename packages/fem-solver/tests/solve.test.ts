import { UnknownNodeReferenceError } from '@baustatik/fem';
import {
  type FrameElement2DFormulation,
  type SectionProperties,
  Timoshenko2D,
  Timoshenko2DIntegrated,
} from '@baustatik/fem-element';
import {
  InvalidLoadCaseError,
  type LoadCase,
  ZeroNodeLoadError,
} from '@baustatik/fem-loads';
import { describe, expect, it } from 'vitest';
import {
  ImplausibleDisplacementError,
  SingularStiffnessMatrixError,
  SmallRotationAssumptionWarning,
  UnknownLoadCaseError,
  UnrestrainedDegreeOfFreedomError,
} from '../src/errors';
import {
  createAnalysisPolicy,
  DEFAULT_ANALYSIS_POLICY,
} from '../src/policy';
import type { SolverConfig } from '../src/config';
import {
  solveAll,
  solve as solveCase,
  type SolveResult,
} from '../src/solve';
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
  TEST_LOAD_CASE_ID,
} from './support';

// Fast jeder Test hier prueft die Rechenkette — Nummerierung, Assemblierung,
// Vorzeichen — und nicht die Lastfallauswahl. Der Wrapper nimmt deshalb den
// einen Lastfall, den `configOver` aus dem Store baut. Auswahl und Fallfaktor
// haben ihren eigenen Block am Ende der Datei.
function solve(config: SolverConfig): Promise<SolveResult> {
  return solveCase(config, TEST_LOAD_CASE_ID);
}

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
    // Auf 12 Stellen und nicht bitgenau: der Port skaliert vor dem Loesen
    // (`S K S`) und wieder zurueck, und das kostet die letzte Stelle. Ein
    // fairer Preis fuer eine Pivot-Schwelle, die ueberhaupt etwas aussagt.
    const n2 = result.displacements.get('n2');
    expect(n2?.ux).toBeCloseTo(2.5, 12);
    expect(n2?.uz).toBeCloseTo(3.5, 12);
    expect(n2?.phiY).toBeCloseTo(-4.5, 12);
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
      configOver(guided({ start: { theta: true } })),
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
      configOver(guided({ start: { theta: true } })),
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
      configOver(propped({ start: { theta: true } })),
    );
    expect(hinged.reactions.get('n1')?.fz).toBeCloseTo(-12, 10);
    expect(hinged.reactions.get('n2')?.fz).toBeCloseTo(-12, 10);
  });

  /**
   * Laengsgelenk: n1 eingespannt, n2 nur in `ux` gehalten, damit die
   * Laengslast ueberhaupt irgendwo hin kann. Quer bleibt es der Kragarm.
   */
  function sliding(releases?: Parameters<typeof beam>[3]): Store {
    return {
      nodes: [node('n1', 0, 0), node('n2', 2, 0)],
      beams: [beam('b1', 'n1', 'n2', releases)],
      supports: [
        support('s1', 'n1'),
        support('s2', 'n2', 'fixed', 'free', 'free'),
      ],
      loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], fx: 7, fz: 10 }],
    };
  }

  it('nimmt mit EINEM Laengsgelenk die Normalkraft ueberall heraus', async () => {
    // Der Unterschied zum Momentengelenk: das Freisetzen einer VERSCHIEBUNG
    // wirkt nicht nur am freigesetzten Ende. Aus [[EA/L, -EA/L], [-EA/L,
    // EA/L]] wird nach der Kondensation von u1 genau K[u2][u2] = 0 — ein Stab,
    // der an einer Stelle gleitet, traegt nirgends Normalkraft.
    const result = await solve(
      configOver(sliding({ start: { u: true } })),
    );

    const forces = result.elementEndForces.get('b1');
    expect(forces?.[0]).toBe(0);
    expect(forces?.[3]).toBe(0);

    // Die Laengslast haengt damit allein am Auflager bei n2; die Einspannung
    // sieht von ihr nichts.
    expect(result.reactions.get('n1')?.fx).toBeCloseTo(0, 10);
    expect(result.reactions.get('n2')?.fx).toBeCloseTo(-7, 10);

    // Quer bleibt alles beim Alten: der Kragarm mit P am freien Ende.
    expect(result.displacements.get('n2')?.uz).toBeCloseTo(
      (10 * 2 ** 3) / (3 * EI),
      12,
    );
  });

  it('laeuft durch, wenn beide Enden laengs freigesetzt sind', async () => {
    // Der Pivot 0 in `condense` — kein Notausgang fuer krumme Eingaben,
    // sondern der gerade Weg: nach dem ersten Schritt ist K[u2][u2] exakt 0,
    // der zweite findet nichts mehr zu verteilen. Das Ergebnis muss deshalb
    // dasselbe sein wie mit nur einem Gelenk, und vor allem endlich.
    const one = await solve(configOver(sliding({ start: { u: true } })));
    const both = await solve(
      configOver(sliding({ start: { u: true }, end: { u: true } })),
    );

    expect(both.displacements.get('n2')?.uz).toBeCloseTo(
      one.displacements.get('n2')?.uz as number,
      12,
    );
    expect(both.reactions.get('n2')?.fx).toBeCloseTo(-7, 10);
    expect(
      (both.elementEndForces.get('b1') as readonly number[]).every((value) =>
        Number.isFinite(value),
      ),
    ).toBe(true);
  });

  it('macht mit dem Querkraftgelenk aus 4EI/L die EI/L', async () => {
    /**
     * Querkraftgelenk am Stabanfang, beide Knoten quer gehalten, am Ende ein
     * Moment. Ohne Gelenk traegt die Verdrehung 4EI/L; mit ihm kann keine
     * Querkraft mehr uebertragen werden, das Moment ist also ueber die ganze
     * Laenge konstant und die Endverdrehung wird zu m*L/EI — viermal so gross.
     */
    function sheared(releases?: Parameters<typeof beam>[3]): Store {
      return {
        nodes: [node('n1', 0, 0), node('n2', 2, 0)],
        beams: [beam('b1', 'n1', 'n2', releases)],
        supports: [
          support('s1', 'n1'),
          support('s2', 'n2', 'free', 'fixed', 'free'),
        ],
        loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], my: 10 }],
      };
    }

    const rigid = await solve(configOver(sheared()));
    const hinged = await solve(configOver(sheared({ start: { w: true } })));

    expect(rigid.displacements.get('n2')?.phiY).toBeCloseTo(
      (10 * 2) / (4 * EI),
      12,
    );
    expect(hinged.displacements.get('n2')?.phiY).toBeCloseTo(
      (10 * 2) / EI,
      12,
    );

    // Dieselbe selbstpruefende Eigenschaft wie beim Momentengelenk, eine Zeile
    // weiter: an der freigesetzten Stelle steht exakt 0 — und weil die
    // Querkraft im unbelasteten Stab konstant ist, am anderen Ende auch.
    const forces = hinged.elementEndForces.get('b1');
    expect(forces?.[1]).toBe(0);
    expect(forces?.[4]).toBeCloseTo(0, 10);
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
          beam('b2', 'n2', 'n3', { end: { theta: true } }),
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
      beam('b1', 'n1', 'n2', { start: { theta: true }, end: { theta: true } }),
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
        beam('b2', 'n3', 'n2', { start: { theta: true }, end: { theta: true } }),
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

  it('meldet die Kinematik mit besetzter Diagonale und nennt die Stelle', async () => {
    // Beide Knoten nur vertikal gehalten: die Laengsverschiebung ist ein
    // Starrkoerpermodus. Die Diagonale ist besetzt (EA/L), also faellt es erst
    // beim Loesen auf — und zwar erst in der ZWEITEN Laengszeile, weil die
    // erste fuer sich noch harmlos aussieht.
    const store = cantilever();
    store.supports = [
      support('s1', 'n1', 'free', 'fixed', 'free'),
      support('s2', 'n2', 'free', 'fixed', 'free'),
    ];

    const failure = await solve(configOver(store)).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(SingularStiffnessMatrixError);
    const singular = failure as SingularStiffnessMatrixError;
    expect(singular.nodeId).toBe('n2');
    expect(singular.dof).toBe('ux');
    // Exakter Fehlschlag der Zerlegung, kein Grenzfall.
    expect(singular.pivotRatio).toBe(0);
  });

  it('meldet auch das FAST kinematische System', async () => {
    // Der Fall, den frueher NICHTS gefangen hat: die Zerlegung gelingt, das
    // Ergebnis ist gross aber endlich — und trotzdem Rauschen.
    //
    // Dasselbe Modell wie oben (Laengsverschiebung ist ein Starrkoerpermodus),
    // nur bekommt jede Diagonale einen Hauch Steifigkeit dazu. Das macht aus
    // dem exakt singulaeren ein fast singulaeres System, ohne dass der Test
    // wissen muss, WO der Mechanismus sitzt: die Laengszeilen werden von
    // `[[1,-1],[-1,1]]` zu `[[1+e,-1],[-1,1+e]]` und damit gerade eben positiv
    // definit. Der Biegeanteil merkt von `e = 1e-14` nichts.
    const store = cantilever();
    store.supports = [
      support('s1', 'n1', 'free', 'fixed', 'free'),
      support('s2', 'n2', 'free', 'fixed', 'free'),
    ];

    const failure = await solve(
      configOver(store, {
        solveLinearSystem: (n, K, F) => {
          const nudged = Float64Array.from(K);
          for (let i = 0; i < n; i += 1) {
            nudged[i * n + i] *= 1 + 1e-14;
          }
          return gaussSolve(n, nudged, F);
        },
      }),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SingularStiffnessMatrixError);
    const singular = failure as SingularStiffnessMatrixError;
    // Gelungen zerlegt, aber unter der Schwelle: klein UND positiv. Genau
    // dieser Bereich lieferte frueher klaglos Unsinn.
    expect(singular.pivotRatio).toBeGreaterThan(0);
    expect(singular.pivotRatio).toBeLessThan(1e-12);
    // Und die Stelle wird trotzdem benannt.
    expect(singular.nodeId).toBe('n2');
    expect(singular.dof).toBe('ux');
  });

  it('kommt mit einem vollstaendig gehaltenen Modell zurecht', async () => {
    const store = cantilever();
    store.supports = [support('s1', 'n1'), support('s2', 'n2')];

    const result = await solve(configOver(store));

    expect(result.displacements.get('n2')).toEqual({ ux: 0, uz: 0, phiY: 0 });
  });

  it('rechnet auch ueber den Rechenkopf', async () => {
    const result = await createFEMSolver(configOver(cantilever())).solve(
      TEST_LOAD_CASE_ID,
    );

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

describe('solve — die Verformungspruefung', () => {
  /**
   * Das Demo-System, dessen Befund diese Pruefung ausgeloest hat: EIN Auflager,
   * das `ux` und `uz` haelt und `phiY` freilaesst. Die Drehung um diesen Knoten
   * ist ein Starrkoerpermodus — das Modell ist per Konstruktion ein Mechanismus,
   * unabhaengig davon, wo der dritte Knoten liegt.
   */
  function demoMechanism(x: number, z: number): Store {
    return {
      nodes: [node('n1', 0, 0), node('n2', 100, 0), node('n3', x, z)],
      beams: [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3')],
      supports: [support('s1', 'n1', 'fixed', 'fixed', 'free')],
      loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: 10 }],
    };
  }

  it('faengt den Mechanismus, den der Port fuer geloest haelt', async () => {
    // DER REGRESSIONSTEST. Derselbe Mechanismus wie bei (160, 40), nur ein paar
    // Meter tiefer — und schon meldet der Port nicht mehr `singular`, sondern
    // rechnet klaglos durch. Was die Assemblierung an Stellen verliert, holt
    // keine Zerlegung zurueck: in `K` steht danach die exakte Matrix eines
    // geringfuegig anderen Modells, und dieses andere Modell ist tragfaehig.
    // Sichtbar wird der Mechanismus erst am ERGEBNIS.
    const outcomes: string[] = [];

    const failure = await solve(
      configOver(demoMechanism(165, 10), {
        formulation: Timoshenko2D,
        solveLinearSystem: (n, K, F) => {
          const outcome = gaussSolve(n, K, F);
          outcomes.push(outcome.kind);
          return outcome;
        },
      }),
    ).catch((error: unknown) => error);

    // Der Port hat nichts zu beanstanden — genau darum geht es.
    expect(outcomes).toEqual(['solved']);

    expect(failure).toBeInstanceOf(ImplausibleDisplacementError);
    const implausible = failure as ImplausibleDisplacementError;
    // Genannt wird die VERDREHUNG an n1 — dem Auflagerknoten, dessen freies
    // `phiY` der Mechanismus ist. Die Starrkoerperdrehung ist an allen drei
    // Knoten dieselbe; gemeldet wird der erste. Anders als beim Pivot-Hinweis
    // ist das kein Zufallstreffer der Zerlegung, sondern der Freiheitsgrad, der
    // sich tatsaechlich bewegt.
    expect(implausible.nodeId).toBe('n1');
    expect(implausible.dof).toBe('phiY');
    expect(implausible.value).toBeGreaterThan(1e9);
  });

  it('laesst eine grosse, aber legitime Verformung durch', async () => {
    // Die Gegenprobe, ohne die die Pruefung wertlos waere: ein Kragarm mit
    // 1.3 rad Endverdrehung ist statisch Unsinn, aber KEIN Mechanismus. Er
    // bekommt einen Hinweis und ein Ergebnis, keinen Wurf.
    const result = await solve(
      configOver(cantilever(2, 130), { formulation: Timoshenko2D }),
    );

    expect(result.displacements.get('n2')?.phiY).toBeLessThan(-0.1);
    expect(result.warnings.map((w) => w.constructor.name)).toContain(
      'SmallRotationAssumptionWarning',
    );
  });

  it('meldet ein sauberes Ergebnis ohne Warnung', async () => {
    const result = await solve(configOver(cantilever()));

    expect(result.warnings).toEqual([]);
  });

  it('warnt genau oberhalb von warn und wirft genau oberhalb von fail', async () => {
    // Dieselbe Rechnung dreimal, nur die Grenzen wandern: so haengt der Test an
    // der Staffelung und nicht an einer bestimmten Verformung.
    const store = cantilever();
    const limitsAt = (warn: number, fail: number) =>
      configOver(store, {
        analysisPolicy: createAnalysisPolicy({
          shearDeformation: false,
          deformationLimits: {
            warn: { rotation: warn, relativeDisplacement: 1e5 },
            fail: { rotation: fail, relativeDisplacement: 1e6 },
          },
        }),
      });

    // phi am Kragarmende ist PL^2/2EI = 0.02 rad.
    const rotation = 0.02;

    const quiet = await solve(limitsAt(rotation * 2, rotation * 4));
    expect(quiet.warnings).toEqual([]);

    const warned = await solve(limitsAt(rotation / 2, rotation * 4));
    expect(warned.warnings).toHaveLength(1);
    expect(warned.warnings[0]).toBeInstanceOf(SmallRotationAssumptionWarning);
    expect(warned.warnings[0].nodeId).toBe('n2');

    const failure = await solve(limitsAt(rotation / 4, rotation / 2)).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(ImplausibleDisplacementError);
    expect((failure as ImplausibleDisplacementError).dof).toBe('phiY');
    expect((failure as ImplausibleDisplacementError).limit).toBe(rotation / 2);
  });

  it('meldet je Groesse nur den groessten Ausschlag', async () => {
    // Hoechstens zwei Warnungen, egal wie viele Knoten die Grenze reissen: der
    // Befund gilt dem ERGEBNIS. Je Knoten zu melden ergaebe bei einem grossen
    // Modell Hunderte Warnungen, die alle dasselbe sagen.
    const store: Store = {
      nodes: [
        node('n1', 0, 0),
        node('n2', 1, 0),
        node('n3', 2, 0),
        node('n4', 3, 0),
      ],
      beams: [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3'), beam('b3', 'n3', 'n4')],
      supports: [support('s1', 'n1')],
      loads: [{ id: 'l1', target: 'node', nodeIds: ['n4'], fz: 500 }],
    };

    const result = await solve(configOver(store));

    // Drei Knoten liegen ueber der Grenze, gemeldet werden zwei Groessen.
    expect(result.warnings).toHaveLength(2);
    // `SolveWarning` ist schmal, die Groesse gehoert der einzelnen Warnung —
    // der Aufrufer grenzt mit `instanceof` ein.
    const excesses = result.warnings.filter(
      (w) => w instanceof SmallRotationAssumptionWarning,
    );
    expect(excesses.map((w) => w.dof)).toEqual(['phiY', 'uz']);
    // Und zwar der jeweils groesste Ausschlag — am freien Ende.
    expect(result.warnings[0].nodeId).toBe('n4');
    expect(result.warnings[1].nodeId).toBe('n4');
  });

  it('misst die Verschiebung gegen den angehaengten Stab', async () => {
    // `uz` am Kragarmende ist PL^3/3EI = 0.0267 m bei L = 2 m, also
    // |u|/L = 0.0133. Die Verdrehungsgrenze steht so hoch, dass nur die
    // bezogene Verschiebung anschlagen kann.
    const store = cantilever();
    const failure = await solve(
      configOver(store, {
        analysisPolicy: createAnalysisPolicy({
          shearDeformation: false,
          deformationLimits: {
            warn: { rotation: 1e5, relativeDisplacement: 0.001 },
            fail: { rotation: 1e6, relativeDisplacement: 0.01 },
          },
        }),
      }),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImplausibleDisplacementError);
    const implausible = failure as ImplausibleDisplacementError;
    expect(implausible.nodeId).toBe('n2');
    expect(implausible.dof).toBe('uz');
    expect(implausible.value).toBeCloseTo((10 * 2 ** 3) / (3 * EI) / 2, 12);
  });

  it('bleibt still, wenn die Last den Mechanismus nicht anregt', async () => {
    // DIE EHRLICHE GRENZE, als Test festgehalten: eine Last, deren Resultierende
    // durch den Drehpunkt zeigt, erzeugt keine Bewegung. Die Pruefung schweigt,
    // und das Modell ist trotzdem kinematisch. Deshalb ist sie das VIERTE Netz
    // und nicht der Ersatz fuer das Pivot.
    const store = demoMechanism(165, 10);
    // Eine reine Laengskraft in der Achse des ersten Stabs, angesetzt auf der
    // Wirkungslinie durch das Auflager: kein Moment um n1, keine Drehung.
    store.nodes = [node('n1', 0, 0), node('n2', 100, 0), node('n3', 200, 0)];
    store.loads = [{ id: 'l1', target: 'node', nodeIds: ['n2'], fx: 10 }];

    const result = await solve(
      configOver(store, { formulation: Timoshenko2D }),
    ).catch((error: unknown) => error);

    // Entweder faengt das Pivot es (dann ist es kein Beleg fuer die Luecke) oder
    // die Rechnung geht durch, ohne dass die Verformungspruefung etwas sieht.
    if (!(result instanceof Error)) {
      expect(result.warnings).toEqual([]);
    } else {
      expect(result).toBeInstanceOf(SingularStiffnessMatrixError);
    }
  });
});

describe('solve — Lastfallauswahl', () => {
  it('sagt im Ergebnis, welcher Lastfall gerechnet wurde', async () => {
    // Ein Ergebnis ohne diese Angabe kann man nicht ablegen.
    const result = await solveCase(configOver(cantilever()), TEST_LOAD_CASE_ID);

    expect(result.loadCaseId).toBe(TEST_LOAD_CASE_ID);
  });

  it('wirft bei einer id, die es nicht gibt', async () => {
    // Erreichbar durch eine VERALTETE id: der aktive Lastfall ist geloescht,
    // die Oberflaeche fragt mit der alten weiter.
    await expect(
      solveCase(configOver(cantilever()), 'geloescht'),
    ).rejects.toBeInstanceOf(UnknownLoadCaseError);
  });

  it('rechnet den GENANNTEN Fall, nicht den ersten', async () => {
    const store = cantilever();
    const cases: LoadCase[] = [
      { id: 'lf-1', name: 'Erster', loads: store.loads },
      { id: 'lf-2', name: 'Zweiter', loads: [] },
    ];
    const config = configOver(store, { getLoadCases: () => cases });

    const second = await solveCase(config, 'lf-2');

    expect(second.loadCaseId).toBe('lf-2');
    // Der leere Fall traegt nichts ein — also keine Verformung.
    expect(second.displacements.get('n2')?.uz).toBe(0);
    expect(
      (await solveCase(config, 'lf-1')).displacements.get('n2')?.uz,
    ).toBeCloseTo((10 * 2 ** 3) / (3 * EI), 12);
  });
});

describe('solve — der Lastfallfaktor', () => {
  it('skaliert das Ergebnis linear', async () => {
    // Die Rechnung ist linear, also ist der Faktor am Ergebnis derselbe wie an
    // der Last. Nachgerechnet statt behauptet, weil `effectiveLoads` zwischen
    // Eingabe und Steifigkeitsmatrix sitzt.
    const plain = await solve(configOver(cantilever()));
    const doubled = await solve(configOver({ ...cantilever(), factor: 2 }));

    expect(doubled.displacements.get('n2')?.uz).toBeCloseTo(
      2 * (plain.displacements.get('n2')?.uz as number),
      12,
    );
    expect(doubled.reactions.get('n1')?.fz).toBeCloseTo(
      2 * (plain.reactions.get('n1')?.fz as number),
      12,
    );
    expect(doubled.elementEndForces.get('b1')?.[2]).toBeCloseTo(
      2 * (plain.elementEndForces.get('b1')?.[2] as number),
      12,
    );
  });

  it('kehrt bei Faktor -1 alle Vorzeichen um', async () => {
    // Der Anwendungsfall: kopierter Windlastfall, umgekehrt.
    const plain = await solve(configOver(cantilever()));
    const reversed = await solve(configOver({ ...cantilever(), factor: -1 }));

    expect(reversed.displacements.get('n2')?.uz).toBeCloseTo(
      -(plain.displacements.get('n2')?.uz as number),
      12,
    );
    expect(reversed.reactions.get('n1')?.my).toBeCloseTo(
      -(plain.reactions.get('n1')?.my as number),
      12,
    );
  });

  it('verschiebt bei negativem Faktor keine Last — er spiegelt nur', async () => {
    // DER TEST, der die Trennung von Lastwert und Lage im Solver festnagelt.
    // Wuerde `effectiveLoads` `distanceFromStart` mitskalieren, kaeme hier ein
    // NegativeDistanceError aus dem Tor — bei einer Last, die der Anwender
    // korrekt eingegeben hat.
    const store: Store = {
      nodes: [node('n1', 0, 0), node('n2', 2, 0)],
      beams: [beam('b1', 'n1', 'n2')],
      supports: [support('s1', 'n1')],
      loads: [
        {
          id: 'l1',
          target: 'beam',
          beamIds: ['b1'],
          kind: 'force',
          distribution: 'point',
          frame: 'global',
          axis: 'z',
          p: 10,
          distanceFromStart: 2,
        },
      ],
    };

    const plain = await solve(configOver(store));
    const reversed = await solve(configOver({ ...store, factor: -1 }));

    // Am Stabende, also dieselbe Stelle wie beim Kragarm mit Knotenlast.
    expect(plain.displacements.get('n2')?.uz).toBeCloseTo(
      (10 * 2 ** 3) / (3 * EI),
      12,
    );
    expect(reversed.displacements.get('n2')?.uz).toBeCloseTo(
      -(10 * 2 ** 3) / (3 * EI),
      12,
    );
  });

  it('prueft das Tor an den EINGEGEBENEN Werten', async () => {
    // Die Meldung nennt die Zahl, die der Anwender getippt hat — 0, nicht 0
    // mal Faktor. Sichtbar wird der Unterschied nur an der Meldung; dass
    // ueberhaupt geworfen wird, waere in beiden Entwuerfen gleich.
    const store: Store = { ...cantilever(), factor: -2 };
    store.loads = [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: 0 }];

    await expect(solve(configOver(store))).rejects.toBeInstanceOf(
      ZeroNodeLoadError,
    );
  });

  it('haelt einen unbrauchbaren Faktor am Tor auf', async () => {
    // Ein Objektliteral kann `assertValidLoadCase` umgehen — deshalb prueft das
    // Tor selbst. Ohne diese Zeile lief `NaN` durch die ganze Kette und kaeme
    // als Verformung heraus.
    for (const factor of [0, Number.NaN, Infinity]) {
      await expect(
        solve(configOver({ ...cantilever(), factor })),
      ).rejects.toBeInstanceOf(InvalidLoadCaseError);
    }
  });
});

describe('solveAll — alle Lastfaelle', () => {
  const twoCases = (store: Store): LoadCase[] => [
    { id: 'lf-1', name: 'Einfach', loads: store.loads },
    { id: 'lf-2', name: 'Umgekehrt', loads: store.loads, factor: -1 },
  ];

  it('liefert ein Ergebnis je Fall, in der Reihenfolge der Faelle', async () => {
    const store = cantilever();
    const results = await solveAll(
      configOver(store, { getLoadCases: () => twoCases(store) }),
    );

    expect(results.map((r) => r.loadCaseId)).toEqual(['lf-1', 'lf-2']);
    // Das Array ist ohne eine Zuordnung daneben lesbar — genau dafuer traegt
    // jedes Ergebnis seine id.
    const [plain, reversed] = results;
    expect(reversed.displacements.get('n2')?.uz).toBeCloseTo(
      -(plain.displacements.get('n2')?.uz as number),
      12,
    );
  });

  it('liefert ein leeres Array, wenn es keinen Lastfall gibt', async () => {
    const results = await solveAll(
      configOver(cantilever(), { getLoadCases: () => [] }),
    );

    expect(results).toEqual([]);
  });

  it('bricht beim ersten kaputten Fall ab', async () => {
    const store = cantilever();
    const cases: LoadCase[] = [
      { id: 'lf-1', name: 'Gut', loads: store.loads },
      { id: 'lf-2', name: 'Kaputt', loads: store.loads, factor: 0 },
    ];

    await expect(
      solveAll(configOver(store, { getLoadCases: () => cases })),
    ).rejects.toBeInstanceOf(InvalidLoadCaseError);
  });

  it('rechnet auch ueber den Rechenkopf', async () => {
    const store = cantilever();
    const solver = createFEMSolver(
      configOver(store, { getLoadCases: () => twoCases(store) }),
    );

    expect((await solver.solveAll()).map((r) => r.loadCaseId)).toEqual([
      'lf-1',
      'lf-2',
    ]);
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
