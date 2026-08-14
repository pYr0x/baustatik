/**
 * Die FE-Querschnittswerte eines gezeichneten VOLLQUERSCHNITTS.
 *
 * ```text
 * SectionGeometry (outline oder midline)
 *    │  deriveOutline(geometry, policy)
 *    ▼
 * Polygon[]      Umlaufsinn traegt Material/Loch (ADR 0034)
 *    │  Ringe → Mesh2DInput,  maxElementArea = A / FEElements
 *    ▼
 * @baustatik/mesh-2d-wasm         async, Worker
 *    │  Tri6
 *    ▼
 * assemble.ts + compute.ts        rein und synchron (ADR 0047)
 *    ▼
 * @baustatik/sparse-solver-wasm   solve(n, rows, cols, values, k, f)
 *    ▼
 * evaluate.ts                     It, yM, zM, zwei ν-freie Koeffizienten
 *    ▼
 * fem-section-resolve             setzt ν des Stabmaterials ein → κ → GAs
 * ```
 *
 * EINE GEOMETRIE HEREIN, EIN ERGEBNIS HERAUS — KEINE ID. Die Tuer kennt weder
 * `CrossSection.id` noch einen Zwischenspeicher und fuehrt keinen Schluessel:
 * was sie bekommt, rechnet sie. Dass je distinktem Querschnitt genau einmal
 * gerechnet wird, entsteht dadurch, dass die ANWENDUNG ueber ihre
 * Querschnittsliste laeuft und den bereits gefuellten Satz ueberspringt.
 *
 * WARUM EIN EIGENER SCHRITT: `sectionProperties` und `getSectionStiffness`
 * antworten synchron; Vernetzung
 * ([ADR 0039](../../../docs/adr/0039-meshing-is-a-transient-worker-capability.md))
 * und Sparse-Solve sind asynchrone Worker-Ports. Die FE kann hinter keiner der
 * beiden Tueren laufen.
 *
 * EIN LAUF, KEINE VERFEINERUNG. Es gibt keinen Konvergenzlauf und keine
 * gespeicherte Konvergenzzahl: die Netzdichte ist eine Angabe des Anwenders
 * (`SectionPolicy.FEElements`). Ein automatischer zweiter Lauf mit
 * vervierfachter Dichte ist genau bei grossen Figuren der Fall, in dem die
 * Rechnung unbrauchbar lange dauert — und er fiele ungefragt an.
 */

import {
  deriveOutline,
  type FESectionState,
  type SectionGeometry,
  type SectionPolicy,
} from '@baustatik/cross-section';
import type { Mesh2DResult } from '@baustatik/mesh-2d-wasm';
import { computeFromMesh, type FEDiagnostics } from './compute';
import { meshPlan } from './mesh';
import { prepareSection } from './prepare';
import { getMesher, getSolver } from './runtime';

export type { FEDiagnostics, FEResult, SparseSolve } from './compute';
export { computeFromMesh } from './compute';
export { type MeshPlan, type MeshRefusal, meshPlan } from './mesh';
export { type BoundaryLoop, type FESection, prepareSection } from './prepare';

/**
 * Was die async Tuer zurueckgibt: der Satz-Anteil und das Netz DANEBEN.
 *
 * DAS NETZ KOMMT HERAUS, STATT DRINNEN ZU BLEIBEN. Der Alternativentwurf waere,
 * es wegzuwerfen und die Anwendung zum Zeichnen selbst vernetzen zu lassen —
 * dann zeigte das Bild ein anderes Netz als die Zahl.
 */
export type FEComputation = {
  /** Wandert IN die Geometrie. */
  readonly state: FESectionState;
  /**
   * Das Netz, unter dem gerechnet wurde — TRANSIENT (ADR 0039), gehoert NICHT
   * in den Satz und wird nicht serialisiert. Es ist da, damit die Anwendung
   * zeichnen kann, was gerechnet wurde, ohne ein zweites Mal zu vernetzen.
   * `Mesh2DResult` passt ohne Umformung in `CrossSectionFEMesh` des Viewers.
   *
   * Abwesend, wenn vor dem Vernetzen verweigert wurde
   * (`'disconnected-areas'`).
   */
  readonly mesh?: Mesh2DResult;
  /**
   * Die Selbstpruefungen des Laufs — Diagnose, kein Vertrag. Abwesend, wenn
   * nicht gerechnet wurde.
   */
  readonly diagnostics?: FEDiagnostics;
};

/**
 * Rechnet die FE-Werte einer gezeichneten Geometrie.
 *
 * DER UMRISS WIRD NEU ABGELEITET und nicht aus `geometry.outline` genommen: die
 * Tuer bekommt eine Policy, und unter DIESER Policy soll gerechnet werden. Fuer
 * einen Satz, der unter derselben Policy entstanden ist, ist das dieselbe Figur
 * — und wenn nicht, ist es die richtige.
 */
export async function computeFESectionValues(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): Promise<FEComputation> {
  const outline = deriveOutline(geometry, policy);
  const plan = meshPlan(outline, policy.FEElements);
  if (plan.kind === 'refused') {
    return { state: { status: 'unsupported', reason: plan.reason } };
  }

  const [mesher, solve] = await Promise.all([getMesher(), getSolver()]);
  const mesh = mesher(plan.input);
  const section = prepareSection(mesh);
  const result = computeFromMesh(section, solve);

  return {
    state: {
      status: 'computed',
      values: Object.freeze({
        It: result.It,
        yM: result.shear.yM,
        zM: result.shear.zM,
        inverseKappaY: Object.freeze(result.shear.inverseKappaY) as readonly [
          number,
          number,
        ],
        inverseKappaZ: Object.freeze(result.shear.inverseKappaZ) as readonly [
          number,
          number,
        ],
      }),
      // Der Fingerabdruck stammt aus dem NETZ und nicht aus Green: gerechnet
      // wurde auf dieser Flaeche, und genau darueber soll er Auskunft geben.
      fingerprint: Object.freeze({ A: section.A, Iy: section.Iy }),
    },
    mesh,
    diagnostics: result.diagnostics,
  };
}
