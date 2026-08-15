import { atOrThrow } from '@baustatik/core';
import { Polygon as GeometryPolygon } from '@baustatik/section-geometry';
import type { Polygon, SectionNode, Wall } from '../../model/section-geometry';
import type { SectionPolicy } from '../../policy';
import type { PointYZ } from '../point-yz';
import { traverse } from '../wall-graph/branches';
import type { GraphWall } from '../wall-graph/graph';
import { wallPolyline } from '../wall-graph/wall-polyline';
import {
  buildUsableWallGraph,
  jointFills,
  straightestContinuation,
} from './miter-joints';

/**
 * Der Umriss aus dem WANDGRAPHEN — Aufweitung um `t/2` und Vereinigung.
 *
 * AUFGEWEITET WIRD DER ZUG, NICHT DIE WAND, und daraus folgt die Form der
 * ganzen Ableitung (ADR 0037). `JoinType` wirkt INNERHALB eines Pfades: weitet
 * man jede Wand einzeln auf und vereinigt danach, sieht Clipper2 die Ecke
 * zwischen zwei Wänden nie, und außen bleibt eine Kerbe, die KEIN Join-Typ
 * schließt. Zwei Wände schließen ihre Ecke nur, wenn sie als EIN Pfad
 * hineingehen.
 *
 * > **Geradeste Fortsetzung.** An jedem Knoten wird das Wandpaar mit der
 * > kleinsten Richtungsänderung durchverbunden. Gleichstand entscheidet die
 * > Wand-Id.
 *
 * Sie ist deterministisch *und* minimiert, was sie entscheidet, und daran hängt
 * die Zusage, die man haben will: **zwei Wandgraphen gleicher Gestalt mit
 * anderen Ids liefern denselben Umriss.** Gemessen wird an den ENDTANGENTEN und
 * nicht an den Sehnen — bei einer Bogenwand weicht die Tangente um
 * `Δ/2 = 2·atan(bulge)` von der Sehne ab, und dieselbe Größe liest die
 * Knickwarnung des Gates.
 *
 * DIE TEILUNG AM DICKENSPRUNG ist der zweite Schnitt und bekommt keinen eigenen
 * Namen: Clipper2 nimmt EIN `delta` je Aufruf, zwei Wandstärken gehen deshalb
 * nie in denselben Offset. Zwei kollineare Wände `t = 6` und `t = 10` stoßen
 * danach stumpf aneinander, und das ist die richtige Figur — die Stufe ist
 * echt.
 *
 * FÄLLT DER SPRUNG MIT EINER ECKE ZUSAMMEN, ist er es NICHT: dort fehlte bis
 * ADR 0038 der Keil zwischen den beiden stumpfen Enden — an jeder Ecke eines
 * geschweißten Kastens mit `tf ≠ tw` still `tf/2 · tw/2` Fläche zu wenig. Die
 * Regel „ein durchverbundener Stoß wird gemitert" galt nur, solange Clipper2
 * ihn selbst mitern konnte. `jointFills` schließt die Lücke und macht sie
 * total; die Stufe am GESTRECKTEN Sprung bleibt unberührt.
 *
 * TOTAL UND OHNE PRÜFUNG, wie der Zwilling: hängende Verweise und
 * Nulllängenwände überspringt sie still. WEGGEFILTERT WERDEN außerdem eine
 * nicht endliche oder nicht positive `t` und eine unbrauchbare `bulge` — aus
 * demselben Grund, aus dem das Gate sie ab P3 meldet: ein `NaN` darf nicht in
 * eine fremde Bibliothek laufen, deren Ergebnis danach *plausibel aussieht*.
 * Der `bulge` fällt dabei auf `0` zurück, die Wand bleibt; eine kaputte `t`
 * nimmt die Wand mit, weil es ohne sie keine Aufweitung gibt. Was „unbrauchbar"
 * heißt, sagt `usableBulge` — nicht endlich ODER nicht zerlegbar.
 */
export function deriveOutlineFromWalls(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
  policy: SectionPolicy,
): readonly Polygon[] {
  const graph = buildUsableWallGraph(nodes, walls);
  if (graph.walls.length === 0) return Object.freeze([]);

  const continuation = straightestContinuation(graph);
  const runs = traverse(graph, continuation);
  const byWallId = new Map(graph.walls.map((it) => [it.wall.id, it]));

  const paths = runs.flatMap((run) =>
    offsetPaths(
      run.wallIds.map((id) => byWallId.get(id)),
      run.nodeIds,
      run.closed,
      policy,
    ),
  );

  // Und die Ecken, die dabei aufgeschnitten wurden (ADR 0038). Sie gehen als
  // `delta: 0`-Ringe in DIESELBE Vereinigung — eine zweite Boolesche Operation
  // daneben wäre eine zweite Bibliothek mit einer zweiten Rundung.
  paths.push(...jointFills(graph, continuation, policy));

  return Object.freeze(
    GeometryPolygon.inflate(paths, {
      arcTolerance: policy.discretisationTolerance,
      miterLimit: policy.miterLimit,
    }).map((polygon) =>
      Object.freeze({ points: Object.freeze(polygon.points) }),
    ),
  );
}

/**
 * Ein Lauf, an jedem Dickensprung geteilt und in Punkte zerlegt.
 *
 * Ein GESCHLOSSENER Lauf ohne Dickensprung bleibt ein Stück und geht als
 * `joined` hinein — nur so liefert Clipper2 den Innenring in einem Aufruf, und
 * daran hängt der hohle Kasten. Sobald er einen Sprung hat, wird er an der
 * ersten Sprungstelle AUFGESCHNITTEN und zerfällt in offene Stücke; wo genau,
 * darf nicht am Startpunkt des Umlaufs hängen, den niemand gewählt hat.
 */
function offsetPaths(
  run: readonly (GraphWall | undefined)[],
  nodeIds: readonly string[],
  closed: boolean,
  policy: SectionPolicy,
): OffsetPath[] {
  const steps: Step[] = [];
  run.forEach((graphWall, index) => {
    // `nodeIds` HAT EINEN EINTRAG MEHR ALS DER LAUF (`Branch`), also gibt es zu
    // jeder Wand einen Startknoten. Bricht das, ist der Lauf kaputt und nicht
    // dieser Pfad — `atOrThrow` sagt es, ein `continue` verschwiege es.
    const from = atOrThrow(nodeIds, index);
    if (graphWall === undefined) return;
    steps.push({ graphWall, from });
  });

  // Ein Lauf ohne brauchbare Wand ist LEER und kein Fehler.
  if (steps.length === 0) return [];
  const first = atOrThrow(steps, 0);

  const jumps = steps.filter(
    (step, index) =>
      index > 0 &&
      step.graphWall.wall.t !== atOrThrow(steps, index - 1).graphWall.wall.t,
  ).length;

  // Der geschlossene Umlauf ohne Sprung: EIN Pfad, `joined`.
  if (closed && jumps === 0) {
    return [
      {
        polyline: { points: pointsOf(steps, policy) },
        delta: first.graphWall.wall.t / 2,
        endType: 'joined',
      },
    ];
  }

  // Beim geschlossenen Umlauf MIT Sprung wird so rotiert, dass das erste Stück
  // an einer Sprungstelle beginnt — sonst zerschnitte der willkürliche
  // Startpunkt des Umlaufs ein Stück, das durchlaufen sollte.
  const ordered = closed ? rotateToFirstJump(steps) : steps;

  // Jedes Stück wird MIT seinem ersten Schritt angelegt und ist deshalb nie
  // leer; offen ist allein, ob es überhaupt schon eines gibt.
  const pieces: Step[][] = [];
  for (const step of ordered) {
    const piece =
      pieces.length === 0 ? undefined : atOrThrow(pieces, pieces.length - 1);
    if (
      piece === undefined ||
      atOrThrow(piece, piece.length - 1).graphWall.wall.t !==
        step.graphWall.wall.t
    ) {
      pieces.push([step]);
    } else {
      piece.push(step);
    }
  }

  return pieces.map((piece) => ({
    polyline: { points: pointsOf(piece, policy) },
    delta: atOrThrow(piece, 0).graphWall.wall.t / 2,
    endType: 'butt' as const,
  }));
}

/** Eine Wand samt dem Knoten, VON dem aus sie durchlaufen wird. */
type Step = { graphWall: GraphWall; from: string };

type OffsetPath = {
  polyline: { points: PointYZ[] };
  delta: number;
  endType: 'butt' | 'joined';
};

/** Der Umlauf, an seine erste Sprungstelle gedreht. */
function rotateToFirstJump(steps: readonly Step[]): Step[] {
  const at = steps.findIndex(
    (step, index) =>
      index > 0 &&
      step.graphWall.wall.t !== atOrThrow(steps, index - 1).graphWall.wall.t,
  );
  return at <= 0 ? [...steps] : [...steps.slice(at), ...steps.slice(0, at)];
}

/**
 * Die Punkte eines Pfadstücks, jeder Punkt EINMAL.
 *
 * Die Wand kann GEGEN ihre eigene Richtung durchlaufen werden; dann werden
 * Endpunkte und Wölbung getauscht. `bulge` gehört dem ANFANGSPUNKT der Wand,
 * und rückwärts ist der Anfang das Ende — das Vorzeichen dreht mit.
 */
function pointsOf(steps: readonly Step[], policy: SectionPolicy): PointYZ[] {
  const points: PointYZ[] = [];

  for (const { graphWall, from } of steps) {
    const edge = wallPolyline(graphWall, from, policy);

    // Der letzte Punkt jeder Kante IST der erste der nächsten: die Fuge wird
    // einmal genannt und nicht zweimal.
    points.push(...(points.length === 0 ? edge : edge.slice(1)));
  }

  return points;
}
