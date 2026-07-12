import Konva from 'konva';
import { worldPointsToFlatArray, type Viewport } from '@baustatik/viewport-2d';
import { assertNever, type Spec, type ViewIntent, type RenderDriver } from '@baustatik/render-core';

interface KonvaDriverConfig {
    container: HTMLDivElement;
    width: number;
    height: number;
}

// Uebersetzung neutrale Spec -> Konva.Shape. Einzige Stelle mit Konva-Feldnamen.
function build(spec: Spec): Konva.Shape {
    switch (spec.kind) {
        case 'line':
            return new Konva.Line({
                // points: [spec.from.u, spec.from.v, spec.to.u, spec.to.v],
                points: worldPointsToFlatArray([spec.from, spec.to]),
                stroke: spec.strokeColor,
                strokeWidth: spec.strokeWidth,
                strokeScaleEnabled: false,
            });
        case 'circle':
        //   return new Konva.Circle({
        //     x: spec.center.u, y: spec.center.v,
        //     radius: spec.radius,
        //     fill: spec.fillColor,
        //     stroke: spec.strokeColor,
        //     strokeWidth: spec.strokeWidth,
        //     strokeScaleEnabled: false,
        //   });
        case 'polygon':
        //   return new Konva.Line({
        //     points: worldPointsToFlatArray(spec.points),
        //     closed: spec.closed,
        //     fill: spec.fillColor,
        //     stroke: spec.strokeColor,
        //     strokeWidth: spec.strokeWidth,
        //     strokeScaleEnabled: false,
        //   });
        case 'triangle':
            break;
        //   // gleichseitiges Dreieck um center; als geschlossene Linie
        //   return new Konva.Line({ points: [], closed: true, fill: spec.fillColor, stroke: spec.strokeColor });
        default:
            return assertNever(spec);
    }
}

function patch(shape: Konva.Shape, spec: Spec): void {
    switch (spec.kind) {
        case 'line':
            //   (shape as Konva.Line).points(worldPointsToFlatArray([spec.from, spec.to]));
            if (spec.strokeColor) shape.stroke(spec.strokeColor);
            if (spec.strokeWidth) shape.strokeWidth(spec.strokeWidth);
            break;
        case 'circle':
        //   shape.position({ x: spec.center.u, y: spec.center.v });
        //   (shape as Konva.Circle).radius(spec.radius);
        //   if (spec.fillColor) shape.fill(spec.fillColor);
        //   break;
        case 'polygon':
        //   (shape as Konva.Line).points(worldPointsToFlatArray(spec.points));
        //   if (spec.fillColor) shape.fill(spec.fillColor);
        //   break;
        case 'triangle':
            break;
        default:
            return assertNever(spec);
    }
}

export function createKonvaAdapter(config: KonvaDriverConfig): RenderDriver {
    const stage = new Konva.Stage(config);
    const layer = new Konva.Layer();
    stage.add(layer);

    const live = new Map<string, Konva.Shape>();
    // 1. DEKLARIEREN
    let intentHandler: ((intent: ViewIntent) => void) | null = null;

    // Maus-Interaktion: nur MELDEN.
    let dragging = false, lastX = 0, lastY = 0;
    stage.on('mousedown', (e) => { dragging = true; lastX = e.evt.clientX; lastY = e.evt.clientY; });
    stage.on('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.evt.clientX - lastX;
        const dy = e.evt.clientY - lastY;
        lastX = e.evt.clientX; lastY = e.evt.clientY;
        // 3. AUSLOESEN
        intentHandler?.({ type: 'pan', dx, dy });
    });
    stage.on('mouseup', () => { dragging = false; });
    stage.on('wheel', (e) => {
        e.evt.preventDefault();
        const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
        const pointer = stage.getPointerPosition() ?? { x: 0, y: 0 };
        intentHandler?.({ type: 'zoom', factor, pointer });
    });

    return {
        applyViewport(vp: Viewport) {
            stage.scale({ x: vp.scale, y: vp.scale });
            stage.position({ x: vp.origin.x, y: vp.origin.y });
        },

        // 2. MERKEN
        onViewIntent(handler) { intentHandler = handler; },

        reconcile(specs: readonly Spec[]) {
            const seen = new Set<string>();
            for (const spec of specs) {
                seen.add(spec.id);
                const existing = live.get(spec.id);
                if (existing) {
                    patch(existing, spec);
                } else {
                    const shape = build(spec);
                    layer.add(shape);
                    live.set(spec.id, shape);
                }
            }
            for (const [id, shape] of live) {
                if (!seen.has(id)) { shape.destroy(); live.delete(id); }
            }
        },

        flush() { layer.batchDraw(); },
        destroy() { stage.destroy(); },
    };
}