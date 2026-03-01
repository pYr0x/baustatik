import { describe, it, expect } from 'vitest'
import { Point } from '../src/point'
import { DegenerateAxisError } from '../src/errors'

describe('Point.make', () => {
  it('creates a point', () => {
    expect(Point.make(3, 4)).toEqual({ x: 3, y: 4 })
  })
})

describe('Point.distance', () => {
  it('3-4-5 triangle', () => {
    expect(Point.distance(Point.make(0, 0), Point.make(3, 4))).toBe(5)
  })
})

describe('Point.equals', () => {
  it('identical points', () => {
    expect(Point.equals(Point.make(1, 2), Point.make(1, 2))).toBe(true)
  })
  it('different points', () => {
    expect(Point.equals(Point.make(1, 2), Point.make(1, 3))).toBe(false)
  })
  it('within tolerance', () => {
    expect(Point.equals(Point.make(0, 0), Point.make(0, 1e-11), 1e-10)).toBe(true)
  })
})

describe('Point.translate', () => {
  it('moves point by vector', () => {
    expect(Point.translate(Point.make(1, 2), { dx: 3, dy: -1 })).toEqual({ x: 4, y: 1 })
  })
})

describe('Point.rotate', () => {
  it('90° around origin', () => {
    const r = Point.rotate(Point.make(1, 0), Math.PI / 2)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(1)
  })
  it('90° around custom origin', () => {
    const r = Point.rotate(Point.make(2, 0), Math.PI / 2, Point.make(1, 0))
    expect(r.x).toBeCloseTo(1)
    expect(r.y).toBeCloseTo(1)
  })
})

describe('Point.mirror', () => {
  it('mirrors across x-axis', () => {
    const m = Point.mirror(Point.make(1, 2), Point.make(0, 0), Point.make(1, 0))
    expect(m.x).toBeCloseTo(1)
    expect(m.y).toBeCloseTo(-2)
  })
  it('mirrors across y-axis', () => {
    const m = Point.mirror(Point.make(3, 1), Point.make(0, 0), Point.make(0, 1))
    expect(m.x).toBeCloseTo(-3)
    expect(m.y).toBeCloseTo(1)
  })
  it('mirrors across diagonal', () => {
    const m = Point.mirror(Point.make(1, 0), Point.make(0, 0), Point.make(1, 1))
    expect(m.x).toBeCloseTo(0)
    expect(m.y).toBeCloseTo(1)
  })
  it('throws for degenerate axis (identical points)', () => {
    expect(() => Point.mirror(Point.make(1, 2), Point.make(0, 0), Point.make(0, 0))).toThrow(DegenerateAxisError)
  })
})
