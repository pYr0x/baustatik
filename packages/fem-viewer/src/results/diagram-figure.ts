/**
 * WIE ein Schnittgroessenverlauf aussieht — die zweite Ebene, gespiegelt zu
 * `../symbols/`. WAS wo haengt, steht in `internal-forces.ts`.
 *
 * Sie bleibt in `results/` und wandert NICHT nach `symbols/`, aus demselben
 * Grund, aus dem `model/support-symbols.ts` dort liegt: die Figur hat nirgends
 * ein Gegenstueck. Ein Pfeil zeichnet Last und Reaktion, ein Verlauf zeichnet
 * einen Verlauf.
 *
 * `PolygonSpec`, KEIN NEUES PRIMITIV. Ein eigener Shape braeuchte eine neue
 * Spec-Art in `render-core`, und das Package ist ausdruecklich domaenenfrei
 * („DER SPEC KENNT KEINE DREIECKE"). `polygonConfig` bildet bereits auf
 * `Konva.Line` mit `closed` + `fill` ab.
 *
 * DIE ZERLEGUNG IN ZWEI SORTEN SPECS:
 *
 *   :area:{i}   je VORZEICHEN-LAUF, geschlossen, nur Fuellung
 *   :outline    EINMAL je Stab, offen, nur Strich
 *
 * `area` je Lauf, weil `PolygonSpec` genau EIN `fillColor` hat und die beiden
 * Vorzeichen verschiedene Fuellungen tragen. Der Teilungspunkt ist die lineare
 * Interpolation zwischen benachbarten Abtastpunkten — fuer den GEZEICHNETEN
 * Polygonzug ist das nicht genaehert, sondern exakt: dessen Nulldurchgang IST
 * dieser Punkt. Kein Wurzelsucher, keine neue Solver-API.
 *
 * `outline` dagegen EINMAL je Stab und nicht je Lauf: die Kurve ist stetig, auch
 * wo sie das Vorzeichen wechselt, und ein Farbwechsel mitten in einer stetigen
 * Linie behauptete einen Bruch, der nicht da ist. Der offene Zug zeichnet die
 * senkrechte Flanke an einer Sprungstelle mit — dort stehen zwei Abtastpunkte
 * mit gleichem `x` (`internalForcesAlong`), und die Flanke faellt geschenkt an.
 */

import {
  type Line,
  type LineFrame,
  Point,
  Vector,
} from '@baustatik/fem-geometry';
import type { PolygonSpec, Spec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { FEMLayer } from '../layers';
import { forceLabelText, type LabelStyle, symbolLabelSpec } from '../symbols';

/** Eine Abtaststelle: die Stelle auf der Stabachse und der Wert dort. */
export interface DiagramSample {
  /** Lokale Stelle [m], 0..L, ab dem Anfangsknoten. */
  readonly x: number;
  /** `N`, `V` oder `M` an dieser Stelle, MIT Vorzeichen. */
  readonly value: number;
}

/** Der aufgeloeste Look einer Schnittgroesse — ohne zu wissen, welcher. */
export interface DiagramLook {
  readonly strokeColor: string;
  readonly strokeWidthPx: number;
  readonly positiveFillColor: string;
  readonly negativeFillColor: string;
  readonly label: LabelStyle;
}

/** EIN Verlauf an EINEM Stab, fertig ausgemessen. */
export interface DiagramFigure {
  /** `diagram:{beamId}:{N|V|M}` — die Teile haengen ihre Rolle hinten an. */
  readonly id: string;
  readonly layer: FEMLayer;
  /** Die Stabachse, `p1` am Anfangsknoten. Sie IST die Nulllinie. */
  readonly axis: Line;
  /** `ez` ist die Auftragsrichtung: ein positiver Wert liegt auf der +ez-Seite. */
  readonly frame: LineFrame;
  /** Aufsteigend nach `x`; an einer Sprungstelle zweimal dasselbe `x`. */
  readonly samples: readonly DiagramSample[];
  /** Die Bezugsgroesse ueber ALLE Staebe, `> 0`. */
  readonly reference: number;
  /** Hoehe des Bezugswerts [m] — ein Weltmass (ADR 0050). */
  readonly ordinateM: number;
  /** Ueberhoehung, `> 0`. */
  readonly exaggeration: number;
  /** `kN` oder `kNm`. */
  readonly unit: string;
}

/**
 * Die Ordinate an einer Stelle, in Metern entlang `ez`.
 *
 * GESCHRIEBEN WIE IN ADR 0050 — erst normieren, dann skalieren. Andersherum
 * (`value * (ordinateM / reference)`) verfehlte der betragsgroesste Wert seine
 * volle Hoehe um ein Rundungsbit, und genau darauf zielt die Gegenprobe.
 */
function offsetOf(figure: DiagramFigure, value: number): number {
  return (value / figure.reference) * figure.ordinateM * figure.exaggeration;
}

/** Der Punkt auf der Stabachse bei `x`. */
function basePoint(figure: DiagramFigure, x: number): Point {
  return Point.translate(figure.axis.p1, Vector.scale(figure.frame.ex, x));
}

/** Der Punkt auf der Kurve. Bei Wert 0 faellt er mit `basePoint` zusammen. */
function curvePoint(figure: DiagramFigure, sample: DiagramSample): Point {
  const base = basePoint(figure, sample.x);
  if (sample.value === 0) return base;
  return Point.translate(
    base,
    Vector.scale(figure.frame.ez, offsetOf(figure, sample.value)),
  );
}

/**
 * Die Auftragsseite eines Wertes als blanke Richtung.
 *
 * `-0` wird zu `0` geglaettet, wie in `point-force.ts` und aus demselben Grund:
 * `ez` eines waagerechten Stabs ist `(-0, 1)`, und ein `-0` in einem Spec ist
 * nur Laerm — beim Vergleich zweier Bilder faellt es auf, im Bild nie.
 */
function sideOf(frame: LineFrame, value: number): Vector {
  const sign = Math.sign(value);
  const clean = (component: number): number => {
    const product = component * sign;
    return product === 0 ? 0 : product;
  };
  return Vector.make(clean(frame.ez.dx), clean(frame.ez.dz));
}

/** Die Nullstelle zwischen zwei Abtastpunkten mit verschiedenem Vorzeichen. */
function zeroBetween(a: DiagramSample, b: DiagramSample): DiagramSample {
  const t = Math.abs(a.value) / (Math.abs(a.value) + Math.abs(b.value));
  return { x: a.x + t * (b.x - a.x), value: 0 };
}

/**
 * Der Verlauf, an seinen Nulldurchgaengen zerlegt.
 *
 * Eine exakte 0 MITTEN in einem Lauf teilt ihn nicht — die Kurve beruehrt die
 * Achse dort nur. Geteilt wird erst, wenn ein Vorzeichen auf das ANDERE trifft;
 * liegt eine 0 dazwischen, ist sie selbst der Teilungspunkt und wird nicht
 * verdoppelt.
 */
function signRuns(
  samples: readonly DiagramSample[],
): readonly (readonly DiagramSample[])[] {
  const runs: DiagramSample[][] = [];
  let current: DiagramSample[] = [];
  let sign = 0;

  for (const sample of samples) {
    const next = Math.sign(sample.value);
    const previous = current[current.length - 1];

    if (next !== 0 && sign !== 0 && next !== sign && previous !== undefined) {
      const cut =
        previous.value === 0 ? previous : zeroBetween(previous, sample);
      if (cut !== previous) current.push(cut);
      runs.push(current);
      current = [cut];
    }

    current.push(sample);
    if (next !== 0) sign = next;
  }

  if (current.length > 0) runs.push(current);
  return runs;
}

/** Zwei aufeinanderfolgende identische Punkte sind im Polygon nur Laerm. */
function withoutRepeats(points: readonly Point[]): readonly Point[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return (
      previous === undefined || previous.x !== point.x || previous.z !== point.z
    );
  });
}

/**
 * Die gefuellte Flaeche eines Laufs — NUR `fillColor`, kein Strich.
 *
 * Die Transparenz steckt in der FARBE (8-stelliges Hex): `PolygonSpec` hat kein
 * `opacity`, und eines haette auch den Umriss mitgeblasst, der gerade deckend
 * sein soll.
 */
function filledSpec(
  figure: DiagramFigure,
  part: string,
  points: readonly Point[],
  fillColor: string,
): PolygonSpec {
  return {
    kind: 'polygon',
    id: `${figure.id}:${part}`,
    layer: figure.layer,
    points: points.map((point) => worldPoint(point.x, point.z)),
    closed: true,
    fillColor,
  };
}

/**
 * Der Umriss — NUR Strich, deckend, und AN BEIDEN ENDEN ZUR ACHSE GESCHLOSSEN.
 *
 * Der Zug beginnt und endet auf der STABACHSE, nicht auf der Kurve: sonst fehlte
 * die senkrechte Schlusskante dort, wo der Verlauf am Stabende einen Wert hat —
 * eine konstante Normalkraft stuende als offener waagerechter Strich da statt als
 * Rechteck, und am eingespannten Ende fehlte der Strich vom Stab zum
 * Stuetzmoment. Wo der Wert am Ende 0 ist, faellt der Achspunkt mit dem
 * Kurvenpunkt zusammen und `withoutRepeats` nimmt ihn wieder heraus.
 *
 * OFFEN und nicht geschlossen: die Schlusskante zurueck ueber die Achse zeichnete
 * die Nulllinie ein zweites Mal — dort liegt bereits der Stab.
 */
function outlineSpec(
  figure: DiagramFigure,
  points: readonly Point[],
  look: DiagramLook,
): PolygonSpec {
  return {
    kind: 'polygon',
    id: `${figure.id}:outline`,
    layer: figure.layer,
    points: points.map((point) => worldPoint(point.x, point.z)),
    closed: false,
    strokeColor: look.strokeColor,
    // Wie jede Strichstaerke ungeteilt: der Adapter zeichnet in Screen-Pixeln.
    strokeWidth: look.strokeWidthPx,
  };
}

/**
 * Ein Vorzeichen-Lauf als gefuellte Flaeche: Achse hin, Kurve zurueck.
 *
 * Ein durchgehend exakt `0`-Lauf bekommt KEINE Flaeche — sie waere ein Strich
 * auf der Achse, und ein Strich ist kein Bild (dieselbe Regel wie beim
 * Lastpolygon der Hoehe 0).
 */
function areaSpec(
  figure: DiagramFigure,
  run: readonly DiagramSample[],
  index: number,
  look: DiagramLook,
): PolygonSpec | undefined {
  const first = run[0];
  const last = run[run.length - 1];
  if (first === undefined || last === undefined) return undefined;

  const peak = run.find((sample) => sample.value !== 0);
  if (peak === undefined) return undefined;

  const points = withoutRepeats([
    basePoint(figure, first.x),
    ...run.map((sample) => curvePoint(figure, sample)),
    basePoint(figure, last.x),
  ]);

  return filledSpec(
    figure,
    `area:${index}`,
    points,
    peak.value > 0 ? look.positiveFillColor : look.negativeFillColor,
  );
}

/** Der groesste und der kleinste Wert des Verlaufs, in einem Durchlauf. */
function extremes(samples: readonly DiagramSample[]): {
  max: number;
  min: number;
} {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const { value } of samples) {
    if (value > max) max = value;
    if (value < min) min = value;
  }
  return { max, min };
}

/**
 * Die Extremwert-Labels.
 *
 * BESCHRIFTET WIRD DAS POSITIVE MAXIMUM, WENN ES POSITIV IST, und das negative
 * Minimum, wenn es negativ ist — nie beide Enden einer durchgehend positiven
 * Kurve, denn deren Minimum ist keine Aussage ueber den Verlauf, sondern ueber
 * seinen Rand.
 *
 * PLATEAU OHNE TOLERANZ: wird ein Wert an mehreren Stellen angenommen, bekommen
 * die ERSTE und die LETZTE ein Label. Eine konstante Normalkraft ist `N = -e[0]`
 * an jeder Station BITGLEICH, die Regel greift also genau dort, wo sie soll
 * (`x = 0` und `x = L`) — und bei einer Parabel nie.
 *
 * ANKER ist der Kopf der Ordinate, `direction = sign(K) * ez`. Damit liegt das
 * Label immer AUSSERHALB der Flaeche. KEIN Marker: die Lastsymbole setzen einen,
 * weil ihre Figur den Stab wegen `forceGapPx` nicht beruehrt — die
 * Diagrammflaeche beruehrt ihn, ihre Schlusskante IST die Achse.
 */
function labelSpecs(
  figure: DiagramFigure,
  vp: Viewport,
  look: DiagramLook,
): readonly Spec[] {
  const { max, min } = extremes(figure.samples);
  const specs: Spec[] = [];

  for (const [part, extreme] of [
    ['max', max],
    ['min', min],
  ] as const) {
    if (part === 'max' ? !(extreme > 0) : !(extreme < 0)) continue;

    const hits = figure.samples.filter((sample) => sample.value === extreme);
    const first = hits[0];
    const last = hits[hits.length - 1];
    if (first === undefined || last === undefined) continue;
    const chosen = first === last ? [first] : [first, last];

    for (const [index, sample] of chosen.entries()) {
      specs.push(
        symbolLabelSpec({
          id: `${figure.id}:${part}:${index}:label`,
          layer: figure.layer,
          // MIT Vorzeichen — anders als beim Lastpfeil, wo das Vorzeichen im
          // Bild bereits aufgebraucht ist. Hier ist es Teil der Zahl.
          // `forceLabelText` formatiert bloss; die Einheit kommt mit der Figur.
          text: forceLabelText(sample.value, figure.unit),
          anchor: curvePoint(figure, sample),
          direction: sideOf(figure.frame, sample.value),
          viewport: vp,
          style: look.label,
        }),
      );
    }
  }

  return specs;
}

export function diagramFigureSpecs(
  figure: DiagramFigure,
  vp: Viewport,
  look: DiagramLook,
): readonly Spec[] {
  // Unter drei Punkten gibt es keinen Zug — und `PolygonSpec` verlangt sie auch.
  // Erreichbar ist das nur am Stab der Laenge 0, wo `internalForcesAlong` eine
  // einzige Station liefert; dort gibt es keine Achse, auf der man auftragen
  // koennte. Gezeichnet wird dann nichts, wie bei jeder entarteten Figur.
  if (figure.samples.length < 3) return [];

  const specs: Spec[] = [];

  for (const [index, run] of signRuns(figure.samples).entries()) {
    const area = areaSpec(figure, run, index, look);
    if (area !== undefined) specs.push(area);
  }

  const first = figure.samples[0] as DiagramSample;
  const last = figure.samples[figure.samples.length - 1] as DiagramSample;

  // Der Umriss NACH den Flaechen: innerhalb eines Bandes gilt die
  // Array-Reihenfolge, und der Strich gehoert ueber die Fuellung.
  specs.push(
    outlineSpec(
      figure,
      withoutRepeats([
        basePoint(figure, first.x),
        ...figure.samples.map((sample) => curvePoint(figure, sample)),
        basePoint(figure, last.x),
      ]),
      look,
    ),
    ...labelSpecs(figure, vp, look),
  );

  return specs;
}
