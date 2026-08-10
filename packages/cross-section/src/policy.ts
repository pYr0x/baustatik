/**
 * Die ERZEUGUNGS-Einstellungen des Querschnitts: was steuert, welche Figur und
 * welche Zahlen aus einer Eingabe entstehen
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 *
 * EIGENE WURZEL, KEINE SCHEIBE VON `AnalysisPolicy`, und die Trennlinie steht
 * schon in
 * [ADR 0011](../../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md):
 * eine Analyse-Einstellung *„steuert die Rechnung, OHNE DAS MODELL ZU AENDERN"*.
 * `arcTolerance` ändert es. Der abgeleitete Umriss reist nach
 * [ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)
 * IM SATZ mit, und seine Punktzahl hängt an dieser Zahl — aus ihr fallen `A`,
 * `Iy` und `Iz`. Der Löser trüge eine Zahl mit, die er nie liest: die
 * Rechenstrecke liest den MITGEFUEHRTEN Umriss, nie das Rezept.
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
 * ZWEI SORTEN FELD, und die Trennung soll die Policy davor bewahren, zur
 * Sammelstelle zu werden:
 *
 * | Feld                     | ändert den Umriss | beurteilt ihn |
 * | ------------------------ | ----------------- | ------------- |
 * | `arcTolerance`           | ja                | —             |
 * | `miterLimit`             | ja                | —             |
 * | `principalAxisTolerance` | —                 | ja            |
 * | `thickWallRatio`         | —                 | ja            |
 * | `shearCentreTolerance`   | —                 | ja            |
 *
 * Die Beurteilungsfelder werden ALLEIN VOM GATE gelesen. Sie stehen trotzdem
 * hier und nicht in der `AnalysisPolicy`: sie urteilen über den Querschnitt,
 * nicht über die Rechnung, und ADR 0033 zieht die Linie am Gegenstand.
 *
 * `JoinType` IST KEIN FELD GEWORDEN, obwohl er in derselben Zeile stand: er ist
 * auf Miter festgenagelt, weil `Round` jede Ecke des I-Profils abrundete und
 * die Identität `2·b·tf + tw·(h − 2·tf)` fiele
 * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
 * Es gibt keine zweite zulässige Wahl, also auch keine Einstellung.
 *
 * AUSDRÜCKLICH KEIN KANDIDAT: DIE GAUSS-PUNKTE für Grashof (P4). Sie werden
 * von `sectionProperties` gelesen, und das liegt auf der RECHENSTRECKE
 * (`getSectionStiffness` in `@baustatik/fem-section-resolve`, je Stab in
 * `solve()`/`check()`) — eine Einstellung dort wäre nach ADR 0011 eine
 * *Analyse*-Einstellung und gehörte in `AnalysisPolicy`, nicht hierher. Sie
 * werden überhaupt keine Einstellung, sondern eine KONSTANTE: bei senkrechten
 * Kanten ist `t(z)` je Streifen konstant, der Integrand ein Polynom 6. Grades
 * und 4-Punkt-Gauß damit EXAKT; bei schrägen bringen rund 8 Punkte `1e-12`.
 * Das ist Konvergenz und keine Wahl — ein Schalter lüde dazu ein, ein exaktes
 * Ergebnis zu verschlechtern.
 *
 * DIE KNICKSCHRANKE IST EBENFALLS KEIN FELD: sie wird nach ADR 0032 aus
 * `arcTolerance` ABGELEITET (`notch > arcTolerance`), nicht gesetzt.
 */
export type SectionPolicy = {
  /**
   * Zulässige Sehnenabweichung der Diskretisierung [mm].
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
  readonly arcTolerance: mm;

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
   * Dieselbe Figur wie bei `arcTolerance`, das auch nicht `sagittaTolerance`
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
   * wie `arcTolerance`, und anders als eine Zahl, die bloß beurteilt.
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
   * `principalAxisTolerance` und nicht auf der von `arcTolerance`/`miterLimit`:
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
 */
export const DEFAULT_SECTION_POLICY: SectionPolicy = Object.freeze({
  arcTolerance: DEFAULT_ARC_TOLERANCE,
  principalAxisTolerance: 1e-9,
  miterLimit: 2,
  thickWallRatio: 1 / 3,
  shearCentreTolerance: 1e-6,
});

const FIELDS = [
  'arcTolerance',
  'principalAxisTolerance',
  'miterLimit',
  'thickWallRatio',
  'shearCentreTolerance',
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
    arcTolerance: overrides.arcTolerance ?? DEFAULT_SECTION_POLICY.arcTolerance,
    principalAxisTolerance:
      overrides.principalAxisTolerance ??
      DEFAULT_SECTION_POLICY.principalAxisTolerance,
    miterLimit: overrides.miterLimit ?? DEFAULT_SECTION_POLICY.miterLimit,
    thickWallRatio:
      overrides.thickWallRatio ?? DEFAULT_SECTION_POLICY.thickWallRatio,
    shearCentreTolerance:
      overrides.shearCentreTolerance ??
      DEFAULT_SECTION_POLICY.shearCentreTolerance,
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
    arcTolerance: numberField(record, 'arcTolerance'),
    principalAxisTolerance: numberField(record, 'principalAxisTolerance'),
    miterLimit: numberField(record, 'miterLimit'),
    thickWallRatio: numberField(record, 'thickWallRatio'),
    shearCentreTolerance: numberField(record, 'shearCentreTolerance'),
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
 * `arcTolerance` ECHT POSITIV und nicht bloß endlich: `arcTolerance = 0`
 * verlangte eine Zerlegung ohne jede Sehnenabweichung, also unendlich viele
 * Punkte, und `Arc.toPolyline` weist die 0 aus genau diesem Grund selbst
 * zurück. Eine negative Toleranz ließe `Bulge.isStraight` nie mehr wahr
 * werden — die Gerade wäre abgeschafft.
 *
 * `principalAxisTolerance` DARF `0` SEIN und nicht negativ: die 0 ist der
 * exakte Vergleich, also die Schärfe, mit der das Gate bis P2 gearbeitet hat —
 * eine sinnvolle Wahl für wen, der nur Formen und Katalogzeilen führt. Eine
 * negative Schranke ließe `|Iyz| <= tol · …` nie mehr wahr werden und schaffte
 * die Hauptachsenlage ab, wie es die negative `arcTolerance` mit der Geraden
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
 */
function assertValidValues(policy: SectionPolicy): void {
  const {
    arcTolerance,
    principalAxisTolerance,
    miterLimit,
    thickWallRatio,
    shearCentreTolerance,
  } = policy;
  if (!Number.isFinite(arcTolerance) || arcTolerance <= 0) {
    throw new InvalidSectionPolicyError(
      `"arcTolerance" muss endlich und größer als 0 sein (war: ${arcTolerance}).`,
      'arcTolerance',
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
}
