import {
  InvalidScreenPointError,
  InvalidViewportError,
  InvalidWorldPointError,
} from './errors';
import type { ScreenPoint, Viewport, WorldPoint } from './types';

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function isPositiveNumber(value: number): boolean {
  return value > 0;
}

function validateWorldPoint(point: WorldPoint): void {
  if (!isFiniteNumber(point.u)) {
    throw new InvalidWorldPointError('u muss eine endliche Zahl sein');
  }
  if (!isFiniteNumber(point.v)) {
    throw new InvalidWorldPointError('v muss eine endliche Zahl sein');
  }
}

function validateScreenPoint(point: ScreenPoint): void {
  if (!isFiniteNumber(point.x)) {
    throw new InvalidScreenPointError('x muss eine endliche Zahl sein');
  }
  if (!isFiniteNumber(point.y)) {
    throw new InvalidScreenPointError('y muss eine endliche Zahl sein');
  }
}

function validateViewport(vp: Viewport): void {
  validateScreenPoint(vp.origin);
  if (!isFiniteNumber(vp.scale)) {
    throw new InvalidViewportError('scale muss eine endliche Zahl sein');
  }
  if (!isPositiveNumber(vp.scale)) {
    throw new InvalidViewportError('scale muss > 0 sein');
  }
}

export function worldPoint(u: number, v: number): WorldPoint {
  validateWorldPoint({ u, v });
  return { u, v };
}

export function screenPoint(x: number, y: number): ScreenPoint {
  validateScreenPoint({ x, y });
  return { x, y };
}

export function viewport(origin: ScreenPoint, scale: number): Viewport {
  validateViewport({ origin, scale });
  return { origin: { x: origin.x, y: origin.y }, scale };
}

export function worldToScreen(p: WorldPoint, vp: Viewport): ScreenPoint {
  validateWorldPoint(p);
  validateViewport(vp);

  return {
    x: vp.origin.x + p.u * vp.scale,
    y: vp.origin.y + p.v * vp.scale,
  };
}

export function screenToWorld(p: ScreenPoint, vp: Viewport): WorldPoint {
  validateScreenPoint(p);
  validateViewport(vp);

  return {
    u: (p.x - vp.origin.x) / vp.scale,
    v: (p.y - vp.origin.y) / vp.scale,
  };
}

export function worldPointsToFlatArray(
  points: readonly WorldPoint[],
): number[] {
  const flat: number[] = [];
  for (const point of points) {
    validateWorldPoint(point);
    flat.push(point.u, point.v);
  }
  return flat;
}
