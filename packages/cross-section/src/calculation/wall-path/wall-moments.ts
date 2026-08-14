import type { Segment } from './segments';

/** Querschnittswerte des Wandmodells, auf den Wandschwerpunkt bezogen. */
export type WallMoments = {
  readonly A: number;
  readonly ys: number;
  readonly zs: number;
  readonly Iy: number;
  readonly Iz: number;
  readonly Iyz: number;
};

/**
 * Integriert Linienelemente mal `t`, ohne den in der dünnwandigen Theorie
 * entfallenden Eigenanteil `t³/12`.
 */
export function wallMoments(
  segments: readonly Segment[],
): WallMoments | undefined {
  let A = 0;
  let Sy = 0;
  let Sz = 0;
  let IyO = 0;
  let IzO = 0;
  let IyzO = 0;

  for (const { y, z, dy, dz, length: L, t } of segments) {
    const dA = t * L;
    A += dA;
    Sy += dA * (y + (dy * L) / 2);
    Sz += dA * (z + (dz * L) / 2);
    IyO += dA * (z * z + z * dz * L + (dz * dz * L * L) / 3);
    IzO += dA * (y * y + y * dy * L + (dy * dy * L * L) / 3);
    IyzO += dA * (y * z + ((y * dz + z * dy) * L) / 2 + (dy * dz * L * L) / 3);
  }

  if (!(Number.isFinite(A) && A > 0)) return undefined;
  const ys = Sy / A;
  const zs = Sz / A;
  return Object.freeze({
    A,
    ys,
    zs,
    Iy: IyO - A * zs * zs,
    Iz: IzO - A * ys * ys,
    Iyz: IyzO - A * ys * zs,
  });
}
