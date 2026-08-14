/**
 * Die Auswertung — REIN UND SYNCHRON, ein Durchlauf ueber die Elemente.
 *
 * DIE ZERLEGUNG NACH `m` IST HIER EXAKT UND KEINE ANPASSUNG. `Φ` ist affin in
 * `m = ν/(1+ν)`, also `Φ = Φ_a + m·Φ_b` — und damit ist auch das Spannungsfeld
 * affin:
 *
 * ```text
 * τ_a = ( ∂Φ_a/∂z ,  −∂Φ_a/∂y − z²/(2·Iy) )
 * τ_b = ( ∂Φ_b/∂z ,  −∂Φ_b/∂y            )     der Randterm traegt kein m
 * ```
 *
 * Die Schubenergie ist eine QUADRATISCHE Form darueber, also
 * `1/κ = A·(E00 + 2m·E01 + m²·E11)`. Die drei Zahlen fallen aus EINEM Integral
 * — es wird nicht fuer mehrere ν gerechnet und hinterher gefittet, wie es das
 * Messgeraet `verifaction/nu-koeffizientenform.mjs` tut.
 *
 * `E01` IST DER FREIE SELBSTTEST: `d₁ = 2·A·E01` ist beweisbar null
 * ([ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)),
 * und die Zahl faellt hier ohnehin an. Sie ist ausdruecklich KEIN Anzeiger fuer
 * eine vergessene Lochbedingung — mit erzwungenem `c₁ = 0` ist sie ebenfalls
 * null, waehrend κ um 85,6 % daneben liegt.
 */

import { atOrThrow } from '@baustatik/core';
import type { Frame } from './assemble';
import { elementNodes, type FESection } from './prepare';
import { elementPoints, TRIANGLE_6 } from './tri6';

export type ShearEvaluation = {
  /** Die drei Anteile der Schubenergie: `energy(m) = E00 + 2m·E01 + m²·E11`. */
  readonly E00: number;
  readonly E01: number;
  readonly E11: number;
  /** `∫(y·τ_z − z·τ_y) dA` bei `m = 0` — der Schubmittelpunkt nach WEBER. */
  readonly torque: number;
  /** Die Trefftz-Projektion bei `m = 0`. */
  readonly projection: number;
  /** Dieselben beiden Groessen als Steigung in `m` — beide sollen klein sein. */
  readonly torqueSlope: number;
  readonly projectionSlope: number;
  /** Die Gleichgewichtsprobe: `∫τ_z dA` muss `1` sein, `∫τ_y dA` null. */
  readonly Fz: number;
  readonly Fy: number;
  readonly FzSlope: number;
  readonly FySlope: number;
  /** `∫(y² + z² + y·ω,z − z·ω,y) dA` — drehinvariant. */
  readonly It: number;
};

/**
 * Ein Durchlauf ueber alle Elemente mit der Sechspunktregel.
 *
 * SECHS PUNKTE, WEIL DIE ENERGIE ES VERLANGT: `τ_z` traegt `z²/(2·Iy)`, sein
 * Quadrat ist vom Grad 4. Die Dreipunktregel waere dort um Groessenordnungen
 * daneben, ohne dass irgendetwas auffiele.
 */
export function evaluateShear(
  section: FESection,
  frame: Frame,
  phiA: Float64Array,
  phiB: Float64Array,
  omega: Float64Array,
): ShearEvaluation {
  let E00 = 0;
  let E01 = 0;
  let E11 = 0;
  let torque = 0;
  let torqueSlope = 0;
  let projection = 0;
  let projectionSlope = 0;
  let Fz = 0;
  let Fy = 0;
  let FzSlope = 0;
  let FySlope = 0;
  let It = 0;

  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);

  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      elementY[i] = atOrThrow(frame.y, node);
      elementZ[i] = atOrThrow(frame.z, node);
    }

    for (const point of elementPoints(TRIANGLE_6, elementY, elementZ)) {
      let dPhiADy = 0;
      let dPhiADz = 0;
      let dPhiBDy = 0;
      let dPhiBDz = 0;
      let dOmegaDy = 0;
      let dOmegaDz = 0;
      for (let i = 0; i < 6; i += 1) {
        const node = atOrThrow(nodes, i);
        const dy = atOrThrow(point.dNdy, i);
        const dz = atOrThrow(point.dNdz, i);
        const a = atOrThrow(phiA, node);
        const b = atOrThrow(phiB, node);
        const w = atOrThrow(omega, node);
        dPhiADy += a * dy;
        dPhiADz += a * dz;
        dPhiBDy += b * dy;
        dPhiBDz += b * dz;
        dOmegaDy += w * dy;
        dOmegaDz += w * dz;
      }

      const { y, z, weight } = point;
      const tauYa = dPhiADz;
      const tauZa = -dPhiADy - (z * z) / (2 * frame.Iy);
      const tauYb = dPhiBDz;
      const tauZb = -dPhiBDy;

      E00 += (tauYa * tauYa + tauZa * tauZa) * weight;
      E01 += (tauYa * tauYb + tauZa * tauZb) * weight;
      E11 += (tauYb * tauYb + tauZb * tauZb) * weight;

      torque += (y * tauZa - z * tauYa) * weight;
      torqueSlope += (y * tauZb - z * tauYb) * weight;
      projection += (tauYa * (dOmegaDy - z) + tauZa * (dOmegaDz + y)) * weight;
      projectionSlope +=
        (tauYb * (dOmegaDy - z) + tauZb * (dOmegaDz + y)) * weight;

      Fz += tauZa * weight;
      Fy += tauYa * weight;
      FzSlope += tauZb * weight;
      FySlope += tauYb * weight;

      It += (y * y + z * z + y * dOmegaDz - z * dOmegaDy) * weight;
    }
  }

  return {
    E00,
    E01,
    E11,
    torque,
    projection,
    torqueSlope,
    projectionSlope,
    Fz,
    Fy,
    FzSlope,
    FySlope,
    It,
  };
}
