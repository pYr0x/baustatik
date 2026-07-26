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
