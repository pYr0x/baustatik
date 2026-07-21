import type { ViewIntent } from '@baustatik/render-core';
import type Konva from 'konva';

// Multiplikativer Zoom-Schritt pro Wheel-Notch.
const ZOOM_STEP = 1.1;

export interface Interaction {
  // Der Adapter MELDET nur Kamera-Wuensche; die Viewport-Wahrheit liegt beim Viewer.
  onViewIntent(handler: (intent: ViewIntent) => void): void;
}

// Maus-/Zeiger-Interaktion auf der Stage. Pointer Events + natives
// setPointerCapture garantieren, dass ein Pan-Drag auch dann sauber endet, wenn
// der Zeiger das Canvas verlaesst — ohne globale window-Listener, die destroy()
// wieder abraeumen muesste.
export function attachInteraction(stage: Konva.Stage): Interaction {
  let handler: ((intent: ViewIntent) => void) | null = null;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const container = stage.container();

  stage.on('pointerdown', (e) => {
    dragging = true;
    lastX = e.evt.clientX;
    lastY = e.evt.clientY;
    try {
      container.setPointerCapture(e.evt.pointerId);
    } catch {
      // Zeiger nicht (mehr) aktiv — Capture ist dann entbehrlich.
    }
  });

  stage.on('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.evt.clientX - lastX;
    const dy = e.evt.clientY - lastY;
    lastX = e.evt.clientX;
    lastY = e.evt.clientY;
    handler?.({ type: 'pan', dx, dy });
  });

  const endDrag = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (!dragging) return;
    dragging = false;
    try {
      container.releasePointerCapture(e.evt.pointerId);
    } catch {
      // Capture bereits freigegeben — nichts zu tun.
    }
  };
  stage.on('pointerup', endDrag);
  stage.on('pointercancel', endDrag);

  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const factor = e.evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const pointer = stage.getPointerPosition() ?? { x: 0, y: 0 };
    handler?.({ type: 'zoom', factor, pointer });
  });

  return {
    onViewIntent(next) {
      handler = next;
    },
  };
}
