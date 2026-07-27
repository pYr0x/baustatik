/**
 * Der Einstiegspunkt der Berechnung — das Gegenstueck zu `createFEMViewer`.
 *
 * WARUM ES DIESEN EINSTIEGSPUNKT GIBT: die Rechenkette besteht aus vier
 * Packages (`fem` und `fem-loads` pruefen, `fem-load-resolve` aufloesen,
 * `fem-element` zum Ersatzknotenvektor, hier assemblieren und loesen). Ohne
 * einen Einstiegspunkt muesste die Anwendung diese Reihenfolge kennen und
 * Zwischenbegriffe wie `LoadModelGeometry` oder `LocalElementLoad` in die Hand
 * nehmen. Der Viewer macht es vor: `createFEMViewer` bekommt Rohdaten und
 * verbirgt `femSpecs`, `gridSpecs` und den Viewport. Siehe ADR 0007.
 *
 * NICHT `@baustatik/fem`: dort wohnen die Typen des Modells und seine Regeln,
 * aber keine Rechnung. Die Trennlinie ist „Regel zum Typ" gegen „Verdrahtung
 * der Kette" (ADR 0008).
 *
 * PULL STATT KOPIE, wie beim Viewer (`fem-viewer/src/viewer.ts`): die Config
 * traegt Getter, keine Arrays. Dadurch gibt es keinen zweiten Datenbestand, der
 * mit dem Store synchron gehalten werden muesste — jeder Aufruf sieht den
 * aktuellen Stand.
 */

import { resolveAnalysis } from './analysis';
import { type CheckReport, checkWith } from './check';
import type { SolverConfig } from './config';
import { type SolveResult, solveAllWith, solveWith } from './solve';

export type FEMSolver = {
  /**
   * Modell und Lasten pruefen — die eine Auskunft vor dem Rechnen.
   *
   * Ersetzt das fruehere `validate()`. Das hiess „pruefe die Lasten"; mit dem
   * Modell darin waere derselbe Name eine stillschweigende Erweiterung
   * gewesen, und zwei Pruef-Ausgaenge, von denen einer die halbe Wahrheit
   * sagt, sind genau die Zweideutigkeit, gegen die der Bericht gebaut ist.
   *
   * Ein Lasten-ENTWURF, der noch nicht im Store liegt, geht hier bewusst NICHT
   * durch — `getLoadCases()` sieht ihn nicht. Der Eingabedialog prueft waehrend
   * des Tippens direkt gegen `@baustatik/fem-loads` (`validateLoad` mit einem
   * `modelGeometry(...)`). Er braucht fuer einen Tippfehler keinen Solver.
   *
   * `loadCaseId` benennt den zu beurteilenden Lastfall. Er wird UEBERGEBEN und
   * nicht aus einem „aktiven Lastfall" gelesen: sonst haengte das Urteil an der
   * Bedienung. Unbekannte id wirft `UnknownLoadCaseError` (ADR 0014).
   */
  check: (loadCaseId: string) => CheckReport;

  /**
   * Rechnet. Wirft den ersten Modell- oder Lastfehler, bevor irgendetwas
   * gerechnet wird — das Tor aus `error-handling-in-libraries.md`.
   *
   * Asynchron, weil der Linearsolver ueber einen Port laeuft, der einen Worker
   * bedienen koennen muss. Der Fehler aus dem Tor kommt deshalb als abgelehnte
   * Promise; fuer jeden Aufrufer mit `await` im `try` ist das nicht
   * unterscheidbar.
   *
   * Rechnet GENAU EINEN Lastfall — den genannten. Ueberlagerung mehrerer Faelle
   * zu einer Kombination kommt spaeter; das ist etwas anderes als sie
   * nebeneinander zu rechnen, siehe `solveAll`.
   */
  solve: (loadCaseId: string) => Promise<SolveResult>;

  /**
   * Rechnet ALLE Lastfaelle, in der Reihenfolge von `getLoadCases()`.
   *
   * Zusammen mit `solve` sind das die genau ZWEI Rechenoperationen: alle, oder
   * ein bestimmter. Bricht beim ersten Fehler ab, wie `solve` — wer wissen will,
   * welcher Fall klemmt, fragt vorher `check(id)` je Fall.
   *
   * Jedes Ergebnis nennt ueber `loadCaseId` seinen Lastfall, das Array braucht
   * also keine Zuordnung daneben.
   */
  solveAll: () => Promise<SolveResult[]>;
};

/**
 * Baut den Rechenkopf ueber ein Modell.
 *
 * Haelt keinen Zustand: kein Ergebnis, kein Bericht, keine Momentaufnahme des
 * Modells. Ein aufgehobener Bericht waere von gestern, sobald der Store sich
 * aendert — und das zu bemerken ist Sache der Anwendung.
 *
 * DIE KONFIGURATION wird dagegen EINMAL aufgeloest: Policy, Lastvalidierung
 * und Formulierung stehen fest, sobald der Rechenkopf existiert. Kein
 * Widerspruch zum PULL: die Getter liefern Modelldaten, die sich aendern
 * duerfen; eine Einstellung, die sich unter der Hand aendert, waere dagegen
 * keine Einstellung. Und `check()` und `solve()` bekommen so garantiert
 * denselben Kontext.
 */
export function createFEMSolver(config: SolverConfig): FEMSolver {
  const analysis = resolveAnalysis(config);

  return {
    check: (loadCaseId) => checkWith(config, analysis, loadCaseId),
    solve: (loadCaseId) => solveWith(config, analysis, loadCaseId),
    solveAll: () => solveAllWith(config, analysis),
  };
}
