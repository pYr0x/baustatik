/**
 * Der Kragarm: die kleinste vollstaendige Rechnung, gegen die Handrechnung.
 *
 * Er ist der Beweis, dass die ganze Kette zusammen stimmt — Modellpruefung,
 * Lastpruefung, Aufloesung, Ersatzknotenlast, Transformation, Assemblierung,
 * Randbedingungen, der Linearsolver im Worker und die Rueckrechnung. Wenn hier
 * `w = PL^3/3EI` herauskommt, hat keine der acht Stufen ein Vorzeichen oder
 * einen Faktor verloren.
 */

import { type Beam, type Node, type NodeSupport } from '@baustatik/fem';
import { type SectionStiffness } from '@baustatik/fem-element';
import type { LoadCase } from '@baustatik/fem-loads';
import {
  createAnalysisPolicy,
  createFEMSolver,
  internalForcesAlong,
  internalForcesAt,
} from '@baustatik/fem-solver';
import { solveLinearSystem } from './linear-solver-port';
import { solveSparseSystem } from './sparse-solver-port';
import { convert } from '@baustatik/units';

const solveButton = requireElement<HTMLButtonElement>('#solve');
const output = requireElement<HTMLPreElement>('#output');

/** Holt ein Element und scheitert laut, wenn es fehlt. */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(id);
  if (element === null) {
    throw new Error(`Das Element #${id.slice(1)} wurde nicht gefunden.`);
  }
  return element;
}

/** Zahlen ohne Float-Rauschen ausgeben; `undefined` wird zu „–”. */
function fmt(value: number | undefined): string {
  return value === undefined ? '–' : String(Number(value.toFixed(6)));
}

// Koordinaten in METERN (siehe `Node.position`), Kraefte in kN.
const L = 2;
const P = 10;

const nodes: Node[] = [
  { id: 'n1', position: { x: 0, z: 0 } },
  { id: 'n2', position: { x: L, z: 0 } },
];
const beams: Beam[] = [
  {
    id: 'b1',
    startNodeId: 'n1',
    endNodeId: 'n2',
    crossSectionId: 'IPE200',
    materialId: 'S235',
  },
];
const supports: NodeSupport[] = [
  { id: 's1', nodeId: 'n1', ux: 'fixed', uz: 'fixed', phiY: 'fixed' },
];
// z zeigt nach unten: eine nach unten wirkende Last ist POSITIV.
//
// Eine Last existiert nur innerhalb eines Lastfalls. Hier ist es genau einer,
// ohne Faktor — die Handrechnung unten soll die reinen Zahlen treffen.
const loadCase: LoadCase = {
  id: 'lf1',
  name: 'Einzellast am freien Ende',
  loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: P }],
};

/**
 * Feste Zahlen statt eines Katalogs.
 *
 * Hier steckt spaeter der Adapter aus `@baustatik/material` x
 * `@baustatik/cross-section`. Den gibt es noch nicht — `cross-section`
 * exportiert bis heute nur den Typ `Segment`, Flaeche und Traegheitsmoment
 * rechnet nirgends jemand aus. Der Port ist die Naht, an der er einsteckt,
 * ohne dass eine Signatur bricht.
 */

// Referenz Holz 100/100mm; L=1m; P = 10kN
// Kappe=5/6
const E = convert(1100).from('kN/cm^2').to('kN/m^2');
const G = convert(69).from('kN/cm^2').to('kN/m^2');
const A = convert(100).from('cm^2').to('m^2');
const I = convert(833.33).from('cm^4').to('m^4');
const Az = A * 5 / 6;
// -> Schubweich = uz: 0.03810291225354625 | Referenz: 38,1
// -> Schubsteif = uz: 0.036363781818763645 | Referenz: 36,4

const SECTION: SectionStiffness = { EA: E * A, EI: E * I, GAs: G * Az };

/**
 * Die Analyse-Einstellungen dieser Rechnung — einmal gebaut, vollstaendig.
 *
 * In einer echten Anwendung liegt genau dieses Objekt neben dem Store und geht
 * an den Solver UND an den Eingabedialog (dort ueber
 * `createLoadValidator(analysisPolicy.loads)`). Zwei Wege, dieselben Regeln —
 * und genau deshalb kann der Dialog nicht annehmen, was der Rechnen-Knopf
 * ablehnt.
 */
const analysisPolicy = createAnalysisPolicy({
  // Mit Schub — das ist die Voreinstellung und die native Betriebsart der
  // Timoshenko-Formulierung. Zur Verformung unten kommt damit P*L/GAs dazu;
  // auf `false` gestellt gilt die reine Lehrbuchformel PL^3/3EI.
  shearDeformation: true,
});

const solver = createFEMSolver({
  getNodes: () => nodes,
  getBeams: () => beams,
  getSupports: () => supports,
  getLoadCases: () => [loadCase],
  getSectionStiffness: () => SECTION,
  // BEIDE Ports: welcher rechnet, sagt `analysisPolicy.linearSystem`
  // (ADR 0043). Der Worker des nicht gewaehlten Weges startet nie — beide Ports
  // laden ihr Artefakt erst beim ersten Aufruf.
  solveLinearSystem,
  solveSparseSystem,
  analysisPolicy,
});

async function run(): Promise<void> {
  const report = solver.check(loadCase.id);
  const lines: string[] = [`Zustand: ${report.state}`];

  if (!report.canSolve) {
    lines.push(
      '',
      'Noch nicht rechenbar:',
      `  Modell: ${report.model.errors.map((error) => error.message).join('; ')}`,
      report.loads.assessed
        ? `  Lasten: ${report.loads.errors.map((error) => error.message).join('; ')}`
        : '  Lasten: wegen Modell nicht beurteilt',
    );
    output.textContent = lines.join('\n');
    return;
  }

  const result = await solver.solve(loadCase.id);

  const tip = result.displacements.get('n2');
  const reaction = result.reactions.get('n1');

  // Die Erwartung folgt der Einstellung, nicht umgekehrt: mit Schub kommt zur
  // Biegelinie PL^3/3EI der Anteil PL/GAs dazu.
  const uzErwartet =
    (P * L ** 3) / (3 * SECTION.EI) +
    (analysisPolicy.shearDeformation ? (P * L) / (G * Az) : 0);
  // Negativ: die Tangente dreht im Bild im Uhrzeigersinn, phiY zaehlt
  // dagegen (ADR 0005).
  const phiYErwartet = -(P * L ** 2) / (2 * SECTION.EI);

  const beiNull = internalForcesAt(result, 'b1', 0);
  const beiL = internalForcesAt(result, 'b1', L);

  lines.push(
    '',
    'Verformung am freien Ende (Knoten n2):',
    `  uz = ${fmt(tip?.uz)} m   (erwartet ${fmt(uzErwartet)} m, PL^3/3EI${
      analysisPolicy.shearDeformation ? ' + PL/GAs' : ''
    })`,
    `  phiY = ${fmt(tip?.phiY)} rad  (erwartet ${fmt(phiYErwartet)} rad)`,
    '',
    'Einspannung (Knoten n1):',
    `  fx = ${fmt(reaction?.fx)} kN`,
    `  fz = ${fmt(reaction?.fz)} kN   (erwartet ${fmt(-P)} kN)`,
    `  my = ${fmt(reaction?.my)} kNm  (erwartet ${fmt(P * L)} kNm)`,
    '',
    'Stabendkräfte b1 — lokal [Fx1, Fz1, My1, Fx2, Fz2, My2]:',
    `  [${result.beamStates.get('b1')?.endForces.map(fmt).join(', ')}]`,
    '',
    'Schnittgrößen b1 — M erwartet linear von -P·L auf 0:',
    `  x = 0: N = ${fmt(beiNull.N)} kN, V = ${fmt(beiNull.V)} kN, M = ${fmt(beiNull.M)} kNm  (erwartet ${fmt(-P * L)})`,
    `  x = L: N = ${fmt(beiL.N)} kN, V = ${fmt(beiL.V)} kN, M = ${fmt(beiL.M)} kNm  (auch 0)`,
    '',
    '  Verlauf:',
  );

  for (const point of internalForcesAlong(result, 'b1', { subdivisions: 4 })) {
    lines.push(
      `    x = ${fmt(point.x)} m:  N = ${fmt(point.N)} kN,  V = ${fmt(point.V)} kN,  M = ${fmt(point.M)} kNm`,
    );
  }

output.textContent = lines.join('\n');
}

// Zum Ausprobieren in der Konsole.
Object.assign(globalThis, { solver, nodes, beams, supports, loadCase });

solveButton.addEventListener('click', () => void run());