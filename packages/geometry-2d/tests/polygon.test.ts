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
  // ADR 0034: die Fabrik prüft, sie dreht nicht.
  it('gibt die Punkte unverändert zurück — in beiden Windungen', () => {
    const ccw = [Point.make(0, 0), Point.make(4, 0), Point.make(4, 3), Point.make(0, 3)]
    const cw = [...ccw].reverse()
    expect(Polygon.make(ccw).points).toEqual(ccw)
    expect(Polygon.make(cw).points).toEqual(cw)
    expect(Polygon.isClockwise(Polygon.make(cw))).toBe(true)
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

describe('Polygon.moments liefert die rohen Flächenmomente eines Ringes', () => {
  // Das Rechteck 4x3 mit der Ecke im Ursprung: A = 12, Sx = ∫x dA = 12·2 = 24,
  // Sy = 12·1,5 = 18, Iyy = ∫x² dA = b·h³/3 mit b=3,h=4 -> 64, Ixx = 4·27/3 = 36,
  // Ixy = ∫xy dA = (4²/2)·(3²/2) = 36. Alles von Hand, ohne Bibliothek.
  it('rechnet sie um den URSPRUNG und mit VORZEICHEN, nicht schwerpunktsbezogen', () => {
    const m = Polygon.moments(rect)
    expect(m.A).toBeCloseTo(12)
    expect(m.Sx).toBeCloseTo(24)
    expect(m.Sy).toBeCloseTo(18)
    expect(m.Ixx).toBeCloseTo(36)
    expect(m.Iyy).toBeCloseTo(64)
    expect(m.Ixy).toBeCloseTo(36)
  })

  it('kehrt mit der Windung ALLE sechs Vorzeichen um — so trägt sich ein Loch selbst bei', () => {
    const ccw = Polygon.moments(rect)
    const cw = Polygon.moments([...rect].reverse())
    expect(cw.A).toBeCloseTo(-ccw.A)
    expect(cw.Sx).toBeCloseTo(-ccw.Sx)
    expect(cw.Sy).toBeCloseTo(-ccw.Sy)
    expect(cw.Ixx).toBeCloseTo(-ccw.Ixx)
    expect(cw.Iyy).toBeCloseTo(-ccw.Iyy)
    expect(cw.Ixy).toBeCloseTo(-ccw.Ixy)
  })

  it('ist skalenfrei: doppelte Länge vervierfacht A und versechzehnfacht Ixx', () => {
    const single = Polygon.moments(rect)
    const doubled = Polygon.moments(rect.map((p) => Point.make(p.x * 2, p.y * 2)))
    expect(doubled.A).toBeCloseTo(single.A * 4)
    expect(doubled.Ixx).toBeCloseTo(single.Ixx * 16)
  })

  it('wirft für weniger als 3 Punkte', () => {
    expect(() => Polygon.moments([Point.make(0, 0), Point.make(1, 0)])).toThrow(InvalidPolygonError)
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

// Die Zusage ist von `make` an die martinez-Grenze gewandert (ADR 0034): sie
// steht jetzt in `fromMartinez` und wird hier festgehalten.
describe('Boolesche Operationen liefern CCW, obwohl make es nicht mehr erzwingt', () => {
  const a = Polygon.make([Point.make(0, 0), Point.make(4, 0), Point.make(4, 4), Point.make(0, 4)])
  const b = Polygon.make([Point.make(2, 0), Point.make(6, 0), Point.make(6, 4), Point.make(2, 4)])

  it('union, intersect und subtract laufen counter-clockwise', () => {
    for (const result of [Polygon.union(a, b), Polygon.intersect(a, b), Polygon.subtract(a, b)]) {
      expect(result.length).toBeGreaterThan(0)
      expect(result.every((poly) => !Polygon.isClockwise(poly))).toBe(true)
    }
  })

  // Bisher geglaubt und nie geprüft: vor ADR 0034 kam ein CW-Polygon gar nicht
  // erst bis zu martinez, weil `make` es vorher umdrehte.
  it('ein CW-Eingabepolygon liefert dasselbe wie sein CCW-Zwilling', () => {
    const aCw = { points: [...a.points].reverse() }
    const bCw = { points: [...b.points].reverse() }
    expect(Polygon.union(aCw, bCw)).toEqual(Polygon.union(a, b))
    expect(Polygon.intersect(aCw, bCw)).toEqual(Polygon.intersect(a, b))
    expect(Polygon.subtract(aCw, bCw)).toEqual(Polygon.subtract(a, b))
  })
})

describe('Polygon.translate / rotate / mirror', () => {
  it('translate shifts all points', () => {
    const poly = Polygon.make(rect)
    const moved = Polygon.translate(poly, { dx: 1, dy: 1 })
    expect(moved.points[0]).toEqual({ x: 1, y: 1 })
  })
  // ADR 0034: eine Spiegelung ist orientierungsumkehrend, und das wird nicht
  // mehr versteckt — sonst würde aus einem Loch beim Spiegeln still Material.
  it('mirror kehrt die Windung um', () => {
    const poly = Polygon.make(rect)
    expect(Polygon.isClockwise(poly)).toBe(false)
    const mirrored = Polygon.mirror(poly, Point.make(0, 0), Point.make(1, 0))
    expect(Polygon.isClockwise(mirrored)).toBe(true)
    expect(Polygon.area(mirrored)).toBeCloseTo(12)
  })
})
