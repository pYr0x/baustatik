/**
 * Der Pruefbericht — die eine Auskunft vor dem Rechnen.
 *
 * DIE KERNAUSSAGE, aus der die Form folgt:
 *
 *   Der Ablauf ist eine ZUSTANDSMASCHINE, keine Fehlerliste.
 *
 * Eine Liste von Beanstandungen kann nicht sagen, was der Ablauf verlangt. Ein
 * leeres Array hiesse zweierlei: „geprueft und in Ordnung" und „es gab nichts
 * zu pruefen". Ein Modell ohne Lasten ist nicht falsch — es ist nur nicht
 * rechenbar (`d = 0` waere die richtige Antwort auf die falsche Frage). Genau
 * diese Zweideutigkeit macht einen Rechnen-Knopf unbaubar, und ein
 * `EmptyLoadSetError` waere die falsche Reparatur: der Anwender hat nichts
 * falsch gemacht, er ist noch nicht fertig.
 *
 * Deshalb traegt der Bericht einen ZUSTAND und keine Kombination aus Flag und
 * Begruendung. Siehe ADR 0010.
 */

import type { Beam, Node } from '@baustatik/fem';
import {
  isolatedNodeIds,
  type ModelValidationError,
  type ModelValidationWarning,
  validateModel,
} from '@baustatik/fem';
import {
  type FEMLoad,
  type LoadValidationError,
  type LoadValidationWarning,
  modelGeometry,
} from '@baustatik/fem-loads';
import { type ResolvedAnalysis, resolveAnalysis } from './analysis';
import type { SolverConfig } from './config';
import {
  LoadOnIsolatedNodeWarning,
  UnknownSectionStiffnessError,
} from './errors';
import { resolveLoadCase } from './resolve-load-case';

/**
 * Die fuenf Zustaende, in Rangfolge — der erste zutreffende gewinnt.
 *
 *   empty                kein Stab                     nichts zu pruefen
 *   invalid              Modell- ODER Lastfehler       hartes Tor
 *   unloaded             Modell traegt, keine Last     pruefbar, nicht rechenbar
 *   ready-with-warnings  nur Hinweise                  Rechnen erlaubt
 *   ready                sauber                        Rechnen
 *
 * `empty` heisst KEIN STAB — nicht „kein Stab und kein Auflager". Der Stab ist
 * das, woran gerechnet wird; Knoten und Auflager ohne Stab melden sich ohnehin
 * als Warnung.
 */
export type CheckState =
  | 'empty'
  | 'invalid'
  | 'unloaded'
  | 'ready-with-warnings'
  | 'ready';

/**
 * Die Lastbefunde — oder die Auskunft, dass es dazu gar nicht kam.
 *
 * `assessed: false` ist kein Fehlen von Daten, sondern eine Aussage: wegen
 * eines Modellfehlers wurden die Lasten NICHT beurteilt. Ohne diese
 * Unterscheidung sieht „keine Lastfehler gefunden" genauso aus wie „nicht
 * nachgesehen".
 */
export type LoadAssessment =
  | { assessed: false }
  | {
      assessed: true;
      errors: LoadValidationError[];
      warnings: LoadValidationWarning[];
    };

export type CheckReport = {
  model: {
    errors: ModelValidationError[];
    warnings: ModelValidationWarning[];
  };
  loads: LoadAssessment;
  state: CheckState;
  /**
   * ABGELEITET aus `state`, nicht daneben gespeichert — sonst gaebe es zwei
   * Wahrheiten. Existiert, damit der Rechnen-Knopf eine Zeile bleibt und nicht
   * jede Oberflaeche dieselbe Oder-Verknuepfung neu schreibt.
   */
  canSolve: boolean;
};

/**
 * Prueft Modell und Lasten in EINEM Durchgang und in der richtigen Reihenfolge.
 *
 * REIHENFOLGE UND KURZSCHLUSS GEHOEREN INS PACKAGE, nicht in die Anwendung.
 * Die Lastpruefung fragt das Modell (`beamAxis`). Bei einer haengenden
 * Knotenreferenz meldet sie fuer JEDE Last auf diesem Stab zusaetzlich
 * `UnknownLoadTargetError` — aus einem Modellfehler wuerden zwanzig Meldungen,
 * von denen neunzehn Folgefehler sind. Also: Modell zuerst, und bei
 * Modellfehlern die Lasten gar nicht erst pruefen.
 *
 * KEIN CACHE. Je Aufruf neu, wie `geometry()`. Der Bericht veraltet, sobald der
 * Store sich aendert — das zu bemerken ist Sache der Anwendung.
 *
 * `loadCaseId` sagt, WELCHER Lastfall beurteilt wird. Der Bericht traegt die id
 * bewusst nicht: er ist fluechtig, wird nie abgelegt, und der Aufrufer hat sie
 * gerade selbst uebergeben. Beim Ergebnis ist es umgekehrt — siehe
 * `SolveResult.loadCaseId`.
 */
export function check(config: SolverConfig, loadCaseId: string): CheckReport {
  return checkWith(config, resolveAnalysis(config), loadCaseId);
}

/**
 * Dieselbe Pruefung mit einem bereits aufgeloesten Kontext.
 *
 * Package-intern, damit `createFEMSolver` den Kontext EINMAL aufloest und
 * `check()` und `solve()` denselben benutzen — sonst waehlte jeder von beiden
 * seine Defaults selbst, und die erste Abweichung faende niemand.
 */
export function checkWith(
  config: SolverConfig,
  analysis: ResolvedAnalysis,
  loadCaseId: string,
): CheckReport {
  const nodes = config.getNodes();
  const beams = config.getBeams();
  const supports = config.getSupports();
  // Die EINGEGEBENEN Werte, nicht die gefakterten: eine Meldung soll die Zahl
  // nennen, die der Anwender getippt hat. Der Fallfaktor aendert an keinem
  // heutigen Urteil etwas — die Invariante steht in ADR 0013 und haengt an
  // einem Test in fem-loads.
  const loads = resolveLoadCase(config, loadCaseId).loads;

  const model = validateModel(nodes, beams, supports);

  // M7: der Katalog ist dem Modell nicht bekannt, aber dem Port. Der Befund
  // gehoert trotzdem zu den Modellfehlern — ein Stab ohne Steifigkeit ist kein
  // Rechenproblem, sondern ein unvollstaendiges Modell.
  for (const beam of beams) {
    if (config.getSectionStiffness(beam) === undefined) {
      model.errors.push(
        new UnknownSectionStiffnessError(
          beam.id,
          beam.crossSectionId,
          beam.materialId,
        ),
      );
    }
  }

  const loadAssessment: LoadAssessment =
    model.errors.length > 0
      ? { assessed: false }
      : assessLoads(analysis, nodes, beams, loads);

  const state = stateOf(beams.length, loads.length, model, loadAssessment);

  return {
    model,
    loads: loadAssessment,
    state,
    canSolve: state === 'ready' || state === 'ready-with-warnings',
  };
}

function assessLoads(
  analysis: ResolvedAnalysis,
  nodes: readonly Node[],
  beams: readonly Beam[],
  loads: readonly FEMLoad[],
): LoadAssessment {
  // Der gebundene Validator, nicht die freie Funktion: sonst pruefte der
  // Bericht gegen die Default-Policy, waehrend `solve()` mit der
  // eingestellten rechnet.
  const { errors, warnings } = analysis.loadValidator.validateLoads(
    modelGeometry(nodes, beams),
    loads,
  );

  // Derselbe Graph, den die Modellpruefung fuer M5 benutzt — hier mit den
  // Lasten gekreuzt. Deshalb liegt er als eigene Auskunft in `@baustatik/fem`
  // und nicht privat in dessen Validierung.
  const isolated = isolatedNodeIds(nodes, beams);
  if (isolated.size > 0) {
    for (const load of loads) {
      if (load.target !== 'node') continue;
      for (const nodeId of load.nodeIds) {
        if (isolated.has(nodeId)) {
          warnings.push(new LoadOnIsolatedNodeWarning(load.id, nodeId));
        }
      }
    }
  }

  return { assessed: true, errors, warnings };
}

function stateOf(
  beamCount: number,
  loadCount: number,
  model: { errors: unknown[]; warnings: unknown[] },
  loads: LoadAssessment,
): CheckState {
  if (beamCount === 0) return 'empty';
  if (model.errors.length > 0) return 'invalid';
  if (loads.assessed && loads.errors.length > 0) return 'invalid';
  if (loadCount === 0) return 'unloaded';
  const warned =
    model.warnings.length > 0 || (loads.assessed && loads.warnings.length > 0);
  return warned ? 'ready-with-warnings' : 'ready';
}
