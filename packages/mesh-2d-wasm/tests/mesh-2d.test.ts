import { atOrThrow } from '@baustatik/core';
import { describe, expect, it, vi } from 'vitest';
import {
  createMesher2D,
  Mesh2DInputError,
  type Mesh2DResult,
  type MeshRing2D,
} from '../pkg/index.js';
import { mesherHeapByteLength } from '../pkg/heap-diagnostics.js';

const square = new Float64Array([0, 0, 10, 0, 10, 10, 0, 10]);

describe('der 2D-Mesher', () => {
  it('vernetzt ein Quadrat als Tri3 und Tri6 mit positiver Orientierung', async () => {
    const mesher = await createMesher2D();
    for (const element of ['tri3', 'tri6'] as const) {
      const result = mesher.generate({
        rings: [{ kind: 'material', coordinates: square }],
        element,
        maxElementArea: 10,
      });
      expect(result.elements.length % (element === 'tri3' ? 3 : 6)).toBe(0);
      expect(validIndices(result)).toBe(true);
      expect(positiveOrientation(result)).toBe(true);
      expect(area(result)).toBeCloseTo(100, 10);
      expect(maxArea(result)).toBeLessThanOrEqual(10 + 1e-10);
    }
  });

  it('erhält Löcher, konkave Ringe und getrennte Materialflächen', async () => {
    const mesher = await createMesher2D();
    const rings = [
      {
        kind: 'material',
        coordinates: new Float64Array([0, 0, 8, 0, 8, 3, 3, 3, 3, 8, 0, 8]),
      },
      {
        kind: 'material',
        coordinates: new Float64Array([12, 0, 14, 0, 14, 2, 12, 2]),
      },
      { kind: 'hole', coordinates: new Float64Array([1, 1, 2, 1, 2, 2, 1, 2]) },
    ] as const satisfies readonly MeshRing2D[];
    const result = mesher.generate({
      rings,
      element: 'tri3',
      maxElementArea: 0.5,
    });
    expect(area(result)).toBeCloseTo(42, 10);
    expect(positiveOrientation(result)).toBe(true);
    expectBoundaryMarkers(result, rings);
  });

  it('ordnet die Tri6-Mittelknoten nach ihren Kanten', async () => {
    const mesher = await createMesher2D();
    const result = mesher.generate({
      rings: [{ kind: 'material', coordinates: square }],
      element: 'tri6',
      maxElementArea: 100,
    });
    for (let offset = 0; offset < result.elements.length; offset += 6) {
      const vertices = result.elements.slice(offset, offset + 3);
      expect(
        midpoint(result, numberAt(vertices, 0), numberAt(vertices, 1)),
      ).toEqual(point(result, numberAt(result.elements, offset + 3)));
      expect(
        midpoint(result, numberAt(vertices, 1), numberAt(vertices, 2)),
      ).toEqual(point(result, numberAt(result.elements, offset + 4)));
      expect(
        midpoint(result, numberAt(vertices, 2), numberAt(vertices, 0)),
      ).toEqual(point(result, numberAt(result.elements, offset + 5)));
    }
  });

  it('erzwingt den festen Qualitätswinkel zusammen mit der maximalen Elementfläche', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const mesher = await createMesher2D();
      const result = mesher.generate({
        rings: [
          {
            kind: 'material',
            coordinates: new Float64Array([0, 0, 100, 0, 100, 10, 0, 10]),
          },
        ],
        element: 'tri3',
        maxElementArea: 1_000,
      });
      expect(area(result)).toBeCloseTo(1_000, 10);
      expect(maxArea(result)).toBeLessThanOrEqual(1_000 + 1e-10);
      expect(minimumAngle(result)).toBeGreaterThanOrEqual(20 - 1e-10);
      expect(log).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it('übergibt kleine maximale Elementflächen ohne Exponentialschreibweise', async () => {
    const mesher = await createMesher2D();
    const result = mesher.generate({
      rings: [
        {
          kind: 'material',
          coordinates: new Float64Array([
            0, 0, 0.001, 0, 0.001, 0.001, 0, 0.001,
          ]),
        },
      ],
      element: 'tri3',
      maxElementArea: 1e-7,
    });
    expect(area(result)).toBeCloseTo(1e-6, 15);
    expect(maxArea(result)).toBeLessThanOrEqual(1e-7 + 1e-18);
  });

  it('übersetzt die unterstützten Triangle-Switches', async () => {
    const mesher = await createMesher2D();
    const result = mesher.generate({
      rings: [{ kind: 'material', coordinates: square }],
      element: 'tri3',
      maxElementArea: 100,
      switches: {
        quality: false,
        ccdt: true,
        jettison: true,
        steiner: 0,
        quiet: false,
      },
    });
    expect(area(result)).toBeCloseTo(100, 10);
    expect(() =>
      mesher.generate({
        rings: [{ kind: 'material', coordinates: square }],
        element: 'tri3',
        maxElementArea: 1,
        switches: { quality: 0 },
      }),
    ).toThrow(Mesh2DInputError);
    expect(() =>
      mesher.generate({
        rings: [{ kind: 'material', coordinates: square }],
        element: 'tri3',
        maxElementArea: 1,
        switches: { quality: 34.1 },
      }),
    ).toThrow(Mesh2DInputError);
  });

  it('weist ungültige PSLGs vor Triangle zurück', async () => {
    const mesher = await createMesher2D();
    expect(() =>
      mesher.generate({
        rings: [
          {
            kind: 'material',
            coordinates: new Float64Array([0, 0, 2, 2, 0, 2, 2, 0]),
          },
        ],
        element: 'tri3',
        maxElementArea: 1,
      }),
    ).toThrow(Mesh2DInputError);
    expect(() =>
      mesher.generate({
        rings: [
          {
            kind: 'material',
            coordinates: new Float64Array([
              1e308, 1e308, -1e308, 1e308, -1e308, -1e308, 1e308, -1e308,
            ]),
          },
        ],
        element: 'tri3',
        maxElementArea: 1,
      }),
    ).toThrow(Mesh2DInputError);
  });

  it('gibt über viele Aufrufe unabhängige Ergebnisse ohne Heap-Wachstum zurück', async () => {
    const mesher = await createMesher2D();
    mesher.generate({
      rings: [{ kind: 'material', coordinates: square }],
      element: 'tri3',
      maxElementArea: 1,
    });
    const heapByteLength = mesherHeapByteLength(mesher);
    let previous: Mesh2DResult | undefined;
    for (let index = 0; index < 10_000; index += 1) {
      const result = mesher.generate({
        rings: [{ kind: 'material', coordinates: square }],
        element: 'tri3',
        maxElementArea: 1,
      });
      expect(area(result)).toBeCloseTo(100, 10);
      if (previous !== undefined) {
        expect(result.points.buffer).not.toBe(previous.points.buffer);
        expect(result.elements.buffer).not.toBe(previous.elements.buffer);
      }
      previous = result;
    }
    expect(mesherHeapByteLength(mesher)).toBe(heapByteLength);
  }, 15_000);
});

function validIndices(result: Mesh2DResult): boolean {
  return result.elements.every((index) => index < result.points.length / 2);
}

function positiveOrientation(result: Mesh2DResult): boolean {
  const width = result.kind === 'tri3' ? 3 : 6;
  for (let offset = 0; offset < result.elements.length; offset += width) {
    const [a, b, c] = result.elements.slice(offset, offset + 3);
    if (a === undefined || b === undefined || c === undefined) return false;
    if (twiceArea(point(result, a), point(result, b), point(result, c)) <= 0)
      return false;
  }
  return true;
}

function area(result: Mesh2DResult): number {
  const width = result.kind === 'tri3' ? 3 : 6;
  let sum = 0;
  for (let offset = 0; offset < result.elements.length; offset += width) {
    const [a, b, c] = result.elements.slice(offset, offset + 3);
    if (a === undefined || b === undefined || c === undefined) continue;
    sum += twiceArea(point(result, a), point(result, b), point(result, c)) / 2;
  }
  return sum;
}

function maxArea(result: Mesh2DResult): number {
  const width = result.kind === 'tri3' ? 3 : 6;
  let maximum = 0;
  for (let offset = 0; offset < result.elements.length; offset += width) {
    const [a, b, c] = result.elements.slice(offset, offset + 3);
    if (a === undefined || b === undefined || c === undefined) continue;
    maximum = Math.max(
      maximum,
      twiceArea(point(result, a), point(result, b), point(result, c)) / 2,
    );
  }
  return maximum;
}

function minimumAngle(result: Mesh2DResult): number {
  const width = result.kind === 'tri3' ? 3 : 6;
  let minimum = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < result.elements.length; offset += width) {
    const a = point(result, numberAt(result.elements, offset));
    const b = point(result, numberAt(result.elements, offset + 1));
    const c = point(result, numberAt(result.elements, offset + 2));
    minimum = Math.min(minimum, angle(a, b, c), angle(b, c, a), angle(c, a, b));
  }
  return minimum;
}

function angle(
  vertex: readonly [number, number],
  first: readonly [number, number],
  second: readonly [number, number],
): number {
  const ax = first[0] - vertex[0];
  const ay = first[1] - vertex[1];
  const bx = second[0] - vertex[0];
  const by = second[1] - vertex[1];
  const cosine = (ax * bx + ay * by) / Math.hypot(ax, ay) / Math.hypot(bx, by);
  return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
}

function point(result: Mesh2DResult, index: number): readonly [number, number] {
  return [
    numberAt(result.points, index * 2),
    numberAt(result.points, index * 2 + 1),
  ];
}

function midpoint(
  result: Mesh2DResult,
  first: number,
  second: number,
): readonly [number, number] {
  const a = point(result, first);
  const b = point(result, second);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

function twiceArea(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function expectBoundaryMarkers(
  result: Mesh2DResult,
  rings: readonly MeshRing2D[],
): void {
  expect(result.boundarySegments.length).toBe(
    result.boundaryMarkers.length * 2,
  );
  const originalSegmentCount = rings.reduce(
    (count, ring) => count + ring.coordinates.length / 2,
    0,
  );
  expect(result.boundaryMarkers.length).toBeGreaterThan(originalSegmentCount);

  for (let index = 0; index < result.boundaryMarkers.length; index += 1) {
    const marker = numberAt(result.boundaryMarkers, index);
    const ring = atOrThrow(rings, marker - 1);
    const from = point(result, numberAt(result.boundarySegments, index * 2));
    const to = point(result, numberAt(result.boundarySegments, index * 2 + 1));
    expect(pointOnRing(from, ring.coordinates)).toBe(true);
    expect(pointOnRing(to, ring.coordinates)).toBe(true);
  }
}

function pointOnRing(
  [x, y]: readonly [number, number],
  coordinates: Float64Array,
): boolean {
  const count = coordinates.length / 2;
  for (let index = 0; index < count; index += 1) {
    const ax = numberAt(coordinates, index * 2);
    const ay = numberAt(coordinates, index * 2 + 1);
    const next = (index + 1) % count;
    const bx = numberAt(coordinates, next * 2);
    const by = numberAt(coordinates, next * 2 + 1);
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (
      Math.abs(cross) <= 1e-10 &&
      x >= Math.min(ax, bx) - 1e-10 &&
      x <= Math.max(ax, bx) + 1e-10 &&
      y >= Math.min(ay, by) - 1e-10 &&
      y <= Math.max(ay, by) + 1e-10
    ) {
      return true;
    }
  }
  return false;
}

function numberAt(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`Index ${index} fehlt.`);
  return value;
}
