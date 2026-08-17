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

/**
 * Die Ueberhoehung eines Schnittgroessenverlaufs ist kein positiver Faktor.
 *
 * GEBROCHENE VORBEDINGUNG, deshalb ein Wurf und kein stilles Ausweichen:
 * `DiagramOptions` sagt mit der ANWESENHEIT eines Feldes „zeichne diese
 * Schnittgroesse", der Wert ist der Faktor. `0` hiesse „zeichne sie in Hoehe
 * null" — das ist nicht „aus", sondern eine Flaeche, die es nicht gibt, und ein
 * negativer Faktor spiegelte die Auftragsseite und damit die eine Regel, an der
 * das ganze Bild haengt. Wer nichts zeichnen will, laesst das Feld weg.
 *
 * `NaN` faellt unter dieselbe Pruefung — `!(value > 0)` ist dafuer geschrieben.
 */
export class InvalidDiagramExaggerationError extends BaustatikError {
  readonly component: string;
  readonly value: number;

  constructor(component: string, value: number) {
    super(
      `Ueberhoehung fuer "${component}" muss groesser als 0 sein, ist ${value}`,
    );
    this.component = component;
    this.value = value;
  }
}

export class UnsupportedSupportError extends BaustatikError {
  constructor(supportId: string, ux: string, uz: string, phiY: string) {
    super(
      `NodeSupport "${supportId}" wird noch nicht dargestellt: ux=${ux}, uz=${uz}, phiY=${phiY}`,
    );
  }
}
