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

import { atOrThrow } from '@baustatik/core';
import {
  Bulge,
  Polygon as GeometryPolygon,
  Line,
} from '@baustatik/section-geometry';
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
 * `policy.discretisationTolerance`.
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
 * nicht gab. Hier gibt es sie bereits, und sie zu überschreiben hieße, die
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
  const graph = buildGraph(nodes, usableWalls(walls));
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
 * Die Wände, aus denen überhaupt ein Band wird.
 *
 * Ohne brauchbare `t` gibt es keine Aufweitung, also auch keinen Stoß — die
 * Wand fällt VOR der Gradzählung heraus, damit der Knoten daneben nicht einen
 * Grad zu viel bekommt (`buildGraph` argumentiert für die entartete Wand
 * genauso).
 */
function usableWalls(walls: readonly Wall[]): Wall[] {
  return walls.filter((wall) => Number.isFinite(wall.t) && wall.t > 0);
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
function straightestContinuation(graph: WallGraph): Continuation {
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
   * ([ADR 0038](../../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)).
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
 * GEFILTERT WIRD WIE DORT, und deshalb steht der Filter in `usableWalls`: eine
 * Wand mit kaputter `t` fällt aus der Ableitung heraus, also darf sie hier
 * keinen Stoß mehr bilden. Sonst meldete das Gate eine Kappung an einer Ecke,
 * die niemand baut.
 */
export function chainedJoints(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
): readonly ChainedJoint[] {
  const graph = buildGraph(nodes, usableWalls(walls));
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
 * ([ADR 0038](../../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)).
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
function jointFills(
  graph: WallGraph,
  continuation: Continuation,
  policy: SectionPolicy,
): OffsetPath[] {
  const fills: OffsetPath[] = [];

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
    const forward = graphWall.wall.startNodeId === from;
    const p1 = forward ? graphWall.start : graphWall.end;
    const p2 = forward ? graphWall.end : graphWall.start;
    const raw = graphWall.wall.bulge ?? 0;

    const edge = Bulge.toPolyline(
      { y: p1.y, z: p1.z },
      { y: p2.y, z: p2.z },
      usableBulge(p1, p2, forward ? raw : -raw, policy),
      policy.discretisationTolerance,
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
 * Zerlegung unter `policy.discretisationTolerance`. Genau diese Toleranz reist im Satz
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
    usableBulge(from, to, from.bulge ?? 0, policy),
    policy.discretisationTolerance,
  ).points;
}

/**
 * Die Wölbung, wie die Ableitung sie LIEST — oder `0`.
 *
 * HIER HÄNGT DIE TOTALITÄT BEIDER WEGE, und sie ist keine Höflichkeit: das Gate
 * leitet den Umriss für die Drift-Prüfung neu ab. Eine Wölbung, die
 * `Bulge.toPolyline` wirft, machte damit aus dem Sammelbefund einen Absturz —
 * ausgerechnet an der Tür, die sagen soll, was an der Figur falsch ist.
 *
 * ZWEI SORTEN FALLEN AUF `0`, und `Bulge.isDiscretisable` nennt beide: die
 * nicht endliche Zahl und die endliche, die einen fast vollen Kreis von
 * gewaltigem Radius beschreibt (`bulge = 10^14` verlangt Milliarden Punkte).
 * Die zweite ist die Lücke, die P3 offen ließ — gefiltert wurde nur
 * `Number.isFinite`, und dahinter lief die Zerlegung in den Speicher.
 *
 * DAS GATE MELDET BEIDE mit `NonFiniteBulgeError` beziehungsweise
 * `UndiscretisableBulgeError`; still bleibt hier nichts.
 *
 * EXPORTIERT, ABER NICHT IM BARREL: der Wandweg (`src/segment.ts`) liest
 * dieselbe Frage, weil er dieselben Bogenwände zerlegt. Zwei Schreibweisen
 * derselben Regel wären zwei Gelegenheiten, sie auseinanderlaufen zu lassen —
 * und die Zerlegung des Wandwegs muss aus demselben Grund total bleiben.
 */
export function usableBulge(
  p1: PointYZ,
  p2: PointYZ,
  bulge: number,
  policy: SectionPolicy,
): number {
  const chordLength = Math.hypot(p2.y - p1.y, p2.z - p1.z);
  return Bulge.isDiscretisable(
    chordLength,
    bulge,
    policy.discretisationTolerance,
  )
    ? bulge
    : 0;
}
