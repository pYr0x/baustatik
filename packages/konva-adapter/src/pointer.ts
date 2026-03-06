import type { ScreenPoint, Viewport, WorldPoint } from '@baustatik/render-core';
import type Konva from 'konva';

export function pointerScreenToWorld(
  _pointer: ScreenPoint,
  _vp: Viewport,
): WorldPoint {
  throw new Error('TODO: pointerScreenToWorld not implemented');
}

export function getStagePointerWorld(
  _stage: Konva.Stage,
  _vp: Viewport,
): WorldPoint | null {
  throw new Error('TODO: getStagePointerWorld not implemented');
}
