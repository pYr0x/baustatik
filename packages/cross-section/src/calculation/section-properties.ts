import { DEFAULT_SECTION_POLICY, type SectionPolicy } from '../policy';
import type { CrossSection } from '../model/cross-section';
import type { SectionProperties } from '../model/section-properties';
import type { ShapeSpec } from '../model/shape-spec';
import { feBlock } from './fe-block';
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

  // DIE PARAMETRISCHE FORM LIEST DENSELBEN FE-BLOCK wie die gezeichnete Figur
  // ([ADR 0062](../../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)).
  // Die geschlossene Formel liefert `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` — ohne
  // FE-Lauf, sofort —, der Block ergaenzt `It`, den Schubmittelpunkt und die
  // κ-Koeffizienten des Vollquerschnitts. Fehlt er, fehlen sie: schubstarr, und
  // `check()` sagt es (`ShearDeformationUnavailableWarning`).
  const shape = shapeValues(cs.shape);
  if (shape === undefined) return undefined;
  return toProperties(shape, feBlock(cs.feValues));
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
