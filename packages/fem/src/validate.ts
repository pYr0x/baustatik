/**
 * Die Pruefung des MODELLS — das Geschwister von `validateLoads` in
 * `@baustatik/fem-loads`.
 *
 * ZWEI AUSGAENGE, aus denselben zwei Beduerfnissen wie dort:
 *
 *   `validateModel`     — sammelt ALLE Befunde und gibt sie zurueck. Fuer den
 *                         Pruef-Knopf, der dem Anwender auf einmal zeigen soll,
 *                         was am Modell nicht stimmt.
 *   `assertValidModel`  — wirft den ERSTEN Fehler. Das Tor vor der Rechenkette,
 *                         nach `error-handling-in-libraries.md`. Warnungen
 *                         halten nichts auf; es ignoriert sie.
 *
 * DIREKTE ARGUMENTE, KEIN SCHMALES INTERFACE. `fem-loads` bekommt sein Modell
 * durch `LoadModelGeometry`, weil die LASTregeln das Modell moeglichst wenig
 * kennen sollen. Hier ist das Modell der Gegenstand — ein Interface dazwischen
 * verbaerge genau das, worueber geurteilt wird.
 *
 * WAS HIER NICHT GEPRUEFT WIRD:
 *   - Die KINEMATIK im Allgemeinen. Verschieblichkeit faellt erst am
 *     Gleichungssystem auf. Die eine statisch entscheidbare Haelfte davon —
 *     eine Teilstruktur ohne jedes Auflager — steht als
 *     `UnsupportedComponentError` sehr wohl hier: sie ist garantiert singulaer,
 *     ohne dass dafuer etwas aufgestellt werden muesste.
 *   - Der Stab mit Gelenk an BEIDEN Enden. Fachlich ein Pendelstab und voellig
 *     zulaessig; erst die KETTE solcher Staebe ist kinematisch, und das braucht
 *     wieder das Gleichungssystem. Hier ausdruecklich erwaehnt, damit ihn
 *     niemand versehentlich verbietet. Dasselbe gilt fuer die freigesetzten
 *     VERSCHIEBUNGEN `u` und `w` (ADR 0017): ein Stab, der laengs gleitet,
 *     uebertraegt immer noch Querkraft und Moment.
 *   - Unbekannte `crossSectionId`/`materialId`. Dazu braeuchte die Pruefung die
 *     Kataloge; sie entsteht dort, wo die Steifigkeiten herkommen
 *     (`@baustatik/fem-solver`), als eigene Unterklasse von
 *     `ModelValidationError`. Die Hierarchie ist die Erweiterungsstelle.
 */

import {
  DuplicateSupportError,
  IsolatedNodeWarning,
  type ModelValidationError,
  type ModelValidationWarning,
  UnknownNodeReferenceError,
  UnsupportedComponentError,
  ZeroLengthBeamError,
} from './errors';
import { components, isolatedNodeIds } from './graph';
import type { Beam, Node, NodeSupport } from './types';

/** Das Ergebnis der Modellpruefung. Zwei Sorten Befund, zwei Ausgaenge. */
export type ModelValidationResult = {
  errors: ModelValidationError[];
  warnings: ModelValidationWarning[];
};

/**
 * Alle Befunde zum Modell, in Eingabereihenfolge.
 *
 * `errors` leer heisst: das Modell traegt. `warnings` halten nichts auf.
 */
export function validateModel(
  nodes: readonly Node[],
  beams: readonly Beam[],
  supports: readonly NodeSupport[],
): ModelValidationResult {
  const errors: ModelValidationError[] = [];
  const warnings: ModelValidationWarning[] = [];

  const byId = new Map(nodes.map((node) => [node.id, node]));

  // M1 — haengende Referenzen. Zuerst, weil alles Weitere den Graphen braucht.
  let dangling = false;
  for (const beam of beams) {
    for (const nodeId of [beam.startNodeId, beam.endNodeId]) {
      if (!byId.has(nodeId)) {
        errors.push(new UnknownNodeReferenceError('beam', beam.id, nodeId));
        dangling = true;
      }
    }
  }
  for (const support of supports) {
    if (!byId.has(support.nodeId)) {
      errors.push(
        new UnknownNodeReferenceError('support', support.id, support.nodeId),
      );
      dangling = true;
    }
  }

  // M2 — entarteter Stab. `fem-loads` kennt den Fall auch, aber nur, wenn
  // zufaellig eine Last darauf liegt; ohne Last faellt er sonst nirgends auf.
  for (const beam of beams) {
    const start = byId.get(beam.startNodeId);
    const end = byId.get(beam.endNodeId);
    if (start === undefined || end === undefined) continue;
    if (
      start.position.x === end.position.x &&
      start.position.z === end.position.z
    ) {
      errors.push(new ZeroLengthBeamError(beam.id));
    }
  }

  // M4 — zwei Auflager auf demselben Knoten.
  const supportsByNode = new Map<string, string[]>();
  for (const support of supports) {
    const ids = supportsByNode.get(support.nodeId) ?? [];
    ids.push(support.id);
    supportsByNode.set(support.nodeId, ids);
  }
  for (const [nodeId, supportIds] of supportsByNode) {
    if (supportIds.length > 1) {
      errors.push(new DuplicateSupportError(nodeId, supportIds));
    }
  }

  // M3 — Teilstruktur ohne Auflager. NUR, wenn keine Referenz haengt: sonst
  // faellt ein Stab aus dem Graphen, und die Meldung „diese Teilstruktur haengt
  // in der Luft" waere ein Folgefehler von M1 statt eines eigenen Befunds.
  if (!dangling) {
    for (const component of components(nodes, beams)) {
      // Ein einzelner Knoten ohne Stab ist keine frei bewegliche Teilstruktur,
      // sondern ein Modell im Entstehen — das meldet M5 als Warnung.
      if (component.beamIds.length === 0) continue;
      const held = component.nodeIds.some((nodeId) =>
        supportsByNode.has(nodeId),
      );
      if (!held) {
        errors.push(
          new UnsupportedComponentError(component.nodeIds, component.beamIds),
        );
      }
    }
  }

  // M5 — Knoten ohne jeden Stab.
  const isolated = isolatedNodeIds(nodes, beams);
  for (const node of nodes) {
    if (isolated.has(node.id)) {
      warnings.push(new IsolatedNodeWarning(node.id));
    }
  }

  return { errors, warnings };
}

/**
 * Das Tor: wirft den ersten Modellfehler, sonst nichts.
 *
 * Meldet bewusst nur den Grund, warum es zu ist — die vollstaendige Liste gibt
 * es bei `validateModel`. Warnungen werden ignoriert; sie sind zulaessige
 * Eingaben, die nur verdaechtig aussehen.
 */
export function assertValidModel(
  nodes: readonly Node[],
  beams: readonly Beam[],
  supports: readonly NodeSupport[],
): void {
  const { errors } = validateModel(nodes, beams, supports);
  if (errors.length > 0) {
    throw errors[0];
  }
}
