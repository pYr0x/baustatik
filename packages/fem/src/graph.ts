/**
 * Das Stabwerk als GRAPH gelesen: Knoten sind Knoten, Staebe sind Kanten.
 *
 * Zwei Auskuenfte, beide reine Funktionen ueber die Rohdaten. Sie sind von den
 * Regeln in `validate.ts` getrennt, weil sie ausserhalb der Pruefung gebraucht
 * werden: `isolatedNodeIds` beantwortet dieselbe Frage fuer die Modellwarnung
 * M5 UND fuer die Lastwarnung „Knotenlast auf einem Knoten ohne Stab", die im
 * `fem-solver` entsteht. Ein Graph, zwei Leser — und dieses Package muss dafuer
 * nichts von Lasten wissen.
 */

import type { Beam, Node } from './types';

/**
 * Die Knoten, an denen kein Stab haengt.
 *
 * Ein Stab mit haengender Knotenreferenz zaehlt trotzdem: er nennt seine beiden
 * ids, und der Knoten, den es gibt, ist damit nicht isoliert. Die haengende
 * Referenz selbst ist ein eigener Befund (`UnknownNodeReferenceError`) und wird
 * hier nicht noch einmal gemeldet.
 */
export function isolatedNodeIds(
  nodes: readonly Node[],
  beams: readonly Beam[],
): Set<string> {
  const attached = new Set<string>();
  for (const beam of beams) {
    attached.add(beam.startNodeId);
    attached.add(beam.endNodeId);
  }

  const isolated = new Set<string>();
  for (const node of nodes) {
    if (!attached.has(node.id)) {
      isolated.add(node.id);
    }
  }
  return isolated;
}

/** Eine Zusammenhangskomponente: die Knoten und die Staebe darin. */
export type Component = {
  nodeIds: string[];
  beamIds: string[];
};

/**
 * Die Zusammenhangskomponenten des Stabwerks, per Union-Find ueber die Staebe.
 *
 * Nur Staebe mit ZWEI bekannten Knoten verbinden. Wer eine haengende Referenz
 * hat, verbindet nichts — sonst haenge ein Phantomknoten in der Komponente und
 * die Auskunft „diese Teilstruktur hat kein Auflager" waere geraten. Der
 * Aufrufer prueft haengende Referenzen ohnehin zuerst.
 *
 * Ein Knoten ohne Stab bildet eine eigene Komponente mit leerem `beamIds`. Das
 * ist gewollt: der Aufrufer unterscheidet daran „frei bewegliche Teilstruktur"
 * (Fehler) von „einzelner Knoten" (Warnung M5).
 */
export function components(
  nodes: readonly Node[],
  beams: readonly Beam[],
): Component[] {
  const parent = new Map<string, string>();
  for (const node of nodes) {
    parent.set(node.id, node.id);
  }

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    // Pfadverkuerzung: der zweite Durchlauf haengt alles direkt an die Wurzel.
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const connecting: Beam[] = [];
  for (const beam of beams) {
    if (!parent.has(beam.startNodeId) || !parent.has(beam.endNodeId)) {
      continue;
    }
    connecting.push(beam);
    parent.set(find(beam.startNodeId), find(beam.endNodeId));
  }

  // Eingabereihenfolge der Knoten bestimmt die Reihenfolge der Komponenten,
  // damit die Ausgabe aus der Eingabe vorhersagbar bleibt.
  const byRoot = new Map<string, Component>();
  for (const node of nodes) {
    const root = find(node.id);
    const component = byRoot.get(root) ?? { nodeIds: [], beamIds: [] };
    component.nodeIds.push(node.id);
    byRoot.set(root, component);
  }
  for (const beam of connecting) {
    // Beide Enden liegen per Konstruktion in derselben Komponente.
    (byRoot.get(find(beam.startNodeId)) as Component).beamIds.push(beam.id);
  }

  return [...byRoot.values()];
}
