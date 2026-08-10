import { createMesher2D, Mesh2DInputError } from '@baustatik/mesh-2d-wasm';
import type { Mesh2DRequest, Mesh2DResponse } from './mesh-2d-protocol';

type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<Mesh2DRequest>) => void,
  ): void;
  postMessage(message: Mesh2DResponse, transfer?: Transferable[]): void;
  close(): void;
};

const mesher = createMesher2D();
const workerScope = self as unknown as WorkerScope;
let stopped = false;
let queue = Promise.resolve();

workerScope.addEventListener('message', ({ data }: MessageEvent<Mesh2DRequest>) => {
  queue = queue.then(() => {
    if (stopped) return;
    return generate(data);
  });
});

async function generate(request: Mesh2DRequest): Promise<void> {
  try {
    const result = (await mesher).generate(request.input);
    workerScope.postMessage(
      { kind: 'generated', id: request.id, result },
      [
        result.points.buffer as ArrayBuffer,
        result.elements.buffer as ArrayBuffer,
        result.pointMarkers.buffer as ArrayBuffer,
        result.boundarySegments.buffer as ArrayBuffer,
        result.boundaryMarkers.buffer as ArrayBuffer,
      ],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Mesh2DInputError) {
      workerScope.postMessage({ kind: 'failed', id: request.id, message });
      return;
    }

    // Triangle-Abbrüche lassen die Instanz in unbekanntem Zustand. Der Port
    // verwirft diesen Worker und erzeugt beim nächsten Auftrag einen neuen.
    stopped = true;
    workerScope.postMessage({ kind: 'fatal', id: request.id, message });
    workerScope.close();
  }
}
