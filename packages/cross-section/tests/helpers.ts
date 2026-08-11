/**
 * Die Figuren, aus denen die Wandgraph-Tests gebaut sind — EINMAL.
 *
 * Drei Testdateien lesen dieselbe Zerlegung: `branch.test.ts` zählt Läufe,
 * Zellen und Teile, `segment.test.ts` prüft die Lage der Stücke,
 * `wall-path.test.ts` rechnet κ, den Schubmittelpunkt und `It` darüber. Stünden
 * die Knoten und Wände dreimal da, hiesse eine Änderung an der Figur drei
 * Änderungen — und zwei davon vergisst man.
 *
 * ALLE MASSE IN MILLIMETERN, wie die Eingabe des Editors (`SectionNode`,
 * `Wall.t`). Die Figuren sind PARAMETRISCH und tragen keine festen Zahlen: die
 * Abmessung gehört in den Test, der sie gegen ein Orakel hält.
 */

import type { SectionNode, Wall } from '../src/types';

export const node = (id: string, y: number, z: number): SectionNode => ({
  id,
  y,
  z,
});

export const wall = (
  id: string,
  startNodeId: string,
  endNodeId: string,
  t = 8,
  bulge?: number,
): Wall => ({
  id,
  startNodeId,
  endNodeId,
  t,
  ...(bulge === undefined ? {} : { bulge }),
});

/** Knoten und Wände einer Figur — die Eingabe von `createSectionGeometry`. */
export type WallFigure = {
  readonly nodes: readonly SectionNode[];
  readonly walls: readonly Wall[];
};

/**
 * Ein doppeltsymmetrisches I als Wandgraph — `z = 0` an der Oberkante, wie bei
 * der parametrischen Form.
 *
 * Die Gurte sind an der Stegmittellinie GETEILT, damit der Steg an einem
 * Knoten ankommt und nicht mitten in einer Wand: der Verzweigungsknoten ist
 * das, woran ein Lauf endet.
 */
export function iGraph(h: number, b: number, tw: number, tf: number) {
  const zTop = tf / 2;
  const zBottom = h - tf / 2;
  return {
    nodes: [
      node('lt', -b / 2, zTop),
      node('mt', 0, zTop),
      node('rt', b / 2, zTop),
      node('lb', -b / 2, zBottom),
      node('mb', 0, zBottom),
      node('rb', b / 2, zBottom),
    ],
    walls: [
      wall('gurt-oben-links', 'lt', 'mt', tf),
      wall('gurt-oben-rechts', 'mt', 'rt', tf),
      wall('steg', 'mt', 'mb', tw),
      wall('gurt-unten-links', 'lb', 'mb', tf),
      wall('gurt-unten-rechts', 'mb', 'rb', tf),
    ],
  } satisfies WallFigure;
}

/** Ein T als Wandgraph — Gurtmittellinie bei `z = hf/2`. */
export function tGraph(bf: number, hf: number, bw: number, h: number) {
  return {
    nodes: [
      node('fl', -bf / 2, hf / 2),
      node('fm', 0, hf / 2),
      node('fr', bf / 2, hf / 2),
      node('wb', 0, h),
    ],
    walls: [
      wall('gurt-links', 'fl', 'fm', hf),
      wall('gurt-rechts', 'fm', 'fr', hf),
      wall('steg', 'fm', 'wb', bw),
    ],
  } satisfies WallFigure;
}

/**
 * Ein U als Wandgraph — der Steg auf `y = 0`, beide Gurte nach `+y`.
 *
 * Die Figur mit der Handformel `e = b²h²tf/(4·Iy)` für den Schubmittelpunkt;
 * `b` und `h` sind MITTELLINIENMASSE.
 */
export function uGraph(b: number, h: number, tf: number, tw: number) {
  return {
    nodes: [
      node('ot', 0, 0),
      node('og', b, 0),
      node('ut', 0, h),
      node('ug', b, h),
    ],
    walls: [
      wall('gurt-oben', 'ot', 'og', tf),
      wall('steg', 'ot', 'ut', tw),
      wall('gurt-unten', 'ut', 'ug', tf),
    ],
  } satisfies WallFigure;
}

/**
 * Der geschlossene Kasten als Wandgraph — Mittellinie `(b−t)×(h−t)`, `z = 0`
 * an der Oberkante.
 */
export function boxGraph(b: number, h: number, t: number) {
  const y = (b - t) / 2;
  return {
    nodes: [
      node('a', -y, t / 2),
      node('b', y, t / 2),
      node('c', y, h - t / 2),
      node('d', -y, h - t / 2),
    ],
    walls: [
      wall('oben', 'a', 'b', t),
      wall('rechts', 'b', 'c', t),
      wall('unten', 'c', 'd', t),
      wall('links', 'd', 'a', t),
    ],
  } satisfies WallFigure;
}

/**
 * Derselbe Kasten mit MITTELSTEG — zwei Zellen, also die Schranke des
 * Wandwegs: ab hier sind es `n` gekoppelte Unbekannte statt einer skalaren
 * Verträglichkeit (P6).
 */
export function twoCellGraph(b: number, h: number, t: number) {
  const y = (b - t) / 2;
  const zTop = t / 2;
  const zBottom = h - t / 2;
  return {
    nodes: [
      node('a', -y, zTop),
      node('m1', 0, zTop),
      node('b', y, zTop),
      node('c', y, zBottom),
      node('m2', 0, zBottom),
      node('d', -y, zBottom),
    ],
    walls: [
      wall('o1', 'a', 'm1', t),
      wall('o2', 'm1', 'b', t),
      wall('rechts', 'b', 'c', t),
      wall('u1', 'c', 'm2', t),
      wall('u2', 'm2', 'd', t),
      wall('links', 'd', 'a', t),
      wall('mitte', 'm1', 'm2', t),
    ],
  } satisfies WallFigure;
}

/**
 * Eine Zelle aus ZWEI LÄUFEN: derselbe Kasten, aber mit je einem Zweig an zwei
 * gegenüberliegenden Ecken.
 *
 * Die Zweige machen `b` und `d` zu Verzweigungsknoten, und damit zerfällt der
 * eine geschlossene Umlauf in zwei Läufe zwischen ihnen. Erst hier gibt es beim
 * Aufschneiden ÜBERHAUPT ETWAS ZU WÄHLEN — am blanken Kasten ist der Umlauf ein
 * einziger Lauf, und die Wahl ist keine.
 */
export function twoRunCellGraph(
  b: number,
  h: number,
  t: number,
  stub: number,
) {
  const box = boxGraph(b, h, t);
  const y = (b - t) / 2;
  return {
    nodes: [
      ...box.nodes,
      node('e', y + stub, t / 2),
      node('f', -y - stub, h - t / 2),
    ],
    walls: [
      ...box.walls,
      wall('zweig-oben', 'b', 'e', t),
      wall('zweig-unten', 'd', 'f', t),
    ],
  } satisfies WallFigure;
}

/**
 * Zwei Wände, die einander nicht berühren — der unverbundene Wandgraph.
 *
 * Auch er hat keinen gemeinsamen Weg: `S` läuft je Teil von einem freien Ende
 * los, und welcher Teil welchen Anteil der Querkraft trägt, sagt die
 * dünnwandige Theorie nicht.
 */
export function disconnectedGraph(b: number, h: number, t = 8) {
  return {
    nodes: [
      node('a', 0, 0),
      node('b', b, 0),
      node('c', 0, h),
      node('d', b, h),
    ],
    walls: [wall('oben', 'a', 'b', t), wall('unten', 'c', 'd', t)],
  } satisfies WallFigure;
}
