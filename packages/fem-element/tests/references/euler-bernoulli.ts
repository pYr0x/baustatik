/**
 * Euler-Bernoulli-REFERENZ — ausschliesslich fuer Tests.
 *
 * Diese Datei ist der unabhaengige Validierungsanker: die geschlossene
 * Hermite-Steifigkeit und der geschlossene konsistente Lastvektor werden hier
 * NICHT aus dem Timoshenko-Element (φ=0) abgeleitet, sondern eigenstaendig aus
 * den Hermite-Ansatzfunktionen. Nur so ist der spaetere Cross-Check
 * "Timoshenko(φ=0) === EB" nicht zirkulaer.
 *
 * Bewusst NICHT aus dem Package-Index exportiert (kein Produktivcode) und ohne
 * Gauss-Integration: die Lastfaelle sind geschlossene Sonderfaelle (konstante
 * und lineare Volllast-Segmente sowie Einzellasten). Der allgemeine
 * Gauss-Integrator entsteht spaeter mit dem Timoshenko-Element und wird gegen
 * genau diese Anker geprueft.
 *
 * Konvention wie in src/types.ts: DOF-Reihenfolge [u1, w1, θ1, u2, w2, θ2],
 * theta = dw/dx (Neigung), z abwaerts. GAs spielt fuer die EB-Referenz keine
 * Rolle (schubstarr).
 */

import type {
  LocalElementLoad,
  Matrix6,
  SectionStiffness,
  Vector6,
} from '../../src/types';

/**
 * Geschlossene EB-Steifigkeit: Axialanteil EA/L * [[1,-1],[-1,1]] plus
 * Biege-Hermite-Block EI/L^3 * [[12, 6L, -12, 6L], [6L, 4L^2, -6L, 2L^2],
 * [-12, -6L, 12, -6L], [6L, 2L^2, -6L, 4L^2]], eingeordnet in die 6 DOF.
 */
export function ebStiffness(props: SectionStiffness, L: number): Matrix6 {
  const { EA, EI } = props;
  const ka = EA / L;
  const kb = EI / (L * L * L);
  const L2 = L * L;

  return [
    [ka, 0, 0, -ka, 0, 0],
    [0, 12 * kb, 6 * L * kb, 0, -12 * kb, 6 * L * kb],
    [0, 6 * L * kb, 4 * L2 * kb, 0, -6 * L * kb, 2 * L2 * kb],
    [-ka, 0, 0, ka, 0, 0],
    [0, -12 * kb, -6 * L * kb, 0, 12 * kb, -6 * L * kb],
    [0, 6 * L * kb, 2 * L2 * kb, 0, -6 * L * kb, 4 * L2 * kb],
  ];
}

/**
 * Geschlossener konsistenter Lastvektor f_e = integral(N^T * q) fuer
 * Volllast-Segmente (linear von `from`=0 bis `to`=L) und Einzellasten.
 *
 * Teilsegmente (from != 0 oder to != L) werden bewusst abgelehnt — dafuer
 * braeuchte es den allgemeinen Integrator, der hier nicht existiert.
 */
export function ebConsistentLoad(
  load: LocalElementLoad,
  _props: SectionStiffness,
  L: number,
): Vector6 {
  const L2 = L * L;
  const f = [0, 0, 0, 0, 0, 0];

  for (const seg of load.segments) {
    if (Math.abs(seg.from) > 1e-9 || Math.abs(seg.to - L) > 1e-9) {
      throw new Error(
        'EB-Referenz: nur Volllast-Segmente (from=0, to=L) unterstuetzt.',
      );
    }

    // Axial qx(x) = ax + bx*ξ ueber [0,L]; N_u = [1-ξ, ξ].
    const ax = seg.qx1;
    const bx = seg.qx2 - seg.qx1;
    f[0] += (ax * L) / 2 + (bx * L) / 6;
    f[3] += (ax * L) / 2 + (bx * L) / 3;

    // Quer qz(x) = az + bz*ξ; f = integral(N_w^T qz) mit Hermite-N_w.
    const az = seg.qz1;
    const bz = seg.qz2 - seg.qz1;
    f[1] += (az * L) / 2 + bz * ((3 * L) / 20);
    f[2] += (az * L2) / 12 + bz * (L2 / 30);
    f[4] += (az * L) / 2 + bz * ((7 * L) / 20);
    f[5] += -(az * L2) / 12 + bz * (-L2 / 20);

    // Strecken-Moment my(x) = am + bm*ξ; f = integral(N_w'^T my).
    const am = seg.my1;
    const bm = seg.my2 - seg.my1;
    f[1] += -am + bm * (-1 / 2);
    f[2] += bm * (-L / 12);
    f[4] += am + bm * (1 / 2);
    f[5] += bm * (L / 12);
  }

  for (const p of load.points) {
    const xi = p.a / L;
    const xi2 = xi * xi;
    const xi3 = xi2 * xi;

    // Hermite-Ansatzfunktionen und ihre Ableitungen an ξ.
    const nW1 = 1 - 3 * xi2 + 2 * xi3;
    const nT1 = L * (xi - 2 * xi2 + xi3);
    const nW2 = 3 * xi2 - 2 * xi3;
    const nT2 = L * (-xi2 + xi3);
    const dW1 = (6 / L) * (xi2 - xi);
    const dT1 = 1 - 4 * xi + 3 * xi2;
    const dW2 = (6 / L) * (xi - xi2);
    const dT2 = -2 * xi + 3 * xi2;

    // Axiale Einzelkraft px: N_u = [1-ξ, ξ].
    f[0] += p.px * (1 - xi);
    f[3] += p.px * xi;

    // Quer-Einzelkraft pz: f = pz * N_w(a).
    f[1] += p.pz * nW1;
    f[2] += p.pz * nT1;
    f[4] += p.pz * nW2;
    f[5] += p.pz * nT2;

    // Einzelmoment my: f = my * N_w'(a).
    f[1] += p.my * dW1;
    f[2] += p.my * dT1;
    f[4] += p.my * dW2;
    f[5] += p.my * dT2;
  }

  return [f[0], f[1], f[2], f[3], f[4], f[5]];
}
