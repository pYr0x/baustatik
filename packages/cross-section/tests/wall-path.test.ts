import { describe, expect, it } from 'vitest';
import {
  createSectionGeometry,
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  DisconnectedWallGraphWarning,
  MultipleCellsWarning,
  type SectionNode,
  type SectionProperties,
  sectionProperties,
  ThickWallWarning,
  validateSectionGeometry,
  type Wall,
} from '../src/index';
import {
  scaleSegments,
  segments,
} from '../src/calculation/wall-path/segments';
import { MM_TO_CM } from '../src/calculation/units';
import { wallPath } from '../src/calculation/wall-path/calculate-wall-path';
import {
  boxGraph,
  disconnectedGraph,
  iGraph,
  node,
  tGraph,
  twoCellGraph,
  twoRunCellGraph,
  uGraph,
  wall,
} from './helpers';

/**
 * Der positionierte Wandweg: κ, Schubmittelpunkt und `It` aus einem
 * gezeichneten Wandgraphen
 * ([ADR 0040](../../../docs/adr/0040-the-wall-path-is-positioned.md),
 * [ADR 0041](../../../docs/adr/0041-two-figures-for-the-wall-path.md)).
 *
 * KEIN PRÜFSTEIN BRAUCHT EINE EXTERNE ZAHL. Die Orakel sind die geschlossenen
 * Ausdrücke der parametrischen Formen (`iSymmetric`, `tSection`,
 * `hollowRectangle`) und zwei Handformeln — der Schubmittelpunkt des U und die
 * Reihe für das dünne Rechteck. Der KATALOG ist ausdrücklich KEIN Orakel für
 * `It`: der Wandgraph eines IPE 300 kommt auf `15,70 cm⁴` gegen tabellierte
 * `20,12`, und die Differenz ist die Ausrundung, die ein Mittellinienmodell
 * nicht kennt.
 */

const POLICY = DEFAULT_SECTION_POLICY;

/** Die Werte eines gezeichneten Wandgraphen, dünnwandig gerechnet. */
function drawn(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
  policy = POLICY,
): SectionProperties {
  const geometry = createSectionGeometry(
    {
      kind: 'midline',
      nodes: [...nodes],
      walls: [...walls],
      idealisation: 'thin-walled',
    },
    policy,
  );
  const values = sectionProperties(
    { kind: 'section-geometry', id: 'cs', geometry },
    policy,
  );
  if (values === undefined) throw new Error('kein Wertesatz');
  return values;
}

/** Der Weg selbst — für `closingMoment` und die Topologiezahlen. */
function path(nodes: readonly SectionNode[], walls: readonly Wall[]) {
  const runs = scaleSegments(
    segments([...nodes], [...walls], POLICY),
    MM_TO_CM,
  );
  return wallPath(runs, { A: 1, Iy: 1, Iz: 1 });
}

function findings(nodes: readonly SectionNode[], walls: readonly Wall[]) {
  const geometry = createSectionGeometry(
    {
      kind: 'midline',
      nodes: [...nodes],
      walls: [...walls],
      idealisation: 'thin-walled',
    },
    POLICY,
  );
  return validateSectionGeometry(geometry, POLICY);
}

describe('κ des Wandgraphen trifft den geschlossenen Ausdruck der Form', () => {
  // Beide Wege rechnen `S` im WANDMODELL und `I` in der UMRISSFIGUR
  // (ADR 0041) — die Zahl darf sich deshalb nur um Gleitkommarauschen
  // unterscheiden, und dass der eine aus einer Formel und der andere aus einer
  // Zerlegung kommt, ist genau die Unabhängigkeit, die den Test trägt.
  it('doppeltsymmetrisches I: derselbe Wert wie `i-symmetric`', () => {
    const [h, b, tw, tf] = [300, 150, 7.1, 10.7];
    const { nodes, walls } = iGraph(h, b, tw, tf);
    const wallGraph = drawn(nodes, walls);
    const shape = sectionProperties({
      kind: 'shape',
      id: 'cs',
      shape: { kind: 'i-symmetric', h, b, tw, tf, idealisation: 'thin-walled' },
    });

    expect(shape?.kappaZ).toBeDefined();
    expect(wallGraph.kappaZ).toBeCloseTo(shape?.kappaZ ?? 0, 9);
    expect(wallGraph.kappaY).toBeCloseTo(shape?.kappaY ?? 0, 9);
  });

  it('T: derselbe Wert wie `t-section`', () => {
    const [bf, hf, bw, h] = [200, 20, 10, 200];
    const { nodes, walls } = tGraph(bf, hf, bw, h);
    const wallGraph = drawn(nodes, walls);
    const shape = sectionProperties({
      kind: 'shape',
      id: 'cs',
      shape: { kind: 't-section', bf, hf, bw, h, idealisation: 'thin-walled' },
    });

    expect(wallGraph.kappaZ).toBeCloseTo(shape?.kappaZ ?? 0, 9);
    expect(wallGraph.kappaY).toBeCloseTo(shape?.kappaY ?? 0, 9);
  });

  it('geschlossener Kasten: die OFFENE Lücke zur Form, mit Zahl', () => {
    // HIER STAND „derselbe Wert", und das galt, solange beide Seiten das reine
    // Mittellinienmodell rechneten. Seit ADR 0051 tut die FORM das nicht mehr:
    // ihre Wände parkettieren die Umrissfigur, damit ist ihr `S` exakt und
    // die Spannungspunkte treffen den gedruckten Ausdruck. Der WANDGRAPH
    // rechnet weiter Mittellinie.
    //
    // DAS IST EINE ECHTE, OFFENE LÜCKE und keine Toleranz. Sie steht hier mit
    // Zahl, damit sie nicht unbemerkt wächst und damit eine spätere
    // Übertragung der Parkettierung auf den Graphen merkt, dass sie sie
    // schließt. Warum sie nicht mitgekommen ist: der Graph kennt beliebige
    // Winkel und Dickensprünge, der Eckblock ist dort kein Quadrat, und die
    // Korrektur hängt vom Gehrungswinkel ab. Die Geometrie dazu hat
    // `geometry/outline/miter-joints.ts` (ADR 0038) — der Schubweg liest sie
    // heute nicht.
    //
    // Die Form liegt dabei auf der GENAUEREN Seite: ihr `S` und das `I` aus
    // `shearArea` kommen jetzt aus derselben Figur.
    const [b, h, t] = [100, 200, 8];
    const { nodes, walls } = boxGraph(b, h, t);
    const wallGraph = drawn(nodes, walls);
    const shape = sectionProperties({
      kind: 'shape',
      id: 'cs',
      shape: { kind: 'hollow-rectangle', b, h, t, idealisation: 'thin-walled' },
    });

    for (const key of ['kappaZ', 'kappaY'] as const) {
      const graph = wallGraph[key] as number;
      const form = shape?.[key] as number;
      // Der Graph liegt ÜBER der Form, und das ist gerichtet: das
      // Mittellinienmodell verkürzt den Hebelarm an jeder Ecke, sein `S` ist
      // also zu klein und sein kappa damit zu groß.
      expect(graph, key).toBeGreaterThan(form);
      expect((graph - form) / form, key).toBeLessThan(0.003);
    }
    // Die Zahlen selbst, als Charakterisierung.
    expect(wallGraph.kappaZ as number).toBeCloseTo(0.6238, 4);
    expect(shape?.kappaZ as number).toBeCloseTo(0.6226, 4);
  });
});

describe('Der Schubmittelpunkt fällt aus dem Wandmodell', () => {
  it('T: `zM` ist EXAKT die Gurtmitte — dieselbe Zahl wie die Form', () => {
    // Im dünnwandigen Modell schneiden sich Gurt- und Stegmittellinie in
    // einem Punkt; um ihn hat jeder Wandzug den Hebelarm 0.
    const [bf, hf, bw, h] = [200, 20, 10, 200];
    const { nodes, walls } = tGraph(bf, hf, bw, h);

    // In Metern, weil `SectionProperties` SI führt.
    expect(drawn(nodes, walls).zM).toBeCloseTo(hf / 2 / 1000, 12);
    expect(drawn(nodes, walls).yM).toBeCloseTo(0, 12);
  });

  it('U: `yM` trifft die Handformel `e = b²h²tf/(4·Iy)`', () => {
    const [b, h, tf, tw] = [80, 200, 12, 8];
    const { nodes, walls } = uGraph(b, h, tf, tw);

    // Beide Figuren aus dem WANDMODELL (ADR 0041), also auch dieses `Iy`.
    const Iy = (tw * h ** 3) / 12 + (b * tf * h ** 2) / 2;
    const e = (b ** 2 * h ** 2 * tf) / (4 * Iy);

    // Der Steg liegt bei `y = 0`; `M` liegt auf der gurtabgewandten Seite.
    expect(drawn(nodes, walls).yM).toBeCloseTo(-e / 1000, 9);
  });

  it('doppeltsymmetrisches I: `M` fällt mit dem Schwerpunkt zusammen', () => {
    const { nodes, walls } = iGraph(300, 150, 7.1, 10.7);
    const values = drawn(nodes, walls);

    expect(values.yM).toBeCloseTo(values.ys, 9);
    expect(values.zM).toBeCloseTo(values.zs, 9);
  });

  it('bleibt unberührt, wenn die Wände rückwärts eingegeben werden', () => {
    // Der Umlaufsinn der EINGABE trägt keine Bedeutung: `r` und `S` drehen
    // beide ihr Vorzeichen, ihr Produkt nicht.
    const [b, h, tf, tw] = [80, 200, 12, 8];
    const { nodes, walls: forwards } = uGraph(b, h, tf, tw);
    const backwards = forwards.map((it) => ({
      ...it,
      startNodeId: it.endNodeId,
      endNodeId: it.startNodeId,
    }));

    expect(drawn(nodes, backwards).yM).toBeCloseTo(
      drawn(nodes, forwards).yM ?? 0,
      12,
    );
  });
});

describe('`It` — Bredt für die Zelle, ⅓·l·t³ für die offenen Zweige', () => {
  it('Zelle: EXAKT der Bredt-Ausdruck von `hollow-rectangle`', () => {
    const [b, h, t] = [100, 200, 8];
    const { nodes, walls } = boxGraph(b, h, t);
    const shape = sectionProperties({
      kind: 'shape',
      id: 'cs',
      shape: { kind: 'hollow-rectangle', b, h, t, idealisation: 'thin-walled' },
    });

    expect(shape?.It).toBeDefined();
    expect(drawn(nodes, walls).It).toBeCloseTo(shape?.It ?? 0, 15);
  });

  it('offenes I und T: derselbe Ausdruck wie die Form', () => {
    const [h, b, tw, tf] = [300, 150, 7.1, 10.7];
    const iShape = sectionProperties({
      kind: 'shape',
      id: 'cs',
      shape: { kind: 'i-symmetric', h, b, tw, tf, idealisation: 'thin-walled' },
    });
    const iWalls = iGraph(h, b, tw, tf);
    expect(drawn(iWalls.nodes, iWalls.walls).It).toBeCloseTo(
      iShape?.It ?? 0,
      15,
    );

    const [bf, hf, bw, th] = [200, 20, 10, 200];
    const tShape = sectionProperties({
      kind: 'shape',
      id: 'cs',
      shape: {
        kind: 't-section',
        bf,
        hf,
        bw,
        h: th,
        idealisation: 'thin-walled',
      },
    });
    const tWalls = tGraph(bf, hf, bw, th);
    expect(drawn(tWalls.nodes, tWalls.walls).It).toBeCloseTo(
      tShape?.It ?? 0,
      15,
    );
  });

  it('Zelle plus Zweig: die Differenz ist EXAKT ⅓·l·t³', () => {
    // Der zweite Term läuft nur über die OFFENEN Zweige; die Zellwandungen
    // tragen ihren Anteil bereits über Bredt.
    const [b, h, t] = [100, 200, 8];
    const box = boxGraph(b, h, t);
    const stubLength = 60;
    const stubT = 6;

    const withStub = {
      // Waagerecht aus der unteren rechten Ecke heraus, damit die Länge des
      // Zweigs genau `stubLength` ist.
      nodes: [
        ...box.nodes,
        node('e', (b - t) / 2 + stubLength, h - t / 2),
      ],
      walls: [...box.walls, wall('zweig', 'c', 'e', stubT)],
    };

    const bare = drawn(box.nodes, box.walls).It ?? 0;
    const stubbed = drawn(withStub.nodes, withStub.walls).It ?? 0;

    // In m⁴: mm → m ist 1e-3, also mm⁴ → m⁴ gleich 1e-12.
    const expected = ((stubLength * stubT ** 3) / 3) * 1e-12;
    expect(stubbed - bare).toBeCloseTo(expected, 15);
  });

  it('offen: konvergiert über drei Dekaden gegen ⅓·b·t³·(1 − 0,63·t/b + …)', () => {
    // Eine EINZELNE gerade Wand. Die Reihe ist das Orakel; der Abstand zu ihr
    // ist der Fehler der dünnwandigen Näherung selbst und muss mit `t/b`
    // linear verschwinden.
    const b = 1000;
    for (const ratio of [0.1, 0.01, 0.001]) {
      const t = b * ratio;
      const values = drawn(
        [node('a', -b / 2, 0), node('b', b / 2, 0)],
        [wall('w', 'a', 'b', t)],
      );
      const exact =
        ((b * t ** 3) / 3) * (1 - 0.63 * ratio + 0.052 * ratio ** 5);
      const error = Math.abs((values.It ?? 0) / (exact * 1e-12) - 1);

      // Der Fehler ist LINEAR in `t/b` und der Faktor ist der der Reihe: über
      // drei Dekaden bleibt `error/(t/b)` zwischen 0,60 und 0,70. Jede Dekade
      // zehntelt ihn damit — das ist die Konvergenzaussage.
      expect(error / ratio).toBeGreaterThan(0.6);
      expect(error / ratio).toBeLessThan(0.7);
    }
  });
});

describe('Der Schnitt der Zelle ist festgelegt und folgenlos', () => {
  it('dieselben Zahlen, egal an welcher Wand die Zerlegung beginnt', () => {
    const [b, h, t] = [100, 200, 8];
    const { nodes, walls } = boxGraph(b, h, t);

    const first = drawn(nodes, walls);
    for (let shift = 1; shift < walls.length; shift++) {
      const rotated = [...walls.slice(shift), ...walls.slice(0, shift)];
      const other = drawn(nodes, rotated);
      expect(other.kappaZ).toBeCloseTo(first.kappaZ ?? 0, 12);
      expect(other.kappaY).toBeCloseTo(first.kappaY ?? 0, 12);
      expect(other.It).toBeCloseTo(first.It ?? 0, 15);
      expect(other.yM).toBeCloseTo(first.yM ?? 0, 12);
      expect(other.zM).toBeCloseTo(first.zM ?? 0, 12);
    }
  });

  it('geschnitten wird an der KLEINSTEN Wand-Id, nicht an der ersten Zeile', () => {
    // Zwei Läufe tragen die Zelle, also gibt es beim Aufschneiden etwas zu
    // wählen: `links` (mit `oben`) gegen `rechts` (mit `unten`). Die
    // Reihenfolge, in der jemand seine Wände gezeichnet hat, ist keine Aussage
    // über die Figur — gedreht kommt dieselbe Wahl heraus.
    const { nodes, walls } = twoRunCellGraph(100, 200, 8, 60);

    for (let shift = 0; shift < walls.length; shift++) {
      const rotated = [...walls.slice(shift), ...walls.slice(0, shift)];
      expect(path(nodes, rotated)?.cutWallId).toBe('links');
    }
  });

  it('umbenennen verschiebt den Schnitt — den Zahlen sieht man es nicht an', () => {
    // Die Gegenprobe: hier wandert der Schnitt WIRKLICH auf den anderen Lauf,
    // und genau das darf am Ergebnis nichts ändern.
    const { nodes, walls } = twoRunCellGraph(100, 200, 8, 60);
    const first = drawn(nodes, walls);
    expect(path(nodes, walls)?.cutWallId).toBe('links');

    const renamed = walls.map((it) =>
      it.id === 'rechts' ? { ...it, id: 'a-rechts' } : it,
    );
    expect(path(nodes, renamed)?.cutWallId).toBe('a-rechts');

    const other = drawn(nodes, renamed);
    expect(other.kappaZ).toBeCloseTo(first.kappaZ ?? 0, 12);
    expect(other.kappaY).toBeCloseTo(first.kappaY ?? 0, 12);
    expect(other.It).toBeCloseTo(first.It ?? 0, 15);
    expect(other.yM).toBeCloseTo(first.yM ?? 0, 12);
    expect(other.zM).toBeCloseTo(first.zM ?? 0, 12);
  });

  it('ohne Zelle gibt es keinen Schnitt', () => {
    const { nodes, walls } = iGraph(300, 150, 7.1, 10.7);
    expect(path(nodes, walls)?.cutWallId).toBeUndefined();
  });
});

describe('Der Weg schliesst auf null — die Selbstprüfung', () => {
  it('`closingMoment` verschwindet bei offenem, Zell- und Zweigprofil', () => {
    const figures = [
      iGraph(300, 150, 7.1, 10.7),
      tGraph(200, 20, 10, 200),
      boxGraph(100, 200, 8),
    ];

    for (const figure of figures) {
      const result = path(figure.nodes, figure.walls);
      expect(result).toBeDefined();
      // Bezogen auf die Grössenordnung von `S` selbst (cm³ am Kasten: rund
      // 10²), ist das Gleitkommarauschen.
      expect(Math.abs(result?.closingSy ?? 1)).toBeLessThan(1e-9);
      expect(Math.abs(result?.closingSz ?? 1)).toBeLessThan(1e-9);
    }
  });
});

describe('Was der Wandweg NICHT beantwortet, bleibt `undefined`', () => {
  it('eine einzelne gerade Wand hat für ihre eigene Achse kein `S`', () => {
    // Der Hebelarm ist über die ganze Wand 0, das Energieintegral also
    // ebenfalls — `I²/0` wäre `Infinity` und keine Auskunft.
    const values = drawn(
      [node('a', -50, 0), node('b', 50, 0)],
      [wall('w', 'a', 'b', 40)],
    );

    expect(values.kappaZ).toBeUndefined();
    expect(values.kappaY).toBeDefined();
    expect(values.It).toBeDefined();
  });

  it('ab zwei Zellen: keine Zahlen, dafür ein Befund', () => {
    // Ein Kasten mit einem Mittelsteg — zwei Zellen.
    const { nodes, walls } = twoCellGraph(100, 100, 8);

    const values = drawn(nodes, walls);
    expect(values.kappaY).toBeUndefined();
    expect(values.kappaZ).toBeUndefined();
    expect(values.yM).toBeUndefined();
    expect(values.It).toBeUndefined();
    // Die Werte aus dem Umriss stehen weiterhin.
    expect(values.A).toBeGreaterThan(0);

    const warnings = findings(nodes, walls).warnings;
    const cells = warnings.find((it) => it instanceof MultipleCellsWarning);
    expect(cells).toBeInstanceOf(MultipleCellsWarning);
    expect((cells as MultipleCellsWarning).cells).toBe(2);
  });

  it('unverbundene Teile: keine Zahlen, dafür ein Befund', () => {
    const { nodes, walls } = disconnectedGraph(100, 200);

    const values = drawn(nodes, walls);
    expect(values.kappaY).toBeUndefined();
    expect(values.kappaZ).toBeUndefined();
    expect(values.It).toBeUndefined();

    const warning = findings(nodes, walls).warnings.find(
      (it) => it instanceof DisconnectedWallGraphWarning,
    );
    expect(warning).toBeInstanceOf(DisconnectedWallGraphWarning);
    expect((warning as DisconnectedWallGraphWarning).components).toBe(2);
  });
});

describe('`thickWallRatio`: zwei Formeln, eine Schranke', () => {
  it('QRO 60×6,3 schweigt (t/√A_m = 0,117), ein Kasten 100×100 mit t=30 nicht', () => {
    const quiet = boxGraph(60, 60, 6.3);
    expect(
      findings(quiet.nodes, quiet.walls).warnings.filter(
        (it) => it instanceof ThickWallWarning,
      ),
    ).toEqual([]);

    const loud = boxGraph(100, 100, 30);
    const warning = findings(loud.nodes, loud.walls).warnings.find(
      (it) => it instanceof ThickWallWarning,
    );
    expect(warning).toBeInstanceOf(ThickWallWarning);
    expect((warning as ThickWallWarning).closed).toBe(true);
    expect((warning as ThickWallWarning).ratio).toBeCloseTo(30 / 70, 6);
  });

  it('der offene Lauf misst an seiner LÄNGE', () => {
    const warning = findings(
      [node('a', -50, 0), node('b', 50, 0)],
      [wall('w', 'a', 'b', 40)],
    ).warnings.find((it) => it instanceof ThickWallWarning);

    expect(warning).toBeInstanceOf(ThickWallWarning);
    expect((warning as ThickWallWarning).closed).toBe(false);
    expect((warning as ThickWallWarning).ratio).toBeCloseTo(40 / 100, 9);
    expect((warning as ThickWallWarning).wallIds).toEqual(['w']);
  });

  it('das dünnwandige I schweigt', () => {
    const { nodes, walls } = iGraph(300, 150, 7.1, 10.7);
    expect(
      findings(nodes, walls).warnings.filter(
        (it) => it instanceof ThickWallWarning,
      ),
    ).toEqual([]);
  });

  it('die Schranke ist ein Policy-Feld und keine Konstante im Gate', () => {
    const { nodes, walls } = iGraph(300, 150, 7.1, 10.7);
    const geometry = createSectionGeometry(
      {
        kind: 'midline',
        nodes: [...nodes],
        walls: [...walls],
        idealisation: 'thin-walled',
      },
      POLICY,
    );
    const strict = createSectionPolicy({ thickWallRatio: 1e-3 });

    expect(
      validateSectionGeometry(geometry, strict).warnings.filter(
        (it) => it instanceof ThickWallWarning,
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('`idealisation` schaltet den Wandweg, nicht die Topologie', () => {
  it('derselbe Graph als `solid` bekommt weder κ noch `It`', () => {
    // ADR 0029: die Idealisierung entscheidet, WIE der Schub fliesst — für den
    // Vollquerschnitt ist das Grashof und nicht der Wandweg.
    const { nodes, walls } = iGraph(300, 150, 7.1, 10.7);
    const geometry = createSectionGeometry(
      {
        kind: 'midline',
        nodes: [...nodes],
        walls: [...walls],
        idealisation: 'solid',
      },
      POLICY,
    );
    const values = sectionProperties(
      { kind: 'section-geometry', id: 'cs', geometry },
      POLICY,
    );

    expect(values?.A).toBeGreaterThan(0);
    expect(values?.kappaZ).toBeUndefined();
    expect(values?.yM).toBeUndefined();
    expect(values?.It).toBeUndefined();
  });
});
