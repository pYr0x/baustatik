import { computeFESectionValues } from '@baustatik/cross-section-fe';
import type {
  CrossSectionFERequest,
  CrossSectionFEResponse,
} from './cross-section-fe-protocol';

/**
 * Der Worker der FE-Querschnittsrechnung.
 *
 * ER TRAEGT BEIDE WASM-ARTEFAKTE, den Mesher und den duennbesetzten Loeser —
 * das ist genau die Buendelung, um derentwillen es
 * `@baustatik/cross-section-fe` gibt (ADR 0047). Der Hauptfaden sieht keines
 * von beiden.
 *
 * EINE ANFRAGE NACH DER ANDEREN. Triangle-Abbrueche lassen die Instanz in
 * unbekanntem Zustand; dieselbe Haltung wie in `mesh-2d.worker.ts`.
 */
type WorkerScope = {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<CrossSectionFERequest>) => void,
  ): void;
  postMessage(message: CrossSectionFEResponse, transfer?: Transferable[]): void;
  close(): void;
};

const workerScope = self as unknown as WorkerScope;
let stopped = false;
let queue = Promise.resolve();

workerScope.addEventListener(
  'message',
  ({ data }: MessageEvent<CrossSectionFERequest>) => {
    queue = queue.then(() => {
      if (stopped) return;
      return compute(data);
    });
  },
);

async function compute(request: CrossSectionFERequest): Promise<void> {
  try {
    const result = await computeFESectionValues(request.geometry, request.policy);
    // Das Netz wird UEBERTRAGEN und nicht kopiert: es sind fuenf typisierte
    // Felder mit sechsstelligen Laengen, und der Hauptfaden zeichnet damit.
    const transfer =
      result.kind === 'solved'
        ? [
            result.mesh.points.buffer as ArrayBuffer,
            result.mesh.elements.buffer as ArrayBuffer,
            result.mesh.pointMarkers.buffer as ArrayBuffer,
            result.mesh.boundarySegments.buffer as ArrayBuffer,
            result.mesh.boundaryMarkers.buffer as ArrayBuffer,
          ]
        : [];
    workerScope.postMessage(
      { kind: 'computed', id: request.id, result },
      transfer,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stopped = true;
    workerScope.postMessage({ kind: 'fatal', id: request.id, message });
    workerScope.close();
  }
}
