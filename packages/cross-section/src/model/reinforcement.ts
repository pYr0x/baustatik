import type { cm2, mm } from '@baustatik/units';

/**
 * Ein Bewehrungselement — eine Stelle im Querschnitt und die Fläche, die dort
 * beginnt
 * ([ADR 0064](../../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
 *
 * `As` IST DER ANFANGSWERT EINER ITERATION, nicht die Bewehrung, die gebaut
 * wird. Der GZT-Nachweis sucht die Dehnungsebene, in der die inneren
 * Schnittgrössen den äusseren das Gleichgewicht halten, und dabei die Fläche,
 * bei der das aufgeht. Deshalb liest `sectionProperties` das Feld NICHT: den
 * eingegebenen Wert in `A` und `Iy` zu multiplizieren hiesse, mit einer Zahl zu
 * rechnen, die die Bemessung gerade für falsch erklärt.
 *
 * `Asmax` ABWESEND HEISST UNBEGRENZT, `Asmax === As` HEISST EINGEFROREN. Ein
 * Flag daneben („nicht erhöhen") wäre eine zweite Art, dasselbe zu sagen, und
 * die beiden könnten sich widersprechen. Die Schranke sitzt AM ELEMENT und
 * nicht an der Lage: eine Summenschranke über der Lage wäre eine Zahl, die den
 * Zahlen darunter widersprechen kann, und das Gate müsste entscheiden, welcher
 * von beiden die Bemessung folgt.
 *
 * `Element` UND NICHT `Bar`: der Punkt steht für einen Stab oder für mehrere,
 * und „Bewehrungselement" ist das Wort dafür. `Wall`s JSDoc hatte `Element`
 * für das Stabelement reserviert — das Präfix gibt die Reservierung auf das
 * blosse Wort zurück (ADR 0064).
 *
 * KEIN DURCHMESSER. Er wird für Rissbreite, Verankerung und Stababstand
 * gebraucht und kommt mit seinen Lesern; heute wäre er eine eingefrorene Zahl,
 * an der niemand merkt, dass sie falsch ist — dasselbe Argument, mit dem
 * `@baustatik/material` die charakteristische Streckgrenze nicht kopiert.
 *
 * EINHEITEN WIE DER BEWEHRUNGSPLAN: die Lage in mm, die Fläche in cm². Die
 * Mischung in EINEM Satz ist nicht neu — `StressPoint` führt mm und cm³
 * nebeneinander seit ADR 0052 —, und die gebrandeten Typen aus
 * `@baustatik/units` machen sie unverwechselbar. Die Umrechnung cm² → mm² hat
 * genau eine Stelle, und die liegt in der Faserherstellung von
 * `@baustatik/cross-section-response` (ADR 0063); dieses Package rechnet nicht,
 * es trägt den Satz.
 */
export type ReinforcementElement = {
  /**
   * Eindeutig über ALLE Lagen des Querschnitts, nicht nur innerhalb der
   * eigenen: der Viewer baut daraus seine Spec-Id
   * (`cross-section:rebar:${layer.id}:${element.id}`), und sein Abgleich
   * braucht sie eindeutig. Das Gate meldet die Doppelung.
   */
  readonly id: string;
  /**
   * Ort [mm], IM RAHMEN DER GEOMETRIE DANEBEN: bei `kind: 'section-geometry'`
   * derselbe wie die `rings`, bei `kind: 'shape'` der von `shapeOutline`
   * (`y = 0` Symmetrieachse, `z = 0` Oberkante, `z` nach unten).
   *
   * ABSOLUT, und das ist ein bewusster erster Schnitt mit benannter Lücke:
   * wächst `h` von 500 auf 600, bleibt das Element stehen und sein
   * Achsabstand zur Unterkante wächst still mit. Die kantenbezogene Platzierung
   * ist der Nachfolger (ADR 0064), das Gate trägt bis dahin die
   * Umriss-Warnung.
   */
  readonly y: mm;
  readonly z: mm;
  /** Anfangswert der Bemessung [cm²]. Echt positiv, das Gate prüft es. */
  readonly As: cm2;
  /** Obere Schranke [cm²]. Abwesend = unbegrenzt, `=== As` = eingefroren. */
  readonly Asmax?: cm2;
};

/**
 * Eine Bewehrungslage — eine BENANNTE GRUPPE von Elementen, und sie IST der
 * Bewehrungsrang (ADR 0064).
 *
 * ES GIBT KEINE ZWEITE GRUPPIERUNG und kein `rank`-Feld. „Lage" für die
 * geometrische Gruppe und „Rang" für die, über die die Bemessung entscheidet,
 * wären zwei Dinge über denselben Elementen, die auseinanderlaufen können — und
 * das zweite existierte nur, um mit dem ersten identisch zu sein.
 *
 * `id` IST DER GRIFF DER BEMESSUNG: `'unten'`, `'oben'` — daran sagt sie „diese
 * erhöhen, jene stehen lassen". WIE eine Lage erhöht wird, entscheidet die
 * äussere Schleife von `@baustatik/concrete-design` (ADR 0055); der Satz sagt,
 * welche Elemente zusammengehören und wie weit jedes gehen darf.
 *
 * Die Lage trägt nichts ausser `id` und `elements`. Sie ist ein Name und eine
 * Menge — KEIN MATERIAL, KEINE GUETE, KEINE FESTIGKEIT. Die Abnahmebedingung
 * dafür steht in `CONTEXT.md` als greppbarer Satz und gilt nach ADR 0064
 * unverändert: kein Symbol dieses Packages kennt eine Festigkeit.
 */
export type ReinforcementLayer = {
  readonly id: string;
  readonly elements: readonly ReinforcementElement[];
};
