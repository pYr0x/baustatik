import {
  type ScreenPoint,
  type Viewport,
  viewport,
} from '@baustatik/render-core';

import { InvalidZoomFactorError } from './errors';

export function panViewport(
  vp: Viewport,
  deltaX: number,
  deltaY: number,
): Viewport {
  return viewport(
    { x: vp.origin.x + deltaX, y: vp.origin.y + deltaY },
    vp.scale,
  );
}

export function zoomViewportAt(
  vp: Viewport,
  factor: number,
  anchor: ScreenPoint,
): Viewport {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new InvalidZoomFactorError('factor muss > 0 und endlich sein');
  }

  const nextScale = vp.scale * factor;
  const worldAtAnchorU = (anchor.x - vp.origin.x) / vp.scale;
  const worldAtAnchorV = (anchor.y - vp.origin.y) / vp.scale;

  const nextOriginX = anchor.x - worldAtAnchorU * nextScale;
  const nextOriginY = anchor.y - worldAtAnchorV * nextScale;

  return viewport({ x: nextOriginX, y: nextOriginY }, nextScale);
}
