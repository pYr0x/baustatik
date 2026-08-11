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
 *   PORTS liefern FAEHIGKEITEN, die dieses Package bewusst nicht besitzt. Sie
 *   existieren aus EINEM Grund: Isolierbarkeit. `fem-solver` verdrahtet die
 *   gesamte Rechenkette; genau deshalb muss es allein pruefbar sein — ohne
 *   WASM-Toolchain, ohne Querschnittskatalog, ohne eine bestimmte
 *   Balkentheorie. Siehe ADR 0009.
 *
 *   Die POLICY traegt die Analyse-Einstellungen, die sich als JSON schreiben
 *   lassen. Genau daran verlaeuft die Grenze zu den Ports: „direkt oder
 *   iterativ loesen" waere eine persistierbare Einstellung, „diese
 *   Solver-Implementierung" ist ein Port (ADR 0011).
 *
 * DIE LOESERWAHL LIEGT AUF BEIDEN SEITEN DIESER GRENZE, und das ist kein
 * Widerspruch: WELCHER Weg gerechnet wird, sagt `AnalysisPolicy.linearSystem`
 * — eine Zeichenkette, die sich schreiben laesst. OB er zur Verfuegung steht,
 * sagt der Port. Fehlt der Port zur gewaehlten Betriebsart, wirft
 * `createFEMSolver` (ADR 0043).
 */

import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type {
  FrameElement2DFormulation,
  SectionStiffness,
} from '@baustatik/fem-element';
import type { LoadCase } from '@baustatik/fem-loads';
import type { AnalysisPolicy } from './policy';

/**
 * Was beim Loesen von `K d = F` herauskommt: die Verschiebungen — oder der
 * Befund, dass es sie nicht gibt.
 *
 * Die Kinematik reist als ERGEBNIS zurueck, nicht als Wurf. Ein Mechanismus ist
 * kein Fehler des Ports, sondern eine Aussage ueber das Modell; ein Wurf ist dem
 * echten Scheitern vorbehalten (kaputter Worker, gebrochener Vertrag). Wer
 * beides in einen Kanal legt, kann sie hinterher nicht mehr trennen. Siehe
 * ADR 0012.
 */
export type LinearSolveOutcome =
  | {
      readonly kind: 'solved';
      /**
       * Die Loesungen, SPALTENWEISE flach als `n x k`: zuerst die `n` Werte
       * der ersten rechten Seite, dann die der zweiten.
       */
      readonly d: Float64Array;
    }
  | {
      readonly kind: 'singular';
      /**
       * Die Zeile im REDUZIERTEN System, in der die Singularitaet aufgefallen
       * ist. `solve()` uebersetzt sie ueber `free[index]` in Knoten und
       * Richtung.
       *
       * Ein HINWEIS, kein Beweis — die Stelle, an der der Rangabfall waehrend
       * der Zerlegung sichtbar wird, nicht notwendig der Freiheitsgrad, der
       * sich bewegt.
       */
      readonly index: number;
      /**
       * Das kleinste skalierte Pivot als Mass fuer die Naehe zur Kinematik.
       * `0` heisst „die Zerlegung ist gescheitert", ein kleiner positiver Wert
       * heisst „sie gelang, aber das Ergebnis waere Rauschen".
       */
      readonly pivotRatio: number;
    };

/**
 * EIN ERGEBNISTYP, ZWEI EINGABETYPEN — und beide Ports melden dieselben zwei
 * Ausgaenge. Was sich unterscheidet, ist ausschliesslich die Form, in der `K`
 * hineingeht; was herauskommt, ist in beiden Faellen dieselbe Aussage ueber
 * dasselbe Gleichungssystem. Zwei Ergebnistypen haetten `solve.ts` gezwungen,
 * das Matrixformat zu kennen, das es gerade nicht kennen soll (ADR 0043).
 *
 * `pivotRatio` und `singularIndex` sind dabei EINWERTIG, obwohl `k` rechte
 * Seiten hineingehen: sie gehoeren der Zerlegung und damit der Matrix, nicht
 * einer einzelnen Lastseite.
 */

/**
 * Loest `K d = F` DICHT. `K` liegt ZEILENWEISE flach (n*n Werte), `F`
 * spaltenweise flach mit `n * rhsColumns` Werten.
 *
 * Die Argumentfolge ist die der Rust-Signatur
 * (`solve(n, k, rhs_columns, f)`), damit zwischen Port und Crate nichts
 * umzusortieren ist.
 *
 * Darf ein Promise liefern, weil die produktive Fassung ueber einen Worker
 * laeuft (`@baustatik/linear-solver-wasm` braucht ausserdem ein asynchrones
 * `init()`). Darf auch synchron liefern, damit eine Testfassung ohne Promise
 * auskommt; `solve()` ist in beiden Faellen asynchron.
 */
export type LinearSolve = (
  n: number,
  K: Float64Array,
  rhsColumns: number,
  F: Float64Array,
) => LinearSolveOutcome | Promise<LinearSolveOutcome>;

/**
 * Loest `K d = F` DUENNBESETZT. `K` kommt als Triplets des UNTEREN Dreiecks
 * (`rows`, `cols`, `values` gleich lang, `row >= col`), `F` spaltenweise flach
 * mit `n * rhsColumns` Werten.
 *
 * Die Argumentfolge ist die der Rust-Signatur
 * (`solve(n, rows, cols, values, rhs_columns, f)`), aus demselben Grund wie
 * oben.
 */
export type SparseSolve = (
  n: number,
  rows: Uint32Array,
  cols: Uint32Array,
  values: Float64Array,
  rhsColumns: number,
  F: Float64Array,
) => LinearSolveOutcome | Promise<LinearSolveOutcome>;

export interface SolverConfig {
  /** PULL der Rohdaten aus dem Store — wie bei `createFEMViewer`. */
  getNodes: () => readonly Node[];
  getBeams: () => readonly Beam[];
  getSupports: () => readonly NodeSupport[];
  /**
   * ALLE Lastfaelle, nicht der gerade ausgewaehlte.
   *
   * Welcher gerechnet wird, sagt das Argument von `check(loadCaseId)` und
   * `solve(loadCaseId)`. „Welcher Lastfall ist aktiv" ist Auswahlzustand der
   * Anwendung; ein Rechenkopf, der ihn LIEST, rechnet je nach Bedienung etwas
   * anderes. Nebenbei ist damit die Reihe ueber alle Faelle (Kombinationen) eine
   * Schleife und kein Umschalten im Store. Siehe ADR 0014.
   */
  getLoadCases: () => readonly LoadCase[];

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
  getSectionStiffness: (beam: Beam) => SectionStiffness | undefined;

  /**
   * Der DICHTE Linearsolver. Verdrahtet die Anwendung — hier ist er nur ein
   * Aufruf.
   *
   * OPTIONAL, weil es zwei Rechenwege gibt und niemand beide braucht: wer
   * `linearSystem: 'sparse'` eingestellt hat, laedt sonst ein WASM-Artefakt,
   * das er nie aufruft. Verlangt die Policy diesen Weg und fehlt der Port,
   * wirft `createFEMSolver` einen `InvalidSolverConfigError` — beim Erzeugen,
   * nicht beim Rechnen.
   */
  solveLinearSystem?: LinearSolve;

  /**
   * Der DUENNBESETZTE Linearsolver, die Voreinstellung von
   * `AnalysisPolicy.linearSystem`.
   *
   * Warum er der Regelfall ist, ist eine Speicherfrage und keine
   * Geschwindigkeitsfrage: 2 000 Knoten sind 6 000 Freiheitsgrade und damit
   * `36e6` Zahlen — 288 MB allein fuer `K` im Hauptthread, bei rund zwoelf
   * besetzten Eintraegen je Zeile (ADR 0043).
   */
  solveSparseSystem?: SparseSolve;

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
