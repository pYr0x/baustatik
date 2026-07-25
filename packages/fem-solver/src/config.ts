/**
 * Was der Rechenkopf von aussen braucht.
 *
 * DREI SORTEN FELDER, und der Unterschied ist der ganze Entwurf:
 *
 *   GETTER liefern die ROHDATEN. Sie sind Funktionen und keine Arrays (PULL,
 *   wie bei `createFEMViewer`), damit es keinen zweiten Datenbestand neben dem
 *   Store gibt, der synchron gehalten werden muesste. Jeder Aufruf sieht den
 *   aktuellen Stand.
 *
 *   PORTS liefern FAEHIGKEITEN, die dieses Package bewusst nicht besitzt. Alle
 *   drei existieren aus EINEM Grund: Isolierbarkeit. `fem-solver` verdrahtet
 *   die gesamte Rechenkette; genau deshalb muss es allein pruefbar sein — ohne
 *   WASM-Toolchain, ohne Querschnittskatalog, ohne eine bestimmte
 *   Balkentheorie. Siehe ADR 0009.
 *
 *   Die POLICY traegt die Analyse-Einstellungen, die sich als JSON schreiben
 *   lassen. Genau daran verlaeuft die Grenze zu den Ports: „direkt oder
 *   iterativ loesen" waere eine persistierbare Einstellung, „diese
 *   Solver-Implementierung" ist ein Port (ADR 0011).
 */

import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type {
  FrameElement2DFormulation,
  SectionProperties,
} from '@baustatik/fem-element';
import type { FEMLoad } from '@baustatik/fem-loads';
import type { AnalysisPolicy } from './policy';

/**
 * Loest `K d = F`. `K` liegt ZEILENWEISE flach (n*n Werte), `F` und das
 * Ergebnis sind je n Werte.
 *
 * Darf ein Promise liefern, weil die produktive Fassung ueber einen Worker
 * laeuft (`@baustatik/linear-solver-wasm` braucht ausserdem ein asynchrones
 * `init()`). Darf auch synchron liefern, damit eine Testfassung ohne Promise
 * auskommt; `solve()` ist in beiden Faellen asynchron.
 */
export type LinearSolve = (
  n: number,
  K: Float64Array,
  F: Float64Array,
) => Float64Array | Promise<Float64Array>;

export interface SolverConfig {
  /** PULL der Rohdaten aus dem Store — wie bei `createFEMViewer`. */
  getNodes: () => readonly Node[];
  getBeams: () => readonly Beam[];
  getSupports: () => readonly NodeSupport[];
  getLoads: () => readonly FEMLoad[];

  /**
   * Die Steifigkeiten eines Stabs, aus `crossSectionId` x `materialId`.
   *
   * `undefined` heisst „kenne ich nicht" und wird zu einem Modellfehler im
   * Bericht — bewusst kein Wurf, damit `check()` den Fall nennen kann, statt
   * dass `solve()` ueberraschend scheitert.
   *
   * Hier steckt spaeter der Adapter aus `material` x `cross-section`
   * (`fem-element/src/types.ts`). Heute gibt es ihn nicht: `cross-section`
   * exportiert nur den Typ `Segment`, Flaeche und Traegheitsmoment rechnet
   * nirgends jemand aus. Der Port ist die Naht, an der er einsteckt.
   */
  getSectionProperties: (beam: Beam) => SectionProperties | undefined;

  /** Der Linearsolver. Verdrahtet die Anwendung — hier ist er nur ein Aufruf. */
  solveLinearSystem: LinearSolve;

  /**
   * Die Elementformulierung. Voreinstellung `Timoshenko2D` (ADR 0004: „default
   * and first choice").
   *
   * Ein Port, damit die Solver-Tests eine TRIVIALE Formulierung einsetzen
   * koennen — Einheitsmatrix und konstanter Lastvektor. Dann sind
   * Freiheitsgrad-Nummerierung, Assemblierung, Transformation, Kondensation und
   * Randbedingungen mit von Hand nachrechenbaren Zahlen pruefbar. Ohne den Port
   * liefe jeder Test durch echte Timoshenko-Zahlen, und ein Vorzeichenfehler in
   * der Transformation waere von einem Elementfehler nicht zu trennen.
   */
  formulation?: FrameElement2DFormulation;

  /**
   * Die Analyse-Einstellungen als DATEN — Toleranzen, Warnschwellen und der
   * Schubschalter (`src/policy.ts`).
   *
   * Auslassen heisst `DEFAULT_ANALYSIS_POLICY`. Angenommen wird nur eine
   * VOLLSTAENDIGE Policy, keine Overrides: die Anwendung ruft einmal
   * `createAnalysisPolicy(overrides)` und reicht exakt dasselbe
   * unveraenderliche Objekt an den Solver UND an den Eingabedialog weiter
   * (dort ueber `createLoadValidator(policy.loads)`). Naehme diese Config
   * Overrides entgegen, gaebe es zwei Orte, an denen dieselbe Rechnung
   * unterschiedlich zusammengesetzt werden koennte.
   */
  readonly analysisPolicy?: AnalysisPolicy;
}
