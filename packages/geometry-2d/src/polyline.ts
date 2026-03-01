import { Point } from './point'
import { Vector } from './vector'
import { closestPointOnSegment, type Transformable } from './types'
import { DiscontinuousLinesError, InvalidPolygonError, InvalidPolylineError, OpenPolylineError } from './errors'
import type { Line } from './line'

type PolygonLike = { readonly points: Point[] }

export type Polyline = { readonly points: Point[] }

export const Polyline: Transformable<Polyline> & {
  make(points: Point[]): Polyline
  fromLines(lines: Line[]): Polyline
  length(pl: Polyline): number
  isClosed(pl: Polyline, tolerance?: number): boolean
  toPolygon(pl: Polyline): PolygonLike
  pointAt(pl: Polyline, t: number): Point
  closestPoint(pl: Polyline, p: Point): Point
  split(pl: Polyline, point: Point): [Polyline, Polyline]
} = {
  make: (points) => ({ points }),

  fromLines: (lines) => {
    if (lines.length === 0) return { points: [] }
    const points: Point[] = [lines[0]!.p1]
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!
      if (i > 0 && !Point.equals(points[points.length - 1]!, line.p1)) {
        throw new DiscontinuousLinesError(i - 1)
      }
      points.push(line.p2)
    }
    return { points }
  },

  length: (pl) => {
    let total = 0
    for (let i = 1; i < pl.points.length; i++) total += Point.distance(pl.points[i - 1]!, pl.points[i]!)
    return total
  },

  isClosed: (pl, tolerance = 1e-10) =>
    pl.points.length >= 3 && Point.equals(pl.points[0]!, pl.points[pl.points.length - 1]!, tolerance),

  toPolygon: (pl) => {
    if (!Polyline.isClosed(pl)) throw new OpenPolylineError()
    const points = pl.points.slice(0, -1)
    if (points.length < 3) throw new InvalidPolygonError('weniger als 3 Punkte nach Entfernung des Schlusspunkts')
    const unique = points.filter((p, i) => points.findIndex((q) => Point.equals(p, q)) === i)
    if (unique.length < 3) throw new InvalidPolygonError('weniger als 3 eindeutige Punkte nach Entfernung des Schlusspunkts')

    const n = points.length
    let area = 0
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      area += points[i]!.x * points[j]!.y - points[j]!.x * points[i]!.y
    }
    return area < 0 ? { points: [...points].reverse() } : { points }
  },

  pointAt: (pl, t) => {
    if (pl.points.length === 0) throw new InvalidPolylineError('pointAt auf leerer Polyline')
    if (pl.points.length === 1) return pl.points[0]!

    const totalLen = Polyline.length(pl)
    const target = t * totalLen
    let accumulated = 0

    for (let i = 1; i < pl.points.length; i++) {
      const segLen = Point.distance(pl.points[i - 1]!, pl.points[i]!)
      if (segLen < 1e-14) continue
      if (accumulated + segLen >= target) {
        const localT = (target - accumulated) / segLen
        const v = Vector.fromPoints(pl.points[i - 1]!, pl.points[i]!)
        return Point.translate(pl.points[i - 1]!, Vector.scale(v, localT))
      }
      accumulated += segLen
    }

    return pl.points[pl.points.length - 1]!
  },

  closestPoint: (pl, p) => {
    if (pl.points.length === 0) throw new InvalidPolylineError('closestPoint auf leerer Polyline')
    if (pl.points.length === 1) return pl.points[0]!

    let closest = pl.points[0]!
    let minDist = Infinity

    for (let i = 1; i < pl.points.length; i++) {
      const candidate = closestPointOnSegment(pl.points[i - 1]!, pl.points[i]!, p)
      const dist = Point.distance(p, candidate)
      if (dist < minDist) {
        minDist = dist
        closest = candidate
      }
    }

    return closest
  },

  split: (pl, point) => {
    if (pl.points.length < 2) throw new InvalidPolylineError('split auf Polyline mit weniger als 2 Punkten')

    let bestIdx = 0
    let bestDist = Infinity
    let bestProjected = point

    for (let i = 1; i < pl.points.length; i++) {
      const projected = closestPointOnSegment(pl.points[i - 1]!, pl.points[i]!, point)
      const dist = Point.distance(point, projected)
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
        bestProjected = projected
      }
    }

    const beforeBase = pl.points.slice(0, bestIdx)
    const afterBase = pl.points.slice(bestIdx)

    const before = Point.equals(beforeBase[beforeBase.length - 1]!, bestProjected)
      ? [...beforeBase]
      : [...beforeBase, bestProjected]

    const after = Point.equals(afterBase[0]!, bestProjected)
      ? [...afterBase]
      : [bestProjected, ...afterBase]

    return [{ points: before }, { points: after }]
  },

  translate: (pl, v) => ({ points: pl.points.map((p) => Point.translate(p, v)) }),
  rotate: (pl, angle, origin) => ({ points: pl.points.map((p) => Point.rotate(p, angle, origin)) }),
  mirror: (pl, axisP1, axisP2) => ({ points: pl.points.map((p) => Point.mirror(p, axisP1, axisP2)) }),
}
