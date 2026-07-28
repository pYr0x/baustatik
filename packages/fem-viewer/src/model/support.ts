/**
 * AUFLAGER -> Symbol. Diese Datei beantwortet, WELCHES Symbol ein `NodeSupport`
 * bekommt und wie es am Knoten haengt; wie das Symbol aussieht, steht in
 * `support-symbols.ts`.
 *
 * Die Trennung ist dieselbe wie zwischen `loads/node-loads.ts` und
 * `loads/point-force.ts`: ein neuer Auflagerfall beruehrt nur die Zuordnung
 * hier, ein geaendertes Symbol nur die Geometrie dort.
 *
 * Das Auflagersymbol ist SCREEN-KONSTANT. Geometrie und Translation werden
 * deshalb mit demselben Faktor in Weltkoordinaten umgerechnet — ihr Abstand
 * zueinander und ihre Proportionen bleiben beim Zoomen gleich.
 */

import type { NodeSupport } from '@baustatik/fem';
import type { GroupSpec, ShapeSpec } from '@baustatik/render-core';
import { worldPoint } from '@baustatik/viewport-2d';

import { UnsupportedSupportError } from '../errors';
import {
  clampSymbol,
  guidedClampSymbol,
  pinnedSymbol,
  rollerSymbol,
  rotationOnlySymbol,
  type SupportMetrics,
  type SymbolContext,
  unsupportedSymbol,
} from './support-symbols';

interface SupportSpecOptions {
  readonly support: NodeSupport;
  readonly position: {
    readonly x: number;
    readonly z: number;
  };
  readonly scale: number;
  readonly color: string;
}

/** Wie das Symbol am Knoten haengt — nicht, woraus es besteht. */
interface SupportSymbolDefinition {
  readonly translationPx: {
    readonly x: number;
    readonly y: number;
  };
  readonly rotationDeg: number;
}

const SYMBOL_SCALE = 0.7;

/**
 * Die Rohmasse in Screen-Pixeln. Sie stehen beisammen, weil sie aufeinander
 * abgestimmt sind: das Dreieck ist so hoch wie breit, die Bahn liegt eine
 * Dreieckshoehe plus etwas darunter.
 */
const RADIUS_PX = 10;
const HALF_WIDTH_PX = 30;
const TRIANGLE_HEIGHT_PX = 30;
const GROUND_OFFSET_PX = 40;

/**
 * Beim Gelenklager sitzt der Kreismittelpunkt einen Radius UNTER dem Knoten,
 * damit der Kreis den Knoten beruehrt statt ihn zu verschlucken.
 */
const HINGED_OFFSET_PX = { x: 0, y: RADIUS_PX * SYMBOL_SCALE };

/** Beim eingespannten Auflager reicht die halbe Verschiebung. */
const CLAMPED_OFFSET_PX = { x: 0, y: 5 * SYMBOL_SCALE };

function symbolDefinition(support: NodeSupport): SupportSymbolDefinition {
  const { ux, uz, phiY } = support;

  if (
    (ux !== 'fixed' && ux !== 'free') ||
    (uz !== 'fixed' && uz !== 'free') ||
    (phiY !== 'fixed' && phiY !== 'free')
  ) {
    throw new UnsupportedSupportError(support.id, ux, uz, phiY);
  }

  // Nur EINE Drehung, und nur fuer den einen Fall: haelt das Auflager quer zur
  // Zeichnung (ux fixed, uz frei), steht dasselbe Symbol um 90 Grad gekippt.
  const rotationDeg = ux === 'fixed' && uz === 'free' ? 90 : 0;

  if (phiY === 'free') {
    return { translationPx: HINGED_OFFSET_PX, rotationDeg };
  }

  // Das Symbol ohne gehaltene Verschiebung sitzt MITTIG auf dem Knoten: sein
  // Kasten umschliesst ihn, statt unter ihm zu haengen.
  const isFullyFree = ux === 'free' && uz === 'free';
  return {
    translationPx: isFullyFree ? { x: 0, y: 0 } : CLAMPED_OFFSET_PX,
    rotationDeg,
  };
}

/** Welches Symbol dieser Auflagerfall bekommt. */
function symbolChildren(support: NodeSupport, ctx: SymbolContext): ShapeSpec[] {
  const isFullyFree = support.ux === 'free' && support.uz === 'free';
  // Genau eine der beiden Verschiebungen gehalten — das Rollenlager.
  const isSingleFree = support.ux !== support.uz;

  if (support.phiY === 'free') {
    if (isFullyFree) return unsupportedSymbol();
    return isSingleFree ? rollerSymbol(ctx) : pinnedSymbol(ctx);
  }

  if (isFullyFree) return rotationOnlySymbol(ctx);
  return isSingleFree ? guidedClampSymbol(ctx) : clampSymbol(ctx);
}

export function supportSpec({
  support,
  position,
  scale,
  color,
}: SupportSpecOptions): GroupSpec {
  const id = `support:${support.id}`;
  const definition = symbolDefinition(support);

  // Die EINZIGE Division durch scale. Alles, was ein Symbol zeichnet, kommt
  // hierdurch — deshalb kann kein Symbol sie vergessen.
  const metrics: SupportMetrics = {
    radius: (RADIUS_PX * SYMBOL_SCALE) / scale,
    halfWidth: (HALF_WIDTH_PX * SYMBOL_SCALE) / scale,
    triangleHeight: (TRIANGLE_HEIGHT_PX * SYMBOL_SCALE) / scale,
    groundOffset: (GROUND_OFFSET_PX * SYMBOL_SCALE) / scale,
  };

  return {
    kind: 'group',
    id,
    layer: 'supports',
    position: worldPoint(position.x, position.z),
    translation: worldPoint(
      definition.translationPx.x / scale,
      definition.translationPx.y / scale,
    ),
    rotationDeg: definition.rotationDeg,
    children: symbolChildren(support, { id, color, metrics }),
  };
}
