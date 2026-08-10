import { AssertionError } from '@baustatik/core';
import type { TriangleModule } from './triangle.mjs';

const HEAPS = new WeakMap<object, TriangleModule>();

/** Hält den WASM-Heap für den package-internen Leak-Test erreichbar. */
export function registerMesherHeap(
  mesher: object,
  module: TriangleModule,
): void {
  HEAPS.set(mesher, module);
}

export function mesherHeapByteLength(mesher: object): number {
  const module = HEAPS.get(mesher);
  if (module === undefined) {
    throw new AssertionError(
      'Der Mesher besitzt keinen registrierten WASM-Heap.',
    );
  }
  return module.HEAPF64.buffer.byteLength;
}
