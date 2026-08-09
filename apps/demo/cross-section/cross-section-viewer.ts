import {
    createSectionGeometry,
    DEFAULT_SECTION_POLICY,
    type SectionGeometry,
    type SectionNode,
    type Wall,
} from '@baustatik/cross-section';
import { createCrossSectionViewer, CROSS_SECTION_LAYERS } from '@baustatik/cross-section-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { viewport, screenPoint } from '@baustatik/viewport-2d';
import { defineStore, createPinia } from 'pinia';

const pinia = createPinia();

// Store haelt ROHDATEN (keine section-geometry-Objekte, keine Kamera): den
// Wandgraphen, den daraus abgeleiteten Umriss und die Erzeugungs-Einstellung,
// genau so, wie ADR 0030 und ADR 0033 sie speichern. Der Umriss reist MIT — der
// Viewer leitet keinen eigenen ab —, und das REZEPT reist daneben mit, damit
// beide unter derselben Toleranz gelesen werden.
//
// SEIT P3 TIPPT IHN NIEMAND MEHR (ADR 0037): `createSectionGeometry` weitet die
// Mittellinien um t/2 auf und vereinigt sie. Vorher stand hier eine von Hand
// gerechnete Punktliste — genau die Miter-Ecke, die Clipper2 jetzt selbst setzt.
const useStore = defineStore('sections', {
    state: () => ({
        nodes: [] as SectionNode[],
        walls: [] as Wall[],
        outline: [] as SectionGeometry['outline'],
        // Projektebene, nicht je Querschnitt: dieselbe Zahl beurteilt alle.
        sectionPolicy: DEFAULT_SECTION_POLICY,
    }),
    getters: {
        geometry(state): SectionGeometry {
            return {
                kind: 'midline',
                idealisation: 'thin-walled',
                nodes: state.nodes,
                walls: state.walls,
                outline: state.outline,
            };
        },
    },
    actions: {
        addNode(id: string, y: number, z: number) {
            this.nodes.push({ id, y, z });
        },
        addWall(id: string, startNodeId: string, endNodeId: string, t: number) {
            this.walls.push({ id, startNodeId, endNodeId, t });
        },
        /**
         * Der Umriss wird ABGELEITET, unter genau der Policy, die daneben im
         * Store steht. Von Hand gesetzt war er eine zweite Wahrheit ueber
         * dieselbe Figur; jetzt sagt das Gate, wenn beide auseinanderlaufen
         * (`OutlineDriftWarning`).
         */
        deriveOutline() {
            this.outline = createSectionGeometry(
                {
                    kind: 'midline',
                    idealisation: 'thin-walled',
                    nodes: this.nodes,
                    walls: this.walls,
                },
                this.sectionPolicy,
            ).outline;
        },
    },
});
const store = useStore(pinia);

// Beispiel: ein Winkel aus drei Waenden. `t` ist die physikalische Wandstaerke.
//
// LAUTER GRAD-2-KNOTEN, also EIN Branch von `n-unten` ueber `n-links` und
// `n-mitte` bis `n-rechts`. Zu sehen ist daran zweierlei (ADR 0037): die
// Miter-Ecke an `n-links`, die nur zustande kommt, weil beide Waende als EIN
// Pfad in Clipper2 gehen — und der Dickensprung von 6 auf 8 an `n-links`, der
// den Offsetpfad trotzdem teilt, weil Clipper2 ein `delta` je Aufruf nimmt.
store.addNode('n-links', -60, 0);
store.addNode('n-mitte', 0, 0);
store.addNode('n-rechts', 60, 0);
store.addNode('n-unten', -60, 100);
store.addWall('gurt-links', 'n-links', 'n-mitte', 8);
store.addWall('gurt-rechts', 'n-mitte', 'n-rechts', 8);
store.addWall('steg', 'n-links', 'n-unten', 6);
store.deriveOutline();

// 1. Driver bauen (kennt Konva). Kein onViewIntent hier — der Viewer haengt sich selbst dran.
const stageSize = { width: window.innerWidth, height: window.innerHeight };
const driver = createKonvaDriver({
    container: document.getElementById('container') as HTMLDivElement,
    width: stageSize.width,
    height: stageSize.height,
    layers: CROSS_SECTION_LAYERS,
});

// 2. Viewer: Driver injizieren, Geometrie per PULL aus dem Store.
const viewer = createCrossSectionViewer({
    driver,
    initialViewport: viewport(screenPoint(stageSize.width / 2, stageSize.height / 2,), 2),
    getGeometry: () => store.geometry,
    getSectionPolicy: () => store.sectionPolicy,
    getScreenSize: () => stageSize,
    grid: { spacing: 10 }, // Weltkoordinaten; der Querschnitt ist 120–100 Einheiten gross
});

// 3. Einmal zeichnen. Pan/Zoom laeuft danach automatisch intern.
viewer.requestRender();

// Bei Store-Aenderung neu zeichnen:
store.$subscribe(() => viewer.requestRender());
