import type { WorldPoint } from '@baustatik/viewport-2d';

interface SpecBase {
  readonly id: string; // unique ID, reconcile()
  // Zeichenband (paint band). Welche Namen es gibt und in welcher Reihenfolge
  // sie gemalt werden, legt der Driver fest — render-core bleibt neutral.
  // Baender vergroebern die Array-Reihenfolge: zwischen Baendern gewinnt die
  // Band-Reihenfolge, innerhalb eines Bandes gilt die Array-Reihenfolge.
  readonly layer?: string;
}

interface Stroke {
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeStyle?: 'solid' | 'dashed' | 'dotted';
}

// Gemeinsames Vokabular fuer ALLES, das eine Flaeche hat.
interface Filled {
  readonly fillColor?: string;
}

export interface LineSpec extends SpecBase, Stroke {
  readonly kind: 'line';
  readonly from: WorldPoint;
  readonly to: WorldPoint;
}

export interface CircleSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'circle';
  readonly center: WorldPoint;
  readonly radius: number;
}

export interface PolygonSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'polygon';
  readonly points: readonly WorldPoint[];
  readonly closed: boolean;
}

export interface RectangleSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'rectangle';
  readonly topLeft: WorldPoint;
  readonly width: number;
  readonly height: number;
  readonly cornerRadius?: number[];
}

export interface TriangleSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'triangle';
  readonly center: WorldPoint;
  readonly sideLength: number;
}

/**
 * Gerichtete Strecke mit Kopf am Ende. `tail -> tip` IST die Wirkrichtung:
 * vertauscht zeigt der Pfeil rueckwaerts, und das faellt in keiner Validierung
 * auf. Deshalb heissen die Punkte nicht `from`/`to` wie bei der Linie.
 *
 * `pointerLength`/`pointerWidth` sind Weltgroessen und skalieren mit dem Zoom
 * (wie `CircleSpec.radius`), `strokeWidth` bleibt wie ueberall Screen-Pixel.
 */
export interface ArrowSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'arrow';
  readonly tail: WorldPoint;
  readonly tip: WorldPoint;
  readonly pointerLength: number;
  readonly pointerWidth: number;
}

/**
 * Kreisbogen als STRICH — der gebogene Bruder der Linie, nicht des Kreises.
 *
 * DER NAME trennt zwei Figuren, die viele Bibliotheken beide "Arc" nennen:
 * ein ARCPATH ist ein gebogener Strich mit Strichstaerke, ein RINGSEGMENT ist
 * die von zwei Radien und zwei Boegen begrenzte FLAECHE (Konvas `Arc` ist das
 * zweite). Sie unterscheiden sich nicht in einem Feld, sondern in dem, was sie
 * zeigen — deshalb bekaeme ein Ringsegment eine eigene Spec mit Innen- und
 * Aussenradius und nicht ein `filled`-Flag hier. Bis eine gebraucht wird, gibt
 * es sie nicht; der Name ist reserviert, damit sie nicht doch `ArcSpec` heisst.
 *
 * Ein ArcPath hat entsprechend KEINE Fuellung. Wer eine Flaeche will, nimmt
 * `polygon`; wer den vollen Kreis will, nimmt `circle`.
 *
 * WINKEL in Radiant, gemessen von +u aus und wachsend Richtung +v. Weil v nach
 * unten zeigt, laeuft ein wachsender Winkel auf dem Schirm IM Uhrzeigersinn —
 * `sweepAngle` traegt also das Vorzeichen des Umlaufs: negativ = gegen den
 * Uhrzeigersinn. `radius` ist wie bei `CircleSpec` eine Weltgroesse.
 */
export interface ArcPathSpec extends SpecBase, Stroke {
  readonly kind: 'arcPath';
  readonly center: WorldPoint;
  readonly radius: number;
  readonly startAngle: number;
  /** Ueberstrichener Winkel mit Vorzeichen, 0 < |sweepAngle| < 2π. */
  readonly sweepAngle: number;
}

/**
 * EINE LISTE UNABHAENGIGER LINIEN in einer einzigen Spec — das Primitive fuer
 * ein Drahtgitter.
 *
 * WARUM NICHT `LineSpec` JE KANTE: ein Netz mit einigen tausend Elementen
 * erzeugte ebenso viele Adapter-Knoten, und jede von zwei Elementen geteilte
 * Kante waere doppelt darin. Die indexierte Linienliste haelt beides zusammen: EIN Spec,
 * EINE Zeichenform, jede Kante einmal.
 *
 * FLACHE PUFFER, KEINE `WorldPoint[]`: `points` ist `[u0, v0, u1, v1, …]`,
 * `indices` sind flache Punktindexpaare `[a0, b0, a1, b1, …]`. `ArrayLike`
 * statt `readonly number[]`, damit ein `Float64Array`/`Uint32Array` aus einem
 * Mesher ohne Objekt- oder Kopierlawine durchgereicht werden kann — und
 * trotzdem ein gewoehnliches Array danebensteht.
 *
 * DER SPEC KENNT KEINE DREIECKE. Er weiss nichts von Netzen, Elementtypen oder
 * Querschnitten; wer Elemente hat, rechnet sie selbst zu Kanten um. Damit
 * bleibt das Primitive dort, wo die anderen auch stehen: bei der Zeichenfigur,
 * nicht bei ihrem Anlass.
 *
 * ES GIBT KEINE FUELLUNG, wie beim `arcPath` und aus demselben Grund: ein
 * Linienliste ist ein Strich, keine Flaeche. Zwei getrennte Linien bleiben
 * getrennt — der Adapter verbindet sie nicht.
 */
export interface IndexedLineListSpec extends SpecBase, Stroke {
  readonly kind: 'indexedLineList';
  /** Flach `[u0, v0, u1, v1, …]`. */
  readonly points: ArrayLike<number>;
  /** Flache Punktindexpaare `[a0, b0, a1, b1, …]` in `points`. */
  readonly indices: ArrayLike<number>;
}

/**
 * Waagerechte Beschriftung in einer Box — das erste Primitive mit Text.
 *
 * BESONDERHEIT: seine endgueltige Geometrie kennt erst der Adapter. Wie breit
 * `text` in `fontSize`/`fontFamily` wird, weiss nur, wer messen kann; ein
 * Erzeuger ohne Canvas kann es nicht. Deshalb beschreibt die Spec die Lage
 * nicht als Boxposition, sondern als ANKER plus RICHTUNG: Der Adapter legt den
 * Boxrand im Abstand `gap` auf den Strahl, der bei `anchor` in Richtung
 * `direction` startet, und zentriert die Box auf diesem Strahl.
 *
 * Die Box selbst bleibt achsparallel — `direction` dreht nichts, sie waehlt nur
 * die Seite.
 */
export interface LabelSpec extends SpecBase {
  readonly kind: 'label';
  readonly text: string;
  readonly anchor: WorldPoint;
  /** Richtungsvektor in u/v, kein Punkt. Nur die Richtung zaehlt, nicht die Laenge. */
  readonly direction: WorldPoint;
  /** Weltabstand zwischen `anchor` und dem naechsten Boxrand. */
  readonly gap: number;
  readonly fontSize: number;
  /**
   * Pflichtfeld, KEIN Rueckfall auf die Voreinstellung des Renderers: sonst
   * haengen Aussehen und Screenshot-Baseline an der Fontliste der Maschine.
   */
  readonly fontFamily: string;
  readonly textColor: string;
  readonly padding: number;
  readonly backgroundColor: string;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly cornerRadius?: number;
}

export type PrimitiveSpec =
  | LineSpec
  | CircleSpec
  | PolygonSpec
  | RectangleSpec
  | TriangleSpec
  | ArrowSpec
  | ArcPathSpec
  | IndexedLineListSpec
  | LabelSpec;

/**
 * Die Primitives, die auf eine einzelne Zeichenform abbilden. `LabelSpec` faellt
 * heraus: es ist ein Text in einer Box und damit im Renderer zusammengesetzt.
 * Ein `GroupSpec` nimmt deshalb nur diese (siehe `validateSpec`).
 */
export type ShapeSpec = Exclude<PrimitiveSpec, LabelSpec>;

export interface GroupSpec extends SpecBase {
  readonly kind: 'group';
  // Weltposition des Gruppenankers. Der Adapter legt diesen Punkt auf x/y.
  readonly position: WorldPoint;
  // Sichtbare Verschiebung relativ zum Anker. Der Konva-Adapter uebersetzt sie
  // auf die inverse offsetX/offsetY-Semantik von Konva.
  readonly translation: WorldPoint;
  readonly rotationDeg?: number;
  readonly children: readonly ShapeSpec[];
}

export type Spec = PrimitiveSpec | GroupSpec;
