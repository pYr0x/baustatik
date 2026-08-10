import { describe, expect, it } from 'vitest';
import { branches, cellCount, componentCount } from '../src/branch';
import type { SectionNode, Wall } from '../src/types';

const node = (id: string, y: number, z: number): SectionNode => ({ id, y, z });

const wall = (
  id: string,
  startNodeId: string,
  endNodeId: string,
  t = 8,
): Wall => ({ id, startNodeId, endNodeId, t });

describe('branches zerlegt den Wandgraphen in Läufe zwischen Verzweigungsknoten', () => {
  it('legt eine Kette aus lauter Grad-2-Knoten in EINEN Branch', () => {
    const nodes = [node('a', 0, 0), node('b', 100, 0), node('c', 100, 100)];
    const walls = [wall('w1', 'a', 'b'), wall('w2', 'b', 'c')];

    const result = branches(nodes, walls);

    expect(result).toHaveLength(1);
    expect(result[0]?.wallIds).toEqual(['w1', 'w2']);
    expect(result[0]?.nodeIds).toEqual(['a', 'b', 'c']);
    expect(result[0]?.closed).toBe(false);
  });

  it('beendet den Lauf am Grad-3-Knoten — drei Wände, drei Branches', () => {
    // Das T: der Steg trifft die durchlaufende Gurtplatte in ihrer Mitte.
    const nodes = [
      node('links', -50, 0),
      node('mitte', 0, 0),
      node('rechts', 50, 0),
      node('unten', 0, 100),
    ];
    const walls = [
      wall('gurt-links', 'links', 'mitte'),
      wall('gurt-rechts', 'mitte', 'rechts'),
      wall('steg', 'mitte', 'unten'),
    ];

    const result = branches(nodes, walls);

    expect(result).toHaveLength(3);
    expect(result.map((branch) => branch.wallIds)).toEqual([
      ['gurt-links'],
      ['gurt-rechts'],
      ['steg'],
    ]);
  });

  it('erkennt den geschlossenen Umlauf TOPOLOGISCH — ein Branch ohne Enden', () => {
    const nodes = [
      node('a', 0, 0),
      node('b', 100, 0),
      node('c', 100, 200),
      node('d', 0, 200),
    ];
    const walls = [
      wall('w1', 'a', 'b'),
      wall('w2', 'b', 'c'),
      wall('w3', 'c', 'd'),
      wall('w4', 'd', 'a'),
    ];

    const result = branches(nodes, walls);

    expect(result).toHaveLength(1);
    expect(result[0]?.closed).toBe(true);
    expect(result[0]?.wallIds).toHaveLength(4);
    // Erster und letzter Knoten sind DERSELBE Eintrag.
    expect(result[0]?.nodeIds).toHaveLength(5);
    expect(result[0]?.nodeIds.at(0)).toBe(result[0]?.nodeIds.at(-1));
  });

  it('hält zwei Knoten auf denselben Koordinaten für zwei Knoten', () => {
    // Der Umlauf ist NICHT geschlossen: `d` und `a` liegen aufeinander, sind
    // aber verschiedene Knoten. Eine Epsilon-Frage hat im Graphen nichts zu
    // suchen.
    const nodes = [
      node('a', 0, 0),
      node('b', 100, 0),
      node('c', 100, 200),
      node('d', 0, 0),
    ];
    const walls = [
      wall('w1', 'a', 'b'),
      wall('w2', 'b', 'c'),
      wall('w3', 'c', 'd'),
    ];

    const result = branches(nodes, walls);

    expect(result).toHaveLength(1);
    expect(result[0]?.closed).toBe(false);
    expect(result[0]?.nodeIds).toEqual(['a', 'b', 'c', 'd']);
  });

  it('bleibt total: hängende Verweise und Nulllängenwände fallen still weg', () => {
    const nodes = [node('a', 0, 0), node('b', 100, 0), node('c', 100, 0)];
    const walls = [
      wall('gut', 'a', 'b'),
      wall('haengt', 'b', 'gibt-es-nicht'),
      wall('null-lang', 'b', 'c'),
    ];

    const result = branches(nodes, walls);

    expect(result.flatMap((branch) => branch.wallIds)).toEqual(['gut']);
  });

  it('gibt für einen leeren Graphen eine leere Zerlegung zurück', () => {
    expect(branches([], [])).toEqual([]);
  });
});

/**
 * Die Topologie, aus der P5 seinen Wandweg wählt: `0` Zellen laufen als Baum,
 * `1` bringt eine skalare Verträglichkeit mit, ab `2` bleibt es unbestimmt
 * ([ADR 0040](../../../docs/adr/0040-the-wall-path-is-positioned.md)).
 *
 * GEZÄHLT WIRD ÜBER DIE LÄUFE und nicht über die Wände — die zyklomatische
 * Zahl ist gegen das Unterteilen einer Kante unempfindlich, und damit lesen
 * das Gate und der Wandweg DIESELBE Zerlegung.
 */
describe('cellCount und componentCount zählen über die Läufe', () => {
  const box = {
    nodes: [
      node('a', 0, 0),
      node('b', 100, 0),
      node('c', 100, 200),
      node('d', 0, 200),
    ],
    walls: [
      wall('w1', 'a', 'b'),
      wall('w2', 'b', 'c'),
      wall('w3', 'c', 'd'),
      wall('w4', 'd', 'a'),
    ],
  };

  it('das offene T hat keine Zelle und einen Teil', () => {
    const nodes = [
      node('links', -50, 0),
      node('mitte', 0, 0),
      node('rechts', 50, 0),
      node('unten', 0, 100),
    ];
    const walls = [
      wall('gurt-links', 'links', 'mitte'),
      wall('gurt-rechts', 'mitte', 'rechts'),
      wall('steg', 'mitte', 'unten'),
    ];

    expect(cellCount(branches(nodes, walls))).toBe(0);
    expect(componentCount(branches(nodes, walls))).toBe(1);
  });

  it('der geschlossene Kasten ist EIN Lauf und trotzdem EINE Zelle', () => {
    // Er ist eine Kante von einem Knoten auf sich selbst; `E − V + C` gibt
    // `1 − 1 + 1`.
    const decomposition = branches(box.nodes, box.walls);
    expect(decomposition).toHaveLength(1);
    expect(cellCount(decomposition)).toBe(1);
    expect(componentCount(decomposition)).toBe(1);
  });

  it('ein Mittelsteg macht aus einer Zelle zwei', () => {
    const nodes = [
      ...box.nodes,
      node('m1', 50, 0),
      node('m2', 50, 200),
    ];
    const walls = [
      wall('o1', 'a', 'm1'),
      wall('o2', 'm1', 'b'),
      wall('rechts', 'b', 'c'),
      wall('u1', 'c', 'm2'),
      wall('u2', 'm2', 'd'),
      wall('links', 'd', 'a'),
      wall('mitte', 'm1', 'm2'),
    ];

    expect(cellCount(branches(nodes, walls))).toBe(2);
  });

  it('zwei getrennte Wände sind zwei Teile und keine Zelle', () => {
    const nodes = [
      node('a', 0, 0),
      node('b', 100, 0),
      node('c', 0, 200),
      node('d', 100, 200),
    ];
    const walls = [wall('links', 'a', 'b'), wall('rechts', 'c', 'd')];

    expect(componentCount(branches(nodes, walls))).toBe(2);
    expect(cellCount(branches(nodes, walls))).toBe(0);
  });

  it('der leere Graph hat weder Teil noch Zelle', () => {
    expect(componentCount([])).toBe(0);
    expect(cellCount([])).toBe(0);
  });
});
