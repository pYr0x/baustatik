import type { ScreenPoint, Viewport, WorldPoint } from '@baustatik/render-core';

export function worldToKonvaPoint(_p: WorldPoint, _vp: Viewport): ScreenPoint {
  throw new Error('TODO: worldToKonvaPoint not implemented');
}

export function worldPolylineToKonvaPoints(
  _points: readonly WorldPoint[],
  _vp: Viewport,
): number[] {
  throw new Error('TODO: worldPolylineToKonvaPoints not implemented');
}

export function worldPolygonToKonvaPoints(
  _points: readonly WorldPoint[],
  _vp: Viewport,
): number[] {
  throw new Error('TODO: worldPolygonToKonvaPoints not implemented');
}

export function worldPolylineToKonvaLineProps(
  _points: readonly WorldPoint[],
  _vp: Viewport,
): { readonly points: number[] } {
  throw new Error('TODO: worldPolylineToKonvaLineProps not implemented');
}

export function worldPolygonToKonvaLineProps(
  _points: readonly WorldPoint[],
  _vp: Viewport,
): { readonly points: number[]; readonly closed: true } {
  throw new Error('TODO: worldPolygonToKonvaLineProps not implemented');
}
