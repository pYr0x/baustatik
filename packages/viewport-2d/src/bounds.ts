import { screenToWorld } from './core';
import { InvalidSizeError } from './errors';
import type { Size, Viewport, WorldBounds } from './types';

function validateSize(s: Size): void {
  if (!Number.isFinite(s.width)) {
    throw new InvalidSizeError('width muss eine endliche Zahl sein');
  }
  if (!Number.isFinite(s.height)) {
    throw new InvalidSizeError('height muss eine endliche Zahl sein');
  }
  if (s.width <= 0) {
    throw new InvalidSizeError('width muss > 0 sein');
  }
  if (s.height <= 0) {
    throw new InvalidSizeError('height muss > 0 sein');
  }
}

export function size(width: number, height: number): Size {
  validateSize({ width, height });
  return { width, height };
}

// Sichtbarer Weltausschnitt eines Viewports auf einer Zeichenflaeche.
// Da scale > 0 erzwungen ist, gilt automatisch minU <= maxU und minV <= maxV.
export function visibleWorldBounds(
  vp: Viewport,
  screenSize: Size,
): WorldBounds {
  validateSize(screenSize);

  const topLeft = screenToWorld({ x: 0, y: 0 }, vp);
  const bottomRight = screenToWorld(
    { x: screenSize.width, y: screenSize.height },
    vp,
  );

  return {
    minU: topLeft.u,
    minV: topLeft.v,
    maxU: bottomRight.u,
    maxV: bottomRight.v,
  };
}
