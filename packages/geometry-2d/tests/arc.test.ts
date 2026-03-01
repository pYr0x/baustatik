import { describe, it, expect } from 'vitest'
import { Arc } from '../src/arc'
import { Point } from '../src/point'
import { Line } from '../src/line'
import { CollinearPointsError, InvalidArcError } from '../src/errors'

describe('Arc.fromCenter', () => {
  it('creates arc', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI)
    expect(arc.radius).toBe(5)
  })
  it('throws for radius <= 0', () => {
    expect(() => Arc.fromCenter(Point.make(0, 0), 0, 0, Math.PI)).toThrow(InvalidArcError)
    expect(() => Arc.fromCenter(Point.make(0, 0), -1, 0, Math.PI)).toThrow(InvalidArcError)
  })
})

describe('Arc.fromPoints', () => {
  it('upper semicircle', () => {
    const arc = Arc.fromPoints(Point.make(1, 0), Point.make(0, 1), Point.make(-1, 0))
    expect(arc.center.x).toBeCloseTo(0)
    expect(arc.center.y).toBeCloseTo(0)
    expect(arc.radius).toBeCloseTo(1)
  })
  it('throws for collinear points', () => {
    expect(() => Arc.fromPoints(Point.make(0, 0), Point.make(1, 0), Point.make(2, 0))).toThrow(CollinearPointsError)
  })
})

describe('Arc.length', () => {
  it('half-circle r=1 to pi', () => {
    expect(Arc.length(Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI))).toBeCloseTo(Math.PI)
  })
})

describe('Arc.startPoint / endPoint', () => {
  it('correct start and end', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2)
    expect(Arc.startPoint(arc).x).toBeCloseTo(1)
    expect(Arc.startPoint(arc).y).toBeCloseTo(0)
    expect(Arc.endPoint(arc).x).toBeCloseTo(0)
    expect(Arc.endPoint(arc).y).toBeCloseTo(1)
  })
})

describe('Arc.normalAt', () => {
  it('outward normal at angle 0 is (1,0)', () => {
    const n = Arc.normalAt(Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI), 0)
    expect(n.dx).toBeCloseTo(1)
    expect(n.dy).toBeCloseTo(0)
  })
})

describe('Arc.normalAtPoint', () => {
  it('normal at top of circle points up', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI * 2)
    const n = Arc.normalAtPoint(arc, Point.make(0, 1))
    expect(n.dx).toBeCloseTo(0)
    expect(n.dy).toBeCloseTo(1)
  })
})

describe('Arc.midpoint', () => {
  it('midpoint of quarter circle', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2)
    const mid = Arc.midpoint(arc)
    expect(mid.x).toBeCloseTo(Math.cos(Math.PI / 4))
    expect(mid.y).toBeCloseTo(Math.sin(Math.PI / 4))
  })
})

describe('Arc.offset', () => {
  it('increases radius', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI)
    expect(Arc.offset(arc, 2).radius).toBe(7)
  })
  it('throws for negative resulting radius', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI)
    expect(() => Arc.offset(arc, -6)).toThrow(InvalidArcError)
  })
})

describe('Arc.toPolyline', () => {
  it('segments option: n segments = n+1 points', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI)
    expect(Arc.toPolyline(arc, { segments: 8 }).points.length).toBe(9)
  })
  it('tolerance option: larger radius to more segments', () => {
    const small = Arc.toPolyline(Arc.fromCenter(Point.make(0, 0), 10, 0, Math.PI * 2), { tolerance: 0.1 })
    const large = Arc.toPolyline(Arc.fromCenter(Point.make(0, 0), 1000, 0, Math.PI * 2), { tolerance: 0.1 })
    expect(large.points.length).toBeGreaterThan(small.points.length)
  })
  it('throws for segments <= 0', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI)
    expect(() => Arc.toPolyline(arc, { segments: 0 })).toThrow(InvalidArcError)
  })
  it('throws for tolerance <= 0', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI)
    expect(() => Arc.toPolyline(arc, { tolerance: 0 })).toThrow(InvalidArcError)
  })
})

describe('Arc.intersectLine / intersectLineFull', () => {
  it('intersectLine returns only points on arc', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI)
    const line = Line.make(Point.make(0, -2), Point.make(0, 2))
    const pts = Arc.intersectLine(arc, line)
    expect(pts.length).toBe(1)
    expect(pts[0]!.y).toBeCloseTo(1)
  })
  it('intersectLineFull returns both circle intersections', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI)
    const line = Line.make(Point.make(0, -2), Point.make(0, 2))
    expect(Arc.intersectLineFull(arc, line).length).toBe(2)
  })
})

describe('Arc.intersectArc / intersectArcFull', () => {
  it('intersectArcFull finds two circle intersections', () => {
    const a = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI * 2)
    const b = Arc.fromCenter(Point.make(1, 0), 1, 0, Math.PI * 2)
    expect(Arc.intersectArcFull(a, b).length).toBe(2)
  })
  it('intersectArc filters to arc segments', () => {
    const a = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI)
    const b = Arc.fromCenter(Point.make(1, 0), 1, 0, Math.PI * 2)
    const pts = Arc.intersectArc(a, b)
    for (const p of pts) expect(p.y).toBeGreaterThanOrEqual(-1e-10)
  })
})

describe('Arc.translate / rotate / mirror', () => {
  it('translate moves center', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI)
    const moved = Arc.translate(arc, { dx: 3, dy: 1 })
    expect(moved.center).toEqual({ x: 3, y: 1 })
    expect(moved.radius).toBe(5)
  })
  it('rotate adds to angles', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2)
    const rotated = Arc.rotate(arc, Math.PI / 2)
    expect(rotated.startAngle).toBeCloseTo(Math.PI / 2)
  })
})

describe('Arc full circle', () => {
  it('length of full circle r=1 to 2pi', () => {
    expect(Arc.length(Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI * 2))).toBeCloseTo(2 * Math.PI)
  })
  it('toPolyline generates points for full circle', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI * 2)
    expect(Arc.toPolyline(arc, { segments: 8 }).points.length).toBe(9)
  })
})
