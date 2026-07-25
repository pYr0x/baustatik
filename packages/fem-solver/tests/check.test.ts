import {
  IsolatedNodeWarning,
  UnknownNodeReferenceError,
  UnsupportedComponentError,
} from '@baustatik/fem';
import {
  createLoadValidator,
  modelGeometry,
  ReferenceFactorBelowMinimumError,
  UnknownLoadTargetError,
  ZeroNodeLoadError,
} from '@baustatik/fem-loads';
import { describe, expect, it } from 'vitest';
import {
  LoadOnIsolatedNodeWarning,
  UnknownSectionPropertiesError,
} from '../src/errors';
import { createAnalysisPolicy } from '../src/policy';
import { createFEMSolver } from '../src/solver';
import { beam, configOver, node, type Store, support } from './support';

/** Ein Stab, gelagert, mit einer Last. Der Zustand `ready`. */
function readyStore(): Store {
  return {
    nodes: [node('n1', 0, 0), node('n2', 2, 0)],
    beams: [beam('b1', 'n1', 'n2')],
    supports: [support('s1', 'n1')],
    loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: 10 }],
  };
}

function reportOver(store: Store, overrides = {}) {
  return createFEMSolver(configOver(store, overrides)).check();
}

describe('check — die fuenf Zustaende', () => {
  it('empty: kein Stab', () => {
    const store = readyStore();
    store.beams = [];
    store.loads = [];

    // Knoten und Auflager liegen herum — der Stab ist das, woran gerechnet
    // wird, und ohne ihn gibt es keine Steifigkeit.
    expect(reportOver(store).state).toBe('empty');
  });

  it('invalid: Modellfehler', () => {
    const store = readyStore();
    store.beams = [beam('b1', 'n1', 'weg')];

    const report = reportOver(store);

    expect(report.state).toBe('invalid');
    expect(report.canSolve).toBe(false);
    expect(report.model.errors[0]).toBeInstanceOf(UnknownNodeReferenceError);
  });

  it('invalid: Lastfehler bei tragendem Modell', () => {
    const store = readyStore();
    store.loads = [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: 0 }];

    const report = reportOver(store);

    expect(report.state).toBe('invalid');
    expect(report.model.errors).toEqual([]);
    expect(report.loads).toMatchObject({ assessed: true });
    expect(
      report.loads.assessed ? report.loads.errors[0] : undefined,
    ).toBeInstanceOf(ZeroNodeLoadError);
  });

  it('unloaded: Modell traegt, aber keine Last', () => {
    const store = readyStore();
    store.loads = [];

    const report = reportOver(store);

    // Kein Fehler — der Anwender hat nichts falsch gemacht, er ist noch nicht
    // fertig. Genau diese Unterscheidung kann eine Fehlerliste nicht treffen.
    expect(report.state).toBe('unloaded');
    expect(report.canSolve).toBe(false);
    expect(report.model.errors).toEqual([]);
    expect(report.loads).toEqual({ assessed: true, errors: [], warnings: [] });
  });

  it('ready-with-warnings: Hinweis haelt nichts auf', () => {
    const store = readyStore();
    store.nodes.push(node('frei', 9, 9));

    const report = reportOver(store);

    expect(report.state).toBe('ready-with-warnings');
    expect(report.canSolve).toBe(true);
    expect(report.model.warnings[0]).toBeInstanceOf(IsolatedNodeWarning);
  });

  it('ready: sauber', () => {
    const report = reportOver(readyStore());

    expect(report.state).toBe('ready');
    expect(report.canSolve).toBe(true);
    expect(report.model).toEqual({ errors: [], warnings: [] });
    expect(report.loads).toEqual({ assessed: true, errors: [], warnings: [] });
  });
});

describe('check — Reihenfolge und Kurzschluss', () => {
  it('beurteilt die Lasten bei Modellfehlern gar nicht erst', () => {
    // Ohne Kurzschluss meldete die Lastpruefung fuer JEDE Last auf dem kaputten
    // Stab zusaetzlich UnknownLoadTargetError — ein Modellfehler wuerde zu
    // zwanzig Meldungen, von denen neunzehn Folgefehler sind.
    const store = readyStore();
    store.beams = [beam('b1', 'n1', 'weg')];
    store.loads = [
      {
        id: 'l1',
        target: 'beam',
        beamIds: ['b1'],
        kind: 'force',
        distribution: 'constant',
        frame: 'global',
        axis: 'z',
        referenceLength: 'trueLength',
        q: 5,
      },
    ];

    const report = reportOver(store);

    expect(report.loads).toEqual({ assessed: false });
  });

  it('meldet einen echten unbekannten Stab weiterhin als Lastfehler', () => {
    // Gegenprobe zum Kurzschluss: ohne Modellfehler wird sehr wohl beurteilt.
    const store = readyStore();
    store.loads = [
      {
        id: 'l1',
        target: 'beam',
        beamIds: ['gibtsnicht'],
        kind: 'force',
        distribution: 'constant',
        frame: 'global',
        axis: 'z',
        referenceLength: 'trueLength',
        q: 5,
      },
    ];

    const report = reportOver(store);

    expect(report.state).toBe('invalid');
    expect(
      report.loads.assessed ? report.loads.errors[0] : undefined,
    ).toBeInstanceOf(UnknownLoadTargetError);
  });
});

describe('check — Steifigkeiten und Lasten auf stablosen Knoten', () => {
  it('macht den fehlenden Querschnitt zu einem Modellfehler', () => {
    // NICHT erst in solve(): sonst meldete check() „ready" und solve() schluege
    // trotzdem fehl — genau die Zweideutigkeit, gegen die der Bericht steht.
    const report = reportOver(readyStore(), {
      getSectionProperties: () => undefined,
    });

    expect(report.state).toBe('invalid');
    expect(report.model.errors[0]).toBeInstanceOf(UnknownSectionPropertiesError);
    expect(report.model.errors[0]).toMatchObject({
      beamId: 'b1',
      crossSectionId: 'default',
      materialId: 'default',
    });
    expect(report.loads).toEqual({ assessed: false });
  });

  it('warnt bei einer Knotenlast auf einem Knoten ohne Stab', () => {
    const store = readyStore();
    store.nodes.push(node('frei', 9, 9));
    store.loads.push({ id: 'l2', target: 'node', nodeIds: ['frei'], fz: 4 });
    // Eine Stablast daneben: sie kann per Konstruktion nicht auf einem
    // stablosen Knoten liegen und darf keine Warnung ausloesen.
    store.loads.push({
      id: 'l3',
      target: 'beam',
      beamIds: ['b1'],
      kind: 'force',
      distribution: 'constant',
      frame: 'global',
      axis: 'z',
      referenceLength: 'trueLength',
      q: 3,
    });

    const report = reportOver(store);

    expect(report.state).toBe('ready-with-warnings');
    const found = report.loads.assessed
      ? report.loads.warnings.filter(
          (candidate) => candidate instanceof LoadOnIsolatedNodeWarning,
        )
      : [];
    expect(found).toHaveLength(1);
    expect(found[0].loadId).toBe('l2');
    expect(found[0].nodeId).toBe('frei');
  });

  it('warnt nicht, solange jeder belastete Knoten einen Stab hat', () => {
    const report = reportOver(readyStore());

    expect(report.loads.assessed && report.loads.warnings).toEqual([]);
  });
});

describe('check — die Analyse-Einstellung', () => {
  /**
   * Ein 3-4-5-Stab mit einer Streckenlast auf die Waagrechtprojektion: der
   * Bezugslaengen-Faktor ist exakt 0,6 und unter der Default-Policy voellig
   * unauffaellig. Jede Schranke im Test liegt damit genau dort, wo sie
   * hingeschrieben wird.
   */
  function projectedStore(): Store {
    return {
      nodes: [node('n1', 0, 0), node('n2', 3, 4)],
      beams: [beam('b1', 'n1', 'n2')],
      supports: [support('s1', 'n1')],
      loads: [
        {
          id: 'l1',
          target: 'beam',
          beamIds: ['b1'],
          kind: 'force',
          distribution: 'constant',
          frame: 'global',
          axis: 'z',
          referenceLength: 'horizontalProjection',
          q: 5,
        },
      ],
    };
  }

  it('prueft die Lasten gegen die eingestellte Policy, nicht gegen den Default', () => {
    const store = projectedStore();

    expect(reportOver(store).state).toBe('ready');

    const strict = reportOver(store, {
      analysisPolicy: createAnalysisPolicy({
        loads: { minimumReferenceFactor: 0.7, suspiciousReferenceFactor: 0.8 },
      }),
    });

    expect(strict.state).toBe('invalid');
    expect(
      strict.loads.assessed ? strict.loads.errors[0] : undefined,
    ).toBeInstanceOf(ReferenceFactorBelowMinimumError);
  });

  it('reicht auch die Warnschwelle bis in den Bericht durch', () => {
    const report = reportOver(projectedStore(), {
      analysisPolicy: createAnalysisPolicy({
        loads: { suspiciousReferenceFactor: 0.65 },
      }),
    });

    expect(report.state).toBe('ready-with-warnings');
    expect(report.canSolve).toBe(true);
  });

  it('stimmt mit der direkten Entwurfsvalidierung des Dialogs ueberein', () => {
    // Der Eingabedialog geht NICHT ueber dieses Package (ADR 0007). Genau
    // deshalb muss er dieselbe Policy binden koennen — sonst akzeptierte er,
    // was der Rechnen-Knopf ablehnt, und nichts zeigte es an.
    const store = projectedStore();
    const policy = createAnalysisPolicy({
      loads: { minimumReferenceFactor: 0.7, suspiciousReferenceFactor: 0.8 },
    });

    const report = reportOver(store, { analysisPolicy: policy });
    const draft = createLoadValidator(policy.loads).validateLoads(
      modelGeometry(store.nodes, store.beams),
      store.loads,
    );

    expect(report.loads.assessed ? report.loads.errors : []).toEqual(
      draft.errors,
    );
    expect(draft.errors[0]).toBeInstanceOf(ReferenceFactorBelowMinimumError);
  });

  it('benutzt in check() und solve() denselben Validator', async () => {
    const solver = createFEMSolver(
      configOver(projectedStore(), {
        analysisPolicy: createAnalysisPolicy({
          loads: { minimumReferenceFactor: 0.7, suspiciousReferenceFactor: 0.8 },
        }),
      }),
    );

    // Der Bericht sagt „nicht rechenbar", und das Tor in solve() haelt
    // denselben Fall auf — nicht einen anderen.
    expect(solver.check().canSolve).toBe(false);
    await expect(solver.solve()).rejects.toBeInstanceOf(
      ReferenceFactorBelowMinimumError,
    );
  });
});

describe('check — PULL', () => {
  it('sieht eine Aenderung nach dem Bauen ohne Neubau', () => {
    const store = readyStore();
    const solver = createFEMSolver(configOver(store));

    expect(solver.check().state).toBe('ready');

    store.supports = [];

    expect(solver.check().state).toBe('invalid');
    expect(solver.check().model.errors[0]).toBeInstanceOf(
      UnsupportedComponentError,
    );
  });

  it('haelt keinen Bericht fest', () => {
    const store = readyStore();
    const solver = createFEMSolver(configOver(store));
    const first = solver.check();

    store.loads = [];

    expect(solver.check().state).toBe('unloaded');
    // Der alte Bericht bleibt, was er war — er ist nur von gestern.
    expect(first.state).toBe('ready');
  });
});
