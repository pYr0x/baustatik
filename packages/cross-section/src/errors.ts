/**
 * Die benannten Beanstandungen des Querschnitts-Gates.
 *
 * WARUM SIE HIER WOHNEN: die tragende Ordnung dieses Repos ist „wer den Typ
 * besitzt, besitzt seine Regeln". `SectionGeometry` und `SectionProperties`
 * gehören diesem Package, also gehören ihm auch die Regeln darüber.
 * `@baustatik/fem` hat denselben Schritt für `Node`/`Beam` getan
 * ([ADR 0008](../../../docs/adr/0008-model-rules-live-in-fem.md)), und der
 * Preis ist hier derselbe und ebenso klein: das Package hängt jetzt außerdem
 * an `@baustatik/errors`. Ein neuer Knoten im Abhängigkeitsgraphen entsteht
 * nicht — jeder heutige Abhängige hängt ohnehin daran.
 *
 * ZWEI HIERARCHIEN, ZWEI WOERTER (wie in `fem/src/errors.ts`):
 * `SectionValidationError` heißt „dieser Satz ist NICHT RECHENBAR".
 * `SectionValidationWarning` heißt „rechenbar, aber UNTER EINER ANNAHME" — sie
 * hält nichts auf
 * ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)).
 *
 * KLASSEN UND KEINE STRINGS, und alle tragen ihre Ids als FELDER: das Gate
 * gibt seine Befunde ZURUECK, und eine Oberfläche markiert daran die
 * betroffene Wand oder den betroffenen Knoten. Aus einem Meldungstext ließe
 * sich das nur wieder herausparsen.
 *
 * EINE AUSNAHME STEHT AM ENDE: `InvalidSectionPolicyError` beanstandet keine
 * Figur und keinen Zahlensatz, sondern die EINSTELLUNG, mit der erzeugt wird.
 * Er erbt deshalb von keiner der beiden Basen — er darf weder in `errors` noch
 * in `warnings` landen, wo eine Oberfläche ihn als Eingabefehler am
 * Querschnitt anzeigen würde. Dieselbe Aufteilung wie bei
 * `InvalidLoadValidationPolicyError` in `@baustatik/fem-loads`.
 */

import { BaustatikError } from '@baustatik/errors';

/**
 * Gemeinsame Basis aller Querschnittsfehler. Abstrakt, damit jede
 * Regelverletzung einen eigenen Namen bekommt.
 */
export abstract class SectionValidationError extends BaustatikError {
  protected constructor(message: string) {
    super(message);
  }
}

/**
 * Gemeinsame Basis aller Querschnittswarnungen.
 *
 * Erbt von `BaustatikError`, obwohl eine Warnung nie geworfen wird — dieselbe
 * Ueberlegung wie bei `ModelValidationWarning`: gleiche Meldung, gleicher
 * `name`, gleiche Darstellung in der Oberfläche.
 */
export abstract class SectionValidationWarning extends BaustatikError {
  protected constructor(message: string) {
    super(message);
  }
}

/**
 * Welches Ende einer Wand auf einen Knoten zeigt.
 *
 * `start`/`end` wie am Stab (`BeamEndReleases` in `@baustatik/fem`) und wie die
 * Felder, auf die es zeigt (`Wall.startNodeId`, `Wall.endNodeId`).
 */
export type WallEnd = 'start' | 'end';

/**
 * Eine Wand zeigt auf einen Knoten, den es nicht gibt.
 *
 * Der Fall, der die String-Ids überhaupt erst rechtfertigt: mit Indizes hieße
 * er „Index 7 von 5" und träfe nach jedem Löschen eine andere Wand.
 */
export class UnknownSectionNodeError extends SectionValidationError {
  readonly wallId: string;
  readonly end: WallEnd;
  readonly nodeId: string;

  constructor(wallId: string, end: WallEnd, nodeId: string) {
    super(`Wand "${wallId}": unbekannter Knoten "${nodeId}" an "${end}".`);
    this.wallId = wallId;
    this.end = end;
    this.nodeId = nodeId;
  }
}

/** Was im Wandgraphen eine Identität trägt. */
export type SectionElement = 'node' | 'wall';

const ELEMENT_LABEL: Record<SectionElement, string> = {
  node: 'Knoten',
  wall: 'Wand',
};

/**
 * Zwei Knoten oder zwei Wände mit derselben Id.
 *
 * FEHLER UND KEINE WARNUNG, weil der Graph damit MEHRDEUTIG ist und nicht bloß
 * verdächtig aussieht: `startNodeId: 'n1'` benennt dann nicht mehr eine Lage,
 * und welche der beiden gilt, entscheidet die Reihenfolge im Array — eine
 * Regel, die niemand hingeschrieben hat.
 *
 * DER FALL, DEN DIE STRING-IDS EINHANDELN. Bei Index-Verweisen kann er nicht
 * auftreten; die Ids sind die bessere Wahl (ADR 0030), aber sie kosten genau
 * diese Prüfung. Sie steht hier und nicht im Snapshot-Parser, weil beide
 * dieselbe Frage wären und dieses Package den Typ besitzt — der Parser prüft
 * die GESTALT, das Gate die Rechenbarkeit.
 */
export class DuplicateSectionIdError extends SectionValidationError {
  readonly element: SectionElement;
  readonly id: string;
  readonly count: number;

  constructor(element: SectionElement, id: string, count: number) {
    super(
      `${ELEMENT_LABEL[element]}-Id "${id}" kommt ${count}-mal vor — welcher ` +
        'Eintrag gemeint ist, entscheidet sonst die Reihenfolge im Array.',
    );
    this.element = element;
    this.id = id;
    this.count = count;
  }
}

/**
 * Eine Wandstärke, die keine ist.
 *
 * `t <= 0` (oder nicht endlich) ist kein dünner Querschnitt, sondern ein
 * Tippfehler: der Umriss entsteht durch Aufweitung um `t/2`, und mit `t = 0`
 * fällt er auf eine Linie ohne Fläche zusammen.
 */
export class NonPositiveWallThicknessError extends SectionValidationError {
  readonly wallId: string;
  readonly t: number;

  constructor(wallId: string, t: number) {
    super(`Wand "${wallId}": Dicke ${t} ist nicht größer als 0.`);
    this.wallId = wallId;
    this.t = t;
  }
}

/**
 * Eine Wand der Länge 0 — beide Knoten stehen an derselben Stelle.
 *
 * Sie hat keine Richtung, also auch keine Endtangente; die Knickwarnung könnte
 * über sie hinweg gar nicht urteilen, und der Wandweg von P5 liefe in eine
 * Division durch null.
 */
export class ZeroLengthWallError extends SectionValidationError {
  readonly wallId: string;

  constructor(wallId: string) {
    super(`Wand "${wallId}": Länge 0 — beide Knoten liegen aufeinander.`);
    this.wallId = wallId;
  }
}

/**
 * Der mitgeführte Umriss trägt keine Fläche.
 *
 * Leer, oder jeder Ring mit weniger als drei Punkten. Aus ihm fallen `A`, `Iy`
 * und `Iz` — ohne ihn gibt es nichts zu rechnen, und weil er MITREIST (ADR
 * 0030), ist sein Fehlen ein Fehler des Satzes und nicht der Bibliothek.
 */
export class EmptyOutlineError extends SectionValidationError {
  readonly polygonCount: number;

  constructor(polygonCount: number) {
    super(
      `Der mitgeführte Umriss trägt keine Fläche (${polygonCount} Polygone, ` +
        'keines mit mindestens drei Punkten).',
    );
    this.polygonCount = polygonCount;
  }
}

/**
 * Die Summe der Ringflächen ist nicht echt positiv.
 *
 * DER EINE FEHLER DIESER ECKE, DER DEN LÖSER STILL KAPUTTMACHT. Green rechnet
 * auf jedem Umriss eine Zahl; läuft der Ring verkehrt herum, ist es ein
 * NEGATIVES `A`, und `fem-section-resolve` macht daraus eine negative
 * Steifigkeit. Das Gleichungssystem löst sich weiterhin — es antwortet nur
 * falsch. Deshalb ein Fehler und keine Warnung.
 *
 * ZWEI LAGEN, EIN BEFUND: der komplett verkehrt gewickelte Umriss, und das
 * Loch, das größer ist als sein Material. Beide sagen dasselbe („hier bleibt
 * keine Fläche übrig"), und sie auseinanderzuhalten hieße, die
 * Verschachtelung zu kennen — die ist nach ADR 0032 eine Warnung und keine
 * Voraussetzung.
 */
export class NegativeOutlineAreaError extends SectionValidationError {
  /** Die Summe über alle Ringe [mm²] — `<= 0`. */
  readonly signedArea: number;

  constructor(signedArea: number) {
    super(
      `Der Umriss trägt die Fläche ${signedArea} mm² — Material läuft mit ` +
        'positivem, ein Loch mit negativem Umlaufsinn. Entweder ist der ' +
        'Umriss verkehrt herum gewickelt, oder die Löcher sind größer als ' +
        'das Material.',
    );
    this.signedArea = signedArea;
  }
}

/**
 * Ein Ring ohne Fläche — `signedArea === 0`.
 *
 * ENTARTET, und deshalb ein Fehler statt eines Achselzuckens: er trägt zur
 * Green-Summe exakt nichts bei, also ist er entweder ein Zeichenfehler
 * (dreimal derselbe Punkt, ein Hin-und-Zurück) oder eine Figur, deren
 * Aufweitung P3 verlangt. Beides will der Anwender wissen, bevor er die Zahlen
 * liest.
 *
 * ABZUGRENZEN VON `EmptyOutlineError`, der den Umriss ALS GANZEN meint: hier
 * ist die Figur da, ein einzelner Ring aber ohne Inhalt. `index` nennt ihn,
 * weil ein Ring keine Id trägt — er ist eine Stelle im Array und nichts
 * weiter.
 */
export class DegenerateOutlineRingError extends SectionValidationError {
  readonly index: number;
  readonly pointCount: number;

  constructor(index: number, pointCount: number) {
    super(
      `Umrissring ${index}: Fläche 0 bei ${pointCount} Punkten — er trägt ` +
        'zur Rechnung exakt nichts bei.',
    );
    this.index = index;
    this.pointCount = pointCount;
  }
}

/**
 * Ein Lochring liegt in keinem Materialring.
 *
 * WARNUNG UND KEIN FEHLER, weil die Lage RECHENBAR ist: der Ring zieht dann
 * eben Fläche ab, die es nicht gibt, und die Summe bleibt endlich. Und weil
 * sie bei zwei getrennten Vollflächen legitim aussieht — genau die Lage, für
 * die ADR 0032 warnt statt zu verweigern.
 *
 * GEPRÜFT WIRD DIE LAGE EINES PUNKTES, nicht die Überdeckung zweier Ringe:
 * das ist bei überschneidungsfreien Ringen dasselbe, und überschneidungsfrei
 * sind sie ab P3 per Konstruktion (Clipper2). Die Selbstdurchdringung ist und
 * bleibt ungeprüft — P0 hat sie offen gelassen, P2 auch.
 */
export class UnnestedHoleWarning extends SectionValidationWarning {
  readonly index: number;
  /** Die Fläche des Lochrings [mm²] — negativ. */
  readonly signedArea: number;

  constructor(index: number, signedArea: number) {
    super(
      `Umrissring ${index} läuft als Loch (Fläche ${signedArea} mm²), liegt ` +
        'aber in keinem Materialring — er zieht Fläche ab, die es an dieser ' +
        'Stelle nicht gibt.',
    );
    this.index = index;
    this.signedArea = signedArea;
  }
}

/**
 * Satz 1 — `Iyz` ist nicht null: der Querschnitt liegt NICHT in
 * Hauptachsenlage.
 *
 * Die ebene Rechnung setzt die Biegung um `y` an. Liegt `y` nicht auf einer
 * Hauptachse, weicht der Stab unter `My` seitlich aus; die Zahlen bleiben
 * richtig, solange er aus der Ebene gehalten wird.
 *
 * WARNUNG UND NICHT ZUSTIMMUNG: „aus der Ebene gehalten" ist keine Eigenschaft
 * des Querschnitts. Derselbe L-Winkel ist in einem Stab gehalten und im
 * nächsten nicht, und `CrossSection` wird nach ADR 0023 GETEILT. Die Angabe
 * gehört an den `Beam` und bleibt dort additiv möglich.
 *
 * DER VERGLEICH IST RELATIV: `|Iyz| > tol · max(|Iy|, |Iz|)` mit
 * `SectionPolicy.principalAxisTolerance`. Bis P2 stand hier der exakte
 * Vergleich gegen `0`, und der war richtig, solange jede Quelle eine literale
 * `0` hinschrieb. Für einen GEZEICHNETEN Umriss ist `Iyz` nie exakt null —
 * ein achsparalleles Rechteck liefert Gleitkommarauschen, und der exakte
 * Vergleich feuerte damit bei jedem symmetrisch gezeichneten Querschnitt.
 */
export class NotPrincipalAxesWarning extends SectionValidationWarning {
  readonly Iyz: number;
  readonly alpha: number;
  /** Die Schranke, gegen die verglichen wurde [m4] — `tol · max(|Iy|, |Iz|)`. */
  readonly limit: number;

  constructor(Iyz: number, alpha: number, limit: number) {
    super(
      `Deviationsmoment Iyz = ${Iyz} m4 liegt über der Schranke ${limit} m4 ` +
        `— keine Hauptachsenlage (alpha = ${alpha} rad). Die ebene Rechnung ` +
        'gilt nur, solange der Stab aus der Ebene gehalten wird.',
    );
    this.Iyz = Iyz;
    this.alpha = alpha;
    this.limit = limit;
  }
}

/**
 * Satz 2 — `yM != ys`: eine Querkraft durch den Schwerpunkt tordiert.
 *
 * `T = Vz · e` mit `e = yM − ys`.
 *
 * KEYT ALLEIN AUF `yM`, nicht auf `(yM, zM)`. Das ebene Stabwerk kennt nur
 * `Vz`; ein z-Versatz erzeugt darin keine Torsion. Auf das Paar zu keyen hieße,
 * bei JEDEM Plattenbalken zu feuern — der ist einfach symmetrisch, hat
 * `yM = ys = 0` und tordiert trotzdem nicht. `zM` bleibt Auskunft und Vorrat
 * für ein räumliches Modell.
 *
 * DER VERGLEICH IST SEIT P5 RELATIV: `|yM − ys| > tol · max(√(Iy/A), √(Iz/A))`
 * mit `SectionPolicy.shearCentreTolerance`. Bis dahin stand hier `yM !== ys`,
 * und der exakte Vergleich war richtig, solange jede Quelle beide Zahlen als
 * literale `0` hinschrieb. Der GEZEICHNETE Querschnitt integriert sie
 * numerisch und über zwei verschiedene Figuren; ein symmetrisch gezeichnetes I
 * liefert dabei Rauschen, und der exakte Vergleich meldete Torsion, wo keine
 * ist. Dieselbe Bewegung wie bei Satz 1 in P2.
 */
export class ShearCentreOffsetWarning extends SectionValidationWarning {
  /** Der Hebelarm `e = yM − ys` [m]. */
  readonly e: number;
  readonly yM: number;
  readonly ys: number;
  /** Die Schranke, gegen die verglichen wurde [m]. */
  readonly limit: number;

  constructor(yM: number, ys: number, limit: number) {
    super(
      `Schubmittelpunkt yM = ${yM} m liegt ${yM - ys} m neben dem Schwerpunkt ` +
        `ys = ${ys} m und damit über der Schranke ${limit} m — eine Querkraft ` +
        'Vz durch den Schwerpunkt erzeugt das Torsionsmoment T = Vz·e.',
    );
    this.e = yM - ys;
    this.yM = yM;
    this.ys = ys;
    this.limit = limit;
  }
}

/**
 * Der Wandgraph hat MEHR ALS EINE Zelle — der Wandweg bleibt unbestimmt.
 *
 * Bei genau einer Zelle kommt EINE skalare Verträglichkeitsgleichung dazu, und
 * ihr Ergebnis ist ein konstanter Zuschlag auf den Schubfluss der Zelle
 * (`src/wall-path.ts`). Ab zwei Zellen sind es `n` gekoppelte Unbekannte, also
 * ein Gleichungssystem — ein anderes Vorhaben, und keines, das sich hinter
 * einer Zahl verstecken sollte.
 *
 * WARNUNG UND KEIN FEHLER: `A`, `Iy`, `Iz`, `ys`, `zs` und die Hauptachsen
 * fallen weiterhin aus dem Umriss, der Satz ist also rechenbar. Was fehlt,
 * sind κ, der Schubmittelpunkt und `It`, und sie stehen als `undefined` da —
 * „nicht ermittelt", nach dem Muster von `kappaY?`.
 *
 * DIE GEOMETRIE-TÜR MELDET IHN und nicht die Eigenschaften-Tür: nur sie sieht
 * die Topologie. Am Wertesatz wäre eine fehlende Zahl von jeder anderen
 * fehlenden Zahl nicht mehr zu unterscheiden.
 */
export class MultipleCellsWarning extends SectionValidationWarning {
  /** Die zyklomatische Zahl des Wandgraphen — `>= 2`. */
  readonly cells: number;

  constructor(cells: number) {
    super(
      `Der Wandgraph hat ${cells} Zellen — κ, Schubmittelpunkt und It bleiben ` +
        'unermittelt. Eine Zelle bringt eine skalare Verträglichkeit mit, ab ' +
        'zwei ein Gleichungssystem.',
    );
    this.cells = cells;
  }
}

/**
 * Der Wandgraph zerfällt in mehrere UNVERBUNDENE Teile.
 *
 * Der Schubfluss läuft ENTLANG der Wände; zwischen zwei Teilen, die sich nicht
 * berühren, gibt es keinen Weg, auf dem er sich ausgliche. Wie sich die
 * Querkraft auf die Teile aufteilt, ist keine Frage der Querschnittsgeometrie
 * allein — die Teile müssten irgendwo verbunden sein, und wo, sagt die
 * Zeichnung nicht.
 *
 * WARNUNG UND KEIN FEHLER, aus demselben Grund wie bei den Zellen: die Werte
 * aus dem Umriss stehen, die Schubgrössen fehlen. Die Lage ist ausserdem beim
 * mehrteiligen Querschnitt (Verbundstütze) legitim GEZEICHNET — nur eben nicht
 * dünnwandig rechenbar.
 */
export class DisconnectedWallGraphWarning extends SectionValidationWarning {
  readonly components: number;

  constructor(components: number) {
    super(
      `Der Wandgraph zerfällt in ${components} unverbundene Teile — κ, ` +
        'Schubmittelpunkt und It bleiben unermittelt: es gibt keinen Weg, auf ' +
        'dem der Schubfluss sich zwischen ihnen ausgliche.',
    );
    this.components = components;
  }
}

/**
 * Ein Lauf ist für die dünnwandige Theorie zu DICK.
 *
 * ```text
 * offener   Lauf:  t / L        L = Länge der Mittellinie
 * geschlossener:   t / √A_m     A_m = von der Mittellinie umschlossen
 * ```
 *
 * ZWEI FORMELN, EINE SCHRANKE (`SectionPolicy.thickWallRatio`): der
 * geschlossene Lauf hat keine Länge, an der zu messen wäre, und sein Umfang
 * wächst bei gleicher Fläche mit jeder Einbuchtung. Belegt an beiden Enden:
 * QRO 60×6,3 kommt auf `0,117` und schweigt, ein Kasten `100×100` mit `t = 30`
 * auf `0,43` und meldet sich.
 *
 * WARNUNG UND KEIN FEHLER: gerechnet wird weiter, und die Werte sind es auch —
 * sie gelten nur unter einer Annahme, die hier nicht mehr trägt. Dieselbe
 * Figur wie bei Satz 1: eine Annahme, die nicht Eigenschaft des Querschnitts
 * ist, sondern der Rechnung darüber.
 *
 * DER LAUF WIRD ÜBER SEINE WÄNDE BENANNT und nicht über eine Id: ein `Branch`
 * ist eine Zerlegung und kein gezeichnetes Ding, er trägt also keine. `index`
 * nennt seine Stelle in der Zerlegung, `wallIds` die Wände, die eine
 * Oberfläche markieren kann — dieselbe Form wie bei
 * `MiterLimitExceededWarning`.
 */
export class ThickWallWarning extends SectionValidationWarning {
  /** Die Stelle des Laufs in der Zerlegung. */
  readonly index: number;
  readonly wallIds: readonly string[];
  /** Ob nach `t/√A_m` (geschlossen) statt nach `t/L` (offen) gemessen wurde. */
  readonly closed: boolean;
  /** Das gemessene Verhältnis. */
  readonly ratio: number;
  /** Die Schranke, gegen die verglichen wurde. */
  readonly thickWallRatio: number;

  constructor(
    index: number,
    wallIds: readonly string[],
    closed: boolean,
    ratio: number,
    thickWallRatio: number,
  ) {
    super(
      `Lauf ${index} (${wallIds.map((id) => `"${id}"`).join(', ')}): ` +
        `${closed ? 't/√A_m' : 't/L'} = ${ratio} liegt über der Schranke ` +
        `${thickWallRatio} — die dünnwandige Theorie, aus der κ, der ` +
        'Schubmittelpunkt und It fallen, gilt dort nicht mehr.',
    );
    this.index = index;
    this.wallIds = wallIds;
    this.closed = closed;
    this.ratio = ratio;
    this.thickWallRatio = thickWallRatio;
  }
}

/**
 * Satz 4 — `yM === undefined`: der Schubmittelpunkt ist NICHT ERMITTELT.
 *
 * Damit ist die Bedingung aus Satz 2 ungeprüft, und das ist etwas anderes als
 * „geprüft und in Ordnung". Der Satz WAR SELBSTLOESCHEND und ist es zur Hälfte
 * geblieben: er feuerte zwischen P0 und P5 bei JEDEM gezeichneten Querschnitt,
 * verstummt mit P5 beim dünnwandigen Wandgraphen mit höchstens einer Zelle und
 * bleibt beim Vollquerschnitt (`solid`, `kind: 'outline'`) sowie beim
 * Mehrzeller dauerhaft stehen.
 *
 * EIN ERSATZINDIKATOR IST NICHT MOEGLICH: `Iyz = 0` schließt Torsion nicht aus
 * (das symmetrisch gestellte U), und `Iyz != 0` impliziert sie nicht (das
 * Z-Profil, dessen Schubmittelpunkt im Schwerpunkt liegt).
 */
export class ShearCentreUnknownWarning extends SectionValidationWarning {
  constructor() {
    super(
      'Der Schubmittelpunkt ist nicht ermittelt — ob eine Querkraft durch den ' +
        'Schwerpunkt tordiert, ist damit ungeprüft und nicht etwa geprüft ' +
        'und in Ordnung.',
    );
  }
}

/**
 * Satz 3 — ein Knick an einer Bogenwand: die Tangentialität ist gebrochen.
 *
 * DIE SCHRANKE WIRD AUS DER TOLERANZ ABGELEITET, nicht gesetzt:
 *
 * ```text
 * theta = |Endtangente A − Endtangente B|
 * notch = (t / 2) · tan(theta / 2)      Versatz der Umrissecke
 * warnen, wenn notch > discretisationTolerance
 * ```
 *
 * Bei `0,05 mm` heißt das `t = 6 -> ~1,9°`, `t = 12 -> ~0,95°`,
 * `t = 20 -> ~0,57°`. Dass DICKE Wände WENIGER Knick vertragen, ist richtig:
 * ihre Kerbe wird tiefer. Eine Konstante statt zweier — und die eine ist
 * bereits begründet.
 */
export class TangentKinkWarning extends SectionValidationWarning {
  readonly nodeId: string;
  readonly wallIds: readonly string[];
  /** Der Knickwinkel [rad]. */
  readonly theta: number;
  /** Der daraus folgende Versatz der Umrissecke [mm]. */
  readonly notch: number;
  /** Die Schranke, gegen die verglichen wurde [mm]. */
  readonly discretisationTolerance: number;

  constructor(
    nodeId: string,
    wallIds: readonly string[],
    theta: number,
    notch: number,
    discretisationTolerance: number,
  ) {
    super(
      `Knoten "${nodeId}": Knick von ${theta} rad zwischen ${wallIds
        .map((id) => `"${id}"`)
        .join(' und ')} — der Umriss versetzt um ${notch} mm und damit mehr ` +
        `als die Toleranz ${discretisationTolerance} mm. Die Tangentialität am Bogen ist ` +
        'gebrochen.',
    );
    this.nodeId = nodeId;
    this.wallIds = wallIds;
    this.theta = theta;
    this.notch = notch;
    this.discretisationTolerance = discretisationTolerance;
  }
}

/**
 * Wo eine Wölbung steht — an einer WAND oder an einem RING-PUNKT.
 *
 * BEIDE EINGABEARTEN TRAGEN `bulge`, und beide Male ist es dieselbe Zahl mit
 * derselben Bedeutung (`Wall.bulge`, `Vertex.bulge`, ADR 0030). Nur der Ort
 * unterscheidet sich, und deshalb steht er als eigener Typ da statt als zweite
 * Fehlerklasse daneben — dieselbe Figur wie `SectionElement` in
 * `DuplicateSectionIdError`, das ebenso über Knoten UND Wand geht.
 *
 * DER RINGPUNKT HAT KEINE ID, sondern zwei Zahlen: der Ring ist eine Liste von
 * Punkten und keine Sammlung benannter Dinge. `DegenerateOutlineRingError`
 * benennt seinen Ring aus demselben Grund über den Index.
 */
export type BulgeSite =
  | { readonly kind: 'wall'; readonly wallId: string }
  | {
      readonly kind: 'vertex';
      readonly ringIndex: number;
      readonly vertexIndex: number;
    };

/** Der Ort im Meldungstext: `Wand "steg"` oder `Ring 0, Punkt 3`. */
function siteLabel(at: BulgeSite): string {
  return at.kind === 'wall'
    ? `Wand "${at.wallId}"`
    : `Ring ${at.ringIndex}, Punkt ${at.vertexIndex}`;
}

/**
 * Eine Wölbung, die keine Zahl ist — `bulge` nicht endlich.
 *
 * DIE LÜCKE AUS P1, GESCHLOSSEN VON P3. G1 bis G6 sahen Umriss, Ids, Verweise,
 * `t > 0`, Nulllängenwand und Knick — nie die Wölbung selbst. Ein `NaN` lief
 * still durch: die Knickprüfung rechnete `notch = NaN`, und `NaN > discretisationTolerance`
 * ist `false`. Für `t` prüft G4 ausdrücklich `Number.isFinite`; hier fehlte es.
 *
 * FEHLER UND KEINE WARNUNG, aus demselben Grund wie bei `t`: der Wert geht ab
 * P3 in eine FREMDE Bibliothek, und deren Ergebnis sähe danach plausibel aus.
 * Die Ableitung filtert ihn deshalb weg und zeichnet die Kante gerade — aber
 * dass sie das tut, muss jemand sagen, sonst ist es genau die stille Reparatur,
 * die dieses Repo sonst vermeidet.
 *
 * ER GILT FÜR BEIDE EINGABEARTEN (`at: BulgeSite`). Der Ring-Zweig warf bis
 * dahin sogar: `deriveOutlineFromRings` reichte den `NaN` an `Bulge.toPolyline`
 * weiter, und weil das Gate für die Drift-Prüfung neu ableitet, starb die
 * Sammelprüfung an dem Wert, den sie melden sollte.
 */
export class NonFiniteBulgeError extends SectionValidationError {
  readonly at: BulgeSite;
  readonly bulge: number;

  constructor(at: BulgeSite, bulge: number) {
    super(
      `${siteLabel(at)}: Wölbung ${bulge} ist keine endliche Zahl — die ` +
        'Ableitung liest sie als Gerade, und die Rechnung liefe sonst in eine ' +
        'fremde Bibliothek.',
    );
    this.at = at;
    this.bulge = bulge;
  }
}

/**
 * Eine Wölbung, die eine Zahl ist und trotzdem keinen zerlegbaren Bogen ergibt.
 *
 * DIE ZWEITE HÄLFTE DERSELBEN LÜCKE. `Number.isFinite` fängt `NaN` und
 * `±Infinity`; `bulge = 10^14` ist endlich und beschreibt trotzdem einen fast
 * vollen Kreis mit einem Radius von `2,5·10^15 mm` durch zwei Punkte, die
 * `100 mm` auseinanderliegen. Unter `discretisationTolerance` verlangt seine Zerlegung
 * Milliarden Punkte — der Prozess starb daran, statt einen Befund zu liefern.
 *
 * FEHLER UND KEINE WARNUNG, wie beim nicht endlichen Zwilling: die Ableitung
 * liest die Kante gerade, und dass sie das tut, muss jemand sagen.
 *
 * DIE SCHRANKE IST DIE DER GEOMETRIE, NICHT DIE DES QUERSCHNITTS —
 * `Bulge.isDiscretisable` entscheidet, hier steht keine zweite Zahl daneben
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)
 * lässt nur `discretisationTolerance` als Modellannahme zu, und genau die geht hinein).
 *
 * ER GILT FÜR BEIDE EINGABEARTEN, wie sein Zwilling: die Sehne, an der die
 * Zerlegbarkeit hängt, ist an der Wand der Knotenabstand und am Ring der
 * Abstand zum NÄCHSTEN Punkt.
 */
export class UndiscretisableBulgeError extends SectionValidationError {
  readonly at: BulgeSite;
  readonly bulge: number;
  /** Die Toleranz, unter der die Zerlegung nicht mehr geht [mm]. */
  readonly discretisationTolerance: number;

  constructor(at: BulgeSite, bulge: number, discretisationTolerance: number) {
    super(
      `${siteLabel(at)}: Wölbung ${bulge} beschreibt einen Bogen, der sich ` +
        `unter der Toleranz ${discretisationTolerance} mm nicht mehr zerlegen lässt — ` +
        'die Ableitung liest die Kante als Gerade.',
    );
    this.at = at;
    this.bulge = bulge;
    this.discretisationTolerance = discretisationTolerance;
  }
}

/**
 * Der mitgeführte Umriss ist nicht mehr der, den die Figur ergibt.
 *
 * DAS VERSPRECHEN VON ADR 0030, EINGELÖST. Dort steht *„the gate derives the
 * outline anyway, so the comparison costs nothing"* — bis P3 war das eine
 * Absicht: das Gate las `geometry.outline` und prüfte ihn ausschließlich gegen
 * sich selbst.
 *
 * DIE SCHRANKE WIRD ABGELEITET, NICHT GESETZT — dieselbe Figur wie die
 * Knickschranke:
 *
 * ```text
 * tol = policy.discretisationTolerance · U / A       U, A aus dem mitgeführten Umriss
 * warnen, wenn |A_neu − A| > tol · A
 * ```
 *
 * `discretisationTolerance · U` ist genau die Fläche, die entsteht, wenn der Rand überall
 * um die Diskretisierungstoleranz wandert; das ist die größte Abweichung, die
 * ein zulässiger Bibliothekswechsel erklären kann. Alles darüber ist etwas
 * anderes. KEIN VIERTES POLICY-FELD: eine gesetzte Schranke wäre eine zweite
 * Zahl für dieselbe Frage.
 *
 * VERGLICHEN WIRD `A`, NICHT PUNKT FÜR PUNKT. Die Punktzahl gegeneinander zu
 * halten machte jede `discretisationTolerance`-Änderung zum Befund — und genau die reist
 * seit ADR 0033 im Satz mit und ist damit erklärbar.
 *
 * WARNUNG UND KEIN FEHLER: der Satz ist rechenbar, er ist nur nicht mehr der,
 * der gespeichert wurde.
 */
export class OutlineDriftWarning extends SectionValidationWarning {
  /** Die Fläche des MITGEFÜHRTEN Umrisses [mm²]. */
  readonly carried: number;
  /** Die Fläche der NEUABLEITUNG unter derselben Policy [mm²]. */
  readonly derived: number;
  /** Die abgeleitete Schranke [mm²] — `discretisationTolerance · U`. */
  readonly limit: number;

  constructor(carried: number, derived: number, limit: number) {
    super(
      `Der mitgeführte Umriss trägt ${carried} mm², die Neuableitung unter ` +
        `derselben Policy ${derived} mm² — die Abweichung ${Math.abs(derived - carried)} mm² ` +
        `liegt über der Schranke ${limit} mm². Der Satz ist rechenbar, aber er ` +
        'ist nicht mehr der, der gespeichert wurde.',
    );
    this.carried = carried;
    this.derived = derived;
    this.limit = limit;
  }
}

/**
 * Ein Stoß, dessen Umrissecke GEKAPPT wird, weil ihr Spitz zu weit heraussteht.
 *
 * Die Ecke zweier um `t/2` aufgeweiteter Wände liegt bei gleicher Dicke und dem
 * Innenwinkel `α` um `(t/2)/sin(α/2)` neben dem Knoten; gekappt wird, sobald
 * `1/sin(α/2) > policy.miterLimit` — bei der Voreinstellung `2` also unter
 * `60°`.
 *
 * ZWEI URSACHEN, EINE SCHRANKE. Seit
 * [ADR 0038](../../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)
 * wird `overshoot` an der GEBAUTEN Ecke gemessen statt aus `α` gerechnet, und
 * damit meldet sich auch der zweite Fall: treffen zwei verschiedene
 * Wandstärken in einem fast gestreckten Stoß aufeinander, läuft der
 * Miterpunkt LAENGS der Wand davon, während `α` nahe `π` bleibt. Der Bezug ist
 * dann die halbe DICKERE Wandstärke.
 *
 * WARNUNG UND KEIN FEHLER: das Kappen ist ZULÄSSIG, reale Bleche werden
 * abgeschnitten. Aber nie stillschweigend — ein Knotenblech unter `30°`
 * verlöre sonst Fläche, ohne dass irgendwer es gesagt hätte.
 *
 * DIESELBE FIGUR WIE DIE KNICKWARNUNG: eine aus einem Policy-Feld abgeleitete
 * Schranke und ein Satz, der sagt, was sie bedeutet (ADR 0032, ADR 0037).
 */
export class MiterLimitExceededWarning extends SectionValidationWarning {
  readonly nodeId: string;
  readonly wallIds: readonly string[];
  /** Der Innenwinkel zwischen den beiden Wänden [rad]. */
  readonly alpha: number;
  /**
   * Der Überstand, den der ungekappte Spitz hätte, in Vielfachen der halben
   * DICKEREN Wandstärke. Bei gleicher Dicke ist das `1/sin(α/2)`.
   */
  readonly overshoot: number;
  /** Die Schranke, gegen die verglichen wurde. */
  readonly miterLimit: number;

  constructor(
    nodeId: string,
    wallIds: readonly string[],
    alpha: number,
    overshoot: number,
    miterLimit: number,
  ) {
    super(
      `Knoten "${nodeId}": Innenwinkel ${alpha} rad zwischen ${wallIds
        .map((id) => `"${id}"`)
        .join(
          ' und ',
        )} — der Umrissspitz stünde um das ${overshoot}-fache der ` +
        `halben (dickeren) Wandstärke heraus und wird bei ${miterLimit} gekappt. Das ist ` +
        'zulässig, aber der Querschnitt verliert dort Fläche.',
    );
    this.nodeId = nodeId;
    this.wallIds = wallIds;
    this.alpha = alpha;
    this.overshoot = overshoot;
    this.miterLimit = miterLimit;
  }
}

/**
 * Die ERZEUGUNGS-EINSTELLUNG selbst ist unbrauchbar (`src/policy.ts`).
 *
 * ERBT WEDER VON `SectionValidationError` NOCH VON
 * `SectionValidationWarning`: er wird immer GEWORFEN, nie zurückgegeben. Ein
 * Befund über die Figur sammelt sich in einer Liste, die eine Oberfläche dem
 * Anwender an seinem Querschnitt zeigt — eine kaputte Toleranz gehört dort
 * nicht hin, sie ist ein Fehler des PROJEKTS, nicht der Zeichnung.
 *
 * `field` nennt das beanstandete Feld, wo es eines gibt — dieselbe Form wie
 * `InvalidLoadValidationPolicyError`, damit ein Dialog beide gleich behandeln
 * kann.
 */
export class InvalidSectionPolicyError extends BaustatikError {
  readonly field: string | undefined;

  constructor(reason: string, field?: string) {
    super(`Querschnitts-Policy: ${reason}`);
    this.field = field;
  }
}
