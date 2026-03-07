import {
  type ScreenPoint,
  screenPoint,
  screenToWorld,
  type Viewport,
  type WorldPoint,
} from '@baustatik/render-core';
import type Konva from 'konva';

export function pointerScreenToWorld(
  pointer: ScreenPoint,
  vp: Viewport,
): WorldPoint {
  return screenToWorld(pointer, vp);
}

export function getStagePointerWorld(
  stage: Konva.Stage,
  vp: Viewport,
): WorldPoint | null {
  const pointer = stage.getPointerPosition();
  if (pointer === null) {
    return null;
  }

  return pointerScreenToWorld(screenPoint(pointer.x, pointer.y), vp);
}
