import { atOrThrow } from '@baustatik/core';
import { Line } from '@baustatik/section-geometry';
import type { mm } from '@baustatik/units';
import type { SectionNode, Wall } from '../../model/section-geometry';
import type { SectionPolicy } from '../../policy';
import type { PointYZ } from '../point-yz';
import {
  buildGraph,
  type Continuation,
  normalizeAngle,
  outgoingTangent,
  type WallEndRef,
  type WallGraph,
} from '../wall-graph/graph';

/**
 * Der Graph der Wände, aus denen überhaupt ein Band wird.
 *
 * Ohne brauchbare `t` gibt es keine Aufweitung, also auch keinen Stoß — die
 * Wand fällt VOR der Gradzählung heraus, damit der Knoten daneben nicht einen
 * Grad zu viel bekommt (`buildGraph` argumentiert für die entartete Wand
 * genauso).
 */
export function buildUsableWallGraph(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
): WallGraph {
  return buildGraph(
    nodes,
    walls.filter((wall) => Number.isFinite(wall.t) && wall.t > 0),
  );
}

/**
 * Die Fortsetzungen, mit denen ein OFFSETPFAD läuft: an JEDEM Knoten, nicht nur
 * am Grad-2-Knoten.
 *
 * Das ist der Unterschied zum `Branch` — der endet an der Verzweigung, weil die
 * Theorie dünnwandiger Profile ihn so schneidet. Der Offsetpfad läuft weiter,
 * weil Clipper2 nur innerhalb EINES Pfades eine Ecke schließt.
 *
 * GIERIG ÜBER DIE SORTIERTE PAARLISTE: das geradeste Paar zuerst, danach das
 * nächste, dessen beide Enden noch frei sind. Bei Grad 3 bleibt ein Ende übrig
 * und dort bricht der Pfad; bei Grad 4 ketten zwei Paare. Der Rest ist die
 * Tie-break-Regel, und sie ist nicht Kosmetik: ohne sie hinge der Umriss eines
 * symmetrischen Y an der Reihenfolge, in der jemand seine Wände gezeichnet hat.
 */
export function straightestContinuation(graph: WallGraph): Continuation {
  const continuation = new Map<WallEndRef, WallEndRef>();

  for (const at of graph.incident.values()) {
    if (at.length < 2) continue;

    const candidates: { a: WallEndRef; b: WallEndRef; turn: number }[] = [];
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const a = atOrThrow(at, i);
        const b = atOrThrow(at, j);
        // Glatt heißt: die beiden ABGEHENDEN Tangenten zeigen genau
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
 * Ein durchverbundener Stoß samt seinem INNENWINKEL — was das Gate über die
 * Miter-Schranke wissen muss.
 *
 * `alpha` ist der Winkel zwischen den beiden abgehenden Tangenten: `π` heißt
 * geradeaus (die Wände setzen einander fort), kleiner heißt spitzer.
 */
export type ChainedJoint = {
  readonly nodeId: string;
  readonly wallIds: readonly string[];
  /** Der Innenwinkel zwischen den beiden Wänden [rad]. */
  readonly alpha: number;
  /**
   * Wie weit der UNGEKAPPTE Spitz heraussteht, in Vielfachen der halben
   * DICKEREN Wandstärke.
   *
   * GEMESSEN, NICHT AUS `alpha` GERECHNET
   * ([ADR 0038](../../../../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)).
   * Bei gleicher Dicke ist das dieselbe Zahl wie `1/sin(α/2)` — sonst nicht:
   * treffen zwei verschiedene Dicken in einem fast gestreckten Stoß
   * aufeinander, läuft der Miterpunkt davon, während `α` nahe `π` bleibt und
   * die alte Formel `1` sagte. Gekappt wird nach GENAU dieser Zahl, also muss
   * das Gate sie lesen und keine zweite.
   */
  readonly overshoot: number;
};

/**
 * Alle Stöße, die die Ableitung DURCHVERBINDET — und nur die.
 *
 * DAS GATE FRAGT HIER UND RECHNET NICHT SELBST NACH. Nur an einem
 * durchverbundenen Stoß entsteht überhaupt eine Miter-Ecke, die gekappt werden
 * kann; ein ungeketteter Stoß hinterlässt stattdessen eine Kerbe, und das ist
 * eine andere Frage. Beide Male dieselbe Regel zu lesen und zweimal
 * hinzuschreiben wäre genau die Doppelung, gegen die ADR 0037 die Kettung an
 * EINE Stelle legt.
 *
 * GEFILTERT WIRD WIE DORT: eine Wand mit kaputter `t` fällt aus der Ableitung
 * heraus, also darf sie hier keinen Stoß mehr bilden. Sonst meldete das Gate
 * eine Kappung an einer Ecke, die niemand baut.
 */
export function chainedJoints(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
): readonly ChainedJoint[] {
  const graph = buildUsableWallGraph(nodes, walls);
  const continuation = straightestContinuation(graph);

  return Object.freeze(
    chainedPairs(graph, continuation).map((pair) => {
      const corner = miterCorner(pair);
      return {
        nodeId: pair.nodeId,
        wallIds: [pair.a.of.wall.id, pair.b.of.wall.id],
        alpha: Math.abs(
          normalizeAngle(outgoingTangent(pair.a) - outgoingTangent(pair.b)),
        ),
        // Ohne Ecke steht nichts heraus: die Außenkanten laufen parallel, der
        // Stoß ist gestreckt und die Stufe (falls es eine gibt) ist echt.
        overshoot: corner === undefined ? 1 : corner.reach / corner.delta,
      };
    }),
  );
}

/** Ein durchverbundenes Wandpaar an einem Knoten. */
type ChainedPair = {
  readonly nodeId: string;
  readonly a: WallEndRef;
  readonly b: WallEndRef;
};

/**
 * Jedes durchverbundene Paar GENAU EINMAL.
 *
 * Die Schleife stand bis ADR 0038 in `chainedJoints`. Sie ist herausgezogen,
 * weil jetzt ZWEI Fragen an denselben Paaren hängen: was das Gate meldet und
 * was die Ableitung füllt. Zwei Schleifen über dieselbe Kettung wären zwei
 * Gelegenheiten, sie verschieden zu lesen.
 */
function chainedPairs(
  graph: WallGraph,
  continuation: Continuation,
): ChainedPair[] {
  const pairs: ChainedPair[] = [];
  for (const [nodeId, at] of graph.incident) {
    const seen = new Set<WallEndRef>();
    for (const end of at) {
      const other = continuation.get(end);
      if (other === undefined || seen.has(end)) continue;
      seen.add(end);
      seen.add(other);
      pairs.push({ nodeId, a: end, b: other });
    }
  }
  return pairs;
}

/**
 * Ab wann zwei abgehende Tangenten als GESTRECKT gelten [-].
 *
 * Der Betrag von `dA + dB` misst genau das: `0` heißt „genau entgegengesetzt",
 * also eine Wand, die die andere fortsetzt. Dann gibt es keine Außenseite, an
 * der eine Ecke sitzen könnte — und die Stufe am Dickensprung ist echt
 * (ADR 0037). Die Schranke liegt so tief, dass sie nur den exakten Fall trifft;
 * alles darüber fängt die Kappung ab.
 */
const COLLINEAR = 1e-9;

/**
 * Die Außenecke eines durchverbundenen Stoßes
 * ([ADR 0038](../../../../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)).
 *
 * Die Außenkontur am Stoß ist KANONISCH: sie wird von den beiden äußeren
 * Offsetgeraden begrenzt, und ihr Schnittpunkt ist der einzige Punkt, der beide
 * Bänder ausfüllt, ohne über eines hinauszureichen. Deshalb gibt es hier
 * nichts zu entscheiden und nichts zu melden — nur zu rechnen.
 *
 * `undefined` heißt: die beiden Außenkanten laufen PARALLEL. Das ist der
 * gestreckte Stoß, und dort ist die Stufe die richtige Figur.
 */
type MiterCorner = {
  readonly node: PointYZ;
  /** Einheitsvektor vom Knoten nach AUSSEN, dem Innenwinkel entgegen. */
  readonly outward: PointYZ;
  /** Wo die Außenkante der Wand `a` am Knoten steht: `N + nA·tA/2`. */
  readonly outerA: PointYZ;
  readonly outerB: PointYZ;
  /** Der Schnittpunkt der beiden Außenkanten. */
  readonly miter: PointYZ;
  /** Sein Abstand vom Knoten [mm] — der Ueberstand des Spitzes. */
  readonly reach: mm;
  /** Die halbe DICKERE Wandstärke: der Maßstab, an dem gekappt wird [mm]. */
  readonly delta: mm;
  /** Die halbe DUENNERE: so tief liegt der Fußpunkt der Füllung innen [mm]. */
  readonly depth: mm;
};

function miterCorner(pair: ChainedPair): MiterCorner | undefined {
  const node = pair.a.atStart ? pair.a.of.start : pair.a.of.end;
  const ta = outgoingTangent(pair.a);
  const tb = outgoingTangent(pair.b);
  const dA = { y: Math.cos(ta), z: Math.sin(ta) };
  const dB = { y: Math.cos(tb), z: Math.sin(tb) };

  // Die Winkelhalbierende des INNENwinkels; außen ist ihr Gegenteil.
  const bisector = { y: dA.y + dB.y, z: dA.z + dB.z };
  const length = Math.hypot(bisector.y, bisector.z);
  if (length < COLLINEAR) return undefined;
  const outward = { y: -bisector.y / length, z: -bisector.z / length };

  const tA = pair.a.of.wall.t;
  const tB = pair.b.of.wall.t;
  const outerA = offsetPoint(node, dA, outward, tA / 2);
  const outerB = offsetPoint(node, dB, outward, tB / 2);

  // Die Außenkanten sind die um `t/2` nach außen geschobenen ACHSEN, und
  // deshalb reicht ihre Richtung: bei einer Bogenwand ist das die Tangente am
  // Knoten, also dieselbe Größe, aus der auch die Kettung entsteht.
  const miter = Line.intersect(
    Line.make(outerA, { y: outerA.y + dA.y, z: outerA.z + dA.z }),
    Line.make(outerB, { y: outerB.y + dB.y, z: outerB.z + dB.z }),
  );
  if (miter === null) return undefined;

  return {
    node,
    outward,
    outerA,
    outerB,
    miter,
    reach: Math.hypot(miter.y - node.y, miter.z - node.z),
    delta: Math.max(tA, tB) / 2,
    depth: Math.min(tA, tB) / 2,
  };
}

/** Der Punkt `N + n·distance` mit der Normalen von `d`, die nach außen zeigt. */
function offsetPoint(
  node: PointYZ,
  d: PointYZ,
  outward: PointYZ,
  distance: number,
): PointYZ {
  const sign = -d.z * outward.y + d.y * outward.z >= 0 ? 1 : -1;
  return {
    y: node.y + sign * -d.z * distance,
    z: node.z + sign * d.y * distance,
  };
}

type JointFillPath = {
  readonly polyline: { readonly points: PointYZ[] };
  readonly delta: 0;
  readonly endType: 'joined';
};

/**
 * Die Miter-Ecken, die Clipper2 NICHT setzen kann — der Kern von ADR 0038.
 *
 * DIE REGEL IST DIE ALTE, NUR OHNE LOCH: ein durchverbundener Stoß wird
 * gemitert. Innerhalb EINES Offsetpfades tut Clipper2 das selbst; wo der Pfad
 * am Dickensprung aufgeschnitten wurde, fällt die Ecke heute heraus (ADR 0037
 * hat nur den KOLLINEAREN Sprung betrachtet, wo die Stufe echt ist). Genau
 * diese Naht wird hier gefüllt, als eigener Ring mit `delta: 0`.
 *
 * NUR AM DICKENSPRUNG. Bei gleicher Dicke stehen beide Wände ohnehin in
 * demselben Pfad, und die Ecke kommt aus Clipper2 — ein Füllring daneben wäre
 * dieselbe Fläche zweimal. Dass beide Wege dieselbe Figur bauen, hält der
 * Stetigkeitstest in `tests/derive-outline-walls.test.ts` fest.
 *
 * NUR AM DURCHVERBUNDENEN STOSS. Die Kehle eines Y-Profils bleibt offen: dort
 * verzweigt das Material wirklich, und welche zwei Wände einander fortsetzen,
 * entscheidet die Kettung (ADR 0037) und nicht diese Funktion.
 */
export function jointFills(
  graph: WallGraph,
  continuation: Continuation,
  policy: SectionPolicy,
): JointFillPath[] {
  const fills: JointFillPath[] = [];

  for (const pair of chainedPairs(graph, continuation)) {
    if (pair.a.of.wall.t === pair.b.of.wall.t) continue;
    const corner = miterCorner(pair);
    if (corner === undefined) continue;
    const ring = fillRing(
      corner,
      policy.miterLimit,
      policy.discretisationTolerance,
    );
    if (ring === undefined) continue;
    fills.push({
      polyline: { points: ring },
      delta: 0,
      endType: 'joined',
    });
  }

  return fills;
}

/**
 * Der Füllring einer Außenecke, gekappt wie Clipper2 kappen würde.
 *
 * DER FUSSPUNKT LIEGT INNEN, um `min(t)/2` hinter dem Knoten: der Ring soll die
 * beiden Bänder ÜBERLAPPEN und nicht an sie anstoßen. Bei einer Bogenwand
 * liegt die gezeichnete Kante um bis zu `discretisationTolerance` neben der Tangente, und
 * eine Fuge von dieser Größe wäre im Ergebnis eine Kerbe. Der Punkt liegt in
 * beiden Bändern, weil sein Abstand von jeder Achse höchstens `min(t)/2` ist.
 *
 * GEKAPPT WIRD QUER ZUM SPITZ und nicht quer zur Winkelhalbierenden: bei
 * gleicher Dicke ist das dieselbe Richtung, bei einem fast gestreckten Stoß mit
 * Dickensprung läuft der Miterpunkt aber LAENGS der Wand davon. Ein Schnitt
 * quer zur Winkelhalbierenden träfe ihn dort nie.
 *
 * DIE SCHRANKE IST DIE VON CLIPPER2 (`miterLimit · delta`), DER SCHNITT IST
 * UNSERER: Clipper2 setzt intern ein Quadrat, hier steht eine Fase. Der
 * Unterschied ist ein Splitter, und er tritt nur auf, wo das Gate ohnehin
 * `MiterLimitExceededWarning` meldet (ADR 0038).
 *
 * UND GENAU DESHALB WIRD EINE ZU SCHMALE FASE NICHT GESETZT. Clipper2s Quadrat
 * hat eine feste Breite; unsere Fase SCHRUMPFT, je naeher `limit` an `reach`
 * liegt, und geht an der Kappungsschwelle gegen null. Sie verschwindet dabei
 * nicht — Clipper2 rastert auf `10^-6 mm`, also bleibt eine Kante von einem
 * Rasterschritt stehen. Fuer die Flaeche ist das nichts, fuer einen Vernetzer
 * ist es eine Kante im Verhaeltnis `10^8` zur Nachbarkante, an der das
 * Winkelkriterium scheitert (`tests/outline-meshability.test.ts`).
 *
 * `discretisationTolerance` IST DAS RICHTIGE MASS DAFUER und keine neue Einstellung: sie
 * ist die Sehnenabweichung, mit der dieselbe Figur ohnehin diskretisiert wird
 * (ADR 0033). Eine Fase, die schmaler ist als sie, liegt unter der Aufloesung,
 * in der der Umriss ueberhaupt beschrieben ist.
 *
 * WEGGELASSEN WIRD SIE NACH OBEN, zum vollen Miter — das ist die STETIGE Wahl:
 * die gekappte Ecke laeuft mit wachsendem `miterLimit` ohnehin gegen den vollen
 * Miter, und hier wird nur der letzte, nicht mehr darstellbare Rest des Weges
 * uebersprungen. Der Spitz steht dann um weniger als `discretisationTolerance` weiter
 * heraus, als `miterLimit` erlaubte.
 */
function fillRing(
  corner: MiterCorner,
  miterLimit: number,
  discretisationTolerance: number,
): PointYZ[] | undefined {
  const { node, outward, outerA, outerB, miter, reach, delta, depth } = corner;
  const inner = {
    y: node.y - outward.y * depth,
    z: node.z - outward.z * depth,
  };

  const limit = miterLimit * delta;
  if (reach <= limit) return [inner, outerA, miter, outerB];

  // Der Schnitt steht senkrecht auf der Richtung des Spitzes, im Abstand
  // `limit` vom Knoten. Beide Außenkanten kreuzen ihn: ihr Fußpunkt liegt
  // höchstens `delta` vom Knoten entfernt, der Miterpunkt weiter als `limit`.
  const dir = { y: (miter.y - node.y) / reach, z: (miter.z - node.z) / reach };
  const on = { y: node.y + dir.y * limit, z: node.z + dir.z * limit };
  const cut = Line.make(on, { y: on.y - dir.z, z: on.z + dir.y });

  const cutA = Line.intersect(Line.make(outerA, miter), cut);
  const cutB = Line.intersect(Line.make(miter, outerB), cut);
  // Kann nach der Ueberlegung oben nicht eintreten. Fällt es doch, bleibt die
  // Kerbe stehen — ein ungekappter Spitz wäre die schlechtere Antwort.
  if (cutA === null || cutB === null) return undefined;

  // GEMESSEN UND NICHT GERECHNET, wie beim `overshoot`: die Breite haengt an
  // beiden Aussenkanten und damit an zwei Winkeln, die bei ungleicher Dicke
  // verschieden sind. Der Abstand der beiden Schnittpunkte IST die Fase.
  if (Math.hypot(cutB.y - cutA.y, cutB.z - cutA.z) < discretisationTolerance) {
    return [inner, outerA, miter, outerB];
  }

  return [inner, outerA, cutA, cutB, outerB];
}

/**
 * Das Trennzeichen zwischen zwei Ids — `NUL`, weil eine Id alles andere
 * enthalten darf.
 *
 * ALS ESCAPE UND NICHT ALS ROHES BYTE: bis hierher stand das Zeichen selbst im
 * Quelltext, unsichtbar in jedem Editor und Anlass genug für `grep`, die Datei
 * für binär zu halten. Die Zeichenkette ist dieselbe.
 */
const ID_SEPARATOR = '\u0000';

/**
 * Der Tie-break: die beiden Wand-Ids, sortiert und verkettet.
 *
 * DIE IDS UND NICHT DIE REIHENFOLGE IM ARRAY — sonst entschiede, in welcher
 * Reihenfolge jemand gezeichnet hat, und die Zusage „gleiche Gestalt, gleicher
 * Umriss" fiele.
 *
 * GETRENNT WIRD MIT `NUL` und nicht mit einem Leerzeichen: `["a b", "c"]` und
 * `["a", "b c"]` ergäben sonst denselben Schlüssel, und zwei verschiedene
 * Paare rutschten im Gleichstand durcheinander.
 */
function pairKey(a: WallEndRef, b: WallEndRef): string {
  return [a.of.wall.id, b.of.wall.id].sort().join(ID_SEPARATOR);
}
