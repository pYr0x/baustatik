import { type Node, type Beam, type NodeSupport } from '@baustatik/fem';
import { type BeamLoad, type FEMLoad, type NodeLoad } from '@baustatik/fem-loads';
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
const useStore = defineStore('sections', {
    state: () => ({
        nodes: [] as Node[],
        beams: [] as Beam[],
        supports: [] as NodeSupport[],
        loads: [] as FEMLoad[],
    }),
    actions: {
        addNode(position: { x: number; z: number }) {
            this.nodes.push({ id: crypto.randomUUID(), position });
        },
        addBeam(startNode: Node, endNode: Node, crossSectionId: string, materialId: string) {
            this.beams.push({ id: crypto.randomUUID(), startNodeId: startNode.id, endNodeId: endNode.id, crossSectionId, materialId });
        },
        addSupport(node: Node, ux: 'fixed' | 'free', uz: 'fixed' | 'free', phiY: 'fixed' | 'free') {
            this.supports.push({ id: crypto.randomUUID(), nodeId: node.id, ux, uz, phiY });
        },
        // Ein Lastobjekt, n Ziele: Loeschen loescht die Last auf allen Zielen.
        addNodeLoad(nodes: Node[], load: NodeLoadInput) {
            this.loads.push({ id: crypto.randomUUID(), target: 'node', nodeIds: nodes.map((node) => node.id), ...load });
        },
        addBeamLoad(beams: Beam[], load: BeamLoadInput) {
            this.loads.push({ id: crypto.randomUUID(), target: 'beam', beamIds: beams.map((beam) => beam.id), ...load } as BeamLoad);
        },
    },
});
const store = useStore(pinia);

store.addNode(Point.make(0, 0));
store.addNode(Point.make(100, 0));
store.addBeam(store.nodes[0], store.nodes[1], 'default', 'default');
store.addSupport(store.nodes[0], 'fixed', 'fixed', 'free');

// Schraeger Stab als Sichttest: frame global/local und die Bezugslaengen
// unterscheiden sich nur am schraegen Stab sichtbar.
store.addNode(Point.make(160, 40));
store.addBeam(store.nodes[1], store.nodes[2], 'default', 'default');

// Repräsentative Fixtures für den Demo- und Sichttest. Die vollständige
// Sammlung der Eingabevarianten steht in
// packages/fem-loads/docs/load-examples.md.

// Knotenlast: globale Kraft nach unten.
store.addNodeLoad([store.nodes[1]], { fz: 10 });

// Punktuelle Stabkraft: global nach unten, 50 Einheiten vom Stabanfang.
store.addBeamLoad([store.beams[0]], {
    kind: 'force', distribution: 'point',
    frame: 'global', axis: 'z',
    p: 10,
    distanceFromStart: 50,
});

// Schneelast auf den schrägen Stab, bezogen auf die horizontale Projektion.
store.addBeamLoad([store.beams[1]], {
    kind: 'force', distribution: 'constant',
    frame: 'global', axis: 'z', referenceLength: 'horizontalProjection',
    q: 0.85,
});

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
    initialViewport: viewport(screenPoint(stageSize.width / 2, stageSize.height / 2,), 1),
    getNodes: () => store.nodes,
    getBeams: () => store.beams,
    getSupports: () => store.supports,
    getScreenSize: () => stageSize,
    grid: { spacing: 10 }, // Weltkoordinaten; Segmente sind 60–100 Einheiten gross
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
    getLoads: () => store.loads,
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
// weil `getLoads()` eine noch nicht gespeicherte Last nicht sieht.
// ---------------------------------------------------------------------------

const report = solver.check();

console.log(`Zustand: ${report.state}`);
for (const problem of report.model.errors) console.error(problem.message);
for (const hint of report.model.warnings) console.warn(hint.message);
if (report.loads.assessed) {
    for (const problem of report.loads.errors) console.error(problem.message);
    for (const hint of report.loads.warnings) console.warn(hint.message);
} else {
    console.info('Lasten wegen Modellfehler nicht beurteilt.');
}

// Der Bericht veraltet, sobald sich etwas aendert. DAS zu bemerken ist Sache
// der Anwendung, nicht des Packages — deshalb haelt der Rechenkopf ihn nicht
// fest, und deshalb wird hier neu geprueft statt zwischengespeichert.
store.$subscribe(() => {
    console.log(`Zustand nach Aenderung: ${solver.check().state}`);
});

// Zum Ausprobieren in der Konsole: `solver.check()` sieht Aenderungen am Store
// ohne Neubau, `await solver.solve()` rechnet.
Object.assign(globalThis, { store, solver });
