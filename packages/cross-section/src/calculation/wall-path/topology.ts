import { atOrThrow } from '@baustatik/core';
import { Polygon } from '@baustatik/section-geometry';
import { branchEnds } from '../../geometry/wall-graph/branches';
import { reverseSegment, type Segment, type SegmentRun } from './segments';

/** Eine Kante des Lauf-Graphen: ein `SegmentRun` zwischen zwei Knoten-Ids. */
type Edge = {
  readonly index: number;
  readonly run: SegmentRun;
  readonly a: string;
  readonly b: string;
};

/**
 * Die Lage eines Wegstücks zum Zellumlauf: `0` abseits der Zelle, `+1` mit dem
 * festgelegten Umlaufsinn, `−1` gegen ihn.
 *
 * DREI WERTE UND KEINE ZAHL: `sigma` wird multipliziert und aufsummiert, aber
 * ein `2` daraus wäre keine schwächere Aussage, sondern gar keine. Der Typ
 * sagt, was der Wertebereich ist, statt es dem Leser zu überlassen.
 */
export type Sigma = -1 | 0 | 1;

/** Eine Kante mit einer Durchlaufrichtung. */
export type Step = {
  readonly edge: Edge;
  readonly forward: boolean;
  readonly from: string;
  readonly to: string;
  /** In Laufrichtung orientiert. */
  readonly segments: readonly Segment[];
  readonly sigma: Sigma;
};

export type WallPathTopology = {
  readonly steps: readonly Step[];
  readonly cycle: readonly Step[];
  readonly cutWallId?: string;
};

/** Bereitet Traversierung und reproduzierbaren Zellschnitt für den Wandweg vor. */
export function topology(
  runs: readonly SegmentRun[],
  hasCell: boolean,
): WallPathTopology | undefined {
  const edges = runs.map((run, index) => {
    const [a, b] = branchEnds(run.branch);
    return { index, run, a, b };
  });
  const cycle = hasCell ? circulation(edges) : [];
  const steps = traversalOrder(edges, cycle);
  if (steps === undefined) return undefined;

  return {
    steps,
    cycle,
    ...(cycle.length === 0
      ? {}
      : { cutWallId: smallestWallId(atOrThrow(cycle, 0).edge) }),
  };
}

function orientedSegments(edge: Edge, forward: boolean): readonly Segment[] {
  return forward
    ? edge.run.segments
    : [...edge.run.segments].reverse().map(reverseSegment);
}

/**
 * Die kleinste Wand-Id eines Laufs — der Name, unter dem er in einer Auswahl
 * antritt.
 *
 * DIE ID UND NICHT DIE STELLE IM ARRAY: die Reihenfolge, in der jemand seine
 * Wände gezeichnet hat, ist keine Aussage über die Figur. Ein Lauf ohne Wand
 * kann es nach `branches` nicht geben; `''` sortiert dann vor jeder Id, statt
 * einen Sonderfall zu eröffnen.
 */
function smallestWallId(edge: Edge): string {
  return [...edge.run.branch.wallIds].sort().at(0) ?? '';
}

/**
 * Die Auswahl unter mehreren Kanten — IMMER über die Wand-Id.
 *
 * Die eine Stelle, an der der Schnittort und die Fortsetzung entschieden
 * werden. Sie steht hier zusammen, weil beide dieselbe Zusage tragen müssen:
 * gleiche Gestalt, gleiche Wahl, unabhängig davon, in welcher Reihenfolge die
 * Wände hereingekommen sind.
 */
function byWallId(candidates: readonly Edge[]): Edge | undefined {
  let best: Edge | undefined;
  for (const edge of candidates) {
    if (best === undefined || smallestWallId(edge) < smallestWallId(best)) {
      best = edge;
    }
  }
  return best;
}

/**
 * Die Zelle in ihrem Umlaufsinn — im Sinn `signedArea > 0` (ADR 0034).
 *
 * DER SINN WIRD FESTGELEGT UND NICHT GEERBT: die Eingabereihenfolge der Wände
 * darf `A_m` und damit `It` nicht drehen, und `S₀` hinge sonst am Vorzeichen
 * einer Zufälligkeit. Gezählt wird über die Fläche, die die Mittellinie
 * einschliesst.
 *
 * DER ANFANG IST DIE KLEINSTE WAND-ID DER ZELLE, und das ist mehr als
 * „deterministisch": vor dem ersten Schritt hat die Traversierung noch nichts
 * erreicht, alle Zellkanten stehen also gleich — und Gleichstand entscheidet
 * die Wand-Id. Die Stelle im Eingabe-Array täte es NICHT: dieselbe Figur mit
 * gedrehter Wandliste bekäme einen anderen Schnitt, und die Zusage „gleiche
 * Gestalt, gleiche Rechnung" hinge an der Tippreihenfolge. Wo geschnitten
 * wird, ändert das Ergebnis ohnehin nicht; `cutWallId` und ein Test halten
 * beides fest.
 */
function circulation(edges: readonly Edge[]): readonly Step[] {
  const onCycle = cycleEdges(edges);
  const first = byWallId(onCycle);
  if (first === undefined) return [];

  const used = new Set<Edge>([first]);
  const order: { edge: Edge; forward: boolean }[] = [
    { edge: first, forward: true },
  ];
  let at = first.b;

  while (order.length < onCycle.length) {
    const next = byWallId(
      onCycle.filter(
        (edge) => !used.has(edge) && (edge.a === at || edge.b === at),
      ),
    );
    // Die Zelle ist ein geschlossener Umlauf; eine Kante ohne Fortsetzung wäre
    // ein Bruch der Zellzählung und keine Eingabe, über die zu urteilen wäre.
    if (next === undefined) return [];
    const forward = next.a === at;
    order.push({ edge: next, forward });
    used.add(next);
    at = forward ? next.b : next.a;
  }

  const forward = order.map(({ edge, forward: f }) => asStep(edge, f, +1));
  const points = forward.flatMap((step) =>
    step.segments.map(({ y, z }) => ({ y, z })),
  );
  if (Polygon.signedArea(points) >= 0) return forward;

  // Verkehrt herum: dieselbe Kette rückwärts, damit die erste Kante die erste
  // bleibt und der Schnittort davon unberührt ist.
  const head = atOrThrow(order, 0);
  return [head, ...order.slice(1).reverse()].map(({ edge, forward: f }) =>
    asStep(edge, !f, +1),
  );
}

function asStep(edge: Edge, forward: boolean, sigma: Sigma): Step {
  return {
    edge,
    forward,
    from: forward ? edge.a : edge.b,
    to: forward ? edge.b : edge.a,
    segments: orientedSegments(edge, forward),
    sigma,
  };
}

/**
 * Die Kanten, die nach dem Abschälen aller freien Enden übrig bleiben — die
 * Zelle.
 */
function cycleEdges(edges: readonly Edge[]): readonly Edge[] {
  const degree = new Map<string, number>();
  const bump = (id: string, by: number): void => {
    degree.set(id, (degree.get(id) ?? 0) + by);
  };
  for (const edge of edges) {
    bump(edge.a, 1);
    bump(edge.b, 1);
  }

  const alive = new Set(edges);
  let peeled = true;
  while (peeled) {
    peeled = false;
    // oxlint-disable-next-line unicorn/no-useless-spread -- die Kopie ist Absicht: die Schleife loescht aus `alive`, die Iteration darf dabei nicht mitwandern.
    for (const edge of [...alive]) {
      if (degree.get(edge.a) !== 1 && degree.get(edge.b) !== 1) continue;
      alive.delete(edge);
      bump(edge.a, -1);
      bump(edge.b, -1);
      peeled = true;
    }
  }

  return edges.filter((edge) => alive.has(edge));
}

/**
 * Die Reihenfolge, in der der Weg gelaufen wird — von den freien Enden nach
 * innen.
 *
 * DIE ORDNUNG IST DIE AUSSAGE: eine Kante wird erst verlassen, wenn an ihrem
 * Startknoten alles ANDERE schon angekommen ist. Nur dann ist `S` dort die
 * Summe der ankommenden Flüsse, und am freien Ende ist sie 0 — die
 * Randbedingung der offenen Theorie, ohne Sonderfall.
 *
 * DIE ZELLE WIRD AUFGESCHNITTEN, indem ihr Anfangsknoten VERDOPPELT wird: die
 * erste Zellkante hängt danach an einem Knoten mit Grad 1, also an einem
 * freien Ende mit `S = 0`. Aus der Zelle wird damit ein Baum, und was der
 * Schnitt weggenommen hat, gibt `S₀` zurück.
 *
 * `undefined`, wenn nicht jede Kante erreicht wird — dann war es kein Baum,
 * und das ist ein Bruch der Zellzählung.
 */
function traversalOrder(
  edges: readonly Edge[],
  cycle: readonly Step[],
): readonly Step[] | undefined {
  const ends = new Map<Edge, readonly [string, string]>(
    edges.map((edge) => [edge, [edge.a, edge.b] as const]),
  );

  const cut = cycle.at(0);
  if (cut !== undefined) {
    const alias = freshId(cut.from, edges);
    ends.set(cut.edge, cut.forward ? [alias, cut.edge.b] : [cut.edge.a, alias]);
  }

  const incident = new Map<string, Edge[]>();
  const remaining = new Map<string, number>();
  for (const edge of edges) {
    for (const id of ends.get(edge) ?? []) {
      const at = incident.get(id) ?? [];
      at.push(edge);
      incident.set(id, at);
      remaining.set(id, (remaining.get(id) ?? 0) + 1);
    }
  }

  const sigmaOf = new Map<Edge, boolean>(
    cycle.map((step) => [step.edge, step.forward]),
  );

  const processed = new Set<Edge>();
  const order: Step[] = [];
  const queue = [...remaining.keys()].filter((id) => remaining.get(id) === 1);

  while (queue.length > 0) {
    const from = queue.shift();
    if (from === undefined) break;
    if (remaining.get(from) !== 1) continue;

    const edge = (incident.get(from) ?? []).find((it) => !processed.has(it));
    if (edge === undefined) continue;
    processed.add(edge);

    const [a, b] = ends.get(edge) ?? ([edge.a, edge.b] as const);
    const forward = a === from;
    const to = forward ? b : a;

    const circulationForward = sigmaOf.get(edge);
    order.push({
      edge,
      forward,
      from,
      to,
      segments: orientedSegments(edge, forward),
      sigma:
        circulationForward === undefined
          ? 0
          : circulationForward === forward
            ? +1
            : -1,
    });

    remaining.set(from, 0);
    remaining.set(to, (remaining.get(to) ?? 1) - 1);
    if (remaining.get(to) === 1) queue.push(to);
  }

  return order.length === edges.length ? order : undefined;
}

/** Eine Knoten-Id, die es im Graphen nicht gibt — der Zwilling des Schnitts. */
function freshId(base: string, edges: readonly Edge[]): string {
  const taken = new Set(edges.flatMap((edge) => [edge.a, edge.b]));
  let id = `${base}#cut`;
  while (taken.has(id)) id += '#';
  return id;
}
