import { BaustatikError } from '@baustatik/errors';

/**
 * Das von aussen gelieferte Netz passt nicht zu seinem eigenen `kind`.
 *
 * BEWUSST EIN WURF UND KEINE STILLE AUSLASSUNG — und damit die Ausnahme in
 * diesem Package: der Wandgraph darf waehrend der Eingabe unfertig sein und
 * wird fehlertolerant gezeichnet, ein Netz aber ist ein RECHENERGEBNIS. Zaehlt
 * seine Elementliste nicht auf die Knotenzahl je Element auf, stimmt etwas an
 * der Rechnung und nicht an der Zeichnung; still weggezeichnet waere der Fehler
 * spaeter kaum zu finden.
 *
 * Die Zahlen stehen als Felder und nicht nur in der Meldung, damit ein Aufrufer
 * sie anzeigen kann, ohne den Text zu zerlegen.
 */
export class InvalidFEMeshError extends BaustatikError {
  readonly kind: string;
  readonly elementWidth: number;
  readonly elementLength: number;

  constructor(kind: string, elementWidth: number, elementLength: number) {
    super(
      `FE-Netz "${kind}" erwartet ${elementWidth} Knoten je Element, die Elementliste hat aber ${elementLength} Eintraege`,
    );
    this.kind = kind;
    this.elementWidth = elementWidth;
    this.elementLength = elementLength;
  }
}
