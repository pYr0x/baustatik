/**
 * `deriveOutlineFromWalls` — der Wandgraph-Zweig der Umriss-Ableitung (P3).
 *
 * DIE ORAKEL SIND GESCHLOSSEN, keine Fixture: jede Zahl unten ist von Hand
 * aufgeschrieben und aus der Figur begründet, nicht aus einem früheren Lauf
 * abgeschrieben. Wo sie an eine parametrische Form anschliesst, steht die
 * Identität selbst da (`2·b·tf + tw·(h − 2·tf)`), nicht ihr Zahlenwert.
 */

import { Polygon as GeometryPolygon } from '@baustatik/section-geometry';
import { describe, expect, it } from 'vitest';
import { createSectionPolicy } from '../src/policy';
import { deriveOutline, deriveOutlineFromWalls } from '../src/derive-outline';
import type { Polygon, SectionNode, Wall } from '../src/types';

const POLICY = createSectionPolicy();

const node = (id: string, y: number, z: number): SectionNode => ({ id, y, z });
const wall = (
  id: string,
  startNodeId: string,
  endNodeId: string,
  t: number,
): Wall => ({ id, startNodeId, endNodeId, t });

const areas = (outline: readonly Polygon[]) =>
  outline.map((polygon) => GeometryPolygon.signedArea(polygon.points));

const totalArea = (outline: readonly Polygon[]) =>
  areas(outline).reduce((sum, A) => sum + A, 0);

/**
 * Ob der Ring diesen Punkt trägt.
 *
 * MIT TOLERANZ, weil Clipper2 auf sein Offset-Raster rundet — und ohne
 * Punktzahl, weil die Vereinigung an der Naht eines Füllrings kollineare
 * Zwischenpunkte stehen lässt (ADR 0038). Sie tragen zur Fläche nichts bei.
 */
const hasPoint = (polygon: Polygon | undefined, y: number, z: number) =>
  (polygon?.points ?? []).some(
    (p) => Math.abs(p.y - y) < 1e-6 && Math.abs(p.z - z) < 1e-6,
  );

/** Die Punkte, unabhängig davon, wo der Ring zu laufen beginnt. */
const sortedPoints = (polygon: Polygon | undefined) =>
  [...(polygon?.points ?? [])]
    .map((p) => [p.y, p.z] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);

describe('Der Winkel aus zwei Wänden — der Fall, den die Demo bisher von Hand tippte', () => {
  const nodes = [node('ecke', 0, 0), node('unten', 0, 100), node('rechts', 60, 0)];
  const walls = [
    wall('steg', 'ecke', 'unten', 8),
    wall('gurt', 'ecke', 'rechts', 8),
  ];

  it('trifft genau die sechs von Hand getippten Punkte', () => {
    const outline = deriveOutlineFromWalls(nodes, walls, POLICY);

    expect(outline).toHaveLength(1);
    expect(sortedPoints(outline[0])).toEqual([
      [-4, -4],
      [-4, 100],
      [4, 4],
      [4, 100],
      [60, -4],
      [60, 4],
    ]);
    // Der Gurt 64 x 8 plus der Steg 8 x 96 — die Miter-Ecke gehört dem Gurt.
    expect(totalArea(outline)).toBeCloseTo(64 * 8 + 8 * 96, 9);
  });

  it('liefert bei vertauschten Wand-Ids DENSELBEN Umriss', () => {
    // Die Zusage der geradesten Fortsetzung: gleiche Gestalt, gleicher Umriss.
    const renamed = [
      wall('zzz', 'ecke', 'unten', 8),
      wall('aaa', 'ecke', 'rechts', 8),
    ];

    expect(sortedPoints(deriveOutlineFromWalls(nodes, renamed, POLICY)[0])).toEqual(
      sortedPoints(deriveOutlineFromWalls(nodes, walls, POLICY)[0]),
    );
  });
});

describe('Der Dickensprung teilt den Offsetpfad, nicht den Branch', () => {
  it('stösst die beiden Rechtecke stumpf aneinander — A exakt', () => {
    const nodes = [node('a', 0, 0), node('b', 60, 0), node('c', 160, 0)];
    const walls = [wall('duenn', 'a', 'b', 6), wall('dick', 'b', 'c', 10)];

    const outline = deriveOutlineFromWalls(nodes, walls, POLICY);

    expect(outline).toHaveLength(1);
    // Keine Überlappung, kein Miter: die Stufe ist echt.
    expect(totalArea(outline)).toBeCloseTo(6 * 60 + 10 * 100, 9);
    // Acht Punkte: die Stufe hat zwei Ecken mehr als das Rechteck.
    expect(outline[0]?.points).toHaveLength(8);
  });
});

describe('Der Dickensprung IN DER ECKE wird gemitert (ADR 0038)', () => {
  // Der Winkel aus `apps/demo/cross-section/cross-section-viewer.ts`: Gurt `t = 8` von
  // `links` nach `rechts`, Steg `t = 6` nach unten. Beide Waende sind
  // durchverbunden, der Offsetpfad wird am Sprung aber aufgeschnitten — den
  // Keil dazwischen setzt seit ADR 0038 der Fuellring.
  const nodes = [
    node('links', -60, 0),
    node('mitte', 0, 0),
    node('rechts', 60, 0),
    node('unten', -60, 100),
  ];
  const walls = [
    wall('gurt-links', 'links', 'mitte', 8),
    wall('gurt-rechts', 'mitte', 'rechts', 8),
    wall('steg', 'links', 'unten', 6),
  ];

  it('setzt die Ecke auf den Schnittpunkt der beiden Aussenkanten', () => {
    const outline = deriveOutlineFromWalls(nodes, walls, POLICY);

    expect(outline).toHaveLength(1);
    // Aussenkante des Gurts `z = −4`, Aussenkante des Stegs `y = −63`: die Ecke
    // gehoert dorthin, wo die beiden sich treffen.
    expect(hasPoint(outline[0], -63, -4)).toBe(true);
    // Und die Stufe, die bis ADR 0038 dort stand, ist weg.
    expect(hasPoint(outline[0], -60, 0)).toBe(false);
    // Gurt 120 x 8 plus Steg 6 x 100: mit der Ecke geht die Rechnung GLATT auf,
    // weil der Keil (3 x 4) genau die Ueberdeckung ausgleicht, die Gurt und Steg
    // sich teilen (3 x 4). Ohne ihn blieben 1548 statt 1560.
    expect(totalArea(outline)).toBeCloseTo(120 * 8 + 6 * 100, 6);
  });

  it('baut dieselbe Ecke wie Clipper2 — stetig bei `t1 → t2`', () => {
    // DER BEWEIS GEGEN FLICKWERK: bei gleicher Dicke mitert Clipper2 selbst,
    // eine Winzigkeit daneben uebernimmt der Fuellring. Beide Wege muessen
    // dieselbe Figur bauen — ohne Fuellung fehlten hier die `4 · 4 = 16` des
    // Keils, also das Zehntausendfache dessen, was die Dickenaenderung selbst
    // ausmacht.
    const gleich = deriveOutlineFromWalls(
      nodes,
      walls.map((it) => ({ ...it, t: 8 })),
      POLICY,
    );
    const fastGleich = deriveOutlineFromWalls(
      nodes,
      walls.map((it) => ({ ...it, t: it.id === 'steg' ? 8.000001 : 8 })),
      POLICY,
    );

    expect(totalArea(fastGleich)).toBeCloseTo(totalArea(gleich), 3);
  });

  it('gibt dem geschweissten Kasten seine vier Ecken zurück', () => {
    // Kasten 200 x 400, Gurte `tf = 20`, Stege `tw = 10`: vier durchverbundene
    // Stoesse, an jedem ein Dickensprung. A ist die Mittellinienlaenge mal ihre
    // Dicke plus die vier Keile `tf/2 · tw/2`.
    const b = 200;
    const h = 400;
    const tf = 20;
    const tw = 10;
    const y = b / 2 - tw / 2;
    const zTop = tf / 2;
    const zBottom = h - tf / 2;
    const kasten = [
      node('ol', -y, zTop),
      node('or', y, zTop),
      node('ur', y, zBottom),
      node('ul', -y, zBottom),
    ];
    const bleche = [
      wall('gurt-oben', 'ol', 'or', tf),
      wall('steg-rechts', 'or', 'ur', tw),
      wall('gurt-unten', 'ur', 'ul', tf),
      wall('steg-links', 'ul', 'ol', tw),
    ];

    const outline = deriveOutlineFromWalls(kasten, bleche, POLICY);
    const [aussen, loch] = areas(outline);

    expect(outline).toHaveLength(2);
    expect(aussen).toBeGreaterThan(0);
    expect(loch).toBeLessThan(0);
    // Mit gemiterten Ecken ist der Kasten das Aussenrechteck minus dem
    // Innenrechteck — die geschlossene Form, die es ohne die vier Keile nicht
    // gaebe (dann fehlten `4 · tf/2 · tw/2 = 200 mm²`).
    expect(totalArea(outline)).toBeCloseTo(
      b * h - (b - 2 * tw) * (h - 2 * tf),
      6,
    );
  });

  it('kappt den Spitz am spitzen Stoss', () => {
    // 20° Innenwinkel UND Dickensprung. Der ungekappte Miterpunkt liegt auf der
    // Aussenkante der dickeren Wand (`z = −5`), dort wo die Aussenkante der
    // duenneren sie schneidet — rund 23 vom Knoten weg. Gekappt wird bei
    // `miterLimit · max(t)/2 = 10`, und zwar QUER zur Richtung des Spitzes.
    const alpha = Math.PI / 9;
    const spitz = [
      node('ecke', 0, 0),
      node('a', 100, 0),
      node('b', 100 * Math.cos(alpha), 100 * Math.sin(alpha)),
    ];
    const bleche = [wall('w1', 'ecke', 'a', 10), wall('w2', 'ecke', 'b', 6)];

    // Der Miterpunkt von Hand: die Aussenkante von `w2` liegt um 3 neben ihrer
    // Achse, geschnitten mit `z = −5`.
    const miterZ = -5;
    const miterY =
      -3 * Math.sin(alpha) +
      ((miterZ - 3 * Math.cos(alpha)) / Math.sin(alpha)) * Math.cos(alpha);
    const reach = Math.hypot(miterY, miterZ);
    const direction = { y: miterY / reach, z: miterZ / reach };

    const outline = deriveOutlineFromWalls(spitz, bleche, POLICY);
    const points = outline[0]?.points ?? [];

    expect(reach).toBeGreaterThan(10);
    expect(hasPoint(outline[0], miterY, miterZ)).toBe(false);
    // Die Zusage der Kappung: kein Punkt reicht in Richtung des Spitzes weiter
    // als die Schranke.
    for (const p of points) {
      expect(p.y * direction.y + p.z * direction.z).toBeLessThanOrEqual(
        10 + 1e-6,
      );
    }
  });
});

describe('Die schräge Verzweigung — das symmetrische Y', () => {
  it('deckt drei Rechtecke ab, jede Überlappung genau einmal abgezogen', () => {
    // Drei Wände `t = 8`, Länge 100, unter 120°. Die Symmetrie nimmt der
    // Zugwahl ihre Willkür: welche zwei verkettet werden, ist gleichgültig,
    // weil der Miter-Keil in JEDEM Fall vollständig im dritten Rechteck liegt.
    const arm = (index: number) => ({
      y: 100 * Math.cos((2 * Math.PI * index) / 3),
      z: 100 * Math.sin((2 * Math.PI * index) / 3),
    });
    const nodes = [
      node('m', 0, 0),
      node('a1', arm(0).y, arm(0).z),
      node('a2', arm(1).y, arm(1).z),
      node('a3', arm(2).y, arm(2).z),
    ];
    const walls = [
      wall('w1', 'm', 'a1', 8),
      wall('w2', 'm', 'a2', 8),
      wall('w3', 'm', 'a3', 8),
    ];

    const outline = deriveOutlineFromWalls(nodes, walls, POLICY);

    // 3 · (8 · 100) minus drei paarweise Überlappungen von je `t²/(4·√3)`;
    // eine Dreifachüberlappung gibt es nicht — sie ist der Punkt `m` selbst.
    // Der Miter-Keil des verketteten Paares liegt vollständig im dritten
    // Rechteck und trägt deshalb nichts bei.
    //
    // DREI NACHKOMMASTELLEN, und die Grenze ist die einzige Näherung im Spiel:
    // `OFFSET_PRECISION` rastert die Koordinaten auf 10^-6 mm, und die
    // Armspitzen unter 120° liegen irrational. Die Abweichung wächst absolut
    // mit der Figur und fällt relativ je Dekade um 10 — hier 1,7·10^-8.
    expect(outline).toHaveLength(1);
    expect(totalArea(outline)).toBeCloseTo(
      3 * 8 * 100 - (Math.sqrt(3) * 8 * 8) / 4,
      3,
    );
  });
});

describe('Die Umrisse treffen die parametrischen Formen', () => {
  it('gibt für das I-Profil `2·b·tf + tw·(h − 2·tf)`', () => {
    const h = 300;
    const b = 150;
    const tw = 7.1;
    const tf = 10.7;
    const zf = h / 2 - tf / 2;

    const nodes = [
      node('ol', -b / 2, -zf),
      node('om', 0, -zf),
      node('or', b / 2, -zf),
      node('ul', -b / 2, zf),
      node('um', 0, zf),
      node('ur', b / 2, zf),
    ];
    const walls = [
      wall('gurt-o-links', 'ol', 'om', tf),
      wall('gurt-o-rechts', 'om', 'or', tf),
      wall('steg', 'om', 'um', tw),
      wall('gurt-u-links', 'ul', 'um', tf),
      wall('gurt-u-rechts', 'um', 'ur', tf),
    ];

    const outline = deriveOutlineFromWalls(nodes, walls, POLICY);

    expect(outline).toHaveLength(1);
    expect(totalArea(outline)).toBeCloseTo(2 * b * tf + tw * (h - 2 * tf), 9);
  });

  it('gibt für den Plattenbalken `bf·hf + bw·(h − hf)`', () => {
    const bf = 400;
    const hf = 100;
    const bw = 150;
    const h = 600;

    const nodes = [
      node('links', -bf / 2, hf / 2),
      node('mitte', 0, hf / 2),
      node('rechts', bf / 2, hf / 2),
      node('fuss', 0, h),
    ];
    const walls = [
      wall('gurt-links', 'links', 'mitte', hf),
      wall('gurt-rechts', 'mitte', 'rechts', hf),
      wall('steg', 'mitte', 'fuss', bw),
    ];

    const outline = deriveOutlineFromWalls(nodes, walls, POLICY);

    expect(outline).toHaveLength(1);
    expect(totalArea(outline)).toBeCloseTo(bf * hf + bw * (h - hf), 9);
  });

  it('gibt für den Kasten zwei Ringe — Aussenring positiv, Loch negativ', () => {
    const b = 200;
    const h = 400;
    const t = 12;
    const y = (b - t) / 2;
    const z = (h - t) / 2;

    const nodes = [
      node('a', -y, -z),
      node('b', y, -z),
      node('c', y, z),
      node('d', -y, z),
    ];
    const walls = [
      wall('oben', 'a', 'b', t),
      wall('rechts', 'b', 'c', t),
      wall('unten', 'c', 'd', t),
      wall('links', 'd', 'a', t),
    ];

    const outline = deriveOutlineFromWalls(nodes, walls, POLICY);

    expect(outline).toHaveLength(2);
    // Der Innenring steht UNMITTELBAR hinter seinem Aussenring.
    expect(areas(outline)[0]).toBeCloseTo(b * h, 9);
    expect(areas(outline)[1]).toBeCloseTo(-(b - 2 * t) * (h - 2 * t), 9);
    // Und die Summe ist die Fläche des dünnwandigen Kastens.
    expect(totalArea(outline)).toBeCloseTo(2 * (b + h) * t - 4 * t * t, 9);
  });
});

describe('deriveOutline ist die EINE Tür', () => {
  it('verzweigt über `kind` — Ringe unverändert, Wände aufgeweitet', () => {
    const fromRings = deriveOutline(
      {
        kind: 'outline',
        rings: [
          {
            vertices: [
              { y: 0, z: 0 },
              { y: 100, z: 0 },
              { y: 100, z: 50 },
              { y: 0, z: 50 },
            ],
          },
        ],
        outline: [],
      },
      POLICY,
    );
    expect(totalArea(fromRings)).toBeCloseTo(100 * 50, 9);

    const fromWalls = deriveOutline(
      {
        kind: 'midline',
        idealisation: 'thin-walled',
        nodes: [node('a', 0, 0), node('b', 100, 0)],
        walls: [wall('w', 'a', 'b', 10)],
        outline: [],
      },
      POLICY,
    );
    expect(totalArea(fromWalls)).toBeCloseTo(100 * 10, 9);
  });

  it('bleibt total: ein Graph ohne brauchbare Wand gibt einen leeren Umriss', () => {
    expect(deriveOutlineFromWalls([], [], POLICY)).toEqual([]);
    expect(
      deriveOutlineFromWalls(
        [node('a', 0, 0), node('b', 100, 0)],
        [wall('kaputt', 'a', 'b', Number.NaN)],
        POLICY,
      ),
    ).toEqual([]);
  });
});
