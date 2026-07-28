import { Timoshenko2D } from '@baustatik/fem-element';
import { Line, Point, Vector } from '@baustatik/fem-geometry';
import {
  type BeamLoad,
  type FEMLoad,
  type LoadModelGeometry,
  type NodeLoad,
  UnknownLoadTargetError,
} from '@baustatik/fem-loads';
import { describe, expect, it } from 'vitest';
import { resolveLoads } from '../src/resolve';

// z zeigt abwaerts. `down45` faellt nach rechts, `up45` steigt nach rechts —
// die beiden zusammen diskriminieren die Frame-Drehung, weil bei `up45` die
// lokalen Komponenten VERSCHIEDENE Vorzeichen bekommen.
const HORIZONTAL = Line.make(Point.make(0, 0), Point.make(4, 0));
const REVERSED = Line.make(Point.make(4, 0), Point.make(0, 0));
const DOWN45 = Line.make(Point.make(0, 0), Point.make(1, 1));
const UP45 = Line.make(Point.make(0, 0), Point.make(1, -1));
// 3-4-5: die Grundrisslaenge ist 3, die Stablaenge 5, der Faktor also glatt 0.6.
const ROOF = Line.make(Point.make(0, 0), Point.make(3, -4));

const model: LoadModelGeometry = {
  hasNode: (nodeId) => ['n1', 'n2'].includes(nodeId),
  beamAxis: (beamId) =>
    ({
      h: HORIZONTAL,
      rev: REVERSED,
      down45: DOWN45,
      up45: UP45,
      roof: ROOF,
    })[beamId],
};

const S = Math.SQRT1_2;

function beamForce(load: Record<string, unknown>): BeamLoad {
  return {
    id: 'load-1',
    target: 'beam',
    kind: 'force',
    frame: 'global',
    axis: 'z',
    referenceLength: 'trueLength',
    ...load,
  } as BeamLoad;
}

/** Die lokalen Streckenlast-Komponenten des einzigen Segments eines Stabes. */
function onlySegment(loads: FEMLoad[], beamId: string) {
  const resolved = resolveLoads(model, loads);
  const local = resolved.beams.get(beamId);
  expect(local?.segments).toHaveLength(1);
  return local?.segments[0];
}

describe('resolveLoads: Frame-Drehung', () => {
  // Sagt nichts ueber schraege Staebe, faengt aber grobe Vorzeichenfehler.
  it('am waagrechten Stab sind global und local identisch', () => {
    for (const axis of ['x', 'z'] as const) {
      const global = onlySegment(
        [beamForce({ beamIds: ['h'], distribution: 'constant', frame: 'global', axis, q: 5 })],
        'h',
      );
      const local = onlySegment(
        [beamForce({ beamIds: ['h'], distribution: 'constant', frame: 'local', axis, q: 5 })],
        'h',
      );
      expect(global).toEqual(local);
    }
  });

  // Der eigentliche Test der Drehung — und er prueft VORZEICHEN, nicht Betraege.
  it('am 45-Grad-Stab zerfaellt eine globale z-Last in gleiche Anteile', () => {
    const seg = onlySegment(
      [beamForce({ beamIds: ['down45'], distribution: 'constant', q: 10 })],
      'down45',
    );

    expect(seg?.qx1).toBeCloseTo(10 * S, 12);
    expect(seg?.qz1).toBeCloseTo(10 * S, 12);
  });

  it('am gegenlaeufig geneigten Stab bekommen die Anteile verschiedene Vorzeichen', () => {
    const seg = onlySegment(
      [beamForce({ beamIds: ['up45'], distribution: 'constant', q: 10 })],
      'up45',
    );

    expect(seg?.qx1).toBeCloseTo(-10 * S, 12);
    expect(seg?.qz1).toBeCloseTo(10 * S, 12);
  });

  // Die Stabrichtung ist die Knotenreihenfolge, und die legt lokal z fest:
  // `rev` ist derselbe waagrechte Stab wie `h`, nur andersherum eingegeben, und
  // hat deshalb lokal z nach oben. Dieselbe globale Last kommt lokal gekippt an
  // — was der naechste Test wieder einsammelt: global wirkt sie unveraendert.
  it('vertauschte Knoten kippen die lokalen Komponenten einer globalen Last', () => {
    for (const axis of ['x', 'z'] as const) {
      const forward = onlySegment(
        [beamForce({ beamIds: ['h'], distribution: 'constant', axis, q: 7 })],
        'h',
      );
      const backward = onlySegment(
        [beamForce({ beamIds: ['rev'], distribution: 'constant', axis, q: 7 })],
        'rev',
      );

      expect(backward?.qx1).toBeCloseTo(-(forward?.qx1 ?? Number.NaN), 12);
      expect(backward?.qz1).toBeCloseTo(-(forward?.qz1 ?? Number.NaN), 12);
    }
  });

  it('vertauschte Knoten: global bleibt global gleich, local spiegelt sich', () => {
    const asGlobal = (beamId: string, frame: 'global' | 'local') => {
      const seg = onlySegment(
        [beamForce({ beamIds: [beamId], distribution: 'constant', frame, axis: 'z', q: 7 })],
        beamId,
      );
      const line = beamId === 'h' ? HORIZONTAL : REVERSED;
      return Line.toGlobal(line, Vector.make(seg?.qx1 ?? 0, seg?.qz1 ?? 0));
    };

    // Dieselbe globale Last wirkt global gleich, egal wie der Stab laeuft.
    expect(asGlobal('rev', 'global').dz).toBeCloseTo(asGlobal('h', 'global').dz, 12);
    // Eine LOKALE Last dreht sich mit dem Stab und wirkt global entgegengesetzt.
    expect(asGlobal('rev', 'local').dz).toBeCloseTo(-asGlobal('h', 'local').dz, 12);
  });
});

describe('resolveLoads: Bezugslaenge', () => {
  // Der Schneefall. Die Gesamtresultierende muss q * Grundrisslaenge sein,
  // unabhaengig davon, wie sie sich lokal zerlegt.
  it('Schnee auf dem Dach: Summe ist q mal die Grundrisslaenge', () => {
    const q = 2;
    const seg = onlySegment(
      [
        beamForce({
          beamIds: ['roof'],
          distribution: 'constant',
          q,
          referenceLength: 'horizontalProjection',
        }),
      ],
      'roof',
    );

    const L = Line.length(ROOF);
    const global = Line.toGlobal(ROOF, Vector.make(seg?.qx1 ?? 0, seg?.qz1 ?? 0));

    expect(global.dx * L).toBeCloseTo(0, 12);
    expect(global.dz * L).toBeCloseTo(q * 3, 12);
  });

  it("'trueLength' laesst den Wert unveraendert", () => {
    const seg = onlySegment(
      [beamForce({ beamIds: ['roof'], distribution: 'constant', frame: 'local', axis: 'z', q: 2 })],
      'roof',
    );
    expect(seg?.qz1).toBe(2);
  });
});

describe('resolveLoads: Momente und ihr Drehsinn', () => {
  // DER Vorzeichentest. `Ntheta(0)` ist exakt [0,0,1,0,0,0], ein Einzelmoment
  // am Anfangsknoten muss also ein REINES Knotenmoment ergeben — und dessen
  // Vorzeichen ist die Antwort auf `phiY = -theta`.
  it('ein Stab-Einzelmoment bei a=0 wird zum negierten Knotenmoment', () => {
    const m = 12;
    const resolved = resolveLoads(model, [
      {
        id: 'load-1',
        target: 'beam',
        beamIds: ['h'],
        kind: 'moment',
        distribution: 'point',
        m,
        distanceFromStart: 0,
      } as BeamLoad,
    ]);

    const local = resolved.beams.get('h');
    expect(local?.points).toEqual([{ a: 0, px: 0, pz: 0, my: -m }]);

    const f = Timoshenko2D.prepare(
      { EA: 1, EI: 1, GAs: 'rigid' },
      Line.length(HORIZONTAL),
    ).withLoad(local ?? { segments: [], points: [] }).consistentLoad();

    for (const [i, want] of [0, 0, -m, 0, 0, 0].entries()) {
      expect(f[i]).toBeCloseTo(want, 12);
    }
  });

  it('das Streckenmoment wird ebenso negiert', () => {
    const seg = onlySegment(
      [
        {
          id: 'load-1',
          target: 'beam',
          beamIds: ['h'],
          kind: 'moment',
          distribution: 'constant',
          m: 3,
        } as BeamLoad,
      ],
      'h',
    );
    expect(seg?.my1).toBe(-3);
    expect(seg?.my2).toBe(-3);
  });

  it('das trapezfoermige Streckenmoment negiert BEIDE Werte, Lage bleibt', () => {
    const seg = onlySegment(
      [
        {
          id: 'load-1',
          target: 'beam',
          beamIds: ['h'],
          kind: 'moment',
          distribution: 'trapezoidal',
          m1: 2,
          m2: -6,
          from: 1,
          to: 3,
        } as BeamLoad,
      ],
      'h',
    );

    expect(seg?.my1).toBe(-2);
    expect(seg?.my2).toBe(6);
    // Abstaende sind entlang der Stabachse gemessen und bleiben unberuehrt.
    expect(seg?.from).toBe(1);
    expect(seg?.to).toBe(3);
    // Ein Moment traegt keine Kraftanteile.
    expect(seg?.qx1).toBe(0);
    expect(seg?.qz1).toBe(0);
  });

  // Die Asymmetrie: eine Knotenlast laeuft nie durch ein Element.
  it('ein Knotenmoment behaelt sein Vorzeichen', () => {
    const resolved = resolveLoads(model, [
      { id: 'load-1', target: 'node', nodeIds: ['n1'], my: 12 } as NodeLoad,
    ]);
    expect(resolved.nodes.get('n1')).toEqual({ fx: 0, fz: 0, my: 12 });
  });
});

describe('resolveLoads: Lage', () => {
  // Dieselbe Konvention von der anderen Seite: `a` misst vom ANFANGSknoten, und
  // der ist bei `rev` das andere Ende desselben Stabes. Die Zahl bleibt gleich,
  // die Stelle im Modell nicht.
  it('die Lage misst vom Anfangsknoten und wandert mit der Stabrichtung', () => {
    const globalPointOf = (beamId: string, line: Line) => {
      const resolved = resolveLoads(model, [
        beamForce({
          beamIds: [beamId],
          distribution: 'point',
          p: 10,
          distanceFromStart: 1,
        }),
      ]);
      const a = resolved.beams.get(beamId)?.points[0]?.a ?? Number.NaN;
      return Point.translate(line.p1, Vector.scale(Line.direction(line), a));
    };

    expect(globalPointOf('h', HORIZONTAL).x).toBeCloseTo(1, 12);
    expect(globalPointOf('rev', REVERSED).x).toBeCloseTo(3, 12);
  });

  it('relative Abstaende ergeben je Stab andere absolute Lagen', () => {
    const resolved = resolveLoads(model, [
      beamForce({
        beamIds: ['h', 'roof'],
        distribution: 'point',
        p: 10,
        distanceFromStart: 50,
        relativeDistances: true,
      }),
    ]);

    expect(resolved.beams.get('h')?.points[0]?.a).toBeCloseTo(2, 12);
    expect(resolved.beams.get('roof')?.points[0]?.a).toBeCloseTo(2.5, 12);
  });

  // Absicherung der Invariante aus `fem-element/src/types.ts`: 0 <= from <= to <= L.
  it('100 Prozent landen exakt auf L, nicht knapp darueber', () => {
    for (const beamId of ['down45', 'roof']) {
      const seg = onlySegment(
        [
          beamForce({
            beamIds: [beamId],
            distribution: 'trapezoidal',
            q1: 1,
            q2: 1,
            from: 0,
            to: 100,
            relativeDistances: true,
          }),
        ],
        beamId,
      );
      const L = Line.length(model.beamAxis(beamId) ?? HORIZONTAL);
      expect(seg?.from).toBe(0);
      expect(seg?.to).toBe(L);
    }
  });

  it('fullLength deckt den ganzen Stab ab', () => {
    const seg = onlySegment(
      [
        beamForce({
          beamIds: ['h'],
          distribution: 'trapezoidal',
          q1: 1,
          q2: 3,
          fullLength: true,
        }),
      ],
      'h',
    );
    expect(seg?.from).toBe(0);
    expect(seg?.to).toBe(4);
    expect(seg?.qz1).toBe(1);
    expect(seg?.qz2).toBe(3);
  });
});

describe('resolveLoads: Merge', () => {
  it('zwei Lasten auf einem Stab geben zwei Segmente in Eingabereihenfolge', () => {
    const resolved = resolveLoads(model, [
      beamForce({ id: 'a', beamIds: ['h'], distribution: 'constant', q: 3 }),
      beamForce({ id: 'b', beamIds: ['h'], distribution: 'constant', q: 5 }),
    ]);

    const segments = resolved.beams.get('h')?.segments ?? [];
    expect(segments).toHaveLength(2);
    expect(segments[0]?.qz1).toBe(3);
    expect(segments[1]?.qz1).toBe(5);
  });

  it('summiert mehrere Lasten am selben Knoten', () => {
    const resolved = resolveLoads(model, [
      { id: 'a', target: 'node', nodeIds: ['n1', 'n2'], fz: 10 } as NodeLoad,
      { id: 'b', target: 'node', nodeIds: ['n1'], fx: 5, my: 2 } as NodeLoad,
    ]);

    expect(resolved.nodes.get('n1')).toEqual({ fx: 5, fz: 10, my: 2 });
    expect(resolved.nodes.get('n2')).toEqual({ fx: 0, fz: 10, my: 0 });
  });

  it('lastfreie Staebe und Knoten tauchen gar nicht erst auf', () => {
    const resolved = resolveLoads(model, [
      beamForce({ beamIds: ['h'], distribution: 'constant', q: 1 }),
    ]);

    expect(resolved.beams.has('roof')).toBe(false);
    expect(resolved.nodes.size).toBe(0);
  });
});

describe('resolveLoads: haengende Referenzen', () => {
  // Beide Wege werfen gleich — ohne `hasNode` ginge der Knotenfall still durch
  // und erzeugte einen Phantomknoten fuer den Solver.
  it('wirft beim unbekannten Stab', () => {
    expect(() =>
      resolveLoads(model, [
        beamForce({ beamIds: ['gibtsnicht'], distribution: 'constant', q: 1 }),
      ]),
    ).toThrow(UnknownLoadTargetError);
  });

  it('wirft beim unbekannten Knoten', () => {
    expect(() =>
      resolveLoads(model, [
        { id: 'a', target: 'node', nodeIds: ['gibtsnicht'], fz: 1 } as NodeLoad,
      ]),
    ).toThrow(UnknownLoadTargetError);
  });
});
