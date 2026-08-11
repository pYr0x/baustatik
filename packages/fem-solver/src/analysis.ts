/**
 * Der aufgeloeste Analysekontext: die Konfiguration, einmal zu Ende gedacht.
 *
 * WOZU: `check()` und `solve()` brauchen beide dieselben drei Auskuenfte —
 * welche Policy gilt, womit werden Lasten geprueft, welche Formulierung
 * rechnet. Waehlte jeder von beiden seine Defaults selbst, gaebe es zwei
 * Stellen, an denen dasselbe `??` steht, und die erste Abweichung davon
 * bemerkte niemand: `check()` sagte „in Ordnung" und `solve()` wuerfe.
 *
 * EINMAL AUFGELOEST, obwohl die Getter dynamisch bleiben. Das ist kein
 * Widerspruch: die Getter liefern MODELLDATEN, die sich waehrend der Sitzung
 * aendern; die Policy ist Teil der KONFIGURATION und aendert sich nur mit einem
 * neuen `SolverConfig`. Ein Rechenkopf, dessen Einstellungen sich unter der
 * Hand aendern, waere kein Rechenkopf, sondern eine Wundertuete.
 *
 * PACKAGE-INTERN. Nach aussen gibt es `AnalysisPolicy` und die Ports; dieser
 * Kontext ist nur die Verdrahtung dazwischen.
 */

import {
  type FrameElement2DFormulation,
  Timoshenko2D,
} from '@baustatik/fem-element';
import { createLoadValidator, type LoadValidator } from '@baustatik/fem-loads';
import type { SolverConfig } from './config';
import { type AnalysisPolicy, DEFAULT_ANALYSIS_POLICY } from './policy';
import { resolveSystemMatrixFactory, type SystemMatrix } from './system-matrix';

export type ResolvedAnalysis = {
  /** Die effektive Policy — vollstaendig, nie `undefined`. */
  readonly policy: AnalysisPolicy;

  /**
   * Die Lastpruefung, an `policy.loads` gebunden.
   *
   * Genau dasselbe bekommt der Eingabedialog, wenn die Anwendung ihm
   * `createLoadValidator(policy.loads)` gibt — deshalb kann er nicht
   * akzeptieren, was der Rechnen-Knopf ablehnt.
   */
  readonly loadValidator: LoadValidator;

  /** Die Elementformulierung. Voreinstellung `Timoshenko2D` (ADR 0004). */
  readonly formulation: FrameElement2DFormulation;

  /**
   * Eine leere Steifigkeitsmatrix ueber `n` Freiheitsgrade, in der von
   * `policy.linearSystem` verlangten Betriebsart und mit dem passenden Port
   * bereits gebunden.
   *
   * `solve.ts` bekommt darueber die Matrix, ohne je ein Matrixformat zu sehen
   * — und ohne zu wissen, welcher der beiden Ports gerade rechnet (ADR 0043).
   */
  readonly createMatrix: (n: number) => SystemMatrix;
};

/**
 * Loest Policy, Lastpruefung, Formulierung und Loeser aus der Config auf.
 *
 * Eine ausgelassene `analysisPolicy` heisst `DEFAULT_ANALYSIS_POLICY` — nicht
 * „teilweise gesetzt": Overrides nimmt die Config bewusst nicht entgegen. Die
 * Anwendung ruft einmal `createAnalysisPolicy(overrides)` und reicht exakt
 * dasselbe unveraenderliche Objekt an Solver UND Eingabedialog weiter.
 *
 * WIRFT, wenn zur eingestellten Betriebsart der Port fehlt. Das ist die eine
 * Stelle, an der das Aufloesen mehr tut als Defaults einzusetzen — und der
 * Grund dafuer ist derselbe wie fuer das Aufloesen ueberhaupt: was hier nicht
 * auffaellt, faellt in `check()` und `solve()` getrennt und verschieden auf.
 */
export function resolveAnalysis(config: SolverConfig): ResolvedAnalysis {
  const policy = config.analysisPolicy ?? DEFAULT_ANALYSIS_POLICY;

  return {
    policy,
    loadValidator: createLoadValidator(policy.loads),
    formulation: config.formulation ?? Timoshenko2D,
    createMatrix: resolveSystemMatrixFactory(policy.linearSystem, config),
  };
}
