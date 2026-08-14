import type { SectionGeometry, SectionPolicy } from '@baustatik/cross-section';
import type { FEComputation } from '@baustatik/cross-section-fe';
import type {
  CrossSectionFERequest,
  CrossSectionFEResponse,
} from './cross-section-fe-protocol';

/**
 * Der Port zur FE-Querschnittsrechnung — dasselbe Muster wie `mesh-2d-port.ts`.
 *
 * WARUM UEBERHAUPT EIN WORKER: die Rechnung vernetzt und faktorisiert, und
 * beides kann bei einer feinen Vorgabe Sekunden dauern. Im Hauptfaden staende
 * die Oberflaeche dabei.
 */
type Pending = {
  readonly resolve: (result: FEComputation) => void;
  readonly reject: (reason: Error) => void;
};

let nextRequestId = 0;
let worker: Worker | undefined;
const pendingRequests = new Map<number, Pending>();

export function computeFESection(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): Promise<FEComputation> {
  const id = nextRequestId++;
  const feWorker = getWorker();
  const request: CrossSectionFERequest = {
    kind: 'compute',
    id,
    // STRUKTURIERT KOPIERT: der Store ist ein Pinia-Proxy, und ein Proxy
    // ueberlebt `postMessage` nicht.
    geometry: structuredClone(toPlain(geometry)),
    policy: { ...policy },
  };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    feWorker.postMessage(request);
  });
}

/** Ein Pinia-Proxy ist nicht klonbar; JSON macht daraus reine Daten. */
function toPlain(geometry: SectionGeometry): SectionGeometry {
  return JSON.parse(JSON.stringify(geometry)) as SectionGeometry;
}

function getWorker(): Worker {
  if (worker !== undefined) return worker;

  const created = new Worker(
    new URL('./cross-section-fe.worker.ts', import.meta.url),
    { type: 'module' },
  );
  worker = created;
  created.addEventListener(
    'message',
    ({ data }: MessageEvent<CrossSectionFEResponse>) => {
      if (worker !== created) return;
      handleWorkerMessage(data);
    },
  );
  created.addEventListener('error', ({ message }: ErrorEvent) => {
    if (worker === created) {
      discardWorker(new Error(message || 'Der FE-Worker ist abgebrochen.'));
    }
  });
  created.addEventListener('messageerror', () => {
    if (worker === created) {
      discardWorker(new Error('Die Nachricht des FE-Workers ist ungültig.'));
    }
  });
  return created;
}

function handleWorkerMessage(response: CrossSectionFEResponse): void {
  if (response.kind === 'fatal') {
    discardWorker(new Error(response.message));
    return;
  }
  const pending = pendingRequests.get(response.id);
  if (pending === undefined) return;
  pendingRequests.delete(response.id);
  if (response.kind === 'computed') {
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
