import type { SteelProfileData } from '@baustatik/steel-profiles';
import type { mm } from '@baustatik/units';
import type { SectionProperties } from './properties';
import { hollowRectangle } from './shapes/hollow-rectangle';
import { iSymmetric } from './shapes/i-symmetric';
import { toProperties } from './shapes/kernel';
import { rectangle } from './shapes/rectangle';
import { tSection } from './shapes/t-section';
import { toSI } from './to-si';
import type { SectionGeometry } from './types';
import { MM_TO_CM } from './units';

/**
 * Wie der Querschnitt fuer den SCHUB idealisiert wird.
 *
 * EINE EIGENE ANGABE, KEINE EIGENSCHAFT DER FORM. Ein Plattenbalken ist als
 * Stahlbeton kompakt und als geschweisster Stahl-T duennwandig: dieselben vier
 * Zahlen, zwei verschiedene kappa. Bei IPE-80-Abmessungen kommen
 * `solid -> 0,401` und `thin-walled -> 0,340` heraus — 18 % Unterschied, dem
 * Ergebnis nicht anzusehen. Deshalb PFLICHTFELD OHNE DEFAULT: wer sich nicht
 * entscheidet, soll es beim Typecheck merken und nicht am Verformungsbild.
 */
export type Idealisation = 'solid' | 'thin-walled';

/**
 * Eine parametrische Form. ABMESSUNGEN IN MILLIMETERN.
 *
 * mm ist die Einheit, in der ein Querschnitt gezeichnet, bemasst und gedruckt
 * wird — und die Einheit, in der `SteelProfileData` daneben `h`, `b`, `tw`,
 * `tf` und `r` fuehrt. Beide Quellen dieses Packages sprechen damit dieselbe
 * Sprache; SI entsteht erst an der Ausgabe, in `toSI`
 * ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md)).
 *
 * Die Form liefert WERTE, KEINE GEOMETRIE. Sollen die Formen spaeter gezeichnet
 * werden, kommt je Form ein `geometry()` dazu; die Werte bleiben aus der
 * Formel, sonst gaebe es zwei Rechenwege fuer dieselbe Zahl.
 *
 * Reine Daten, JSON-serialisierbar — Voraussetzung dafuer, dass der Querschnitt
 * im Snapshot mitreisen kann.
 */
export type ShapeSpec =
  /** Vollrechteck. Immer kompakt, deshalb ohne `idealisation`. */
  | { kind: 'rectangle'; b: mm; h: mm }
  /** Geschlossener Kasten mit umlaufend gleicher Wandstaerke. */
  | {
      kind: 'hollow-rectangle';
      b: mm;
      h: mm;
      t: mm;
      idealisation: Idealisation;
    }
  /** Doppeltsymmetrisches I, GESCHWEISST — ohne Ausrundung. */
  | {
      kind: 'i-symmetric';
      h: mm;
      b: mm;
      tw: mm;
      tf: mm;
      idealisation: Idealisation;
    }
  /**
   * T-Querschnitt: Gurt oben, Steg darunter, `h` ist die Gesamthoehe.
   *
   * Der Name nennt die FORM, nicht den Baustoff: dieselben vier Zahlen heissen
   * im Betonbau Plattenbalken und im Stahlbau T-Profil. Getrennt werden die
   * beiden von `idealisation`, nicht vom Formnamen.
   */
  | {
      kind: 't-section';
      bf: mm;
      hf: mm;
      bw: mm;
      h: mm;
      idealisation: Idealisation;
    };

/**
 * Der Querschnitt als MODELLSATZ — das, was neben `Node`, `Beam` und
 * `NodeSupport` im Modell liegt und mit ihm gespeichert wird.
 *
 * Er gehoert diesem Package und nicht `@baustatik/fem`: `fem` haengt bewusst
 * nur an `errors`, und `ShapeSpec` dort hineinzuziehen kehrte die Abhaengigkeit
 * um. `Beam.crossSectionId` bleibt ein String
 * ([ADR 0023](../../../docs/adr/0023-cross-sections-belong-to-the-model.md)).
 *
 * DREI QUELLEN, EINE FRAGE: parametrische Form, Katalogzeile und seit
 * [ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)
 * die freie Geometrie des Editors. Der frueher hier geplante Zweig
 * `{ kind: 'thin-walled'; segments: Segment[] }` ist damit entfallen: `Segment`
 * war toter Code — nichts in `src/` hat je eins konstruiert —, und ein
 * lageloses Wandsegment traegt den Editor nicht.
 */
export type CrossSection =
  | { kind: 'shape'; id: string; shape: ShapeSpec }
  | {
      /**
       * Die frei gezeichnete Geometrie. In P0 traegt sie ihren Vertrag, aber
       * noch keine Werte: `sectionProperties` gibt fuer sie `undefined`
       * zurueck, bis die Green-Rechnung steht.
       */
      kind: 'section-geometry';
      id: string;
      geometry: SectionGeometry;
    }
  | {
      kind: 'profile';
      id: string;
      /**
       * Die HERKUNFT, z. B. `'IPE 300'` — nicht mehr der Schluessel, mit dem
       * gerechnet wird. Die Zahlen stehen daneben in `data`.
       */
      profile: string;
      /**
       * Die KOPIE der Tabellenzeile, hereingeholt beim Anlegen
       * ([ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md)).
       *
       * Ohne sie rechnete ein gespeichertes Modell gegen die Tabelle der gerade
       * laufenden Programmversion: eine korrigierte Zeile, und jedes alte
       * Modell antwortet still anders.
       *
       * DIE GANZE ZEILE, nicht die fuenf Zahlen der Steifigkeit. Zwei
       * Verbraucher lesen heute schon DISJUNKTE Teilmengen —
       * `profileProperties` liest `A`/`Ay`/`Az`/`Iy`/`Iz`, die Spannungspunkte
       * lesen `h`/`b`/`tw`/`tf`/`r` — und die Bemessung liest spaeter `Wply`
       * und `It`. Jede Teilmenge waere eine weitere Meinung darueber, was ein
       * Profil ist.
       */
      data: SteelProfileData;
    };

/**
 * Die Querschnittswerte eines Querschnitts — die EINE Tuer dieses Packages.
 *
 * `undefined` heisst „kenne ich nicht" — und seit ADR 0027 heisst es NUR NOCH
 * „unsinnige Abmessungen". Der Fall „unbekanntes Profil" ist hier
 * verschwunden: die Zeile steht im Satz, also gibt es sie. Wer sich vertippt,
 * merkt es beim ANLEGEN, wo der Tippfehler steht, und nicht im Solver-Bericht.
 *
 * Kein Wurf, weil der Wert im FEM-Strang durch den Port `getSectionStiffness`
 * laeuft, und dort ist `undefined` bereits der Vertrag — daraus wird ein
 * Modellfehler IM BERICHT statt einer Ausnahme mitten in `solve()`.
 */
export function sectionProperties(
  cs: CrossSection,
): SectionProperties | undefined {
  if (cs.kind === 'profile') return profileProperties(cs.data);

  // Die Geometriequelle traegt in P0 nur ihren VERTRAG. Die Werte fallen aus
  // dem Umrisspolygon nach Green — das ist P2, und bis dahin ist `undefined`
  // die ehrliche Antwort: „kenne ich nicht" statt einer geratenen Zahl.
  // Der Weg dahin ist offen und laeuft ueber `geometry.outline`.
  if (cs.kind === 'section-geometry') return undefined;

  const shape = shapeResult(cs.shape);
  return shape === undefined ? undefined : toProperties(shape);
}

/**
 * Die EINE mm -> cm-Stelle des Packages.
 *
 * Danach rechnet alles unterhalb in Zentimetern: `ShapeResult` liefert cm²,
 * cm⁴ und cm, genau wie `SteelProfileData` sie fuehrt. Die Formfunktionen
 * selbst sind MASSSTABSFREI — sie enthalten keine Einheit, nur Formeln; was
 * hineingeht, bestimmt, was herauskommt.
 */
function shapeResult(spec: ShapeSpec) {
  const c = MM_TO_CM;
  switch (spec.kind) {
    case 'rectangle':
      return rectangle(spec.b * c, spec.h * c);
    case 'hollow-rectangle':
      return hollowRectangle(
        spec.b * c,
        spec.h * c,
        spec.t * c,
        spec.idealisation,
      );
    case 'i-symmetric':
      return iSymmetric(
        spec.h * c,
        spec.b * c,
        spec.tw * c,
        spec.tf * c,
        spec.idealisation,
      );
    case 't-section':
      return tSection(
        spec.bf * c,
        spec.hf * c,
        spec.bw * c,
        spec.h * c,
        spec.idealisation,
      );
  }
}

/**
 * Die Tabellenzeile als Querschnittswerte.
 *
 * Umgerechnet wird hier NICHTS mehr: die Tabelle fuehrt cm² und cm⁴, und das
 * ist bereits die Sprache, die `toSI` erwartet. kappa faellt dimensionslos
 * direkt aus den cm²-Werten — `Az/A` braucht keine Umrechnung, und sie
 * unterwegs zu machen hiesse, sich einen Faktor einfangen zu koennen, den
 * niemand sieht.
 *
 * `Iyz = 0` und `ys = zs = 0`: die gefuehrten Reihen sind doppeltsymmetrisch,
 * und das Eingabesystem der Tabelle IST das Schwerpunktsystem. Aus derselben
 * doppelten Symmetrie folgt `yM = ys` und `zM = zs`, also ebenfalls `0`: IPE
 * und HEA tordieren unter einer Querkraft durch den Schwerpunkt nicht.
 */
export function profileProperties(
  profile: SteelProfileData,
): SectionProperties {
  return toSI({
    A: profile.A,
    Iy: profile.Iy,
    Iz: profile.Iz,
    Iyz: 0,
    ys: 0,
    zs: 0,
    yM: 0,
    zM: 0,
    kappaY: profile.Ay === undefined ? undefined : profile.Ay / profile.A,
    kappaZ: profile.Az === undefined ? undefined : profile.Az / profile.A,
  });
}
