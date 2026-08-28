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
 * ZWEI TUEREN, UND DIE ZWEITE IST REIN UND SYNCHRON. Neben dem Satz-Anteil
 * kommen aus dem `'solved'`-Arm das Netz und die geloesten FELDER heraus, beide
 * transient (ADR 0039); `recoverStresses(fields, forces, nu)` rechnet daraus σ,
 * τ und σv an Knoten und Elementen
 * ([ADR 0061](../../../docs/adr/0061-the-fe-stress-is-a-vector-at-a-node.md)).
 *
 * ```text
 * FEComputation { kind: 'solved', state, mesh, fields, diagnostics }
 *                                              │
 *                                              ▼
 *              recoverStresses(fields, forces, nu)   rein, synchron
 *                                              │
 *                                              ▼
 *                                        FEStressField
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
  type ReinforcementLayer,
  type SectionGeometry,
  type SectionPolicy,
} from '@baustatik/cross-section';
import type { Mesh2DResult } from '@baustatik/mesh-2d-wasm';
import { computeFromMesh, type FEDiagnostics, type FEFields } from './compute';
import { meshPlan } from './mesh';
import { prepareSection } from './prepare';
import { getMesher, getSolver } from './runtime';

export type { FEDiagnostics, FEFields, FEResult, SparseSolve } from './compute';
export { computeFromMesh } from './compute';
export { InvalidPoissonRatioError } from './errors';
export { type MeshPlan, type MeshRefusal, meshPlan } from './mesh';
export {
  type BoundaryEdge,
  type BoundaryLoop,
  type FESection,
  prepareSection,
} from './prepare';
export {
  type FEStressDiagnostics,
  type FEStressField,
  recoverStresses,
  type StressAtElement,
  type StressAtNode,
} from './stress';

export type FESectionOptions = {
  readonly reinforcement?: readonly ReinforcementLayer[];
};

/**
 * Was die async Tuer zurueckgibt: der Satz-Anteil und — wenn gerechnet wurde —
 * Netz, Felder und Diagnosen DANEBEN.
 *
 * DAS NETZ KOMMT HERAUS, STATT DRINNEN ZU BLEIBEN. Der Alternativentwurf waere,
 * es wegzuwerfen und die Anwendung zum Zeichnen selbst vernetzen zu lassen —
 * dann zeigte das Bild ein anderes Netz als die Zahl. Fuer `fields` gilt
 * dasselbe eine Stufe schaerfer: sie zweimal zu loesen hiesse, dieselbe
 * Faktorisierung zweimal zu rechnen (ADR 0061).
 *
 * NICHT AUF `state.status` DISKRIMINIERT. `fe-section-values.ts` fuehrt im
 * `unsupported`-Arm ein optionales `It` und begruendet es damit, dass ein
 * Abbruch NACH dem Vernetzen wieder entstehen kann; eine Union auf `status`
 * schloesse genau diesen Fall aus. `kind` ist ausserdem die Repo-Konvention und
 * das Muster, das `MeshPlan` nebenan schon verwendet.
 */
export type FEComputation =
  | {
      readonly kind: 'refused';
      /** Wandert IN die Geometrie. */
      readonly state: FESectionState;
    }
  | {
      readonly kind: 'solved';
      /** Wandert IN die Geometrie. */
      readonly state: FESectionState;
      /**
       * Das Netz, unter dem gerechnet wurde — TRANSIENT (ADR 0039), gehoert
       * NICHT in den Satz und wird nicht serialisiert. Es ist da, damit die
       * Anwendung zeichnen kann, was gerechnet wurde, ohne ein zweites Mal zu
       * vernetzen. `Mesh2DResult` passt ohne Umformung in `CrossSectionFEMesh`
       * des Viewers.
       */
      readonly mesh: Mesh2DResult;
      /**
       * Die geloesten Felder — TRANSIENT wie das Netz, die Eingabe der zweiten
       * Tuer `recoverStresses` (ADR 0061).
       */
      readonly fields: FEFields;
      /** Die Selbstpruefungen des Laufs — Diagnose, kein Vertrag. */
      readonly diagnostics: FEDiagnostics;
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
  options?: FESectionOptions,
): Promise<FEComputation> {
  const outline = deriveOutline(geometry, policy);
  const plan = meshPlan(outline, policy.FEElements, options?.reinforcement);
  if (plan.kind === 'refused') {
    return {
      kind: 'refused',
      state: { status: 'unsupported', reason: plan.reason },
    };
  }

  const [mesher, solve] = await Promise.all([getMesher(), getSolver()]);
  const mesh = mesher(plan.input);
  debugger;
  const section = prepareSection(mesh);
  const result = computeFromMesh(section, solve);

  return {
    kind: 'solved',
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
    fields: result.fields,
    diagnostics: result.diagnostics,
  };
}
