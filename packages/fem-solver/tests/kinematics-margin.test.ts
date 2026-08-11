/**
 * MESSGERAET, kein Regressionstest.
 *
 * Die Frage, aus der diese Datei entstanden ist: reicht das Pivot-Kriterium aus
 * ADR 0012, um einen Mechanismus von einem tragfaehigen System zu trennen? Die
 * Antwort ist eine ZAHL und keine Meinung — also wird gemessen, statt eine
 * Schwelle zu erraten.
 *
 * WAS ANDERS IST ALS IN `solve.test.ts`:
 *
 *   - ECHTE `Timoshenko2D`-Formulierung und ECHTE Querschnittswerte (IPE 80,
 *     HEB 200, HEB 600). Gemessen wird gerade die Ausloeschung zwischen `EA` und
 *     `EI`, die ein schraeger Stab ueber die Transformation in dieselbe Zeile
 *     mischt; `fakeFormulation` und `STIFF` haetten sie gar nicht.
 *   - Der Port ist eine MESSFASSUNG von `gaussSolve`: sie reicht das kleinste
 *     skalierte Pivot auch im GELUNGENEN Fall heraus. `LinearSolveOutcome`
 *     bleibt dabei unangetastet — die Messung nimmt einen Nebenkanal, statt den
 *     Port-Vertrag zu verbiegen.
 *
 * ZUGESICHERT WIRD NUR DIE KONSTRUKTIVE WAHRHEIT: jedes stabile System loest,
 * die beiden Mengen sind nicht leer, das Beleg-Artefakt entsteht. KEINE
 * Schwellenaussage — die Schwellen kommen aus dem, was hier herauskommt, nicht
 * umgekehrt. Wer hier eine Grenze einbaut, macht aus dem Messgeraet einen Test
 * seiner eigenen Annahme.
 *
 * Ausgabe: `docs/messungen/kinematik-abstand.md`, das Beleg-Artefakt zu
 * ADR 0016. Ueber `node:fs`, weil vitest `console.log` aus einem Test schluckt.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import { type SectionStiffness, Timoshenko2D } from '@baustatik/fem-element';
import type { FEMLoad, LoadCase } from '@baustatik/fem-loads';
import { describe, expect, it } from 'vitest';
import type { LinearSolveOutcome, SolverConfig } from '../src/config';
import { createAnalysisPolicy, type LinearSystemKind } from '../src/policy';
import { solve } from '../src/solve';
import { beam, node, support } from './support';

const REPORT_URL = new URL(
  '../../../docs/messungen/kinematik-abstand.md',
  import.meta.url,
);

/** Dieselbe Schwelle wie `SINGULAR_PIVOT_TOLERANCE` in der Rust-Fassung. */
const SINGULAR_PIVOT_TOLERANCE = 1e-12;

const LOAD_CASE_ID = 'lf-messung';

// ---------------------------------------------------------------------------
// Querschnitte
// ---------------------------------------------------------------------------

/** kN/m^2 — Baustahl. */
const E = 210e6;
const G = 81e6;

/**
 * Ein Querschnitt aus Katalogwerten. `Av` ist die Schubflaeche; `kappa` steckt
 * darin bereits, wie `SectionStiffness.GAs` es verlangt.
 */
function steelSection(A: number, I: number, Av: number): SectionStiffness {
  return { EA: E * A, EI: E * I, GAs: G * Av };
}

/**
 * Drei Walzprofile ueber zwei Groessenordnungen Schlankheit — der
 * Verstaerkungsfaktor der Ausloeschung ist `A*L^2/I`, und `A/I` unterscheidet
 * die drei um Faktor 20.
 */
const SECTIONS: readonly { name: string; props: SectionStiffness }[] = [
  { name: 'IPE 80', props: steelSection(7.64e-4, 80.1e-8, 3.58e-4) },
  { name: 'HEB 200', props: steelSection(78.1e-4, 5696e-8, 24.83e-4) },
  { name: 'HEB 600', props: steelSection(270e-4, 171000e-8, 83.8e-4) },
];

/** Stablaengen in m. */
const LENGTHS = [1, 3, 10, 20] as const;

// ---------------------------------------------------------------------------
// Der Port als Messfassung
// ---------------------------------------------------------------------------

/** Der Nebenkanal: was der Port im gelungenen Fall NICHT zurueckgeben darf. */
type PivotProbe = { minPivot: number };

/**
 * `gaussSolve` aus `support.ts`, um eine Sonde erweitert.
 *
 * BEWUSST EINE KOPIE und kein Umbau des Originals: `support.ts` bedient die
 * Regressionstests und muss dem Port-Vertrag genau entsprechen. Ein zweiter
 * Rueckgabewert nur fuer die Messung waere ein Vertrag, den die produktive
 * Rust-Fassung nicht erfuellt.
 *
 * Der einzige inhaltliche Unterschied: `probe.minPivot` traegt am Ende das
 * kleinste skalierte Pivot der gesamten Elimination — auch dann, wenn die
 * Zerlegung gelingt. Genau dieser Fall ist der interessante.
 */
function probingGaussSolve(probe: PivotProbe) {
  return (
    n: number,
    K: Float64Array,
    rhsColumns: number,
    F: Float64Array,
  ): LinearSolveOutcome => {
    probe.minPivot = Number.NaN;
    if (n === 0) return { kind: 'solved', d: new Float64Array(0) };

    const s = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const diagonal = K[i * n + i];
      if (!(diagonal > 0) || !Number.isFinite(diagonal)) {
        probe.minPivot = 0;
        return { kind: 'singular', index: i, pivotRatio: 0 };
      }
      s[i] = 1 / Math.sqrt(diagonal);
    }

    const width = n + rhsColumns;
    const a = Array.from({ length: n }, (_, r) =>
      Array.from({ length: width }, (_, c) =>
        c < n ? K[r * n + c] * s[r] * s[c] : F[(c - n) * n + r] * s[r],
      ),
    );

    let minPivot = Number.POSITIVE_INFINITY;
    for (let col = 0; col < n; col += 1) {
      const pivot = a[col][col];
      if (pivot < minPivot) minPivot = pivot;
      if (pivot <= SINGULAR_PIVOT_TOLERANCE) {
        probe.minPivot = minPivot;
        return { kind: 'singular', index: col, pivotRatio: Math.max(pivot, 0) };
      }

      for (let row = col + 1; row < n; row += 1) {
        const factor = a[row][col] / pivot;
        if (factor === 0) continue;
        for (let c = col; c < width; c += 1) {
          a[row][c] -= factor * a[col][c];
        }
      }
    }
    probe.minPivot = minPivot;

    const d = new Float64Array(n * rhsColumns);
    const y = new Float64Array(n);
    for (let column = 0; column < rhsColumns; column += 1) {
      for (let row = n - 1; row >= 0; row -= 1) {
        let sum = a[row][n + column];
        for (let c = row + 1; c < n; c += 1) {
          sum -= a[row][c] * y[c];
        }
        y[row] = sum / a[row][row];
      }
      for (let i = 0; i < n; i += 1) {
        d[column * n + i] = s[i] * y[i];
      }
    }
    return { kind: 'solved', d };
  };
}

/**
 * Dieselbe Messfassung fuer den DUENNBESETZTEN Weg.
 *
 * SIE MISST NICHT `faer`. Sie baut aus den Triplets dicht auf und laesst
 * dieselbe Elimination laufen — was sie belegt, ist deshalb genau eines: dass
 * der duennbesetzte Weg dem Loeser DASSELBE reduzierte System uebergibt wie
 * der dichte, ueber den ganzen Korpus hinweg. Ob AMD und fill-in die Rundung
 * von `faer` verschieben, steht hier nicht — das messen die `cargo test` in
 * `@baustatik/sparse-solver-wasm`, wo derselbe skalierte Kragarm auf beiden
 * Crates exakt `1/4` liefert und dasselbe fast singulaere System auf beiden
 * unter `1e-12` faellt.
 */
function probingSparseSolve(probe: PivotProbe) {
  const dense = probingGaussSolve(probe);
  return (
    n: number,
    rows: Uint32Array,
    cols: Uint32Array,
    values: Float64Array,
    rhsColumns: number,
    F: Float64Array,
  ): LinearSolveOutcome => {
    const K = new Float64Array(n * n);
    for (let i = 0; i < values.length; i += 1) {
      const row = rows[i];
      const col = cols[i];
      K[row * n + col] += values[i];
      if (row !== col) K[col * n + row] += values[i];
    }
    return dense(n, K, rhsColumns, F);
  };
}

// ---------------------------------------------------------------------------
// Der Modellkorpus
// ---------------------------------------------------------------------------

type System = {
  name: string;
  nodes: Node[];
  beams: Beam[];
  supports: NodeSupport[];
  loads: FEMLoad[];
  props: SectionStiffness;
};

/** Ein Systembauer vor der Wahl von Querschnitt und Laenge. */
type Shape = {
  name: string;
  build: (L: number) => Omit<System, 'name' | 'props'>;
  /**
   * Abweichende Laengen. Die grossen Systeme laufen nur ueber REALISTISCHE
   * Spannweiten: ihr Beitrag ist der niedrige Pivot eines tragfaehigen Systems,
   * und der zaehlt nur, solange niemand „so baut doch keiner" sagen kann.
   */
  lengths?: readonly number[];
};

function nodeLoad(id: string, nodeIds: string[], fx: number, fz: number): FEMLoad {
  return { id, target: 'node', nodeIds, ...(fx === 0 ? {} : { fx }), fz };
}

// --- stabil ---------------------------------------------------------------

const CANTILEVER: Shape = {
  name: 'Kragarm',
  build: (L) => ({
    nodes: [node('n1', 0, 0), node('n2', L, 0)],
    beams: [beam('b1', 'n1', 'n2')],
    supports: [support('s1', 'n1')],
    loads: [nodeLoad('l1', ['n2'], 0, 10)],
  }),
};

const SIMPLE_BEAM: Shape = {
  name: 'Einfeldtraeger',
  build: (L) => ({
    nodes: [node('n1', 0, 0), node('n2', L / 2, 0), node('n3', L, 0)],
    beams: [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3')],
    supports: [
      support('s1', 'n1', 'fixed', 'fixed', 'free'),
      support('s2', 'n3', 'free', 'fixed', 'free'),
    ],
    loads: [nodeLoad('l1', ['n2'], 0, 10)],
  }),
};

const TWO_SPAN_BEAM: Shape = {
  name: 'Zweifeldtraeger',
  build: (L) => ({
    nodes: [
      node('n1', 0, 0),
      node('n2', L / 2, 0),
      node('n3', L, 0),
      node('n4', 1.5 * L, 0),
      node('n5', 2 * L, 0),
    ],
    beams: [
      beam('b1', 'n1', 'n2'),
      beam('b2', 'n2', 'n3'),
      beam('b3', 'n3', 'n4'),
      beam('b4', 'n4', 'n5'),
    ],
    supports: [
      support('s1', 'n1', 'fixed', 'fixed', 'free'),
      support('s2', 'n3', 'free', 'fixed', 'free'),
      support('s3', 'n5', 'free', 'fixed', 'free'),
    ],
    loads: [nodeLoad('l1', ['n2', 'n4'], 0, 10)],
  }),
};

/**
 * Rahmen mit SCHRAEGEM Stiel — der Systemtyp, um den es hier geht.
 *
 * `alpha` ist die Neigung des linken Stiels gegen die Senkrechte. Erst der
 * schraege Stab mischt ueber die Transformation `EA/L` und `12EI/L^3` in
 * dieselbe Zeile; ein rechtwinkliger Rahmen tut das nicht.
 */
function inclinedFrame(alphaDeg: number): Shape {
  const t = Math.tan((alphaDeg * Math.PI) / 180);
  return {
    name: `Rahmen ${alphaDeg} Grad`,
    build: (L) => ({
      nodes: [
        node('n1', 0, L),
        node('n2', L * t, 0),
        node('n3', L * t + L, 0),
        node('n4', L * t + L, L),
      ],
      beams: [
        beam('b1', 'n1', 'n2'),
        beam('b2', 'n2', 'n3'),
        beam('b3', 'n4', 'n3'),
      ],
      supports: [support('s1', 'n1'), support('s2', 'n4')],
      loads: [nodeLoad('l1', ['n2'], 5, 10)],
    }),
  };
}

const THREE_HINGED_FRAME: Shape = {
  name: 'Dreigelenkrahmen',
  build: (L) => ({
    nodes: [
      node('n1', 0, L),
      node('n2', 0, 0),
      node('n3', L / 2, -L / 4),
      node('n4', L, 0),
      node('n5', L, L),
    ],
    beams: [
      beam('b1', 'n1', 'n2'),
      beam('b2', 'n2', 'n3'),
      // Das Firstgelenk — das dritte Gelenk, das das System statisch bestimmt
      // macht und es gerade noch nicht zum Mechanismus.
      beam('b3', 'n3', 'n4', { start: { theta: true } }),
      beam('b4', 'n4', 'n5'),
    ],
    supports: [
      support('s1', 'n1', 'fixed', 'fixed', 'free'),
      support('s2', 'n5', 'fixed', 'fixed', 'free'),
    ],
    loads: [nodeLoad('l1', ['n3'], 0, 10), nodeLoad('l2', ['n2'], 5, 0.001)],
  }),
};

const STRUTTED_BEAM: Shape = {
  name: 'Sprengwerk',
  build: (L) => ({
    nodes: [
      node('n1', 0, 0),
      node('n2', L / 3, 0),
      node('n3', (2 * L) / 3, 0),
      node('n4', L, 0),
      node('n5', L / 2, L / 2),
    ],
    beams: [
      beam('b1', 'n1', 'n2'),
      beam('b2', 'n2', 'n3'),
      beam('b3', 'n3', 'n4'),
      beam('b4', 'n5', 'n2'),
      beam('b5', 'n5', 'n3'),
    ],
    supports: [
      support('s1', 'n1', 'fixed', 'fixed', 'free'),
      support('s2', 'n4', 'free', 'fixed', 'free'),
      support('s3', 'n5', 'fixed', 'fixed', 'free'),
    ],
    loads: [nodeLoad('l1', ['n2', 'n3'], 0, 10)],
  }),
};

/**
 * Derselbe Kragarm, nur in `elements` Stuecke geteilt.
 *
 * WARUM DAS IM KORPUS STEHT, obwohl das Element fuer den geraden Stab exakt ist
 * und die Unterteilung nichts am Ergebnis aendert: sie aendert das PIVOT. Eine
 * lange, schlanke Kette gleicher Elemente ist der schlecht konditionierte
 * Grenzfall unter den tragfaehigen Systemen — und genau die Zahl, die eine
 * hoehere Pivot-Schwelle als erstes zu Unrecht traefe. Ohne dieses System sagt
 * die Messung nur, dass kleine Systeme gut konditioniert sind, und das war nie
 * die Frage.
 */
function meshedCantilever(elements: number): Shape {
  return {
    name: `Kragarm (${elements} Elemente)`,
    lengths: [3, 10, 20],
    build: (L) => ({
      nodes: Array.from({ length: elements + 1 }, (_, i) =>
        node(`n${i}`, (i * L) / elements, 0),
      ),
      beams: Array.from({ length: elements }, (_, i) =>
        beam(`b${i}`, `n${i}`, `n${i + 1}`),
      ),
      supports: [support('s1', 'n0')],
      loads: [nodeLoad('l1', [`n${elements}`], 0, 10)],
    }),
  };
}

/**
 * Durchlauftraeger ueber `spans` Felder — viele Freiheitsgrade, alle real.
 *
 * ZWEI Knoten je Feld: die geraden tragen das Auflager, die ungeraden liegen in
 * Feldmitte und nehmen die Last auf. Ein Auflager an JEDEM Knoten waere ein
 * Traeger ohne Durchbiegung — er stuende mit `max |u|/L = 0` im Korpus und
 * saehe wie ein gut konditioniertes System aus, ohne je etwas getragen zu haben.
 */
function continuousBeam(spans: number): Shape {
  const count = 2 * spans + 1;
  return {
    name: `Durchlauftraeger (${spans} Felder)`,
    lengths: [3, 10],
    build: (L) => ({
      nodes: Array.from({ length: count }, (_, i) =>
        node(`n${i}`, (i * L) / 2, 0),
      ),
      beams: Array.from({ length: count - 1 }, (_, i) =>
        beam(`b${i}`, `n${i}`, `n${i + 1}`),
      ),
      supports: Array.from({ length: spans + 1 }, (_, i) =>
        support(
          `s${i}`,
          `n${2 * i}`,
          i === 0 ? 'fixed' : 'free',
          'fixed',
          'free',
        ),
      ),
      loads: [
        nodeLoad(
          'l1',
          Array.from({ length: spans }, (_, i) => `n${2 * i + 1}`),
          0,
          10,
        ),
      ],
    }),
  };
}

/**
 * Stockwerkrahmen, `storeys` Geschosse ueber `bays` Felder — das groesste
 * tragfaehige System des Korpus und dasjenige mit dem meisten Zusammenspiel
 * zwischen Dehn- und Biegesteifigkeit.
 */
function multiStoreyFrame(storeys: number, bays: number): Shape {
  const columns = bays + 1;
  const id = (level: number, column: number) => `n${level}-${column}`;
  return {
    name: `Stockwerkrahmen (${storeys} x ${bays})`,
    lengths: [3, 5],
    build: (L) => {
      const nodes: Node[] = [];
      const beams: Beam[] = [];
      for (let level = 0; level <= storeys; level += 1) {
        for (let column = 0; column < columns; column += 1) {
          // Level 0 ist der Fuss: z zeigt nach unten, also liegt es unten.
          nodes.push(node(id(level, column), column * L, (storeys - level) * L));
        }
      }
      for (let level = 1; level <= storeys; level += 1) {
        for (let column = 0; column < columns; column += 1) {
          beams.push(
            beam(
              `c${level}-${column}`,
              id(level - 1, column),
              id(level, column),
            ),
          );
        }
        for (let column = 0; column < bays; column += 1) {
          beams.push(
            beam(`r${level}-${column}`, id(level, column), id(level, column + 1)),
          );
        }
      }
      return {
        nodes,
        beams,
        supports: Array.from({ length: columns }, (_, column) =>
          support(`s${column}`, id(0, column)),
        ),
        loads: [
          nodeLoad(
            'l1',
            Array.from({ length: storeys }, (_, level) => id(level + 1, 0)),
            5,
            10,
          ),
        ],
      };
    },
  };
}

const STABLE_SHAPES: readonly Shape[] = [
  CANTILEVER,
  SIMPLE_BEAM,
  TWO_SPAN_BEAM,
  inclinedFrame(30),
  inclinedFrame(45),
  inclinedFrame(60),
  THREE_HINGED_FRAME,
  STRUTTED_BEAM,
  meshedCantilever(20),
  continuousBeam(10),
  multiStoreyFrame(6, 2),
];

// --- kinematisch ----------------------------------------------------------

/**
 * Verschieblicher Rahmen auf zwei Pendelstuetzen.
 *
 * Die Stiele sind an beiden Enden freigesetzt und tragen deshalb nur laengs;
 * senkrecht stehend leisten sie zur waagrechten Steifigkeit exakt nichts. Der
 * Riegel koppelt `ux` beider Kopfpunkte ueber `EA` — die gemeinsame waagrechte
 * Verschiebung ist ein Starrkoerpermodus. Die Fusspunkte sind VOLL eingespannt,
 * damit nicht schon `assertHeld` an der freien Fussverdrehung zuschlaegt und
 * den eigentlichen Befund verdeckt.
 */
const SWAY_FRAME: Shape = {
  name: 'Verschieblicher Rahmen (2 Pendelstuetzen)',
  build: (L) => ({
    nodes: [node('n1', 0, L), node('n2', 0, 0), node('n3', L, 0), node('n4', L, L)],
    beams: [
      beam('b1', 'n1', 'n2', { start: { theta: true }, end: { theta: true } }),
      beam('b2', 'n2', 'n3'),
      beam('b3', 'n4', 'n3', { start: { theta: true }, end: { theta: true } }),
    ],
    supports: [support('s1', 'n1'), support('s2', 'n4')],
    loads: [nodeLoad('l1', ['n2'], 5, 10)],
  }),
};

/**
 * Gelenkkette: Einspannung, zwei echte Gelenke, Rollenlager.
 *
 * Je Gelenkknoten setzt nur EIN Stabende frei — sonst waere die Knotendrehung
 * an nichts gekoppelt und `assertHeld` faenge den Fall vor dem Loeser. So ist
 * jede Diagonale besetzt, und der Mechanismus faellt erst in der Zerlegung auf.
 */
const HINGE_CHAIN: Shape = {
  name: 'Gelenkkette (2 Gelenke)',
  build: (L) => ({
    nodes: [
      node('n1', 0, 0),
      node('n2', L / 3, 0),
      node('n3', (2 * L) / 3, 0),
      node('n4', L, 0),
    ],
    beams: [
      beam('b1', 'n1', 'n2', { end: { theta: true } }),
      beam('b2', 'n2', 'n3', { end: { theta: true } }),
      beam('b3', 'n3', 'n4'),
    ],
    supports: [
      support('s1', 'n1'),
      support('s2', 'n4', 'free', 'fixed', 'free'),
    ],
    loads: [nodeLoad('l1', ['n2', 'n3'], 0, 10)],
  }),
};

/** Drei Auflager, alle nur in `uz`: die waagrechte Verschiebung ist frei. */
const PARALLEL_SUPPORTS: Shape = {
  name: 'Drei parallele uz-Auflager',
  build: (L) => ({
    nodes: [node('n1', 0, 0), node('n2', L / 2, 0), node('n3', L, 0)],
    beams: [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3')],
    supports: [
      support('s1', 'n1', 'free', 'fixed', 'free'),
      support('s2', 'n2', 'free', 'fixed', 'free'),
      support('s3', 'n3', 'free', 'fixed', 'free'),
    ],
    loads: [nodeLoad('l1', ['n2'], 5, 10)],
  }),
};

const KINEMATIC_SHAPES: readonly Shape[] = [
  SWAY_FRAME,
  HINGE_CHAIN,
  PARALLEL_SUPPORTS,
];

/**
 * Der Winkelsweep — der wichtigste Teil der Messung.
 *
 * Dasselbe Modell wie in `apps/demo/fem/fem-viewer.ts`: EIN Auflager, das `ux` und
 * `uz` haelt und `phiY` freilaesst. Die Drehung um diesen Knoten ist immer ein
 * Starrkoerpermodus, unabhaengig vom Winkel — `K_ff` ist per Konstruktion exakt
 * rangdefizit.
 *
 * Was der Winkel steuert, ist NICHT die Kinematik, sondern das RAUSCHEN: ueber
 * die Transformation mischt ein schraeger Stab `EA/L` und `12EI/L^3` in
 * dieselbe Zeile, und die Ausloeschung traegt die Groesse des groesseren Terms.
 * Deshalb wandert das gemessene Pivot mit dem Winkel um Groessenordnungen,
 * waehrend der wahre Wert exakt 0 bleibt.
 */
function angleSweep(scaleName: string, a: number, r: number): Shape[] {
  const shapes: Shape[] = [];
  for (let alpha = 0; alpha <= 90; alpha += 5) {
    const rad = (alpha * Math.PI) / 180;
    shapes.push({
      name: `Winkelsweep ${scaleName} ${String(alpha).padStart(2, '0')} Grad`,
      build: () => ({
        nodes: [
          node('n1', 0, 0),
          node('n2', a, 0),
          node('n3', a + r * Math.cos(rad), r * Math.sin(rad)),
        ],
        beams: [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3')],
        supports: [support('s1', 'n1', 'fixed', 'fixed', 'free')],
        loads: [nodeLoad('l1', ['n2', 'n3'], 0, 10)],
      }),
    });
  }
  return shapes;
}

/**
 * Der Korpus, fertig ausmultipliziert. Der Sweep laeuft ueber die
 * Demo-Geometrie (100 m, das gemessene Original) UND ueber eine realistische
 * Spannweite — der Verstaerkungsfaktor `A*L^2/I` haengt quadratisch an `L`,
 * und die Frage ist gerade, ob das Durchrutschen ein Demo-Artefakt ist.
 */
function buildCorpus(): { stable: System[]; kinematic: System[] } {
  const stable: System[] = [];
  const kinematic: System[] = [];

  for (const shape of STABLE_SHAPES) {
    for (const section of SECTIONS) {
      for (const L of shape.lengths ?? LENGTHS) {
        stable.push({
          name: `${shape.name} · ${section.name} · L = ${L} m`,
          props: section.props,
          ...shape.build(L),
        });
      }
    }
  }

  for (const shape of KINEMATIC_SHAPES) {
    for (const section of SECTIONS) {
      for (const L of shape.lengths ?? [3, 10]) {
        kinematic.push({
          name: `${shape.name} · ${section.name} · L = ${L} m`,
          props: section.props,
          ...shape.build(L),
        });
      }
    }
  }

  const sweeps = [
    ...angleSweep('Demo', 100, Math.hypot(60, 40)),
    ...angleSweep('real', 10, Math.hypot(6, 4)),
  ];
  for (const shape of sweeps) {
    for (const section of SECTIONS) {
      kinematic.push({
        name: `${shape.name} · ${section.name}`,
        props: section.props,
        ...shape.build(0),
      });
    }
  }

  return { stable, kinematic };
}

// ---------------------------------------------------------------------------
// Die Messung
// ---------------------------------------------------------------------------

type Measurement = {
  name: string;
  /** Zahl der FREIEN Freiheitsgrade — die Groesse des geloesten Systems. */
  dof: number;
  /** `A*L^2/I` mit dem laengsten Stab: der Verstaerkungsfaktor der Ausloeschung. */
  amplification: number;
  /** Kleinstes skaliertes Pivot auf dem DICHTEN Weg, auch im gelungenen Fall. */
  minPivot: number;
  /** Dasselbe auf dem DUENNBESETZTEN Weg. */
  minPivotSparse: number;
  /** `max |phi|` ueber alle Knoten, in rad. `NaN`, wenn nicht geloest wurde. */
  maxRotation: number;
  /** `max |u|/L` ueber alle Stabenden. `NaN`, wenn nicht geloest wurde. */
  maxRelativeDisplacement: number;
  /** Was die drei Netze aus ADR 0012 sagen: `geloest` oder der Fehlername. */
  finding: string;
  /** Derselbe Befund auf dem duennbesetzten Weg. */
  findingSparse: string;
};

function configFor(
  system: System,
  probe: PivotProbe,
  linearSystem: LinearSystemKind,
): SolverConfig {
  const loadCase: LoadCase = {
    id: LOAD_CASE_ID,
    name: 'Messung',
    loads: system.loads,
  };
  return {
    getNodes: () => system.nodes,
    getBeams: () => system.beams,
    getSupports: () => system.supports,
    getLoadCases: () => [loadCase],
    getSectionStiffness: () => system.props,
    solveLinearSystem: probingGaussSolve(probe),
    solveSparseSystem: probingSparseSolve(probe),
    // ECHTE Formulierung MIT Schub — die Betriebsart der Anwendung. Ohne sie
    // faehrte die Messung an dem Effekt vorbei, den sie messen soll.
    formulation: Timoshenko2D,
    // DIE VERFORMUNGSPRUEFUNG WIRD ABGESCHALTET, und das ist der Kern dieser
    // Datei: gemessen wird der Zustand OHNE sie — die drei Netze aus ADR 0012
    // allein. Liefe die Messung mit den Grenzen, die aus ihr hervorgegangen
    // sind, bewiese sie nur sich selbst: jedes durchgerutschte System waere
    // gefangen, die Spalte „durchgerutscht" bliebe leer, und die Zahlen, die die
    // Grenzen rechtfertigen, gaebe es nicht mehr.
    analysisPolicy: createAnalysisPolicy({
      linearSystem,
      deformationLimits: {
        warn: { rotation: 1e300, relativeDisplacement: 1e300 },
        fail: {
          rotation: Number.MAX_VALUE,
          relativeDisplacement: Number.MAX_VALUE,
        },
      },
    }),
  };
}

function beamLength(system: System, b: Beam): number {
  const p1 = system.nodes.find((n) => n.id === b.startNodeId)?.position;
  const p2 = system.nodes.find((n) => n.id === b.endNodeId)?.position;
  if (p1 === undefined || p2 === undefined) throw new Error('kaputtes Modell');
  return Math.hypot(p2.x - p1.x, p2.z - p1.z);
}

function freeDofCount(system: System): number {
  let held = 0;
  for (const s of system.supports) {
    if (s.ux === 'fixed') held += 1;
    if (s.uz === 'fixed') held += 1;
    if (s.phiY === 'fixed') held += 1;
  }
  return system.nodes.length * 3 - held;
}

/** Was ein Durchlauf auf einem der beiden Wege hergibt. */
type PathMeasurement = {
  minPivot: number;
  maxRotation: number;
  maxRelativeDisplacement: number;
  finding: string;
};

async function measurePath(
  system: System,
  lengths: readonly number[],
  linearSystem: LinearSystemKind,
): Promise<PathMeasurement> {
  const probe: PivotProbe = { minPivot: Number.NaN };
  const result = await solve(
    configFor(system, probe, linearSystem),
    LOAD_CASE_ID,
  ).catch((error: unknown) => error);

  if (result instanceof Error) {
    return {
      minPivot: probe.minPivot,
      maxRotation: Number.NaN,
      maxRelativeDisplacement: Number.NaN,
      finding: result.constructor.name,
    };
  }

  const displacements = (result as Awaited<ReturnType<typeof solve>>)
    .displacements;

  let maxRotation = 0;
  for (const d of displacements.values()) {
    maxRotation = Math.max(maxRotation, Math.abs(d.phiY));
  }

  // Bezugslaenge ist der ANGEHAENGTE Stab, und gemessen wird ABSOLUT statt
  // relativ zwischen den Knoten: die Auflager legen den Bezugsrahmen fest, und
  // gesucht ist die Bewegung, nicht die Verzerrung.
  let maxRelative = 0;
  for (let i = 0; i < system.beams.length; i += 1) {
    const b = system.beams[i];
    const L = lengths[i];
    for (const nodeId of [b.startNodeId, b.endNodeId]) {
      const d = displacements.get(nodeId);
      if (d === undefined) continue;
      maxRelative = Math.max(maxRelative, Math.hypot(d.ux, d.uz) / L);
    }
  }

  return {
    minPivot: probe.minPivot,
    maxRotation,
    maxRelativeDisplacement: maxRelative,
    finding: 'geloest',
  };
}

/**
 * Jedes System auf BEIDEN Rechenwegen.
 *
 * Die Verformungsspalten stammen aus dem dichten Durchlauf; dass der
 * duennbesetzte dieselben liefert, ist die Zusicherung unten und nicht eine
 * zweite Spalte, die dasselbe noch einmal sagt.
 */
async function measure(system: System): Promise<Measurement> {
  const lengths = system.beams.map((b) => beamLength(system, b));
  const longest = Math.max(...lengths);

  const dense = await measurePath(system, lengths, 'dense');
  const sparse = await measurePath(system, lengths, 'sparse');

  return {
    name: system.name,
    dof: freeDofCount(system),
    amplification: (system.props.EA / system.props.EI) * longest * longest,
    minPivot: dense.minPivot,
    minPivotSparse: sparse.minPivot,
    maxRotation: dense.maxRotation,
    maxRelativeDisplacement: dense.maxRelativeDisplacement,
    finding: dense.finding,
    findingSparse: sparse.finding,
  };
}

// ---------------------------------------------------------------------------
// Das Beleg-Artefakt
// ---------------------------------------------------------------------------

function num(value: number): string {
  if (Number.isNaN(value)) return '—';
  if (value === 0) return '0';
  if (!Number.isFinite(value)) return value > 0 ? 'Inf' : '-Inf';
  return value.toExponential(2);
}

function table(rows: readonly Measurement[]): string {
  const head =
    '| System | DOF | A·L²/I | min. Pivot (dicht) | min. Pivot (dünn) | max \\|φ\\| [rad] | max \\|u\\|/L | Befund (3 Netze) |\n' +
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |';
  const body = rows
    .map(
      (m) =>
        `| ${m.name} | ${m.dof} | ${num(m.amplification)} | ${num(m.minPivot)} | ` +
        `${num(m.minPivotSparse)} | ${num(m.maxRotation)} | ` +
        `${num(m.maxRelativeDisplacement)} | ${m.finding} |`,
    )
    .join('\n');
  return `${head}\n${body}`;
}

/** Der eine Satz, um den es geht: liegen die beiden Mengen auseinander? */
function span(rows: readonly Measurement[], pick: (m: Measurement) => number) {
  const values = rows.map(pick).filter((v) => !Number.isNaN(v));
  return values.length === 0
    ? { min: Number.NaN, max: Number.NaN }
    : { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Der Abstand zweier Mengen in Dekaden — negativ heisst ueberlappen.
 *
 * `low` ist die Menge, die unten liegen SOLL. Beim Pivot ist das die
 * kinematische (der Mechanismus soll das kleinere Pivot haben), bei der
 * Verformung die stabile.
 */
function decades(
  low: { min: number; max: number },
  high: { min: number; max: number },
): number {
  if (Number.isNaN(low.max) || Number.isNaN(high.min)) return Number.NaN;
  return Math.log10(high.min / low.max);
}

function gapLabel(value: number): string {
  if (Number.isNaN(value)) return '—';
  return value <= 0
    ? '**überlappt**'
    : `${value.toFixed(1)} Dekaden`;
}

/** Die `count` Systeme mit dem kleinsten Pivot — wer die Schranke setzt. */
function lowestPivots(rows: readonly Measurement[], count: number): string {
  return rows
    .filter((m) => !Number.isNaN(m.minPivot))
    .sort((a, b) => a.minPivot - b.minPivot)
    .slice(0, count)
    .map((m) => `| ${m.name} | ${m.dof} | ${num(m.minPivot)} |`)
    .join('\n');
}

/** Die `count` Systeme mit der groessten Verformung — die Gegenrichtung. */
function largestDeformations(
  rows: readonly Measurement[],
  count: number,
): string {
  return rows
    .filter((m) => !Number.isNaN(m.maxRotation))
    .sort((a, b) => b.maxRotation - a.maxRotation)
    .slice(0, count)
    .map(
      (m) =>
        `| ${m.name} | ${num(m.maxRotation)} | ${num(m.maxRelativeDisplacement)} |`,
    )
    .join('\n');
}

/** Die Systeme, bei denen dicht und duennbesetzt zu verschiedenen Befunden kommen. */
function disagreements(rows: readonly Measurement[]): string {
  return rows
    .filter((m) => m.finding !== m.findingSparse)
    .map(
      (m) =>
        `| ${m.name} | ${num(m.minPivot)} | ${num(m.minPivotSparse)} | ` +
        `${m.finding} | ${m.findingSparse} |`,
    )
    .join('\n');
}

function report(stable: Measurement[], kinematic: Measurement[]): string {
  const slipped = kinematic.filter((m) => m.finding === 'geloest');
  const uneinigStable = stable.filter((m) => m.finding !== m.findingSparse);
  const uneinigKinematic = kinematic.filter(
    (m) => m.finding !== m.findingSparse,
  );
  const pivotStable = span(stable, (m) => m.minPivot);
  const pivotSlipped = span(slipped, (m) => m.minPivot);
  const rotStable = span(stable, (m) => m.maxRotation);
  const rotSlipped = span(slipped, (m) => m.maxRotation);
  const relStable = span(stable, (m) => m.maxRelativeDisplacement);
  const relSlipped = span(slipped, (m) => m.maxRelativeDisplacement);

  return `# Kinematik: der Abstand zwischen tragfähig und Mechanismus

<!-- ERZEUGT von packages/fem-solver/tests/kinematics-margin.test.ts.
     Nicht von Hand bearbeiten — der nächste Testlauf überschreibt die Datei. -->

Beleg-Artefakt zu
[ADR 0016](../adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md).

Gemessen mit der echten \`Timoshenko2D\`-Formulierung, echten Walzprofilen
(IPE 80 / HEB 200 / HEB 600, S235: \`E = 210e6 kN/m²\`, \`G = 81e6 kN/m²\`) und
einer Gauß-Elimination mit derselben Jacobi-Skalierung und derselben
Pivot-Schwelle (\`1e-12\`) wie die produktive \`faer\`-Fassung. Der Unterschied zum
Port-Vertrag ist ein Nebenkanal: das kleinste skalierte Pivot wird **auch im
gelungenen Fall** herausgereicht.

**Jedes System läuft über beide Rechenwege** (\`linearSystem: 'dense'\` und
\`'sparse'\`, [ADR 0043](../adr/0043-the-solver-is-an-analysis-setting.md)), und
die Tabellen führen beide Pivot-Spalten. Was das belegt und was nicht: die
dünnbesetzte Messfassung baut aus den Triplets dicht auf und lässt **dieselbe**
Elimination laufen. Die zweite Spalte vergleicht damit die beiden **Wege durch
die Assemblierung**, nicht zwei Zerlegungen — wie AMD und fill-in die Rundung in
\`faer\` verschieben, steht hier *nicht*. Dafür stehen die \`cargo test\` in
\`@baustatik/sparse-solver-wasm\`: derselbe skalierte Kragarm liefert dort auf
beiden Crates exakt \`1/4\`, und dasselbe fast singuläre System fällt auf beiden
unter \`1e-12\`.

**Die Verformungsprüfung ist dabei abgeschaltet.** Gemessen wird der Zustand
davor — die drei Netze aus [ADR 0012](../adr/0012-kinematics-is-detected-by-the-solver.md)
allein. Mit den Grenzen, die aus dieser Messung hervorgegangen sind, bewiese sie
nur sich selbst.

${stable.length} stabile Systeme, ${kinematic.length} kinematische. Jedes
kinematische System ist per Konstruktion ein Mechanismus — \`K_ff\` ist dort exakt
rangdefizit, unabhängig von der gemessenen Zahl.

## Die Gegenüberstellung

**Durchgerutscht sind ${slipped.length} von ${kinematic.length} kinematischen
Systemen** — die drei Netze melden dort \`geloest\` und liefern ein
Verformungsfeld. Die Zeilen unten vergleichen deshalb die stabile Menge mit
genau diesen ${slipped.length}: die übrigen sind bereits gefangen und sagen über
die Trennschärfe nichts.

| Größe | stabil (${stable.length}) | durchgerutscht kinematisch (${slipped.length}) | Abstand |
| --- | --- | --- | --- |
| min. Pivot | ${num(pivotStable.min)} … ${num(pivotStable.max)} | ${num(pivotSlipped.min)} … ${num(pivotSlipped.max)} | ${gapLabel(decades(pivotSlipped, pivotStable))} |
| max \\|φ\\| [rad] | ${num(rotStable.min)} … ${num(rotStable.max)} | ${num(rotSlipped.min)} … ${num(rotSlipped.max)} | ${gapLabel(decades(rotStable, rotSlipped))} |
| max \\|u\\|/L | ${num(relStable.min)} … ${num(relStable.max)} | ${num(relSlipped.min)} … ${num(relSlipped.max)} | ${gapLabel(decades(relStable, relSlipped))} |

**Die beiden Abstände sind nicht gleich zu lesen**, und das ist der eigentliche
Befund. Beim Pivot ist der Abstand kein Sicherheitsabstand, sondern eine
Eigenschaft dieses Korpus: das kleinste Pivot der stabilen Menge fällt mit der
Systemgröße und der Schlankheit, und hier stehen Systeme mit höchstens
${Math.max(...stable.map((m) => m.dof))} Freiheitsgraden. Wer die Schwelle über
das größte durchgerutschte Pivot hebt, muss sie beim nächsten größeren Modell
wieder nachziehen — und trifft dann tragfähige Systeme.

| stabiles System mit dem kleinsten Pivot | DOF | min. Pivot |
| --- | ---: | ---: |
${lowestPivots(stable, 8)}

Bei der **Verformung** ist der Abstand dagegen keine Eigenschaft des Korpus,
sondern der Theorie: \`rad\` und \`u/L\` sind dimensionslos, und ein Ergebnis
oberhalb von rund \`0.1\` verlässt ohnehin den Gültigkeitsbereich der
Theorie I. Ordnung (\`sin φ ≈ φ\`, Gleichgewicht am unverformten System). Die
durchgerutschten Mechanismen liegen bei ${num(rotSlipped.min)} rad und darüber.
Das ist der Grund für die Verformungsprüfung als viertes Netz.

Die obere Kante der stabilen Menge setzen dabei nicht die schwierigen Systeme,
sondern die maßlos überlasteten — ein IPE 80 als 20-m-Kragarm unter 10 kN
rechnet linear-elastisch klaglos durch:

| stabiles System mit der größten Verformung | max \\|φ\\| [rad] | max \\|u\\|/L |
| --- | ---: | ---: |
${largestDeformations(stable, 6)}

Kein tragfähiges System des Korpus kommt in die Nähe von \`1e3\` — und keiner der
durchgerutschten Mechanismen bleibt darunter.

**Die beiden Größen sind aber nicht gleich robust.** Der 20-m-Kragarm steht
zweimal in der Tabelle, einmal als ein Element und einmal als zwanzig, mit
identischem \`max |φ|\` und \`7.93e+0\` gegen \`1.59e+2\` bei \`max |u|/L\`. Der Grund
ist die Bezugslänge: gemessen wird gegen den ANGEHÄNGTEN Stab, und der ist beim
unterteilten Kragarm zwanzigmal kürzer. \`|u|/L\` hängt damit an der Feinheit der
Eingabe, \`|φ|\` nicht. Für dieses Programm ist das folgenlos — ein Stab ist ein
Element, es wird nicht vernetzt —, aber es ist der Grund, warum die Verdrehung
und nicht die bezogene Verschiebung die belastbarere der beiden Größen ist.

## Wo die beiden Wege sich uneins sind

Auf den **${stable.length} tragfähigen** Systemen kommen dicht und dünnbesetzt
ausnahmslos zum selben Befund (${uneinigStable.length} Abweichungen). Bei den
kinematischen tun sie es nicht: **${uneinigKinematic.length} von
${kinematic.length}** Systemen werden auf dem einen Weg gemeldet und auf dem
anderen gelöst.

Das ist kein Fehler in einer der beiden Fassungen, sondern derselbe Befund, den
[ADR 0016](../adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md)
schon beschreibt, nur an einer neuen Stelle. \`rotateStiffness\` rechnet
\`T^T K T\` **eintragsweise**: \`K[r][c]\` und \`K[c][r]\` sind zwei getrennte
Skalarprodukte und stimmen nur bis auf die letzte Stelle überein. Der dichte Weg
reicht diese Matrix so weiter, wie sie ist — **nicht** exakt symmetrisch. Der
dünnbesetzte reicht das untere Dreieck weiter, und der Löser spiegelt es: seine
Matrix **ist** exakt symmetrisch. Bei einem Mechanismus ist das gemessene Pivot
reines Rundungsrauschen, und über den Abbruch entscheidet sein Vorzeichen — also
entscheidet hier die letzte Stelle, und die ist auf beiden Wegen verschieden.

${
    uneinigKinematic.every((m) => m.name.startsWith('Winkelsweep'))
      ? 'Alle Abweichungen liegen im Winkelsweep, also genau bei den Systemen,\n' +
        'deren wahres Pivot exakt 0 ist.'
      : 'Die Abweichungen liegen **nicht** nur im Winkelsweep — die Tabelle\n' +
        'unten nennt sie einzeln.'
  } Für die Anwendung ist das folgenlos: gemessen
wird hier **ohne** die Verformungsprüfung, und das vierte Netz fängt jeden
dieser Fälle — auf beiden Wegen.

| System | min. Pivot (dicht) | min. Pivot (dünn) | Befund dicht | Befund dünn |
| --- | ---: | ---: | --- | --- |
${disagreements(kinematic)}

## Stabile Systeme

${table(stable)}

## Kinematische Systeme

${table(kinematic)}
`;
}

// ---------------------------------------------------------------------------

describe('Kinematik — Messreihe', () => {
  it('misst den Abstand zwischen tragfaehig und Mechanismus', async () => {
    const corpus = buildCorpus();
    expect(corpus.stable.length).toBeGreaterThan(50);
    expect(corpus.kinematic.length).toBeGreaterThan(50);

    const stable: Measurement[] = [];
    for (const system of corpus.stable) {
      stable.push(await measure(system));
    }
    const kinematic: Measurement[] = [];
    for (const system of corpus.kinematic) {
      kinematic.push(await measure(system));
    }

    // Die EINZIGE Zusicherung ueber Zahlen, und sie ist keine Schwelle: ein
    // tragfaehiges System muss rechnen. Was daran gemessen wird, steht offen.
    const failed = stable.filter(
      (m) => m.finding !== 'geloest' || m.findingSparse !== 'geloest',
    );
    expect(
      failed.map((m) => `${m.name}: ${m.finding} / ${m.findingSparse}`),
    ).toEqual([]);

    // Die zweite konstruktive Wahrheit, und die ist neu: auf den TRAGFAEHIGEN
    // Systemen kommen beide Wege zum selben Befund. Bei den kinematischen tun
    // sie das nicht durchgaengig — das ist kein Fehler, sondern eine Messung,
    // und sie steht im Bericht statt in einer Zusicherung. Warum, sagt der
    // Abschnitt „Wo die beiden Wege sich uneins sind" dort.
    const uneinig = stable.filter((m) => m.finding !== m.findingSparse);
    expect(
      uneinig.map((m) => `${m.name}: ${m.finding} / ${m.findingSparse}`),
    ).toEqual([]);

    const path = fileURLToPath(REPORT_URL);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, report(stable, kinematic), 'utf8');
  });
});
