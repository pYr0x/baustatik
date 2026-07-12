import type { WorldPoint } from '@baustatik/viewport-2d';
// todo
export type ElementIntent =
  | { type: 'select'; id: string }
  | { type: 'hover'; id: string | null }
  | { type: 'dragMove'; id: string; to: WorldPoint };
