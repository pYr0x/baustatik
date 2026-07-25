/**
 * Die mitgelieferte Implementierung von `LoadModelGeometry`: sie beantwortet
 * die zwei Fragen der Validierung aus einem Stabwerksmodell.
 *
 * WARUM HIER DER IMPORT AUS `@baustatik/fem` STEHT — und sonst nirgends:
 * `validate.ts` fragt bewusst nur nach `hasNode` und `beamAxis`, damit die
 * REGELN das Modell nicht kennen muessen. Irgendwer muss diese Auskunft aber
 * geben, und dafuer braucht es `Node` und `Beam`. Die Wahl war: entweder jeder
 * Aufrufer baut sich das Objektliteral selbst (App-Dialog und `fem-solver`,
 * also mindestens zweimal), oder das Package nimmt die Abhaengigkeit auf und
 * liefert die Funktion mit. Wir haben Letzteres gewaehlt und die Kopplung dafuer
 * auf DIESE DATEI begrenzt: `validate.ts`, `reference-length.ts` und `types.ts`
 * wissen weiterhin nichts von `@baustatik/fem`. Siehe ADR 0006.
 *
 * DAS ERGEBNIS IST EINE MOMENTAUFNAHME, kein lebender Blick. Die beiden `Map`s
 * entstehen beim Bauen; ein danach hinzugefuegter Knoten taucht in diesem
 * Objekt nicht mehr auf. Das ist Absicht — der Nachschlag ist O(1), und die
 * Validierung faechert ueber viele Lasten x vielen Staeben auf.
 *
 * Die Folge fuer Aufrufer: NICHT einmal bauen und aufheben, sondern je Vorgang
 * neu bauen. `createFEMSolver` macht genau das, ein Aufruf je `validate()`
 * (`fem-solver/src/solver.ts`). Ein aufgehobenes Objekt waere eine zweite
 * Wahrheit neben dem Store und muesste synchron gehalten werden — das Bauen
 * kostet weniger als dieses Problem.
 */

import type { Beam, Node } from '@baustatik/fem';
import { Line } from '@baustatik/fem-geometry';
import type { LoadModelGeometry } from './validate';

/**
 * Baut die Auskunft ueber Knoten und Staebe eines Modells.
 *
 * `beamAxis` liefert `undefined`, wenn es den Stab nicht gibt ODER einer seiner
 * Knoten fehlt. Beides ist fuer die Lastpruefung dasselbe: es gibt keine
 * Stabachse, auf der eine Last liegen koennte, und `validateLoads` meldet einen
 * `UnknownLoadTargetError`. Den haengenden Knoten selbst zu beanstanden ist
 * nicht Sache der Lasten — das ist ein Modellfehler und gehoert dorthin, wo das
 * Modell geprueft wird (`fem-viewer` wirft dafuer `UnknownNodeReferenceError`).
 */
export function modelGeometry(
  nodes: readonly Node[],
  beams: readonly Beam[],
): LoadModelGeometry {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const beamById = new Map(beams.map((beam) => [beam.id, beam]));

  return {
    hasNode: (nodeId) => nodeById.has(nodeId),
    beamAxis: (beamId) => {
      const beam = beamById.get(beamId);
      if (beam === undefined) {
        return undefined;
      }

      // Reihenfolge ist fachlich: p1 am Anfangs-, p2 am Endknoten. Daran
      // haengen `distanceFromStart`, `from` und `to` — vertauscht misst die
      // Validierung vom falschen Ende, ohne dass irgendetwas auffaellt.
      const start = nodeById.get(beam.startNodeId);
      const end = nodeById.get(beam.endNodeId);
      if (start === undefined || end === undefined) {
        return undefined;
      }

      // `Node.position` ist `{x, z}` und damit bereits ein `Point` — der Umweg
      // ueber `Point.make` waere reine Zeremonie (fem-geometry/src/point.ts).
      return Line.make(start.position, end.position);
    },
  };
}
