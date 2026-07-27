/**
 * Von der id zum Lastfall — die eine Stelle, die das tut.
 *
 * Package-intern und von `check()` und `solve()` GETEILT: sonst koennte der
 * Bericht einen anderen Lastfall beurteilen als die Rechnung nimmt, und die
 * erste Abweichung faende niemand. Dasselbe Argument wie bei `checkWith`
 * und `solveWith`, die sich den aufgeloesten Analysekontext teilen.
 */

import type { LoadCase } from '@baustatik/fem-loads';
import type { SolverConfig } from './config';
import { UnknownLoadCaseError } from './errors';

/**
 * Sucht den Lastfall. Wirft, wenn es ihn nicht gibt.
 *
 * `find` und keine Eindeutigkeitspruefung: die ids kommen aus einer
 * id-Erzeugung, die keine Kollisionen zulaesst (`crypto.randomUUID` in der
 * Anwendung), und dieselbe Zusage gilt fuer die Last-ids. Sollten je
 * Projektdateien eingelesen werden, gehoert die Pruefung an DIESE Grenze — ein
 * strikter Parser wie `parseLoadValidationPolicy`, nicht ein Durchgang bei jeder
 * Rechnung.
 */
export function resolveLoadCase(
  config: SolverConfig,
  loadCaseId: string,
): LoadCase {
  const loadCase = config
    .getLoadCases()
    .find((candidate) => candidate.id === loadCaseId);

  if (loadCase === undefined) {
    throw new UnknownLoadCaseError(loadCaseId);
  }

  return loadCase;
}
