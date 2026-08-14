/**
 * Die Auswertung — REIN UND SYNCHRON, ein Durchlauf ueber die Elemente.
 *
 * DIE ZERLEGUNG NACH `m` IST HIER EXAKT UND KEINE ANPASSUNG. `ψ` ist affin in
 * `m = ν/(1+ν)`, also `ψ = ψ₀ + m·ψ₁` — und mit `τ = ∇ψ + p` und
 * `p = (0, −z²/(2·Iy) + m·y²/(2·Iy))` ist auch das Spannungsfeld affin
 * ([ADR 0048](../../../docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md)):
 *
 * ```text
 * τ_a = ( ∂ψ₀/∂y ,  ∂ψ₀/∂z − z²/(2·Iy) )
 * τ_b = ( ∂ψ₁/∂y ,  ∂ψ₁/∂z + y²/(2·Iy) )
 * ```
 *
 * DIE BEIDEN ALGEBRAISCHEN TERME STEHEN HIER EXAKT und nicht im Feld. Das ist
 * der Grund fuer diese Aufteilung von `p` und keine Kosmetik: beim Rechteck ist
 * `ψ₀` dadurch LINEAR und ein Tri6-Feld traegt es exakt, waehrend die
 * Aufteilung ohne den `z²`-Term ein kubisches `ψ₀` verlangte und `κ = 5/6` nur
 * noch auf acht statt zwoelf Stellen traefe (gemessen in
 * `docs/messungen/verwoelbung-gegen-dirichlet.md`).
 *
 * Die Schubenergie ist eine QUADRATISCHE Form darueber, also
 * `1/κ = A·(E00 + 2m·E01 + m²·E11)`. Die drei Zahlen fallen aus EINEM Integral
 * — es wird nicht fuer mehrere ν gerechnet und hinterher gefittet, wie es das
 * Messgeraet `verifaction/nu-koeffizientenform.mjs` tut.
 *
 * `E01` IST DER FREIE SELBSTTEST, UND SEIT ADR 0048 EIN SCHAERFERER.
 * `d₁ = 2·A·E01` ist beweisbar null
 * ([ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)):
 * `τ_a` ist wirbelfrei, `τ_b` quellenfrei mit verschwindender Normalkomponente,
 * und damit steht `∫τ_a·τ_b dA = 0` nach partieller Integration.
 *
 * DAS GILT IM KONTINUUM UND NICHT MEHR IM DISKRETEN. Solange `Φ` mit
 * Dirichlet-Rand geloest wurde, war `τ_b = (∂Φ_b/∂z, −∂Φ_b/∂y)` die exakte
 * Drehung eines Gradienten und `Φ_b` auf dem Rand exakt null — `E01` fiel
 * maschinengenau aus. Ueber `∇ψ` gilt die Orthogonalitaet nur noch bis auf den
 * Diskretisierungsfehler: gemessen `1,8·10⁻¹⁰` bei 9300 und `1,5·10⁻¹¹` bei
 * 37 000 Elementen, also rund `O(h³)`.
 *
 * DAS IST EIN GEWINN UND KEIN VERLUST. Eine strukturell null gesetzte Groesse
 * prueft nichts; eine, die gegen null LAEUFT, prueft das Feld.
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
  psi0: Float64Array,
  psi1: Float64Array,
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
      let dPsi0Dy = 0;
      let dPsi0Dz = 0;
      let dPsi1Dy = 0;
      let dPsi1Dz = 0;
      let dOmegaDy = 0;
      let dOmegaDz = 0;
      for (let i = 0; i < 6; i += 1) {
        const node = atOrThrow(nodes, i);
        const dy = atOrThrow(point.dNdy, i);
        const dz = atOrThrow(point.dNdz, i);
        const a = atOrThrow(psi0, node);
        const b = atOrThrow(psi1, node);
        const w = atOrThrow(omega, node);
        dPsi0Dy += a * dy;
        dPsi0Dz += a * dz;
        dPsi1Dy += b * dy;
        dPsi1Dz += b * dz;
        dOmegaDy += w * dy;
        dOmegaDz += w * dz;
      }

      const { y, z, weight } = point;
      const tauYa = dPsi0Dy;
      const tauZa = dPsi0Dz - (z * z) / (2 * frame.Iy);
      const tauYb = dPsi1Dy;
      const tauZb = dPsi1Dz + (y * y) / (2 * frame.Iy);

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
