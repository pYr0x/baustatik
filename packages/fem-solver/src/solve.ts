/**
 * Die Rechenkette: von geprueften Rohdaten zu Verformungen, Auflagerkraeften
 * und den Auswertungszustaenden der Staebe.
 *
 * WAS HIER PASSIERT und was anderswo:
 *
 *   fem-loads          prueft die Lasteingabe            (das Tor davor)
 *   fem-load-resolve   loest Lasten auf Elemente auf     (lokal, je Stab)
 *   fem-element        Steifigkeit, Ersatzknotenlast, Kondensation und
 *                      Auswertung                        (die Balkentheorie)
 *   HIER               Freiheitsgrade, Transformation, Assemblierung,
 *                      Randbedingungen, Rueckrechnung
 *   linear-solver-wasm loest K d = F                     (per Port)
 *
 * Die Kondensation der Gelenke stand frueher hier und ist nach `fem-element`
 * gezogen (ADR 0018): dieses Package ORCHESTRIERT sie noch — es sagt, welcher
 * Stab welche Freisetzungen hat —, aber es besitzt die Mechanik nicht mehr.
 *
 * Die einzige Stelle, an der dieses Package rechnet statt zu verdrahten, ist
 * das Einsortieren von Zahlen in Matrizen — und genau das ist sein Beruf.
 */

import { assertValidModel, type Beam, type Node } from '@baustatik/fem';
import type {
  ElementEvaluationState,
  LoadedElement,
  LocalElementLoad,
  SectionStiffness,
} from '@baustatik/fem-element';
import { Line, Vector } from '@baustatik/fem-geometry';
import { resolveLoads } from '@baustatik/fem-load-resolve';
import {
  assertValidLoadCase,
  effectiveLoads,
  modelGeometry,
} from '@baustatik/fem-loads';
import { type ResolvedAnalysis, resolveAnalysis } from './analysis';
import type { SolverConfig } from './config';
import {
  DOF_PER_ELEMENT,
  type Mutable6x6,
  rotateStiffness,
  rotateVector,
  toLocalVector,
  toMutable,
  transformationMatrix,
} from './element-matrix';
import {
  type DegreeOfFreedom,
  ImplausibleDisplacementError,
  SingularStiffnessMatrixError,
  SmallRotationAssumptionWarning,
  type SolveWarning,
  UnrestrainedDegreeOfFreedomError,
} from './errors';
import type { DeformationLimit, DeformationLimits } from './policy';
import { resolveLoadCase } from './resolve-load-case';

/** Freiheitsgrade je Knoten, in Nummerierungsreihenfolge. */
const DOF_PER_NODE = 3;
const DOF_ORDER: readonly DegreeOfFreedom[] = ['ux', 'uz', 'phiY'];

/** Verschiebungen und Verdrehung eines Knotens, GLOBAL. */
export type NodeDisplacement = {
  /** m */
  ux: number;
  /** m, positiv nach unten */
  uz: number;
  /** rad, positiv im Bild gegen den Uhrzeigersinn (`phiY`, nicht `theta`) */
  phiY: number;
};

/**
 * Die Kraft, die ein Auflager auf das TRAGWERK ausuebt, global.
 *
 * Diese Leserichtung und nicht die umgekehrte, weil daraus die Gleichgewichts-
 * probe direkt faellt: `Summe Lasten + Summe Auflagerkraefte = 0`. Eine Stuetze
 * unter einer nach unten wirkenden Last (`fz` positiv, z abwaerts) liefert
 * damit ein negatives `fz`.
 *
 * Freigegebene Richtungen tragen exakt 0 — das Auflager haelt dort nichts.
 */
export type SupportReaction = {
  /** kN */
  fx: number;
  /** kN, positiv nach unten */
  fz: number;
  /** kNm, positiv gegen den Uhrzeigersinn */
  my: number;
};

export type SolveResult = {
  /**
   * Welcher Lastfall gerechnet wurde.
   *
   * Ein Ergebnis, das nicht sagt, wovon es das Ergebnis ist, kann man nicht
   * ablegen. Sobald Kombinationen dazukommen, sammelt jemand die Ergebnisse
   * aller Faelle — selbstbeschreibend passen sie in ein Array, ohne dass eine
   * Map daneben desynchronisieren kann. Der Pruefbericht traegt die id bewusst
   * NICHT: er ist fluechtig und wird nie abgelegt.
   */
  loadCaseId: string;
  /** je `nodeId` */
  displacements: Map<string, NodeDisplacement>;
  /** je `nodeId` MIT Auflager */
  reactions: Map<string, SupportReaction>;
  /**
   * je `beamId`: der vollstaendige Auswertungszustand des Stabs — Laenge,
   * Stabendkraefte, zurueckgerechnete Endverformungen, die Stablast und die
   * Kennwerte der Kinematik.
   *
   * DARAUS beantworten `internalForcesAt` und `internalForcesAlong` `N`, `V`
   * und `M` an jeder Stelle, OHNE `config` zu lesen — weder Geometrie noch
   * Lasten noch Querschnittswerte. Genau deshalb kann ein abgelegtes Ergebnis
   * nicht veralten, und genau deshalb gibt es keinen `modelRevision`-Stempel
   * ([ADR 0019](../../../docs/adr/0019-result-carries-an-evaluation-state.md)).
   *
   * Ein frueheres `elementEndForces` ist darin AUFGEGANGEN: die Zahlen stehen
   * als `beamStates.get(id).endForces`, und zwei Kopien haetten beim
   * Serialisieren auseinanderlaufen koennen.
   */
  beamStates: Map<string, ElementEvaluationState>;
  /**
   * Befunde AM ERGEBNIS: gerechnet wurde richtig, aber es gibt etwas dazu zu
   * sagen. Heute genau einer — das Ergebnis verlaesst den Gueltigkeitsbereich
   * der Theorie I. Ordnung.
   *
   * Sie reisen MIT dem Ergebnis und nicht daneben, aus demselben Grund, aus dem
   * `loadCaseId` mitreist: ein Ergebnis, das seine Vorbehalte nicht kennt, kann
   * man nicht ablegen. Ein Fehler waeren sie nicht — die Zahlen sind da, sie
   * gelten nur unter einer Annahme, die hier nicht mehr traegt.
   */
  warnings: SolveWarning[];
};

/** Alles, was ein Stab fuer die Rueckrechnung braucht, einmal aufgehoben. */
type PreparedBeam = {
  beam: Beam;
  /** Kondensiert, LOKAL. */
  K: Mutable6x6;
  /** Kondensiert, LOKAL. */
  f: number[];
  T: Mutable6x6;
  /**
   * Das an Last UND Freisetzungen gebundene Element. Es haelt den Bauplan der
   * Rueckrechnung; ohne es waeren die Endverformungen der freigesetzten
   * Freiheitsgrade nicht mehr rekonstruierbar.
   */
  loaded: LoadedElement;
  /** Globale Zeilen-/Spaltenindizes der sechs Elementfreiheitsgrade. */
  map: number[];
};

/**
 * Rechnet.
 *
 * PRUEFT SELBST NACH, obwohl es `check()` gibt: der Bericht ist eine Auskunft,
 * kein Schluessel. Wer ihn ueberspringt, darf trotzdem nicht am Tor vorbei
 * (`error-handling-in-libraries.md`). Modell zuerst, dann Lasten — in der
 * anderen Reihenfolge meldete die Lastpruefung Folgefehler eines Modellfehlers.
 */
export async function solve(
  config: SolverConfig,
  loadCaseId: string,
): Promise<SolveResult> {
  return solveWith(config, resolveAnalysis(config), loadCaseId);
}

/**
 * Rechnet ALLE Lastfaelle, in der Reihenfolge von `getLoadCases()`.
 *
 * Es gibt genau zwei Rechenoperationen — diese und `solve(loadCaseId)` — und
 * keine dritte. „Alle rechnen" als Schleife beim Aufrufer liegen zu lassen
 * hiesse, dass jede Oberflaeche dieselbe Schleife neu schreibt; und erst hier
 * zahlt sich aus, dass `SolveResult` seine `loadCaseId` traegt: das Array ist
 * ohne eine Zuordnung daneben lesbar.
 *
 * BRICHT BEIM ERSTEN FEHLER AB, wie `solve()`. Das Modell — Knoten, Staebe,
 * Auflager — ist allen Faellen gemeinsam, ein Modellfehler betrifft also ohnehin
 * jeden; und eine fehlerhafte Lasteingabe heisst, dass die Eingabe nicht fertig
 * ist. Wer wissen will, WELCHER Fall klemmt, fragt vorher `check(id)` je Fall.
 *
 * NACHEINANDER, nicht parallel: der Linearsolver laeuft ueber einen einzigen
 * Worker, parallele Aufrufe wuerden sich dort ohnehin aufreihen.
 */
export async function solveAll(config: SolverConfig): Promise<SolveResult[]> {
  return solveAllWith(config, resolveAnalysis(config));
}

/** `solveAll` mit einem bereits aufgeloesten Kontext, wie `solveWith`. */
export async function solveAllWith(
  config: SolverConfig,
  analysis: ResolvedAnalysis,
): Promise<SolveResult[]> {
  const results: SolveResult[] = [];
  for (const loadCase of config.getLoadCases()) {
    results.push(await solveWith(config, analysis, loadCase.id));
  }
  return results;
}

/**
 * Dieselbe Rechnung mit einem bereits aufgeloesten Kontext — das Gegenstueck zu
 * `checkWith`. Package-intern; `createFEMSolver` loest einmal auf und gibt
 * beiden denselben Kontext.
 */
export async function solveWith(
  config: SolverConfig,
  analysis: ResolvedAnalysis,
  loadCaseId: string,
): Promise<SolveResult> {
  const nodes = config.getNodes();
  const beams = config.getBeams();
  const supports = config.getSupports();
  const loadCase = resolveLoadCase(config, loadCaseId);

  assertValidModel(nodes, beams, supports);
  // Der Lastfall selbst zuerst: ein Faktor von `NaN` wuerde sonst als `NaN` durch
  // die ganze Kette laufen und als Verformung herauskommen. Der Bericht sagt dazu
  // nichts — ein unbrauchbarer Faktor ist ein Programmierfehler, kein
  // Modellzustand, genau wie der ungehaltene Freiheitsgrad.
  assertValidLoadCase(loadCase);
  const geometry = modelGeometry(nodes, beams);
  // Derselbe Validator MIT DENSELBEN ZAHLEN, die `check()` sieht — sonst koennte
  // der Bericht „rechenbar" sagen und das Tor trotzdem zuschlagen. Das sind die
  // EINGEGEBENEN Werte, ohne Fallfaktor.
  analysis.loadValidator.assertValidLoads(geometry, loadCase.loads);

  // Gerechnet wird dagegen mit dem Faktor. Dieselbe Funktion versorgt den
  // Viewer, damit am Pfeil nichts anderes steht als in der Rechnung (ADR 0013).
  const resolved = resolveLoads(geometry, effectiveLoads(loadCase));

  const dofOf = new Map(
    nodes.map((node, index) => [node.id, index * DOF_PER_NODE]),
  );
  const n = nodes.length * DOF_PER_NODE;

  const K = zeros(n, n);
  const F = new Float64Array(n);
  const prepared: PreparedBeam[] = [];

  for (const beam of beams) {
    const element = prepareBeam(
      config,
      analysis,
      beam,
      geometry,
      resolved.beams,
    );
    prepared.push({
      ...element,
      map: elementDofMap(beam, dofOf),
    });
  }

  for (const { K: localK, f, T, map } of prepared) {
    const globalK = rotateStiffness(localK, T);
    const globalF = rotateVector(f, T);
    for (let r = 0; r < DOF_PER_ELEMENT; r += 1) {
      F[map[r]] += globalF[r];
      for (let c = 0; c < DOF_PER_ELEMENT; c += 1) {
        K[map[r]][map[c]] += globalK[r][c];
      }
    }
  }

  // Knotenlasten sind bereits global und laufen nie durch ein Element — KEIN
  // Vorzeichenwechsel, anders als bei der Stab-Momentlast.
  for (const [nodeId, load] of resolved.nodes) {
    const base = dofOf.get(nodeId) as number;
    F[base + 0] += load.fx;
    F[base + 1] += load.fz;
    F[base + 2] += load.my;
  }

  const free = freeDegreesOfFreedom(nodes, supports, dofOf);
  assertHeld(K, free, nodes);

  const raw = await solveReduced(config, K, F, free, n, nodes);
  const displacements = displacementsByNode(nodes, raw, dofOf);

  // Das VIERTE Netz, und es laeuft VOR der Rueckrechnung: aus unbrauchbaren
  // Verschiebungen sollen keine unbrauchbaren Schnittgroessen entstehen — die
  // saehen plausibel aus und reisten als Zahlen weiter.
  const warnings = assessDisplacements(
    displacements,
    beams,
    geometry,
    analysis.policy.deformationLimits,
  );

  return {
    loadCaseId: loadCase.id,
    displacements,
    reactions: reactionsByNode(K, F, raw, supports, dofOf),
    beamStates: beamStatesByBeam(prepared, raw),
    warnings,
  };
}

/**
 * Steifigkeit und Ersatzknotenlast eines Stabs, kondensiert und mit seiner
 * Transformation.
 *
 * Der SCHUB-SCHALTER greift hier: `getSectionStiffness` liefert immer eine
 * echte Schubsteifigkeit — jeder Querschnitt HAT eine —, und ob sie
 * beruecksichtigt wird, ist eine Entscheidung ueber die Analyse. Der
 * Querschnitt bleibt dabei unangetastet; ersetzt wird nur der Wert auf dem Weg
 * ins Element.
 *
 * Der Schalter wird schlicht gelesen: die Policy ist vollstaendig, „nicht
 * gesetzt" gibt es in ihr nicht.
 *
 * Eine gesetzte Custom-Formulierung gewinnt unveraendert und VOLLSTAENDIG —
 * kein Wrapper, keine Kompatibilitaetspruefung. Sie bekommt dieselben
 * bearbeiteten Querschnittswerte; was sie damit tut, ist ihre Sache.
 */
function prepareBeam(
  config: SolverConfig,
  analysis: ResolvedAnalysis,
  beam: Beam,
  geometry: ReturnType<typeof modelGeometry>,
  beamLoads: Map<string, LocalElementLoad>,
): {
  beam: Beam;
  K: Mutable6x6;
  f: number[];
  T: Mutable6x6;
  loaded: LoadedElement;
} {
  // `assertValidModel` hat haengende Referenzen und Laenge 0 bereits
  // ausgeschlossen, und `check()` die fehlenden Steifigkeiten.
  const axis = geometry.beamAxis(beam.id) as Line;
  const L = Line.length(axis);
  const props = config.getSectionStiffness(beam) as SectionStiffness;

  // DIE FREISETZUNGEN GEHEN MIT HINEIN, statt hier sechs `condense`-Aufrufe zu
  // veranlassen: `Beam['releases']` und `ElementReleases` sind formgleich, weil
  // ADR 0017 die Namen `u`/`w`/`theta` gerade deshalb aus fem-elements
  // Vokabular genommen hat. Die „Uebersetzung" ist damit ein Durchreichen.
  const element = analysis.formulation.prepare(
    analysis.policy.shearDeformation ? props : { ...props, GAs: 'rigid' },
    L,
    beam.releases,
  );
  const loaded = element.withLoad(
    beamLoads.get(beam.id) ?? { segments: [], points: [] },
  );

  // Kondensiert kommt beides schon heraus; hier wird nur noch gedreht. Die
  // Reihenfolge „erst kondensieren, dann drehen" bleibt zwingend: das Gelenk
  // ist am LOKALEN Freiheitsgrad definiert, und nach der Drehung gibt es ihn
  // als eigene Zeile nicht mehr.
  const K = toMutable(element.stiffness());
  const f = [...loaded.consistentLoad()];

  const direction = Vector.normalize(Vector.fromPoints(axis.p1, axis.p2));

  return {
    beam,
    K,
    f,
    T: transformationMatrix(direction.dx, direction.dz),
    loaded,
  };
}

/** Die sechs globalen Indizes eines Elements: Anfangsknoten, dann Endknoten. */
function elementDofMap(beam: Beam, dofOf: Map<string, number>): number[] {
  const start = dofOf.get(beam.startNodeId) as number;
  const end = dofOf.get(beam.endNodeId) as number;
  return [start, start + 1, start + 2, end, end + 1, end + 2];
}

/**
 * Die freien Freiheitsgrade, in aufsteigender globaler Nummer.
 *
 * ELIMINATION statt Straf-Verfahren: ein grosser Diagonalwert verschmutzt die
 * Kondition und liefert die Auflagerkraft nur als Produkt aus erfundener
 * Steifigkeit und Restverschiebung. `NodeSupport` kennt ohnehin nur
 * `fixed`/`free` — nur homogene Bedingungen, fuer die das Straf-Verfahren
 * keinen Vorteil haette.
 */
function freeDegreesOfFreedom(
  nodes: readonly Node[],
  supports: readonly { nodeId: string; ux: string; uz: string; phiY: string }[],
  dofOf: Map<string, number>,
): number[] {
  const fixed = new Set<number>();
  for (const support of supports) {
    const base = dofOf.get(support.nodeId) as number;
    if (support.ux === 'fixed') fixed.add(base + 0);
    if (support.uz === 'fixed') fixed.add(base + 1);
    if (support.phiY === 'fixed') fixed.add(base + 2);
  }

  const free: number[] = [];
  for (let index = 0; index < nodes.length * DOF_PER_NODE; index += 1) {
    if (!fixed.has(index)) free.push(index);
  }
  return free;
}

/**
 * Die eine Sorte Kinematik, die VOR dem Loesen erkennbar ist: ein freier
 * Freiheitsgrad mit Null auf der Diagonale wird von keinem Element gehalten.
 *
 * Der Test ist billig und — anders als jede Erkennung am Ergebnis — GENAU: er
 * nennt Knoten und Richtung. Ein exakter Vergleich genuegt, weil ein
 * Diagonalwert entweder aus einem Element stammt (dann ist er positiv) oder
 * gar nicht erst gesetzt wurde.
 */
function assertHeld(
  K: number[][],
  free: readonly number[],
  nodes: readonly Node[],
): void {
  for (const index of free) {
    if (K[index][index] !== 0) continue;
    const node = nodes[Math.floor(index / DOF_PER_NODE)];
    throw new UnrestrainedDegreeOfFreedomError(
      node.id,
      DOF_ORDER[index % DOF_PER_NODE],
    );
  }
}

/**
 * Das reduzierte System herauskopieren, loesen, wieder aufblasen.
 *
 * Hier haengen die Netze 1 bis 3 gegen Kinematik, und die vier sind bewusst
 * gestaffelt:
 *
 * 1. `assertHeld` — billig, laeuft vor dem Port, und der einzige Fall, der sich
 *    exakt benennen laesst (leere Diagonale, Pendelstab).
 * 2. Der Port meldet `kind: 'singular'` — der allgemeine Fall, aus der
 *    Cholesky-Zerlegung. Faengt auch die FAST singulaere Matrix.
 * 3. `Number.isFinite` — die Absicherung gegen eine Port-Fassung, die den
 *    Vertrag nicht erfuellt. Sie sollte nie greifen; greift sie doch, ist das
 *    Ergebnis trotzdem nicht auslieferbar.
 * 4. `assessDisplacements` am ERGEBNIS, in `solveWith` direkt hinter diesem
 *    Aufruf.
 *
 * WARUM DAS PIVOT ALLEIN NICHT REICHT: es beurteilt die Matrix, die in `K`
 * STEHT, und die ist nicht die des Modells. Ein schraeger Stab mischt ueber die
 * Transformation `EA/L` und `12EI/L^3` in dieselbe Zeile — bei realistischer
 * Schlankheit ein Faktor `1e6` —, und die Ausloeschung traegt die Groesse des
 * groesseren Terms. Der Rauschboden liegt damit weit ueber der Schwelle: das
 * Vorzeichen des Rauschens entscheidet ueber den Abbruch, der Betrag ueber die
 * Schwelle, und beides haengt an den Koordinaten. Nach der Ausloeschung steht in
 * `K` die exakte Matrix eines geringfuegig ANDEREN Modells, und dieses andere
 * Modell ist tragfaehig — kein Verfahren, das dieselbe Matrix liest, holt das
 * zurueck. Die Messung dazu: `docs/messungen/kinematik-abstand.md`, die
 * Begruendung: ADR 0016.
 */
async function solveReduced(
  config: SolverConfig,
  K: number[][],
  F: Float64Array,
  free: readonly number[],
  n: number,
  nodes: readonly Node[],
): Promise<Float64Array> {
  const size = free.length;
  const displacements = new Float64Array(n);
  // Ein vollstaendig gehaltenes Modell hat nichts zu loesen — und der Port
  // bekaeme ein 0x0-System, was nicht jede Fassung vertraegt.
  if (size === 0) {
    return displacements;
  }

  // ZEILENWEISE flach, so erwartet es die Rust-Seite von linear-solver-wasm.
  const reducedK = new Float64Array(size * size);
  const reducedF = new Float64Array(size);
  for (let r = 0; r < size; r += 1) {
    reducedF[r] = F[free[r]];
    for (let c = 0; c < size; c += 1) {
      reducedK[r * size + c] = K[free[r]][free[c]];
    }
  }

  const outcome = await config.solveLinearSystem(size, reducedK, reducedF);

  if (outcome.kind === 'singular') {
    // Die Zeile des reduzierten Systems zurueck in die globale Nummerierung —
    // dieselbe Arithmetik wie in `assertHeld`, nur ueber `free` hinweg.
    const global = free[outcome.index];
    throw new SingularStiffnessMatrixError(
      nodes[Math.floor(global / DOF_PER_NODE)].id,
      DOF_ORDER[global % DOF_PER_NODE],
      outcome.pivotRatio,
    );
  }

  for (let r = 0; r < size; r += 1) {
    if (!Number.isFinite(outcome.d[r])) {
      throw new SingularStiffnessMatrixError();
    }
    displacements[free[r]] = outcome.d[r];
  }
  return displacements;
}

/**
 * Das VIERTE Netz: ist das, was herausgekommen ist, ueberhaupt eine Verformung?
 *
 * GEMESSEN WIRD ABSOLUT, nicht relativ zwischen benachbarten Knoten: die
 * Auflager legen den Bezugsrahmen fest, und gesucht ist die BEWEGUNG des
 * Tragwerks, nicht die Verzerrung eines Stabs. Bezugslaenge der Verschiebung ist
 * der angehaengte Stab — ein Knoten hat keine eigene Laenge, und der Stab, an
 * dem er haengt, ist das naechstliegende Mass.
 *
 * JE GROESSE WIRD NUR DER GROESSTE AUSSCHLAG GEMELDET — hoechstens eine Warnung
 * fuer die Verdrehung und eine fuer die Verschiebung, und geworfen wird auf den
 * schlimmeren der beiden. Das ist kein Sparen an Auskunft, sondern der Zuschnitt
 * des Befunds: „das Ergebnis verlaesst die Theorie I. Ordnung" ist eine Aussage
 * ueber das ERGEBNIS und nicht ueber einen Knoten. Je Knoten zu melden gaebe bei
 * einem Mechanismus drei Warnungen je Knoten, die alle dasselbe sagen, und
 * verdeckte die Frage, WIE WEIT es daneben liegt. Wer die Verteilung sehen will,
 * hat `displacements`.
 *
 * EHRLICHE GRENZE: die Pruefung sieht den Mechanismus nur, wenn die Last ihn
 * anregt. Eine Last, deren Resultierende durch den Drehpunkt zeigt, erzeugt
 * keine Bewegung — Pruefung still, Modell trotzdem kinematisch. Deshalb das
 * vierte Netz und nicht der Ersatz fuer das Pivot.
 */
function assessDisplacements(
  displacements: Map<string, NodeDisplacement>,
  beams: readonly Beam[],
  geometry: ReturnType<typeof modelGeometry>,
  limits: DeformationLimits,
): SolveWarning[] {
  type Extreme = { nodeId: string; dof: DegreeOfFreedom; value: number };

  let rotation: Extreme | undefined;
  for (const [nodeId, d] of displacements) {
    const value = Math.abs(d.phiY);
    if (rotation === undefined || value > rotation.value) {
      rotation = { nodeId, dof: 'phiY', value };
    }
  }

  let displacement: Extreme | undefined;
  for (const beam of beams) {
    const L = Line.length(geometry.beamAxis(beam.id) as Line);
    for (const nodeId of [beam.startNodeId, beam.endNodeId]) {
      const d = displacements.get(nodeId);
      if (d === undefined) continue;
      const value = Math.hypot(d.ux, d.uz) / L;
      if (displacement !== undefined && value <= displacement.value) continue;
      displacement = {
        nodeId,
        // Die Richtung, die den groesseren Anteil an der Bewegung hat — sie
        // sagt dem Anwender, wohin es sich verschiebt.
        dof: Math.abs(d.ux) >= Math.abs(d.uz) ? 'ux' : 'uz',
        value,
      };
    }
  }

  const measured: { extreme: Extreme; measure: keyof DeformationLimit }[] = [];
  if (rotation !== undefined) {
    measured.push({ extreme: rotation, measure: 'rotation' });
  }
  if (displacement !== undefined) {
    measured.push({ extreme: displacement, measure: 'relativeDisplacement' });
  }

  // Erst ALLE Groessen gegen `fail`, dann erst warnen: sonst haenge es an der
  // Reihenfolge, ob eine gerissene Fehlergrenze als Warnung durchkaeme.
  let worst: { extreme: Extreme; limit: number; ratio: number } | undefined;
  for (const { extreme, measure } of measured) {
    const limit = limits.fail[measure];
    const ratio = extreme.value / limit;
    if (ratio <= 1) continue;
    if (worst === undefined || ratio > worst.ratio) {
      worst = { extreme, limit, ratio };
    }
  }
  if (worst !== undefined) {
    throw new ImplausibleDisplacementError(
      worst.extreme.nodeId,
      worst.extreme.dof,
      worst.extreme.value,
      worst.limit,
    );
  }

  const warnings: SolveWarning[] = [];
  for (const { extreme, measure } of measured) {
    const limit = limits.warn[measure];
    if (extreme.value <= limit) continue;
    warnings.push(
      new SmallRotationAssumptionWarning(
        extreme.nodeId,
        extreme.dof,
        extreme.value,
        limit,
      ),
    );
  }
  return warnings;
}

function displacementsByNode(
  nodes: readonly Node[],
  d: Float64Array,
  dofOf: Map<string, number>,
): Map<string, NodeDisplacement> {
  const result = new Map<string, NodeDisplacement>();
  for (const node of nodes) {
    const base = dofOf.get(node.id) as number;
    result.set(node.id, {
      ux: d[base + 0],
      uz: d[base + 1],
      phiY: d[base + 2],
    });
  }
  return result;
}

/**
 * `r = K d - F` an den GESPERRTEN Zeilen.
 *
 * Die volle Matrix wird dafuer gebraucht, nicht die reduzierte — deshalb wird
 * `K` oben vollstaendig aufgebaut und erst beim Loesen zusammengestrichen.
 */
function reactionsByNode(
  K: number[][],
  F: Float64Array,
  d: Float64Array,
  supports: readonly { nodeId: string; ux: string; uz: string; phiY: string }[],
  dofOf: Map<string, number>,
): Map<string, SupportReaction> {
  const result = new Map<string, SupportReaction>();

  for (const support of supports) {
    const base = dofOf.get(support.nodeId) as number;
    const held = [support.ux, support.uz, support.phiY];
    const reaction = [0, 0, 0];

    for (let component = 0; component < DOF_PER_NODE; component += 1) {
      // Eine freigegebene Richtung haelt nichts: exakt 0, nicht „fast 0 aus
      // der Rueckrechnung".
      if (held[component] !== 'fixed') continue;
      const row = base + component;
      let sum = 0;
      for (let c = 0; c < d.length; c += 1) {
        sum += K[row][c] * d[c];
      }
      reaction[component] = sum - F[row];
    }

    result.set(support.nodeId, {
      fx: reaction[0],
      fz: reaction[1],
      my: reaction[2],
    });
  }

  return result;
}

/**
 * Der Auswertungszustand je Stab: global loesen, lokal drehen, das Element
 * auswerten lassen.
 *
 * DIE AUSWERTUNG SELBST LIEGT IM ELEMENT. Frueher rechnete dieses Package
 * `K d - f` selbst und musste dabei wissen, dass die Endverformungen aus den
 * UNkondensierten und die Endkraefte aus den KONdensierten Zeilen kommen — zwei
 * Reihenfolgen in einer Datei, die von der Kondensation nichts mehr sah. Jetzt
 * liegt beides in einem Aufruf (ADR 0018).
 */
function beamStatesByBeam(
  prepared: readonly PreparedBeam[],
  d: Float64Array,
): Map<string, ElementEvaluationState> {
  const result = new Map<string, ElementEvaluationState>();
  for (const { beam, T, map, loaded } of prepared) {
    const global = map.map((index) => d[index]);
    result.set(beam.id, loaded.evaluate(toLocalVector(global, T)));
  }
  return result;
}

function zeros(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
}
