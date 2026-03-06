import type { ScreenPoint, Viewport } from '@baustatik/render-core';

export function panViewport(
  _vp: Viewport,
  _deltaX: number,
  _deltaY: number,
): Viewport {
  throw new Error('TODO: panViewport not implemented');
}

export function zoomViewportAt(
  _vp: Viewport,
  _factor: number,
  _anchor: ScreenPoint,
): Viewport {
  throw new Error('TODO: zoomViewportAt not implemented');
}
