import { describe, expect, it } from 'vitest';
import type { LocalElementLoad, SectionStiffness } from '../src/types';
import {
  expectClose,
  expectThreeRigidBodyModes,
  matVec,
  reverseNodes,
  solve2,
  T_REV,
  toDense,
} from './helpers';
import { ebConsistentLoad, ebStiffness } from './references/euler-bernoulli';

const props: SectionStiffness = { EA: 1e5, EI: 2e4, GAs: 'rigid' };
const L = 3;

describe('EB-Referenz: Steifigkeit', () => {
  const K = ebStiffness(props, L);

  it('ist symmetrisch', () => {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expectClose(K[i][j], K[j][i]);
      }
    }
  });

  it('hat genau die drei Starrkoerpermoden (K*r = 0)', () => {
    const modes = [
      [1, 0, 0, 1, 0, 0], // Translation x
      [0, 1, 0, 0, 1, 0], // Translation z
      [0, 0, 1, 0, L, 1], // Starre Drehung (w = theta*x)
    ];
    for (const r of modes) {
      for (const c of matVec(K, r)) {
        expect(Math.abs(c)).toBeLessThan(1e-6);
      }
    }
  });

  it('hat GENAU drei Nulleigenwerte (Rangtest)', () => {
    // Ergaenzt den Test darueber: der zeigt, WELCHE Moden null sind, dieser,
    // dass es keine weiteren gibt (eine Nullmatrix bestuende nur den ersten).
    expectThreeRigidBodyModes(toDense(K));
  });

  it('ist invariant unter Knotenvertauschung (T K T^T = K)', () => {
    const rotated = reverseNodes(toDense(K));
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        expectClose(rotated[i][j], K[i][j]);
      }
    }
  });
});

describe('EB-Referenz: Kragarm (ein Element)', () => {
  // Knoten 1 eingespannt (DOF 0,1,2), Knoten 2 frei (DOF 3,4,5).
  // Biegung entkoppelt von Axial; frei bleiben w2 (Index 4) und theta2 (Index 5).
  const K = ebStiffness(props, L);

  it('Punktlast P am Ende: w = P L^3 / (3 EI)', () => {
    const P = 10;
    const { x: w2 } = solve2(K[4][4], K[4][5], K[5][4], K[5][5], P, 0);
    expectClose(w2, (P * L ** 3) / (3 * props.EI), 1e-9);
  });

  it('Gleichlast q: w = q L^4 / (8 EI)', () => {
    const q = 5;
    const load: LocalElementLoad = {
      segments: [{ from: 0, to: L, qx1: 0, qx2: 0, qz1: q, qz2: q, my1: 0, my2: 0 }],
      points: [],
    };
    const f = ebConsistentLoad(load, props, L);
    // Freie Knotenlasten am Knoten 2: [f_w2, f_theta2].
    const { x: w2 } = solve2(K[4][4], K[4][5], K[5][4], K[5][5], f[4], f[5]);
    expectClose(w2, (q * L ** 4) / (8 * props.EI), 1e-9);
  });
});

describe('EB-Referenz: konsistenter Lastvektor', () => {
  it('Gleichlast qz liefert das Handbuch-Ergebnis', () => {
    const q = 4;
    const load: LocalElementLoad = {
      segments: [{ from: 0, to: L, qx1: 0, qx2: 0, qz1: q, qz2: q, my1: 0, my2: 0 }],
      points: [],
    };
    const f = ebConsistentLoad(load, props, L);
    expectClose(f[1], (q * L) / 2);
    expectClose(f[2], (q * L ** 2) / 12);
    expectClose(f[4], (q * L) / 2);
    expectClose(f[5], -(q * L ** 2) / 12);
  });

  it('haelt das Kraeftegleichgewicht (Summe = aufgebrachte Last)', () => {
    const load: LocalElementLoad = {
      segments: [
        // Dreieckslast quer: 0 -> 6, Gesamt = 6*L/2.
        { from: 0, to: L, qx1: 2, qx2: 2, qz1: 0, qz2: 6, my1: 0, my2: 0 },
      ],
      points: [{ a: 1, px: 0, pz: 7, my: 0 }],
    };
    const f = ebConsistentLoad(load, props, L);
    // Axial: konstante 2 kN/m ueber L.
    expectClose(f[0] + f[3], 2 * L);
    // Quer: Dreieck (6*L/2) + Punktlast 7.
    expectClose(f[1] + f[4], (6 * L) / 2 + 7);
  });

  it('spiegelt eine symmetrische Gleichlast unter Knotenvertauschung', () => {
    const q = 4;
    const load: LocalElementLoad = {
      segments: [{ from: 0, to: L, qx1: 0, qx2: 0, qz1: q, qz2: q, my1: 0, my2: 0 }],
      points: [],
    };
    const f = ebConsistentLoad(load, props, L);
    // Dieselbe Transformation wie beim K-Test muss die symmetrische Last
    // unveraendert lassen.
    const rev = matVec(T_REV, f);
    for (let i = 0; i < 6; i++) {
      expectClose(rev[i], f[i]);
    }
  });
});
