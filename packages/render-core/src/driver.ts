import type { Viewport } from '@baustatik/viewport-2d';
import type { ViewIntent } from './intents/view';
import type { Spec } from './specs';

export interface RenderDriver {
  applyViewport(vp: Viewport): void;
  reconcile(specs: readonly Spec[]): void;
  flush(): void;
  onViewIntent(handler: (intent: ViewIntent) => void): void;
  destroy(): void;
}
