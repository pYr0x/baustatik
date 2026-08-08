import { describe, expect, it } from 'vitest';
import { branches } from '../src/branch';
import type { SectionNode, Wall } from '../src/types';

const node = (id: string, y: number, z: number): SectionNode => ({ id, y, z });

const wall = (
  id: string,
  startNodeId: string,
  endNodeId: string,
  t = 8,
): Wall => ({ id, startNodeId, endNodeId, t });

describe('branches zerlegt den Wandgraphen in Laeufe zwischen Verzweigungsknoten', () => {
  it('legt eine Kette aus lauter Grad-2-Knoten in EINEN Branch', () => {
    const nodes = [node('a', 0, 0), node('b', 100, 0), node('c', 100, 100)];
    const walls = [wall('w1', 'a', 'b'), wall('w2', 'b', 'c')];

    const result = branches(nodes, walls);

    expect(result).toHaveLength(1);
    expect(result[0]?.wallIds).toEqual(['w1', 'w2']);
    expect(result[0]?.nodeIds).toEqual(['a', 'b', 'c']);
    expect(result[0]?.closed).toBe(false);
  });

  it('beendet den Lauf am Grad-3-Knoten — drei Waende, drei Branches', () => {
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

  it('haelt zwei Knoten auf denselben Koordinaten fuer zwei Knoten', () => {
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

  it('bleibt total: haengende Verweise und Nulllaengenwaende fallen still weg', () => {
    const nodes = [node('a', 0, 0), node('b', 100, 0), node('c', 100, 0)];
    const walls = [
      wall('gut', 'a', 'b'),
      wall('haengt', 'b', 'gibt-es-nicht'),
      wall('null-lang', 'b', 'c'),
    ];

    const result = branches(nodes, walls);

    expect(result.flatMap((branch) => branch.wallIds)).toEqual(['gut']);
  });

  it('gibt fuer einen leeren Graphen eine leere Zerlegung zurueck', () => {
    expect(branches([], [])).toEqual([]);
  });
});
