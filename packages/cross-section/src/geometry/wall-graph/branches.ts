import { atOrThrow } from '@baustatik/core';
import type { SectionNode, Wall } from '../../model/section-geometry';
import {
  buildGraph,
  type Continuation,
  type GraphWall,
  nodeIdOf,
  type WallEndRef,
  type WallGraph,
} from './graph';

/**
 * Ein Lauf zwischen Verzweigungsknoten. `nodeIds` hat immer einen Eintrag mehr
 * als `wallIds`; ein geschlossener Lauf beginnt und endet an derselben ID.
 */
export type Branch = {
  readonly wallIds: readonly string[];
  readonly nodeIds: readonly string[];
  readonly closed: boolean;
};

/** Alle Läufe des Graphen in deterministischer Reihenfolge. */
export function branches(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
): readonly Branch[] {
  const graph = buildGraph(nodes, walls);
  return traverse(graph, junctionsEndTheRun(graph));
}

/** Die Endknoten eines Laufs, beim geschlossenen Umlauf zweimal derselbe. */
export function branchEnds(branch: Branch): readonly [string, string] {
  return [
    atOrThrow(branch.nodeIds, 0),
    atOrThrow(branch.nodeIds, branch.nodeIds.length - 1),
  ];
}

/** Die Zahl der unverbundenen Teile, gezählt über die Läufe. */
export function componentCount(branches: readonly Branch[]): number {
  const adjacent = new Map<string, string[]>();
  const neighboursOf = (id: string): string[] => {
    const at = adjacent.get(id) ?? [];
    adjacent.set(id, at);
    return at;
  };

  for (const branch of branches) {
    const [a, b] = branchEnds(branch);
    neighboursOf(a).push(b);
    neighboursOf(b).push(a);
  }

  const seen = new Set<string>();
  let components = 0;
  for (const start of adjacent.keys()) {
    if (seen.has(start)) continue;
    components++;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const id = stack.pop();
      if (id === undefined) break;
      for (const next of adjacent.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return components;
}

/** Die zyklomatische Zahl `E − V + C` des Graphen. */
export function cellCount(branches: readonly Branch[]): number {
  const nodeIds = new Set<string>();
  for (const branch of branches) {
    for (const id of branchEnds(branch)) nodeIds.add(id);
  }
  return branches.length - nodeIds.size + componentCount(branches);
}

function junctionsEndTheRun(graph: WallGraph): Continuation {
  const continuation = new Map<WallEndRef, WallEndRef>();
  for (const at of graph.incident.values()) {
    if (at.length !== 2) continue;
    const a = atOrThrow(at, 0);
    const b = atOrThrow(at, 1);
    continuation.set(a, b);
    continuation.set(b, a);
  }
  return continuation;
}

/** Die Läufe zu einer gegebenen Fortsetzungsregel. */
export function traverse(
  graph: WallGraph,
  continuation: Continuation,
): readonly Branch[] {
  const ends = new Map<GraphWall, { start: WallEndRef; end: WallEndRef }>();
  for (const at of graph.incident.values()) {
    for (const end of at) {
      const pair = ends.get(end.of) ?? { start: end, end };
      ends.set(
        end.of,
        end.atStart ? { ...pair, start: end } : { ...pair, end },
      );
    }
  }

  const used = new Set<GraphWall>();
  const result: Branch[] = [];
  const otherEndOf = (end: WallEndRef): WallEndRef => {
    const pair = ends.get(end.of);
    if (pair === undefined) return end;
    return end.atStart ? pair.end : pair.start;
  };

  const walk = (from: WallEndRef): Branch => {
    const wallIds: string[] = [];
    const nodeIds: string[] = [nodeIdOf(from)];
    let entry: WallEndRef | undefined = from;
    while (entry !== undefined) {
      used.add(entry.of);
      const exit = otherEndOf(entry);
      wallIds.push(entry.of.wall.id);
      nodeIds.push(nodeIdOf(exit));
      const next = continuation.get(exit);
      entry = next !== undefined && !used.has(next.of) ? next : undefined;
    }

    const first = atOrThrow(nodeIds, 0);
    const last = atOrThrow(nodeIds, nodeIds.length - 1);
    return Object.freeze({
      wallIds: Object.freeze(wallIds),
      nodeIds: Object.freeze(nodeIds),
      closed: wallIds.length > 0 && first === last,
    });
  };

  for (const graphWall of graph.walls) {
    const pair = ends.get(graphWall);
    if (pair === undefined) continue;
    for (const end of [pair.start, pair.end]) {
      if (used.has(graphWall) || continuation.has(end)) continue;
      result.push(walk(end));
    }
  }

  for (const graphWall of graph.walls) {
    if (used.has(graphWall)) continue;
    const pair = ends.get(graphWall);
    if (pair !== undefined) result.push(walk(pair.start));
  }
  return Object.freeze(result);
}
