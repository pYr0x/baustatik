/**
 * Die Rechnung ÜBER dem positionierten Wandweg: κ, der Schubmittelpunkt und
 * `It`
 * ([ADR 0040](../../../../../docs/adr/0040-the-wall-path-is-positioned.md),
 * [ADR 0041](../../../../../docs/adr/0041-two-figures-for-the-wall-path.md)).
 *
 * WAS HIER NICHT STEHT: die Geometrie. `segments.ts` liefert die
 * positionierten Stücke, `../shear.ts` die lagelose Energieform. Diese Datei
 * legt den WEG darüber — welche Wand in welcher Richtung, wo `S` bei 0 anfängt
 * und was an einer Verzweigung zusammenläuft.
 *
 * DREI GRÖSSEN, ZWEI FIGUREN (ADR 0041):
 *
 * | Grösse   | `S` aus    | `I` aus       |
 * | -------- | ---------- | ------------- |
 * | κ        | Wandmodell | Umrissfigur   |
 * | `yM`/`zM`| Wandmodell | Wandmodell    |
 *
 * κ ist NACH AUSSEN gebunden: so rechnet RSTAB, und daran hängt die
 * Übereinstimmung mit der IPE-Reihe (ADR 0021) — es ist dieselbe Mischung, die
 * `../shapes/t-section.ts` seit jeher fährt. Der Schubmittelpunkt ist NACH INNEN
 * gebunden: `∫S dz = I` gilt nur für EINE Figur, und gemischt käme die
 * Resultierende als `V·I_wand/I_umriss` heraus (IPE 300: rund 2 %).
 *
 * EINE ZELLE JA, ZWEI NEIN. Bei `0` Zellen läuft der Weg als Baum von den
 * freien Enden; bei `1` kommt EINE skalare Verträglichkeitsgleichung dazu:
 *
 * ```text
 * S₀ = − ∮(S_offen/t) ds / ∮(ds/t)
 * ```
 *
 * Das ist kein Löser. `S₀` ist auf den Zellsegmenten ein KONSTANTER Zuschlag
 * auf `c0`, und deshalb bleiben `ShearFlowInterval` und `shearArea`
 * unverändert. Ab zwei Zellen stünde dort ein `n×n`-System — das ist ein
 * anderes Vorhaben, und bis dahin bleiben die Werte `undefined` und das Gate
 * sagt es.
 *
 * KEINE QUADRATUR, wie in `../shear.ts`: `S(s)` ist auf jedem Segment ein
 * Polynom zweiten Grades, `∫S ds` und `∫S²/t ds` sind geschlossen angebbar.
 */

import { cellCount, componentCount } from '../../geometry/wall-graph/branches';
import { flow, kappa, shearCentre } from './flow';
import type { SegmentRun } from './segments';
import { topology } from './topology';
import { torsionConstant } from './torsion';
import { wallMoments } from './wall-moments';

/**
 * Die Werte der UMRISSFIGUR, gegen die κ gerechnet wird — die Spalte
 * „Umrissfigur" aus ADR 0041.
 *
 * IM MASSSTAB DER SEGMENTE, und das ist eine VORBEDINGUNG und keine
 * Empfehlung: κ ist `A_s/A` und damit dimensionslos, aber nur, wenn `∫S²/t ds`
 * aus dem Wandweg und `I²`/`A` aus dem Umriss in DERSELBEN Längeneinheit `L`
 * stehen. Gemischt (Segmente in mm, Umriss in cm) käme eine Zehnerpotenz
 * heraus, die niemandem auffällt. `geometryValues` (`../geometry-properties.ts`) skaliert
 * deshalb BEIDE Figuren mit demselben Faktor, bevor es hier hereinreicht.
 */
export type OutlineFigure = {
  /** Querschnittsfläche der Umrissfigur [L²]. */
  readonly A: number;
  /** `∫z² dA` um den Umriss-Schwerpunkt [L⁴]. */
  readonly Iy: number;
  /** `∫y² dA` um den Umriss-Schwerpunkt [L⁴]. */
  readonly Iz: number;
};

/**
 * Was aus dem Wandweg fällt, IN DER EINHEIT DER SEGMENTE — dieselbe
 * Längeneinheit `L`, in der `Segment` und `OutlineFigure` hereinkamen. Der
 * Wandweg rechnet massstabsfrei; umgerechnet wird an den beiden bekannten
 * Stellen (`geometryValues` nach cm, `toSI` nach SI).
 *
 * `undefined` heisst NICHT ERMITTELT, nach dem Muster von `kappaY?` in
 * `SectionProperties` — nicht „null". Bei zwei Zellen, mehreren unverbundenen
 * Teilen und bei der Entartung (eine gerade Wand trägt für ihre eigene Achse
 * kein `S`) stehen die Zahlen deshalb nicht da, statt falsch dazustehen.
 */
export type WallPath = {
  /** Schubkorrekturbeiwert κ = A_s/A [-]. */
  readonly kappaY?: number;
  readonly kappaZ?: number;
  /** Schubmittelpunkt im EINGABESYSTEM der Segmente [L]. */
  readonly yM?: number;
  readonly zM?: number;
  /** Torsionsträgheitsmoment [L⁴]. */
  readonly It?: number;
  /** Die zyklomatische Zahl des Wandgraphen — `0` oder `1` sind rechenbar. */
  readonly cells: number;
  /** Die Zahl der unverbundenen Teile — nur `1` ist rechenbar. */
  readonly components: number;
  /**
   * Der Restwert von `Sy` beziehungsweise `Sz` am Ende des ganzen Weges.
   *
   * SELBSTPRÜFEND, wie `closingMoment` in `partIntervals`: das erste
   * Flächenmoment um den Schwerpunkt verschwindet, also muss der Weg auf 0
   * schliessen. TEST-ORAKEL UND KEIN LAUFZEITBEFUND — ein Wert daneben hiesse,
   * dass die Zerlegung und nicht die Eingabe kaputt ist.
   */
  readonly closingSy: number;
  readonly closingSz: number;
  /**
   * Der LAUF, an dem die Zelle aufgeschnitten wurde, benannt durch seine
   * kleinste Wand-Id — `undefined` ohne Zelle.
   *
   * TEST-ORAKEL, wie `closingSy`: der Schnitt darf das Ergebnis nicht bewegen,
   * aber er muss REPRODUZIERBAR sein, sonst hinge `S₀` am Zufall der
   * Eingabereihenfolge. Die Wahlregel steht in `circulation`; ein Test hält
   * beides fest — die Wahl selbst und ihre Folgenlosigkeit.
   *
   * DER LAUF UND NICHT DIE WAND: aufgeschnitten wird an einem KNOTEN, nämlich
   * am Anfangsknoten dieses Laufs. Die kleinste Wand-Id ist der Name, unter
   * dem der Lauf in der Wahl antritt — sie benennt ihn richtungsunabhängig.
   */
  readonly cutWallId?: string;
};

/**
 * Der Wandweg über einer bereits positionierten Zerlegung.
 *
 * `undefined` heisst „es gab nichts zu rechnen": kein Segment, oder ein
 * Wandmodell ohne Fläche.
 */
export function wallPath(
  runs: readonly SegmentRun[],
  outline: OutlineFigure,
): WallPath | undefined {
  const branches = runs.map((run) => run.branch);
  const cells = cellCount(branches);
  const components = componentCount(branches);

  const all = runs.flatMap((run) => [...run.segments]);
  const wall = wallMoments(all);
  if (wall === undefined) return undefined;

  // Ab zwei Zellen begänne ein Gleichungssystem, bei mehreren Teilen gäbe es
  // keinen gemeinsamen Weg. Beides meldet das Gate mit Namen.
  if (cells > 1 || components !== 1) {
    return Object.freeze({ cells, components, closingSy: 0, closingSz: 0 });
  }

  const pathTopology = topology(runs, cells === 1);
  if (pathTopology === undefined) {
    return Object.freeze({ cells, components, closingSy: 0, closingSz: 0 });
  }
  const { cycle, steps } = pathTopology;

  // Zwei Läufe über DIESELBE Geometrie: `Sy` trägt den Hebelarm in `z`, `Sz`
  // den in `y`. Genau deshalb steckt `S` nicht im `Segment` (ADR 0040).
  const forVz = flow(
    steps,
    (s) => s.z - wall.zs,
    (s) => s.dz,
    cells === 1,
  );
  const forVy = flow(
    steps,
    (s) => s.y - wall.ys,
    (s) => s.dy,
    cells === 1,
  );

  return Object.freeze({
    cells,
    components,
    closingSy: forVz.closing,
    closingSz: forVy.closing,
    ...(pathTopology.cutWallId === undefined
      ? {}
      : { cutWallId: pathTopology.cutWallId }),
    // `kappaY` gehört zu `Iz`: die Querkraft in y biegt um z.
    kappaY: kappa(outline.Iz, outline.A, forVy.entries),
    kappaZ: kappa(outline.Iy, outline.A, forVz.entries),
    yM: shearCentre(-1, wall.Iy, forVz.entries),
    zM: shearCentre(+1, wall.Iz, forVy.entries),
    It: torsionConstant(steps, cycle),
  });
}
