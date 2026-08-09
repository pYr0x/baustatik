/**
 * Das Gate des Querschnitts — ZWEI TUEREN, weil zwei verschiedene Fragen
 * ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)).
 *
 *   `validateSectionGeometry`   — ist die GEZEICHNETE FIGUR in sich stimmig?
 *   `validateSectionProperties` — sind die ZAHLEN unter den Annahmen der ebenen
 *                                 Rechnung brauchbar?
 *
 * Beide geben `{ errors, warnings }` zurueck, den dritten Fehlerkanal des Repos
 * — der Kanal fuer die Sammelpruefung hinter einem Pruef-Knopf, der dem
 * Anwender auf einmal zeigen soll, was nicht stimmt. Ein `assertValid…` gibt es
 * hier ABSICHTLICH NICHT: der Querschnitt ist kein Tor vor der Rechenkette. Wer
 * ihn nicht rechnen kann, bekommt `undefined` aus `sectionProperties`, und
 * daraus wird ein Modellfehler IM BERICHT.
 *
 * ES WIRD GEWARNT, NICHT VERWEIGERT. Alle vier Saetze der Warnseite haengen an
 * Annahmen, die NICHT Eigenschaften des Querschnitts sind — ob der Stab aus der
 * Ebene gehalten wird, zum Beispiel. `CrossSection` wird nach ADR 0023 GETEILT:
 * derselbe L-Winkel ist in einem Stab gehalten und im naechsten nicht.
 *
 * DIE BOGENALGEBRA KOMMT AUS `@baustatik/section-geometry`. P0 rechnete die
 * Endtangente einer Bogenwand hier von Hand — `Δ/2 = 2·atan(bulge)` —, weil ADR
 * 0032 dem Package eine Geometrie-Abhaengigkeit verbot und die Reihenfolge
 * P0 -> P1 sauber bleiben sollte. Mit `Bulge` (P1) gibt es die Umrechnung an
 * genau einer Stelle, und die Doppelung ist AUFGELOEST statt nur getestet.
 * Der Preis steht in ADR 0033: ab P3 zieht `geometry-2d` `clipper2-ts` nach,
 * und `@baustatik/script` traegt es dann transitiv im Snapshot-Builder.
 */

import { Bulge, Polygon } from '@baustatik/section-geometry';
import { chainedJoints, deriveOutline } from './derive-outline';
import {
  DegenerateOutlineRingError,
  DuplicateSectionIdError,
  EmptyOutlineError,
  MiterLimitExceededWarning,
  NegativeOutlineAreaError,
  NonFiniteBulgeError,
  NonPositiveWallThicknessError,
  NotPrincipalAxesWarning,
  OutlineDriftWarning,
  type SectionElement,
  type SectionValidationError,
  type SectionValidationWarning,
  ShearCentreOffsetWarning,
  ShearCentreUnknownWarning,
  TangentKinkWarning,
  UnknownSectionNodeError,
  UnnestedHoleWarning,
  ZeroLengthWallError,
} from './errors';
import type { SectionPolicy } from './policy';
import type { SectionProperties } from './properties';
import type {
  Polygon as OutlinePolygon,
  SectionGeometry,
  SectionNode,
  Wall,
} from './types';

/** Das Ergebnis einer Gate-Pruefung. Zwei Sorten Befund. */
export type SectionValidationResult = {
  errors: SectionValidationError[];
  warnings: SectionValidationWarning[];
};

/**
 * Alle Befunde zur gezeichneten Figur, in Eingabereihenfolge.
 *
 * `errors` leer heisst: aus diesem Satz laesst sich rechnen.
 *
 * DIE POLICY IST EIN PARAMETER, keine Konstante im Gate: eine Zahl, die das
 * Ergebnis aendert, wird uebergeben und nicht importiert (ADR 0011). Sie steht
 * seit `schemaVersion: 7` auf Projektebene im Snapshot, also reicht der
 * Aufrufer genau die Einstellung herein, unter der die Figur ERZEUGT wurde
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 */
export function validateSectionGeometry(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): SectionValidationResult {
  const { errors, warnings } = shapeFindings(geometry, policy);

  // G7 — DIE DRIFT, und sie steht ZULETZT und nur bei sonst fehlerfreier Figur:
  // ein Umriss, der zu einem kaputten Graphen nicht passt, ist ein Folgefehler
  // und kein eigener Befund. Sie gilt fuer BEIDE Varianten — der
  // `outline`-Zweig bekommt damit die Pruefung, die ihm seit P2 fehlt, ohne
  // dass jemand dafuer etwas zusaetzlich baut.
  if (errors.length === 0) {
    warnings.push(...drift(geometry, policy));
  }

  return { errors, warnings };
}

function shapeFindings(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): SectionValidationResult {
  const errors: SectionValidationError[] = [];
  const warnings: SectionValidationWarning[] = [];

  // G1 — der mitgefuehrte Umriss. Zuerst, weil er in BEIDEN Varianten steht und
  // weil aus ihm die Werte fallen: ohne ihn gibt es nichts zu rechnen.
  const bearing = geometry.outline.filter(
    (polygon) => polygon.points.length >= 3,
  );
  if (bearing.length === 0) {
    errors.push(new EmptyOutlineError(geometry.outline.length));
  } else {
    // G1b — die Windung. NUR wenn überhaupt Ringe da sind: sonst wäre jeder
    // Befund hier ein Folgefehler von G1.
    const outline = outlineFindings(geometry.outline);
    errors.push(...outline.errors);
    warnings.push(...outline.warnings);
  }

  if (geometry.kind === 'outline') return { errors, warnings };

  // G2 — doppelte Ids. VOR allem Weiteren, denn sie machen den Graphen
  // mehrdeutig: `byId` behielte still den LETZTEN Eintrag, jede Wand haenge an
  // der falschen Lage, und G4 wie G5 urteilten dann ueber eine Figur, die
  // niemand gezeichnet hat. Doppelte Wand-Ids treffen ausserdem den Viewer, der
  // seine Zeichen-Specs nach `id` abgleicht — eine Wand verschwaende still.
  errors.push(...duplicateIds('node', geometry.nodes));
  errors.push(...duplicateIds('wall', geometry.walls));

  const byId = new Map(geometry.nodes.map((node) => [node.id, node]));

  // G3 — haengende Verweise. Zuerst unter den Waenden, weil alles Weitere die
  // Knotenlagen braucht.
  for (const wall of geometry.walls) {
    for (const [end, nodeId] of [
      ['start', wall.startNodeId],
      ['end', wall.endNodeId],
    ] as const) {
      if (!byId.has(nodeId)) {
        errors.push(new UnknownSectionNodeError(wall.id, end, nodeId));
      }
    }
  }

  // G4 — die Wandstaerke. Unabhaengig vom Graphen, deshalb ohne Vorbedingung.
  for (const wall of geometry.walls) {
    if (!(Number.isFinite(wall.t) && wall.t > 0)) {
      errors.push(new NonPositiveWallThicknessError(wall.id, wall.t));
    }
  }

  // G5 — die entartete Wand. Nur mit aufloesbaren Knoten: sonst waere die
  // Meldung „Laenge 0" ein Folgefehler von G3 statt eines eigenen Befunds.
  for (const wall of geometry.walls) {
    const start = byId.get(wall.startNodeId);
    const end = byId.get(wall.endNodeId);
    if (start === undefined || end === undefined) continue;
    if (start.y === end.y && start.z === end.z) {
      errors.push(new ZeroLengthWallError(wall.id));
    }
  }

  // G6 — Satz 3, der Knick am Bogen.
  warnings.push(...kinks(geometry.walls, byId, policy.arcTolerance));

  // G6b — die Woelbung selbst. DIE LUECKE AUS P1: bis P2 sah das Gate `t`, den
  // Umriss, die Ids und den Knick, nie aber `bulge`. Ein `NaN` lief still
  // durch, weil die Knickpruefung `notch = NaN` rechnet und `NaN > tol` falsch
  // ist. Ab P3 landet der Wert in einer fremden Bibliothek — deshalb faellt die
  // Entscheidung jetzt (ADR 0037).
  for (const wall of geometry.walls) {
    if (wall.bulge !== undefined && !Number.isFinite(wall.bulge)) {
      errors.push(new NonFiniteBulgeError(wall.id, wall.bulge));
    }
  }

  // G6c — der gekappte Miter-Spitz. NUR AN DURCHVERBUNDENEN STOESSEN, und
  // welche das sind, sagt die Ableitung: nur dort entsteht ueberhaupt eine
  // Miter-Ecke.
  //
  // DER UEBERSTAND WIRD NICHT MEHR HIER GERECHNET. `1/sin(α/2)` gilt nur bei
  // gleicher Wandstaerke; seit ADR 0038 misst die Ableitung ihn an der Ecke,
  // die sie tatsaechlich baut — sonst schwiege das Gate ausgerechnet dort, wo
  // gekappt wird (fast gestreckter Stoss MIT Dickensprung).
  for (const joint of chainedJoints(geometry.nodes, geometry.walls)) {
    if (joint.overshoot > policy.miterLimit) {
      warnings.push(
        new MiterLimitExceededWarning(
          joint.nodeId,
          joint.wallIds,
          joint.alpha,
          joint.overshoot,
          policy.miterLimit,
        ),
      );
    }
  }

  return { errors, warnings };
}

/**
 * Der mitgefuehrte Umriss gegen seine NEUABLEITUNG — ADR 0030s Versprechen,
 * eingeloest (ADR 0037).
 *
 * DIE SCHRANKE WIRD ABGELEITET, NICHT GESETZT, dieselbe Figur wie die
 * Knickschranke: `arcTolerance · U` ist genau die Flaeche, die entsteht, wenn
 * der Rand ueberall um die Diskretisierungstoleranz wandert — die groesste
 * Abweichung, die ein zulaessiger Bibliothekswechsel erklaeren kann. Ein
 * viertes Policy-Feld waere eine zweite Zahl fuer dieselbe Frage.
 *
 * VERGLICHEN WIRD `A` UND NICHT PUNKT FUER PUNKT: die Punktzahl gegeneinander
 * zu halten machte jede `arcTolerance`-Aenderung zum Befund, und genau die
 * reist seit ADR 0033 im Satz mit.
 */
function drift(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): SectionValidationWarning[] {
  const rings = geometry.outline.filter(
    (polygon) => polygon.points.length >= 3,
  );
  if (rings.length === 0) return [];

  const carried = rings.reduce(
    (sum, polygon) => sum + Polygon.signedArea(polygon.points),
    0,
  );
  const U = rings.reduce(
    (sum, polygon) => sum + Polygon.perimeter({ points: polygon.points }),
    0,
  );
  const derived = deriveOutline(geometry, policy).reduce(
    (sum, polygon) => sum + Polygon.signedArea(polygon.points),
    0,
  );

  const limit = policy.arcTolerance * U;
  return Math.abs(derived - carried) > limit
    ? [new OutlineDriftWarning(carried, derived, limit)]
    : [];
}

/**
 * Alle Befunde zu den ZAHLEN — die Sätze 1, 2 und 4.
 *
 * `errors` ist heute IMMER LEER, und das ist keine Lücke: was an einem
 * Zahlensatz nicht rechenbar wäre, ist an der Figur schon aufgefallen, und wo
 * es keine Figur gibt (Katalogzeile), buergt der Katalog. Der Kanal steht
 * trotzdem, weil beide Türen dasselbe Ergebnis liefern sollen — der Aufrufer
 * legt sie zusammen und muss nicht wissen, welche welchen Kanal fuellt.
 *
 * DIE POLICY WIRD SEIT P2 GELESEN — von Satz 1, mit
 * `principalAxisTolerance`. Sie wurde in P0 bereits durchgereicht, obwohl es
 * nichts zu lesen gab: beide Türen gemeinsam umzustellen kostete EINEN Bruch
 * statt zweier über zwei Teilprojekte
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 */
export function validateSectionProperties(
  properties: SectionProperties,
  policy: SectionPolicy,
): SectionValidationResult {
  const warnings: SectionValidationWarning[] = [];

  // Satz 1 — Hauptachsenlage. RELATIVER VERGLEICH, und der ist ab P2 die
  // richtige Schärfe: der gezeichnete Umriss integriert `Iyz` numerisch, ein
  // achsparalleles Rechteck liefert dabei Rauschen, und der früher exakte
  // Vergleich gegen `0` feuerte damit bei JEDEM symmetrisch gezeichneten
  // Querschnitt. Bezogen auf `max(|Iy|, |Iz|)`, weil eine absolute Schranke in
  // m⁴ bei cm-großen und m-großen Querschnitten zwei verschiedene Aussagen
  // wäre.
  const limit =
    policy.principalAxisTolerance *
    Math.max(Math.abs(properties.Iy), Math.abs(properties.Iz));
  if (Math.abs(properties.Iyz) > limit) {
    warnings.push(
      new NotPrincipalAxesWarning(properties.Iyz, properties.alpha, limit),
    );
  }

  // Saetze 2 und 4 — der Schubmittelpunkt, und sie schliessen einander aus:
  // entweder ist `yM` bekannt und wird verglichen, oder er fehlt und der
  // Vergleich ist ungeprueft. Beides zugleich zu melden hiesse, denselben
  // Umstand zweimal zu beklagen.
  if (properties.yM === undefined) {
    warnings.push(new ShearCentreUnknownWarning());
  } else if (properties.yM !== properties.ys) {
    warnings.push(new ShearCentreOffsetWarning(properties.yM, properties.ys));
  }

  return { errors: [], warnings };
}

/**
 * Die drei Befunde am UMLAUFSINN des mitgeführten Umrisses.
 *
 * Sie stehen zusammen, weil sie dieselbe Zahl lesen: `signedArea` je Ring.
 * Außen `> 0` heißt Material, `< 0` ein Loch
 * ([ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 *
 * AUSDRÜCKLICH NICHT GEPRÜFT: doppelte aufeinanderfolgende Punkte — sie
 * tragen zur Shoelace-Summe exakt null bei und sind damit harmlos — und die
 * SELBSTDURCHDRINGUNG, deren Preis echt ist; P0 hat sie offen gelassen, und ab
 * P3 liefert Clipper2 per Konstruktion überschneidungsfreie Ringe.
 */
function outlineFindings(
  outline: readonly OutlinePolygon[],
): SectionValidationResult {
  const errors: SectionValidationError[] = [];
  const warnings: SectionValidationWarning[] = [];

  const rings = outline.map((polygon, index) => ({
    index,
    polygon,
    signedArea:
      polygon.points.length < 3 ? 0 : Polygon.signedArea(polygon.points),
  }));

  // G1b.1 — der entartete Ring. Je Ring, damit die Meldung sagt, WELCHER.
  for (const ring of rings) {
    if (ring.polygon.points.length >= 3 && ring.signedArea === 0) {
      errors.push(
        new DegenerateOutlineRingError(ring.index, ring.polygon.points.length),
      );
    }
  }

  // G1b.2 — die Gesamtfläche. Ohne sie gibt Green ein negatives `A` zurück
  // und `fem-section-resolve` daraus eine negative Steifigkeit.
  const total = rings.reduce((sum, ring) => sum + ring.signedArea, 0);
  if (total <= 0) {
    errors.push(new NegativeOutlineAreaError(total));
  }

  // G1b.3 — das freistehende Loch. WARNUNG: rechenbar (es zieht dann eben
  // Fläche ab, die es nicht gibt) und bei zwei getrennten Vollflächen
  // legitim aussehend.
  //
  // GEPRÜFT WIRD EIN PUNKT, nicht die Ueberdeckung zweier Ringe: bei
  // überschneidungsfreien Ringen ist das dasselbe, und liegt einer drin,
  // liegen alle drin.
  const material = rings.filter((ring) => ring.signedArea > 0);
  for (const hole of rings.filter((ring) => ring.signedArea < 0)) {
    // Der erste Punkt reicht als Probe, und er ist da: bei weniger als drei
    // Punkten ist `signedArea` 0, ein leerer Ring kommt also nie bis hierher.
    // Der `undefined`-Zweig steht nur, weil der Typ ihn offen lässt.
    const [probe] = hole.polygon.points;
    if (probe === undefined) continue;

    const inside = material.some((ring) =>
      Polygon.contains(ring.polygon, probe),
    );
    if (!inside) {
      warnings.push(new UnnestedHoleWarning(hole.index, hole.signedArea));
    }
  }

  return { errors, warnings };
}

/**
 * Ein Befund je mehrfach vergebener Id — EINER, nicht einer je Duplikat.
 *
 * Die Meldung nennt die Anzahl, weil das die Frage des Lesers ist („wie oft?"),
 * und drei Eintraege fuer dieselbe Id waeren dreimal derselbe Satz.
 */
function duplicateIds(
  element: SectionElement,
  items: readonly { id: string }[],
): DuplicateSectionIdError[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => new DuplicateSectionIdError(element, id, count));
}

/**
 * Satz 3 fuer alle Knoten, an denen genau zwei Waende zusammenlaufen.
 *
 * NUR BEI GRAD 2, und das ist die Aussage: an einer Verzweigung — dem
 * Steg-Gurt-Knoten eines T zum Beispiel — gibt es keine Fortsetzung, deren
 * Tangente gebrochen sein koennte. Am freien Ende erst recht nicht.
 *
 * NUR MIT MINDESTENS EINEM BOGEN. Zwei gerade Waende, die im Winkel
 * aufeinandertreffen, sind eine ECKE und keine gebrochene Tangentialitaet — der
 * Regelfall an jedem geschweissten Profil.
 */
function kinks(
  walls: readonly Wall[],
  byId: ReadonlyMap<string, SectionNode>,
  arcTolerance: number,
): TangentKinkWarning[] {
  const incident = new Map<string, Wall[]>();
  for (const wall of walls) {
    for (const nodeId of new Set([wall.startNodeId, wall.endNodeId])) {
      const at = incident.get(nodeId) ?? [];
      at.push(wall);
      incident.set(nodeId, at);
    }
  }

  const warnings: TangentKinkWarning[] = [];
  for (const [nodeId, at] of incident) {
    const [a, b] = at;
    if (at.length !== 2 || a === undefined || b === undefined) continue;
    if ((a.bulge ?? 0) === 0 && (b.bulge ?? 0) === 0) continue;

    const ta = outgoingTangent(a, nodeId, byId);
    const tb = outgoingTangent(b, nodeId, byId);
    if (ta === undefined || tb === undefined) continue;

    // Glatt heisst: die beiden ABGEHENDEN Tangenten zeigen genau
    // entgegengesetzt. Was davon uebrig bleibt, ist der Knick.
    const theta = Math.abs(normalize(ta - tb - Math.PI));

    // Die DICKERE der beiden Waende entscheidet: ihre Kerbe wird tiefer, und
    // gewarnt wird, sobald IRGENDEINE Umrissecke die Toleranz verlaesst.
    const t = Math.max(a.t, b.t);
    const notch = (t / 2) * Math.tan(theta / 2);
    if (notch > arcTolerance) {
      warnings.push(
        new TangentKinkWarning(
          nodeId,
          [a.id, b.id],
          theta,
          notch,
          arcTolerance,
        ),
      );
    }
  }
  return warnings;
}

/**
 * Die Tangente der Wand AM Knoten `nodeId`, gerichtet VON ihm WEG [rad].
 *
 * Der Bogen steckt vollstaendig in `bulge = tan(Δ/4)`: seine Endtangente liegt
 * um `Δ/2` neben der Sehne, am Anfang auf der einen, am Ende auf der anderen
 * Seite. Mehr braucht Satz 3 nicht — kein Mittelpunkt, kein Radius, kein `Arc`,
 * und deshalb ruft diese Stelle `Bulge.sweep` und nicht `Bulge.toArc`: der
 * Oeffnungswinkel ist koordinatenfrei, ein `Arc` waere die teurere Antwort auf
 * eine kleinere Frage. `Δ` kommt aber aus EINER Quelle statt aus einer zweiten
 * Handrechnung.
 *
 * Haengt die Wand am anderen Ende, wird die Endtangente umgedreht: „von diesem
 * Knoten weg" heisst dann entgegen der Durchlaufrichtung.
 */
function outgoingTangent(
  wall: Wall,
  nodeId: string,
  byId: ReadonlyMap<string, SectionNode>,
): number | undefined {
  const start = byId.get(wall.startNodeId);
  const end = byId.get(wall.endNodeId);
  if (start === undefined || end === undefined) return undefined;
  if (start.y === end.y && start.z === end.z) return undefined;

  // Positiv von `+y` nach `+z`, wie `Arc.sweep` (ADR 0031).
  const chord = Math.atan2(end.z - start.z, end.y - start.y);
  const half = Bulge.sweep(wall.bulge ?? 0) / 2;

  if (wall.startNodeId === nodeId) return chord - half;
  return chord + half + Math.PI;
}

/**
 * Auf `[−π, +π)` gebracht, damit `|angle|` der KLEINERE der beiden Winkel ist.
 *
 * Zweimal `%` und ein `+ 2π` dazwischen, weil JavaScripts `%` das Vorzeichen
 * des Dividenden behaelt: `-1 % 6` ist `-1` und nicht `5`. Ohne den Umweg fiele
 * jeder Knick mit negativem Rohwinkel aus dem Bereich.
 */
function normalize(angle: number): number {
  const turn = 2 * Math.PI;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}
