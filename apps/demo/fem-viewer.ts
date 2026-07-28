import { type Node, type Beam, type NodeSupport } from '@baustatik/fem';
import {
    assertValidLoadCase,
    type BeamLoad,
    effectiveLoads,
    type LoadCase,
    type NodeLoad,
} from '@baustatik/fem-loads';
import { createFEMSolver } from '@baustatik/fem-solver';
import { createFEMViewer, FEM_LAYERS } from '@baustatik/fem-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { Point } from '@baustatik/fem-geometry';
import { defineStore, createPinia } from 'pinia';
import { viewport, screenPoint } from '@baustatik/viewport-2d';
import { solveLinearSystem } from './linear-solver-port';

const pinia = createPinia();

// Eine Last ohne die Felder, die der Store selbst setzt. Verteilt ueber die
// Union, damit `kind`/`distribution` weiter narrowen — ein blankes
// `Omit<BeamLoad, ...>` wuerde die sechs Varianten zu einem Typ verschmelzen.
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NodeLoadInput = Without<NodeLoad, 'id' | 'target' | 'nodeIds'>;
type BeamLoadInput = Without<BeamLoad, 'id' | 'target' | 'beamIds'>;

// Store haelt ROHDATEN (keine section-geometry-Objekte, keine Kamera).
//
// Es gibt KEINE flache Lastmenge mehr: eine Last existiert nur innerhalb eines
// Lastfalls, und der Lastfall besitzt sie.
//
// `activeLoadCaseId` ist der Lastfall, in dem der Anwender gerade arbeitet: er
// entscheidet, was gezeichnet wird UND wohin neue Lasten gehen. Der Solver liest
// ihn nicht — dem wird gesagt, was er rechnen soll.
const useStore = defineStore('sections', {
    state: () => ({
        nodes: [] as Node[],
        beams: [] as Beam[],
        supports: [] as NodeSupport[],
        loadCases: [] as LoadCase[],
        activeLoadCaseId: '',
    }),
    getters: {
        // `undefined`, solange kein Lastfall angelegt ist. Der Viewer zeichnet
        // dann keine Last, statt beim Rendern zu scheitern.
        activeLoadCase(state): LoadCase | undefined {
            return state.loadCases.find((loadCase) => loadCase.id === state.activeLoadCaseId);
        },
    },
    actions: {
        addNode(position: { x: number; z: number }) {
            this.nodes.push({ id: crypto.randomUUID(), position });
        },
        addBeam(startNode: Node, endNode: Node, crossSectionId: string, materialId: string) {
            this.beams.push({ id: crypto.randomUUID(), startNodeId: startNode.id, endNodeId: endNode.id, crossSectionId, materialId/*, releases: { start: { theta: true }, end: { theta: true } } */ });
        },
        addSupport(node: Node, ux: 'fixed' | 'free', uz: 'fixed' | 'free', phiY: 'fixed' | 'free') {
            this.supports.push({ id: crypto.randomUUID(), nodeId: node.id, ux, uz, phiY });
        },
        // Legt an und wechselt hinein — das ist der Ablauf des Anwenders:
        // Lastfall erstellen, dann darin Lasten erzeugen.
        addLoadCase(name: string, factor?: number): LoadCase {
            const loadCase: LoadCase = { id: crypto.randomUUID(), name, loads: [], ...(factor === undefined ? {} : { factor }) };
            assertValidLoadCase(loadCase);
            this.loadCases.push(loadCase);
            this.activeLoadCaseId = loadCase.id;
            return loadCase;
        },
        selectLoadCase(loadCaseId: string) {
            this.activeLoadCaseId = loadCaseId;
        },
        /**
         * Kopiert einen Lastfall und wechselt in die Kopie — der Anlass, aus dem
         * es den Faktor gibt.
         *
         * Mit `factor: -1` entsteht aus „Wind von links" ein „Wind von rechts",
         * ohne einen einzigen Lastwert nachzuziehen.
         *
         * ZIEHT NEUE LAST-IDS. Ohne das trügen zwei Lastfälle dieselben
         * Last-ids: Meldungen wären nicht mehr zuzuordnen, und eine
         * Überlagerung würde dieselbe Last doppelt zählen. Das ist die einzige
         * Stelle im Programm, an der die Eindeutigkeit der Last-ids gefährdet
         * ist — deshalb steht die Regel hier und nicht in einer Prüfung.
         */
        copyLoadCase(source: LoadCase, name: string, factor?: number): LoadCase {
            const copy: LoadCase = {
                id: crypto.randomUUID(),
                name,
                loads: source.loads.map((load) => ({ ...load, id: crypto.randomUUID() })),
                ...(factor === undefined ? {} : { factor }),
            };
            assertValidLoadCase(copy);
            this.loadCases.push(copy);
            this.activeLoadCaseId = copy.id;
            return copy;
        },
        // Lasten entstehen im AKTIVEN Lastfall — der Anwender hat ihn gerade
        // ausgewählt, und genau dorthin gehört, was er jetzt eingibt.
        //
        // Der Lastfall wird über `this.loadCases` nachgeschlagen und nicht als
        // Objekt hereingegeben: nur so trifft die Zuweisung den Pinia-Proxy. Ein
        // Schreibzugriff auf das rohe Objekt geht am Proxy vorbei, und der Viewer
        // würde nicht neu zeichnen.
        //
        // Ein Lastobjekt, n Ziele: Loeschen loescht die Last auf allen Zielen.
        addNodeLoad(nodes: Node[], load: NodeLoadInput) {
            const target = requireActiveCase(this.loadCases, this.activeLoadCaseId);
            target.loads = [...target.loads, { id: crypto.randomUUID(), target: 'node', nodeIds: nodes.map((node) => node.id), ...load }];
        },
        addBeamLoad(beams: Beam[], load: BeamLoadInput) {
            const target = requireActiveCase(this.loadCases, this.activeLoadCaseId);
            target.loads = [...target.loads, { id: crypto.randomUUID(), target: 'beam', beamIds: beams.map((beam) => beam.id), ...load } as BeamLoad];
        },
    },
});

/**
 * Der aktive Lastfall zum SCHREIBEN. Ohne ihn gibt es keinen Ort für eine Last,
 * und das soll auffallen, statt still ins Leere zu schreiben.
 *
 * Gegenstück zum Getter `activeLoadCase`, der `undefined` liefern DARF: der
 * Viewer zeichnet dann eben nichts, statt beim Rendern zu scheitern. Zwei
 * Verträge, deshalb zwei Zugänge.
 *
 * Nimmt das Array herein statt es selbst zu holen, damit der Pinia-Proxy erhalten
 * bleibt — eine Zuweisung an das rohe Objekt löste kein Neuzeichnen aus.
 */
function requireActiveCase(loadCases: LoadCase[], activeLoadCaseId: string): LoadCase {
    const found = loadCases.find((loadCase) => loadCase.id === activeLoadCaseId);
    if (found === undefined) throw new Error('Kein aktiver Lastfall — erst addLoadCase() oder selectLoadCase().');
    return found;
}
const store = useStore(pinia);

store.addNode(Point.make(0, 0));
store.addNode(Point.make(2, 0));
store.addBeam(store.nodes[0], store.nodes[1], 'default', 'default');
store.addSupport(store.nodes[0], 'fixed', 'fixed', 'free');
store.addSupport(store.nodes[1], 'free', 'fixed', 'free');

// Schraeger Stab als Sichttest: frame global/local und die Bezugslaengen
// unterscheiden sich nur am schraegen Stab sichtbar.
// store.addNode(Point.make(160, 40));
// store.addBeam(store.nodes[1], store.nodes[2], 'default', 'default');

// Repräsentative Fixtures für den Demo- und Sichttest. Die vollständige
// Sammlung der Eingabevarianten steht in
// packages/fem-loads/docs/load-examples.md.

// Drei Lastfälle, damit die Auswahl etwas zu wählen hat. Jedes `addLoadCase`
// wechselt in den neuen Fall, die folgenden Lasten landen also darin — genau der
// Ablauf, den die Oberfläche später anbietet.
const gravity = store.addLoadCase('Eigengewicht + Schnee');

// Knotenlast: globale Kraft nach unten.
store.addNodeLoad([store.nodes[1]], { fz: 10, my: 10 });

// Punktuelle Stabkraft: global nach unten, 50 Einheiten vom Stabanfang.
store.addBeamLoad([store.beams[0]], {
    kind: 'force', distribution: 'point',
    frame: 'global', axis: 'z',
    p: 10,
    distanceFromStart: 0.5,
});

// Einzelmoment auf dem Stab. Negativ, damit im Bild beide Drehsinne stehen:
// das Knotenmoment oben dreht gegen, dieses mit dem Uhrzeigersinn.
store.addBeamLoad([store.beams[0]], {
    kind: 'moment', distribution: 'point',
    m: -8,
    distanceFromStart: 0.5,
});

// Schneelast auf den schrägen Stab, bezogen auf die horizontale Projektion.
// store.addBeamLoad([store.beams[1]], {
//     kind: 'force', distribution: 'constant',
//     frame: 'global', axis: 'z', referenceLength: 'horizontalProjection',
//     q: 0.85,
// });

// Wind: waagrechte Knotenlast am Firstknoten.
// const windFromLeft = store.addLoadCase('Wind von links');
// store.addNodeLoad([store.nodes[2]], { fx: 5 });

// Und die Gegenrichtung als Kopie mit Faktor -1 — der Grund, warum es den
// Faktor gibt. Die Lastwerte stehen weiter mit +5 im Fall; umgekehrt werden sie
// erst durch `effectiveLoads`, und zwar für Viewer UND Solver gemeinsam.
// store.copyLoadCase(windFromLeft, 'Wind von rechts', -1);

// Zum Anschauen wieder in den ersten Fall wechseln.
store.selectLoadCase(gravity.id);

// 1. Driver bauen (kennt Konva). Kein onViewIntent hier — der Viewer haengt sich selbst dran.
const stageSize = { width: window.innerWidth, height: window.innerHeight };
const driver = createKonvaDriver({
    container: document.getElementById('container') as HTMLDivElement,
    width: stageSize.width,
    height: stageSize.height,
    layers: FEM_LAYERS,
});

// 2. Viewer: Driver injizieren, Segmente per PULL aus dem Store.
const viewer = createFEMViewer({
    driver,
    initialViewport: viewport(screenPoint(stageSize.width / 2, stageSize.height / 2,), 100),
    getNodes: () => store.nodes,
    getBeams: () => store.beams,
    getSupports: () => store.supports,
    // Der Viewer kennt den Begriff Lastfall NICHT und muss es nicht: er zeigt
    // immer genau einen, und welcher das ist, weiss die Anwendung. Durch
    // `effectiveLoads` sieht er dieselben Zahlen wie der Solver — deshalb kann
    // am Pfeil nichts anderes stehen als in der Rechnung.
    getLoads: () => {
        const active = store.activeLoadCase;
        return active === undefined ? [] : effectiveLoads(active);
    },
    getScreenSize: () => stageSize,
    grid: { spacing: 1 }, // Weltkoordinaten; Segmente sind 60–100 Einheiten gross
});

// 3. Einmal zeichnen. Pan/Zoom laeuft danach automatisch intern.
viewer.requestRender();

// Bei Store-Aenderung neu zeichnen:
store.$subscribe(() => viewer.requestRender());

// 4. Rechenkopf: dasselbe PULL-Muster wie der Viewer, nur andere Fragen.
//    Er haelt keine Kopie — spaeter hinzugefuegte Knoten und Lasten sieht er
//    beim naechsten Aufruf von selbst.
//
//    Die drei Ports (Steifigkeiten, Linearsolver, Formulierung) sind das, was
//    das Package bewusst nicht selbst weiss. Hier bleiben sie schlicht: das
//    Rechnen selbst zeigt `fem-cantilever.ts` gegen die Handrechnung.
const solver = createFEMSolver({
    getNodes: () => store.nodes,
    getBeams: () => store.beams,
    getSupports: () => store.supports,
    // ALLE Lastfälle. Welcher gerechnet wird, sagt das Argument von `check()`
    // und `solve()` — der Solver liest keinen Ansichtszustand.
    getLoadCases: () => store.loadCases,
    getSectionProperties: () => ({ EA: 1e6, EI: 1000, GAs: 500 }),
    solveLinearSystem,
});

// ---------------------------------------------------------------------------
// DER ABLAUF, wie er jetzt gebaut ist. Hier stand bis v5 ein langer
// Pseudocode-Block samt handgebauter `checkModel()`-Funktion. Beides ist
// eingeloest: die Modellregeln wohnen in `@baustatik/fem` (ADR 0008), der
// Bericht traegt einen ZUSTAND statt einer Fehlerliste (ADR 0010), und
// Reihenfolge und Kurzschluss stecken im Package statt in dieser Datei.
//
// Die fuenf Zustaende:
//   empty                kein Stab                  nichts zu pruefen
//   invalid              Modell- ODER Lastfehler    hartes Tor
//   unloaded             Modell traegt, keine Last  pruefbar, nicht rechenbar
//   ready-with-warnings  nur Hinweise               Rechnen erlaubt
//   ready                sauber                     Rechnen
//
// Was weiterhin gilt (ADR 0007): der EINGABEDIALOG geht NICHT hier durch. Er
// prueft einen Entwurf waehrend des Tippens direkt gegen `@baustatik/fem-loads`,
// weil `getLoadCases()` eine noch nicht gespeicherte Last nicht sieht.
//
// Geprueft und gerechnet wird immer EIN Lastfall, und zwar der GENANNTE. Welcher
// gerade sichtbar ist, ist Sache der Anwendung (ADR 0014).
// ---------------------------------------------------------------------------

const report = solver.check(store.activeLoadCaseId);

console.log(`Zustand: ${report.state}`);
for (const problem of report.model.errors) console.error(problem.message);
for (const hint of report.model.warnings) console.warn(hint.message);
if (report.loads.assessed) {
    for (const problem of report.loads.errors) console.error(problem.message);
    for (const hint of report.loads.warnings) console.warn(hint.message);
} else {
    console.info('Lasten wegen Modellfehler nicht beurteilt.');
}

async function run(loadCaseId: string): Promise<void> {
    const report = solver.check(loadCaseId);
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

    const result = await solver.solve(loadCaseId);

    console.log('Auflagerkraft am ersten Knoten', result.reactions.get(store.nodes[0].id));
    console.log('Verschiebungen am ersten Knoten', result.displacements.get(store.nodes[0].id));
    console.log('Auflagerkraft am letzten Knoten', result.reactions.get(store.nodes[1].id));
}

// Alle Lastfaelle nacheinander — die zweite und letzte Rechenoperation. Bricht
// beim ersten kaputten Fall ab; welcher das ist, sagt `solver.check(id)` je Fall.
async function runAll(): Promise<void> {
    for (const result of await solver.solveAll()) {
        const name = store.loadCases.find((c) => c.id === result.loadCaseId)?.name;
        console.log(name, result.displacements.get(store.nodes[1].id));
    }
}

// Der Bericht veraltet, sobald sich etwas aendert. DAS zu bemerken ist Sache
// der Anwendung, nicht des Packages — deshalb haelt der Rechenkopf ihn nicht
// fest, und deshalb wird hier neu geprueft statt zwischengespeichert.
store.$subscribe(() => {
    const active = store.activeLoadCase;
    if (active === undefined) return;
    console.log(`Zustand nach Aenderung (${active.name}): ${solver.check(active.id).state}`);
});

// Zum Ausprobieren in der Konsole:
//
//   store.loadCases                                 die drei Faelle
//   store.selectLoadCase(store.loadCases[2].id)      umschalten, zeichnet neu
//   store.addNodeLoad([store.nodes[1]], { fz: 3 })   landet im aktiven Fall
//   solver.check(store.activeLoadCaseId)             sieht den Store ohne Neubau
//   await run(store.activeLoadCaseId)                pruefen und EINEN rechnen
//   await runAll()                                   ALLE rechnen
//
// Es gibt genau zwei Rechenoperationen: `solver.solve(id)` und
// `solver.solveAll()`. „Wind von rechts" ist die Kopie von „Wind von links" mit
// Faktor -1 — dieselben eingegebenen Werte, gespiegelte Pfeile und gespiegelte
// Ergebnisse.
Object.assign(globalThis, { store, solver, run, runAll });
