import type { NodeSupport } from '@baustatik/fem';
import type { GroupSpec, ShapeSpec } from '@baustatik/render-core';
import { worldPoint } from '@baustatik/viewport-2d';

import { UnsupportedSupportError } from './errors';

interface SupportSpecOptions {
  readonly support: NodeSupport;
  readonly position: {
    readonly x: number;
    readonly z: number;
  };
  readonly scale: number;
  readonly color: string;
}

interface SupportSymbolDefinition {
  readonly translationPx: {
    readonly x: number;
    readonly y: number;
  };
  readonly rotationDeg: number;
}

const SYMBOL_SCALE = 0.7;

// Mittelpunkt des Kreises liegt einen Radius unterhalb des Knotens. Offset und
// Geometrie gehoeren gemeinsam zur Definition dieses Auflagersymbols.
const PINNED_SUPPORT: SupportSymbolDefinition = {
  translationPx: { x: 0, y: 10 * SYMBOL_SCALE },
  rotationDeg: 0,
};

function symbolDefinition(support: NodeSupport): SupportSymbolDefinition {
  const { ux, uz, phiY } = support;

  if (
    (ux !== 'fixed' && ux !== 'free') ||
    (uz !== 'fixed' && uz !== 'free') ||
    (phiY !== 'fixed' && phiY !== 'free')
  ) {
    throw new UnsupportedSupportError(support.id, ux, uz, phiY);
  }

  const rotationDeg = ux === 'fixed' && uz === 'free' ? 90 : 0;

  if (phiY === 'free') {
    return rotationDeg === 90
      ? { translationPx: { x: 0, y: 10 * SYMBOL_SCALE }, rotationDeg }
      : PINNED_SUPPORT;
  }

  const y = ux === 'free' && uz === 'free' ? 0 : 5 * SYMBOL_SCALE;
  return {
    translationPx: { x: 0, y },
    rotationDeg,
  };
}

export function supportSpec({
  support,
  position,
  scale,
  color,
}: SupportSpecOptions): GroupSpec {
  const id = `support:${support.id}`;
  const definition = symbolDefinition(support);

  // Das Auflagersymbol ist screen-konstant. Deshalb werden seine Geometrie und
  // seine Translation mit demselben Faktor in Weltkoordinaten umgerechnet.
  const radius = (10 * SYMBOL_SCALE) / scale;
  const halfWidth = (30 * SYMBOL_SCALE) / scale;
  const triangleHeight = (30 * SYMBOL_SCALE) / scale;
  const groundOffset = (40 * SYMBOL_SCALE) / scale;
  const children: ShapeSpec[] = [];

  const isFullyFree = support.ux === 'free' && support.uz === 'free';
  const isSingleFree = support.ux !== support.uz;

  if (support.phiY === 'free') {
    if (!isFullyFree) {
      children.push({
        kind: 'circle',
        id: `${id}:joint`,
        center: worldPoint(0, 0),
        radius,
        fillColor: color,
      });

      children.push({
        kind: 'polygon',
        id: `${id}:triangle`,
        points: [
          worldPoint(0, 0),
          worldPoint(halfWidth, triangleHeight),
          worldPoint(-halfWidth, triangleHeight),
        ],
        closed: true,
        fillColor: color,
      });

      if (isSingleFree) {
        children.push({
          kind: 'line',
          id: `${id}:ground`,
          from: worldPoint(-halfWidth, groundOffset),
          to: worldPoint(halfWidth, groundOffset),
          strokeColor: color,
          strokeWidth: 2,
        });
      }
    }
  } else if (support.phiY === 'fixed') {
    if (isFullyFree) {
      children.push({
        kind: 'rectangle',
        id: `${id}:rectangle`,
        topLeft: worldPoint(-halfWidth, -halfWidth),
        width: halfWidth * 2,
        height: halfWidth * 2,
        fillColor: color,
      });

      children.push({
        kind: 'line',
        id: `${id}:ground1`,
        from: worldPoint(-halfWidth, groundOffset),
        to: worldPoint(halfWidth, groundOffset),
        strokeColor: color,
        strokeWidth: 2,
      });

      children.push({
        kind: 'line',
        id: `${id}:ground2`,
        from: worldPoint(-halfWidth, -groundOffset),
        to: worldPoint(halfWidth, -groundOffset),
        strokeColor: color,
        strokeWidth: 2,
      });

      children.push({
        kind: 'line',
        id: `${id}:ground3`,
        from: worldPoint(-groundOffset, -halfWidth),
        to: worldPoint(-groundOffset, halfWidth),
        strokeColor: color,
        strokeWidth: 2,
      });

      children.push({
        kind: 'line',
        id: `${id}:ground4`,
        from: worldPoint(groundOffset, -halfWidth),
        to: worldPoint(groundOffset, halfWidth),
        strokeColor: color,
        strokeWidth: 2,
      });
    }

    children.push({
      kind: 'line',
      id: `${id}:join`,
      from: worldPoint(-halfWidth, 0),
      to: worldPoint(halfWidth, 0),
      strokeColor: color,
      strokeWidth: 10,
    });

    if (isSingleFree) {
      children.push({
        kind: 'line',
        id: `${id}:ground`,
        from: worldPoint(-halfWidth, groundOffset / 4),
        to: worldPoint(halfWidth, groundOffset / 4),
        strokeColor: color,
        strokeWidth: 2,
      });
    }
  }

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
    children,
  };
}
