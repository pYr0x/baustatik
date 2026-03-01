import { describe, it, expect } from 'vitest'
import { Polygon } from '../src/polygon'
import { Point } from '../src/point'
import { Line } from '../src/line'
import { InvalidPolygonError, DiscontinuousLinesError } from '../src/errors'

const rect = [Point.make(0, 0), Point.make(4, 0), Point.make(4, 3), Point.make(0, 3)]

describe('Polygon.make', () => {
  it('throws for < 3 points', () => {
    expect(() => Polygon.make([Point.make(0, 0), Point.make(1, 0)])).toThrow(InvalidPolygonError)
  })
  it('normalizes to CCW', () => {
    const cw = [Point.make(0, 0), Point.make(0, 3), Point.make(4, 3), Point.make(4, 0)]
    const poly = Polygon.make(cw)
    expect(Polygon.isClockwise(poly)).toBe(false)
  })
})

describe('Polygon.area', () => {
  it('rectangle 4x3 = 12', () => {
    expect(Polygon.area(Polygon.make(rect))).toBeCloseTo(12)
  })
})

describe('Polygon.centroid', () => {
  it('center of rectangle', () => {
    const c = Polygon.centroid(Polygon.make(rect))
    expect(c.x).toBeCloseTo(2)
    expect(c.y).toBeCloseTo(1.5)
  })
})

describe('Polygon.perimeter', () => {
  it('rectangle 4+3+4+3 = 14', () => {
    expect(Polygon.perimeter(Polygon.make(rect))).toBeCloseTo(14)
  })
})

describe('Polygon.contains', () => {
  it('interior point to true', () => {
    expect(Polygon.contains(Polygon.make(rect), Point.make(2, 1.5))).toBe(true)
  })
  it('exterior point to false', () => {
    expect(Polygon.contains(Polygon.make(rect), Point.make(5, 5))).toBe(false)
  })
})

describe('Polygon.isClockwise', () => {
  it('raw CW polygon bypassing make to true', () => {
    const cw: Polygon = { points: [Point.make(0, 0), Point.make(0, 3), Point.make(4, 3), Point.make(4, 0)] }
    expect(Polygon.isClockwise(cw)).toBe(true)
  })
  it('CCW polygon to false', () => {
    expect(Polygon.isClockwise(Polygon.make(rect))).toBe(false)
  })
})

describe('Polygon.toClockwise / toCounterClockwise', () => {
  it('toClockwise reverses CCW polygon', () => {
    expect(Polygon.isClockwise(Polygon.toClockwise(Polygon.make(rect)))).toBe(true)
  })
  it('toCounterClockwise on already CCW is identity', () => {
    const poly = Polygon.make(rect)
    expect(Polygon.toCounterClockwise(poly).points).toEqual(poly.points)
  })
})

describe('Polygon.boundingBox', () => {
  it('correct min/max', () => {
    const bb = Polygon.boundingBox(Polygon.make(rect))
    expect(bb.min).toEqual({ x: 0, y: 0 })
    expect(bb.max).toEqual({ x: 4, y: 3 })
  })
})

describe('Polygon.fromLines', () => {
  it('creates polygon from closed line loop', () => {
    const lines = [
      Line.make(Point.make(0, 0), Point.make(4, 0)),
      Line.make(Point.make(4, 0), Point.make(4, 3)),
      Line.make(Point.make(4, 3), Point.make(0, 3)),
      Line.make(Point.make(0, 3), Point.make(0, 0)),
    ]
    const poly = Polygon.fromLines(lines)
    expect(poly.points.length).toBe(4)
    expect(Polygon.area(poly)).toBeCloseTo(12)
  })
  it('throws for < 3 lines', () => {
    const lines = [
      Line.make(Point.make(0, 0), Point.make(1, 0)),
      Line.make(Point.make(1, 0), Point.make(1, 1)),
    ]
    expect(() => Polygon.fromLines(lines)).toThrow(InvalidPolygonError)
  })
  it('throws for non-closed loop', () => {
    const lines = [
      Line.make(Point.make(0, 0), Point.make(1, 0)),
      Line.make(Point.make(1, 0), Point.make(1, 1)),
      Line.make(Point.make(1, 1), Point.make(0, 1)),
    ]
    expect(() => Polygon.fromLines(lines)).toThrow(InvalidPolygonError)
  })
  it('throws for disconnected lines', () => {
    const lines = [
      Line.make(Point.make(0, 0), Point.make(1, 0)),
      Line.make(Point.make(5, 0), Point.make(5, 1)),
      Line.make(Point.make(5, 1), Point.make(0, 0)),
    ]
    expect(() => Polygon.fromLines(lines)).toThrow(DiscontinuousLinesError)
  })
})

describe('Polygon.subtract', () => {
  it('subtracts overlapping polygon', () => {
    const a = Polygon.make([Point.make(0, 0), Point.make(4, 0), Point.make(4, 4), Point.make(0, 4)])
    const b = Polygon.make([Point.make(2, 0), Point.make(6, 0), Point.make(6, 4), Point.make(2, 4)])
    const result = Polygon.subtract(a, b)
    expect(result.length).toBeGreaterThan(0)
    expect(Polygon.area(result[0]!)).toBeCloseTo(8)
  })
})

describe('Polygon.translate / rotate / mirror', () => {
  it('translate shifts all points', () => {
    const poly = Polygon.make(rect)
    const moved = Polygon.translate(poly, { dx: 1, dy: 1 })
    expect(moved.points[0]).toEqual({ x: 1, y: 1 })
  })
  it('mirror preserves CCW invariant', () => {
    const poly = Polygon.make(rect)
    const mirrored = Polygon.mirror(poly, Point.make(0, 0), Point.make(1, 0))
    expect(Polygon.isClockwise(mirrored)).toBe(false)
    expect(Polygon.area(mirrored)).toBeCloseTo(12)
  })
})
