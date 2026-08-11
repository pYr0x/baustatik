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

import { atOrThrow } from '@baustatik/core';
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
 * Richtung. Beide erst hinterher zu überspringen hieße, einen Grad zu zählen,
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

/**
 * Die Endknoten eines Laufs — beim geschlossenen Umlauf zweimal derselbe.
 *
 * `nodeIds` ist nie leer (siehe `Branch`), also gibt es beide immer.
 */
export function branchEnds(branch: Branch): readonly [string, string] {
  return [
    atOrThrow(branch.nodeIds, 0),
    atOrThrow(branch.nodeIds, branch.nodeIds.length - 1),
  ];
}

/**
 * Die Zahl der UNVERBUNDENEN Teile des Wandgraphen.
 *
 * GEZÄHLT WIRD ÜBER DIE LÄUFE und nicht über die Wände: ein Lauf ist eine
 * Kante zwischen Verzweigungsknoten, und Unterteilen einer Kante ändert weder
 * die Zahl der Teile noch die der Zellen. Damit lesen der Wandweg und das Gate
 * DIESELBE Zerlegung, statt zwei Zählungen nebeneinanderzustellen.
 *
 * `0` bei leerer Eingabe: kein Graph, kein Teil.
 */
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

/**
 * Die Zahl der ZELLEN — der zyklomatischen Zahl `E − V + C` des Graphen.
 *
 * `0` heisst OFFENES PROFIL: der Wandweg läuft dann als Baum von den freien
 * Enden. `1` heisst eine geschlossene Zelle, und dafür kommt EINE skalare
 * Verträglichkeitsgleichung dazu (`src/wall-path.ts`). Ab `2` bleibt der
 * Wandweg unbestimmt, und das Gate sagt es — dort begänne ein Gleichungssystem
 * und damit ein anderes Vorhaben.
 *
 * ÜBER DIE LÄUFE GEZÄHLT, aus demselben Grund wie `componentCount`: die
 * zyklomatische Zahl ist gegen das Unterteilen einer Kante unempfindlich, und
 * ein geschlossener Umlauf ist hier eine Kante von einem Knoten auf sich
 * selbst — er zählt als genau eine Zelle.
 */
export function cellCount(branches: readonly Branch[]): number {
  const nodeIds = new Set<string>();
  for (const branch of branches) {
    for (const id of branchEnds(branch)) nodeIds.add(id);
  }
  return branches.length - nodeIds.size + componentCount(branches);
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
    // Die Längenprüfung engt den Typ nicht ein — dafür ist `atOrThrow` da.
    const a = atOrThrow(at, 0);
    const b = atOrThrow(at, 1);
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

    // `nodeIds` trägt den Startknoten schon vor der Schleife, ist also nie
    // leer: `atOrThrow` meldet einen Bruch DIESER Invariante als solchen,
    // statt ihn in einem `undefined === undefined` verschwinden zu lassen.
    const first = atOrThrow(nodeIds, 0);
    const last = atOrThrow(nodeIds, nodeIds.length - 1);
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
