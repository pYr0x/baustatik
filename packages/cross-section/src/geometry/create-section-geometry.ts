/**
 * Die Fabrik: aus der EINGABE wird der vollständige Satz
 * ([ADR 0037](../../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
 *
 * `SectionGeometry` führt den abgeleiteten Umriss MIT (ADR 0030). Bis hierher
 * musste ihn jeder Aufrufer selbst danebenlegen — die Demo tat es wörtlich, mit
 * sechs von Hand getippten Punkten. Diese Tür setzt beides in EINEM Schritt
 * zusammen und ist damit die Stelle, an der die Toleranz, unter der der Umriss
 * entstand, garantiert dieselbe ist wie die, die daneben gespeichert wird.
 *
 * DER RECORD BLEIBT FREI KONSTRUIERBAR, und das ist keine Nachlässigkeit: er
 * ist reine, JSON-serialisierbare Daten und muss aus einer geladenen Datei
 * rekonstruierbar sein, OHNE durch eine Fabrik zu laufen. Ein Brand — ein
 * verstecktes Feld, das nur die Fabrik setzen kann — machte das Laden zum
 * Sonderfall und hätte damit genau den Weg beschädigt, für den der mitgeführte
 * Umriss überhaupt existiert.
 *
 * SIE PRÜFT NICHT. Was an der Eingabe falsch ist, sagt `validateSectionGeometry`
 * — mit Namen, als Sammelbefund, und für den fertigen Satz. Eine Fabrik, die
 * wirft, nähme dem Gate die halbe Arbeit ab und ließe die andere Hälfte
 * doppelt stehen.
 */

import type { Idealisation } from '../model/idealisation';
import type {
  Ring,
  SectionGeometry,
  SectionNode,
  Wall,
} from '../model/section-geometry';
import type { SectionPolicy } from '../policy';
import { deriveOutline } from './outline/derive-outline';

/**
 * Was der Editor zeichnet — der Satz OHNE seinen abgeleiteten Umriss.
 *
 * Dieselben zwei Varianten wie `SectionGeometry`, nur eben ohne `outline`: die
 * Eingabe und das Ergebnis sind am Typ unterscheidbar, wie schon `Vertex` gegen
 * `Polygon`.
 */
export type SectionGeometryInput =
  | {
      kind: 'midline';
      nodes: SectionNode[];
      walls: Wall[];
      idealisation: Idealisation;
    }
  | { kind: 'outline'; rings: Ring[] };

/**
 * Der vollständige Satz aus der Eingabe und der Erzeugungs-Einstellung.
 *
 * Die Policy ist ein PARAMETER und keine Voreinstellung im Rücken: eine Zahl,
 * die das Ergebnis ändert, wird übergeben und nicht importiert (ADR 0011). Der
 * Umriss, der herauskommt, gehört zu GENAU dieser Einstellung — wer eine andere
 * daneben speichert, bekommt beim nächsten Gate-Lauf eine
 * `OutlineDriftWarning`.
 */
export function createSectionGeometry(
  input: SectionGeometryInput,
  policy: SectionPolicy,
): SectionGeometry {
  const base: SectionGeometry =
    input.kind === 'outline'
      ? { kind: 'outline', rings: input.rings, outline: [] }
      : {
          kind: 'midline',
          nodes: input.nodes,
          walls: input.walls,
          idealisation: input.idealisation,
          outline: [],
        };

  // Der Umriss wird aus dem BASISSATZ abgeleitet und nicht aus der Eingabe
  // daneben: so gibt es genau eine Tür (`deriveOutline`) und keine zweite
  // Fallunterscheidung über `kind`.
  return { ...base, outline: [...deriveOutline(base, policy)] };
}
