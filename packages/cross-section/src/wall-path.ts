/**
 * Die Rechnung ÜBER dem positionierten Wandweg: κ, der Schubmittelpunkt und
 * `It`
 * ([ADR 0040](../../../docs/adr/0040-the-wall-path-is-positioned.md),
 * [ADR 0041](../../../docs/adr/0041-two-figures-for-the-wall-path.md)).
 *
 * WAS HIER NICHT STEHT: die Geometrie. `src/segment.ts` liefert die
 * positionierten Stücke, `src/shear.ts` die lagelose Energieform. Diese Datei
 * legt den WEG darüber — welche Wand in welcher Richtung, wo `S` bei 0 anfängt
 * und was an einer Verzweigung zusammenläuft.
 *
 * DREI GRÖSSEN, ZWEI FIGUREN (ADR 0041):
 *
 * | Grösse   | `S` aus    | `I` aus       |
 * | -------- | ---------- | ------------- |
 * | κ        | Wandmodell | Umrissfigur   |
 * | `yM`/`zM`| Wandmodell | Wandmodell    |
 *
 * κ ist NACH AUSSEN gebunden: so rechnet RSTAB, und daran hängt die
 * Übereinstimmung mit der IPE-Reihe (ADR 0021) — es ist dieselbe Mischung, die
 * `shapes/t-section.ts` seit jeher fährt. Der Schubmittelpunkt ist NACH INNEN
 * gebunden: `∫S dz = I` gilt nur für EINE Figur, und gemischt käme die
 * Resultierende als `V·I_wand/I_umriss` heraus (IPE 300: rund 2 %).
 *
 * EINE ZELLE JA, ZWEI NEIN. Bei `0` Zellen läuft der Weg als Baum von den
 * freien Enden; bei `1` kommt EINE skalare Verträglichkeitsgleichung dazu:
 *
 * ```text
 * S₀ = − ∮(S_offen/t) ds / ∮(ds/t)
 * ```
 *
 * Das ist kein Löser. `S₀` ist auf den Zellsegmenten ein KONSTANTER Zuschlag
 * auf `c0`, und deshalb bleiben `ShearFlowInterval` und `shearArea`
 * unverändert. Ab zwei Zellen stünde dort ein `n×n`-System — das ist ein
 * anderes Vorhaben, und bis dahin bleiben die Werte `undefined` und das Gate
 * sagt es.
 *
 * KEINE QUADRATUR, wie in `src/shear.ts`: `S(s)` ist auf jedem Segment ein
 * Polynom zweiten Grades, `∫S ds` und `∫S²/t ds` sind geschlossen angebbar.
 */

import { atOrThrow } from '@baustatik/core';
import { Polygon } from '@baustatik/section-geometry';
import { branchEnds, cellCount, componentCount } from './branch';
import {
  reverseSegment,
  type Segment,
  type SegmentRun,
  wallMoments,
} from './segment';
import {
  endMoment,
  type ShearFlowInterval,
  shearArea,
  shearFlowIntegral,
} from './shear';

/**
 * Die Werte der UMRISSFIGUR, gegen die κ gerechnet wird — die Spalte
 * „Umrissfigur" aus ADR 0041.
 *
 * IM MASSSTAB DER SEGMENTE, und das ist eine VORBEDINGUNG und keine
 * Empfehlung: κ ist `A_s/A` und damit dimensionslos, aber nur, wenn `∫S²/t ds`
 * aus dem Wandweg und `I²`/`A` aus dem Umriss in DERSELBEN Längeneinheit `L`
 * stehen. Gemischt (Segmente in mm, Umriss in cm) käme eine Zehnerpotenz
 * heraus, die niemandem auffällt. `geometryResult` (`src/section.ts`) skaliert
 * deshalb BEIDE Figuren mit demselben Faktor, bevor es hier hereinreicht.
 */
export type OutlineFigure = {
  /** Querschnittsfläche der Umrissfigur [L²]. */
  readonly A: number;
  /** `∫z² dA` um den Umriss-Schwerpunkt [L⁴]. */
  readonly Iy: number;
  /** `∫y² dA` um den Umriss-Schwerpunkt [L⁴]. */
  readonly Iz: number;
};

/**
 * Was aus dem Wandweg fällt, IN DER EINHEIT DER SEGMENTE — dieselbe
 * Längeneinheit `L`, in der `Segment` und `OutlineFigure` hereinkamen. Der
 * Wandweg rechnet massstabsfrei; umgerechnet wird an den beiden bekannten
 * Stellen (`geometryResult` nach cm, `toSI` nach SI).
 *
 * `undefined` heisst NICHT ERMITTELT, nach dem Muster von `kappaY?` in
 * `SectionProperties` — nicht „null". Bei zwei Zellen, mehreren unverbundenen
 * Teilen und bei der Entartung (eine gerade Wand trägt für ihre eigene Achse
 * kein `S`) stehen die Zahlen deshalb nicht da, statt falsch dazustehen.
 */
export type WallPath = {
  /** Schubkorrekturbeiwert κ = A_s/A [-]. */
  readonly kappaY?: number;
  readonly kappaZ?: number;
  /** Schubmittelpunkt im EINGABESYSTEM der Segmente [L]. */
  readonly yM?: number;
  readonly zM?: number;
  /** Torsionsträgheitsmoment [L⁴]. */
  readonly It?: number;
  /** Die zyklomatische Zahl des Wandgraphen — `0` oder `1` sind rechenbar. */
  readonly cells: number;
  /** Die Zahl der unverbundenen Teile — nur `1` ist rechenbar. */
  readonly components: number;
  /**
   * Der Restwert von `Sy` beziehungsweise `Sz` am Ende des ganzen Weges.
   *
   * SELBSTPRÜFEND, wie `closingMoment` in `partIntervals`: das erste
   * Flächenmoment um den Schwerpunkt verschwindet, also muss der Weg auf 0
   * schliessen. TEST-ORAKEL UND KEIN LAUFZEITBEFUND — ein Wert daneben hiesse,
   * dass die Zerlegung und nicht die Eingabe kaputt ist.
   */
  readonly closingSy: number;
  readonly closingSz: number;
  /**
   * Der LAUF, an dem die Zelle aufgeschnitten wurde, benannt durch seine
   * kleinste Wand-Id — `undefined` ohne Zelle.
   *
   * TEST-ORAKEL, wie `closingSy`: der Schnitt darf das Ergebnis nicht bewegen,
   * aber er muss REPRODUZIERBAR sein, sonst hinge `S₀` am Zufall der
   * Eingabereihenfolge. Die Wahlregel steht in `circulation`; ein Test hält
   * beides fest — die Wahl selbst und ihre Folgenlosigkeit.
   *
   * DER LAUF UND NICHT DIE WAND: aufgeschnitten wird an einem KNOTEN, nämlich
   * am Anfangsknoten dieses Laufs. Die kleinste Wand-Id ist der Name, unter
   * dem der Lauf in der Wahl antritt — sie benennt ihn richtungsunabhängig.
   */
  readonly cutWallId?: string;
};

/**
 * Der Wandweg über einer bereits positionierten Zerlegung.
 *
 * `undefined` heisst „es gab nichts zu rechnen": kein Segment, oder ein
 * Wandmodell ohne Fläche.
 */
export function wallPath(
  runs: readonly SegmentRun[],
  outline: OutlineFigure,
): WallPath | undefined {
  const branches = runs.map((run) => run.branch);
  const cells = cellCount(branches);
  const components = componentCount(branches);

  const all = runs.flatMap((run) => [...run.segments]);
  const wall = wallMoments(all);
  if (wall === undefined) return undefined;

  // Ab zwei Zellen begänne ein Gleichungssystem, bei mehreren Teilen gäbe es
  // keinen gemeinsamen Weg. Beides meldet das Gate mit Namen.
  if (cells > 1 || components !== 1) {
    return Object.freeze({ cells, components, closingSy: 0, closingSz: 0 });
  }

  const edges = runs.map((run, index) => {
    const [a, b] = branchEnds(run.branch);
    return { index, run, a, b };
  });

  const cycle = cells === 1 ? circulation(edges) : [];
  const steps = traversalOrder(edges, cycle);
  if (steps === undefined) {
    return Object.freeze({ cells, components, closingSy: 0, closingSz: 0 });
  }

  // Zwei Läufe über DIESELBE Geometrie: `Sy` trägt den Hebelarm in `z`, `Sz`
  // den in `y`. Genau deshalb steckt `S` nicht im `Segment` (ADR 0040).
  const forVz = flow(
    steps,
    (s) => s.z - wall.zs,
    (s) => s.dz,
    cells === 1,
  );
  const forVy = flow(
    steps,
    (s) => s.y - wall.ys,
    (s) => s.dy,
    cells === 1,
  );

  return Object.freeze({
    cells,
    components,
    closingSy: forVz.closing,
    closingSz: forVy.closing,
    ...(cycle.length === 0
      ? {}
      : { cutWallId: smallestWallId(atOrThrow(cycle, 0).edge) }),
    // `kappaY` gehört zu `Iz`: die Querkraft in y biegt um z.
    kappaY: kappa(outline.Iz, outline.A, forVy.entries),
    kappaZ: kappa(outline.Iy, outline.A, forVz.entries),
    yM: shearCentre(-1, wall.Iy, forVz.entries),
    zM: shearCentre(+1, wall.Iz, forVy.entries),
    It: torsionConstant(steps, cycle),
  });
}

/** Eine Kante des Lauf-Graphen: ein `SegmentRun` zwischen zwei Knoten-Ids. */
type Edge = {
  readonly index: number;
  readonly run: SegmentRun;
  readonly a: string;
  readonly b: string;
};

/**
 * Die Lage eines Wegstücks zum Zellumlauf: `0` abseits der Zelle, `+1` mit dem
 * festgelegten Umlaufsinn, `−1` gegen ihn.
 *
 * DREI WERTE UND KEINE ZAHL: `sigma` wird multipliziert und aufsummiert, aber
 * ein `2` daraus wäre keine schwächere Aussage, sondern gar keine. Der Typ
 * sagt, was der Wertebereich ist, statt es dem Leser zu überlassen.
 */
type Sigma = -1 | 0 | 1;

/** Das Vorzeichen, mit dem ein Moment auf eine Achse geht. */
type Sign = -1 | 1;

/** Eine Kante mit einer Durchlaufrichtung. */
type Step = {
  readonly edge: Edge;
  readonly forward: boolean;
  readonly from: string;
  readonly to: string;
  /** In Laufrichtung orientiert. */
  readonly segments: readonly Segment[];
  readonly sigma: Sigma;
};

function orientedSegments(edge: Edge, forward: boolean): readonly Segment[] {
  return forward
    ? edge.run.segments
    : [...edge.run.segments].reverse().map(reverseSegment);
}

/**
 * Die kleinste Wand-Id eines Laufs — der Name, unter dem er in einer Auswahl
 * antritt.
 *
 * DIE ID UND NICHT DIE STELLE IM ARRAY: die Reihenfolge, in der jemand seine
 * Wände gezeichnet hat, ist keine Aussage über die Figur. Ein Lauf ohne Wand
 * kann es nach `branches` nicht geben; `''` sortiert dann vor jeder Id, statt
 * einen Sonderfall zu eröffnen.
 */
function smallestWallId(edge: Edge): string {
  return [...edge.run.branch.wallIds].sort().at(0) ?? '';
}

/**
 * Die Auswahl unter mehreren Kanten — IMMER über die Wand-Id.
 *
 * Die eine Stelle, an der der Schnittort und die Fortsetzung entschieden
 * werden. Sie steht hier zusammen, weil beide dieselbe Zusage tragen müssen:
 * gleiche Gestalt, gleiche Wahl, unabhängig davon, in welcher Reihenfolge die
 * Wände hereingekommen sind.
 */
function byWallId(candidates: readonly Edge[]): Edge | undefined {
  let best: Edge | undefined;
  for (const edge of candidates) {
    if (best === undefined || smallestWallId(edge) < smallestWallId(best)) {
      best = edge;
    }
  }
  return best;
}

/**
 * Die Zelle in ihrem Umlaufsinn — im Sinn `signedArea > 0` (ADR 0034).
 *
 * DER SINN WIRD FESTGELEGT UND NICHT GEERBT: die Eingabereihenfolge der Wände
 * darf `A_m` und damit `It` nicht drehen, und `S₀` hinge sonst am Vorzeichen
 * einer Zufälligkeit. Gezählt wird über die Fläche, die die Mittellinie
 * einschliesst.
 *
 * DER ANFANG IST DIE KLEINSTE WAND-ID DER ZELLE, und das ist mehr als
 * „deterministisch": vor dem ersten Schritt hat die Traversierung noch nichts
 * erreicht, alle Zellkanten stehen also gleich — und Gleichstand entscheidet
 * die Wand-Id. Die Stelle im Eingabe-Array täte es NICHT: dieselbe Figur mit
 * gedrehter Wandliste bekäme einen anderen Schnitt, und die Zusage „gleiche
 * Gestalt, gleiche Rechnung" hinge an der Tippreihenfolge. Wo geschnitten
 * wird, ändert das Ergebnis ohnehin nicht; `cutWallId` und ein Test halten
 * beides fest.
 */
function circulation(edges: readonly Edge[]): readonly Step[] {
  const onCycle = cycleEdges(edges);
  const first = byWallId(onCycle);
  if (first === undefined) return [];

  const used = new Set<Edge>([first]);
  const order: { edge: Edge; forward: boolean }[] = [
    { edge: first, forward: true },
  ];
  let at = first.b;

  while (order.length < onCycle.length) {
    const next = byWallId(
      onCycle.filter(
        (edge) => !used.has(edge) && (edge.a === at || edge.b === at),
      ),
    );
    // Die Zelle ist ein geschlossener Umlauf; eine Kante ohne Fortsetzung wäre
    // ein Bruch der Zellzählung und keine Eingabe, über die zu urteilen wäre.
    if (next === undefined) return [];
    const forward = next.a === at;
    order.push({ edge: next, forward });
    used.add(next);
    at = forward ? next.b : next.a;
  }

  const forward = order.map(({ edge, forward: f }) => asStep(edge, f, +1));
  const points = forward.flatMap((step) =>
    step.segments.map(({ y, z }) => ({ y, z })),
  );
  if (Polygon.signedArea(points) >= 0) return forward;

  // Verkehrt herum: dieselbe Kette rückwärts, damit die erste Kante die erste
  // bleibt und der Schnittort davon unberührt ist.
  const head = atOrThrow(order, 0);
  return [head, ...order.slice(1).reverse()].map(({ edge, forward: f }) =>
    asStep(edge, !f, +1),
  );
}

function asStep(edge: Edge, forward: boolean, sigma: Sigma): Step {
  return {
    edge,
    forward,
    from: forward ? edge.a : edge.b,
    to: forward ? edge.b : edge.a,
    segments: orientedSegments(edge, forward),
    sigma,
  };
}

/**
 * Die Kanten, die nach dem Abschälen aller freien Enden übrig bleiben — die
 * Zelle.
 */
function cycleEdges(edges: readonly Edge[]): readonly Edge[] {
  const degree = new Map<string, number>();
  const bump = (id: string, by: number): void => {
    degree.set(id, (degree.get(id) ?? 0) + by);
  };
  for (const edge of edges) {
    bump(edge.a, 1);
    bump(edge.b, 1);
  }

  const alive = new Set(edges);
  let peeled = true;
  while (peeled) {
    peeled = false;
    for (const edge of [...alive]) {
      if (degree.get(edge.a) !== 1 && degree.get(edge.b) !== 1) continue;
      alive.delete(edge);
      bump(edge.a, -1);
      bump(edge.b, -1);
      peeled = true;
    }
  }

  return edges.filter((edge) => alive.has(edge));
}

/**
 * Die Reihenfolge, in der der Weg gelaufen wird — von den freien Enden nach
 * innen.
 *
 * DIE ORDNUNG IST DIE AUSSAGE: eine Kante wird erst verlassen, wenn an ihrem
 * Startknoten alles ANDERE schon angekommen ist. Nur dann ist `S` dort die
 * Summe der ankommenden Flüsse, und am freien Ende ist sie 0 — die
 * Randbedingung der offenen Theorie, ohne Sonderfall.
 *
 * DIE ZELLE WIRD AUFGESCHNITTEN, indem ihr Anfangsknoten VERDOPPELT wird: die
 * erste Zellkante hängt danach an einem Knoten mit Grad 1, also an einem
 * freien Ende mit `S = 0`. Aus der Zelle wird damit ein Baum, und was der
 * Schnitt weggenommen hat, gibt `S₀` zurück.
 *
 * `undefined`, wenn nicht jede Kante erreicht wird — dann war es kein Baum,
 * und das ist ein Bruch der Zellzählung.
 */
function traversalOrder(
  edges: readonly Edge[],
  cycle: readonly Step[],
): readonly Step[] | undefined {
  const ends = new Map<Edge, readonly [string, string]>(
    edges.map((edge) => [edge, [edge.a, edge.b] as const]),
  );

  const cut = cycle.at(0);
  if (cut !== undefined) {
    const alias = freshId(cut.from, edges);
    ends.set(cut.edge, cut.forward ? [alias, cut.edge.b] : [cut.edge.a, alias]);
  }

  const incident = new Map<string, Edge[]>();
  const remaining = new Map<string, number>();
  for (const edge of edges) {
    for (const id of ends.get(edge) ?? []) {
      const at = incident.get(id) ?? [];
      at.push(edge);
      incident.set(id, at);
      remaining.set(id, (remaining.get(id) ?? 0) + 1);
    }
  }

  const sigmaOf = new Map<Edge, boolean>(
    cycle.map((step) => [step.edge, step.forward]),
  );

  const processed = new Set<Edge>();
  const order: Step[] = [];
  const queue = [...remaining.keys()].filter((id) => remaining.get(id) === 1);

  while (queue.length > 0) {
    const from = queue.shift();
    if (from === undefined) break;
    if (remaining.get(from) !== 1) continue;

    const edge = (incident.get(from) ?? []).find((it) => !processed.has(it));
    if (edge === undefined) continue;
    processed.add(edge);

    const [a, b] = ends.get(edge) ?? ([edge.a, edge.b] as const);
    const forward = a === from;
    const to = forward ? b : a;

    const circulationForward = sigmaOf.get(edge);
    order.push({
      edge,
      forward,
      from,
      to,
      segments: orientedSegments(edge, forward),
      sigma:
        circulationForward === undefined
          ? 0
          : circulationForward === forward
            ? +1
            : -1,
    });

    remaining.set(from, 0);
    remaining.set(to, (remaining.get(to) ?? 1) - 1);
    if (remaining.get(to) === 1) queue.push(to);
  }

  return order.length === edges.length ? order : undefined;
}

/** Eine Knoten-Id, die es im Graphen nicht gibt — der Zwilling des Schnitts. */
function freshId(base: string, edges: readonly Edge[]): string {
  const taken = new Set(edges.flatMap((edge) => [edge.a, edge.b]));
  let id = `${base}#cut`;
  while (taken.has(id)) id += '#';
  return id;
}

/** Ein Stück Weg mit allem, was die drei Grössen davon brauchen. */
type Entry = {
  readonly interval: ShearFlowInterval;
  /**
   * Der Hebelarm der Wandtangente um den URSPRUNG, `r = y·dz − z·dy`.
   *
   * Auf einem GERADEN Stück ist er konstant — `(p + s·u) × u = p × u` —, und
   * genau deshalb ist `∫S·r ds` hier `r · ∫S ds` und keine zweite Quadratur.
   * Positiv dreht von `+y` nach `+z` (ADR 0031).
   */
  readonly r: number;
  readonly sigma: Sigma;
};

/**
 * Der Schubflussweg für EINE Richtung, samt Zellkorrektur.
 *
 * `arm` ist der Abstand zur Schwerpunktachse des WANDMODELLS, `slope` seine
 * Änderung längs des Stücks. Damit ist `S(s) = c0 + c1·s + c2·s²` mit
 * `c1 = t·arm` und `c2 = t·slope/2` — dieselbe Herleitung, die
 * `partIntervals` und `crossWallInterval` für die parametrischen Formen
 * schreiben, nur aus der Lage statt aus einer Teilflächenfolge.
 */
function flow(
  steps: readonly Step[],
  arm: (segment: Segment) => number,
  slope: (segment: Segment) => number,
  hasCell: boolean,
): { entries: readonly Entry[]; closing: number } {
  const arrived = new Map<string, number>();
  const entries: Entry[] = [];
  let closing = 0;

  for (const step of steps) {
    let S = arrived.get(step.from) ?? 0;
    for (const segment of step.segments) {
      const interval: ShearFlowInterval = {
        length: segment.length,
        t: segment.t,
        c0: S,
        c1: segment.t * arm(segment),
        c2: (segment.t * slope(segment)) / 2,
      };
      entries.push({
        interval,
        r: segment.y * segment.dz - segment.z * segment.dy,
        sigma: step.sigma,
      });
      S = endMoment(interval);
    }
    closing = (arrived.get(step.to) ?? 0) + S;
    arrived.set(step.to, closing);
  }

  return hasCell
    ? { entries: withCellFlow(entries), closing }
    : { entries, closing };
}

/**
 * Der Zuschlag `S₀` der einen Zelle — die skalare Verträglichkeit.
 *
 * `∮ q/(G·t) ds = 0` um die Zelle, und weil `q ∝ S` ist, heisst das
 * `∮ S/t ds = 0`. Gemessen wird im Umlaufsinn, deshalb `sigma`.
 */
function withCellFlow(entries: readonly Entry[]): readonly Entry[] {
  let numerator = 0;
  let denominator = 0;
  for (const { interval, sigma } of entries) {
    if (sigma === 0) continue;
    numerator += (sigma * flowIntegral(interval)) / interval.t;
    denominator += interval.length / interval.t;
  }
  if (!(Number.isFinite(denominator) && denominator > 0)) return entries;

  const S0 = -numerator / denominator;
  return entries.map((entry) =>
    entry.sigma === 0
      ? entry
      : {
          ...entry,
          interval: {
            ...entry.interval,
            c0: entry.interval.c0 + entry.sigma * S0,
          },
        },
  );
}

/** `∫₀^L (c0 + c1·s + c2·s²) ds`, geschlossen. */
function flowIntegral(interval: ShearFlowInterval): number {
  const { length: L, c0, c1, c2 } = interval;
  return c0 * L + (c1 * L * L) / 2 + (c2 * L * L * L) / 3;
}

/**
 * κ aus dem Weg und der UMRISSFIGUR — oder `undefined` bei der Entartung.
 *
 * DIE ENTARTUNG IST ECHT und keine Vorsicht: eine einzelne gerade Wand trägt
 * für die Achse LÄNGS ihrer selbst kein `S` — der Hebelarm ist überall 0, das
 * Integral ebenfalls, und `I²/0` wäre `Infinity`. `sectionProperties` liegt auf
 * der Rechenstrecke, also wird hier weder geworfen noch ein `Infinity`
 * weitergereicht; „nicht ermittelt" ist die richtige Auskunft.
 */
function kappa(
  I: number,
  A: number,
  entries: readonly Entry[],
): number | undefined {
  let denominator = 0;
  for (const { interval } of entries) {
    denominator += shearFlowIntegral(interval);
  }
  if (!(Number.isFinite(denominator) && denominator > 0)) return undefined;
  if (!(Number.isFinite(I) && Number.isFinite(A) && A > 0)) return undefined;

  const value =
    shearArea(
      I,
      entries.map((entry) => entry.interval),
    ) / A;
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Der Schubmittelpunkt aus dem Moment des Schubflusses — beide Figuren aus dem
 * WANDMODELL (ADR 0041).
 *
 * `T = ∮ q·r ds` um den Ursprung, mit `q = −V·S/I`. Für `Vz` ist das Moment
 * `yM·Vz`, für `Vy` ist es `−zM·Vy` — daher die beiden Vorzeichen, und deshalb
 * steht `sign` als Parameter da statt als zweite Funktion.
 *
 * DAS ERGEBNIS LIEGT IM EINGABESYSTEM, weil `r` um dessen Ursprung gemessen
 * wird — die Invariante aus ADR 0031: `yM`/`zM` teilen das System von
 * `ys`/`zs`.
 */
function shearCentre(
  sign: Sign,
  I: number,
  entries: readonly Entry[],
): number | undefined {
  if (!(Number.isFinite(I) && I > 0)) return undefined;

  let moment = 0;
  for (const { interval, r } of entries) moment += r * flowIntegral(interval);

  const value = (sign * moment) / I;
  return Number.isFinite(value) ? value : undefined;
}

/**
 * `It = 4·A_m²/∮(ds/t) + ⅓·Σ_offen l·t³`.
 *
 * BREDT FÜR DIE ZELLE, `⅓·l·t³` FÜR DIE OFFENEN ZWEIGE, und der zweite Term
 * läuft AUSDRÜCKLICH nur über die Stücke ausserhalb der Zelle: die
 * Zellwandungen tragen ihren Anteil bereits über den geschlossenen Umlauf, und
 * ihn zweimal zu zählen wäre zwischen den beiden Termen ein Faktor von drei
 * Zehnerpotenzen.
 *
 * `A_m` ist die von der MITTELLINIE eingeschlossene Fläche, im festgelegten
 * Umlaufsinn und deshalb positiv.
 */
function torsionConstant(
  steps: readonly Step[],
  cycle: readonly Step[],
): number | undefined {
  let open = 0;
  for (const step of steps) {
    if (step.sigma !== 0) continue;
    for (const { length, t } of step.segments) open += (length * t ** 3) / 3;
  }
  if (!Number.isFinite(open)) return undefined;
  if (cycle.length === 0) return open;

  // `cycle` steht bereits im festgelegten Umlaufsinn — die Reihenfolge des
  // Baumdurchlaufs ist eine andere und taugt für `A_m` nicht.
  let lengthOverT = 0;
  const points: { y: number; z: number }[] = [];
  for (const step of cycle) {
    for (const segment of step.segments) {
      lengthOverT += segment.length / segment.t;
      points.push({ y: segment.y, z: segment.z });
    }
  }

  const Am = Math.abs(Polygon.signedArea(points));
  if (!(Number.isFinite(Am) && Am > 0)) return undefined;
  if (!(Number.isFinite(lengthOverT) && lengthOverT > 0)) return undefined;

  const value = (4 * Am * Am) / lengthOverT + open;
  return Number.isFinite(value) ? value : undefined;
}
