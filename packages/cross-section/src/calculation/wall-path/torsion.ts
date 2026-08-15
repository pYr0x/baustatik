import { Polygon } from '@baustatik/section-geometry';
import type { Step } from './topology';

/**
 * `It = 4·A_m²/∮(ds/t) + ⅓·Σ_offen l·t³`.
 *
 * BREDT FÜR DIE ZELLE, `⅓·l·t³` FÜR DIE OFFENEN ZWEIGE, und der zweite Term
 * läuft AUSDRÜCKLICH nur über die Stücke ausserhalb der Zelle: die
 * Zellwandungen tragen ihren Anteil bereits über den geschlossenen Umlauf, und
 * ihn zweimal zu zählen wäre zwischen den beiden Termen ein Faktor von drei
 * Zehnerpotenzen.
 *
 * `A_m` ist die von der MITTELLINIE eingeschlossene Fläche, im festgelegten
 * Umlaufsinn und deshalb positiv.
 */
export function torsionConstant(
  steps: readonly Step[],
  cycle: readonly Step[],
): number | undefined {
  let open = 0;
  for (const step of steps) {
    if (step.sigma !== 0) continue;
    for (const { length, t } of step.segments) open += (length * t ** 3) / 3;
  }
  if (!Number.isFinite(open)) return undefined;
  if (cycle.length === 0) return open;

  // `cycle` steht bereits im festgelegten Umlaufsinn — die Reihenfolge des
  // Baumdurchlaufs ist eine andere und taugt für `A_m` nicht.
  let lengthOverT = 0;
  const points: { y: number; z: number }[] = [];
  for (const step of cycle) {
    for (const segment of step.segments) {
      lengthOverT += segment.length / segment.t;
      points.push({ y: segment.y, z: segment.z });
    }
  }

  const Am = Math.abs(Polygon.signedArea(points));
  if (!(Number.isFinite(Am) && Am > 0)) return undefined;
  if (!(Number.isFinite(lengthOverT) && lengthOverT > 0)) return undefined;

  const value = (4 * Am * Am) / lengthOverT + open;
  return Number.isFinite(value) ? value : undefined;
}
