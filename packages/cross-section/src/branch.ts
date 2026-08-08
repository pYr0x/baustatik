/**
 * Die Zerlegung des Wandgraphen in LÄUFE
 * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
 *
 * `Branch` IST DAS RESERVIERTE WORT. ADR 0030 hat es festgehalten: *„`Branch`
 * means a run between junction nodes in thin-walled theory, the word the wall
 * path for open profiles will need"* — genau dieser Lauf steht hier. Er wird
 * EXPORTIERT und nicht in der Ableitung versteckt, weil P5 dieselbe Zerlegung
 * für den Wandweg braucht; ein zweiter Zerleger wäre die Doppelsprache, gegen
 * die ADR 0030 argumentiert.
 *
 * WAS HIER NICHT STEHT: die Kettung am Verzweigungsknoten und die Teilung am
 * Dickensprung. Beide sind lokal zum Offset und stehen in `derive-outline.ts`.
 * Ein Branch endet am Verzweigungsknoten — das ist die Definition der Theorie
 * und nicht die des Offsetpfades, der dort weiterkettet.
 *
 * TOTAL UND OHNE PRÜFUNG, wie `deriveOutlineFromRings`: hängende Verweise und
 * Nulllängenwände werden still übersprungen, und was daran falsch ist, sagt
 * `validateSectionGeometry` mit Namen. Eine zweite Meinung darüber, was ein
 * brauchbarer Graph ist, wäre genau die Doppelung, die das Gate abschafft.
 */

import { Bulge } from '@baustatik/section-geometry';
import type { SectionNode, Wall } from './types';

/**
 * Ein Lauf zwischen Verzweigungsknoten — an jedem Grad-2-Knoten läuft er durch,
 * an einem Knoten anderen Grades endet er.
 *
 * `nodeIds` HAT IMMER EINEN EINTRAG MEHR ALS `wallIds`: es sind die Knoten
 * ENTLANG des Laufs, `wallIds[i]` verbindet `nodeIds[i]` mit `nodeIds[i + 1]`.
 * Die Wand kann dabei GEGEN ihre eigene Richtung durchlaufen werden — wer ihre
 * Wölbung braucht, dreht das Vorzeichen mit.
 *
 * `closed` WIRD TOPOLOGISCH ENTSCHIEDEN: erster Knoten === letzter Knoten, und
 * zwar als Id. Zwei Knoten auf denselben Koordinaten sind zwei Knoten; eine
 * Epsilon-Frage hat im Graphen nichts zu suchen.
 */
export type Branch = {
  readonly wallIds: readonly string[];
  readonly nodeIds: readonly string[];
  readonly closed: boolean;
};

/**
 * Eine Wand samt ihren aufgelösten Knoten — was vom `Wall` übrig bleibt, wenn
 * die Verweise stimmen.
 */
export type GraphWall = {
  readonly wall: Wall;
  readonly start: SectionNode;
  readonly end: SectionNode;
};

/** Ein Wandende — die Einheit, in der ein Lauf sich fortsetzt. */
export type WallEndRef = {
  readonly of: GraphWall;
  readonly atStart: boolean;
};

/**
 * Der auf das Zerlegbare eingedampfte Graph.
 *
 * ENTARTETE WÄNDE FEHLEN DARIN, und zwar VOR jeder Gradzählung: eine Wand mit
 * hängendem Verweis hat kein zweites Ende, eine Wand der Länge 0 keine
 * Richtung. Beide erst hinterher zu überspringen hiesse, einen Grad zu zählen,
 * den es nicht gibt — der Knoten daneben bekäme Grad 3 und der Lauf endete an
 * einer Wand, die gar nicht da ist.
 */
export type WallGraph = {
  readonly walls: readonly GraphWall[];
  /** Je Knoten-Id die Wandenden, die dort ankommen. */
  readonly incident: ReadonlyMap<string, readonly WallEndRef[]>;
};

/** Die Fortsetzung von einem Wandende in ein anderes, symmetrisch besetzt. */
export type Continuation = ReadonlyMap<WallEndRef, WallEndRef>;

/**
 * Alle Läufe des Graphen, in DETERMINISTISCHER Reihenfolge: die offenen zuerst,
 * in der Reihenfolge der Wände, danach die geschlossenen Umläufe.
 *
 * Die Zusage, die daran hängt: **zwei Wandgraphen gleicher Gestalt liefern
 * dieselbe Zerlegung** — die Reihenfolge folgt der Eingabe, die GESTALT der
 * Laufrichtung.
 */
export function branches(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
): readonly Branch[] {
  const graph = buildGraph(nodes, walls);
  return traverse(graph, junctionsEndTheRun(graph));
}

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

/** Die Knoten-Id, an der dieses Wandende hängt. */
export function nodeIdOf(end: WallEndRef): string {
  return end.atStart ? end.of.wall.startNodeId : end.of.wall.endNodeId;
}

/**
 * Die Tangente der Wand an DIESEM Ende, gerichtet VOM Knoten WEG [rad].
 *
 * Der Bogen steckt vollständig in `bulge = tan(Δ/4)`: seine Endtangente liegt
 * um `Δ/2` neben der Sehne, am Anfang auf der einen, am Ende auf der anderen
 * Seite. Mehr braucht niemand hier — kein Mittelpunkt, kein Radius, kein `Arc`,
 * und deshalb `Bulge.sweep` statt `Bulge.toArc`: der Öffnungswinkel ist
 * koordinatenfrei.
 *
 * DIE EINE STELLE, an der diese Umrechnung steht. Das Gate liest sie für die
 * Knickwarnung (ADR 0032), der Offset für die geradeste Fortsetzung
 * (ADR 0037) — zwei Fragen, ein Winkel. Positiv dreht von `+y` nach `+z`, wie
 * `Arc.sweep` (ADR 0031).
 */
export function outgoingTangent(end: WallEndRef): number {
  const { wall, start, end: to } = end.of;
  const chord = Math.atan2(to.z - start.z, to.y - start.y);
  const half = Bulge.sweep(wall.bulge ?? 0) / 2;
  return end.atStart ? chord - half : chord + half + Math.PI;
}

/**
 * Auf `[−π, +π)` gebracht, damit `|angle|` der KLEINERE der beiden Winkel ist.
 *
 * Zweimal `%` und ein `+ 2π` dazwischen, weil JavaScripts `%` das Vorzeichen
 * des Dividenden behält: `-1 % 6` ist `-1` und nicht `5`.
 */
export function normalizeAngle(angle: number): number {
  const turn = 2 * Math.PI;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

/**
 * Die Fortsetzungen, mit denen ein BRANCH läuft: nur am Grad-2-Knoten.
 *
 * An einer Verzweigung endet der Lauf — die Definition aus ADR 0030 und nicht
 * die des Offsetpfades, der dort weiterkettet.
 */
function junctionsEndTheRun(graph: WallGraph): Continuation {
  const continuation = new Map<WallEndRef, WallEndRef>();
  for (const at of graph.incident.values()) {
    if (at.length !== 2) continue;
    const [a, b] = at;
    if (a === undefined || b === undefined) continue;
    continuation.set(a, b);
    continuation.set(b, a);
  }
  return continuation;
}

/**
 * Die Läufe zu einer gegebenen Fortsetzungsregel.
 *
 * ZWEI DURCHGÄNGE, und die Reihenfolge ist die Aussage: zuerst jeder Lauf, der
 * ein freies Ende hat — er beginnt DORT, und nur so ist seine Richtung
 * bestimmt. Was danach übrig bleibt, hat kein freies Ende und ist ein
 * geschlossener Umlauf; er beginnt an der ersten noch unbenutzten Wand, weil
 * ein Kreis keinen Anfang mitbringt.
 *
 * Wird auch vom Offset benutzt — dort mit einer Regel, die an Verzweigungen
 * weiterkettet (ADR 0037).
 */
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

    const first = nodeIds[0];
    const last = nodeIds[nodeIds.length - 1];
    return Object.freeze({
      wallIds: Object.freeze(wallIds),
      nodeIds: Object.freeze(nodeIds),
      closed: wallIds.length > 0 && first === last,
    });
  };

  // 1. Die Läufe mit freiem Ende.
  for (const graphWall of graph.walls) {
    const pair = ends.get(graphWall);
    if (pair === undefined) continue;
    for (const end of [pair.start, pair.end]) {
      if (used.has(graphWall)) continue;
      if (continuation.has(end)) continue;
      result.push(walk(end));
    }
  }

  // 2. Was übrig bleibt, ist ein geschlossener Umlauf.
  for (const graphWall of graph.walls) {
    if (used.has(graphWall)) continue;
    const pair = ends.get(graphWall);
    if (pair === undefined) continue;
    result.push(walk(pair.start));
  }

  return Object.freeze(result);
}
