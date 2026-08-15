import type { SteelProfileData } from '@baustatik/steel-profiles';
import type { SectionProperties } from '../model/section-properties';
import { toSI } from './to-si';

/** Die kopierte Tabellenzeile als Querschnittswerte. */
export function profileProperties(
  profile: SteelProfileData,
): SectionProperties {
  return toSI({
    A: profile.A,
    Iy: profile.Iy,
    Iz: profile.Iz,
    Iyz: 0,
    ys: 0,
    zs: 0,
    yM: 0,
    zM: 0,
    It: profile.It,
    kappaY: profile.Ay === undefined ? undefined : profile.Ay / profile.A,
    kappaZ: profile.Az === undefined ? undefined : profile.Az / profile.A,
  });
}
