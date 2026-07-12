import { viewport, screenPoint, screenToWorld } from './core';
import type { Viewport, ScreenPoint } from './types';

// Pan: origin um eine Pixel-Verschiebung versetzen.
export function pan(vp: Viewport, dx: number, dy: number): Viewport {
    return viewport(screenPoint(vp.origin.x + dx, vp.origin.y + dy), vp.scale);
}

// Zoom um einen Punkt (Cursor): der Weltpunkt unter `pivot` bleibt fix.
export function zoomAround(vp: Viewport, pivot: ScreenPoint, factor: number): Viewport {
    const w = screenToWorld(pivot, vp);        // Weltpunkt unter dem Cursor
    const scale = vp.scale * factor;
    return viewport(
        screenPoint(pivot.x - w.u * scale, pivot.y - w.v * scale),
        scale,
    );
}