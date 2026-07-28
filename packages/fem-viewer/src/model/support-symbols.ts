/**
 * WIE ein Auflagersymbol aussieht — die zweite Ebene unter `support.ts`.
 *
 * Jede Funktion hier liefert die Kinder EINER `GroupSpec` in LOKALEN
 * Koordinaten: der Ursprung ist der Knoten, die Gruppe traegt Position,
 * Translation und Drehung. Ein Symbol muss deshalb nur wissen, wie es um den
 * Nullpunkt herum aussieht — nicht, wo es steht oder wie herum es liegt.
 *
 * Alle Masse kommen als `SupportMetrics` fertig herein, bereits durch die
 * Viewport-Skalierung geteilt. Die Division steht damit an genau einer Stelle
 * (`support.ts`), und kein Symbol kann sie vergessen.
 */

import type { ShapeSpec } from '@baustatik/render-core';
import { worldPoint } from '@baustatik/viewport-2d';

/** Die Masse eines Auflagersymbols, bereits in Weltkoordinaten. */
export interface SupportMetrics {
  /** Radius des Gelenkkreises. */
  readonly radius: number;
  /** Halbe Breite von Dreieck, Bahn und Einspannstrich. */
  readonly halfWidth: number;
  /** Hoehe des Dreiecks, vom Knoten nach unten. */
  readonly triangleHeight: number;
  /** Abstand der Bahn (des Bodenstrichs) vom Knoten. */
  readonly groundOffset: number;
}

interface SymbolContext {
  /** ID-Praefix der Gruppe; die Kinder haengen ihren Teilnamen daran. */
  readonly id: string;
  readonly color: string;
  readonly metrics: SupportMetrics;
}

/** Strichbreite der Bahn — duenn, sie ist Beiwerk. */
const GROUND_WIDTH = 2;

/** Strichbreite des Einspannbalkens — dick, er ist die Aussage des Symbols. */
const CLAMP_WIDTH = 10;

function groundLine(
  { id, color, metrics }: SymbolContext,
  part: string,
  offset: number,
): ShapeSpec {
  return {
    kind: 'line',
    id: `${id}:${part}`,
    from: worldPoint(-metrics.halfWidth, offset),
    to: worldPoint(metrics.halfWidth, offset),
    strokeColor: color,
    strokeWidth: GROUND_WIDTH,
  };
}

/** Die um 90 Grad gedrehte Bahn — fuer den Kasten, der nach allen Seiten haelt. */
function verticalGroundLine(
  { id, color, metrics }: SymbolContext,
  part: string,
  offset: number,
): ShapeSpec {
  return {
    kind: 'line',
    id: `${id}:${part}`,
    from: worldPoint(offset, -metrics.halfWidth),
    to: worldPoint(offset, metrics.halfWidth),
    strokeColor: color,
    strokeWidth: GROUND_WIDTH,
  };
}

/** Der dicke Strich der Einspannung, waagrecht durch den Knoten. */
function clampBar({ id, color, metrics }: SymbolContext): ShapeSpec {
  return {
    kind: 'line',
    id: `${id}:join`,
    from: worldPoint(-metrics.halfWidth, 0),
    to: worldPoint(metrics.halfWidth, 0),
    strokeColor: color,
    strokeWidth: CLAMP_WIDTH,
  };
}

/** Kreis und Dreieck — der gemeinsame Koerper aller Gelenklager. */
function hingedBody(ctx: SymbolContext): ShapeSpec[] {
  const { id, color, metrics } = ctx;
  return [
    {
      kind: 'circle',
      id: `${id}:joint`,
      center: worldPoint(0, 0),
      radius: metrics.radius,
      fillColor: color,
    },
    {
      kind: 'polygon',
      id: `${id}:triangle`,
      points: [
        worldPoint(0, 0),
        worldPoint(metrics.halfWidth, metrics.triangleHeight),
        worldPoint(-metrics.halfWidth, metrics.triangleHeight),
      ],
      closed: true,
      fillColor: color,
    },
  ];
}

/**
 * FESTES GELENKLAGER — beide Verschiebungen gehalten, Verdrehung frei.
 * Kreis und Dreieck, ohne Bahn: es kann sich nirgendwohin bewegen.
 */
export function pinnedSymbol(ctx: SymbolContext): ShapeSpec[] {
  return hingedBody(ctx);
}

/**
 * ROLLENLAGER — eine Verschiebung frei, Verdrehung frei. Wie das feste
 * Gelenklager, aber mit der Bahn darunter, auf der es laeuft.
 */
export function rollerSymbol(ctx: SymbolContext): ShapeSpec[] {
  return [
    ...hingedBody(ctx),
    groundLine(ctx, 'ground', ctx.metrics.groundOffset),
  ];
}

/**
 * EINSPANNUNG — alles gehalten. Nur der dicke Strich; eine Bahn waere falsch,
 * hier bewegt sich nichts.
 */
export function clampSymbol(ctx: SymbolContext): ShapeSpec[] {
  return [clampBar(ctx)];
}

/**
 * GLEITENDE EINSPANNUNG — Verdrehung gehalten, eine Verschiebung frei. Der
 * Einspannstrich, und dicht darunter die Bahn, auf der er gleitet: bei einem
 * VIERTEL des sonstigen Abstands, weil der dicke Strich sonst mit der Bahn
 * einen Zwischenraum aufreisst, den man fuer ein zweites Symbol haelt.
 */
export function guidedClampSymbol(ctx: SymbolContext): ShapeSpec[] {
  return [
    clampBar(ctx),
    groundLine(ctx, 'ground', ctx.metrics.groundOffset / 4),
  ];
}

/**
 * NUR DIE VERDREHUNG GEHALTEN — beide Verschiebungen frei. Der seltene Fall,
 * und der einzige, der einen Kasten bekommt: das Symbol muss zeigen, dass sich
 * der Knoten in BEIDE Richtungen bewegen darf, also stehen Bahnen auf allen
 * vier Seiten. Der Einspannstrich kommt zuletzt, damit er obenauf liegt.
 */
export function rotationOnlySymbol(ctx: SymbolContext): ShapeSpec[] {
  const { id, color, metrics } = ctx;
  return [
    {
      kind: 'rectangle',
      id: `${id}:rectangle`,
      topLeft: worldPoint(-metrics.halfWidth, -metrics.halfWidth),
      width: metrics.halfWidth * 2,
      height: metrics.halfWidth * 2,
      fillColor: color,
    },
    groundLine(ctx, 'ground1', metrics.groundOffset),
    groundLine(ctx, 'ground2', -metrics.groundOffset),
    verticalGroundLine(ctx, 'ground3', -metrics.groundOffset),
    verticalGroundLine(ctx, 'ground4', metrics.groundOffset),
    clampBar(ctx),
  ];
}

/**
 * KEIN SYMBOL — weder Verschiebung noch Verdrehung gehalten. Ein `NodeSupport`,
 * der nichts haelt, ist kein Auflager; die leere Gruppe bleibt trotzdem stehen,
 * damit der Renderer sie beim Umschalten patchen statt neu bauen kann.
 */
export function unsupportedSymbol(): ShapeSpec[] {
  return [];
}

export type { SymbolContext };
