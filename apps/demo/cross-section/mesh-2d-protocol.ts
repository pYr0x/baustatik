import type { Mesh2DInput, Mesh2DResult } from '@baustatik/mesh-2d-wasm';

export type Mesh2DRequest = {
  readonly kind: 'generate';
  readonly id: number;
  readonly input: Mesh2DInput;
};

export type Mesh2DResponse =
  | { readonly kind: 'generated'; readonly id: number; readonly result: Mesh2DResult }
  | { readonly kind: 'failed'; readonly id: number; readonly message: string }
  | { readonly kind: 'fatal'; readonly id: number; readonly message: string };
