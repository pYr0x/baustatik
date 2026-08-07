/**
 * Das Prüfgatter des Querschnitts — ZWEI TUEREN, weil zwei verschiedene Fragen
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
 * KEINE NEUE ABHAENGIGKEIT AUSSER `@baustatik/errors`. Die Knickwarnung liest
 * das MITGEFUEHRTE Polygon und rechnet die Endtangente einer Bogenwand aus
 * `Δ/2 = 2·atan(bulge)` — Trigonometrie, kein `Arc`-Objekt, kein Clipper2. Die
 * Reihenfolge P0 -> P1 bleibt damit sauber, und `@baustatik/script` zieht keine
 * Geometriebibliothek in den Snapshot-Builder.
 */

import {
  DuplicateSectionIdError,
  EmptyOutlineError,
  NonPositiveWallThicknessError,
  NotPrincipalAxesWarning,
  type SectionElement,
  type SectionValidationError,
  type SectionValidationWarning,
  ShearCentreOffsetWarning,
  ShearCentreUnknownWarning,
  TangentKinkWarning,
  UnknownSectionNodeError,
  ZeroLengthWallError,
} from './errors';
import type { SectionProperties } from './properties';
import type { SectionGeometry, SectionNode, Wall } from './types';

/** Das Ergebnis einer Gatterpruefung. Zwei Sorten Befund. */
export type SectionValidationResult = {
  errors: SectionValidationError[];
  warnings: SectionValidationWarning[];
};

/**
 * Die Toleranz ist ein PARAMETER, keine Konstante im Gatter.
 *
 * Das loest den Widerspruch zwischen „keine neue Abhaengigkeit fuer
 * `cross-section`" und „die Knickschranke haengt an einer Zahl aus
 * `@baustatik/geometry-2d`" — und es ist die Form, die
 * [ADR 0011](../../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md)
 * fuer ergebnisaendernde Zahlen bereits gewaehlt hat. Der Aufrufer reicht
 * `DEFAULT_ARC_TOLERANCE` herein.
 */
export type SectionGeometryOptions = {
  /** Zulaessige Sehnenabweichung der Diskretisierung [mm]. */
  arcTolerance: number;
};

/**
 * Alle Befunde zur gezeichneten Figur, in Eingabereihenfolge.
 *
 * `errors` leer heisst: aus diesem Satz laesst sich rechnen.
 */
export function validateSectionGeometry(
  geometry: SectionGeometry,
  options: SectionGeometryOptions,
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
    for (const end of ['from', 'to'] as const) {
      if (!byId.has(wall[end])) {
        errors.push(new UnknownSectionNodeError(wall.id, end, wall[end]));
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
    const from = byId.get(wall.from);
    const to = byId.get(wall.to);
    if (from === undefined || to === undefined) continue;
    if (from.y === to.y && from.z === to.z) {
      errors.push(new ZeroLengthWallError(wall.id));
    }
  }

  // G6 — Satz 3, der Knick am Bogen.
  warnings.push(...kinks(geometry.walls, byId, options.arcTolerance));

  return { errors, warnings };
}

/**
 * Alle Befunde zu den ZAHLEN — die Saetze 1, 2 und 4.
 *
 * `errors` ist heute IMMER LEER, und das ist keine Luecke: was an einem
 * Zahlensatz nicht rechenbar waere, ist an der Figur schon aufgefallen, und wo
 * es keine Figur gibt (Katalogzeile), buergt der Katalog. Der Kanal steht
 * trotzdem, weil beide Tueren dasselbe Ergebnis liefern sollen — der Aufrufer
 * legt sie zusammen und muss nicht wissen, welche welchen Kanal fuellt.
 */
export function validateSectionProperties(
  properties: SectionProperties,
): SectionValidationResult {
  const warnings: SectionValidationWarning[] = [];

  // Satz 1 — Hauptachsenlage. EXAKTER VERGLEICH gegen 0, und das ist heute die
  // richtige Schaerfe: jede Quelle schreibt eine literale 0 hin. Die erste
  // Quelle, die `Iyz` numerisch aus einem Umriss integriert (P2), bringt die
  // Frage „wie klein ist null" selbst mit — eine Schranke hier waere geraten,
  // bevor es etwas zu schaetzen gibt.
  if (properties.Iyz !== 0) {
    warnings.push(
      new NotPrincipalAxesWarning(properties.Iyz, properties.alpha),
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
    for (const nodeId of new Set([wall.from, wall.to])) {
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
 * um `Δ/2 = 2·atan(bulge)` neben der Sehne, am Anfang auf der einen, am Ende
 * auf der anderen Seite. Mehr braucht Satz 3 nicht — kein Mittelpunkt, kein
 * Radius, kein `Arc`.
 *
 * Haengt die Wand am anderen Ende, wird die Endtangente umgedreht: „von diesem
 * Knoten weg" heisst dann entgegen der Durchlaufrichtung.
 */
function outgoingTangent(
  wall: Wall,
  nodeId: string,
  byId: ReadonlyMap<string, SectionNode>,
): number | undefined {
  const from = byId.get(wall.from);
  const to = byId.get(wall.to);
  if (from === undefined || to === undefined) return undefined;
  if (from.y === to.y && from.z === to.z) return undefined;

  // Positiv von `+y` nach `+z`, wie `Arc.sweep` (ADR 0031).
  const chord = Math.atan2(to.z - from.z, to.y - from.y);
  const half = 2 * Math.atan(wall.bulge ?? 0);

  if (wall.from === nodeId) return chord - half;
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
