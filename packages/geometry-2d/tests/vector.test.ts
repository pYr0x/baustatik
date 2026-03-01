import { describe, it, expect } from 'vitest'
import { Vector } from '../src/vector'
import { Point } from '../src/point'
import { DegenerateVectorError } from '../src/errors'

describe('Vector.make', () => {
  it('creates a vector', () => {
    expect(Vector.make(1, 2)).toEqual({ dx: 1, dy: 2 })
  })
})

describe('Vector.fromPoints', () => {
  it('a to b vector', () => {
    expect(Vector.fromPoints(Point.make(1, 1), Point.make(4, 5))).toEqual({ dx: 3, dy: 4 })
  })
})

describe('Vector.length', () => {
  it('3-4-5', () => {
    expect(Vector.length(Vector.make(3, 4))).toBe(5)
  })
})

describe('Vector.normalize', () => {
  it('unit vector', () => {
    const n = Vector.normalize(Vector.make(3, 4))
    expect(Vector.length(n)).toBeCloseTo(1)
    expect(n.dx).toBeCloseTo(0.6)
    expect(n.dy).toBeCloseTo(0.8)
  })
  it('throws for zero vector', () => {
    expect(() => Vector.normalize(Vector.make(0, 0))).toThrow(DegenerateVectorError)
  })
})

describe('Vector.add / subtract', () => {
  it('adds two vectors', () => {
    expect(Vector.add(Vector.make(1, 2), Vector.make(3, 4))).toEqual({ dx: 4, dy: 6 })
  })
  it('subtracts two vectors', () => {
    expect(Vector.subtract(Vector.make(3, 4), Vector.make(1, 2))).toEqual({ dx: 2, dy: 2 })
  })
})

describe('Vector.scale / negate', () => {
  it('scales', () => {
    expect(Vector.scale(Vector.make(1, 2), 3)).toEqual({ dx: 3, dy: 6 })
  })
  it('negates', () => {
    expect(Vector.negate(Vector.make(1, -2))).toEqual({ dx: -1, dy: 2 })
  })
})

describe('Vector.dot / cross', () => {
  it('dot is 0 for perpendicular', () => {
    expect(Vector.dot(Vector.make(1, 0), Vector.make(0, 1))).toBe(0)
  })
  it('cross product z-component', () => {
    expect(Vector.cross(Vector.make(1, 0), Vector.make(0, 1))).toBe(1)
  })
})

describe('Vector.perpendicular', () => {
  it('rotates 90 deg CCW', () => {
    const p = Vector.perpendicular(Vector.make(1, 0))
    expect(p.dx).toBeCloseTo(0)
    expect(p.dy).toBeCloseTo(1)
  })
})

describe('Vector.angle', () => {
  it('angle to x-axis', () => {
    expect(Vector.angle(Vector.make(1, 0))).toBeCloseTo(0)
    expect(Vector.angle(Vector.make(0, 1))).toBeCloseTo(Math.PI / 2)
  })
})

describe('Vector.rotate', () => {
  it('rotates vector', () => {
    const r = Vector.rotate(Vector.make(1, 0), Math.PI / 2)
    expect(r.dx).toBeCloseTo(0)
    expect(r.dy).toBeCloseTo(1)
  })
})
