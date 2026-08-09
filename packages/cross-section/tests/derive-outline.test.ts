import { describe, expect, it } from 'vitest';
import {
  createSectionPolicy,
  deriveOutlineFromRings,
  type Ring,
} from '../src/index';

/**
 * `deriveOutlineFromRings` — der Ring-Zweig der Umriss-Ableitung (P2).
 *
 * OHNE BIBLIOTHEK: der Ring BESCHREIBT den Umriss schon, es fehlt nur die
 * Bogenzerlegung. Der `midline`-Zweig (Aufweitung um `t/2`, Vereinigung) ist
 * P3 und kommt mit `clipper2-ts`.
 */

const POLICY = createSectionPolicy({
  arcTolerance: 0.05,
  principalAxisTolerance: 1e-9,
});

describe('Gerade Kanten bleiben, was sie sind', () => {
  it('gibt genau die Ecken zurück — jeden Punkt einmal', () => {
    const rings: Ring[] = [
      {
        vertices: [
          { y: 0, z: 0 },
          { y: 100, z: 0 },
          { y: 100, z: 200 },
          { y: 0, z: 200 },
        ],
      },
    ];
    expect(deriveOutlineFromRings(rings, POLICY)).toEqual([
      {
        points: [
          { y: 0, z: 0 },
          { y: 100, z: 0 },
          { y: 100, z: 200 },
          { y: 0, z: 200 },
        ],
      },
    ]);
  });

  it('behandelt die Schlusskante wie jede andere', () => {
    // Der Ring ist geschlossen: der letzte Vertex verbindet zurück zum ersten,
    // und sein `bulge` wölbt genau diese Kante.
    const rings: Ring[] = [
      {
        vertices: [
          { y: 0, z: 0 },
          { y: 10, z: 0 },
          { y: 10, z: 10, bulge: Math.tan(Math.PI / 8) },
        ],
      },
    ];
    const [polygon] = deriveOutlineFromRings(rings, POLICY);
    expect(polygon?.points.length).toBeGreaterThan(3);
    // Der erste Punkt ist die erste Ecke — der Bogen läuft AUF ihn zu und
    // wird deshalb nicht doppelt genannt.
    expect(polygon?.points[0]).toEqual({ y: 0, z: 0 });
  });
});

describe('Ein Bogen wird unter der Toleranz zerlegt', () => {
  // Zwei Halbkreise, `bulge = tan(Δ/4) = tan(π/4) = 1`.
  const circle: Ring[] = [
    {
      vertices: [
        { y: -50, z: 0, bulge: 1 },
        { y: 50, z: 0, bulge: 1 },
      ],
    },
  ];

  it('liefert einen geschlossenen Punktzug ohne doppelten Anfangspunkt', () => {
    const [polygon] = deriveOutlineFromRings(circle, POLICY);
    expect(polygon).toBeDefined();
    const points = polygon?.points ?? [];
    expect(points.length).toBeGreaterThan(20);
    expect(points.at(0)).not.toEqual(points.at(-1));
    // Alle Punkte liegen auf dem Kreis.
    for (const point of points) {
      expect(Math.hypot(point.y, point.z)).toBeCloseTo(50, 9);
    }
  });

  it('hängt die Punktzahl an der Toleranz — deshalb reist sie im Satz mit', () => {
    const fine = deriveOutlineFromRings(
      circle,
      createSectionPolicy({
        arcTolerance: 0.005,
        principalAxisTolerance: 1e-9,
      }),
    );
    const coarse = deriveOutlineFromRings(
      circle,
      createSectionPolicy({
        arcTolerance: 0.5,
        principalAxisTolerance: 1e-9,
      }),
    );
    expect(fine[0]?.points.length ?? 0).toBeGreaterThan(
      coarse[0]?.points.length ?? 0,
    );
  });
});

describe('Der Umlaufsinn wird nicht angefasst', () => {
  // Er trägt die Bedeutung „Material" gegen „Loch" (ADR 0034). Ein verkehrt
  // gelegter Ring kommt verkehrt heraus und fällt im Gate auf, statt hier
  // still repariert zu werden.
  it('gibt einen negativ gewickelten Ring negativ gewickelt zurück', () => {
    const hole: Ring[] = [
      {
        vertices: [
          { y: 0, z: 0 },
          { y: 0, z: 10 },
          { y: 10, z: 10 },
          { y: 10, z: 0 },
        ],
      },
    ];
    expect(deriveOutlineFromRings(hole, POLICY)[0]?.points).toEqual([
      { y: 0, z: 0 },
      { y: 0, z: 10 },
      { y: 10, z: 10 },
      { y: 10, z: 0 },
    ]);
  });
});

describe('Es wird nichts geprüft — das ist die Aufgabe des Gates', () => {
  it('nimmt einen leeren Ring hin und liefert ein leeres Polygon', () => {
    expect(deriveOutlineFromRings([{ vertices: [] }], POLICY)).toEqual([
      { points: [] },
    ]);
  });

  it('nimmt einen Ring mit einer einzigen Ecke hin', () => {
    expect(
      deriveOutlineFromRings([{ vertices: [{ y: 1, z: 2 }] }], POLICY),
    ).toEqual([{ points: [{ y: 1, z: 2 }] }]);
  });

  it('liest eine unbrauchbare Wölbung als Gerade, statt zu werfen', () => {
    // TOTAL HEISST TOTAL. Das Gate leitet den Umriss für die Drift-Prüfung neu
    // ab — eine Wölbung, die hier würfe, machte aus dem Sammelbefund einen
    // Absturz. Beide Sorten fallen auf `0`: die nicht endliche und die
    // endliche, die einen fast vollen Kreis von gewaltigem Radius beschreibt.
    for (const bulge of [Number.NaN, Number.POSITIVE_INFINITY, 1e14]) {
      const rings: Ring[] = [
        {
          vertices: [
            { y: 0, z: 0, bulge },
            { y: 100, z: 0 },
            { y: 100, z: 50 },
          ],
        },
      ];

      expect(deriveOutlineFromRings(rings, POLICY)).toEqual([
        {
          points: [
            { y: 0, z: 0 },
            { y: 100, z: 0 },
            { y: 100, z: 50 },
          ],
        },
      ]);
    }
  });

  it('hält die Reihenfolge der Ringe', () => {
    const result = deriveOutlineFromRings(
      [
        { vertices: [{ y: 0, z: 0 }] },
        { vertices: [{ y: 9, z: 9 }] },
      ],
      POLICY,
    );
    expect(result.map((polygon) => polygon.points[0])).toEqual([
      { y: 0, z: 0 },
      { y: 9, z: 9 },
    ]);
  });
});
