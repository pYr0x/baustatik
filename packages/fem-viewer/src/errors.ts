import { BaustatikError } from '@baustatik/errors';

// Ein Beam verweist auf eine Node-ID, die es im Modell nicht gibt.
//
// Bewusst ein Wurf und keine stille Auslassung: anders als die maxLines-Sicherung
// in grid-2d ist das kein transienter Zustand, der sich durch Weiterpannen
// aufloest, sondern ein Datenfehler. Ein still uebersprungener Stab verschwindet
// spurlos aus der Zeichnung und ist spaeter kaum zu finden.
export class UnknownNodeReferenceError extends BaustatikError {
  constructor(elementId: string, nodeId: string, elementKind = 'Beam') {
    super(
      `${elementKind} "${elementId}" verweist auf unbekannten Knoten "${nodeId}"`,
    );
  }
}

export class UnsupportedSupportError extends BaustatikError {
  constructor(supportId: string, ux: string, uz: string, phiY: string) {
    super(
      `NodeSupport "${supportId}" wird noch nicht dargestellt: ux=${ux}, uz=${uz}, phiY=${phiY}`,
    );
  }
}
