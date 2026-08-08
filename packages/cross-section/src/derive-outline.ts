/**
 * Der Umriss — die EINE Tür, mit zwei Wegen dahinter.
 *
 * `SectionGeometry` führt den Umriss MIT ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)),
 * aber er muss einmal entstehen. Für `kind: 'outline'` ist das nur die
 * Bogenzerlegung: der Ring BESCHREIBT den Umriss bereits. Für `kind: 'midline'`
 * wird um `t/2` aufgeweitet und vereinigt
 * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
 *
 * EINE TÜR UND NICHT ZWEI, obwohl es zwei Wege sind: das Gate leitet den Umriss
 * für die Drift-Prüfung neu ab, und ohne diese Tür verzweigte es über `kind`
 * selbst — die Fallunterscheidung stünde dann zweimal im Repo.
 *
 * WARUM HIER UND NICHT IN `@baustatik/geometry-2d`: die Signatur nennt
 * `SectionGeometry` und `SectionPolicy`, also Typen dieses Packages. Ein
 * Geometriepackage, das sie kennt, wäre die umgedrehte Abhängigkeit; die
 * Bogenalgebra und die Aufweitung holt es sich über `Bulge` und
 * `Polygon.inflate` aus `@baustatik/section-geometry`.
 *
 * DIE ALTERNATIVE WÄRE STILLE ABWEICHUNG. Ohne diesen Schritt zerlegte jeder
 * Aufrufer seine Bögen von Hand, mit seiner eigenen Toleranz — genau das, was
 * ADR 0030 und ADR 0033 verhindern sollen: der mitgeführte Umriss und die
 * Toleranz, unter der er entstand, gehören in denselben Satz.
 */

import { Bulge, Polygon as GeometryPolygon } from '@baustatik/section-geometry';
import type { mm } from '@baustatik/units';
import {
  buildGraph,
  type Continuation,
  type GraphWall,
  normalizeAngle,
  outgoingTangent,
  traverse,
  type WallEndRef,
  type WallGraph,
} from './branch';
import type { SectionPolicy } from './policy';
import type {
  Polygon,
  Ring,
  SectionGeometry,
  SectionNode,
  Vertex,
  Wall,
} from './types';

type PointYZ = { y: mm; z: mm };

/**
 * Der Umriss zu einer gezeichneten Figur — über `kind` verzweigt.
 *
 * TOTAL, ES WIRD NICHTS GEPRÜFT: was an der Figur falsch ist, sagt
 * `validateSectionGeometry` mit Namen. Beide Wege dahinter halten sich daran.
 *
 * Die Einheit ist MILLIMETER — die der `Vertex`, die von `Wall.t` und die von
 * `policy.arcTolerance`.
 */
export function deriveOutline(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): readonly Polygon[] {
  return geometry.kind === 'outline'
    ? deriveOutlineFromRings(geometry.rings, policy)
    : deriveOutlineFromWalls(geometry.nodes, geometry.walls, policy);
}

/**
 * Ein Polygon je Ring, in EINGABEREIHENFOLGE und mit UNVERÄNDERTEM Umlaufsinn.
 *
 * DER UMLAUFSINN WIRD NICHT ANGEFASST, und das ist die tragende Zusage: er
 * trägt die Bedeutung „Material" gegen „Loch"
 * ([ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 * Ein Ring, den der Zeichner verkehrt herum gelegt hat, kommt verkehrt herum
 * heraus — und fällt im Gate auf, statt hier still repariert zu werden.
 *
 * DAS UNTERSCHEIDET DIESEN WEG VOM ANDEREN: `deriveOutlineFromWalls` SETZT den
 * Umlaufsinn, weil er ihn aus einer Verschachtelung ableitet, die es vorher
 * nicht gab. Hier gibt es sie bereits, und sie zu überschreiben hiesse, die
 * Aussage des Zeichners zu verwerfen.
 *
 * TOTAL, ES WIRD NICHTS GEPRÜFT. Ein Ring mit zwei Punkten liefert einen
 * zweipunktigen Umriss, und dass daraus keine Fläche wird, sagt
 * `validateSectionGeometry` mit Namen. Eine zweite Meinung darüber, was ein
 * brauchbarer Ring ist, wäre genau die Doppelung, die das Gate abschafft.
 */
export function deriveOutlineFromRings(
  rings: readonly Ring[],
  policy: SectionPolicy,
): readonly Polygon[] {
  return Object.freeze(
    rings.map((ring) => {
      // Die Schlusskante zurück zum Anfang ist KEIN Sonderfall: der erste Punkt
      // wird hinten angehängt, und danach ist jede Kante dieselbe Kante. Der
      // Vorgänger reist als lokale Variable mit, statt über den Index gesucht
      // zu werden — die Kante ist ein PAAR und keine Position.
      const points: PointYZ[] = [];
      let from: Vertex | undefined;

      for (const to of [...ring.vertices, ...ring.vertices.slice(0, 1)]) {
        // Am ersten Punkt endet noch keine Kante.
        if (from !== undefined) {
          // Der letzte Punkt jeder Kante IST der erste der nächsten:
          // `toPolyline` liefert beide Endpunkte, das Polygon nennt jeden Punkt
          // einmal. Das eine `slice` steht deshalb hier und an keiner zweiten
          // Stelle.
          points.push(...edgePoints(from, to, policy).slice(0, -1));
        }
        from = to;
      }

      return Object.freeze({ points: Object.freeze(points) });
    }),
  );
}

/**
 * Der Umriss aus dem WANDGRAPHEN — Aufweitung um `t/2` und Vereinigung.
 *
 * AUFGEWEITET WIRD DER ZUG, NICHT DIE WAND, und daraus folgt die Form der
 * ganzen Ableitung (ADR 0037). `JoinType` wirkt INNERHALB eines Pfades: weitet
 * man jede Wand einzeln auf und vereinigt danach, sieht Clipper2 die Ecke
 * zwischen zwei Wänden nie, und aussen bleibt eine Kerbe, die KEIN Join-Typ
 * schliesst. Zwei Wände schliessen ihre Ecke nur, wenn sie als EIN Pfad
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
 * `Δ/2 = 2·atan(bulge)` von der Sehne ab, und dieselbe Grösse liest die
 * Knickwarnung des Gates.
 *
 * DIE TEILUNG AM DICKENSPRUNG ist der zweite Schnitt und bekommt keinen eigenen
 * Namen: Clipper2 nimmt EIN `delta` je Aufruf, zwei Wandstärken gehen deshalb
 * nie in denselben Offset. Zwei kollineare Wände `t = 6` und `t = 10` stossen
 * danach stumpf aneinander, und das ist die richtige Figur — die Stufe ist
 * echt.
 *
 * TOTAL UND OHNE PRÜFUNG, wie der Zwilling: hängende Verweise und
 * Nulllängenwände überspringt sie still. WEGGEFILTERT WERDEN ausserdem eine
 * nicht endliche oder nicht positive `t` und ein nicht endlicher `bulge` — aus
 * demselben Grund, aus dem das Gate sie ab P3 meldet: ein `NaN` darf nicht in
 * eine fremde Bibliothek laufen, deren Ergebnis danach *plausibel aussieht*.
 * Der `bulge` fällt dabei auf `0` zurück, die Wand bleibt; eine kaputte `t`
 * nimmt die Wand mit, weil es ohne sie keine Aufweitung gibt.
 */
export function deriveOutlineFromWalls(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
  policy: SectionPolicy,
): readonly Polygon[] {
  const graph = buildGraph(
    nodes,
    walls.filter((wall) => Number.isFinite(wall.t) && wall.t > 0),
  );
  if (graph.walls.length === 0) return Object.freeze([]);

  const runs = traverse(graph, straightestContinuation(graph));
  const byWallId = new Map(graph.walls.map((it) => [it.wall.id, it]));

  const paths = runs.flatMap((run) =>
    offsetPaths(
      run.wallIds.map((id) => byWallId.get(id)),
      run.nodeIds,
      run.closed,
      policy,
    ),
  );

  return Object.freeze(
    GeometryPolygon.inflate(paths, {
      arcTolerance: policy.arcTolerance,
      miterLimit: policy.miterLimit,
    }).map((polygon) =>
      Object.freeze({ points: Object.freeze(polygon.points) }),
    ),
  );
}

/**
 * Die Fortsetzungen, mit denen ein OFFSETPFAD läuft: an JEDEM Knoten, nicht nur
 * am Grad-2-Knoten.
 *
 * Das ist der Unterschied zum `Branch` — der endet an der Verzweigung, weil die
 * Theorie dünnwandiger Profile ihn so schneidet. Der Offsetpfad läuft weiter,
 * weil Clipper2 nur innerhalb EINES Pfades eine Ecke schliesst.
 *
 * GIERIG ÜBER DIE SORTIERTE PAARLISTE: das geradeste Paar zuerst, danach das
 * nächste, dessen beide Enden noch frei sind. Bei Grad 3 bleibt ein Ende übrig
 * und dort bricht der Pfad; bei Grad 4 ketten zwei Paare. Der Rest ist die
 * Tie-break-Regel, und sie ist nicht Kosmetik: ohne sie hinge der Umriss eines
 * symmetrischen Y an der Reihenfolge, in der jemand seine Wände gezeichnet hat.
 */
function straightestContinuation(graph: WallGraph): Continuation {
  const continuation = new Map<WallEndRef, WallEndRef>();

  for (const at of graph.incident.values()) {
    if (at.length < 2) continue;

    const candidates: { a: WallEndRef; b: WallEndRef; turn: number }[] = [];
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const a = at[i];
        const b = at[j];
        if (a === undefined || b === undefined) continue;
        // Glatt heisst: die beiden ABGEHENDEN Tangenten zeigen genau
        // entgegengesetzt. Was davon übrig bleibt, ist die Richtungsänderung —
        // dieselbe Zahl, die das Gate als Knick liest.
        const turn = Math.abs(
          normalizeAngle(outgoingTangent(a) - outgoingTangent(b) - Math.PI),
        );
        candidates.push({ a, b, turn });
      }
    }

    candidates.sort(
      (x, y) =>
        x.turn - y.turn ||
        pairKey(x.a, x.b).localeCompare(pairKey(y.a, y.b)) ||
        0,
    );

    const taken = new Set<WallEndRef>();
    for (const { a, b } of candidates) {
      if (taken.has(a) || taken.has(b)) continue;
      taken.add(a);
      taken.add(b);
      continuation.set(a, b);
      continuation.set(b, a);
    }
  }

  return continuation;
}

/**
 * Ein durchverbundener Stoss samt seinem INNENWINKEL — was das Gate über die
 * Miter-Schranke wissen muss.
 *
 * `alpha` ist der Winkel zwischen den beiden abgehenden Tangenten: `π` heisst
 * geradeaus (die Wände setzen einander fort), kleiner heisst spitzer. Der
 * Überstand des ungekappten Spitzes ist `1/sin(α/2)`.
 */
export type ChainedJoint = {
  readonly nodeId: string;
  readonly wallIds: readonly string[];
  /** Der Innenwinkel zwischen den beiden Wänden [rad]. */
  readonly alpha: number;
};

/**
 * Alle Stösse, die die Ableitung DURCHVERBINDET — und nur die.
 *
 * DAS GATE FRAGT HIER UND RECHNET NICHT SELBST NACH. Nur an einem
 * durchverbundenen Stoss entsteht überhaupt eine Miter-Ecke, die gekappt werden
 * kann; ein ungeketteter Stoss hinterlässt stattdessen eine Kerbe, und das ist
 * eine andere Frage. Beide Male dieselbe Regel zu lesen und zweimal
 * hinzuschreiben wäre genau die Doppelung, gegen die ADR 0037 die Kettung an
 * EINE Stelle legt.
 */
export function chainedJoints(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
): readonly ChainedJoint[] {
  const graph = buildGraph(nodes, walls);
  const continuation = straightestContinuation(graph);
  const joints: ChainedJoint[] = [];

  for (const [nodeId, at] of graph.incident) {
    const seen = new Set<WallEndRef>();
    for (const end of at) {
      const other = continuation.get(end);
      if (other === undefined || seen.has(end)) continue;
      seen.add(end);
      seen.add(other);
      joints.push({
        nodeId,
        wallIds: [end.of.wall.id, other.of.wall.id],
        alpha: Math.abs(
          normalizeAngle(outgoingTangent(end) - outgoingTangent(other)),
        ),
      });
    }
  }

  return Object.freeze(joints);
}

/**
 * Der Tie-break: die beiden Wand-Ids, sortiert und verkettet.
 *
 * DIE IDS UND NICHT DIE REIHENFOLGE IM ARRAY — sonst entschiede, in welcher
 * Reihenfolge jemand gezeichnet hat, und die Zusage „gleiche Gestalt, gleicher
 * Umriss" fiele.
 */
function pairKey(a: WallEndRef, b: WallEndRef): string {
  return [a.of.wall.id, b.of.wall.id].sort().join(' ');
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
    const from = nodeIds[index];
    if (graphWall === undefined || from === undefined) return;
    steps.push({ graphWall, from });
  });

  const first = steps[0];
  if (first === undefined) return [];

  const jumps = steps.filter(
    (step, index) =>
      index > 0 && step.graphWall.wall.t !== steps[index - 1]?.graphWall.wall.t,
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

  const pieces: Step[][] = [];
  for (const step of ordered) {
    const piece = pieces[pieces.length - 1];
    const previous = piece?.[piece.length - 1];
    if (
      piece === undefined ||
      previous?.graphWall.wall.t !== step.graphWall.wall.t
    ) {
      pieces.push([step]);
    } else {
      piece.push(step);
    }
  }

  return pieces.flatMap((piece) => {
    const head = piece[0];
    if (head === undefined) return [];
    return [
      {
        polyline: { points: pointsOf(piece, policy) },
        delta: head.graphWall.wall.t / 2,
        endType: 'butt' as const,
      },
    ];
  });
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
      index > 0 && step.graphWall.wall.t !== steps[index - 1]?.graphWall.wall.t,
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
    const forward = graphWall.wall.startNodeId === from;
    const p1 = forward ? graphWall.start : graphWall.end;
    const p2 = forward ? graphWall.end : graphWall.start;
    const raw = graphWall.wall.bulge ?? 0;
    const bulge = Number.isFinite(raw) ? (forward ? raw : -raw) : 0;

    const edge = Bulge.toPolyline(
      { y: p1.y, z: p1.z },
      { y: p2.y, z: p2.z },
      bulge,
      policy.arcTolerance,
    ).points;

    // Der letzte Punkt jeder Kante IST der erste der nächsten: die Fuge wird
    // einmal genannt und nicht zweimal.
    points.push(...(points.length === 0 ? edge : edge.slice(1)));
  }

  return points;
}

/**
 * Die Punkte EINER Ringkante, beide Endpunkte eingeschlossen.
 *
 * `bulge` GEHÖRT DEM ANFANGSPUNKT, wie im DXF-Format, aus dem die Zahl stammt:
 * `from.bulge` wölbt die Kante `from → to`. Der letzte Vertex wölbt damit die
 * Schlusskante zurück zum ersten.
 *
 * `Bulge.toPolyline` ist total: eine gerade Kante (`bulge` fehlt, ist `0`, oder
 * seine Stichhöhe bleibt unter der Toleranz) ergibt `[p1, p2]`, ein Bogen die
 * Zerlegung unter `policy.arcTolerance`. Genau diese Toleranz reist im Satz
 * neben dem Ergebnis mit (ADR 0033), damit später prüfbar bleibt, unter
 * welcher Zahl der Umriss entstanden ist.
 */
function edgePoints(
  from: Vertex,
  to: Vertex,
  policy: SectionPolicy,
): { y: number; z: number }[] {
  return Bulge.toPolyline(
    { y: from.y, z: from.z },
    { y: to.y, z: to.z },
    from.bulge ?? 0,
    policy.arcTolerance,
  ).points;
}
