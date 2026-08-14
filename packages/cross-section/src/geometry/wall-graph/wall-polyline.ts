import { Bulge } from '@baustatik/section-geometry';
import type { SectionPolicy } from '../../policy';
import type { PointYZ } from '../point-yz';
import type { GraphWall } from './graph';

/**
 * Diskretisiert eine Graphwand in der angegebenen Laufrichtung. Rückwärts
 * werden Endpunkte und Vorzeichen der DXF-Wölbung gemeinsam gedreht.
 */
export function wallPolyline(
  graphWall: GraphWall,
  fromNodeId: string,
  policy: SectionPolicy,
): readonly PointYZ[] {
  const forward = graphWall.wall.startNodeId === fromNodeId;
  const from = forward ? graphWall.start : graphWall.end;
  const to = forward ? graphWall.end : graphWall.start;
  const raw = graphWall.wall.bulge ?? 0;
  const p1 = { y: from.y, z: from.z };
  const p2 = { y: to.y, z: to.z };
  return Bulge.toPolyline(
    p1,
    p2,
    usableBulge(p1, p2, forward ? raw : -raw, policy),
    policy.discretisationTolerance,
  ).points;
}

/** Die Wölbung, wie alle Ableitungen sie lesen, oder `0`. */
export function usableBulge(
  p1: PointYZ,
  p2: PointYZ,
  bulge: number,
  policy: SectionPolicy,
): number {
  const chordLength = Math.hypot(p2.y - p1.y, p2.z - p1.z);
  return Bulge.isDiscretisable(
    chordLength,
    bulge,
    policy.discretisationTolerance,
  )
    ? bulge
    : 0;
}
