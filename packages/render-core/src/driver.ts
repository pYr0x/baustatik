import type { Viewport } from '@baustatik/viewport-2d';
import type { Spec } from './specs';
import type { ViewIntent } from './intents/view';

export interface RenderDriver {
  applyViewport(vp: Viewport): void;
  reconcile(specs: readonly Spec[]): void;
  flush(): void;
  onViewIntent(handler: (intent: ViewIntent) => void): void;
  destroy(): void;
}
