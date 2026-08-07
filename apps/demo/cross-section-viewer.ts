import type { SectionGeometry, SectionNode, Wall } from '@baustatik/cross-section';
import { createCrossSectionViewer, CROSS_SECTION_LAYERS } from '@baustatik/cross-section-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { viewport, screenPoint } from '@baustatik/viewport-2d';
import { defineStore, createPinia } from 'pinia';

const pinia = createPinia();

// Store haelt ROHDATEN (keine section-geometry-Objekte, keine Kamera): den
// Wandgraphen und den daraus abgeleiteten Umriss, genau so, wie ADR 0030 ihn
// speichert. Der Umriss reist MIT — der Viewer leitet keinen eigenen ab.
const useStore = defineStore('sections', {
    state: () => ({
        nodes: [] as SectionNode[],
        walls: [] as Wall[],
        outline: [] as SectionGeometry['outline'],
    }),
    getters: {
        geometry(state): SectionGeometry {
            return {
                kind: 'walls',
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
        addWall(id: string, from: string, to: string, t: number) {
            this.walls.push({ id, from, to, t });
        },
        setOutline(points: { y: number; z: number }[]) {
            this.outline = [{ points }];
        },
    },
});
const store = useStore(pinia);

// Beispiel: ein Winkel aus zwei Waenden. `t` ist die physikalische Wandstaerke.
store.addNode('n-ecke', 0, 0);
store.addNode('n-unten', 0, 100);
store.addNode('n-rechts', 60, 0);
store.addWall('steg', 'n-ecke', 'n-unten', 8);
store.addWall('gurt', 'n-ecke', 'n-rechts', 8);
// Der Umriss der beiden um t/2 aufgeweiteten Mittellinien. Ihn abzuleiten ist
// Sache des Editors (P3, mit Clipper2); hier steht er von Hand.
store.setOutline([
    { y: -4, z: -4 },
    { y: 60, z: -4 },
    { y: 60, z: 4 },
    { y: 4, z: 4 },
    { y: 4, z: 100 },
    { y: -4, z: 100 },
]);

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
    getScreenSize: () => stageSize,
    grid: { spacing: 10 }, // Weltkoordinaten; der Querschnitt ist 60–100 Einheiten gross
});

// 3. Einmal zeichnen. Pan/Zoom laeuft danach automatisch intern.
viewer.requestRender();

// Bei Store-Aenderung neu zeichnen:
store.$subscribe(() => viewer.requestRender());
