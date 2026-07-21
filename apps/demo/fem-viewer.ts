import { type Node, type Beam, type NodeSupport } from '@baustatik/fem';
import { createFEMViewer, FEM_LAYERS } from '@baustatik/fem-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { Point } from '@baustatik/fem-geometry';
import { defineStore, createPinia } from 'pinia';
import { viewport, screenPoint } from '@baustatik/viewport-2d';

const pinia = createPinia();

// Store haelt ROHDATEN (keine section-geometry-Objekte, keine Kamera).
const useStore = defineStore('sections', {
    state: () => ({
        nodes: [] as Node[],
        beams: [] as Beam[],
        supports: [] as NodeSupport[],
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
    },
});
const store = useStore(pinia);

store.addNode(Point.make(0, 0));
store.addNode(Point.make(100, 0));
store.addBeam(store.nodes[0], store.nodes[1], 'default', 'default');
store.addSupport(store.nodes[0], 'fixed', 'fixed', 'free');


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