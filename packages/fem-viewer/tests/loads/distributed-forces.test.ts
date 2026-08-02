/**
 * Die STRECKENLAST — und vor allem die eine Regel, aus der ihre neun
 * Kombinationen aus Lastrichtung und Bezugslaenge folgen (ADR 0028): die
 * Grundlinie ist der SCHATTEN des belasteten Abschnitts, geworfen von
 * Parallellicht in Lastrichtung.
 *
 * Deshalb laufen fast alle Faelle auf `beamBC` (45 Grad): am waagrechten Stab
 * fallen lokale und globale Richtung zusammen und der Schatten mit der
 * Stabachse — dort bewiese kein Test, dass ueberhaupt projiziert wird.
 */

import { describe, expect, it } from 'vitest';

import { Line, Point, Vector } from '@baustatik/fem-geometry';
import type { FEMLoad } from '@baustatik/fem-loads';
import type {
  ArrowSpec,
  LabelSpec,
  PolygonSpec,
  RectangleSpec,
  Spec,
} from '@baustatik/render-core';
import { validateSpecs } from '@baustatik/render-core';
import type { Viewport, WorldPoint } from '@baustatik/viewport-2d';

import {
  beamAB,
  beamBC,
  drawingOf,
  nodeA,
  nodeB,
  nodeC,
  vp1,
  vp4,
} from './helpers';

const NODES = [nodeA, nodeB, nodeC];
const BEAMS = [beamAB, beamBC];
/** cos 45 Grad = sin 45 Grad — `beamBC` faellt unter genau diesem Winkel. */
const S = Math.SQRT1_2;
const GAP = 10;
const FULL = 48;
/** Kantenlaenge der Marke; sie sitzt mittig, also zaehlt ueberall die Haelfte. */
const MARKER = 4;

const { specsFor, loadOnly, specById } = drawingOf(NODES, BEAMS);

/** Eine Streckenlast auf `bc`, per Vorgabe konstant, lokal z, wahre Stablaenge. */
const line = (fields: Record<string, unknown> = {}): FEMLoad =>
  ({
    id: 'q',
    target: 'beam',
    beamIds: ['bc'],
    kind: 'force',
    distribution: 'constant',
    frame: 'local',
    axis: 'z',
    referenceLength: 'trueLength',
    q: 5,
    ...fields,
  }) as FEMLoad;

function area(loads: readonly FEMLoad[], vp: Viewport = vp1): PolygonSpec {
  const spec = specById<PolygonSpec>(loads, 'load:q:bc:area', vp);
  expect(spec.kind).toBe('polygon');
  return spec;
}

function arrow(
  loads: readonly FEMLoad[],
  part: 'q1' | 'q2',
  vp: Viewport = vp1,
): ArrowSpec {
  const spec = specById<ArrowSpec>(loads, `load:q:bc:${part}:arrow`, vp);
  expect(spec.kind).toBe('arrow');
  return spec;
}

function ids(loads: readonly FEMLoad[]): readonly string[] {
  return loadOnly(loads).map((spec) => spec.id);
}

function expectPoint(actual: WorldPoint | undefined, u: number, v: number) {
  expect(actual?.u).toBeCloseTo(u, 9);
  expect(actual?.v).toBeCloseTo(v, 9);
}

/** Wieviel weiter in Lastrichtung `b` liegt als `a`. */
const advance = (a: WorldPoint, b: WorldPoint, d: Vector): number =>
  (b.u - a.u) * d.dx + (b.v - a.v) * d.dz;

describe('Die Grundlinie ist der Schatten', () => {
  it('legt sie bei wahrer Stablaenge auf die verschobene Stabachse', () => {
    // Lokal z am 45-Grad-Stab: d = ez = (-S, S), also nach links oben.
    const points = area([line()]).points;
    expect(points).toHaveLength(4);
    expectPoint(points[0], 100 + GAP * S, -GAP * S);
    expectPoint(points[3], 200 + GAP * S, 100 - GAP * S);
    // Aussenkante genau `FULL` weiter — die Figur hat keine eigene Hoehe.
    expectPoint(points[1], 100 + (GAP + FULL) * S, -(GAP + FULL) * S);
    expectPoint(points[2], 200 + (GAP + FULL) * S, 100 - (GAP + FULL) * S);
  });

  it('macht aus global Z + Projektion eine WAAGRECHTE Grundlinie ueber dem Stab', () => {
    const points = area([
      line({ frame: 'global', axis: 'z', referenceLength: 'horizontalProjection' }),
    ]).points;
    // Der hoechste Punkt des Stabs ist b (z = 0); die Grundlinie liegt `GAP`
    // darueber und spannt die volle x-Ausdehnung.
    expectPoint(points[0], 100, -GAP);
    expectPoint(points[3], 200, -GAP);
    expectPoint(points[1], 100, -(GAP + FULL));
    expectPoint(points[2], 200, -(GAP + FULL));
  });

  it('macht aus global X + Projektion eine SENKRECHTE Grundlinie neben dem Stab', () => {
    const points = area([
      line({ frame: 'global', axis: 'x', referenceLength: 'verticalProjection' }),
    ]).points;
    // Hochkant: links vom linken Stabende, ueber die volle z-Ausdehnung.
    expectPoint(points[0], 100 - GAP, 0);
    expectPoint(points[3], 100 - GAP, 100);
    expectPoint(points[1], 100 - GAP - FULL, 0);
    expectPoint(points[2], 100 - GAP - FULL, 100);
  });

  it('laesst lokal z auch bei Projektion auf der Stabachse stehen', () => {
    // Licht senkrecht zum Stab: der Schatten des Stabs IST der Stab.
    const onAxis = area([line()]).points;
    for (const reference of ['horizontalProjection', 'verticalProjection']) {
      const projected = area([line({ referenceLength: reference })]).points;
      expect(projected).toEqual(onAxis);
    }
  });

  it('zeichnet beide Projektionen IDENTISCH — sie unterscheiden sich im Wert, nicht in der Lage', () => {
    for (const frame of ['global', 'local'] as const) {
      for (const axis of ['x', 'z'] as const) {
        const horizontal = area([
          line({ frame, axis, referenceLength: 'horizontalProjection' }),
        ]);
        const vertical = area([
          line({ frame, axis, referenceLength: 'verticalProjection' }),
        ]);
        expect(vertical.points, `${frame} ${axis}`).toEqual(horizontal.points);
      }
    }
  });

  it('haelt lokal z rechtwinklig auf dem Stab, bei jeder Bezugslaenge', () => {
    for (const reference of [
      'trueLength',
      'horizontalProjection',
      'verticalProjection',
    ]) {
      const [p0, p1, , p3] = area([line({ referenceLength: reference })]).points;
      const alongBase = Vector.make((p3?.u ?? 0) - (p0?.u ?? 0), (p3?.v ?? 0) - (p0?.v ?? 0));
      const upwards = Vector.make((p1?.u ?? 0) - (p0?.u ?? 0), (p1?.v ?? 0) - (p0?.v ?? 0));
      expect(Vector.dot(alongBase, upwards), reference).toBeCloseTo(0, 9);
    }
  });
});

describe('Die Luecke sitzt an der geringsten Stelle', () => {
  const cases = [
    { name: 'wahre Laenge, lokal z', load: line(), d: Vector.make(-S, S) },
    {
      name: 'Projektion, global Z',
      load: line({
        frame: 'global',
        axis: 'z',
        referenceLength: 'horizontalProjection',
      }),
      d: Vector.make(0, 1),
    },
    {
      name: 'Projektion, global X',
      load: line({
        frame: 'global',
        axis: 'x',
        referenceLength: 'verticalProjection',
      }),
      d: Vector.make(1, 0),
    },
  ];

  for (const { name, load, d } of cases) {
    for (const vp of [vp1, vp4]) {
      it(`haelt ${name} bei Zoom ${vp.scale} genau ${GAP} px frei`, () => {
        const points = area([load], vp).points;
        const segment = [
          { u: 100, v: 0 },
          { u: 200, v: 100 },
        ];
        // Gemessen wird IN Lastrichtung, nicht senkrecht zum Stab: die Figur
        // steht auf ihrem Schatten, und der wird laengs `d` geworfen.
        const clearances = [
          advance(points[0] as WorldPoint, segment[0] as WorldPoint, d),
          advance(points[3] as WorldPoint, segment[1] as WorldPoint, d),
        ];
        expect(Math.min(...clearances)).toBeCloseTo(GAP / vp.scale, 9);
      });
    }
  }
});

describe('Die Aussenkante IST die Verbindung der Pfeilenden', () => {
  it('setzt die Pfeilspitzen auf die Grundlinie und die Enden auf die Ecken', () => {
    const loads = [line({ frame: 'global', axis: 'z', referenceLength: 'horizontalProjection' })];
    const points = area(loads).points;

    expect(arrow(loads, 'q1').tip).toEqual(points[0]);
    expect(arrow(loads, 'q1').tail).toEqual(points[1]);
    expect(arrow(loads, 'q2').tip).toEqual(points[3]);
    expect(arrow(loads, 'q2').tail).toEqual(points[2]);
  });

  it('skaliert die beiden Ecken beim Trapez auf den groesseren der Werte', () => {
    const loads = [
      line({
        distribution: 'trapezoidal',
        fullLength: true,
        q: undefined,
        q1: 10,
        q2: 40,
        frame: 'global',
        axis: 'z',
        referenceLength: 'horizontalProjection',
      }),
    ];
    const points = area(loads).points;
    // 10 von 40 — ein Viertel der vollen Hoehe.
    expectPoint(points[1], 100, -(GAP + FULL / 4));
    expectPoint(points[2], 200, -(GAP + FULL));
  });

  it('bleibt beim Zoomen gleich gross', () => {
    const loads = [line({ frame: 'global', axis: 'z' })];
    const near = area(loads, vp1).points;
    const far = area(loads, vp4).points;
    const height = (points: readonly WorldPoint[]) =>
      (points[0]?.v ?? 0) - (points[1]?.v ?? 0);
    expect(height(near)).toBeCloseTo(FULL, 9);
    expect(height(far)).toBeCloseTo(FULL / 4, 9);
  });
});

describe('Der Parallelfall', () => {
  const alongBeam = (fields: Record<string, unknown> = {}): FEMLoad =>
    line({ beamIds: ['ab'], frame: 'local', axis: 'x', ...fields });

  /** Auf `ab` heisst `bc` in den IDs weiter `bc` — deshalb eigene Zugriffe. */
  const areaAB = (loads: readonly FEMLoad[]) =>
    specById<PolygonSpec>(loads, 'load:q:ab:area');
  const arrowAB = (loads: readonly FEMLoad[], part: 'q1' | 'q2') =>
    specById<ArrowSpec>(loads, `load:q:ab:${part}:arrow`);

  it('traegt die Hoehe quer zum Stab ab, wenn die Last laengs zeigt', () => {
    const loads = [alongBeam()];
    const points = areaAB(loads).points;
    // `ab` laeuft von (0,0) nach (100,0), lokal -z ist oben.
    expectPoint(points[0], 0, -GAP);
    expectPoint(points[1], 0, -(GAP + FULL));
    expectPoint(points[2], 100, -(GAP + FULL));
    expectPoint(points[3], 100, -GAP);
  });

  it('legt beide Pfeile LAENGS in den Block, in Lastrichtung', () => {
    const loads = [alongBeam()];
    const first = arrowAB(loads, 'q1');
    const second = arrowAB(loads, 'q2');
    // Auf halber Blockhoehe, damit sie in der Flaeche liegen.
    expectPoint(first.tail, 0, -(GAP + FULL / 2));
    expectPoint(first.tip, FULL, -(GAP + FULL / 2));
    expectPoint(second.tail, 100 - FULL, -(GAP + FULL / 2));
    expectPoint(second.tip, 100, -(GAP + FULL / 2));
  });

  it('dreht beide Pfeile um, wenn die Last negativ ist', () => {
    const loads = [alongBeam({ q: -5 })];
    expect(arrowAB(loads, 'q1').tip.u).toBeLessThan(arrowAB(loads, 'q1').tail.u);
    expect(arrowAB(loads, 'q2').tip.u).toBeLessThan(arrowAB(loads, 'q2').tail.u);
    // Die Flaeche bleibt oben: die Seite ist hier fest, die Richtung sagen die
    // Pfeile.
    expect(areaAB(loads).points[1]?.v).toBeCloseTo(-(GAP + FULL), 9);
  });

  it('greift auch fuer global X auf dem WAAGRECHTEN Stab', () => {
    // Der Fall, den man beim Entwerfen uebersieht: global x faellt hier mit der
    // Stabachse zusammen, und quer abgetragen waere das Polygon ein Strich.
    const points = areaAB([alongBeam({ frame: 'global', axis: 'x' })]).points;
    expectPoint(points[1], 0, -(GAP + FULL));
  });

  it('greift fuer lokal x auch am schraegen Stab', () => {
    const points = area([line({ frame: 'local', axis: 'x' })]).points;
    // Quer zur Stabachse nach oben-rechts: -ez = (S, -S).
    expectPoint(points[0], 100 + GAP * S, -GAP * S);
    expectPoint(points[1], 100 + (GAP + FULL) * S, -(GAP + FULL) * S);
  });
});

describe('Werte ohne Betrag', () => {
  const trapezoid = (q1: number, q2: number): FEMLoad =>
    line({
      distribution: 'trapezoidal',
      fullLength: true,
      q: undefined,
      q1,
      q2,
      frame: 'global',
      axis: 'z',
      // Waagrechte Grundlinie: die Nullstelle ist dann eine Zahl, die man liest.
      referenceLength: 'horizontalProjection',
    });

  it('laesst der Dreieckslast an ihrem spitzen Ende weder Pfeil noch Label', () => {
    const loads = [trapezoid(0, 40)];
    expect(ids(loads)).not.toContain('load:q:bc:q1:arrow');
    expect(ids(loads)).not.toContain('load:q:bc:q1:label');
    expect(ids(loads)).toContain('load:q:bc:q2:arrow');
    // Die Flaeche bleibt — und sie ist ein DREIECK, kein Viereck mit einer
    // Kante der Laenge 0: die Ecke ohne Wert faellt weg statt zusammen.
    const points = area(loads).points;
    expect(points).toHaveLength(3);
    expectPoint(points[0], 100, -GAP);
    expectPoint(points[1], 200, -(GAP + FULL));
    expectPoint(points[2], 200, -GAP);
  });

  it('zeichnet gar nichts, wenn beide Werte 0 sind', () => {
    expect(loadOnly([trapezoid(0, 0)])).toHaveLength(0);
  });

  it('setzt bei Vorzeichenwechsel die Nullstelle als Stuetzstelle', () => {
    // Ohne sie waere der Ring ueberschlagen: eine Ecke liegt oben, eine unten.
    const points = area([trapezoid(10, -30)]).points;
    expect(points).toHaveLength(5);
    expect(points[1]?.v).toBeLessThan(-GAP);
    expect(points[3]?.v).toBeGreaterThan(-GAP);
    // Ein Viertel der Strecke, dort wo q durch null geht.
    expectPoint(points[2], 125, -GAP);
  });

  it('spiegelt die Figur beim negativen Wert auf die andere Seite', () => {
    const positive = area([line({ frame: 'global', axis: 'z' })]).points;
    const negative = area([line({ frame: 'global', axis: 'z', q: -5 })]).points;
    expect(negative[1]?.v).toBeCloseTo(-GAP + FULL, 9);
    expect(positive[1]?.v).toBeCloseTo(-GAP - FULL, 9);
  });
});

describe('Der belastete Abschnitt', () => {
  const partial = (fields: Record<string, unknown>): FEMLoad =>
    line({
      distribution: 'trapezoidal',
      q: undefined,
      q1: 5,
      q2: 5,
      frame: 'global',
      axis: 'z',
      ...fields,
    });

  it('nimmt from/to als Weltlaenge entlang der Stabachse', () => {
    // Ein Viertel bis zur Haelfte von L = 100 * sqrt(2), also (125|25) bis
    // (150|50) auf der Achse. Die Grundlinie ist die um `GAP` gegen global z
    // verschobene Achse — wahre Stablaenge wirft keinen Schatten.
    const L = 100 * Math.SQRT2;
    const points = area([partial({ from: L / 4, to: L / 2 })]).points;
    expectPoint(points[0], 125, 25 - GAP);
    expectPoint(points[3], 150, 50 - GAP);
  });

  it('liest relativeDistances als Prozent', () => {
    const points = area([
      partial({ from: 25, to: 50, relativeDistances: true }),
    ]).points;
    expectPoint(points[0], 125, 25 - GAP);
    expectPoint(points[3], 150, 50 - GAP);
  });

  it('stellt bei Projektion den ABSCHNITT frei, nicht den ganzen Stab', () => {
    // Die Luecke misst gegen das hoechste Ende des belasteten Stuecks — bei
    // einem Teilabschnitt liegt die Grundlinie deshalb tiefer als beim vollen
    // Stab, statt weit ueber ihm zu schweben.
    const points = area([
      partial({
        from: 25,
        to: 50,
        relativeDistances: true,
        referenceLength: 'horizontalProjection',
      }),
    ]).points;
    expectPoint(points[0], 125, 25 - GAP);
    expectPoint(points[3], 150, 25 - GAP);
  });

  it('setzt die Marker auf die STABACHSE, nicht auf die Grundlinie', () => {
    const loads = [partial({ from: 25, to: 50, relativeDistances: true })];
    const start = specById<RectangleSpec>(loads, 'load:q:bc:start');
    const end = specById<RectangleSpec>(loads, 'load:q:bc:end');
    expect(start.kind).toBe('rectangle');
    // Mittig auf dem Punkt (125, 25) beziehungsweise (150, 50).
    expectPoint(start.topLeft, 125 - MARKER / 2, 25 - MARKER / 2);
    expectPoint(end.topLeft, 150 - MARKER / 2, 50 - MARKER / 2);
    expect(start.width).toBeCloseTo(MARKER, 9);
  });

  it('zeichnet die Marker auch bei einer Last ueber den ganzen Stab', () => {
    expect(ids([line()])).toEqual(
      expect.arrayContaining(['load:q:bc:start', 'load:q:bc:end']),
    );
  });

  it('setzt bei der Gleichstreckenlast beide Marker auf die Knoten', () => {
    const start = specById<RectangleSpec>([line()], 'load:q:bc:start');
    expectPoint(start.topLeft, 100 - MARKER / 2, 0 - MARKER / 2);
  });
});

describe('Beschriftung und Szene', () => {
  it('schreibt kN/m, nicht kN', () => {
    const spec = specById<LabelSpec>([line()], 'load:q:bc:q1:label');
    expect(spec.text).toBe('5 kN/m');
  });

  it('beschriftet beide Enden des Trapezes mit ihrem eigenen Wert', () => {
    const loads = [
      line({
        distribution: 'trapezoidal',
        fullLength: true,
        q: undefined,
        q1: 10,
        q2: 40,
      }),
    ];
    expect(specById<LabelSpec>(loads, 'load:q:bc:q1:label').text).toBe('10 kN/m');
    expect(specById<LabelSpec>(loads, 'load:q:bc:q2:label').text).toBe('40 kN/m');
  });

  it('haelt das Label vorzeichenlos — die Richtung zeigt der Pfeil', () => {
    const spec = specById<LabelSpec>([line({ q: -5 })], 'load:q:bc:q1:label');
    expect(spec.text).toBe('5 kN/m');
  });

  it('legt die ganze Figur ins Lastband und haelt die IDs eindeutig', () => {
    const specs = specsFor([line(), line({ id: 'q2', beamIds: ['ab'] })]);
    expect(() => validateSpecs(specs as Spec[])).not.toThrow();
    for (const spec of specs.filter((s) => s.id.startsWith('load:'))) {
      expect(spec.layer, spec.id).toBe('loads');
    }
  });

  it('faechert eine Last auf mehrere Staebe auf', () => {
    const specs = loadOnly([line({ beamIds: ['ab', 'bc'] })]);
    expect(specs.some((spec) => spec.id === 'load:q:ab:area')).toBe(true);
    expect(specs.some((spec) => spec.id === 'load:q:bc:area')).toBe(true);
  });

  it('laesst Streckenmomente weiterhin still heraus', () => {
    const load = {
      id: 'm',
      target: 'beam',
      beamIds: ['bc'],
      kind: 'moment',
      distribution: 'constant',
      m: 5,
    } as unknown as FEMLoad;
    expect(loadOnly([load])).toHaveLength(0);
  });
});

describe('Der Abschnitt ohne Laenge', () => {
  it('zeichnet nichts, statt auf eine Grundlinie der Laenge 0 zu bauen', () => {
    const load = line({
      distribution: 'trapezoidal',
      q: undefined,
      q1: 5,
      q2: 5,
      from: 50,
      to: 50,
      relativeDistances: true,
    });
    expect(loadOnly([load])).toHaveLength(0);
  });
});

describe('Die Bezugslaenge, die am Stab 0 misst', () => {
  // Der senkrechte und der fast waagrechte Stab kommen in KEINE gemeinsame
  // Fixture: sie beweisen je genau eine Aussage dieses Blocks und wuerden in
  // jedem anderen Test nur als viertes Modell mitlaufen.
  const upright = drawingOf(
    [nodeA, { id: 'd', position: { x: 0, z: 100 } }],
    [{ ...beamAB, id: 'ad', startNodeId: 'a', endNodeId: 'd' }],
  );
  const almostFlat = drawingOf(
    [nodeA, { id: 'e', position: { x: 100, z: 0.01 } }],
    [{ ...beamAB, id: 'ae', startNodeId: 'a', endNodeId: 'e' }],
  );

  it('zeichnet verticalProjection am WAAGRECHTEN Stab gar nicht', () => {
    // Der Stab hat keine Ansichtshoehe, die Last traegt dort nichts ein. Auch
    // die Marker fallen weg: sie sagten sonst „hier ist belastet".
    expect(
      loadOnly([line({ beamIds: ['ab'], referenceLength: 'verticalProjection' })]),
    ).toHaveLength(0);
  });

  it('zeichnet horizontalProjection am SENKRECHTEN Stab gar nicht', () => {
    expect(
      upright.loadOnly([
        line({ beamIds: ['ad'], referenceLength: 'horizontalProjection' }),
      ]),
    ).toHaveLength(0);
  });

  it('entscheidet JE STAB, nicht je Last', () => {
    // Dieselbe Last auf beiden Staeben — der schraege traegt, der waagrechte
    // nicht. Das ist der Rahmenfall: eine Last auf die ganze Auswahl.
    const drawn = ids([
      line({ beamIds: ['ab', 'bc'], referenceLength: 'verticalProjection' }),
    ]);
    expect(drawn.some((id) => id.startsWith('load:q:bc:'))).toBe(true);
    expect(drawn.some((id) => id.startsWith('load:q:ab:'))).toBe(false);
  });

  it('laesst trueLength am waagrechten Stab unangetastet', () => {
    // Die Gegenprobe: es liegt an der Bezugslaenge und nicht am Stab.
    expect(ids([line({ beamIds: ['ab'] })])).toContain('load:q:ab:area');
  });

  it('zeichnet den FAST waagrechten Stab weiter', () => {
    // 0,006 Grad Neigung, Faktor 1e-4: die Last schrumpft auf ein Zehntausendstel
    // und wird trotzdem gezeichnet. Hier steht keine Schranke — nur der Randwert
    // des Wertebereichs faellt heraus, wo eine Schranke saesse, entscheidet die
    // Lastpruefung.
    expect(
      almostFlat.loadOnly([
        line({ beamIds: ['ae'], referenceLength: 'verticalProjection' }),
      ]).length,
    ).toBeGreaterThan(0);
  });
});

describe('Die Herleitung bleibt bei fem-load-resolve', () => {
  it('dreht lokal z am schraegen Stab tatsaechlich ins Stabsystem', () => {
    // Waere die Drehung vergessen, laege die Figur senkrecht statt schraeg.
    const local = area([line()]).points;
    const global = area([line({ frame: 'global' })]).points;
    expect(local[1]?.u).not.toBeCloseTo(global[1]?.u ?? 0, 6);
  });

  it('misst den Abschnitt entlang der Stabachse, unabhaengig von der Bezugslaenge', () => {
    const axis = Line.make(Point.make(100, 0), Point.make(200, 100));
    const marker = (reference: string) =>
      specById<RectangleSpec>(
        [
          line({
            distribution: 'trapezoidal',
            q: undefined,
            q1: 5,
            q2: 5,
            from: 50,
            to: 100,
            relativeDistances: true,
            referenceLength: reference,
          }),
        ],
        'load:q:bc:start',
      ).topLeft;
    // Die Mitte des Stabs — bei jeder Bezugslaenge dieselbe Stelle.
    expect(Line.midpoint(axis)).toEqual(Point.make(150, 50));
    for (const reference of ['horizontalProjection', 'verticalProjection']) {
      expect(marker(reference)).toEqual(marker('trueLength'));
    }
  });
});
