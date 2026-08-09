import { atOrThrow } from '@baustatik/core';
import {
  Clipper,
  ClipType,
  EndType,
  FillRule,
  JoinType,
  type PathD,
  type PolyPathD,
  PolyTreeD,
} from 'clipper2-ts';
import { diff, intersection, union } from 'martinez-polygon-clipping';
import { DEFAULT_ARC_TOLERANCE, OFFSET_PRECISION } from './constants';
import { DiscontinuousLinesError, InvalidPolygonError } from './errors';
import type { Line } from './line';
import { Point } from './point';
import type { Polyline } from './polyline';
import type { BoundingBox, Transformable } from './types';

/**
 * Ein geschlossener Ring. DIE WINDUNG IST EINE AUSSAGE, keine Formalie:
 * `signedArea > 0` läuft im mathematisch positiven Sinn (die erste Achse auf
 * die zweite), `< 0` im umgekehrten. Seit ADR 0034 dreht die Fabrik sie nicht
 * mehr zurecht — wer ein Loch beschreiben will, kann es.
 */
export type Polygon = { readonly points: Point[] };

/**
 * Die rohen Flächenmomente eines Ringes, um den URSPRUNG und MIT VORZEICHEN.
 *
 * Die Namen sind die der ebenen Geometrie (`x`/`y`), nicht die des
 * Querschnitts: `Ixx = ∫y² dA` ist das Moment UM die x-Achse. Wer sie als `Iy`,
 * `Iz`, `Iyz` lesen will, wrappt sie dort, wo `y`/`z` gilt
 * (`@baustatik/section-geometry`).
 */
export type PolygonMoments = {
  /** `∫dA` — die vorzeichenbehaftete Fläche. */
  readonly A: number;
  /** `∫x dA`. */
  readonly Sx: number;
  /** `∫y dA`. */
  readonly Sy: number;
  /** `∫y² dA` — das Moment UM die x-Achse. */
  readonly Ixx: number;
  /** `∫x² dA` — das Moment UM die y-Achse. */
  readonly Iyy: number;
  /** `∫xy dA` — das Deviationsmoment, OHNE Negation. */
  readonly Ixy: number;
};

type MartinezCoord = [number, number];
type MartinezRing = MartinezCoord[];
type MartinezPoly = MartinezRing[];

const toMartinez = (poly: Polygon): MartinezPoly => {
  const ring: MartinezRing = poly.points.map((p) => [p.x, p.y]);
  ring.push(atOrThrow(ring, 0));
  return [ring];
};

const signedArea = (points: Point[]): number => {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area +=
      atOrThrow(points, i).x * atOrThrow(points, j).y -
      atOrThrow(points, j).x * atOrThrow(points, i).y;
  }
  return area / 2;
};

/**
 * Ein Ring in dem Umlaufsinn, in dem Clipper2 seine Aussenkonturen liefert.
 *
 * Die Vereinigung läuft mit `FillRule.NonZero`, und darin LÖSCHT ein
 * gegenläufiger Ring, was ein anderer setzt: ein `delta: 0`-Ring, den jemand
 * andersherum gezeichnet hat, risse ein Loch, statt Fläche zu ergänzen.
 * Gedreht wird deshalb hier — und das ist kein Bruch mit
 * [ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md):
 * `inflate` SETZT den Umlaufsinn seines Ergebnisses ohnehin selbst, und die
 * Richtung eines EINGABEZUGES hat in dieser Tür nie etwas bedeutet.
 */
const positive = (points: readonly Point[]): PathD => {
  const ring = [...points];
  const ordered = signedArea(ring) < 0 ? ring.reverse() : ring;
  return ordered.map((p) => ({ x: p.x, y: p.y }));
};

/**
 * Die Rückabbildung von martinez — und die Stelle, die den Umlaufsinn FESTLEGT.
 *
 * AUSDRÜCKLICH NORMALISIERT, seit `Polygon.make` es nicht mehr tut: der
 * Umlaufsinn einer fremden Bibliothek ist keine Aussage dieses Packages. Also
 * wird er an der GRENZE festgelegt statt durchgereicht — sonst hänge die Zusage
 * von `union`/`intersect`/`subtract` an einer Implementierung, die niemand hier
 * kontrolliert, und eine neue martinez-Version änderte still das Vorzeichen
 * jeder Fläche dahinter ([ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 */
const fromMartinez = (result: unknown): Polygon[] => {
  if (!result || !Array.isArray(result)) return [];
  return (result as MartinezPoly[]).flatMap((poly) => {
    const ring = atOrThrow(poly, 0);
    const points = ring.slice(0, -1).map(([x, y]) => Point.make(x, y));
    return [Polygon.toCounterClockwise(Polygon.make(points))];
  });
};

/**
 * Wie ein Zug an seinen ENDEN aufgeweitet wird.
 *
 * `butt` — das Blech endet flach, senkrecht zum Zug. Der offene Zug.
 * `joined` — Anfang und Ende werden verbunden: Clipper2 weitet beidseitig auf
 *   und liefert den Ringstreifen samt INNENRING in einem Aufruf.
 *
 * AUSDRÜCKLICH OHNE „polygon". Das wäre die Aufweitung eines geschlossenen
 * RINGES nach nur einer Seite — eine andere Frage, für die der Name
 * `Polygon.offset` frei bleibt (ADR 0037). Ein Aufzählungswert für beides
 * machte aus zwei Türen eine mit einem Schalter.
 */
export type InflateEndType = 'butt' | 'joined';

/** Ein Zug samt der Aufweitung, die für IHN gilt. */
export type InflatePath = {
  readonly polyline: Polyline;
  /**
   * Die Aufweitung nach JEDER Seite — beim Wandquerschnitt `t/2`. In der
   * Einheit der Punkte; dieses Package kennt keine.
   *
   * `0` IST DIE IDENTITÄT und ausdrücklich erlaubt: der geschlossene Zug geht
   * dann UNVERÄNDERT in die Vereinigung, ohne Clipper2s Offset zu durchlaufen.
   * Gebraucht wird das für ein Stück Fläche, das kein Offset erzeugen kann —
   * die Miter-Ecke am Dickensprung
   * ([ADR 0038](../../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)).
   * Ein OFFENER Zug mit `delta: 0` trägt keine Fläche und wird übersprungen.
   */
  readonly delta: number;
  readonly endType: InflateEndType;
};

/**
 * Die Stellschrauben der Aufweitung — beide mit Vorgabe.
 *
 * `joinType` STEHT NICHT DARIN: er ist auf Miter festgenagelt. `Round` rundete
 * jede Ecke ab, und am I-Profil fiele damit die Identität
 * `A = 2·b·tf + tw·(h − 2·tf)`; auf einem bereits zerlegten Bogen wäre es
 * ausserdem eine ZWEITE Näherung derselben Krümmung (ADR 0037). Es gibt keine
 * zweite zulässige Wahl, also auch keine Einstellung.
 */
export type InflateOptions = {
  /** Zulässige Sehnenabweichung [Längeneinheit der Punkte]. */
  readonly arcTolerance?: number;
  /** Dimensionslos: Clipper2 kappt den Spitz, sobald `1/sin(α/2) > miterLimit`. */
  readonly miterLimit?: number;
};

/** Die Vorgabe von Clipper2 selbst — hier benannt statt implizit. */
const DEFAULT_MITER_LIMIT = 2;

const END_TYPE: Record<InflateEndType, EndType> = {
  butt: EndType.Butt,
  joined: EndType.Joined,
};

/**
 * Der Baum von Clipper2, TIEFENZUERST in eine sortierte Ringliste gelegt.
 *
 * Je Ebene absteigend nach `|A|`, und jeder Knoten wird VOR seinen Kindern
 * ausgegeben. Damit folgt jedes Loch unmittelbar seinem Aussenring, und eine
 * Insel im Loch findet ihren Platz, ohne dass die Regel einen Sonderfall
 * bekäme.
 *
 * DER UMLAUFSINN KOMMT AUS DEM BAUM, nicht aus dem Vorzeichen: `isHole` ist
 * die Aussage von Clipper2 über die VERSCHACHTELUNG, und erst danach wird das
 * Vorzeichen darauf gesetzt (ADR 0034, ADR 0037).
 *
 * Ringe unter drei Punkten werden übersprungen — sie tragen keine Fläche, und
 * `Polygon.make` wiese sie ohnehin zurück.
 */
function collectRings(node: PolyPathD, out: Polygon[]): void {
  const children: { child: PolyPathD; A: number }[] = [];
  for (let i = 0; i < node.count; i++) {
    const child = node.child(i);
    const path = child.poly ?? [];
    children.push({
      child,
      A: signedArea(path.map(({ x, y }) => Point.make(x, y))),
    });
  }
  children.sort((a, b) => Math.abs(b.A) - Math.abs(a.A));

  for (const { child, A } of children) {
    const points = (child.poly ?? []).map(({ x, y }) => Point.make(x, y));
    if (points.length >= 3) {
      // Aussen `> 0`, Loch `< 0`. Was Clipper2 zurueckgab, entscheidet das
      // nicht — `isHole` tut es.
      const wanted = child.isHole ? -1 : 1;
      out.push({
        points: Math.sign(A) === wanted ? points : [...points].reverse(),
      });
    }
    collectRings(child, out);
  }
}

export const Polygon: Transformable<Polygon> & {
  make(points: Point[]): Polygon;
  inflate(paths: readonly InflatePath[], options?: InflateOptions): Polygon[];
  fromLines(lines: Line[]): Polygon;
  area(polygon: Polygon): number;
  moments(points: readonly Point[]): PolygonMoments;
  centroid(polygon: Polygon): Point;
  perimeter(polygon: Polygon): number;
  contains(polygon: Polygon, p: Point): boolean;
  isClockwise(polygon: Polygon): boolean;
  toClockwise(polygon: Polygon): Polygon;
  toCounterClockwise(polygon: Polygon): Polygon;
  intersect(a: Polygon, b: Polygon): Polygon[];
  union(a: Polygon, b: Polygon): Polygon[];
  subtract(a: Polygon, b: Polygon): Polygon[];
  boundingBox(polygon: Polygon): BoundingBox;
} = {
  /**
   * PRÜFT NUR, DREHT NICHT. Die Windung kommt so heraus, wie sie hineingeht.
   *
   * Früher normalisierte die Fabrik still auf CCW. Damit war ein Lochring
   * überhaupt nicht baubar — und genau den braucht der Querschnitt, wo die
   * Windung „Material gegen Loch" BEDEUTET (ADR 0034). Eine Fabrik, die die
   * einzige bedeutungstragende Eigenschaft ihrer Eingabe wegwirft, ist die
   * falsche Tür.
   *
   * FOLGE FÜR DIE FLÄCHE: `Polygon.area` gibt weiterhin den Betrag zurück.
   * Wer das VORZEICHEN braucht — also wissen will, ob der Ring Material oder
   * Loch ist —, fragt `Polygon.moments(points).A`.
   */
  make: (points) => {
    if (points.length < 3)
      throw new InvalidPolygonError('weniger als 3 Punkte');
    return { points };
  },

  /**
   * ZÜGE AUFWEITEN UND VEREINIGEN — die eine Tür zu Clipper2
   * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
   *
   * Eingabe sind offene oder geschlossene ZÜGE, Ausgabe eine RINGMENGE MIT
   * LÖCHERN: Material läuft mit `signedArea > 0`, ein Loch mit `< 0`
   * ([ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
   *
   * `inflate` UND NICHT `offset`: `offset` bleibt für die Aufweitung eines
   * geschlossenen RINGES frei, falls sie je gebraucht wird. Ein Name für beides
   * wäre die Doppelung, die dieses Repo sonst vermeidet.
   *
   * JEDER ZUG TRÄGT SEIN EIGENES `delta`, und das ist der Grund, warum die
   * Vereinigung HIER passiert und nicht beim Aufrufer: Clipper2 nimmt genau EIN
   * `delta` je Offset-Aufruf, ein I-Profil hat aber zwei Wandstärken. Nach den
   * Offsets steht deshalb IMMER eine Boolesche Vereinigung — und `Polygon.union`
   * kann kein Loch zurückgeben, weil `fromMartinez` je Ergebnispolygon nur Ring 0
   * behält. Beides erledigt dieselbe Bibliothek, martinez bleibt unberührt.
   *
   * DER UMLAUFSINN WIRD GESETZT, NICHT DURCHGEREICHT. Clipper2 kodiert Loch
   * gegen Material ebenfalls im Vorzeichen, und dieses Vorzeichen hängt an
   * seiner eigenen Achsenannahme — derselbe Satz, den `fromMartinez` trägt: der
   * Umlaufsinn einer fremden Bibliothek ist keine Aussage dieses Packages. Die
   * VERSCHACHTELUNG wird deshalb aus dem `PolyTreeD` ausgelesen und der
   * Umlaufsinn danach gesetzt.
   *
   * DIE REIHENFOLGE IST SORTIERT und kein Schönheitsdienst: der Umriss wird
   * gespeichert, serialisiert und gegen eine Neuableitung verglichen. Eine
   * Bibliotheksreihenfolge machte jeden Versionswechsel zu einer Umordnung im
   * Modell-Diff, die nichts bedeutet. Sortiert wird nach `|A|` absteigend, und
   * jedes Loch folgt UNMITTELBAR seinem Aussenring.
   *
   * TOTAL: eine leere Eingabe gibt eine leere Ringmenge, ein Zug mit weniger
   * als zwei Punkten trägt nichts bei. Geprüft wird nichts — was an der Eingabe
   * falsch ist, sagt das Gate des Aufrufers mit Namen.
   */
  inflate: (paths, options) => {
    const arcTolerance = options?.arcTolerance ?? DEFAULT_ARC_TOLERANCE;
    const miterLimit = options?.miterLimit ?? DEFAULT_MITER_LIMIT;

    // Gruppiert nach (delta, endType), weil beide an `inflatePathsD` je Aufruf
    // hängen. Der Schlüssel ist die Zahl selbst — zwei Wände gleicher Dicke
    // gehen damit in EINEN Aufruf, und nur das schliesst nach ADR 0037 die
    // Ecke zwischen ihnen.
    const groups = new Map<
      string,
      { delta: number; endType: InflateEndType; paths: PathD[] }
    >();
    // Was OHNE Offset in die Vereinigung geht: die `delta: 0`-Ringe.
    const offset: PathD[] = [];

    for (const path of paths) {
      if (path.polyline.points.length < 2) continue;

      // `delta: 0` GEHT AM OFFSET VORBEI, statt sich auf Clipper2s internen
      // Kurzschluss für kleine Deltas zu verlassen: der ist an eine Schwelle in
      // skalierten Einheiten gebunden, die dieses Package nicht kontrolliert.
      // Ein offener Zug trägt dabei keine Fläche — er fällt heraus.
      if (path.delta === 0) {
        if (path.endType === 'joined' && path.polyline.points.length >= 3) {
          offset.push(positive(path.polyline.points));
        }
        continue;
      }

      const key = `${path.endType}:${path.delta}`;
      const group = groups.get(key) ?? {
        delta: path.delta,
        endType: path.endType,
        paths: [],
      };
      group.paths.push(path.polyline.points.map((p) => ({ x: p.x, y: p.y })));
      groups.set(key, group);
    }

    for (const group of groups.values()) {
      offset.push(
        ...Clipper.inflatePathsD(
          group.paths,
          group.delta,
          JoinType.Miter,
          END_TYPE[group.endType],
          miterLimit,
          OFFSET_PRECISION,
          arcTolerance,
        ),
      );
    }
    if (offset.length === 0) return [];

    // Die Vereinigung läuft AUCH bei nur einer Gruppe — sie ist hier nicht nur
    // Verschmelzung, sondern die Stelle, an der die Verschachtelung überhaupt
    // erst benannt wird. `NonZero`, weil Clipper2 seine Löcher bereits
    // gegenläufig zurückgibt.
    const tree = new PolyTreeD();
    Clipper.booleanOpDWithPolyTree(
      ClipType.Union,
      offset,
      null,
      tree,
      FillRule.NonZero,
      OFFSET_PRECISION,
    );

    const rings: Polygon[] = [];
    collectRings(tree, rings);
    return rings;
  },

  fromLines: (lines) => {
    if (lines.length < 3)
      throw new InvalidPolygonError(
        'weniger als 3 Linien fuer ein Polygon noetig',
      );

    const points: Point[] = [atOrThrow(lines, 0).p1];
    for (let i = 0; i < lines.length; i++) {
      if (
        i > 0 &&
        !Point.equals(
          atOrThrow(points, points.length - 1),
          atOrThrow(lines, i).p1,
        )
      ) {
        throw new DiscontinuousLinesError(i - 1);
      }
      points.push(atOrThrow(lines, i).p2);
    }

    if (
      !Point.equals(atOrThrow(points, points.length - 1), atOrThrow(points, 0))
    ) {
      throw new InvalidPolygonError('Linien bilden keinen geschlossenen Zug');
    }

    return Polygon.make(points.slice(0, -1));
  },

  /**
   * Die Fläche als BETRAG — und damit die falsche Tür für einen Lochring.
   *
   * Seit `make` die Windung stehen lässt, kann ein Ring negativ umlaufen und
   * damit ein Loch bedeuten. `area` sagt darüber nichts; wer die Windung
   * BRAUCHT, nimmt `moments(points).A` (vorzeichenbehaftet) oder `isClockwise`.
   */
  area: (poly) => Math.abs(signedArea(poly.points)),

  /**
   * Die ROHEN Flächenmomente eines Ringes — um den URSPRUNG, mit VORZEICHEN.
   *
   * ```text
   * A   = ∫dA      Sx = ∫x dA     Sy = ∫y dA
   * Ixx = ∫y² dA   Iyy = ∫x² dA   Ixy = ∫xy dA
   * ```
   *
   * EBENE GEOMETRIE, KEIN QUERSCHNITTSWISSEN: in der Signatur steht kein
   * Querschnittsbegriff, und die Funktion ist SKALENFREI — was hineingeht,
   * bestimmt, was herauskommt (mm liefert mm², mm³, mm⁴).
   *
   * ROH UND NICHT SCHWERPUNKTSBEZOGEN, und das ist die eigentliche Entscheidung:
   * schwerpunktsbezogen je Ring wäre für eine Summe unbrauchbar, weil die
   * Ringschwerpunkte verschieden sind und jeder einzeln zurückverschoben werden
   * müsste. Roh addieren sich alle sechs Zahlen LINEAR über die Ringe, ein
   * Lochring trägt sich über sein Vorzeichen selbst bei, und die
   * Steiner-Verschiebung in den Gesamtschwerpunkt passiert EINMAL am Ende.
   *
   * EIN RING UND KEINE LISTE: `Polygon[]` in der Signatur zöge die Aussage
   * „mehrere Ringe sind eine Figur" in dieses Package, wo sie nicht hingehört.
   * Die Summe ist beim Aufrufer ein Dreizeiler.
   *
   * Herleitung über Green: für jede Kante `i → j` mit
   * `c = x_i·y_j − x_j·y_i` ist
   *
   * ```text
   * A   = ½ Σ c
   * Sx  = ⅙ Σ (x_i + x_j)·c
   * Iyy = (1/12) Σ (x_i² + x_i·x_j + x_j²)·c
   * Ixy = (1/24) Σ (x_i·y_j + 2·x_i·y_i + 2·x_j·y_j + x_j·y_i)·c
   * ```
   */
  moments: (points) => {
    if (points.length < 3)
      throw new InvalidPolygonError('weniger als 3 Punkte');

    let A = 0;
    let Sx = 0;
    let Sy = 0;
    let Ixx = 0;
    let Iyy = 0;
    let Ixy = 0;

    const n = points.length;
    for (let i = 0; i < n; i++) {
      const pi = atOrThrow(points, i);
      const pj = atOrThrow(points, (i + 1) % n);
      const cross = pi.x * pj.y - pj.x * pi.y;

      A += cross;
      Sx += (pi.x + pj.x) * cross;
      Sy += (pi.y + pj.y) * cross;
      Iyy += (pi.x * pi.x + pi.x * pj.x + pj.x * pj.x) * cross;
      Ixx += (pi.y * pi.y + pi.y * pj.y + pj.y * pj.y) * cross;
      Ixy +=
        (pi.x * pj.y + 2 * pi.x * pi.y + 2 * pj.x * pj.y + pj.x * pi.y) * cross;
    }

    return Object.freeze({
      A: A / 2,
      Sx: Sx / 6,
      Sy: Sy / 6,
      Ixx: Ixx / 12,
      Iyy: Iyy / 12,
      Ixy: Ixy / 24,
    });
  },

  centroid: (poly) => {
    const n = poly.points.length;
    let cx = 0;
    let cy = 0;
    const a = signedArea(poly.points);

    if (Math.abs(a) < 1e-14) return atOrThrow(poly.points, 0);

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xj = atOrThrow(poly.points, j).x;
      const yj = atOrThrow(poly.points, j).y;
      const cross =
        atOrThrow(poly.points, i).x * yj - xj * atOrThrow(poly.points, i).y;
      cx += (atOrThrow(poly.points, i).x + xj) * cross;
      cy += (atOrThrow(poly.points, i).y + yj) * cross;
    }

    return Point.make(cx / (6 * a), cy / (6 * a));
  },

  perimeter: (poly) => {
    const pts = poly.points;
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      total += Point.distance(
        atOrThrow(pts, i),
        atOrThrow(pts, (i + 1) % pts.length),
      );
    }
    return total;
  },

  contains: (poly, p) => {
    let inside = false;
    const pts = poly.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ptI = atOrThrow(pts, i);
      const ptJ = atOrThrow(pts, j);
      const xi = ptI.x;
      const yi = ptI.y;
      const xj = ptJ.x;
      const yj = ptJ.y;
      if (
        yi > p.y !== yj > p.y &&
        p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  },

  isClockwise: (poly) => signedArea(poly.points) < 0,

  toClockwise: (poly) =>
    Polygon.isClockwise(poly) ? poly : { points: [...poly.points].reverse() },

  toCounterClockwise: (poly) =>
    !Polygon.isClockwise(poly) ? poly : { points: [...poly.points].reverse() },

  intersect: (a, b) => fromMartinez(intersection(toMartinez(a), toMartinez(b))),
  union: (a, b) => fromMartinez(union(toMartinez(a), toMartinez(b))),
  subtract: (a, b) => fromMartinez(diff(toMartinez(a), toMartinez(b))),

  boundingBox: (poly) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of poly.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    return { min: Point.make(minX, minY), max: Point.make(maxX, maxY) };
  },

  translate: (poly, v) => ({
    points: poly.points.map((p) => Point.translate(p, v)),
  }),
  rotate: (poly, angle, origin) => ({
    points: poly.points.map((p) => Point.rotate(p, angle, origin)),
  }),
  /**
   * KEHRT DIE WINDUNG UM — das ist die Wahrheit über eine Spiegelung.
   *
   * Früher drehte diese Stelle sie still zurück, weil `make` normalisierte.
   * Eine Spiegelung ist orientierungsUMkehrend; das zu verstecken hieße, aus
   * einem Loch beim Spiegeln stillschweigend Material zu machen (ADR 0034).
   */
  mirror: (poly, axisP1, axisP2) => ({
    points: poly.points.map((p) => Point.mirror(p, axisP1, axisP2)),
  }),
};
