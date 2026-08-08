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
