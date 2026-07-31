/**
 * Querschnitt x Material -> Elementsteifigkeiten. Der Zwilling von
 * `@baustatik/fem-load-resolve`: Domaeneneingabe hinein, Elementzahlen heraus.
 *
 * KEINE FABRIK, KEINE CLOSURE, KEINE MAP. Solange der Querschnitt
 * Anwendungszustand war, brauchte der Adapter eine Sammlung und musste deshalb
 * `createSectionAdapter(...)` sein. Als MODELLSATZ braucht er sie nicht: die
 * Querschnitte reisen mit dem Modell, und eine reine Funktion, die sie
 * entgegennimmt, hat keinen Zustand, der veralten koennte.
 *
 * Warum der Adapter hier und nicht in `cross-section` lebt: `cross-section`
 * bleibt damit frei von `material` und `fem-element`. Der Wertekern haengt
 * nicht am FEM-Strang — er beantwortet „was ist die Flaeche", nicht „wie steif
 * ist der Stab".
 *
 * ZWEI FUNKTIONEN, ZWEI AUFGABEN: `resolveSectionStiffness` loest die IDs auf,
 * `sectionStiffness` rechnet. Die Trennung ist keine Testerleichterung, sondern
 * die Naht zwischen Nachschlagen und Multiplizieren — wer schon
 * `SectionProperties` in der Hand hat (Bemessung, Vorbemessung, ein Diagramm
 * ueber eine Profilreihe), braucht die Auflösung nicht.
 */

import {
  type CrossSection,
  type SectionProperties,
  sectionProperties,
} from '@baustatik/cross-section';
import type { Beam } from '@baustatik/fem';
import type { SectionStiffness } from '@baustatik/fem-element';
import {
  type Materials,
  type SteelGrade,
  UnknownGradeError,
} from '@baustatik/material';

/**
 * MPa -> kN/m2.
 *
 * `1 MPa = 1 N/mm2 = 1e6 N/m2 = 1e3 kN/m2`. Die ganze Einheitenkette haengt an
 * dieser einen Zahl:
 *
 *     material       Es, G [MPa]     -> [kN/m2] = [MPa] * 1000
 *     cross-section  A [m2], Iy [m4]
 *     ------------------------------------------------------------
 *     EA  = E * A            [kN]
 *     EI  = E * Iy           [kNm2]
 *     GAs = kappaZ * G * A   [kN]
 */
const MPA_TO_KN_PER_M2 = 1000;

/** Was die Rechnung vom Material braucht: zwei Moduln, beide in MPa. */
export type ElasticModuli = {
  /** Elastizitaetsmodul [MPa]. */
  readonly Es: number;
  /** Schubmodul [MPa]. */
  readonly G: number;
};

/**
 * Die Multiplikation — Geometrie mal Material.
 *
 * kappa gehoert zu z, weil der ebene Rahmen um y biegt und quer in z schiebt.
 * `kappaZ * G * A` ist ausserdem identisch mit `G * A_s`; ein Test rechnet
 * beide Wege und deckt damit einen vertauschten oder doppelt angewandten
 * kappa-Faktor auf, den die erste Rechnung allein nicht sieht.
 *
 * `kappaZ === undefined` heisst SCHUBSTARR, nicht „kappa = 0". Der Unterschied
 * ist der zwischen einem Stab ohne Schubverformung und einem Stab ohne
 * Steifigkeit; `'rigid'` ist der kanonische, JSON-faehige Weg dafuer.
 *
 * OB Schub ueberhaupt beruecksichtigt wird, entscheidet dieser Adapter NICHT.
 * Das ist eine globale Analyse-Einstellung, und `fem-solver` ersetzt `GAs`
 * bereits durch `'rigid'`, wenn `policy.shearDeformation === false`. Ein
 * zweiter Schalter hier waere ein zweiter Ort fuer dieselbe Entscheidung.
 */
export function sectionStiffness(
  props: SectionProperties,
  moduli: ElasticModuli,
): SectionStiffness {
  const E = moduli.Es * MPA_TO_KN_PER_M2;
  const G = moduli.G * MPA_TO_KN_PER_M2;

  return {
    EA: E * props.A,
    EI: E * props.Iy,
    GAs: props.kappaZ === undefined ? 'rigid' : props.kappaZ * G * props.A,
  };
}

/**
 * Die Steifigkeiten eines Stabs, oder `undefined`.
 *
 * `undefined` heisst „kenne ich nicht" — unbekannter `crossSectionId`,
 * unbekannter `materialId`, oder ein Querschnitt, dessen Werte sich nicht
 * bilden lassen. Der Solver-Port `getSectionStiffness` hat genau dieses
 * Vokabular; daraus wird ein Modellfehler IM BERICHT statt einer Ausnahme
 * mitten in `solve()`.
 *
 * `materialId` wird als Stahlsorte gelesen (`'S235'`). Das ist heute die
 * einzige Sorte, deren `Es` UND `G` der Katalog fuehrt; Beton und Holz
 * brauchen je einen eigenen Zweig, sobald ein Querschnitt sie meint.
 */
export function resolveSectionStiffness(
  beam: Beam,
  sections: readonly CrossSection[],
  materials: Materials,
): SectionStiffness | undefined {
  const section = sections.find((cs) => cs.id === beam.crossSectionId);
  if (section === undefined) return undefined;

  const props = sectionProperties(section);
  if (props === undefined) return undefined;

  const steel = resolveSteel(beam.materialId, materials);
  if (steel === undefined) return undefined;

  return sectionStiffness(props, steel);
}

/**
 * Die Uebersetzung „unbekannte Sorte" -> `undefined`.
 *
 * `materials.steel` WIRFT bei unbekannter Sorte, und das ist dort richtig: wer
 * `steel('S234')` hinschreibt, hat sich vertippt. An dieser Grenze ist es aber
 * kein Fehler des Aufrufers, sondern eine Aussage ueber das MODELL — und die
 * gehoert in den Bericht. Genau solche Uebersetzungen sind die Aufgabe eines
 * Adapters.
 */
function resolveSteel(
  materialId: string,
  materials: Materials,
): ElasticModuli | undefined {
  try {
    return materials.steel(materialId as SteelGrade);
  } catch (error) {
    if (error instanceof UnknownGradeError) return undefined;
    throw error;
  }
}
