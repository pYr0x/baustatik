import type { Mesh2DInput, Mesh2DResult } from '@baustatik/mesh-2d-wasm';
import type { Mesh2DRequest, Mesh2DResponse } from './mesh-2d-protocol';

type Pending = {
  readonly resolve: (result: Mesh2DResult) => void;
  readonly reject: (reason: Error) => void;
};

let nextRequestId = 0;
let worker: Worker | undefined;
const pendingRequests = new Map<number, Pending>();

/** Der Port kopiert und überträgt nur seine eigenen Eingabebuffer. */
export function generateMesh2D(input: Mesh2DInput): Promise<Mesh2DResult> {
  const id = nextRequestId++;
  const meshWorker = getWorker();
  const copied = copyInput(input);
  const request: Mesh2DRequest = { kind: 'generate', id, input: copied };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    meshWorker.postMessage(
      request,
      copied.rings.map((ring) => ring.coordinates.buffer as ArrayBuffer),
    );
  });
}

function getWorker(): Worker {
  if (worker !== undefined) return worker;

  const created = new Worker(new URL('./mesh-2d.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker = created;
  created.addEventListener('message', ({ data }: MessageEvent<Mesh2DResponse>) => {
    if (worker !== created) return;
    handleWorkerMessage(data);
  });
  created.addEventListener('error', ({ message }: ErrorEvent) => {
    if (worker === created) discardWorker(new Error(message || 'Der Mesh-Worker ist abgebrochen.'));
  });
  created.addEventListener('messageerror', () => {
    if (worker === created) discardWorker(new Error('Die Nachricht des Mesh-Workers ist ungültig.'));
  });
  return created;
}

function handleWorkerMessage(response: Mesh2DResponse): void {
  if (response.kind === 'fatal') {
    discardWorker(new Error(response.message));
    return;
  }
  const pending = pendingRequests.get(response.id);
  if (pending === undefined) return;
  pendingRequests.delete(response.id);
  if (response.kind === 'generated') {
    pending.resolve(response.result);
  } else {
    pending.reject(new Error(response.message));
  }
}

function discardWorker(reason: Error): void {
  worker?.terminate();
  worker = undefined;
  for (const { reject } of pendingRequests.values()) reject(reason);
  pendingRequests.clear();
}

function copyInput(input: Mesh2DInput): Mesh2DInput {
  return {
    ...input,
    rings: input.rings.map((ring) => ({ ...ring, coordinates: new Float64Array(ring.coordinates) })),
  };
}
