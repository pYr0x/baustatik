import { Bulge } from '@baustatik/section-geometry';
import type { SectionNode, Wall } from '../../model/section-geometry';

/** Eine Wand samt ihren aufgelösten Knoten. */
export type GraphWall = {
  readonly wall: Wall;
  readonly start: SectionNode;
  readonly end: SectionNode;
};

/** Ein Wandende, die Einheit einer Fortsetzungsregel. */
export type WallEndRef = {
  readonly of: GraphWall;
  readonly atStart: boolean;
};

/** Der auf gültig referenzierte, nicht entartete Wände reduzierte Graph. */
export type WallGraph = {
  readonly walls: readonly GraphWall[];
  readonly incident: ReadonlyMap<string, readonly WallEndRef[]>;
};

/** Die Fortsetzung von einem Wandende in ein anderes, symmetrisch besetzt. */
export type Continuation = ReadonlyMap<WallEndRef, WallEndRef>;

export function buildGraph(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
): WallGraph {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const kept: GraphWall[] = [];

  for (const wall of walls) {
    const start = byId.get(wall.startNodeId);
    const end = byId.get(wall.endNodeId);
    if (start === undefined || end === undefined) continue;
    if (start.y === end.y && start.z === end.z) continue;
    kept.push({ wall, start, end });
  }

  const incident = new Map<string, WallEndRef[]>();
  for (const graphWall of kept) {
    for (const atStart of [true, false]) {
      const nodeId = atStart
        ? graphWall.wall.startNodeId
        : graphWall.wall.endNodeId;
      const at = incident.get(nodeId) ?? [];
      at.push({ of: graphWall, atStart });
      incident.set(nodeId, at);
    }
  }

  return { walls: kept, incident };
}

/** Die Knoten-ID, an der dieses Wandende hängt. */
export function nodeIdOf(end: WallEndRef): string {
  return end.atStart ? end.of.wall.startNodeId : end.of.wall.endNodeId;
}

/** Die Tangente an diesem Ende, gerichtet vom Knoten weg [rad]. */
export function outgoingTangent(end: WallEndRef): number {
  const { wall, start, end: to } = end.of;
  const chord = Math.atan2(to.z - start.z, to.y - start.y);
  const half = Bulge.sweep(wall.bulge ?? 0) / 2;
  return end.atStart ? chord - half : chord + half + Math.PI;
}

/** Auf `[−π, +π)` gebracht. */
export function normalizeAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}
