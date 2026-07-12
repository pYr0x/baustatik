import { type Segment } from '@baustatik/cross-section';
import { createCrossSectionViewer} from '@baustatik/cross-section-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import { Point as SectionPoint } from '@baustatik/section-geometry';
import { defineStore, createPinia } from 'pinia';

const pinia = createPinia();

// Store haelt ROHDATEN (keine section-geometry-Objekte, keine Kamera).
const useStore = defineStore('sections', {
    state: () => ({
        segments: [] as Segment[],
    }),
    actions: {
        addLine(start: { y: number; z: number }, end: { y: number; z: number }, thickness: number) {
            this.segments.push({ id: crypto.randomUUID(), geometry: 'line', start, end, thickness });
        },
        addArc(center: { y: number; z: number }, radius: number, startAngle: number, sweep: number, thickness: number) {
            this.segments.push({ id: crypto.randomUUID(), geometry: 'arc', center, radius, startAngle, sweep, thickness });
        },
    },
});
const store = useStore(pinia);

// Beispiel: ein paar Waende + ein Bogen. thickness = physikalische Wandstaerke.
store.addLine(SectionPoint.make(0, 0), SectionPoint.make(0, 100), 8);
store.addLine(SectionPoint.make(0, 0), SectionPoint.make(60, 0), 8);
// store.addArc(SectionPoint.make(0, 100), 30, 0, Math.PI / 2, 6);

// 1. Driver bauen (kennt Konva). Kein onViewIntent hier — der Viewer haengt sich selbst dran.
const driver = createKonvaDriver({
    container: document.getElementById('container') as HTMLDivElement,
    width: window.innerWidth,
    height: window.innerHeight,
});

// 2. Viewer: Driver injizieren, Segmente per PULL aus dem Store.
const viewer = createCrossSectionViewer({
    driver,
    getSegments: () => store.segments,
});

// 3. Einmal zeichnen. Pan/Zoom laeuft danach automatisch intern.
viewer.requestRender();

// Bei Store-Aenderung neu zeichnen:
store.$subscribe(() => viewer.requestRender());