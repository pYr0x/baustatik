import {
  type ScreenPoint,
  screenPoint,
  type Viewport,
  type WorldPoint,
  worldToScreen,
} from '@baustatik/render-core';

export function worldToKonvaPoint(p: WorldPoint, vp: Viewport): ScreenPoint {
  const s = worldToScreen(p, vp);
  return screenPoint(s.x, s.y);
}

export function worldPolylineToKonvaPoints(
  points: readonly WorldPoint[],
  vp: Viewport,
): number[] {
  const flat: number[] = [];
  for (const p of points) {
    const s = worldToScreen(p, vp);
    flat.push(s.x, s.y);
  }
  return flat;
}

export function worldPolygonToKonvaPoints(
  points: readonly WorldPoint[],
  vp: Viewport,
): number[] {
  return worldPolylineToKonvaPoints(points, vp);
}

export function worldPolylineToKonvaLineProps(
  points: readonly WorldPoint[],
  vp: Viewport,
): { readonly points: number[] } {
  return { points: worldPolylineToKonvaPoints(points, vp) };
}

export function worldPolygonToKonvaLineProps(
  points: readonly WorldPoint[],
  vp: Viewport,
): { readonly points: number[]; readonly closed: true } {
  return { points: worldPolygonToKonvaPoints(points, vp), closed: true };
}
