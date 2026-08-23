import type { SectionProperties, StressPoint } from '@baustatik/cross-section';
import { describe, expect, it } from 'vitest';
import { stressesAtPoints } from '../src/index';

/**
 * DER EINZIGE TEST DES `Iyz`-ZWEIGS — und er MUSS synthetisch sein.
 *
 * Jede Form, die heute Spannungspunkte liefert, ist mindestens einfach
 * symmetrisch, also `Iyz = 0`. Über den öffentlichen Weg ist der allgemeine
 * Zweig damit gar nicht erreichbar. Deshalb hat `stressesAtPoints` getrennte
 * Argumente: erfundene `SectionProperties` mit handgemachten Punkten.
 *
 * DAS ORAKEL IST DAS GEDREHTE RECHTECK. `Iy`, `Iz` und `Iyz` eines um θ
 * gedrehten Rechtecks sind geschlossen bekannt, und die Hauptachsenrechnung am
 * UNGEDREHTEN muss dieselben Spannungen liefern — es ist dieselbe Figur unter
 * derselben Last, nur anders aufgeschrieben.
 *
 * DAS GILT FUER τ EBENSO WIE FUER σ: `Sy` und `Sz` sind lineare Funktionale
 * der Koordinaten und drehen sich genau wie `y` und `z`. Die
 * Hauptachsenrechnung ist damit auch für den Schubfluss ein sauberes Orakel.
 */

/** Ein Rechteck 100 × 200, in seinen eigenen Hauptachsen. */
const B = 100;
const H = 200;
/** Trägheitsmoment um die Hauptachse `u` (die „Höhenachse") [mm⁴]. */
const Iuu = (B * H ** 3) / 12;
/** Trägheitsmoment um `v` [mm⁴]. */
const Ivv = (H * B ** 3) / 12;
const A = B * H;

const MM4_TO_M4 = 1e-12;
const MM2_TO_M2 = 1e-6;
const MM3_TO_CM3 = 1e-3;

const THETA = (30 * Math.PI) / 180;
const c = Math.cos(THETA);
const s = Math.sin(THETA);

/** Die Figur in ihren eigenen Achsen: kein Deviationsmoment. */
const principal: SectionProperties = {
  A: A * MM2_TO_M2,
  Iy: Iuu * MM4_TO_M4,
  Iz: Ivv * MM4_TO_M4,
  Iyz: 0,
  ys: 0,
  zs: 0,
  alpha: 0,
  Iu: Iuu * MM4_TO_M4,
  Iv: Ivv * MM4_TO_M4,
};

/**
 * Dieselbe Figur, um θ gedreht, im festen `(y, z)`.
 *
 * ```text
 * y = u·cosθ − v·sinθ        Iy  = cos²θ·Iuu + sin²θ·Ivv
 * z = u·sinθ + v·cosθ        Iz  = sin²θ·Iuu + cos²θ·Ivv
 *                            Iyz = sinθ·cosθ·(Ivv − Iuu)     [Iyz = +∫y·z dA]
 * ```
 */
const rotated: SectionProperties = {
  A: A * MM2_TO_M2,
  Iy: (c * c * Iuu + s * s * Ivv) * MM4_TO_M4,
  Iz: (s * s * Iuu + c * c * Ivv) * MM4_TO_M4,
  Iyz: s * c * (Ivv - Iuu) * MM4_TO_M4,
  ys: 0,
  zs: 0,
  // Die Achse mit dem GROESSEREN Trägheitsmoment ist `u`, und sie steht um θ
  // gegen `+y` — positiv von `+y` nach `+z` (ADR 0031).
  alpha: THETA,
  Iu: Iuu * MM4_TO_M4,
  Iv: Ivv * MM4_TO_M4,
};

/**
 * Die Stützstellen in den EIGENEN Achsen der Figur: `u`, `v` [mm], `Su`, `Sv`
 * [mm³], Schnittbreite `t` [mm]. `Su`/`Sv` sind die Grashof-Momente der
 * Vollfigur — plausibel gewählt, für den Test aber nur „irgendein lineares
 * Funktional der Koordinaten".
 */
const stations = [
  { u: 0, v: 0, Su: (B * (0 - H * H / 4)) / 2, Sv: 0, t: B },
  { u: 0, v: H / 4, Su: (B * ((H / 4) ** 2 - (H * H) / 4)) / 2, Sv: 0, t: B },
  { u: -B / 4, v: -H / 3, Su: -1.1e5, Sv: (H * ((B / 4) ** 2 - (B * B) / 4)) / 2, t: H },
  { u: B / 2, v: H / 2, Su: 0, Sv: 0, t: B },
] as const;

/** Die Punktliste in den Hauptachsen — `u` steht an der Stelle von `y`. */
const principalPoints: readonly StressPoint[] = stations.map((p, i) => ({
  nr: i + 1,
  wall: `w${i + 1}`,
  y: p.u,
  z: p.v,
  t: p.t,
  Sy: p.Su * MM3_TO_CM3,
  Sz: p.Sv * MM3_TO_CM3,
  ty: 1,
  tz: 0,
}));

/** Dieselben Punkte, mitgedreht — Koordinaten UND statische Momente. */
const rotatedPoints: readonly StressPoint[] = stations.map((p, i) => ({
  nr: i + 1,
  wall: `w${i + 1}`,
  y: p.u * c - p.v * s,
  z: p.u * s + p.v * c,
  t: p.t,
  Sy: (s * p.Sv + c * p.Su) * MM3_TO_CM3,
  Sz: (c * p.Sv - s * p.Su) * MM3_TO_CM3,
  ty: 1,
  tz: 0,
}));

describe('Das gedrehte Rechteck', () => {
  it('trägt ein Deviationsmoment, das die Hauptachsenform gar nicht kennt', () => {
    // Ohne diese Zusicherung prüfte der Test unten den `Iyz`-Zweig womöglich
    // nie: bei `Iyz = 0` sind beide Rechnungen trivial dieselbe.
    expect(principal.Iyz).toBe(0);
    expect(Math.abs(rotated.Iyz)).toBeGreaterThan(0.2 * rotated.Iy);
    // `Iy + Iz` ist eine Invariante der Drehung — die Probe, dass die
    // gedrehten Werte selbst stimmen.
    expect(rotated.Iy + rotated.Iz).toBeCloseTo(principal.Iy + principal.Iz, 15);
  });

  it('liefert σ wie die Hauptachsenrechnung am ungedrehten', () => {
    // Das Momentenpaar dreht mit — ein Moment ist ein VEKTOR, und seine
    // Komponenten drehen wie die Koordinaten (ADR 0060). Genau das ist der
    // Punkt, an dem eine „gefälligere" Vorzeichenwahl für `Mz` zerbräche.
    const Mu = 120;
    const Mv = 45;

    const oracle = stressesAtPoints(principal, principalPoints, {
      N: 300,
      My: Mu,
      Mz: Mv,
    });
    const general = stressesAtPoints(rotated, rotatedPoints, {
      N: 300,
      My: Mu * c - Mv * s,
      Mz: Mu * s + Mv * c,
    });

    general.forEach((row, i) => {
      expect(row.sigma, `P${row.nr}`).toBeCloseTo(oracle[i].sigma, 9);
    });
    // Und die Rechnung ist nicht trivial null geworden.
    expect(Math.max(...general.map((r) => Math.abs(r.sigma)))).toBeGreaterThan(1);
  });

  it('liefert τ wie die Hauptachsenrechnung am ungedrehten', () => {
    const Vu = 60;
    const Vv = 25;

    const oracle = stressesAtPoints(principal, principalPoints, {
      Vy: Vu,
      Vz: Vv,
    });
    const general = stressesAtPoints(rotated, rotatedPoints, {
      Vy: Vu * c - Vv * s,
      Vz: Vu * s + Vv * c,
    });

    general.forEach((row, i) => {
      expect(row.tau, `P${row.nr}`).toBeCloseTo(oracle[i].tau, 9);
    });
    expect(Math.max(...general.map((r) => Math.abs(r.tau)))).toBeGreaterThan(1);
  });
});
