import type { cm, cm2, cm4 } from '@baustatik/units';
import type { SectionProperties } from './properties';
import { CM_TO_M, CM2_TO_M2, CM4_TO_M4 } from './units';

/**
 * Die Querschnittswerte in KATALOGEINHEITEN — die gemeinsame Zwischenform
 * beider Quellen.
 *
 * Eine parametrische Form (`ShapeResult`) und eine Tabellenzeile
 * (`SteelProfileData`) reden nach diesem Umbau dieselbe Sprache: cm², cm⁴, cm.
 * Genau das macht `toSI` möglich — vorher rechnete die eine Quelle bereits in
 * Metern und die andere noch nicht, und es gab zwei Umrechnungsstellen.
 */
export type CatalogueValues = {
  readonly A: cm2;
  readonly Iy: cm4;
  readonly Iz: cm4;
  readonly Iyz: cm4;
  readonly ys: cm;
  readonly zs: cm;
  /** Dimensionslos — reist unverändert durch. */
  readonly kappaY?: number;
  readonly kappaZ?: number;
};

/**
 * DIE EINZIGE STELLE IM PACKAGE, an der aus Katalogeinheiten SI wird.
 *
 * Innen rechnet alles in cm — das ist die Einheit, in der die Norm druckt und
 * in der man ein Ergebnis gegen die Tabelle diffen kann (`Iy: 8356`, nicht
 * `8.356e-5`). Nach aussen geht SI, weil `fem-section-resolve` mit `A` in m²
 * und `E` in kN/m² multipliziert und dabei kN bzw. kNm² herauskommen sollen.
 *
 * kappa läuft unverändert durch: es ist ein Verhältnis zweier Flächen und
 * damit dimensionslos. Dass es hier NICHT umgerechnet wird, ist der Grund,
 * warum der ganze Maßstabswechsel von Metern auf Zentimeter die
 * kappa-Testreihe unberührt lässt.
 */
export function toSI(values: CatalogueValues): SectionProperties {
  return {
    A: values.A * CM2_TO_M2,
    Iy: values.Iy * CM4_TO_M4,
    Iz: values.Iz * CM4_TO_M4,
    Iyz: values.Iyz * CM4_TO_M4,
    ys: values.ys * CM_TO_M,
    zs: values.zs * CM_TO_M,
    kappaY: values.kappaY,
    kappaZ: values.kappaZ,
  };
}
