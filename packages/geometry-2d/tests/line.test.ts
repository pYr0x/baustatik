import { describe, it, expect } from 'vitest'
import { Line } from '../src/line'
import { Point } from '../src/point'
import { Vector } from '../src/vector'

const p00 = Point.make(0, 0)
const p30 = Point.make(3, 0)
const p34 = Point.make(3, 4)

describe('Line.length', () => {
  it('3-4-5 triangle', () => {
    expect(Line.length(Line.make(p00, p34))).toBe(5)
  })
})

describe('Line.midpoint', () => {
  it('midpoint of horizontal line', () => {
    expect(Line.midpoint(Line.make(p00, p30))).toEqual({ x: 1.5, y: 0 })
  })
})

describe('Line.direction', () => {
  it('normalized direction', () => {
    expect(Line.direction(Line.make(p00, p30))).toEqual({ dx: 1, dy: 0 })
  })
})

describe('Line.normalVector', () => {
  it('90 deg CCW from horizontal', () => {
    const n = Line.normalVector(Line.make(p00, p30))
    expect(n.dx).toBeCloseTo(0)
    expect(n.dy).toBeCloseTo(1)
  })
})

describe('Line.extend', () => {
  it('extends both ends', () => {
    const ext = Line.extend(Line.make(p00, p30), 1, 1)
    expect(ext.p1.x).toBeCloseTo(-1)
    expect(ext.p2.x).toBeCloseTo(4)
  })
})

describe('Line.parallel', () => {
  it('parallel at distance 2', () => {
    const par = Line.parallel(Line.make(p00, p30), 2)
    expect(par.p1.y).toBeCloseTo(2)
    expect(par.p2.y).toBeCloseTo(2)
  })
})

describe('Line.closestPoint', () => {
  it('foot of perpendicular', () => {
    const cp = Line.closestPoint(Line.make(p00, p30), Point.make(1.5, 5))
    expect(cp.x).toBeCloseTo(1.5)
    expect(cp.y).toBeCloseTo(0)
  })
  it('clamps to segment endpoint', () => {
    const cp = Line.closestPoint(Line.make(p00, p30), Point.make(10, 0))
    expect(cp.x).toBeCloseTo(3)
  })
})

describe('Line.distanceToPoint', () => {
  it('distance from point to line', () => {
    expect(Line.distanceToPoint(Line.make(p00, p30), Point.make(1.5, 3))).toBeCloseTo(3)
  })
})

describe('Line.intersect', () => {
  it('crossing lines', () => {
    const a = Line.make(Point.make(0, 0), Point.make(2, 2))
    const b = Line.make(Point.make(0, 2), Point.make(2, 0))
    const pt = Line.intersect(a, b)
    expect(pt?.x).toBeCloseTo(1)
    expect(pt?.y).toBeCloseTo(1)
  })
  it('parallel lines to null', () => {
    expect(Line.intersect(Line.make(p00, p30), Line.make(Point.make(0, 1), Point.make(3, 1)))).toBeNull()
  })
  it('intersection outside segment bounds', () => {
    const a = Line.make(Point.make(0, 0), Point.make(1, 0))
    const b = Line.make(Point.make(5, -1), Point.make(5, 1))
    expect(Line.intersect(a, b)?.x).toBeCloseTo(5)
  })
})

describe('Line.intersectSegment', () => {
  it('returns null outside segment', () => {
    const a = Line.make(Point.make(0, 0), Point.make(1, 0))
    const b = Line.make(Point.make(5, -1), Point.make(5, 1))
    expect(Line.intersectSegment(a, b)).toBeNull()
  })
  it('returns point inside both segments', () => {
    const a = Line.make(Point.make(0, 0), Point.make(2, 2))
    const b = Line.make(Point.make(0, 2), Point.make(2, 0))
    const pt = Line.intersectSegment(a, b)
    expect(pt?.x).toBeCloseTo(1)
  })
})

describe('Line.isParallel / isPerpendicular', () => {
  it('parallel detection', () => {
    expect(Line.isParallel(Line.make(p00, p30), Line.make(Point.make(0, 1), Point.make(3, 1)))).toBe(true)
  })
  it('perpendicular detection', () => {
    expect(Line.isPerpendicular(Line.make(p00, p30), Line.make(Point.make(1, 0), Point.make(1, 3)))).toBe(true)
  })
})

describe('Line.angle', () => {
  it('angle between perpendicular lines is pi/2', () => {
    const a = Line.make(p00, p30)
    const b = Line.make(p00, Point.make(0, 3))
    expect(Line.angle(a, b)).toBeCloseTo(Math.PI / 2)
  })
})

describe('Line.split', () => {
  it('splits at given point', () => {
    const [a, b] = Line.split(Line.make(p00, p30), Point.make(1, 0))
    expect(a.p1).toEqual(p00)
    expect(a.p2).toEqual({ x: 1, y: 0 })
    expect(b.p1).toEqual({ x: 1, y: 0 })
    expect(b.p2).toEqual(p30)
  })
})

describe('Line.translate / rotate / mirror', () => {
  it('translate moves both endpoints', () => {
    const moved = Line.translate(Line.make(p00, p30), Vector.make(0, 1))
    expect(moved.p1).toEqual({ x: 0, y: 1 })
    expect(moved.p2).toEqual({ x: 3, y: 1 })
  })
  it('rotate 90 deg around origin', () => {
    const r = Line.rotate(Line.make(p00, p30), Math.PI / 2)
    expect(r.p2.x).toBeCloseTo(0)
    expect(r.p2.y).toBeCloseTo(3)
  })
  it('mirror across x-axis', () => {
    const m = Line.mirror(Line.make(Point.make(0, 1), Point.make(3, 1)), Point.make(0, 0), Point.make(1, 0))
    expect(m.p1.y).toBeCloseTo(-1)
    expect(m.p2.y).toBeCloseTo(-1)
  })
})
