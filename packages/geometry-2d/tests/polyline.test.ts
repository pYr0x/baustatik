import { describe, it, expect } from 'vitest'
import { Polyline } from '../src/polyline'
import { Point } from '../src/point'
import { Line } from '../src/line'
import { Vector } from '../src/vector'
import { DiscontinuousLinesError, InvalidPolygonError, InvalidPolylineError, OpenPolylineError } from '../src/errors'

const pts = [Point.make(0, 0), Point.make(3, 0), Point.make(3, 4)]

describe('Polyline.make', () => {
  it('creates from points', () => {
    expect(Polyline.make(pts).points.length).toBe(3)
  })
})

describe('Polyline.length', () => {
  it('3 + 4 = 7', () => {
    expect(Polyline.length(Polyline.make(pts))).toBeCloseTo(7)
  })
})

describe('Polyline.isClosed', () => {
  it('open polyline to false', () => {
    expect(Polyline.isClosed(Polyline.make(pts))).toBe(false)
  })
  it('closed polyline to true', () => {
    expect(Polyline.isClosed(Polyline.make([...pts, Point.make(0, 0)]))).toBe(true)
  })
})

describe('Polyline.fromLines', () => {
  it('builds from connected lines', () => {
    const lines = [Line.make(Point.make(0, 0), Point.make(1, 0)), Line.make(Point.make(1, 0), Point.make(2, 0))]
    expect(Polyline.fromLines(lines).points.length).toBe(3)
  })
  it('throws for disconnected lines', () => {
    const lines = [Line.make(Point.make(0, 0), Point.make(1, 0)), Line.make(Point.make(5, 0), Point.make(6, 0))]
    expect(() => Polyline.fromLines(lines)).toThrow(DiscontinuousLinesError)
  })
})

describe('Polyline.toPolygon', () => {
  it('throws for open polyline', () => {
    expect(() => Polyline.toPolygon(Polyline.make(pts))).toThrow(OpenPolylineError)
  })
  it('converts closed polyline to polygon', () => {
    const closed = Polyline.make([Point.make(0, 0), Point.make(1, 0), Point.make(1, 1), Point.make(0, 0)])
    const poly = Polyline.toPolygon(closed)
    expect(poly.points.length).toBe(3)
  })
  it('throws InvalidPolygonError for closed polyline with < 3 unique points', () => {
    const degenerate = Polyline.make([Point.make(0, 0), Point.make(1, 0), Point.make(0, 0)])
    expect(() => Polyline.toPolygon(degenerate)).toThrow(InvalidPolygonError)
  })
})

describe('Polyline.pointAt', () => {
  it('t=0 to first point', () => {
    const pl = Polyline.make(pts)
    expect(Polyline.pointAt(pl, 0)).toEqual(pts[0])
  })
  it('t=1 to last point', () => {
    const pl = Polyline.make(pts)
    const p = Polyline.pointAt(pl, 1)
    expect(p.x).toBeCloseTo(3)
    expect(p.y).toBeCloseTo(4)
  })
})

describe('Polyline.closestPoint', () => {
  it('finds nearest point on polyline', () => {
    const pl = Polyline.make([Point.make(0, 0), Point.make(4, 0)])
    const cp = Polyline.closestPoint(pl, Point.make(2, 5))
    expect(cp.x).toBeCloseTo(2)
    expect(cp.y).toBeCloseTo(0)
  })
})

describe('Polyline.split', () => {
  it('splits at midpoint of segment', () => {
    const pl = Polyline.make([Point.make(0, 0), Point.make(4, 0), Point.make(4, 4)])
    const [a, b] = Polyline.split(pl, Point.make(2, 0))
    expect(a.points.length).toBe(2)
    expect(b.points.length).toBe(3)
  })
})

describe('Polyline.translate / rotate / mirror', () => {
  it('translate moves all points', () => {
    const moved = Polyline.translate(Polyline.make(pts), Vector.make(0, 5))
    expect(moved.points[0]).toEqual({ x: 0, y: 5 })
  })
  it('rotate', () => {
    const r = Polyline.rotate(Polyline.make([Point.make(1, 0)]), Math.PI / 2)
    expect(r.points[0]!.x).toBeCloseTo(0)
    expect(r.points[0]!.y).toBeCloseTo(1)
  })
  it('mirror across x-axis', () => {
    const m = Polyline.mirror(Polyline.make([Point.make(1, 2)]), Point.make(0, 0), Point.make(1, 0))
    expect(m.points[0]!.y).toBeCloseTo(-2)
  })
})

describe('Polyline.pointAt error cases', () => {
  it('throws for empty polyline', () => {
    expect(() => Polyline.pointAt(Polyline.make([]), 0.5)).toThrow(InvalidPolylineError)
  })
})

describe('Polyline.closestPoint error cases', () => {
  it('throws for empty polyline', () => {
    expect(() => Polyline.closestPoint(Polyline.make([]), Point.make(0, 0))).toThrow(InvalidPolylineError)
  })
})

describe('Polyline.split error cases', () => {
  it('throws for polyline with < 2 points', () => {
    expect(() => Polyline.split(Polyline.make([]), Point.make(0, 0))).toThrow(InvalidPolylineError)
    expect(() => Polyline.split(Polyline.make([Point.make(0, 0)]), Point.make(0, 0))).toThrow(InvalidPolylineError)
  })
})
