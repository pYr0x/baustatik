/**
 * Schnittgroessenverlaeufe -> Specs.
 *
 * Die Aussagen, die diese Datei festhaelt, stehen in ADR 0050: die
 * Bezugsgroesse ist GLOBAL je Schnittgroesse, die Ordinate ist ein WELTMASS —
 * das einzige in diesem Package —, und aufgetragen wird auf der `+ez`-Seite,
 * die allein aus der Knotenreihenfolge folgt.
 *
 * `tests/results/` baut seine Fixtures inline (Stab, Knoten, Ergebnis); nur die
 * beiden Zustandsbauer kommen aus `../helpers`, weil `scene.test.ts` sie auch
 * braucht.
 */

import { describe, expect, it } from 'vitest';

import type { Beam, Node } from '@baustatik/fem';
import type {
  ArrowSpec,
  LabelSpec,
  PolygonSpec,
  Spec,
} from '@baustatik/render-core';
import { validateSpecs } from '@baustatik/render-core';
import { screenPoint, type Viewport, viewport } from '@baustatik/viewport-2d';

import { InvalidDiagramExaggerationError } from '../../src/errors';
import type { DiagramOptions } from '../../src/results';
import { type FEMSceneOptions, femSpecs } from '../../src/scene';
import { beamState, simplySupported, solveResult } from '../helpers';

const vp1 = viewport(screenPoint(0, 0), 1);
const vp2 = viewport(screenPoint(0, 0), 2);

/** Die Vorgabe aus `results/style.ts` — die Hoehe des Bezugswerts in METERN. */
const ORDINATE_M = 0.5;

const a: Node = { id: 'a', position: { x: 0, z: 0 } };
const b: Node = { id: 'b', position: { x: 4, z: 0 } };
/** Zweiter, gleich langer Stab daneben — fuer die globale Bezugsgroesse. */
const c: Node = { id: 'c', position: { x: 10, z: 0 } };
const d: Node = { id: 'd', position: { x: 14, z: 0 } };
/** Derselbe Stab, aber SENKRECHT: a — v faellt von z=0 auf z=4. */
const v: Node = { id: 'v', position: { x: 0, z: 4 } };

const beam = (id: string, startNodeId: string, endNodeId: string): Beam => ({
  id,
  startNodeId,
  endNodeId,
  crossSectionId: 'default',
  materialId: 'default',
});

const ab = beam('ab', 'a', 'b');
const cd = beam('cd', 'c', 'd');
const av = beam('av', 'a', 'v');

function specsOf(
  scene: Partial<FEMSceneOptions> & {
    nodes: readonly Node[];
    beams: readonly Beam[];
  },
): readonly Spec[] {
  return femSpecs({
    supports: [],
    loads: [],
    viewport: vp1,
    ...scene,
  });
}

/** Nur die Specs EINER Schnittgroesse an EINEM Stab. */
function diagramOf(
  specs: readonly Spec[],
  beamId: string,
  component: string,
): readonly Spec[] {
  return specs.filter((spec) =>
    spec.id.startsWith(`diagram:${beamId}:${component}:`),
  );
}

function polygonById(specs: readonly Spec[], id: string): PolygonSpec {
  const spec = specs.find((s) => s.id === id);
  expect(spec, `kein Spec mit id ${id}`).toBeDefined();
  return spec as PolygonSpec;
}

/**
 * Der Einfeldtraeger `a — b` unter Gleichlast `q`, gezeichnet.
 *
 * `M_max = qL²/8` bei `x = L/2`, und diese Stelle rechnet `fem-element` EXAKT
 * aus — sie haengt nicht an der Rasterweite.
 */
function girder(
  diagrams: DiagramOptions,
  q = 10,
  vp: Viewport = vp1,
): readonly Spec[] {
  return specsOf({
    nodes: [a, b],
    beams: [ab],
    viewport: vp,
    result: solveResult({ beamStates: new Map([['ab', simplySupported(4, q)]]) }),
    diagrams,
  });
}

describe('Die Bezugsgroesse gilt ueber ALLE Staebe', () => {
  it('draws half the ordinate for half the moment on the neighbouring beam', () => {
    // ZWEI Stäbe, das eine Feldmoment halb so gross wie das andere. Wäre je Stab
    // normiert, stünden beide gleich hoch — und zwei Feldmomente im selben Bild
    // wären nicht mehr vergleichbar.
    const specs = specsOf({
      nodes: [a, b, c, d],
      beams: [ab, cd],
      result: solveResult({
        beamStates: new Map([
          ['ab', simplySupported(4, 10)],
          ['cd', simplySupported(4, 5)],
        ]),
      }),
      diagrams: { M: 1 },
    });

    const big = polygonById(specs, 'diagram:ab:M:outline');
    const small = polygonById(specs, 'diagram:cd:M:outline');

    // Beide Stäbe liegen waagerecht, die Ordinate ist deshalb `v`.
    expect(Math.max(...big.points.map((p) => p.v))).toBe(ORDINATE_M);
    expect(Math.max(...small.points.map((p) => p.v))).toBe(ORDINATE_M / 2);
  });

  it('emits not a single spec for a component whose reference is 0', () => {
    // Keine Nulllinie, kein Label — analog zu ADR 0028. Beim geraden waagerechten
    // Stab entkoppeln die Längs-Freiheitsgrade vollständig, `N` ist deshalb
    // exakt null.
    const specs = girder({ N: 1, M: 1 });

    expect(diagramOf(specs, 'ab', 'N')).toHaveLength(0);
    expect(diagramOf(specs, 'ab', 'M').length).toBeGreaterThan(0);
  });

  it('multiplies the ordinate by the exaggeration of THAT component', () => {
    const single = polygonById(girder({ M: 1 }), 'diagram:ab:M:outline');
    const doubled = polygonById(girder({ M: 2 }), 'diagram:ab:M:outline');

    expect(Math.max(...doubled.points.map((p) => p.v))).toBe(
      2 * Math.max(...single.points.map((p) => p.v)),
    );
  });

  it('rejects an exaggeration that is not positive', () => {
    // Gebrochene Vorbedingung: „nicht zeichnen" sagt man, indem man das Feld
    // WEGLÄSST, nicht durch eine Höhe von null.
    expect(() => girder({ M: 0 })).toThrow(InvalidDiagramExaggerationError);
    expect(() => girder({ M: -1 })).toThrow(InvalidDiagramExaggerationError);
    expect(() => girder({ M: Number.NaN })).toThrow(
      InvalidDiagramExaggerationError,
    );
  });
});

describe('Die Ordinate ist ein WELTMASS, alles andere bleibt Screen-Mass', () => {
  it('keeps the diagram identical in world coordinates while an arrow halves', () => {
    // DER KONTRAST IST DER TEST. Die Fläche ist ein Mass und zoomt deshalb mit:
    // in Weltkoordinaten ändert sich an ihr nichts. Der Lastpfeil daneben ist
    // ein Schema und bleibt screen-konstant — in Weltkoordinaten wird er bei
    // doppeltem Zoom halb so lang.
    const load = { id: 'nl', target: 'node', nodeIds: ['b'], fz: 10 };
    const scene = (vp: Viewport) =>
      specsOf({
        nodes: [a, b],
        beams: [ab],
        loads: [load as never],
        viewport: vp,
        result: solveResult({
          beamStates: new Map([['ab', simplySupported(4, 10)]]),
        }),
        diagrams: { M: 1 },
      });

    const at1 = scene(vp1);
    const at2 = scene(vp2);

    expect(polygonById(at2, 'diagram:ab:M:outline').points).toEqual(
      polygonById(at1, 'diagram:ab:M:outline').points,
    );

    const arrow = (specs: readonly Spec[]) =>
      specs.find((s) => s.id === 'load:nl:b:fz:arrow') as ArrowSpec;
    expect(arrow(at1).tail.v - arrow(at1).tip.v).toBe(-48);
    expect(arrow(at2).tail.v - arrow(at2).tip.v).toBe(-24);
  });

  it('keeps the outline stroke and the label in screen pixels', () => {
    const outline = polygonById(girder({ M: 1 }), 'diagram:ab:M:outline');
    const label = girder({ M: 1 }).find((s) =>
      s.id.startsWith('diagram:ab:M:max'),
    ) as LabelSpec;
    const zoomed = girder({ M: 1 }, 10, vp2).find((s) =>
      s.id.startsWith('diagram:ab:M:max'),
    ) as LabelSpec;

    // Ungeteilt, weil der Adapter `strokeScaleEnabled: false` setzt.
    expect(outline.strokeWidth).toBe(2);
    expect(zoomed.fontSize).toBe(label.fontSize / 2);
    expect(zoomed.gap).toBe(label.gap / 2);
  });
});

describe('Aufgetragen wird auf der +ez-Seite', () => {
  it('puts a positive moment on the +z side of a horizontal beam', () => {
    // `ex = (1, 0)` ⇒ `ez = (0, 1)`: bei z abwärts hängt das positive Feldmoment
    // UNTER dem Stab. `v` wächst auf dem Schirm ebenfalls nach unten.
    const outline = polygonById(girder({ M: 1 }), 'diagram:ab:M:outline');

    expect(outline.points.every((p) => p.v >= 0)).toBe(true);
    expect(Math.max(...outline.points.map((p) => p.v))).toBe(ORDINATE_M);
  });

  it('follows the node order on a VERTICAL beam, where the side is invisible', () => {
    // `a → v` läuft nach unten: `ex = (0, 1)` ⇒ `ez = (−1, 0)`. Dasselbe positive
    // Moment liegt deshalb LINKS der Stütze — die Seite folgt allein aus der
    // Knotenreihenfolge, es gibt kein Spiegel-Flag.
    const specs = specsOf({
      nodes: [a, v],
      beams: [av],
      result: solveResult({
        beamStates: new Map([['av', simplySupported(4, 10)]]),
      }),
      diagrams: { M: 1 },
    });
    const outline = polygonById(specs, 'diagram:av:M:outline');

    expect(outline.points.every((p) => p.u <= 0)).toBe(true);
    expect(Math.min(...outline.points.map((p) => p.u))).toBe(-ORDINATE_M);
  });

  it('lands on the same side as the dashed fibre, which is its reading aid', () => {
    // Die Faser sagt dieselbe Regel wie die Auftragsrichtung, nur ohne Ergebnis
    // — deshalb muessen die beiden dieselbe Seite meinen. Wie sie im Einzelnen
    // aussieht, prueft `tests/model/fiber.test.ts`.
    const specs = girder({ M: 1 });
    const fibre = specs.find((s) => s.id === 'beam:ab:fiber') as {
      from: { u: number; v: number };
    };
    const outline = polygonById(specs, 'diagram:ab:M:outline');

    expect(Math.sign(fibre.from.v)).toBe(
      Math.sign(Math.max(...outline.points.map((p) => p.v))),
    );
  });
});

describe('Vorzeichen-Laeufe und Sprungstellen', () => {
  it('splits the area at a zero crossing but keeps ONE outline', () => {
    // Lineares Moment `M(x) = −10 + 10x` mit Nulldurchgang bei `x = 1`: zwei
    // Flächen mit verschiedener Füllung, aber EIN Zug. Die Kurve ist dort
    // stetig — ein Farbwechsel mitten in ihr behauptete einen Bruch.
    const specs = specsOf({
      nodes: [a, b],
      beams: [ab],
      result: solveResult({
        beamStates: new Map([['ab', beamState(4, [0, -10, -10, 0, 10, 30])]]),
      }),
      diagrams: { M: 1 },
    });

    const areas = specs.filter((s) => s.id.startsWith('diagram:ab:M:area:'));
    expect(areas.map((s) => s.id)).toEqual([
      'diagram:ab:M:area:0',
      'diagram:ab:M:area:1',
    ]);
    // Der negative Lauf zuerst, und die beiden Fuellungen unterscheiden sich.
    const [negative, positive] = areas as [PolygonSpec, PolygonSpec];
    expect(negative.fillColor).not.toBe(positive.fillColor);
    expect(
      specs.filter((s) => s.id === 'diagram:ab:M:outline'),
    ).toHaveLength(1);
  });

  it('carries the vertical flank of a jump in the outline', () => {
    // Eine Einzelquerkraft in Stabmitte: `internalForcesAlong` liefert dort ZWEI
    // Eintraege mit gleichem `x`, und der Polygonzug bekommt die senkrechte
    // Flanke geschenkt.
    const specs = specsOf({
      nodes: [a, b],
      beams: [ab],
      result: solveResult({
        beamStates: new Map([
          [
            'ab',
            beamState(4, [0, -5, 0, 0, 5, 0], {
              segments: [],
              points: [{ a: 2, px: 0, pz: 10, my: 0 }],
            }),
          ],
        ]),
      }),
      diagrams: { V: 1 },
    });

    const points = polygonById(specs, 'diagram:ab:V:outline').points;
    const flanks = points.filter((point, index) => {
      const previous = points[index - 1];
      return previous !== undefined && previous.u === point.u;
    });

    // DREI senkrechte Kanten: die beiden Schlusskanten an den Stabenden — dort
    // ist `V = ±5`, also nicht null — und der Sprung in der Mitte.
    expect(flanks.map((flank) => flank.u)).toEqual([0, 2, 4]);
    // Senkrecht heisst: gleiche Stelle, anderer Wert.
    const jump = flanks[1];
    expect(points[points.indexOf(jump as never) - 1]?.v).not.toBe(jump?.v);
  });

  it('closes the outline down to the axis at both ends', () => {
    // Eine konstante Normalkraft: ohne die beiden Schlusskanten stuende dort ein
    // offener waagerechter Strich statt eines Rechtecks. Dasselbe fehlte am
    // eingespannten Ende, wo der Verlauf mit einem Stuetzmoment anfaengt.
    const specs = specsOf({
      nodes: [a, b],
      beams: [ab],
      result: solveResult({
        beamStates: new Map([['ab', beamState(4, [-30, 0, 0, 30, 0, 0])]]),
      }),
      diagrams: { N: 1 },
    });
    const points = polygonById(specs, 'diagram:ab:N:outline').points;

    // Anfang und Ende liegen AUF der Achse, alles dazwischen auf der Ordinate.
    expect(points[0]).toEqual({ u: 0, v: 0 });
    expect(points[points.length - 1]).toEqual({ u: 4, v: 0 });
    expect(points[1]).toEqual({ u: 0, v: ORDINATE_M });
    expect(points[points.length - 2]).toEqual({ u: 4, v: ORDINATE_M });
  });

  it('does not double a closing edge where the value is already zero', () => {
    // Beim Einfeldtraeger ist `M(0) = M(L) = 0`: der Achspunkt faellt mit dem
    // Kurvenpunkt zusammen, und zwei gleiche Punkte hintereinander waeren im
    // Polygon nur Laerm.
    const points = polygonById(girder({ M: 1 }), 'diagram:ab:M:outline').points;

    expect(points[0]).toEqual({ u: 0, v: 0 });
    expect(points[1]).not.toEqual(points[0]);
  });
});

describe('Extremwerte werden beschriftet', () => {
  it('labels a plateau at its FIRST and LAST station', () => {
    // Eine konstante Normalkraft ist `N = −e[0]` an jeder Station BITGLEICH; die
    // Plateau-Regel greift damit ohne Toleranz genau dort, wo sie soll.
    const specs = specsOf({
      nodes: [a, b],
      beams: [ab],
      result: solveResult({
        beamStates: new Map([['ab', beamState(4, [-30, 0, 0, 30, 0, 0])]]),
      }),
      diagrams: { N: 1 },
    });

    const labels = specs.filter(
      (s) => s.kind === 'label' && s.id.startsWith('diagram:ab:N:'),
    ) as LabelSpec[];

    expect(labels.map((s) => s.id)).toEqual([
      'diagram:ab:N:max:0:label',
      'diagram:ab:N:max:1:label',
    ]);
    expect(labels.map((s) => s.text)).toEqual(['30 kN', '30 kN']);
    // Erste und letzte Station: die beiden Stabenden.
    expect(labels.map((s) => s.anchor.u)).toEqual([0, 4]);
    // Ein positiver Wert liegt auf der `+ez`-Seite, sein Label dahinter — und
    // ohne `-0`, das im Spec nur Laerm waere.
    expect(labels[0]?.direction).toEqual({ u: 0, v: 1 });
  });

  it('labels a signed minimum on the side the value lies on', () => {
    const specs = specsOf({
      nodes: [a, b],
      beams: [ab],
      result: solveResult({
        beamStates: new Map([['ab', beamState(4, [30, 0, 0, -30, 0, 0])]]),
      }),
      diagrams: { N: 1 },
    });
    const label = specs.find(
      (s) => s.id === 'diagram:ab:N:min:0:label',
    ) as LabelSpec;

    // MIT Vorzeichen — anders als am Lastpfeil, wo es im Bild aufgebraucht ist.
    expect(label.text).toBe('-30 kN');
    // `direction = sign(K) · ez`: das Label liegt ausserhalb der Flaeche.
    expect(label.direction).toEqual({ u: 0, v: -1 });
    expect(specs.some((s) => s.id.startsWith('diagram:ab:N:max'))).toBe(false);
  });
});

describe('Die rechnerische Gegenprobe', () => {
  it('binds scaling, extremum search and labelling in ONE assertion', () => {
    // Einfeldtraeger unter Gleichlast, `q = 10 kN/m`, `L = 4 m`:
    //   M_max = qL²/8 = 20 kNm  bei  x = L/2 = 2 m
    // Dieser Stab stellt die Bezugsgroesse, der zugehoerige Punkt liegt deshalb
    // EXAKT `diagramOrdinateM` von der Achse entfernt — und das Label traegt
    // genau diese Zahl.
    const specs = girder({ M: 1 });

    const label = specs.find(
      (s) => s.id === 'diagram:ab:M:max:0:label',
    ) as LabelSpec;
    expect(label.text).toBe('20 kNm');
    expect(label.anchor).toEqual({ u: 2, v: ORDINATE_M });

    const point = polygonById(specs, 'diagram:ab:M:outline').points.find(
      (p) => p.u === 2,
    );
    expect(point?.v).toBe(ORDINATE_M);
  });

  it('produces specs that pass render-core validation', () => {
    expect(() => validateSpecs(girder({ N: 1, V: 1, M: 1 }))).not.toThrow();
  });

  it('puts every diagram spec into the diagrams band', () => {
    const specs = girder({ V: 1, M: 1 }).filter((s) =>
      s.id.startsWith('diagram:'),
    );

    expect(specs.length).toBeGreaterThan(0);
    expect(specs.every((s) => s.layer === 'diagrams')).toBe(true);
  });
});
