import type { LineSpec } from '@baustatik/render-core';
import {
  type Size,
  type Viewport,
  visibleWorldBounds,
  type WorldBounds,
  worldPoint,
} from '@baustatik/viewport-2d';

import { InvalidGridOptionsError, InvalidGridSpacingError } from './errors';
import type { GridLineStyle, GridOptions } from './types';

const DEFAULT_GRID_STYLE: Required<GridLineStyle> = {
  strokeColor: '#e0e0e0',
  strokeWidth: 1,
};

const DEFAULT_AXIS_STYLE: Required<GridLineStyle> = {
  strokeColor: '#a0a0a0',
  strokeWidth: 1.5,
};

const DEFAULT_MAX_LINES = 2000;

// Beide Viewer nennen ihr unterstes Band so — Vorgabe spart dem Aufrufer die
// Wiederholung, ohne den Namen fest zu verdrahten.
const DEFAULT_LAYER = 'grid';

function validateStyle(style: GridLineStyle, name: string): void {
  if (style.strokeWidth !== undefined) {
    if (!Number.isFinite(style.strokeWidth) || style.strokeWidth < 0) {
      throw new InvalidGridOptionsError(
        `${name}.strokeWidth muss eine endliche Zahl >= 0 sein`,
      );
    }
  }
}

function validateOptions(options: GridOptions): void {
  if (!Number.isFinite(options.spacing)) {
    throw new InvalidGridSpacingError('spacing muss eine endliche Zahl sein');
  }
  if (options.spacing <= 0) {
    throw new InvalidGridSpacingError('spacing muss > 0 sein');
  }
  if (options.maxLines !== undefined) {
    if (!Number.isInteger(options.maxLines) || options.maxLines <= 0) {
      throw new InvalidGridOptionsError(
        'maxLines muss eine ganze Zahl > 0 sein',
      );
    }
  }
  if (options.gridStyle) validateStyle(options.gridStyle, 'gridStyle');
  if (options.axisStyle) validateStyle(options.axisStyle, 'axisStyle');
}

// Achsen ans Ende des Arrays: innerhalb des Grids obenauf (Konva-z-Order
// folgt der Einfuegereihenfolge).
function axisSpecs(
  b: WorldBounds,
  style: Required<GridLineStyle>,
  layer: string,
): LineSpec[] {
  const axes: LineSpec[] = [];
  // v-Achse: Linie u = 0 (vertikal), nur wenn der Ursprung horizontal im Bild liegt.
  if (b.minU <= 0 && 0 <= b.maxU) {
    axes.push({
      kind: 'line',
      id: 'grid:axis:v',
      layer,
      from: worldPoint(0, b.minV),
      to: worldPoint(0, b.maxV),
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth,
    });
  }
  // u-Achse: Linie v = 0 (horizontal).
  if (b.minV <= 0 && 0 <= b.maxV) {
    axes.push({
      kind: 'line',
      id: 'grid:axis:u',
      layer,
      from: worldPoint(b.minU, 0),
      to: worldPoint(b.maxU, 0),
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth,
    });
  }
  return axes;
}

// Berechnet die sichtbaren Gitterlinien (+ Achsen) als neutrale LineSpecs.
// IDs sind welt-indiziert (grid:v:{k} bei u = k*spacing) und damit stabil
// ueber Pan/Zoom — der Renderer patcht statt neu zu bauen.
export function gridSpecs(
  vp: Viewport,
  screenSize: Size,
  options: GridOptions,
): readonly LineSpec[] {
  validateOptions(options);

  const { spacing } = options;
  const showAxes = options.showAxes ?? true;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const gridStyle = { ...DEFAULT_GRID_STYLE, ...options.gridStyle };
  const axisStyle = { ...DEFAULT_AXIS_STYLE, ...options.axisStyle };
  const layer = options.layer ?? DEFAULT_LAYER;

  const b = visibleWorldBounds(vp, screenSize);

  // Erste/letzte Vielfache des Spacings im Sichtbereich; ceil/floor liefern
  // direkt ganzzahlige Indizes fuer die IDs.
  const kMinU = Math.ceil(b.minU / spacing);
  const kMaxU = Math.floor(b.maxU / spacing);
  const kMinV = Math.ceil(b.minV / spacing);
  const kMaxV = Math.floor(b.maxV / spacing);

  const axes = showAxes ? axisSpecs(b, axisStyle, layer) : [];

  // Sicherung: bei zu vielen Linien nur die Achsen zeichnen statt zu werfen —
  // gridSpecs laeuft in jedem Pan/Zoom-Frame, ein Throw wuerde die
  // Interaktion crashen. Wird mit spaeterer zoomabhaengiger Spacing-Wahl obsolet.
  const lineCount =
    Math.max(0, kMaxU - kMinU + 1) + Math.max(0, kMaxV - kMinV + 1);
  if (lineCount > maxLines) {
    return axes;
  }

  const specs: LineSpec[] = [];

  // Vertikale Linien (konstantes u). k = 0 wird bei showAxes uebersprungen —
  // die Achse ersetzt die deckungsgleiche Gitterlinie.
  for (let k = kMinU; k <= kMaxU; k++) {
    if (k === 0 && showAxes) continue;
    const u = k * spacing;
    specs.push({
      kind: 'line',
      id: `grid:v:${k}`,
      layer,
      from: worldPoint(u, b.minV),
      to: worldPoint(u, b.maxV),
      strokeColor: gridStyle.strokeColor,
      strokeWidth: gridStyle.strokeWidth,
    });
  }

  // Horizontale Linien (konstantes v).
  for (let k = kMinV; k <= kMaxV; k++) {
    if (k === 0 && showAxes) continue;
    const v = k * spacing;
    specs.push({
      kind: 'line',
      id: `grid:h:${k}`,
      layer,
      from: worldPoint(b.minU, v),
      to: worldPoint(b.maxU, v),
      strokeColor: gridStyle.strokeColor,
      strokeWidth: gridStyle.strokeWidth,
    });
  }

  specs.push(...axes);
  return specs;
}
