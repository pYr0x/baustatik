/**
 * Die benannten Beanstandungen der Modellpruefung.
 *
 * WARUM SIE HIER WOHNEN UND NICHT IM SOLVER: die tragende Ordnung dieses Repos
 * ist „wer den Typ besitzt, besitzt seine Regeln". `Node`, `Beam` und
 * `NodeSupport` gehoeren diesem Package, also gehoeren ihm auch die Regeln
 * darueber. `@baustatik/fem-loads` hat denselben Schritt fuer `FEMLoad` bereits
 * getan (ADR 0006); der Preis ist hier derselbe und ebenso klein: das Package
 * gibt seine Null-Dependency-Eigenschaft auf und haengt an `@baustatik/errors`.
 * Alle heutigen Abhaengigen tun das ohnehin, es entsteht kein neuer Knoten im
 * Graphen. Siehe ADR 0008.
 *
 * ZWEI HIERARCHIEN, ZWEI WOERTER (wie in `fem-loads/src/errors.ts`):
 * `ModelValidationError` ist ein hartes Tor — damit wird nicht gerechnet.
 * `ModelValidationWarning` haelt nichts auf; die Eingabe ist zulaessig, sie
 * sieht nur nach einem Versehen aus.
 *
 * Beide werden nicht nur geworfen, sondern von `validateModel` auch
 * ZURUECKGEGEBEN. Deshalb tragen alle Klassen ihre ids als FELDER und nicht nur
 * im Meldungstext — die Oberflaeche markiert daran das betroffene Element.
 */

import { BaustatikError } from '@baustatik/errors';

/** Wer auf einen Knoten zeigt. Stab und Auflager tun es beide. */
export type NodeReferenceOwner = 'beam' | 'support';

const OWNER_LABEL: Record<NodeReferenceOwner, string> = {
  beam: 'Stab',
  support: 'Auflager',
};

/**
 * Gemeinsame Basis aller Modellfehler. Abstrakt, damit jede Regelverletzung
 * einen eigenen Namen bekommt und niemand einen generischen Fehler wirft.
 */
export abstract class ModelValidationError extends BaustatikError {
  protected constructor(message: string) {
    super(message);
  }
}

/**
 * Gemeinsame Basis aller Modellwarnungen.
 *
 * Erbt bewusst von `BaustatikError`, obwohl eine Warnung nie geworfen wird: sie
 * traegt dieselbe Meldung, denselben `name` und denselben Stack-Ursprung, und
 * eine Oberflaeche kann Fehler und Warnungen mit demselben Code darstellen.
 * Eine eigene Wurzel neben `BaustatikError` haette nur den Unterschied
 * betont, den es an der Anzeige gerade nicht gibt.
 */
export abstract class ModelValidationWarning extends BaustatikError {
  protected constructor(message: string) {
    super(message);
  }
}

/**
 * Ein Stab oder ein Auflager zeigt auf einen Knoten, den es nicht gibt (M1).
 *
 * Heute faellt das erst beim ZEICHNEN auf (`fem-viewer/src/scene.ts`), werfend,
 * eine Meldung je Versuch. Das ist ein Nebeneffekt der Darstellung, kein Tor:
 * wer nie zeichnet, rechnet mit einem kaputten Modell.
 */
export class UnknownNodeReferenceError extends ModelValidationError {
  readonly ownerKind: NodeReferenceOwner;
  readonly ownerId: string;
  readonly nodeId: string;

  constructor(ownerKind: NodeReferenceOwner, ownerId: string, nodeId: string) {
    super(
      `${OWNER_LABEL[ownerKind]} "${ownerId}": unbekannter Knoten "${nodeId}".`,
    );
    this.ownerKind = ownerKind;
    this.ownerId = ownerId;
    this.nodeId = nodeId;
  }
}

/**
 * Ein Stab der Laenge 0 — beide Knoten stehen an derselben Stelle (M2).
 *
 * NICHT `DegenerateBeamError`: den Namen belegt `fem-loads/src/errors.ts`
 * bereits fuer den lastseitigen Fall („diese Last liegt auf einem entarteten
 * Stab"). Zwei Ausloeser, zwei Namen. Der lastseitige faellt nur auf, wenn
 * zufaellig eine Last auf dem Stab liegt; dieser faellt immer auf.
 */
export class ZeroLengthBeamError extends ModelValidationError {
  readonly beamId: string;

  constructor(beamId: string) {
    super(`Stab "${beamId}": Laenge 0 — beide Knoten liegen aufeinander.`);
    this.beamId = beamId;
  }
}

/**
 * Zwei oder mehr Auflager auf demselben Knoten (M4).
 *
 * Ein Fehler und keine Warnung, weil unklar ist, welches gilt: das eine sperrt
 * `ux`, das andere gibt es frei — es gibt keine Regel, die den Widerspruch
 * aufloest, und stillschweigend das letzte zu nehmen waere geraten.
 */
export class DuplicateSupportError extends ModelValidationError {
  readonly nodeId: string;
  readonly supportIds: readonly string[];

  constructor(nodeId: string, supportIds: readonly string[]) {
    super(
      `Knoten "${nodeId}": ${supportIds.length} Auflager (${supportIds
        .map((id) => `"${id}"`)
        .join(', ')}) — welches gilt, ist nicht bestimmt.`,
    );
    this.nodeId = nodeId;
    this.supportIds = supportIds;
  }
}

/**
 * Eine Zusammenhangskomponente ohne jedes Auflager (M3).
 *
 * Garantiert singulaer, ohne dass dafuer ein Gleichungssystem aufgestellt
 * werden muss: die Komponente kann sich als Ganzes frei bewegen.
 *
 * ACHTUNG, die Regel heisst NICHT „alle Staebe muessen zusammenhaengen".
 * Zwei getrennte, je gelagerte Traeger nebeneinander sind ein voellig
 * zulaessiges Modell — beim Durchlauftraeger-Vergleich sogar der Regelfall.
 * Die Regel heisst „KEINE Komponente ohne Halt".
 *
 * Der Rest der Kinematik (Gelenkkette, verschieblicher Rahmen, lauter
 * parallele Auflager) bleibt beim Loesen: er braucht das Gleichungssystem.
 */
export class UnsupportedComponentError extends ModelValidationError {
  readonly nodeIds: readonly string[];
  readonly beamIds: readonly string[];

  constructor(nodeIds: readonly string[], beamIds: readonly string[]) {
    super(
      `Kein Auflager an der Teilstruktur um Knoten "${nodeIds[0]}" ` +
        `(${nodeIds.length} Knoten, ${beamIds.length} Staebe) — sie ist frei beweglich.`,
    );
    this.nodeIds = nodeIds;
    this.beamIds = beamIds;
  }
}

/**
 * Zu viele Freiheitsgrade an EINEM Stab freigesetzt — ein elementinterner
 * Mechanismus (M6).
 *
 * Der Stab hat dann eine Starrkoerperbewegung IN SICH, die von nichts gehalten
 * wird: er gleitet laengs (`direction: 'u'`) oder quer (`'w'`) zu seiner Achse,
 * ohne dass eine Steifigkeit dagegen steht. Der Fall faellt sonst NIRGENDS auf —
 * nach der Kondensation stehen in den betroffenen Zeilen Nullen, das Element
 * traegt zu diesen Knotenfreiheitsgraden nichts mehr bei, und `assertHeld` im
 * Solver prueft die GLOBALE Diagonale, an der ein anderer Stab oder ein
 * Auflager laengst steht. Der Solver rechnet also durch, alle vier Netze aus
 * ADR 0016 bleiben still, und es kommen plausible Zahlen heraus.
 *
 * WANN GENAU, hergeleitet aus dem Rang der beiden entkoppelten Bloecke der
 * Elementsteifigkeit — die Bedingung haengt an keiner einzigen Zahl (`EA`, `EI`,
 * `L`, `phi` kuerzen sich heraus), deshalb ist sie hier statisch entscheidbar:
 *
 *   - AXIAL, Block `[u1, u2]`, Rang 1: eine Kondensation traegt der Block, die
 *     zweite nicht. Also `u` an BEIDEN Enden ist der Mechanismus.
 *   - QUER, Block `[w1, theta1, w2, theta2]`, Rang 2 (vier Freiheitsgrade,
 *     zwei Starrkoerpermoden): ZWEI Kondensationen traegt der Block, die dritte
 *     nicht. Also drei oder mehr Freisetzungen aus `w`/`theta` sind der
 *     Mechanismus — und zusaetzlich das Paar `w`/`w` schon zu zweit, weil ein
 *     Stab, der an einer Stelle quer gleitet, nirgends Querkraft traegt.
 *
 * NICHT betroffen ist `theta` an beiden Enden: das ist der Pendelstab und
 * ausdruecklich zulaessig. Nach der Kondensation von `theta1` steht
 * `K[theta2][theta2] = 3EI/L != 0` — kein Pivot 0 —, und der Stab uebertraegt
 * weiter die Normalkraft. Querkraft traegt er OHNE Stablast nicht mehr: mit
 * Momentengelenken an beiden Enden verlangt das Momentengleichgewicht dann
 * `V = 0`. Beides ist kein Mechanismus, sondern die Sache selbst. Wer die Regel
 * schlicht auf „dieselbe Richtung an beiden Enden" verkuerzt, verbietet
 * entweder den Pendelstab mit oder laesst `w`+`theta`+`theta` durch, das
 * nachweislich auf Pivot 0 laeuft.
 *
 * Die Regel deckt sich damit exakt mit dem Pivot-0-Zweig der Kondensation: die
 * Diagonalglieder sind strikt positiv, weil `prepare()` in
 * `@baustatik/fem-element` `L`, `EA` und `EI` als endlich und `> 0` erzwingt;
 * null wird ein Pivot nur, wenn der Block schon leergeraeumt ist. Dort steht
 * das zweite Tor, `UnrestrainedElementError`, und es misst das Pivot selbst,
 * statt dieser Aufzaehlung zu vertrauen.
 */
export class UnrestrainedBeamError extends ModelValidationError {
  readonly beamId: string;
  /** Die Richtung, in der sich der Stab in sich bewegen kann. */
  readonly direction: 'u' | 'w';
  /** Die beteiligten Freisetzungen, als `start.u`, `end.theta`, … */
  readonly released: readonly string[];

  constructor(
    beamId: string,
    direction: 'u' | 'w',
    released: readonly string[],
  ) {
    super(
      `Stab "${beamId}": freigesetzt sind ${released
        .map((name) => `"${name}"`)
        .join(', ')} — der Stab gleitet ` +
        `${direction === 'u' ? 'laengs' : 'quer'} zu seiner Achse, ohne dass ` +
        'etwas dagegen haelt. Ein Momentengelenk an beiden Enden (der ' +
        'Pendelstab) ist davon nicht betroffen.',
    );
    this.beamId = beamId;
    this.direction = direction;
    this.released = released;
  }
}

/**
 * Ein Knoten, an dem kein Stab haengt (M5).
 *
 * WARNUNG und kein Fehler: waehrend der Eingabe ist ein einzeln gesetzter
 * Knoten der Normalfall — der Stab kommt als naechstes. Beim Rechnen ist er
 * verdaechtig, weil alles, was an ihm haengt, wirkungslos bleibt: ein Auflager
 * haelt nichts, eine Last traegt sich nirgends ein.
 */
export class IsolatedNodeWarning extends ModelValidationWarning {
  readonly nodeId: string;

  constructor(nodeId: string) {
    super(
      `Knoten "${nodeId}": kein Stab haengt daran — Auflager und Lasten an ` +
        'diesem Knoten bleiben wirkungslos.',
    );
    this.nodeId = nodeId;
  }
}
