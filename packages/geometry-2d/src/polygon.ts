import { Point } from './point'
import { DiscontinuousLinesError, InvalidPolygonError } from './errors'
import { type BoundingBox, type Transformable } from './types'
import { diff, intersection, union } from 'martinez-polygon-clipping'
import type { Line } from './line'

export type Polygon = { readonly points: Point[] }

type MartinezCoord = [number, number]
type MartinezRing = MartinezCoord[]
type MartinezPoly = MartinezRing[]

const toMartinez = (poly: Polygon): MartinezPoly => {
  const ring: MartinezRing = poly.points.map((p) => [p.x, p.y])
  ring.push(ring[0]!)
  return [ring]
}

const signedArea = (points: Point[]): number => {
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i]!.x * points[j]!.y - points[j]!.x * points[i]!.y
  }
  return area / 2
}

const fromMartinez = (result: unknown): Polygon[] => {
  if (!result || !Array.isArray(result)) return []
  return (result as MartinezPoly[]).flatMap((poly) => {
    const points = poly[0]!.slice(0, -1).map(([x, y]) => Point.make(x!, y!))
    return [Polygon.make(points)]
  })
}

export const Polygon: Transformable<Polygon> & {
  make(points: Point[]): Polygon
  fromLines(lines: Line[]): Polygon
  area(polygon: Polygon): number
  centroid(polygon: Polygon): Point
  perimeter(polygon: Polygon): number
  contains(polygon: Polygon, p: Point): boolean
  isClockwise(polygon: Polygon): boolean
  toClockwise(polygon: Polygon): Polygon
  toCounterClockwise(polygon: Polygon): Polygon
  intersect(a: Polygon, b: Polygon): Polygon[]
  union(a: Polygon, b: Polygon): Polygon[]
  subtract(a: Polygon, b: Polygon): Polygon[]
  boundingBox(polygon: Polygon): BoundingBox
} = {
  make: (points) => {
    if (points.length < 3) throw new InvalidPolygonError('weniger als 3 Punkte')
    return signedArea(points) < 0 ? { points: [...points].reverse() } : { points }
  },

  fromLines: (lines) => {
    if (lines.length < 3) throw new InvalidPolygonError('weniger als 3 Linien fuer ein Polygon noetig')

    const points: Point[] = [lines[0]!.p1]
    for (let i = 0; i < lines.length; i++) {
      if (i > 0 && !Point.equals(points[points.length - 1]!, lines[i]!.p1)) {
        throw new DiscontinuousLinesError(i - 1)
      }
      points.push(lines[i]!.p2)
    }

    if (!Point.equals(points[points.length - 1]!, points[0]!)) {
      throw new InvalidPolygonError('Linien bilden keinen geschlossenen Zug')
    }

    return Polygon.make(points.slice(0, -1))
  },

  area: (poly) => Math.abs(signedArea(poly.points)),

  centroid: (poly) => {
    const n = poly.points.length
    let cx = 0
    let cy = 0
    const a = signedArea(poly.points)

    if (Math.abs(a) < 1e-14) return poly.points[0]!

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const cross = poly.points[i]!.x * poly.points[j]!.y - poly.points[j]!.x * poly.points[i]!.y
      cx += (poly.points[i]!.x + poly.points[j]!.x) * cross
      cy += (poly.points[i]!.y + poly.points[j]!.y) * cross
    }

    return Point.make(cx / (6 * a), cy / (6 * a))
  },

  perimeter: (poly) => {
    const pts = poly.points
    let total = 0
    for (let i = 0; i < pts.length; i++) {
      total += Point.distance(pts[i]!, pts[(i + 1) % pts.length]!)
    }
    return total
  },

  contains: (poly, p) => {
    let inside = false
    const pts = poly.points
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i]!.x
      const yi = pts[i]!.y
      const xj = pts[j]!.x
      const yj = pts[j]!.y
      if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }
    return inside
  },

  isClockwise: (poly) => signedArea(poly.points) < 0,

  toClockwise: (poly) => (Polygon.isClockwise(poly) ? poly : { points: [...poly.points].reverse() }),

  toCounterClockwise: (poly) => (!Polygon.isClockwise(poly) ? poly : { points: [...poly.points].reverse() }),

  intersect: (a, b) => fromMartinez(intersection(toMartinez(a), toMartinez(b))),
  union: (a, b) => fromMartinez(union(toMartinez(a), toMartinez(b))),
  subtract: (a, b) => fromMartinez(diff(toMartinez(a), toMartinez(b))),

  boundingBox: (poly) => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const p of poly.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }

    return { min: Point.make(minX, minY), max: Point.make(maxX, maxY) }
  },

  translate: (poly, v) => ({ points: poly.points.map((p) => Point.translate(p, v)) }),
  rotate: (poly, angle, origin) => ({ points: poly.points.map((p) => Point.rotate(p, angle, origin)) }),
  mirror: (poly, axisP1, axisP2) => {
    const mirrored = poly.points.map((p) => Point.mirror(p, axisP1, axisP2))
    return signedArea(mirrored) < 0 ? { points: [...mirrored].reverse() } : { points: mirrored }
  },
}
