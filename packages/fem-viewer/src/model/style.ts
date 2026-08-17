/**
 * Die Modellscheibe des Viewer-Stils — Staebe, Knoten, Gelenke, Auflager.
 *
 * Eigenes Interface aus demselben Grund wie `loads/style.ts`: die Vorgaben
 * stehen bei der Abbildung, die sie braucht, ohne dass `model/` und `scene.ts`
 * sich gegenseitig importieren muessten. Zusammengesetzt werden die beiden
 * Scheiben in `../style.ts`.
 *
 * ALLE Groessen in Screen-Pixeln: der Viewer zeichnet ein SCHEMA, kein
 * massstaebliches Abbild. Wer sie zeichnet, teilt durch `vp.scale` — ausser
 * `strokeWidth`, das der Adapter ohnehin in Screen-Pixeln zeichnet
 * (`strokeScaleEnabled: false`).
 */
export interface ModelStyle {
  readonly beamColor?: string;
  readonly beamWidthPx?: number;
  readonly nodeColor?: string;
  readonly nodeRadiusPx?: number;
  readonly nodeSupportColor?: string;
  readonly hingeRadiusPx?: number;
  readonly hingeInnerColor?: string;
  readonly hingeStrokeColor?: string;
  /** Abstand der gestrichelten Faser von der Stabachse, auf der +ez-Seite. */
  readonly fiberOffsetPx?: number;
  readonly fiberWidthPx?: number;
  readonly fiberColor?: string;
  readonly fiberDashStyle?: 'solid' | 'dashed' | 'dotted';
}

export const DEFAULT_MODEL_STYLE: Required<ModelStyle> = {
  beamColor: '#000',
  beamWidthPx: 2,
  nodeColor: '#f00',
  nodeRadiusPx: 4,
  nodeSupportColor: '#0f0',
  hingeRadiusPx: 3,
  // Weiss gefuellt und schwarz umrandet: das Gelenk ist ein LOCH im Stab, kein
  // Punkt auf ihm. Die Fuellung deckt den Stabstrich, der sonst durchliefe.
  hingeInnerColor: '#fff',
  hingeStrokeColor: '#000',
  // Dicht am Stab und duenner als er: die Faser ist eine Lesehilfe, kein
  // zweites Bauteil. Grau statt schwarz, damit sie den Stabstrich nicht
  // verdoppelt, und gestrichelt, weil sie nichts Gebautes zeigt.
  fiberOffsetPx: 6,
  fiberWidthPx: 1,
  fiberColor: '#9ca3af',
  fiberDashStyle: 'dashed',
};
