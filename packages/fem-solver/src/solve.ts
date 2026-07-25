/**
 * Die Rechenkette: von geprueften Rohdaten zu Verformungen, Auflagerkraeften
 * und Stabendkraeften.
 *
 * WAS HIER PASSIERT und was anderswo:
 *
 *   fem-loads          prueft die Lasteingabe            (das Tor davor)
 *   fem-load-resolve   loest Lasten auf Elemente auf     (lokal, je Stab)
 *   fem-element        Steifigkeit und Ersatzknotenlast  (die Balkentheorie)
 *   HIER               Freiheitsgrade, Kondensation, Transformation,
 *                      Assemblierung, Randbedingungen, Rueckrechnung
 *   linear-solver-wasm loest K d = F                     (per Port)
 *
 * Die einzige Stelle, an der dieses Package rechnet statt zu verdrahten, ist
 * das Einsortieren von Zahlen in Matrizen — und genau das ist sein Beruf.
 */

import { assertValidModel, type Beam, type Node } from '@baustatik/fem';
import type {
  LocalElementLoad,
  SectionProperties,
  Vector6,
} from '@baustatik/fem-element';
import { Line, Vector } from '@baustatik/fem-geometry';
import { modelGeometry } from '@baustatik/fem-loads';
import { resolveLoads } from '@baustatik/fem-load-resolve';
import { type ResolvedAnalysis, resolveAnalysis } from './analysis';
import type { SolverConfig } from './config';
import {
  condense,
  DOF_PER_ELEMENT,
  endForces,
  type Mutable6x6,
  rotateStiffness,
  rotateVector,
  toLocalVector,
  toMutable,
  transformationMatrix,
} from './element-matrix';
import {
  type DegreeOfFreedom,
  SingularStiffnessMatrixError,
  UnrestrainedDegreeOfFreedomError,
} from './errors';

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
  /** je `nodeId` */
  displacements: Map<string, NodeDisplacement>;
  /** je `nodeId` MIT Auflager */
  reactions: Map<string, SupportReaction>;
  /**
   * je `beamId`, in LOKALEN Stabkoordinaten und in der Reihenfolge
   * `[N1, V1, M1, N2, V2, M2]`.
   *
   * Selbstpruefende Eigenschaft: an einem freigesetzten Freiheitsgrad steht
   * exakt 0 — ein Gelenk uebertraegt kein Moment.
   */
  elementEndForces: Map<string, Vector6>;
};

/** Alles, was ein Stab fuer die Rueckrechnung braucht, einmal aufgehoben. */
type PreparedBeam = {
  beam: Beam;
  /** Kondensiert, LOKAL. */
  K: Mutable6x6;
  /** Kondensiert, LOKAL. */
  f: number[];
  T: Mutable6x6;
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
export async function solve(config: SolverConfig): Promise<SolveResult> {
  return solveWith(config, resolveAnalysis(config));
}

/**
 * Dieselbe Rechnung mit einem bereits aufgeloesten Kontext — das Gegenstueck zu
 * `checkWith`. Package-intern; `createFEMSolver` loest einmal auf und gibt
 * beiden denselben Kontext.
 */
export async function solveWith(
  config: SolverConfig,
  analysis: ResolvedAnalysis,
): Promise<SolveResult> {
  const nodes = config.getNodes();
  const beams = config.getBeams();
  const supports = config.getSupports();
  const loads = config.getLoads();

  assertValidModel(nodes, beams, supports);
  const geometry = modelGeometry(nodes, beams);
  // Derselbe Validator, den `check()` benutzt — sonst koennte der Bericht
  // „rechenbar" sagen und das Tor trotzdem zuschlagen.
  analysis.loadValidator.assertValidLoads(geometry, loads);

  const resolved = resolveLoads(geometry, loads);

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

  const displacements = await solveReduced(config, K, F, free, n);

  return {
    displacements: displacementsByNode(nodes, displacements, dofOf),
    reactions: reactionsByNode(K, F, displacements, supports, dofOf),
    elementEndForces: endForcesByBeam(prepared, displacements),
  };
}

/**
 * Steifigkeit und Ersatzknotenlast eines Stabs, kondensiert und mit seiner
 * Transformation.
 *
 * Der SCHUB-SCHALTER greift hier: `getSectionProperties` liefert immer eine
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
): { beam: Beam; K: Mutable6x6; f: number[]; T: Mutable6x6 } {
  // `assertValidModel` hat haengende Referenzen und Laenge 0 bereits
  // ausgeschlossen, und `check()` die fehlenden Steifigkeiten.
  const axis = geometry.beamAxis(beam.id) as Line;
  const L = Line.length(axis);
  const props = config.getSectionProperties(beam) as SectionProperties;

  const element = analysis.formulation.prepare(
    analysis.policy.shearDeformation ? props : { ...props, GAs: 'rigid' },
    L,
  );

  const K = toMutable(element.stiffness());
  const f = [
    ...element.consistentLoad(
      beamLoads.get(beam.id) ?? { segments: [], points: [] },
    ),
  ];

  // Erst kondensieren, dann drehen: das Gelenk ist am LOKALEN Freiheitsgrad
  // definiert, und nach der Drehung gibt es ihn als eigene Zeile nicht mehr.
  if (beam.releases?.start?.phiY === true) condense(K, f, 2);
  if (beam.releases?.end?.phiY === true) condense(K, f, 5);

  const direction = Vector.normalize(Vector.fromPoints(axis.p1, axis.p2));

  return { beam, K, f, T: transformationMatrix(direction.dx, direction.dz) };
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

/** Das reduzierte System herauskopieren, loesen, wieder aufblasen. */
async function solveReduced(
  config: SolverConfig,
  K: number[][],
  F: Float64Array,
  free: readonly number[],
  n: number,
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

  const solution = await config.solveLinearSystem(size, reducedK, reducedF);

  for (let r = 0; r < size; r += 1) {
    if (!Number.isFinite(solution[r])) {
      throw new SingularStiffnessMatrixError();
    }
    displacements[free[r]] = solution[r];
  }
  return displacements;
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

function endForcesByBeam(
  prepared: readonly PreparedBeam[],
  d: Float64Array,
): Map<string, Vector6> {
  const result = new Map<string, Vector6>();
  for (const { beam, K, f, T, map } of prepared) {
    const global = map.map((index) => d[index]);
    result.set(beam.id, endForces(K, toLocalVector(global, T), f));
  }
  return result;
}

function zeros(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );
}
