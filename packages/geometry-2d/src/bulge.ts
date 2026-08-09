/**
 * `bulge` — die DXF-Wölbung, und das Paar, das sie in einen `Arc` übersetzt.
 *
 * DIE KODIERUNG, GETRENNT VON DER ALGEBRA. `bulge = tan(Δ/4)` ist eine
 * redundanzfreie, aber unlesbare Zahl: sie speichert einen Bogen zwischen zwei
 * bereits vorhandenen Punkten, ohne Mittelpunkt und Radius ein zweites Mal zu
 * führen — genau deshalb steht sie in `Wall.bulge` und in `Vertex.bulge`
 * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
 * Rechnen, zeichnen und fangen brauchen dagegen einen `Arc`.
 *
 * WARUM HIER UND NICHT IN `@baustatik/section-geometry`: `bulge` kodiert einen
 * `Arc`, keinen Querschnitt, und `Arc` liegt bereits in diesem Package. In der
 * Signatur steht kein Querschnittsbegriff — zwei Punkte und eine
 * dimensionslose Zahl.
 *
 * WARUM KEINE METHODEN AN `Arc`: `sagitta` und `isStraight` brauchen gar keinen
 * `Arc` und hießen dort „ein Bogen, der keiner ist".
 *
 * DIE TRAGENDE IDENTITÄT dieses Moduls, algebraisch und nicht genähert:
 *
 * ```text
 * h = (Sehne/2) · |bulge|          Stichhöhe
 * ```
 *
 * denn mit `t = tan(Δ/4)` ist `c = 2R·sin(Δ/2)` und
 * `(c/2)·t = R·sin(Δ/2)·tan(Δ/4) = 2R·sin²(Δ/4) = R·(1 − cos(Δ/2)) = h`.
 * „Wie krumm ist diese Wand" ist damit ohne Trigonometrie beantwortbar, und
 * „ab wann ist ein Bogen eine Gerade" fällt mit der Diskretisierungstoleranz
 * zusammen, statt eine zweite Zahl zu brauchen
 * ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)).
 *
 * VORZEICHEN WIE `Arc.sweep`: positiv dreht von der ersten Achse auf die
 * zweite. In der Querschnittsebene heißt das `+y → +z`
 * ([ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md)); dieses
 * Package weiß davon nichts und sagt nur „positiv dreht `+x` auf `+y`".
 */

import { Arc, arcSegments } from './arc';
import { MAX_ARC_SEGMENTS } from './constants';
import {
  FullCircleBulgeError,
  InvalidArcError,
  StraightBulgeError,
} from './errors';
import { Point } from './point';

type PolylineLike = { readonly points: Point[] };

/**
 * Der Radius allein aus Sehne und Wölbung: `R = c·(1 + t²) / (4·|t|)`.
 *
 * Steht neben `toArc` und nicht darin, weil `isDiscretisable` ihn braucht, OHNE
 * einen `Arc` zu bauen — und ein `Arc`, der nur gebaut wird, um verworfen zu
 * werden, wäre genau der Wurf, den die Frage vermeiden soll.
 */
function radiusOf(chordLength: number, bulge: number): number {
  return (chordLength * (1 + bulge ** 2)) / (4 * Math.abs(bulge));
}

export const Bulge: {
  sweep(bulge: number): number;
  sagitta(chordLength: number, bulge: number): number;
  isStraight(chordLength: number, bulge: number, tolerance: number): boolean;
  isDiscretisable(
    chordLength: number,
    bulge: number,
    tolerance: number,
  ): boolean;
  toArc(p1: Point, p2: Point, bulge: number, tolerance: number): Arc;
  fromArc(arc: Arc): number;
  toPolyline(
    p1: Point,
    p2: Point,
    bulge: number,
    tolerance: number,
  ): PolylineLike;
} = {
  /**
   * Der Öffnungswinkel `Δ = 4·atan(bulge)` [rad], mit Vorzeichen.
   *
   * Der Wertebereich ist offen `(−2π, +2π)` — `atan` erreicht `±π/2` nie.
   */
  sweep: (bulge) => 4 * Math.atan(bulge),

  /**
   * Die Stichhöhe `h = (Sehne/2)·|bulge|` — EXAKT, nicht genähert.
   *
   * Immer positiv: gefragt ist „wie weit weicht der Bogen von der Sehne ab",
   * nicht „nach welcher Seite". Die Seite steht im Vorzeichen von `bulge`.
   */
  sagitta: (chordLength, bulge) => (chordLength / 2) * Math.abs(bulge),

  /**
   * Ob die Stichhöhe unter der Diskretisierungstoleranz bleibt.
   *
   * DIE SCHRANKE KOMMT AUS DER TOLERANZ, NICHT AUS EINEM EPSILON. Ein festes
   * Epsilon auf `bulge` wäre längenblind — derselbe Wert ist auf 5 mm Sehne
   * harmlos und auf 2 m Sehne sichtbar. Dieselbe Figur wie die Knickschranke
   * aus ADR 0032: eine Konstante statt zweier, und die eine ist bereits
   * begründet.
   */
  isStraight: (chordLength, bulge, tolerance) =>
    Bulge.sagitta(chordLength, bulge) <= tolerance,

  /**
   * Ob `toPolyline` diese Wölbung TRÄGT — die Frage vor dem Wurf.
   *
   * TOTAL UND OHNE AUSNAHME, und genau dafür gibt es sie: `toArc` und
   * `toPolyline` brechen bei einer unbrauchbaren Zahl eine Vorbedingung und
   * WERFEN. Wer total bleiben muss — die Umriss-Ableitung des Querschnitts —
   * fragt vorher und liest ein `false` als Gerade.
   *
   * ZWEI SORTEN UNBRAUCHBAR, und beide sind derselbe Befund:
   *
   *   nicht endlich — `NaN` und `±Infinity` haben keinen Öffnungswinkel.
   *   nicht zerlegbar — eine ENDLICHE, aber riesige Wölbung beschreibt einen
   *                     fast vollen Kreis von gewaltigem Radius. `bulge = 10^14`
   *                     auf `100 mm` Sehne verlangt unter `0,05 mm` Toleranz
   *                     rund `10^10` Punkte (`MAX_ARC_SEGMENTS`).
   *
   * Die GERADE ist immer zerlegbar: sie durchläuft `toArc` gar nicht.
   */
  isDiscretisable: (chordLength, bulge, tolerance) => {
    if (!Number.isFinite(bulge)) return false;
    if (Bulge.isStraight(chordLength, bulge, tolerance)) return true;
    return (
      arcSegments(
        radiusOf(chordLength, bulge),
        Bulge.sweep(bulge),
        tolerance,
      ) <= MAX_ARC_SEGMENTS
    );
  },

  /**
   * Der Bogen zwischen zwei Punkten. WIRFT `StraightBulgeError`, wenn
   * `isStraight` — nach einem Bogen zu fragen, wo keiner ist, ist eine
   * gebrochene Vorbedingung und nicht der `undefined`-Kanal des Repos.
   *
   * Beide Kennzahlen fallen ohne Trigonometrie aus `t = bulge` und der
   * Sehnenlänge `c`:
   *
   * ```text
   * R = c·(1 + t²) / (4·|t|)      Radius
   * a = c·(1 − t²) / (4·t)        Abstand Sehnenmitte -> Mittelpunkt,
   *                               VORZEICHENBEHAFTET auf der Linksnormalen
   * ```
   *
   * `a` trägt sein Vorzeichen von selbst: bei `|Δ| > π` wird `t² > 1` und der
   * Mittelpunkt wandert auf die andere Seite der Sehne, bei `t < 0` dreht der
   * Bogen zurück. Ein `Math.sign` steht deshalb nirgends.
   */
  toArc: (p1, p2, bulge, tolerance) => {
    if (!Number.isFinite(bulge)) {
      throw new InvalidArcError(`bulge ${bulge} ist keine endliche Zahl`);
    }

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const chordLength = Math.hypot(dx, dy);
    if (Bulge.isStraight(chordLength, bulge, tolerance)) {
      throw new StraightBulgeError(bulge, chordLength, tolerance);
    }

    const radius = radiusOf(chordLength, bulge);
    const apothem = (chordLength * (1 - bulge ** 2)) / (4 * bulge);

    // Linksnormale der Sehnenrichtung: (dx, dy) um +90° gedreht, normiert.
    const center = Point.make(
      p1.x + dx / 2 - (dy / chordLength) * apothem,
      p1.y + dy / 2 + (dx / chordLength) * apothem,
    );

    return Arc.make(
      center,
      radius,
      Math.atan2(p1.y - center.y, p1.x - center.x),
      Bulge.sweep(bulge),
    );
  },

  /**
   * Die Wölbung eines Bogens: `bulge = tan(Δ/4)`.
   *
   * WIRFT `FullCircleBulgeError` bei `|sweep| >= 2π`, weil `tan(π/2)` in
   * IEEE-754 keine Ausnahme und kein `Infinity` liefert, sondern `1.633e16` —
   * eine still falsche endliche Zahl.
   */
  fromArc: (arc) => {
    if (Math.abs(arc.sweep) >= 2 * Math.PI) {
      throw new FullCircleBulgeError(arc.sweep);
    }
    return Math.tan(arc.sweep / 4);
  },

  /**
   * Die Kante als Punktzug — TOTAL, die gerade Kante wird mitbedient.
   *
   * BEIDE ENDPUNKTE SIND ENTHALTEN, wie bei `Arc.toPolyline` und `Polyline`.
   * Wer Kanten verkettet, lässt den letzten Punkt je Kante fallen — ein
   * `.slice(0, -1)` an einer Stelle. Eine halboffene „Polyline" wäre keine, und
   * der Name löge.
   *
   * DIE TOLERANZ WIRKT ZWEIMAL, und das ist Absicht: sie entscheidet, ob die
   * Kante überhaupt gekrümmt ist, UND wie fein der Bogen zerlegt wird. Eine
   * Modellannahme, nicht zwei.
   *
   * TOTAL HEISST NICHT WURFFREI: eine Wölbung, die `isDiscretisable` verneint,
   * bricht eine Vorbedingung und wirft `InvalidArcError`. Wer total bleiben
   * muss, fragt vorher.
   */
  toPolyline: (p1, p2, bulge, tolerance) => {
    if (Bulge.isStraight(Point.distance(p1, p2), bulge, tolerance)) {
      return { points: [p1, p2] };
    }
    return Arc.toPolyline(Bulge.toArc(p1, p2, bulge, tolerance), { tolerance });
  },
};
