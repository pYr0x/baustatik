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
import { type SectionProperties } from '@baustatik/fem-element';
import type { LoadCase } from '@baustatik/fem-loads';
import {
  createAnalysisPolicy,
  createFEMSolver,
  internalForcesAlong,
  internalForcesAt,
} from '@baustatik/fem-solver';
import { solveLinearSystem } from './linear-solver-port';
import { convert } from '@baustatik/units';

const solveButton = document.querySelector<HTMLButtonElement>('#solve');

if (!solveButton) {
  throw new Error('Der Button zum Lösen wurde nicht gefunden.');
}

// Koordinaten in METERN (siehe `Node.position`), Kraefte in kN.
const L = 1;
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
  { id: 's1', nodeId: 'n1', ux: 'fixed', uz: 'fixed', phiY: 'free' },
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

// RSTAB Holz 100/100mm; L=1m; P = 10kN
// Kappe=5/6
const E = convert(1100).from('kN/cm^2').to('kN/m^2');
const G = convert(69).from('kN/cm^2').to('kN/m^2');
const A = convert(100).from('cm^2').to('m^2');
const I = convert(833.33).from('cm^4').to('m^4');
const Az = A * 5 / 6;
// -> Schubweich = uz: 0.03810291225354625 | RSTAB: 38,1
// -> Schubsteif = uz: 0.036363781818763645 | RSTAB: 36,4

const SECTION: SectionProperties = { EA: E * A, EI: E * I, GAs: G * Az };

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
  getSectionProperties: () => SECTION,
  solveLinearSystem,
  analysisPolicy,
});

async function run(): Promise<void> {
  const report = solver.check(loadCase.id);
  console.log('Zustand:', report.state);

  if (!report.canSolve) {
    console.warn('Noch nicht rechenbar.', {
      modell: report.model.errors.map((error) => error.message),
      lasten: report.loads.assessed
        ? report.loads.errors.map((error) => error.message)
        : 'wegen Modellfehler nicht beurteilt',
    });
    return;
  }

  const result = await solver.solve(loadCase.id);

  const tip = result.displacements.get('n2');
  const reaction = result.reactions.get('n1');

  console.log('Verformung am freien Ende', {
    uz: tip?.uz,
    // Die Erwartung folgt der Einstellung, nicht umgekehrt: mit Schub kommt zur
    // Biegelinie PL^3/3EI der Anteil PL/GAs dazu.
    uzErwartet:
      (P * L ** 3) / (3 * SECTION.EI) +
      (analysisPolicy.shearDeformation ? (P * L) / (G * Az) : 0),
    phiY: tip?.phiY,
    // Negativ: die Tangente dreht im Bild im Uhrzeigersinn, phiY zaehlt
    // dagegen (ADR 0005).
    phiYErwartet: -(P * L ** 2) / (2 * SECTION.EI),
  });

  console.log('Einspannung', {
    ...reaction,
    // Die Kraft, die das Auflager auf das TRAGWERK ausuebt: Summe aller Lasten
    // plus aller Auflagerkraefte ist 0.
    fzErwartet: -P,
    myErwartet: P * L,
  });

  console.log(
    'Stabendkraefte b1 (lokal, [Fx1 Fz1 My1 Fx2 Fz2 My2])',
    result.beamStates.get('b1')?.endForces,
  );

  // Der beste Handprueftstein fuer die Schnittgroessen: M laeuft linear von
  // -P*L auf 0, V ist konstant P.
  console.log('Schnittgroessen b1', {
    beiNull: internalForcesAt(result, 'b1', 0),
    mErwartet: -P * L,
    beiL: internalForcesAt(result, 'b1', L),
    verlauf: internalForcesAlong(result, 'b1', { subdivisions: 4 }),
  });
}

// void run();

// Zum Ausprobieren in der Konsole.
Object.assign(globalThis, { solver, nodes, beams, supports, loadCase });

solveButton.addEventListener('click', () => void run());