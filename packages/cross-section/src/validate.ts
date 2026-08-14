/**
 * Das Gate des Querschnitts — ZWEI TUEREN, weil zwei verschiedene Fragen
 * ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)).
 *
 *   `validateSectionGeometry`   — ist die GEZEICHNETE FIGUR in sich stimmig?
 *   `validateSectionProperties` — sind die ZAHLEN unter den Annahmen der ebenen
 *                                 Rechnung brauchbar?
 *
 * Beide geben `{ errors, warnings }` zurück, den dritten Fehlerkanal des Repos
 * — der Kanal für die Sammelprüfung hinter einem Prüf-Knopf, der dem
 * Anwender auf einmal zeigen soll, was nicht stimmt. Ein `assertValid…` gibt es
 * hier ABSICHTLICH NICHT: der Querschnitt ist kein Tor vor der Rechenkette. Wer
 * ihn nicht rechnen kann, bekommt `undefined` aus `sectionProperties`, und
 * daraus wird ein Modellfehler IM BERICHT.
 *
 * ES WIRD GEWARNT, NICHT VERWEIGERT. Alle vier Sätze der Warnseite hängen an
 * Annahmen, die NICHT Eigenschaften des Querschnitts sind — ob der Stab aus der
 * Ebene gehalten wird, zum Beispiel. `CrossSection` wird nach ADR 0023 GETEILT:
 * derselbe L-Winkel ist in einem Stab gehalten und im nächsten nicht.
 *
 * DIE BOGENALGEBRA KOMMT AUS `@baustatik/section-geometry`. P0 rechnete die
 * Endtangente einer Bogenwand hier von Hand — `Δ/2 = 2·atan(bulge)` —, weil ADR
 * 0032 dem Package eine Geometrie-Abhängigkeit verbot und die Reihenfolge
 * P0 -> P1 sauber bleiben sollte. Mit `Bulge` (P1) gibt es die Umrechnung an
 * genau einer Stelle, und die Doppelung ist AUFGELOEST statt nur getestet.
 * Der Preis steht in ADR 0033: ab P3 zieht `geometry-2d` `clipper2-ts` nach,
 * und `@baustatik/script` trägt es dann transitiv im Snapshot-Builder.
 */

import { atOrThrow } from '@baustatik/core';
import { Bulge, Polygon } from '@baustatik/section-geometry';
import {
  buildGraph,
  cellCount,
  componentCount,
  nodeIdOf,
  normalizeAngle,
  outgoingTangent,
} from './branch';
import { chainedJoints, deriveOutline } from './derive-outline';
import {
  type BulgeSite,
  DegenerateOutlineRingError,
  DisconnectedWallGraphWarning,
  DuplicateSectionIdError,
  EmptyOutlineError,
  MiterLimitExceededWarning,
  MultipleCellsWarning,
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
  ThickWallWarning,
  UndiscretisableBulgeError,
  UnknownSectionNodeError,
  UnnestedHoleWarning,
  ZeroLengthWallError,
} from './errors';
import type { SectionPolicy } from './policy';
import type { SectionProperties } from './properties';
import { type SegmentRun, segments } from './segment';
import type {
  Polygon as OutlinePolygon,
  Ring,
  SectionGeometry,
  SectionNode,
  Wall,
} from './types';
import { M2_TO_MM2 } from './units';

/** Das Ergebnis einer Gate-Prüfung. Zwei Sorten Befund. */
export type SectionValidationResult = {
  errors: SectionValidationError[];
  warnings: SectionValidationWarning[];
};

/**
 * Alle Befunde zur gezeichneten Figur, in Eingabereihenfolge.
 *
 * `errors` leer heißt: aus diesem Satz lässt sich rechnen.
 *
 * DIE POLICY IST EIN PARAMETER, keine Konstante im Gate: eine Zahl, die das
 * Ergebnis ändert, wird übergeben und nicht importiert (ADR 0011). Sie steht
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
  // und kein eigener Befund. Sie gilt für BEIDE Varianten — der
  // `outline`-Zweig bekommt damit die Prüfung, die ihm seit P2 fehlt, ohne
  // dass jemand dafür etwas zusätzlich baut.
  if (errors.length === 0) {
    warnings.push(...drift(geometry, policy));

    // G8 — der WANDWEG, und er steht aus demselben Grund hier: κ, der
    // Schubmittelpunkt und `It` fallen nur aus einer Figur, deren Topologie
    // stimmt, und über eine kaputte zu urteilen wäre ein Folgefehler.
    if (
      geometry.kind === 'midline' &&
      geometry.idealisation === 'thin-walled'
    ) {
      warnings.push(
        ...wallPathFindings(
          segments(geometry.nodes, geometry.walls, policy),
          policy,
        ),
      );
    }
  }

  return { errors, warnings };
}

/**
 * Die drei Befunde am WANDWEG (ADR 0040).
 *
 * SIE STEHEN AN DER GEOMETRIE-TÜR, weil nur sie Marke UND Gestalt zugleich
 * sieht: die Eigenschaften-Tür bekommt einen Zahlensatz und keine Topologie,
 * und an ihm wäre ein fehlendes κ von jedem anderen fehlenden κ nicht mehr zu
 * unterscheiden.
 *
 * NUR BEI `thin-walled`, und das ist die Aussage aus ADR 0029: `idealisation`
 * schaltet den WANDWEG, nicht die Topologie. Ein `solid` gezeichneter
 * Wandgraph bekommt seine Schubgrössen aus Grashof (P4) und nicht von hier —
 * über seine Zellen zu urteilen hiesse, ihn nach einer Theorie zu messen, die
 * für ihn nicht gilt.
 */
function wallPathFindings(
  runs: readonly SegmentRun[],
  policy: SectionPolicy,
): SectionValidationWarning[] {
  const warnings: SectionValidationWarning[] = [];
  if (runs.length === 0) return warnings;

  const branches = runs.map((run) => run.branch);

  const cells = cellCount(branches);
  if (cells > 1) warnings.push(new MultipleCellsWarning(cells));

  const components = componentCount(branches);
  if (components > 1) {
    warnings.push(new DisconnectedWallGraphWarning(components));
  }

  runs.forEach((run, index) => {
    const ratio = thicknessRatio(run);
    if (ratio === undefined || ratio <= policy.thickWallRatio) return;
    warnings.push(
      new ThickWallWarning(
        index,
        run.branch.wallIds,
        run.branch.closed,
        ratio,
        policy.thickWallRatio,
      ),
    );
  });

  return warnings;
}

/**
 * Wie dick der Lauf gemessen an seiner eigenen Grösse ist — `t/L` offen,
 * `t/√A_m` geschlossen.
 *
 * DIE DICKSTE WAND ENTSCHEIDET, wie bei der Knickwarnung: gewarnt wird,
 * sobald IRGENDEIN Stück des Laufs die Annahme verlässt.
 */
function thicknessRatio(run: SegmentRun): number | undefined {
  if (run.segments.length === 0) return undefined;

  let t = 0;
  let length = 0;
  for (const segment of run.segments) {
    t = Math.max(t, segment.t);
    length += segment.length;
  }

  const reference = run.branch.closed
    ? Math.sqrt(
        Math.abs(
          Polygon.signedArea(run.segments.map(({ y, z }) => ({ y, z }))),
        ),
      )
    : length;

  return reference > 0 ? t / reference : undefined;
}

function shapeFindings(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): SectionValidationResult {
  const errors: SectionValidationError[] = [];
  const warnings: SectionValidationWarning[] = [];

  // G1 — der mitgeführte Umriss. Zuerst, weil er in BEIDEN Varianten steht und
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

  if (geometry.kind === 'outline') {
    // G1c — die Wölbung der EINGABERINGE, dieselbe Frage wie G6b an der Wand.
    // Sie steht UNABHÄNGIG von G1 da und nicht in dessen `else`: ein kaputter
    // `bulge` im Ring ist kein Folgefehler eines leeren Umrisses, sondern der
    // Grund, aus dem der Umriss so aussieht, wie er aussieht.
    errors.push(...ringBulgeFindings(geometry.rings, policy));
    return { errors, warnings };
  }

  // G2 — doppelte Ids. VOR allem Weiteren, denn sie machen den Graphen
  // mehrdeutig: `byId` behielte still den LETZTEN Eintrag, jede Wand hänge an
  // der falschen Lage, und G4 wie G5 urteilten dann über eine Figur, die
  // niemand gezeichnet hat. Doppelte Wand-Ids treffen außerdem den Viewer, der
  // seine Zeichen-Specs nach `id` abgleicht — eine Wand verschwände still.
  errors.push(...duplicateIds('node', geometry.nodes));
  errors.push(...duplicateIds('wall', geometry.walls));

  const byId = new Map(geometry.nodes.map((node) => [node.id, node]));

  // G3 — hängende Verweise. Zuerst unter den Wänden, weil alles Weitere die
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

  // G4 — die Wandstärke. Unabhängig vom Graphen, deshalb ohne Vorbedingung.
  for (const wall of geometry.walls) {
    if (!(Number.isFinite(wall.t) && wall.t > 0)) {
      errors.push(new NonPositiveWallThicknessError(wall.id, wall.t));
    }
  }

  // G5 — die entartete Wand. Nur mit auflösbaren Knoten: sonst wäre die
  // Meldung „Länge 0" ein Folgefehler von G3 statt eines eigenen Befunds.
  for (const wall of geometry.walls) {
    const start = byId.get(wall.startNodeId);
    const end = byId.get(wall.endNodeId);
    if (start === undefined || end === undefined) continue;
    if (start.y === end.y && start.z === end.z) {
      errors.push(new ZeroLengthWallError(wall.id));
    }
  }

  // G6 — Satz 3, der Knick am Bogen.
  warnings.push(
    ...kinks(geometry.nodes, geometry.walls, policy.discretisationTolerance),
  );

  // G6b — die Wölbung selbst. DIE LÜCKE AUS P1: bis P2 sah das Gate `t`, den
  // Umriss, die Ids und den Knick, nie aber `bulge`. Ein `NaN` lief still
  // durch, weil die Knickprüfung `notch = NaN` rechnet und `NaN > tol` falsch
  // ist. Ab P3 landet der Wert in einer fremden Bibliothek — deshalb fällt die
  // Entscheidung jetzt (ADR 0037).
  //
  // ZWEI BEFUNDE UND NICHT EINER, weil `Number.isFinite` nur die halbe Frage
  // ist: eine endliche Riesenwölbung beschreibt einen fast vollen Kreis, dessen
  // Zerlegung Milliarden Punkte verlangt. Die Ableitung liest BEIDE als Gerade,
  // also meldet das Gate beide — was sie wegfiltert, sagt es mit Namen.
  for (const wall of geometry.walls) {
    if (wall.bulge === undefined) continue;

    // Die Sehne braucht beide Knoten. Fehlt einer, bleibt nur die Frage nach
    // der endlichen Zahl — dass die Wand ins Leere zeigt, sagt G3.
    const start = byId.get(wall.startNodeId);
    const end = byId.get(wall.endNodeId);
    const chordLength =
      start === undefined || end === undefined
        ? undefined
        : Math.hypot(end.y - start.y, end.z - start.z);

    const finding = bulgeFinding(
      { kind: 'wall', wallId: wall.id },
      wall.bulge,
      chordLength,
      policy.discretisationTolerance,
    );
    if (finding !== undefined) errors.push(finding);
  }

  // G6c — der gekappte Miter-Spitz. NUR AN DURCHVERBUNDENEN STOESSEN, und
  // welche das sind, sagt die Ableitung: nur dort entsteht überhaupt eine
  // Miter-Ecke.
  //
  // DER UEBERSTAND WIRD NICHT MEHR HIER GERECHNET. `1/sin(α/2)` gilt nur bei
  // gleicher Wandstärke; seit ADR 0038 misst die Ableitung ihn an der Ecke,
  // die sie tatsächlich baut — sonst schwiege das Gate ausgerechnet dort, wo
  // gekappt wird (fast gestreckter Stoß MIT Dickensprung).
  //
  // DICHT UEBER DER SCHRANKE WARNT ES ZU VIEL, und das ist die gewollte
  // Richtung: liegt `overshoot` nur knapp über `miterLimit`, waere die Fase
  // schmaler als `discretisationTolerance`, und `fillRing` laesst den vollen Miter stehen
  // statt einen Splitter zu setzen. Das Gate meldet dann eine Kappung, die
  // nicht stattfindet — es verspricht aber ohnehin nur „verliert dort Flaeche",
  // und verloren geht dann eben nichts. Die Bedingung hier deshalb NICHT
  // nachzuziehen ist Absicht: sie muesste die Fasenbreite nachrechnen, und
  // damit stuende die Regel wieder zweimal im Repo — genau das, wogegen
  // `chainedJoints` angelegt wurde.
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
 * Der Befund zu EINER Wölbung — oder keiner.
 *
 * DIE EINE STELLE, an der „unbrauchbar" für das Gate entschieden wird, und sie
 * liest dieselbe Frage wie `usableBulge` in der Ableitung: was die eine als
 * Gerade zeichnet, benennt die andere. Zwei Schreibweisen derselben Regel wären
 * zwei Gelegenheiten, sie auseinanderlaufen zu lassen.
 *
 * `chordLength` DARF FEHLEN: an einer Wand mit hängendem Verweis gibt es keine
 * Sehne, und ohne sie ist die Zerlegbarkeit keine sinnvolle Frage. Die endliche
 * Zahl bleibt es.
 */
function bulgeFinding(
  at: BulgeSite,
  bulge: number,
  chordLength: number | undefined,
  discretisationTolerance: number,
): SectionValidationError | undefined {
  if (!Number.isFinite(bulge)) return new NonFiniteBulgeError(at, bulge);
  if (chordLength === undefined) return undefined;

  return Bulge.isDiscretisable(chordLength, bulge, discretisationTolerance)
    ? undefined
    : new UndiscretisableBulgeError(at, bulge, discretisationTolerance);
}

/**
 * G1c für alle Ringe der EINGABE — die Wölbung im `outline`-Zweig.
 *
 * `bulge` GEHÖRT DER ABGEHENDEN KANTE (ADR 0030), also läuft die Sehne zum
 * NÄCHSTEN Punkt, und der letzte schliesst zum ersten zurück. Das ist genau die
 * Kante, die `deriveOutlineFromRings` daraus zeichnet; eine andere Sehne
 * anzusetzen hiesse, über eine Figur zu urteilen, die niemand ableitet.
 */
function ringBulgeFindings(
  rings: readonly Ring[],
  policy: SectionPolicy,
): SectionValidationError[] {
  const errors: SectionValidationError[] = [];

  rings.forEach((ring, ringIndex) => {
    ring.vertices.forEach((vertex, vertexIndex) => {
      if (vertex.bulge === undefined) return;

      // Beim EINZIGEN Punkt ist die Sehne 0: jede Wölbung darauf ist gerade,
      // und dass daraus kein Ring wird, sagt G1.
      const to = atOrThrow(
        ring.vertices,
        (vertexIndex + 1) % ring.vertices.length,
      );
      const finding = bulgeFinding(
        { kind: 'vertex', ringIndex, vertexIndex },
        vertex.bulge,
        Math.hypot(to.y - vertex.y, to.z - vertex.z),
        policy.discretisationTolerance,
      );
      if (finding !== undefined) errors.push(finding);
    });
  });

  return errors;
}

/**
 * Der mitgeführte Umriss gegen seine NEUABLEITUNG — ADR 0030s Versprechen,
 * eingelöst (ADR 0037).
 *
 * DIE SCHRANKE WIRD ABGELEITET, NICHT GESETZT, dieselbe Figur wie die
 * Knickschranke: `discretisationTolerance · U` ist genau die Fläche, die entsteht, wenn
 * der Rand überall um die Diskretisierungstoleranz wandert — die größte
 * Abweichung, die ein zulässiger Bibliothekswechsel erklären kann. Ein
 * viertes Policy-Feld wäre eine zweite Zahl für dieselbe Frage.
 *
 * VERGLICHEN WIRD `A` UND NICHT PUNKT FUER PUNKT: die Punktzahl gegeneinander
 * zu halten machte jede `discretisationTolerance`-Aenderung zum Befund, und genau die
 * reist seit ADR 0033 im Satz mit.
 *
 * SEIT DER FE ZWEI VERGLEICHE AUF DERSELBEN SCHRANKE, und der zweite ist KEINE
 * neue Warnung, sondern derselbe Anlass an einer zweiten Zahl: der FE-Block
 * traegt einen Fingerabdruck (`A`, `Iy`) des Umrisses, auf dem gerechnet wurde
 * ([ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)).
 * Das Gate kann die FE nicht neu rechnen — sie ist asynchron —, den Umriss
 * leitet es aber ohnehin neu ab. Weicht der Fingerabdruck ab, ist der Block
 * VERALTET, und aus stiller Drift wird ein Befund. `Iy` bleibt dabei
 * ungeprueft: es faellt aus derselben Punktmenge wie `A`, und eine zweite
 * Schranke dafuer waere eine zweite Zahl fuer dieselbe Frage.
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

  const limit = policy.discretisationTolerance * U;
  const warnings: SectionValidationWarning[] = [];
  if (Math.abs(derived - carried) > limit) {
    warnings.push(new OutlineDriftWarning(carried, derived, limit));
  }

  const state = geometry.feValues;
  if (state?.status === 'computed') {
    // Der Fingerabdruck steht in SI, die Frage wird in mm² gestellt.
    const fingerprint = state.fingerprint.A * M2_TO_MM2;
    if (Math.abs(derived - fingerprint) > limit) {
      warnings.push(new OutlineDriftWarning(fingerprint, derived, limit));
    }
  }

  return warnings;
}

/**
 * Alle Befunde zu den ZAHLEN — die Sätze 1, 2 und 4.
 *
 * `errors` ist heute IMMER LEER, und das ist keine Lücke: was an einem
 * Zahlensatz nicht rechenbar wäre, ist an der Figur schon aufgefallen, und wo
 * es keine Figur gibt (Katalogzeile), bürgt der Katalog. Der Kanal steht
 * trotzdem, weil beide Türen dasselbe Ergebnis liefern sollen — der Aufrufer
 * legt sie zusammen und muss nicht wissen, welche welchen Kanal füllt.
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

  // Sätze 2 und 4 — der Schubmittelpunkt, und sie schließen einander aus:
  // entweder ist `yM` bekannt und wird verglichen, oder er fehlt und der
  // Vergleich ist ungeprüft. Beides zugleich zu melden hieße, denselben
  // Umstand zweimal zu beklagen.
  //
  // SEIT P5 EIN TOLERANZVERGLEICH, dieselbe Bewegung wie bei Satz 1 in P2:
  // `yM` fällt beim gezeichneten Querschnitt aus zwei numerischen
  // Integrationen über zwei verschiedene Figuren, `ys` aus Green über den
  // Umriss — der exakte Vergleich meldete damit bei jedem symmetrisch
  // gezeichneten I eine Torsion, die es nicht gibt.
  //
  // `zM` BEKOMMT KEINEN EIGENEN SATZ, und die Asymmetrie ist gewollt: das
  // ebene Stabwerk kennt nur `N`, `Vz` und `My`, die Torsion kommt aus
  // `yM − ys` allein. Ein Satz über `zM` feuerte bei jedem Plattenbalken und
  // meinte dabei ein räumliches Modell, das es nicht gibt.
  if (properties.yM === undefined) {
    warnings.push(new ShearCentreUnknownWarning());
  } else {
    const shearLimit = policy.shearCentreTolerance * gyrationRadius(properties);
    if (Math.abs(properties.yM - properties.ys) > shearLimit) {
      warnings.push(
        new ShearCentreOffsetWarning(properties.yM, properties.ys, shearLimit),
      );
    }
  }

  return { errors: [], warnings };
}

/**
 * Der GRÖSSERE Trägheitsradius `max(√(Iy/A), √(Iz/A))` [m] — die einzige
 * Länge, die aus dem Wertesatz allein fällt.
 *
 * Die Eigenschaften-Tür sieht keine Figur, also auch keine Abmessung, gegen
 * die ein Versatz zu messen wäre. Der grössere, aus demselben Grund wie bei
 * Satz 1: sonst schwiege die Frage ausgerechnet dort, wo eine der beiden
 * Achsen schwach ist.
 *
 * `0` bei einem unbrauchbaren Satz — dann ist der Vergleich wieder exakt, und
 * das ist die schärfere und damit die sichere Antwort.
 */
function gyrationRadius(properties: SectionProperties): number {
  const { A, Iy, Iz } = properties;
  if (!(Number.isFinite(A) && A > 0)) return 0;
  const radius = Math.sqrt(Math.max(Math.abs(Iy), Math.abs(Iz)) / A);
  return Number.isFinite(radius) ? radius : 0;
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
  // GEPRÜFT WIRD EIN PUNKT, nicht die Überdeckung zweier Ringe: bei
  // überschneidungsfreien Ringen ist das dasselbe, und liegt einer drin,
  // liegen alle drin.
  const material = rings.filter((ring) => ring.signedArea > 0);
  for (const hole of rings.filter((ring) => ring.signedArea < 0)) {
    // Der erste Punkt reicht als Probe, und er ist da: bei weniger als drei
    // Punkten ist `signedArea` 0, ein leerer Ring kommt also nie bis hierher.
    const probe = atOrThrow(hole.polygon.points, 0);

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
 * und drei Einträge für dieselbe Id wären dreimal derselbe Satz.
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
 * Satz 3 für alle Knoten, an denen genau zwei Wände zusammenlaufen.
 *
 * NUR BEI GRAD 2, und das ist die Aussage: an einer Verzweigung — dem
 * Steg-Gurt-Knoten eines T zum Beispiel — gibt es keine Fortsetzung, deren
 * Tangente gebrochen sein könnte. Am freien Ende erst recht nicht.
 *
 * NUR MIT MINDESTENS EINEM BOGEN. Zwei gerade Wände, die im Winkel
 * aufeinandertreffen, sind eine ECKE und keine gebrochene Tangentialität — der
 * Regelfall an jedem geschweißten Profil.
 *
 * DIE ZWEITE FASSUNG VON `outgoingTangent` IST MIT P5 ENTFALLEN. Sie stand
 * hier, weil das Gate vor `branch.ts` keinen Graphen hatte; seither gibt es
 * `buildGraph` samt Gradzählung und die Tangente an EINER Stelle. Der
 * Nebengewinn ist ein Gleichlauf, den die zweite Fassung nur zufällig hatte:
 * entartete Wände fallen jetzt in derselben Funktion heraus, aus der auch die
 * Ableitung und der Wandweg sie herausfallen lassen.
 */
function kinks(
  nodes: readonly SectionNode[],
  walls: readonly Wall[],
  discretisationTolerance: number,
): TangentKinkWarning[] {
  const warnings: TangentKinkWarning[] = [];

  for (const at of buildGraph(nodes, walls).incident.values()) {
    if (at.length !== 2) continue;
    const a = atOrThrow(at, 0);
    const b = atOrThrow(at, 1);
    if ((a.of.wall.bulge ?? 0) === 0 && (b.of.wall.bulge ?? 0) === 0) continue;

    // Glatt heißt: die beiden ABGEHENDEN Tangenten zeigen genau
    // entgegengesetzt. Was davon übrig bleibt, ist der Knick.
    const theta = Math.abs(
      normalizeAngle(outgoingTangent(a) - outgoingTangent(b) - Math.PI),
    );

    // Die DICKERE der beiden Wände entscheidet: ihre Kerbe wird tiefer, und
    // gewarnt wird, sobald IRGENDEINE Umrissecke die Toleranz verlässt.
    const t = Math.max(a.of.wall.t, b.of.wall.t);
    const notch = (t / 2) * Math.tan(theta / 2);
    if (notch > discretisationTolerance) {
      warnings.push(
        new TangentKinkWarning(
          nodeIdOf(a),
          [a.of.wall.id, b.of.wall.id],
          theta,
          notch,
          discretisationTolerance,
        ),
      );
    }
  }

  return warnings;
}
