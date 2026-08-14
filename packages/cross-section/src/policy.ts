/**
 * Die ERZEUGUNGS-Einstellungen des Querschnitts: was steuert, welche Figur und
 * welche Zahlen aus einer Eingabe entstehen
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 *
 * EIGENE WURZEL, KEINE SCHEIBE VON `AnalysisPolicy`, und die Trennlinie steht
 * schon in
 * [ADR 0011](../../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md):
 * eine Analyse-Einstellung *„steuert die Rechnung, OHNE DAS MODELL ZU AENDERN"*.
 * `discretisationTolerance` ändert es. Der abgeleitete Umriss reist nach
 * [ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)
 * IM SATZ mit, und seine Punktzahl hängt an dieser Zahl — aus ihr fallen `A`,
 * `Iy` und `Iz`.
 *
 * SEIT P5 LIEST DIE RECHENSTRECKE SIE DOCH, und zwar genau ein Feld:
 * `discretisationTolerance`, damit der Wandweg seine Bogenwände unter DERSELBEN Toleranz
 * zerlegt wie der mitgeführte Umriss (ADR 0040). Zwei Diskretisierungen
 * derselben Figur stünden sonst in κ, ohne dass irgendwo etwas fehlte. Der
 * Satz von ADR 0033 — „der Löser trüge eine Zahl mit, die er nie liest" —
 * gilt damit nicht mehr; `SectionModel` in `@baustatik/fem-section-resolve`
 * führt die Policy deshalb als Pflichtfeld.
 *
 * ZWEI EINGAENGE, wie bei `LoadValidationPolicy` in `@baustatik/fem-loads`, und
 * die Arbeitsteilung ist dieselbe:
 *
 *   `createSectionPolicy` bekommt ein GETYPTES Argument und prüft deshalb nur
 *   WERTE — dass die Felder heißen, wie sie heißen, hat der Compiler gesagt.
 *
 *   `parseSectionPolicy` ist der Grenzübertritt aus JSON. Nur er prüft die
 *   FORM: vollständig, keine unbekannten Felder, jedes Feld eine Zahl.
 *
 * KEINE EIGENE `schemaVersion`. Eine Version je Datensatz, und der Datensatz
 * ist der Snapshot; `LoadValidationPolicy` als Scheibe trägt ebenfalls keine.
 * Zwei Versionsnummern über denselben Bytes wären eine zweite Wahrheit über
 * die Form der Daten.
 *
 * UNVERAENDERLICH UND MIT DEFAULT-IDENTITAET: die Objekte sind eingefroren und
 * readonly, deshalb liefert die Fabrik ohne Overrides den Default SELBST
 * zurück statt einer Kopie. Der Parser baut immer neu — seine Eingabe sind
 * Fremddaten.
 */

import { DEFAULT_ARC_TOLERANCE } from '@baustatik/section-geometry';
import type { mm } from '@baustatik/units';
import { InvalidSectionPolicyError } from './errors';

/**
 * Die Stellschrauben der Querschnitts-ERZEUGUNG.
 *
 * HEUTE FÜNF FELDER, und jedes ist EINGERASTET statt hinzugewachsen:
 * `principalAxisTolerance` mit P2, `miterLimit` mit P3, `thickWallRatio` und
 * `shearCentreTolerance` mit P5 — der letzte datierte Kandidat ist damit
 * abgearbeitet, und die Fabrik samt Merge-Semantik musste kein einziges Mal
 * neu erfunden werden.
 *
 * DREI SORTEN FELD, und die Trennung soll die Policy davor bewahren, zur
 * Sammelstelle zu werden:
 *
 * | Feld                     | ändert den Umriss | beurteilt ihn | erzeugt Zahlen |
 * | ------------------------ | ----------------- | ------------- | -------------- |
 * | `discretisationTolerance`           | ja                | —             | —              |
 * | `miterLimit`             | ja                | —             | —              |
 * | `principalAxisTolerance` | —                 | ja            | —              |
 * | `thickWallRatio`         | —                 | ja            | —              |
 * | `shearCentreTolerance`   | —                 | ja            | —              |
 * | `FEElements`             | —                 | —             | ja             |
 *
 * Die Beurteilungsfelder werden ALLEIN VOM GATE gelesen. Sie stehen trotzdem
 * hier und nicht in der `AnalysisPolicy`: sie urteilen über den Querschnitt,
 * nicht über die Rechnung, und ADR 0033 zieht die Linie am Gegenstand.
 *
 * DIE DRITTE SORTE KAM MIT DER FE (ADR 0045/0047): `FEElements` ändert den
 * Umriss nicht und beurteilt ihn nicht — es *erzeugt Zahlen, die im Satz
 * gespeichert werden*. Gelesen wird es beim ERZEUGEN, nicht auf der
 * Rechenstrecke; die Linie aus ADR 0011/0033 hält also.
 *
 * `JoinType` IST KEIN FELD GEWORDEN, obwohl er in derselben Zeile stand: er ist
 * auf Miter festgenagelt, weil `Round` jede Ecke des I-Profils abrundete und
 * die Identität `2·b·tf + tw·(h − 2·tf)` fiele
 * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
 * Es gibt keine zweite zulässige Wahl, also auch keine Einstellung.
 *
 * AUSDRÜCKLICH KEIN KANDIDAT: EINE QUADRATURORDNUNG. Das PRINZIP steht, sein
 * ursprüngliches Beispiel — die Gauß-Punkte für Grashof — ist mit `FEElements`
 * hinfällig geworden und wird hier nicht mehr benutzt, weil es sonst so aussähe,
 * als sei die eine Zahl gekommen und die andere geblieben. Was gilt: eine
 * Quadraturordnung wird überhaupt keine Einstellung, sondern eine KONSTANTE.
 * Bei senkrechten Kanten ist `t(z)` je Streifen konstant, der Integrand ein
 * Polynom 6. Grades und 4-Punkt-Gauß damit EXAKT; die FE des Vollquerschnitts
 * wählt ihre 3 und 6 Punkte aus demselben Grund (ADR 0046, ADR 0047). Das ist
 * Konvergenz und keine Wahl — ein Schalter lüde dazu ein, ein exaktes Ergebnis
 * zu verschlechtern.
 *
 * `FEElements` IST DAVON NICHT BETROFFEN und ist auch keine Gegeninstanz: die
 * Netzdichte konvergiert nicht in endlich vielen Punkten gegen ein exaktes
 * Ergebnis. Sie ist die einzige Stellschraube der FE-Rechnung und deshalb eine
 * Angabe des Anwenders.
 *
 * DIE KNICKSCHRANKE IST EBENFALLS KEIN FELD: sie wird nach ADR 0032 aus
 * `discretisationTolerance` ABGELEITET (`notch > discretisationTolerance`), nicht gesetzt.
 */
export type SectionPolicy = {
  /**
   * Zulässige Sehnenabweichung der Diskretisierung [mm].
   *
   * DER NAME NENNT DIE WIRKUNG, NICHT DIE GRÖSSE: sie heißt
   * `discretisationTolerance`, nicht `arcTolerance`, weil sie nicht nur Bögen
   * steuert, sondern die gesamte Diskretisierung (ADR 0037, 0038) — die
   * Sehnenabweichung ist ihre Einheit, nicht ihr Gegenstand.
   *
   * GEBRANDET, weil das Feld künftig im Modellsatz neben `Wall.t` und
   * `SectionNode.y` steht, die alle `mm` tragen. ADR 0032 hat die Einheit so
   * geschrieben, der Code hatte ein nacktes `number` — die Abweichung wird hier
   * aufgeräumt und nicht zementiert.
   *
   * SIE WIRKT ZWEIMAL, und das ist eine Modellannahme und nicht zwei: sie sagt,
   * wie fein ein Bogen zerlegt wird, UND ab wann er als Gerade gilt
   * (`Bulge.isStraight`). Aus ihr fällt außerdem die Knickschranke des
   * Gates (ADR 0032).
   */
  readonly discretisationTolerance: mm;

  /**
   * Ab wann `Iyz` als null gilt: `|Iyz| <= tol · max(|Iy|, |Iz|)` heißt
   * HAUPTACHSENLAGE. DIMENSIONSLOS.
   *
   * RELATIV UND NICHT ABSOLUT, weil eine Schranke in m⁴ bei einem cm-großen
   * und einem m-großen Querschnitt ZWEI VERSCHIEDENE Aussagen wäre. Bezogen
   * wird auf `max(|Iy|, |Iz|)` und nicht auf `Iy`: sonst schwiege die Frage
   * ausgerechnet dort, wo `Iy` klein und `Iz` groß ist.
   *
   * DER NAME NENNT DIE FRAGE („liegt Hauptachsenlage vor"), NICHT DIE GRÖSSE.
   * Dieselbe Figur wie bei `discretisationTolerance`, das auch nicht `sagittaTolerance`
   * heißt.
   *
   * SIE WIRD ALLEIN VOM GATE GELESEN. `principalAxes` bleibt total, rein und
   * ohne Policy: `alpha ≈ 1e-17` ist die richtige Antwort auf die gestellte
   * Frage, und ein Schnappen dort wäre eine ANALYSE-Einstellung auf der
   * Rechenstrecke (ADR 0011). Wer wissen will „ist das Hauptachsenlage", fragt
   * das Gate — genau diese Trennung zieht ADR 0032 bereits.
   *
   * WARUM ES SIE ÜBERHAUPT GIBT: bis P2 schrieb jede Quelle eine literale `0`
   * hin, und der exakte Vergleich war die richtige Schärfe. Der GEZEICHNETE
   * Umriss integriert `Iyz` numerisch, und ein achsparallel gezeichnetes
   * Rechteck liefert dabei Rauschen — ohne Schranke feuerte Satz 1 des Gates
   * bei JEDEM symmetrisch gezeichneten Querschnitt.
   */
  readonly principalAxisTolerance: number;

  /**
   * Wie weit die Umrissecke am spitzen Stoß stehen bleiben darf, bevor sie
   * GEKAPPT wird. DIMENSIONSLOS.
   *
   * Die Ecke zweier um `t/2` aufgeweiteter Wände liegt beim Innenwinkel `α` um
   * `(t/2)/sin(α/2)` neben dem Knoten — der Spitz wächst über alle Grenzen,
   * wenn `α` gegen 0 geht. Clipper2 kappt ihn, sobald `1/sin(α/2) > miterLimit`.
   * Bei der Voreinstellung `2` ist das genau unter `60°` Innenwinkel.
   *
   * EIN ERZEUGUNGS-FELD UND KEIN ANALYSE-FELD, wörtlich nach dem Kriterium von
   * [ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md):
   * es verändert den GESPEICHERTEN Umriss und damit `A`, `Iy`, `Iz` — genauso
   * wie `discretisationTolerance`, und anders als eine Zahl, die bloß beurteilt.
   *
   * DAS KAPPEN IST ZULÄSSIG, ABER NIE STILLSCHWEIGEND. Reale Bleche werden
   * abgeschnitten, ein Knotenblech unter `30°` verlöre unter der Voreinstellung
   * aber Fläche, ohne dass irgendwer es gesagt hätte. Das Gate leitet deshalb
   * aus diesem Feld eine Schranke ab und meldet den Stoß darunter mit
   * `MiterLimitExceededWarning` — dieselbe Figur wie die Knickwarnung.
   *
   * NACH UNTEN BEI `1` BEGRENZT, und das ist keine Geschmacksfrage: Clipper2
   * ersetzt jeden Wert `<= 1` STILL durch `2`. Eine Einstellung, die nicht
   * wirkt, ist schlimmer als keine.
   */
  readonly miterLimit: number;

  /**
   * Ab wann eine Wand für die dünnwandige Theorie zu DICK ist. DIMENSIONSLOS.
   *
   * ZWEI FORMELN, EINE SCHRANKE, und die Formel folgt der Gestalt des Laufs:
   *
   * ```text
   * offener   Branch:  t / L        L = Länge der Mittellinie des Laufs
   * geschlossener:     t / √A_m     A_m = von der Mittellinie umschlossen
   * ```
   *
   * Der offene Lauf hat eine Länge, an der die Wandstärke zu messen ist; der
   * geschlossene hat keine — sein Weg schliesst sich, und die einzige Länge,
   * die seine Grösse benennt, ist die Wurzel aus der eingeschlossenen Fläche.
   * Eine Formel für beide gäbe es nur um den Preis, die Zelle über ihren
   * Umfang zu messen, und der wächst bei gleicher Fläche mit jeder Einbuchtung.
   *
   * Belegt an den beiden Enden: QRO 60×6,3 kommt auf `0,117` und schweigt,
   * ein Kasten `100×100` mit `t = 30` auf `0,43` und meldet sich.
   *
   * EIN BEURTEILUNGSFELD, kein Erzeugungsfeld — es steht auf der Seite von
   * `principalAxisTolerance` und nicht auf der von `discretisationTolerance`/`miterLimit`:
   * es ändert den gespeicherten Umriss nicht, es urteilt über ihn. Gelesen
   * wird es allein vom Gate.
   */
  readonly thickWallRatio: number;

  /**
   * Ab wann `yM` und `ys` als zusammenfallend gelten. DIMENSIONSLOS.
   *
   * Bezogen auf `max(√(Iy/A), √(Iz/A))`, den GRÖSSEREN Trägheitsradius: die
   * Eigenschaften-Tür sieht nur den Wertesatz, keine Figur — eine Abmessung,
   * gegen die eine Länge zu messen wäre, gibt es dort nicht, und der
   * Trägheitsradius ist die einzige Länge, die aus dem Satz selbst fällt. Auf
   * den grösseren, aus demselben Grund wie bei `principalAxisTolerance`: sonst
   * schwiege die Frage ausgerechnet dort, wo eine der beiden Achsen schwach
   * ist.
   *
   * WARUM ES SIE ÜBERHAUPT GIBT: bis P5 stand dort `yM !== ys`, ein exakter
   * Vergleich, und der war richtig, solange jede Quelle beide Zahlen als
   * literale `0` hinschrieb. Der GEZEICHNETE Querschnitt integriert beide
   * numerisch und über zwei verschiedene Figuren — ein symmetrisch
   * gezeichnetes I liefert dabei Rauschen, und der exakte Vergleich meldete
   * Torsion, wo keine ist. Dieselbe Bewegung wie bei Satz 1 in P2.
   *
   * EIN BEURTEILUNGSFELD, wie `thickWallRatio`.
   */
  readonly shearCentreTolerance: number;

  /**
   * Wie fein der Vollquerschnitt für die FE vernetzt wird: die ANGESTREBTE
   * Elementzahl, `maxElementArea = A / FEElements`. DIMENSIONSLOS.
   *
   * RELATIV UND NICHT ABSOLUT, aus demselben Grund wie bei
   * `principalAxisTolerance`: Querschnitte reichen vom cm²- bis in den
   * m²-Bereich, und eine absolute Elementfläche ergäbe dort 20 und dort 10⁶
   * Elemente. Die Zahl, die der Anwender im Kopf hat, ist „wie viele Elemente",
   * nicht „wie groß eines".
   *
   * SIE IST DIE EINZIGE STELLSCHRAUBE DER FE-RECHNUNG, und das ist Absicht: es
   * gibt keinen Konvergenzlauf, keinen zweiten verfeinerten Durchgang und keine
   * gespeicherte Konvergenzzahl. Wer wissen will, ob das Netz trägt, dreht diese
   * Zahl hoch und sieht das Ergebnis stehen bleiben — sichtbar und in seiner
   * Hand. Ein automatischer zweiter Lauf mit vervierfachter Dichte ist genau bei
   * großen Figuren der Fall, in dem die Rechnung unbrauchbar lange dauert, und
   * er fiele ungefragt an (ADR 0045).
   *
   * DAS DRITTE SORTE FELD (siehe oben): gelesen wird es beim ERZEUGEN der
   * FE-Werte in `@baustatik/cross-section-fe`, nie auf der Rechenstrecke.
   * `sectionProperties` sieht die Zahl nicht.
   */
  readonly FEElements: number;
};

/** Was ein Aufrufer abweichend setzen darf; der Rest kommt aus dem Default. */
export type SectionPolicyOverrides = Partial<SectionPolicy>;

/**
 * Die Voreinstellung.
 *
 * `DEFAULT_ARC_TOLERANCE` ZIEHT NICHT UM: die Policy LIEST die Zahl aus
 * `@baustatik/section-geometry`, wo die Diskretisierung wohnt. Sie hier neu zu
 * setzen brachte den Zustand zurück, den P0 gerade beseitigt hat — zwei Zahlen
 * für eine Annahme (ADR 0032).
 *
 * `1e-9` FÜR DIE HAUPTACHSEN liegt dagegen HIER, weil es keinen zweiten Ort
 * gibt, an dem die Frage gestellt wird. Die Zahl ist gewählt, nicht geraten:
 * sieben Größenordnungen über dem Shoelace-Rauschen eines gezeichneten
 * Rechtecks und drei unter der Unsymmetrie, die eine Bogendiskretisierung
 * erzeugt. Das gezeichnete Rechteck schweigt, der echt unsymmetrische
 * Querschnitt meldet sich.
 *
 * `2` FÜR DEN MITER IST DIE VORGABE VON CLIPPER2 SELBST, hier nur BENANNT: sie
 * kappt unter `60°` Innenwinkel. Damit ist sie weder besonders scharf noch
 * besonders großzügig — der rechtwinklige Stoß, aus dem jedes gewalzte Profil
 * besteht, bleibt mit `1/sin(45°) = 1,41` weit darunter, und wo sie greift,
 * sagt das Gate es (ADR 0037).
 *
 * `1/3` FÜR DIE DICKE WAND ist grosszügig und soll es sein: die Literatur nennt
 * `t/L` zwischen `1/10` und `1/5` als „dünnwandig", und alles darunter schwiege
 * bei jedem geschweissten Blech, das jemand bewusst gedrungen zeichnet. Die
 * Warnung soll den Fall treffen, in dem die dünnwandige Theorie nicht mehr
 * *daneben*, sondern *falsch* liegt. Belegt an beiden Enden: QRO 60×6,3 kommt
 * auf `0,117`, ein Kasten `100×100` mit `t = 30` auf `0,43`.
 *
 * `1e-6` FÜR DEN SCHUBMITTELPUNKT ist relativ zum Trägheitsradius, also eine
 * Länge von rund einem Tausendstel Millimeter an einem Meter Querschnitt.
 * Weiter als `principalAxisTolerance` (`1e-9`), weil `yM` aus ZWEI numerischen
 * Integrationen über zwei verschiedene Figuren fällt und nicht aus einer.
 *
 * `4000` ELEMENTE für die FE ist die Dichte, bei der das Rechteck seine
 * scharfe Zahl `κ = 0,833333333333` hält und ein IPE-Umriss binnen einer
 * Sekunde durchläuft. Sie ist eine Vorgabe und keine Grenze: höher gedreht
 * bleibt die Zahl stehen, und genau das ist der Beleg, den es statt eines
 * Konvergenzlaufs gibt.
 */
export const DEFAULT_SECTION_POLICY: SectionPolicy = Object.freeze({
  discretisationTolerance: DEFAULT_ARC_TOLERANCE,
  principalAxisTolerance: 1e-9,
  miterLimit: 2,
  thickWallRatio: 1 / 3,
  shearCentreTolerance: 1e-6,
  FEElements: 4000,
});

const FIELDS = [
  'discretisationTolerance',
  'principalAxisTolerance',
  'miterLimit',
  'thickWallRatio',
  'shearCentreTolerance',
  'FEElements',
] as const;

/**
 * Eine vollständige, eingefrorene Policy aus optionalen Abweichungen.
 *
 * Ohne Overrides ist das Ergebnis `DEFAULT_SECTION_POLICY` SELBST.
 */
export function createSectionPolicy(
  overrides?: SectionPolicyOverrides,
): SectionPolicy {
  if (overrides === undefined || Object.keys(overrides).length === 0) {
    return DEFAULT_SECTION_POLICY;
  }

  const policy: SectionPolicy = {
    discretisationTolerance:
      overrides.discretisationTolerance ??
      DEFAULT_SECTION_POLICY.discretisationTolerance,
    principalAxisTolerance:
      overrides.principalAxisTolerance ??
      DEFAULT_SECTION_POLICY.principalAxisTolerance,
    miterLimit: overrides.miterLimit ?? DEFAULT_SECTION_POLICY.miterLimit,
    thickWallRatio:
      overrides.thickWallRatio ?? DEFAULT_SECTION_POLICY.thickWallRatio,
    shearCentreTolerance:
      overrides.shearCentreTolerance ??
      DEFAULT_SECTION_POLICY.shearCentreTolerance,
    FEElements: overrides.FEElements ?? DEFAULT_SECTION_POLICY.FEElements,
  };

  assertValidValues(policy);
  return Object.freeze(policy);
}

/**
 * Eine Policy aus Fremddaten — der Grenzübertritt aus einem Projektdatensatz.
 *
 * STRIKT, weil ein stillschweigend geschluckter Tippfehler eine Einstellung
 * wäre, die nicht wirkt: unbekannte Felder werden abgelehnt, nicht ignoriert.
 */
export function parseSectionPolicy(input: unknown): SectionPolicy {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new InvalidSectionPolicyError(
      `erwartet wird ein Objekt (war: ${input === null ? 'null' : typeof input}).`,
    );
  }
  const record = input as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (!(FIELDS as readonly string[]).includes(key)) {
      throw new InvalidSectionPolicyError(`unbekanntes Feld "${key}".`, key);
    }
  }

  const policy: SectionPolicy = {
    discretisationTolerance: numberField(record, 'discretisationTolerance'),
    principalAxisTolerance: numberField(record, 'principalAxisTolerance'),
    miterLimit: numberField(record, 'miterLimit'),
    thickWallRatio: numberField(record, 'thickWallRatio'),
    shearCentreTolerance: numberField(record, 'shearCentreTolerance'),
    FEElements: numberField(record, 'FEElements'),
  };
  assertValidValues(policy);
  return Object.freeze(policy);
}

/**
 * Ein Pflichtfeld aus Fremddaten — vorhanden und eine Zahl.
 *
 * KEIN OPTIONALES FELD MIT DEFAULT: das wäre genau die stille
 * Default-Abhängigkeit, gegen die `fem-solver/src/policy.ts` argumentiert
 * (*„hier stehen die effektiven Werte, nicht die Abweichungen"*). Eine
 * eingesetzte Voreinstellung BEHAUPTETE, der Satz sei unter ihr entstanden.
 */
function numberField(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== 'number') {
    throw new InvalidSectionPolicyError(
      value === undefined
        ? `"${field}" fehlt.`
        : `"${field}" muss eine Zahl sein (war: ${typeof value}).`,
      field,
    );
  }
  return value;
}

/**
 * Die Werteregeln — dieselben für beide Eingänge.
 *
 * `discretisationTolerance` ECHT POSITIV und nicht bloß endlich: `discretisationTolerance = 0`
 * verlangte eine Zerlegung ohne jede Sehnenabweichung, also unendlich viele
 * Punkte, und `Arc.toPolyline` weist die 0 aus genau diesem Grund selbst
 * zurück. Eine negative Toleranz ließe `Bulge.isStraight` nie mehr wahr
 * werden — die Gerade wäre abgeschafft.
 *
 * `principalAxisTolerance` DARF `0` SEIN und nicht negativ: die 0 ist der
 * exakte Vergleich, also die Schärfe, mit der das Gate bis P2 gearbeitet hat —
 * eine sinnvolle Wahl für wen, der nur Formen und Katalogzeilen führt. Eine
 * negative Schranke ließe `|Iyz| <= tol · …` nie mehr wahr werden und schaffte
 * die Hauptachsenlage ab, wie es die negative `discretisationTolerance` mit der Geraden
 * täte. Nach oben nicht begrenzt: eine absurd große Toleranz schweigt
 * überall, und das ist eine Entscheidung des Projekts, kein Formfehler.
 *
 * `miterLimit` ECHT GRÖSSER ALS `1`, und die Schranke ist nicht gewählt,
 * sondern abgelesen: Clipper2 ersetzt jeden Wert `<= 1` STILL durch `2`
 * (`Offset.ts`, `mitLimSqr`). Eine Einstellung, die nicht wirkt und darüber
 * schweigt, ist die eine Sorte Wert, die dieser Eingang nicht durchlassen darf.
 * Nach oben unbegrenzt: ein sehr großes Limit lässt jeden Spitz stehen, und
 * das ist eine Entscheidung des Projekts.
 *
 * `thickWallRatio` ECHT POSITIV: `0` liesse `t/L > 0` bei JEDER Wand wahr
 * werden und meldete jeden dünnwandigen Querschnitt als dick — eine
 * Einstellung, die nur noch rauscht. Nach oben unbegrenzt, wie bei den
 * anderen: eine absurd große Schranke schweigt überall, und das ist eine
 * Entscheidung des Projekts.
 *
 * `shearCentreTolerance` DARF `0` SEIN und nicht negativ — wörtlich dieselbe
 * Begründung wie bei `principalAxisTolerance`: die `0` ist der exakte
 * Vergleich, also die Schärfe, mit der das Gate bis P5 gearbeitet hat.
 *
 * `FEElements` GANZZAHLIG UND MINDESTENS `1`, und beides ist abgelesen und
 * nicht gewählt: `maxElementArea = A / FEElements` verlangt einen echt
 * positiven Nenner, und eine gebrochene Elementzahl behauptete eine Genauigkeit
 * der Steuerung, die der Mesher nicht hat — Triangle trifft die Vorgabe ohnehin
 * nur von oben. Nach oben unbegrenzt: eine sehr feine Vorgabe kostet Zeit, und
 * das ist eine Entscheidung des Projekts.
 */
function assertValidValues(policy: SectionPolicy): void {
  const {
    discretisationTolerance,
    principalAxisTolerance,
    miterLimit,
    thickWallRatio,
    shearCentreTolerance,
    FEElements,
  } = policy;
  if (
    !Number.isFinite(discretisationTolerance) ||
    discretisationTolerance <= 0
  ) {
    throw new InvalidSectionPolicyError(
      `"discretisationTolerance" muss endlich und größer als 0 sein (war: ${discretisationTolerance}).`,
      'discretisationTolerance',
    );
  }
  if (!Number.isFinite(principalAxisTolerance) || principalAxisTolerance < 0) {
    throw new InvalidSectionPolicyError(
      '"principalAxisTolerance" muss endlich und mindestens 0 sein (war: ' +
        `${principalAxisTolerance}).`,
      'principalAxisTolerance',
    );
  }
  if (!Number.isFinite(miterLimit) || miterLimit <= 1) {
    throw new InvalidSectionPolicyError(
      `"miterLimit" muss endlich und größer als 1 sein (war: ${miterLimit}) — ` +
        'Clipper2 ersetzt jeden Wert bis 1 still durch 2.',
      'miterLimit',
    );
  }
  if (!Number.isFinite(thickWallRatio) || thickWallRatio <= 0) {
    throw new InvalidSectionPolicyError(
      `"thickWallRatio" muss endlich und größer als 0 sein (war: ${thickWallRatio}).`,
      'thickWallRatio',
    );
  }
  if (!Number.isFinite(shearCentreTolerance) || shearCentreTolerance < 0) {
    throw new InvalidSectionPolicyError(
      '"shearCentreTolerance" muss endlich und mindestens 0 sein (war: ' +
        `${shearCentreTolerance}).`,
      'shearCentreTolerance',
    );
  }
  if (!Number.isInteger(FEElements) || FEElements < 1) {
    throw new InvalidSectionPolicyError(
      `"FEElements" muss eine ganze Zahl ab 1 sein (war: ${FEElements}).`,
      'FEElements',
    );
  }
}
