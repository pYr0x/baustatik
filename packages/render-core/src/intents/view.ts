import type { ScreenPoint } from '@baustatik/viewport-2d';

// Was der Nutzer an Kamera-Aenderung ANFRAEGT. Der Adapter meldet es,
// entscheidet aber nichts — die Viewport-Wahrheit liegt beim Viewer.
export type ViewIntent =
  | { readonly type: 'pan'; readonly dx: number; readonly dy: number }
  | {
      readonly type: 'zoom';
      readonly factor: number;
      readonly pointer: ScreenPoint;
    }
  | { readonly type: 'reset' } // todo
  | { readonly type: 'fit' }; // todo
