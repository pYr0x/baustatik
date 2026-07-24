import { atOrThrow } from '@baustatik/core';
import { Polygon as GeometryPolygon } from '@baustatik/geometry-2d';
import {
  fromXYBoundingBox,
  fromXYPoint,
  toXYLine,
  toXYPoint,
  toXYPolygon,
  toXYVector,
  type XYPolygon,
} from './convert';
import { InvalidPolygonError } from './errors';
import type {
  BoundingBox,
  Line,
  Point,
  Polygon as SectionPolygon,
  Transformable,
} from './types';

/**
 * Schleifenflaeche nach der Gauss'schen Trapezformel, direkt in y/z gerechnet.
 *
 * Vorzeichen: **positiv, wenn der Ring im positiven Drehsinn (+y → +z)
 * umlaeuft** — im Bild rechtsdrehend, weil z nach unten zeigt. Damit zaehlt sie
 * im selben Sinn wie `Vector.angle`, `Vector.cross` und `Arc.sweep`.
 *
 * Bleibt bewusst nativ statt an geometry-2d zu delegieren: seit `convert.ts`
 * orientierungstreu abbildet, ist die dortige Formel rechnerisch dieselbe, und
 * die Windungsregel dieses Packages soll an einer Stelle stehen.
 */
const signedAreaYZ = (points: Point[]): number => {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = atOrThrow(points, i);
    const pj = atOrThrow(points, j);
    area += pi.y * pj.z - pj.y * pi.z;
  }
  return area / 2;
};

const fromXYPolygonNormalized = (polygon: XYPolygon): SectionPolygon =>
  Polygon.make(polygon.points.map(fromXYPoint));

export const Polygon: Transformable<SectionPolygon> & {
  make(points: Point[]): SectionPolygon;
  fromLines(lines: Line[]): SectionPolygon;
  area(polygon: SectionPolygon): number;
  signedArea(points: Point[]): number;
  centroid(polygon: SectionPolygon): Point;
  perimeter(polygon: SectionPolygon): number;
  contains(polygon: SectionPolygon, point: Point): boolean;
  isClockwise(polygon: SectionPolygon): boolean;
  toClockwise(polygon: SectionPolygon): SectionPolygon;
  toCounterClockwise(polygon: SectionPolygon): SectionPolygon;
  intersect(a: SectionPolygon, b: SectionPolygon): SectionPolygon[];
  union(a: SectionPolygon, b: SectionPolygon): SectionPolygon[];
  subtract(a: SectionPolygon, b: SectionPolygon): SectionPolygon[];
  boundingBox(polygon: SectionPolygon): BoundingBox;
} = {
  // Normalisiert auf den positiven Drehsinn (`signedArea >= 0`), passend zu
  // `Vector.angle`/`cross`/`Arc.sweep`. Dadurch ist `signedArea` eines
  // normalisierten Polygons unmittelbar die Flaeche, und spaetere
  // Flaechenmomente kommen ohne Vorzeichenkorrektur heraus.
  make: (points) => {
    if (points.length < 3)
      throw new InvalidPolygonError('weniger als 3 Punkte');
    return signedAreaYZ(points) < 0
      ? { points: [...points].reverse() }
      : { points };
  },

  fromLines: (lines) =>
    fromXYPolygonNormalized(
      GeometryPolygon.fromLines(lines.map((line) => toXYLine(line))),
    ),

  area: (polygon) => Math.abs(signedAreaYZ(polygon.points)),

  signedArea: (points) => signedAreaYZ(points),

  centroid: (polygon) =>
    fromXYPoint(GeometryPolygon.centroid(toXYPolygon(polygon))),

  perimeter: (polygon) => GeometryPolygon.perimeter(toXYPolygon(polygon)),

  contains: (polygon, point) =>
    GeometryPolygon.contains(toXYPolygon(polygon), toXYPoint(point)),

  // "Im Uhrzeigersinn" ist hier die Lesart im Bild (y rechts, z runter) — und
  // die faellt mit dem positiven Drehsinn +y → +z zusammen.
  isClockwise: (polygon) => signedAreaYZ(polygon.points) > 0,

  // Beide setzen eine bestimmte Windung und gehen deshalb bewusst NICHT ueber
  // `Polygon.make`: das normalisiert auf den positiven Drehsinn und wuerde
  // `toCounterClockwise` sofort wieder zurueckdrehen.
  toClockwise: (polygon) =>
    Polygon.isClockwise(polygon)
      ? polygon
      : { points: [...polygon.points].reverse() },

  toCounterClockwise: (polygon) =>
    Polygon.isClockwise(polygon)
      ? { points: [...polygon.points].reverse() }
      : polygon,

  intersect: (a, b) =>
    GeometryPolygon.intersect(toXYPolygon(a), toXYPolygon(b)).map((polygon) =>
      fromXYPolygonNormalized(polygon),
    ),

  union: (a, b) =>
    GeometryPolygon.union(toXYPolygon(a), toXYPolygon(b)).map((polygon) =>
      fromXYPolygonNormalized(polygon),
    ),

  subtract: (a, b) =>
    GeometryPolygon.subtract(toXYPolygon(a), toXYPolygon(b)).map((polygon) =>
      fromXYPolygonNormalized(polygon),
    ),

  boundingBox: (polygon) =>
    fromXYBoundingBox(GeometryPolygon.boundingBox(toXYPolygon(polygon))),

  translate: (polygon, vector) =>
    fromXYPolygonNormalized(
      GeometryPolygon.translate(toXYPolygon(polygon), toXYVector(vector)),
    ),

  rotate: (polygon, angle, origin) =>
    fromXYPolygonNormalized(
      GeometryPolygon.rotate(
        toXYPolygon(polygon),
        angle,
        origin ? toXYPoint(origin) : undefined,
      ),
    ),

  mirror: (polygon, axisP1, axisP2) =>
    fromXYPolygonNormalized(
      GeometryPolygon.mirror(
        toXYPolygon(polygon),
        toXYPoint(axisP1),
        toXYPoint(axisP2),
      ),
    ),
};
