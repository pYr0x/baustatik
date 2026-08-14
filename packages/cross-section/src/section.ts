import type { SteelProfileData } from '@baustatik/steel-profiles';
import type { mm } from '@baustatik/units';
import { greenValues } from './green';
import { DEFAULT_SECTION_POLICY, type SectionPolicy } from './policy';
import type { SectionProperties } from './properties';
import { scaleSegments, segments } from './segment';
import { hollowRectangle } from './shapes/hollow-rectangle';
import { iSymmetric } from './shapes/i-symmetric';
import { toProperties } from './shapes/kernel';
import { rectangle } from './shapes/rectangle';
import { tSection } from './shapes/t-section';
import { type CatalogueValues, toSI } from './to-si';
import type { SectionGeometry } from './types';
import { CM_TO_M, CM4_TO_M4, MM_TO_CM } from './units';
import { wallPath } from './wall-path';

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
       * Die frei gezeichnete Geometrie. Seit P2 trägt sie WERTE: `A`, `Iy`,
       * `Iz`, `Iyz`, `ys`, `zs` fallen nach Green aus dem mitgeführten
       * Umriss, `alpha`/`Iu`/`Iv` als Algebra mit. OHNE kappa und OHNE
       * Schubmittelpunkt — beide brauchen den Wandweg beziehungsweise Grashof
       * ([ADR 0035](../../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md)).
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
 *
 * DIE POLICY IST OPTIONAL, und das ist die einzige Stelle im Package, an der
 * sie es ist. Gelesen wird daraus GENAU EIN FELD, `discretisationTolerance`, und auch das
 * nur beim gezeichneten Wandgraphen: der Wandweg von P5 zerlegt seine
 * Bogenwaende unter derselben Toleranz, unter der auch der mitgefuehrte Umriss
 * entstanden ist.
 *
 * OPTIONAL HEISST NICHT „darf fehlen, wo gerechnet wird". Die Rechenstrecke
 * REICHT SIE HEREIN: `SectionModel` in `@baustatik/fem-section-resolve` fuehrt
 * `sectionPolicy` als PFLICHTFELD, und der Snapshot traegt sie seit
 * `schemaVersion: 7` ohnehin mit. Die Voreinstellung bleibt fuer den
 * gelegentlichen Aufrufer, der einen Katalogquerschnitt oder eine
 * parametrische Form fragt — beide sehen die Zahl nie.
 *
 * DAS IST EINE ABWEICHUNG VON ADR 0011, und sie steht bewusst hier statt in
 * einem stillen Import: die Rechenstrecke las bis P5 den MITGEFUEHRTEN Umriss
 * und nie das Rezept. Ein Querschnitt OHNE Bogenwand ist von der Zahl
 * unberuehrt — `Bulge.toPolyline` liefert fuer eine gerade Kante `[p1, p2]`,
 * ganz gleich, welche Toleranz danebensteht.
 */
export function sectionProperties(
  cs: CrossSection,
  policy: SectionPolicy = DEFAULT_SECTION_POLICY,
): SectionProperties | undefined {
  if (cs.kind === 'profile') return profileProperties(cs.data);

  if (cs.kind === 'section-geometry') {
    const geometry = geometryResult(cs.geometry, policy);
    return geometry === undefined ? undefined : toSI(geometry);
  }

  const shape = shapeResult(cs.shape);
  return shape === undefined ? undefined : toProperties(shape);
}

/**
 * Die mm -> cm-Stelle der PARAMETRISCHEN FORM — eine von zweien.
 *
 * EINE EINGANGSSTELLE JE QUELLE, EIN GEMEINSAMER AUSGANG (`toSI`). Die
 * Katalogzeile führt bereits cm und braucht keine; die Form und die Geometrie
 * führen mm und bekommen je eine. Danach rechnet alles unterhalb in
 * Zentimetern: `ShapeResult` liefert cm², cm⁴ und cm, genau wie
 * `SteelProfileData` sie führt.
 *
 * Die Formfunktionen selbst sind MASSSTABSFREI — sie enthalten keine Einheit,
 * nur Formeln; was hineingeht, bestimmt, was herauskommt.
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
 * Die mm -> cm-Stelle der GEZEICHNETEN GEOMETRIE — die zweite und letzte.
 *
 * SIE SKALIERT DIE PUNKTE, NICHT DAS ERGEBNIS, und das ist dieselbe Figur wie
 * bei `shapeResult`: dort gehen die Abmessungen umgerechnet in eine
 * maßstabsfreie Formel, hier gehen die Koordinaten umgerechnet in eine
 * maßstabsfreie Summation. EIN Faktor an EINER Stelle — das Ergebnis
 * hinterher zu skalieren brauchte drei verschiedene (`cm²`, `cm⁴`, `cm`) und
 * damit drei Gelegenheiten, sich zu vertun.
 *
 * WARUM NICHT GLEICH IN METERN: dann verlöre man die Diffbarkeit gegen die
 * gedruckte Tabelle, um derentwillen die ganze cm-Zwischenwelt existiert
 * ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md)).
 *
 * ZWEI QUELLEN FUER kappa, SCHUBMITTELPUNKT UND `It`, und sie schliessen
 * einander aus:
 *
 *   DER WANDWEG, beim MITTELLINIENMODELL, das duennwandig gerechnet werden
 *   soll. Er liefert `kappaY`/`kappaZ` als ZAHL, weil die duennwandige Theorie
 *   ν nicht kennt (ADR 0040/0041).
 *
 *   DIE FE, beim VOLLQUERSCHNITT — beide Eingabearten, sobald der
 *   Aufloesungsschritt gelaufen ist und `feValues` im Satz steht. Sie liefert
 *   kappa als FORMEL (`inverseKappaY`/`inverseKappaZ`), weil sie ν kennt und
 *   der Querschnitt es nicht darf (ADR 0045).
 *
 * `idealisation` SCHALTET DEN WANDWEG, NICHT DIE TOPOLOGIE
 * ([ADR 0029](../../../docs/adr/0029-stress-points-follow-the-idealisation.md))
 * — dieselbe Figur, zwei Deutungen, zwei kappa.
 *
 * IST NICHTS DA, BLEIBT ES `undefined` („nicht ermittelt", nicht „null"). Fuer
 * den Loeser heisst das `GAs: 'rigid'`, also die steifere Richtung; dass jemand
 * Schubverformung VERLANGT und sie nicht bekommt, meldet `check()` in
 * `@baustatik/fem-solver`
 * ([ADR 0035](../../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md)).
 * Genau deshalb darf der Aufloesungsschritt OPTIONAL sein, ohne dass jemand
 * falsch rechnet.
 */
function geometryResult(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): CatalogueValues | undefined {
  const c = MM_TO_CM;
  const green = greenValues(
    geometry.outline.map((polygon) => ({
      points: polygon.points.map((point) => ({
        y: point.y * c,
        z: point.z * c,
      })),
    })),
  );
  if (green === undefined) return undefined;

  const outline = {
    A: green.A,
    Iy: green.Iy,
    Iz: green.Iz,
    Iyz: green.Iyz,
    ys: green.ys,
    zs: green.zs,
  };

  if (geometry.kind !== 'midline' || geometry.idealisation !== 'thin-walled') {
    return { ...outline, ...feResult(geometry) };
  }

  // Der Wandweg bekommt seine Stuecke in ZENTIMETERN — derselbe Faktor auf
  // dieselbe Figur, nur positioniert statt als Umriss.
  const path = wallPath(
    scaleSegments(segments(geometry.nodes, geometry.walls, policy), c),
    outline,
  );
  if (path === undefined) return outline;

  return {
    ...outline,
    kappaY: path.kappaY,
    kappaZ: path.kappaZ,
    yM: path.yM,
    zM: path.zM,
    It: path.It,
  };
}

/**
 * Der FE-Block des Satzes, in Katalogeinheiten.
 *
 * ER STEHT IN SI UND NICHT IN ZENTIMETERN, und das ist eine bewusste
 * Ausnahme von der cm-Zwischenwelt: `It` und der Schubmittelpunkt einer
 * gezeichneten Figur stehen in keiner Profiltabelle, gegen die man sie diffen
 * koennte, und `@baustatik/cross-section-fe` rechnet ohnehin in SI
 * ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md),
 * [ADR 0047](../../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md)).
 * Zurueckgerechnet wird hier, damit `toSI` die EINE Umrechnungsstelle bleibt.
 *
 * `unsupported` LIEFERT TROTZDEM `It`, wenn ueberhaupt vernetzt wurde: `ω` ist
 * eine physische Verschiebung und von der Lochbedingung des Schubproblems
 * unberuehrt (ADR 0045).
 */
function feResult(geometry: SectionGeometry): Partial<CatalogueValues> {
  const state = geometry.feValues;
  if (state === undefined) return {};
  if (state.status === 'unsupported') {
    return state.It === undefined ? {} : { It: state.It / CM4_TO_M4 };
  }
  const { values } = state;
  return {
    It: values.It / CM4_TO_M4,
    yM: values.yM / CM_TO_M,
    zM: values.zM / CM_TO_M,
    inverseKappaY: values.inverseKappaY,
    inverseKappaZ: values.inverseKappaZ,
  };
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
 *
 * `It` KOMMT AUS DER TABELLE und wird nicht gerechnet, wie `A`, `Iy` und `Iz`
 * daneben: das Walzprofil hat eine Ausrundung, und die traegt bei `It` mehr
 * als anderswo. Der Wandgraph eines IPE 300 kommt auf `15,70 cm⁴` gegen
 * tabellierte `20,12` — deshalb ist der Katalog fuer den GERECHNETEN Weg
 * ausdruecklich KEIN Orakel (ADR 0040).
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
    It: profile.It,
    kappaY: profile.Ay === undefined ? undefined : profile.Ay / profile.A,
    kappaZ: profile.Az === undefined ? undefined : profile.Az / profile.A,
  });
}
