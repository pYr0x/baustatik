/**
 * Ist der abgeleitete Umriss ein zulässiger PSLG? — die offene Frage aus dem
 * FE-Vorhaben, an der Figur beantwortet, die beide Mechanismen trägt.
 *
 * DAS DREIECK MIT DER SPITZE NACH UNTEN ist der Satz, der als einziger BEIDE
 * Miter-Wege gleichzeitig läuft: an den zwei Bodenecken springt die Dicke
 * (`20` gegen `10`), also füllt `jointFills` die Naht mit einem eigenen
 * `delta: 0`-Ring ([ADR 0038](../../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md));
 * an der Spitze ist die Dicke gleich, also mitert Clipper2 selbst. Die beiden
 * Kappungen liegen bei VERSCHIEDENEN Schranken, und deshalb kreuzt ein Sweep
 * über `miterLimit` sie nacheinander.
 *
 * WARUM DIE REGELN HIER NOCHMAL STEHEN und der Mesher nicht gefragt wird:
 * `cross-section` hängt nicht an `@baustatik/mesh-2d-wasm`
 * ([ADR 0046](../../../docs/adr/0046-the-solid-section-fe-lives-in-cross-section.md),
 * [ADR 0009](../../../docs/adr/0009-fem-solver-ports-and-async-solve.md)), und
 * ein echter Triangle-Lauf zöge die Emscripten-Toolchain in diese Testsuite.
 * `pslgProblems` schreibt deshalb die Aufnahmebedingungen nach, die
 * `validateRing` und `validateRingRelations` in `mesh-2d-wasm/src/index.ts`
 * stellen — MIT deren Härte: eine Berührung zählt wie ein Schnitt, und eine
 * Nullkante wird auf EXAKTE Gleichheit geprüft, nicht mit Toleranz.
 *
 * DASS DAS EINE ABSCHRIFT IST, ist der Preis der Package-Grenze und der Grund,
 * warum die Meldungen wörtlich die des Meshers sind: wer sie dort ändert,
 * findet sie hier.
 */

import { describe, expect, it } from 'vitest';
import { chainedJoints, deriveOutlineFromWalls } from '../src/derive-outline';
import { createSectionPolicy } from '../src/policy';
import type { Polygon } from '../src/types';
import { node, wall } from './helpers';

/** Mittellinienmaße des Dreiecks [mm] — Basis oben, Spitze unten (`z` zeigt nach unten). */
const B = 200;
const H = 200;
/** Der Gurt ist doppelt so dick wie die Schenkel: genau das erzwingt die Füllringe. */
const T_GURT = 20;
const T_SCHENKEL = 10;

const NODES = [
  node('ecke-links', -B / 2, 0),
  node('ecke-rechts', B / 2, 0),
  node('spitze', 0, H),
];
const WALLS = [
  wall('gurt-oben', 'ecke-links', 'ecke-rechts', T_GURT),
  wall('schenkel-rechts', 'ecke-rechts', 'spitze', T_SCHENKEL),
  wall('schenkel-links', 'spitze', 'ecke-links', T_SCHENKEL),
];

/**
 * Wie weit der ungekappte Spitz heraussteht, in Vielfachen der halben DICKEREN
 * Wand [-] — geschlossen und nicht aus einem Lauf abgeschrieben.
 *
 * Der Miterpunkt `M` hat von beiden Wandachsen den Abstand der jeweiligen
 * halben Dicke. Mit `p = M − N` in der Basis der beiden abgehenden Tangenten
 * folgt `p = (b·dA + a·dB)/sin α` und daraus die Länge unten. Bei GLEICHER
 * Dicke fällt sie auf das bekannte `1/sin(α/2)` zusammen — der Grund, warum
 * `ChainedJoint.overshoot` gemessen und nicht gerechnet wird (ADR 0038).
 */
function overshoot(alpha: number, tA: number, tB: number): number {
  const a = tA / 2;
  const b = tB / 2;
  const reach =
    Math.sqrt(a * a + b * b + 2 * a * b * Math.cos(alpha)) / Math.sin(alpha);
  return reach / Math.max(a, b);
}

/** Der Innenwinkel an einer Bodenecke [rad] — Gurt waagerecht gegen den Schenkel. */
const ALPHA_ECKE = Math.atan2(H, B / 2);
/** Der Innenwinkel an der Spitze [rad]. */
const ALPHA_SPITZE = 2 * Math.atan2(B / 2, H);

const OVERSHOOT_ECKE = overshoot(ALPHA_ECKE, T_GURT, T_SCHENKEL);
const OVERSHOOT_SPITZE = overshoot(ALPHA_SPITZE, T_SCHENKEL, T_SCHENKEL);

/**
 * Das Rechenraster von Clipper2 [mm]: `OFFSET_PRECISION = 6` in
 * `@baustatik/geometry-2d`, also `10^-6 mm`.
 *
 * NICHT IMPORTIERT, weil die Konstante dort ausdrücklich intern ist. Sie steht
 * hier als das, was sie in diesem Test ist: die kleinste Länge, die im Ergebnis
 * überhaupt vorkommen KANN.
 */
const RASTER = 1e-6;

const outlineAt = (miterLimit: number) =>
  deriveOutlineFromWalls(NODES, WALLS, createSectionPolicy({ miterLimit }));

// ---------------------------------------------------------------------------
// Die Aufnahmebedingungen des Meshers, nachgeschrieben.
// ---------------------------------------------------------------------------

type P = { readonly y: number; readonly z: number };

/** Alles, woran `mesh-2d-wasm` diesen Umriss zurückwiese — leer heißt vernetzbar. */
function pslgProblems(outline: readonly Polygon[]): string[] {
  const problems: string[] = [];
  const rings = outline.map((polygon) => polygon.points);

  rings.forEach((points, index) => {
    if (points.length < 3) {
      problems.push(`Ring ${index} braucht mindestens drei Koordinatenpaare.`);
      return;
    }
    if (points.some((p) => !Number.isFinite(p.y) || !Number.isFinite(p.z))) {
      problems.push(`Ring ${index} enthält keine endliche Koordinate.`);
    }
    // EXAKTE Gleichheit, wie `samePoint` im Mesher: ein Splitter von
    // Rastergröße ist dort KEINE Nullkante und läuft in Triangle hinein.
    if (points.some((p, at) => same(p, points[(at + 1) % points.length]))) {
      problems.push(`Ring ${index} enthält eine Nullkante.`);
    }
    const area = signedArea(points);
    if (!Number.isFinite(area) || area === 0) {
      problems.push(`Ring ${index} hat keine endliche Fläche.`);
    }
    if (selfIntersects(points)) {
      problems.push(`Ring ${index} schneidet sich selbst.`);
    }
  });

  for (let first = 0; first < rings.length; first++) {
    for (let second = first + 1; second < rings.length; second++) {
      if (ringsTouch(rings[first] ?? [], rings[second] ?? [])) {
        problems.push(
          `Ring ${first} und Ring ${second} schneiden oder berühren sich.`,
        );
      }
    }
  }

  return problems;
}

const same = (a: P | undefined, b: P | undefined) =>
  a !== undefined && b !== undefined && a.y === b.y && a.z === b.z;

function signedArea(points: readonly P[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    twice += a.y * b.z - b.y * a.z;
  }
  return twice / 2;
}

function selfIntersects(points: readonly P[]): boolean {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Benachbarte Kanten teilen sich einen Endpunkt und zählen nicht.
      if ((i + 1) % n === j || (j + 1) % n === i) continue;
      if (
        cross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])
      ) {
        return true;
      }
    }
  }
  return false;
}

function ringsTouch(a: readonly P[], b: readonly P[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (cross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) {
        return true;
      }
    }
  }
  return false;
}

/** Schnitt ODER Berührung zweier Strecken — die Härte des Meshers. */
function cross(
  a: P | undefined,
  b: P | undefined,
  c: P | undefined,
  d: P | undefined,
): boolean {
  if (a === undefined || b === undefined || c === undefined || d === undefined)
    return false;
  const abc = orientation(a, b, c);
  const abd = orientation(a, b, d);
  const cda = orientation(c, d, a);
  const cdb = orientation(c, d, b);
  return (
    (abc === 0 && onSegment(a, b, c)) ||
    (abd === 0 && onSegment(a, b, d)) ||
    (cda === 0 && onSegment(c, d, a)) ||
    (cdb === 0 && onSegment(c, d, b)) ||
    (abc > 0 !== abd > 0 && cda > 0 !== cdb > 0)
  );
}

const orientation = (a: P, b: P, c: P) =>
  Math.sign((b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y));

const onSegment = (a: P, b: P, c: P) =>
  c.y >= Math.min(a.y, b.y) &&
  c.y <= Math.max(a.y, b.y) &&
  c.z >= Math.min(a.z, b.z) &&
  c.z <= Math.max(a.z, b.z);

/** Die kürzeste Kante über alle Ringe [mm] — das Maß für einen Splitter. */
function shortestEdge(outline: readonly Polygon[]): number {
  let min = Infinity;
  for (const { points } of outline) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (a === undefined || b === undefined) continue;
      min = Math.min(min, Math.hypot(b.y - a.y, b.z - a.z));
    }
  }
  return min;
}

// ---------------------------------------------------------------------------

describe('Die Figur trägt wirklich beide Miter-Wege', () => {
  it('kappt an den Bodenecken über den Füllring, an der Spitze über Clipper2', () => {
    const joints = chainedJoints(NODES, WALLS);
    expect(joints).toHaveLength(3);

    const spitze = joints.find((joint) => joint.nodeId === 'spitze');
    const ecke = joints.find((joint) => joint.nodeId === 'ecke-rechts');

    // Gleiche Dicke an der Spitze: Clipper2 mitert selbst, `1/sin(α/2)`.
    expect(spitze?.alpha).toBeCloseTo(ALPHA_SPITZE, 12);
    expect(spitze?.overshoot).toBeCloseTo(1 / Math.sin(ALPHA_SPITZE / 2), 12);
    expect(OVERSHOOT_SPITZE).toBeCloseTo(1 / Math.sin(ALPHA_SPITZE / 2), 12);

    // Dickensprung an der Ecke: der Füllring von ADR 0038, und der Überstand
    // ist NICHT `1/sin(α/2)` — daran hängt, dass es zwei Schranken sind.
    expect(ecke?.alpha).toBeCloseTo(ALPHA_ECKE, 12);
    expect(ecke?.overshoot).toBeCloseTo(OVERSHOOT_ECKE, 12);
    expect(OVERSHOOT_ECKE).not.toBeCloseTo(1 / Math.sin(ALPHA_ECKE / 2), 3);

    // Zwei getrennte Schranken, sonst prüfte der Sweep unten nur eine.
    expect(OVERSHOOT_ECKE).toBeLessThan(OVERSHOOT_SPITZE);
  });
});

describe('Der abgeleitete Umriss ist ein zulässiger PSLG', () => {
  it('unter der Voreinstellung — gekappte Spitze, Loch getrennt', () => {
    const outline = outlineAt(2);

    expect(pslgProblems(outline)).toEqual([]);
    // Ein Materialring und ein Loch: die Figur ist hohl.
    expect(outline).toHaveLength(2);
    expect(signedArea(outline[0]?.points ?? [])).toBeGreaterThan(0);
    expect(signedArea(outline[1]?.points ?? [])).toBeLessThan(0);
  });

  it('mit ausgebildeter Spitze (miterLimit 2,5) — und die Spitze steht wirklich', () => {
    const cut = outlineAt(2);
    const sharp = outlineAt(2.5);

    expect(pslgProblems(sharp)).toEqual([]);

    // Der Beweis, dass die beiden Läufe verschiedene Figuren sind und der Test
    // nicht zweimal dasselbe prüft: gekappt steht eine kurze Querkante, sonst
    // ein einzelner Punkt auf der Symmetrieachse.
    const deepest = (outline: readonly Polygon[]) =>
      Math.max(...(outline[0]?.points ?? []).map((p) => p.z));
    expect(deepest(sharp)).toBeGreaterThan(deepest(cut));
    expect(
      (sharp[0]?.points ?? []).filter((p) => p.z === deepest(sharp)),
    ).toHaveLength(1);
    expect(
      (cut[0]?.points ?? []).filter((p) => p.z === deepest(cut)),
    ).toHaveLength(2);

    // Die ausgebildete Spitze liegt dort, wo die beiden Außenkanten sich
    // treffen: `t/2 / sin(α/2)` unter dem Knoten.
    expect(deepest(sharp)).toBeCloseTo(
      H + T_SCHENKEL / 2 / Math.sin(ALPHA_SPITZE / 2),
      6,
    );
  });

  it('an JEDER Miter-Schranke zwischen 1,01 und 10', () => {
    // Beide Kappungsschwellen werden gekreuzt, und zwar auch dicht daneben:
    // dort laufen `cutA` und `cutB` des Füllrings auf den Miterpunkt zu.
    const limits = [1.01, 1.2, 1.5, 2, 2.5, 3, 5, 10];
    for (const threshold of [OVERSHOOT_ECKE, OVERSHOOT_SPITZE]) {
      for (const step of [1e-1, 1e-3, 1e-5, 1e-7, 0]) {
        limits.push(threshold - step, threshold + step);
      }
    }

    for (const miterLimit of limits.filter((value) => value > 1)) {
      expect(pslgProblems(outlineAt(miterLimit)), `miterLimit ${miterLimit}`)
        .toEqual([]);
    }
  });
});

describe('Keine Fase unter der Auflösung — der Splitter am Füllring', () => {
  /**
   * DAS WAR DER EINE BEFUND, und er ist behoben.
   *
   * Dicht UNTER der Kappungsschwelle liegen `cutA` und `cutB` beliebig nah am
   * Miterpunkt — die Fase, die `fillRing` setzt, wurde beliebig schmal. Sie
   * verschwand dabei nicht: Clipper2 rundet auf `10^-6 mm`, also blieb eine
   * Kante von genau einem Rasterschritt stehen. Für den Mesher ist das
   * ZULÄSSIG (`samePoint` prüft auf exakte Gleichheit) und trotzdem übel —
   * neben Kanten von `200 mm` stand eine von `10^-6 mm`.
   *
   * `fillRing` setzt die Fase jetzt nur noch, wenn sie mindestens
   * `discretisationTolerance` breit ist, und lässt sonst den vollen Miter stehen.
   */
  it('hält jede Kante über `discretisationTolerance`, auch dicht an der Schwelle', () => {
    const discretisationTolerance = createSectionPolicy().discretisationTolerance;

    let worst = Infinity;
    let at = NaN;
    // Von unten an die Schwelle heran: oberhalb steht ohnehin der volle Miter.
    for (let k = 1; k <= 80; k++) {
      const miterLimit = OVERSHOOT_ECKE - 10 ** (-k / 5);
      if (miterLimit <= 1) continue;
      const shortest = shortestEdge(outlineAt(miterLimit));
      if (shortest < worst) {
        worst = shortest;
        at = miterLimit;
      }
    }

    expect(pslgProblems(outlineAt(at))).toEqual([]);
    // Vor dem Fix stand hier eine Rasterdiagonale.
    expect(worst).toBeGreaterThan(RASTER * 1e4);
    expect(worst).toBeGreaterThanOrEqual(discretisationTolerance);
  });

  it('auch über den ganzen Bereich, nicht nur an dieser einen Schwelle', () => {
    const discretisationTolerance = createSectionPolicy().discretisationTolerance;

    for (let k = 0; k <= 600; k++) {
      const miterLimit = 1.001 + (k * (10 - 1.001)) / 600;
      expect(
        shortestEdge(outlineAt(miterLimit)),
        `miterLimit ${miterLimit}`,
      ).toBeGreaterThanOrEqual(discretisationTolerance);
    }
  });

  it('bezahlt das mit weniger als `discretisationTolerance` Überstand', () => {
    // Im Schnappfenster steht der volle Miter, obwohl `miterLimit` kappen
    // wollte. Der Spitz reicht dann weiter heraus als erlaubt — aber nur um
    // die Höhe der weggelassenen Fase, und die liegt unter der Toleranz, mit
    // der derselbe Umriss ohnehin diskretisiert wird.
    const discretisationTolerance = createSectionPolicy().discretisationTolerance;
    const delta = T_GURT / 2;
    const reach = OVERSHOOT_ECKE * delta;

    // Die kleinste Schranke, bei der noch der volle Miter steht: darunter ist
    // die Fase breit genug und wird gesetzt.
    let snapped = OVERSHOOT_ECKE;
    for (let k = 0; k <= 4000; k++) {
      const miterLimit = OVERSHOOT_ECKE - (k * 0.05) / 4000;
      if (miterLimit <= 1) break;
      // Elf Punkte heißt: volle Spitze am Gurtstoß, keine Fase.
      if ((outlineAt(miterLimit)[0]?.points ?? []).length > 8) break;
      snapped = miterLimit;
    }

    expect(reach - snapped * delta).toBeLessThan(discretisationTolerance);
    expect(reach - snapped * delta).toBeGreaterThan(0);
  });

  it('tritt an der Spitze NICHT auf: Clipper2 kappt mit fester Fase', () => {
    // Clipper2 setzt intern ein Quadrat und keine schrumpfende Fase. Die
    // gekappte Kante ist deshalb bei JEDEM `miterLimit` unter der Schwelle
    // gleich lang — sie hängt an `t` und `α`, nicht an der Schranke.
    const lengths = [1.5, 1.8, 2, 2.2, OVERSHOOT_SPITZE - 1e-9].map(
      (miterLimit) => {
        const points = outlineAt(miterLimit)[0]?.points ?? [];
        const deepest = Math.max(...points.map((p) => p.z));
        const tip = points.filter((p) => p.z === deepest);
        expect(tip).toHaveLength(2);
        return Math.abs((tip[1]?.y ?? 0) - (tip[0]?.y ?? 0));
      },
    );

    for (const length of lengths) {
      expect(length).toBeCloseTo(lengths[0] ?? 0, 9);
      expect(length).toBeGreaterThan(1);
    }
  });
});
