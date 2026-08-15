import { DEFAULT_SECTION_POLICY, type SectionPolicy } from '../policy';
import type { CrossSection } from '../model/cross-section';
import type { SectionProperties } from '../model/section-properties';
import type { ShapeSpec } from '../model/shape-spec';
import { geometryValues } from './geometry-properties';
import { profileProperties } from './profile-properties';
import { hollowRectangle } from './shapes/hollow-rectangle';
import { iSymmetric } from './shapes/i-symmetric';
import { toProperties } from './shapes/kernel';
import { rectangle } from './shapes/rectangle';
import { tSection } from './shapes/t-section';
import { toSI } from './to-si';
import { MM_TO_CM } from './units';

/**
 * Die Querschnittswerte eines Querschnitts, die eine Berechnungstür des
 * Packages. `undefined` heißt, dass die Eingabe nicht berechenbar ist.
 *
 * Die Policy ist optional für gelegentliche Aufrufer. Auf der FEM-Rechenstrecke
 * wird sie ausdrücklich übergeben, damit Wandweg und mitgeführter Umriss dieselbe
 * Diskretisierung verwenden.
 */
export function sectionProperties(
  cs: CrossSection,
  policy: SectionPolicy = DEFAULT_SECTION_POLICY,
): SectionProperties | undefined {
  if (cs.kind === 'profile') return profileProperties(cs.data);

  if (cs.kind === 'section-geometry') {
    const geometry = geometryValues(cs.geometry, policy);
    return geometry === undefined ? undefined : toSI(geometry);
  }

  const shape = shapeValues(cs.shape);
  return shape === undefined ? undefined : toProperties(shape);
}

/** Die mm -> cm-Stelle der parametrischen Form. */
function shapeValues(spec: ShapeSpec) {
  const c = MM_TO_CM;
  switch (spec.kind) {
    case 'rectangle':
      return rectangle(spec.b * c, spec.h * c);
    case 'hollow-rectangle':
      return hollowRectangle(
        spec.b * c,
        spec.h * c,
        spec.t * c,
        spec.idealisation,
      );
    case 'i-symmetric':
      return iSymmetric(
        spec.h * c,
        spec.b * c,
        spec.tw * c,
        spec.tf * c,
        spec.idealisation,
      );
    case 't-section':
      return tSection(
        spec.bf * c,
        spec.hf * c,
        spec.bw * c,
        spec.h * c,
        spec.idealisation,
      );
  }
}
