import {
  computeFESectionValues,
  type FEComputation,
} from '@baustatik/cross-section-fe';
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
    workerScope.postMessage(
      { kind: 'computed', id: request.id, result },
      transferable(result),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stopped = true;
    workerScope.postMessage({ kind: 'fatal', id: request.id, message });
    workerScope.close();
  }
}

/**
 * Die typisierten Puffer des Ergebnisses — UEBERTRAGEN statt kopiert.
 *
 * ES SIND ZWOELF PUFFER UND NICHT FUENF. Das Netz ist der sichtbare Teil, aber
 * seit ADR 0061 reisen die geloesten FELDER daneben: `section.y`, `section.z`
 * und die fuenf Knotenfelder, alle in Netzlaenge und alle `Float64Array`. Ohne
 * diese Liste wuerden sie STRUKTURIERT KOPIERT — bei 20 000 Elementen sind das
 * ein paar Megabyte, die der Hauptfaden zweimal haelt und der Worker gleich
 * darauf wegwirft.
 *
 * `section.mesh` IST `result.mesh`, dieselbe Referenz. `structuredClone`
 * erhaelt die Identitaet im Objektgraphen, das Netz reist also einmal, und
 * jeder Puffer steht genau einmal in dieser Liste.
 *
 * `section.isBoundary` bleibt eine Kopie: ein `Uint8Array` je Knoten ist ein
 * Achtel eines Feldes, und `loops` — plain arrays — laesst sich ohnehin nicht
 * uebertragen.
 *
 * DER `'refused'`-ARM TRAEGT NICHTS DAVON. Vor dem Vernetzen gibt es weder Netz
 * noch Felder, und das steht seit ADR 0061 im Typ statt in einem `?`.
 */
function transferable(result: FEComputation): Transferable[] {
  if (result.kind !== 'solved') return [];
  const { mesh, fields } = result;
  return [
    mesh.points.buffer as ArrayBuffer,
    mesh.elements.buffer as ArrayBuffer,
    mesh.pointMarkers.buffer as ArrayBuffer,
    mesh.boundarySegments.buffer as ArrayBuffer,
    mesh.boundaryMarkers.buffer as ArrayBuffer,
    fields.section.y.buffer as ArrayBuffer,
    fields.section.z.buffer as ArrayBuffer,
    fields.omega.buffer as ArrayBuffer,
    fields.psi0Z.buffer as ArrayBuffer,
    fields.psi1Z.buffer as ArrayBuffer,
    fields.psi0Y.buffer as ArrayBuffer,
    fields.psi1Y.buffer as ArrayBuffer,
  ];
}
