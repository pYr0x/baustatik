import { type WorldPoint, worldPoint } from '@baustatik/render-core';
import type {
  ArcType as SectionArc,
  PointType as SectionPoint,
  PolygonType as SectionPolygon,
  PolylineType as SectionPolyline,
} from '@baustatik/section-geometry';
import { Arc } from '@baustatik/section-geometry';

import { InvalidSectionPointError, InvalidSectionShapeError } from './errors';

function validateSectionPoint(point: SectionPoint): void {
  if (!Number.isFinite(point.y)) {
    throw new InvalidSectionPointError('y muss eine endliche Zahl sein');
  }
  if (!Number.isFinite(point.z)) {
    throw new InvalidSectionPointError('z muss eine endliche Zahl sein');
  }
}

function validatePointsArray(
  value: unknown,
  name: string,
): asserts value is SectionPoint[] {
  if (!Array.isArray(value)) {
    throw new InvalidSectionShapeError(`${name}.points muss ein Array sein`);
  }
}

function mapSectionPointsToWorld(
  points: readonly SectionPoint[],
): WorldPoint[] {
  const mapped: WorldPoint[] = [];
  for (const point of points) {
    mapped.push(sectionPointToWorld(point));
  }
  return mapped;
}

function normalizeSignedZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function normalizeTiny(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}

export function sectionPointToWorld(p: SectionPoint): WorldPoint {
  validateSectionPoint(p);
  return worldPoint(
    normalizeTiny(normalizeSignedZero(p.y)),
    normalizeTiny(normalizeSignedZero(p.z)),
  );
}

export function sectionPolylineToWorldPoints(
  pl: SectionPolyline,
): WorldPoint[] {
  validatePointsArray(pl.points, 'polyline');
  return mapSectionPointsToWorld(pl.points);
}

export function sectionPolygonToWorldPoints(pg: SectionPolygon): WorldPoint[] {
  validatePointsArray(pg.points, 'polygon');
  return mapSectionPointsToWorld(pg.points);
}

export function sectionArcStartPointToWorld(arc: SectionArc): WorldPoint {
  return sectionPointToWorld(Arc.startPoint(arc));
}

export function sectionArcMidPointToWorld(arc: SectionArc): WorldPoint {
  return sectionPointToWorld(Arc.midpoint(arc));
}

export function sectionArcEndPointToWorld(arc: SectionArc): WorldPoint {
  return sectionPointToWorld(Arc.endPoint(arc));
}
