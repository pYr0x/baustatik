/**
 * Das POSITIONIERTE Wegstück — das Wort, das ADR 0030 und `packages/TODO.md` §5
 * seit jeher reserviert haben:
 *
 * > „`Segment` bleibt für das POSITIONIERTE Wegstück reserviert, aus dem kappa
 * > und die Spannungspunkte einmal gemeinsam fallen sollen."
 *
 * `ShearFlowInterval` (`src/shear.ts`) ist das LAGELOSE Gegenstück und bleibt
 * unverändert: es benennt ein Stück der Laufkoordinate `s`, kein Stück
 * Querschnitt. Hier steht der Ort.
 *
 * REIN GEOMETRISCH, OHNE `S`, und das ist die tragende Entscheidung dieser
 * Datei: `Sy` und `Sz` sind zwei verschieden parametrisierte Läufe über
 * DIESELBE Geometrie. Steckte `S` im `Segment`, bräuchte eine Figur zwei
 * Listen — und die Korrelation ihrer Stationen wäre genau die Doppelsprache,
 * gegen die ADR 0030 argumentiert. Die Rechnung darüber liegt in
 * `src/wall-path.ts`.
 *
 * BÖGEN SIND HIER SCHON WEG. `Bulge.toPolyline` löst eine Bogenwand unter
 * `policy.discretisationTolerance` in gerade Stücke auf — dieselbe Modellannahme wie in
 * der Umriss-Ableitung, nicht eine zweite. Damit ist jedes `Segment` gerade,
 * `S(s)` darauf quadratisch und `shearFlowIntegral` Ziffer für Ziffer die
 * bestehende Funktion.
 *
 * EINHEITENFREI, wie `tSectionCentroid`: was hineingeht, bestimmt, was
 * herauskommt. `segments` liest `SectionNode`/`Wall` und arbeitet damit in
 * MILLIMETERN; `scaleSegments` bringt das Ergebnis in die Zentimeterwelt, in
 * der der Rest des Packages rechnet. Skaliert werden die PUNKTE und nicht das
 * Ergebnis — dieselbe Figur wie bei `shapeResult` und `geometryResult`
 * ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md)).
 */

import { atOrThrow } from '@baustatik/core';
import { Bulge } from '@baustatik/section-geometry';
import { type Branch, branches, buildGraph } from './branch';
import { usableBulge } from './derive-outline';
import type { SectionPolicy } from './policy';
import type { SectionNode, Wall } from './types';

/**
 * Ein gerades, POSITIONIERTES Stück Wandmittellinie.
 *
 * `(y, z)` ist der Startpunkt, `(dy, dz)` die auf Länge 1 gebrachte Richtung,
 * `length` die Länge. Der Punkt bei der Laufkoordinate `s` ist damit
 * `(y + s·dy, z + s·dz)` für `s` in `[0, length]`.
 *
 * `t` ist die Wandstärke des Stücks, `wallId` die Wand, aus der es stammt —
 * eine Bogenwand liefert mehrere Segmente mit derselben Id. Der Verweis steht
 * hier, damit ein Befund die Wand benennen kann, aus der er stammt; gerechnet
 * wird mit ihm nicht.
 *
 * `[L]` STATT EINER EINHEIT: der Typ ist massstabsfrei (siehe Dateikopf), und
 * `L` ist die Längeneinheit, in der die Punkte hereingegeben wurden — mm aus
 * `segments`, cm nach `scaleSegments`. ALLE Längen EINES Laufsatzes stehen
 * zwangsläufig im selben `L`; wer zwei Sätze mischt, mischt zwei Figuren.
 */
export type Segment = {
  /** Startpunkt [L]. */
  readonly y: number;
  readonly z: number;
  /** Richtung, auf Länge 1 gebracht [-]. */
  readonly dy: number;
  readonly dz: number;
  /** Länge des Stücks [L]. */
  readonly length: number;
  /** Wandstärke [L]. */
  readonly t: number;
  readonly wallId: string;
};

/**
 * Ein `Branch` samt seiner positionierten Stücke.
 *
 * Die Segmente laufen VOM ersten ZUM letzten Knoten des Laufs
 * (`branch.nodeIds`) — eine Wand, die dabei gegen ihre eigene Richtung
 * durchlaufen wird, kommt bereits umgedreht heraus, samt gedrehtem Vorzeichen
 * ihrer Wölbung.
 */
export type SegmentRun = {
  readonly branch: Branch;
  readonly segments: readonly Segment[];
};

/**
 * Die Zerlegung des Wandgraphen in positionierte Läufe.
 *
 * TOTAL UND OHNE PRÜFUNG, wie `branches` und `deriveOutlineFromWalls`:
 * hängende Verweise und Nulllängenwände fallen in `buildGraph` heraus, eine
 * unbrauchbare Wölbung liest `usableBulge` als Gerade. Was daran falsch ist,
 * sagt `validateSectionGeometry` mit Namen — eine zweite Meinung darüber, was
 * ein brauchbarer Graph ist, wäre genau die Doppelung, die das Gate abschafft.
 */
export function segments(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
  policy: SectionPolicy,
): readonly SegmentRun[] {
  const graph = buildGraph(nodes, walls);
  const byWallId = new Map(graph.walls.map((it) => [it.wall.id, it]));

  // EINGEFROREN AUF JEDER EBENE: Liste, Lauf und Stück. Der `Branch` darin
  // kommt bereits eingefroren aus `traverse`.
  return Object.freeze(
    branches(nodes, walls).map((branch) =>
      Object.freeze({
        branch,
        segments: Object.freeze(runSegments(branch, byWallId, policy)),
      }),
    ),
  );
}

function runSegments(
  branch: Branch,
  byWallId: ReadonlyMap<
    string,
    { wall: Wall; start: SectionNode; end: SectionNode }
  >,
  policy: SectionPolicy,
): Segment[] {
  const result: Segment[] = [];

  branch.wallIds.forEach((wallId, index) => {
    const graphWall = byWallId.get(wallId);
    // `branches` liefert nur Wände, die `buildGraph` behalten hat — der Zugriff
    // kann nicht fehlschlagen, und ein stilles `continue` verstellte den Blick
    // auf einen Bruch dieser Invariante.
    if (graphWall === undefined) return;

    // `nodeIds[i]` ist der Knoten, an dem Wand `i` BETRETEN wird (ein Eintrag
    // mehr als `wallIds`, siehe `Branch`).
    const forward =
      graphWall.wall.startNodeId === atOrThrow(branch.nodeIds, index);
    const from = forward ? graphWall.start : graphWall.end;
    const to = forward ? graphWall.end : graphWall.start;

    // `bulge` gehört der Wand in IHRER Richtung; rückwärts dreht das Vorzeichen
    // mit — dieselbe Zeile wie in `pointsOf` (`derive-outline.ts`).
    const raw = graphWall.wall.bulge ?? 0;
    const p1 = { y: from.y, z: from.z };
    const p2 = { y: to.y, z: to.z };
    const points = Bulge.toPolyline(
      p1,
      p2,
      usableBulge(p1, p2, forward ? raw : -raw, policy),
      policy.discretisationTolerance,
    ).points;

    for (let i = 0; i + 1 < points.length; i++) {
      const a = atOrThrow(points, i);
      const b = atOrThrow(points, i + 1);
      const length = Math.hypot(b.y - a.y, b.z - a.z);
      // Eine Sehne der Länge 0 hat keine Richtung. Sie kann aus einer
      // Bogenzerlegung fallen und trägt zu jedem Integral exakt nichts bei.
      if (!(length > 0)) continue;
      result.push(
        Object.freeze({
          y: a.y,
          z: a.z,
          dy: (b.y - a.y) / length,
          dz: (b.z - a.z) / length,
          length,
          t: graphWall.wall.t,
          wallId,
        }),
      );
    }
  });

  return result;
}

/**
 * Dieselben Läufe in einem anderen Längenmassstab.
 *
 * DIE EINE STELLE, an der der Wandweg den Massstab wechselt: `geometryResult`
 * ruft `segments` in Millimetern und rechnet in Zentimetern weiter. Skaliert
 * werden Startpunkt, Länge und Wandstärke; die Richtung ist ein Einheitsvektor
 * und bleibt.
 *
 * DAS ERGEBNIS HINTERHER ZU SKALIEREN brauchte drei verschiedene Faktoren
 * (`cm`, `cm⁴`, dimensionslos) und damit drei Gelegenheiten, sich zu vertun.
 */
export function scaleSegments(
  runs: readonly SegmentRun[],
  factor: number,
): readonly SegmentRun[] {
  return Object.freeze(
    runs.map((run) =>
      Object.freeze({
        branch: run.branch,
        segments: Object.freeze(
          run.segments.map((segment) =>
            Object.freeze({
              ...segment,
              y: segment.y * factor,
              z: segment.z * factor,
              length: segment.length * factor,
              t: segment.t * factor,
            }),
          ),
        ),
      }),
    ),
  );
}

/** Dasselbe Stück, rückwärts durchlaufen. */
export function reverseSegment(segment: Segment): Segment {
  return Object.freeze({
    ...segment,
    y: segment.y + segment.dy * segment.length,
    z: segment.z + segment.dz * segment.length,
    dy: -segment.dy,
    dz: -segment.dz,
  });
}

/**
 * Die Querschnittswerte des WANDMODELLS — Linienelemente mal `t`, auf den
 * Wandschwerpunkt bezogen.
 *
 * DAS GEGENSTÜCK ZU `greenValues`, und der Unterschied ist der Zweck: Green
 * rechnet die UMRISSFIGUR, hier steht die Figur, die der Schubfluss sieht.
 * Welche von beiden welche Grösse trägt, entscheidet nicht der Aufrufer,
 * sondern ADR 0041 — κ nimmt `I` aus dem Umriss, der Schubmittelpunkt aus dem
 * Wandmodell.
 *
 * OHNE `t³/12`. Der Eigenanteil eines Linienelements um seine eigene Achse ist
 * genau der Anteil, den die dünnwandige Theorie fallen lässt; ihn mitzunehmen
 * hiesse, eine dritte Figur zu führen, die weder Umriss noch Mittellinie ist.
 *
 * INTERN UND NIE VERÖFFENTLICHT: `ys`/`zs` in `SectionProperties` bleiben die
 * der Umrissfigur. Dieselbe Trennung führt `tSectionWall` seit ADR 0029 für
 * genau eine Form — hier gilt sie für jeden gezeichneten Querschnitt.
 *
 * `undefined` heisst „keine Fläche", wie bei `greenValues`.
 */
export type WallMoments = {
  /** Wandfläche `Σ l·t` [L²]. */
  readonly A: number;
  /** Schwerpunkt des Wandmodells im Eingabesystem [L]. */
  readonly ys: number;
  readonly zs: number;
  /** `∫z² dA` um den Wandschwerpunkt [L⁴]. */
  readonly Iy: number;
  /** `∫y² dA` um den Wandschwerpunkt [L⁴]. */
  readonly Iz: number;
  /** `+∫y·z dA` um den Wandschwerpunkt [L⁴] — ohne Negation, wie in Green. */
  readonly Iyz: number;
};

export function wallMoments(
  segments: readonly Segment[],
): WallMoments | undefined {
  let A = 0;
  let Sy = 0;
  let Sz = 0;
  // Roh um den URSPRUNG, wie in `green.ts`: die Steiner-Verschiebung passiert
  // einmal am Ende und nicht je Segment.
  let IyO = 0;
  let IzO = 0;
  let IyzO = 0;

  for (const { y, z, dy, dz, length: L, t } of segments) {
    const dA = t * L;
    A += dA;
    Sy += dA * (y + (dy * L) / 2);
    Sz += dA * (z + (dz * L) / 2);
    IyO += dA * (z * z + z * dz * L + (dz * dz * L * L) / 3);
    IzO += dA * (y * y + y * dy * L + (dy * dy * L * L) / 3);
    IyzO += dA * (y * z + ((y * dz + z * dy) * L) / 2 + (dy * dz * L * L) / 3);
  }

  if (!(Number.isFinite(A) && A > 0)) return undefined;

  const ys = Sy / A;
  const zs = Sz / A;

  return Object.freeze({
    A,
    ys,
    zs,
    Iy: IyO - A * zs * zs,
    Iz: IzO - A * ys * ys,
    Iyz: IyzO - A * ys * zs,
  });
}
