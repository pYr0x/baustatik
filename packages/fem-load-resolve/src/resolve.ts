/**
 * Schritt A der Rechenkette: das fachliche Lastmodell (`@baustatik/fem-loads`)
 * in lokale Elementlasten uebersetzen, die `consistentLoad` erwartet.
 *
 * WAS HIER NICHT PASSIERT — die Grenze nach oben:
 *   - KEINE Ersatzknotenlast. Die braucht die Ansatzfunktionen und ist deshalb
 *     Methode der Elementformulierung
 *     (`Timoshenko2D.prepare(props, L).consistentLoad`). Wer hier anfaengt, N
 *     zu brauchen, hat die Grenze verletzt.
 *   - KEINE Validierung. `fem-loads/src/validate.ts` ist das Tor davor; wer
 *     dort durchkommt, hat `0 <= from <= to <= L`, `L > 0` und eine projizierte
 *     Bezugslaenge ungleich 0. Hier stuende dieselbe Pruefung sonst zweimal.
 *     Einzige Ausnahme sind haengende Referenzen (siehe unten).
 *
 * EIN STAB = EIN ELEMENT. Die Ausgabe schluesselt auf `beamId`. Es gibt derzeit
 * keinen Grund zu verfeinern: das Element ist fuer den geraden, prismatischen
 * Stab exakt (es konvergiert nicht, es stimmt), und `internalForces`
 * parametrisiert den Verlauf ueber `x` statt ueber Elementgrenzen. Kaeme
 * Meshing doch (Vouten, Theorie II. Ordnung), aendert sich hier NICHTS —
 * noetig waere nur eine reine Zusatzfunktion, die ein `LocalElementLoad` an
 * gegebenen Stellen zerschneidet.
 */

import type { LocalElementLoad } from '@baustatik/fem-element';
import { Line, Vector } from '@baustatik/fem-geometry';
import {
  type BeamLoad,
  type FEMLoad,
  type LoadAxis,
  type LoadFrame,
  type LoadModelGeometry,
  type NodeLoad,
  referenceFactor,
  UnknownLoadTargetError,
} from '@baustatik/fem-loads';
import { loadStation } from './load-geometry';
import type { GlobalNodeLoad, ResolvedLoads } from './types';

/** Die Lastarten mit Ausdehnung. Die Einzellast hat keine. */
type DistributedLoad = Extract<
  BeamLoad,
  { distribution: 'constant' | 'trapezoidal' }
>;

/**
 * Loest alle Lasten eines Modells auf.
 *
 * Setzt voraus, dass `assertValidLoads` (oder `validateLoads`) bereits gelaufen
 * ist. Haengende Referenzen wirft diese Funktion trotzdem: beim Stab MUSS sie
 * reagieren, weil ohne Stabachse nicht weiterzurechnen ist — und dann soll der
 * Knotenfall sich nicht anders verhalten. Ohne die `hasNode`-Pruefung entstuende
 * dort still ein Eintrag fuer einen Phantomknoten, und der Fehler faende sich
 * erst im Solver wieder, als unbekannter Freiheitsgrad statt als kaputte Last.
 */
export function resolveLoads(
  model: LoadModelGeometry,
  loads: readonly FEMLoad[],
): ResolvedLoads {
  const beams = new Map<string, LocalElementLoad>();
  const nodes = new Map<string, GlobalNodeLoad>();

  // Eingabereihenfolge = Segmentreihenfolge. Die Ausgabe ist damit aus der
  // Eingabe direkt vorhersagbar; zusammengefasst wird bewusst nichts.
  for (const load of loads) {
    if (load.target === 'node') {
      mergeNodeLoad(model, load, nodes);
    } else {
      resolveBeamLoad(model, load, beams);
    }
  }

  return { beams, nodes };
}

function mergeNodeLoad(
  model: LoadModelGeometry,
  load: NodeLoad,
  nodes: Map<string, GlobalNodeLoad>,
): void {
  for (const nodeId of load.nodeIds) {
    if (!model.hasNode(nodeId)) {
      throw new UnknownLoadTargetError(load.id, 'node', nodeId);
    }

    const acc = nodes.get(nodeId) ?? { fx: 0, fz: 0, my: 0 };
    acc.fx += load.fx ?? 0;
    acc.fz += load.fz ?? 0;
    // KEIN Vorzeichenwechsel: siehe `GlobalNodeLoad`.
    acc.my += load.my ?? 0;
    nodes.set(nodeId, acc);
  }
}

/**
 * Fan-out: dieselbe Last kann auf mehreren Staeben liegen, und `L` wie Neigung
 * sind pro Stab verschieden — jeder Stab bekommt deshalb seine eigene
 * Aufloesung.
 */
function resolveBeamLoad(
  model: LoadModelGeometry,
  load: BeamLoad,
  beams: Map<string, LocalElementLoad>,
): void {
  for (const beamId of load.beamIds) {
    const axis = model.beamAxis(beamId);
    if (axis === undefined) {
      throw new UnknownLoadTargetError(load.id, 'beam', beamId);
    }

    const L = Line.length(axis);
    const target = beams.get(beamId) ?? { segments: [], points: [] };

    if (load.kind === 'moment') {
      appendMoment(load, L, target);
    } else {
      appendForce(load, axis, L, target);
    }

    beams.set(beamId, target);
  }
}

/**
 * Die Kraftrichtung in lokalen Stabkomponenten.
 *
 * Bewusst ueber `Line.toLocal` statt ueber `cosα/sinα`: die Definition der
 * lokalen Stabachse soll an EINER Stelle leben (`fem-geometry/src/line.ts`),
 * und die Zerlegung ist dort ein Skalarprodukt gegen eine orthonormale Basis —
 * kein Winkel, keine Drehmatrix, keine Vorzeichenherleitung.
 *
 * NICHT ueber `loadDirection` gebaut, obwohl das die Gegenrichtung derselben
 * Frage ist: im lokalen Fall entstuende ein `toGlobal`-nach-`toLocal`-Rundlauf,
 * der dem Solverpfad Fließkommarauschen zufuegt. Dass beide Wege dasselbe
 * sagen, sichert `tests/load-geometry.test.ts` — deshalb ist die Funktion
 * modulweit exportiert, aber nicht im Package-Index.
 */
export function toLocalComponents(
  frame: LoadFrame,
  axis: LoadAxis,
  value: number,
  line: Line,
): Vector {
  const v = axis === 'x' ? Vector.make(value, 0) : Vector.make(0, value);
  // `local` ist bereits die Zielbasis — nur `global` muss gedreht werden.
  return frame === 'local' ? v : Line.toLocal(line, v);
}

function appendForce(
  load: Extract<BeamLoad, { kind: 'force' }>,
  line: Line,
  L: number,
  target: LocalElementLoad,
): void {
  if (load.distribution === 'point') {
    // Keine Bezugslaenge: `p` ist eine Gesamtkraft in kN, nicht je Laenge.
    const p = toLocalComponents(load.frame, load.axis, load.p, line);
    target.points.push({
      a: loadStation(
        load.distanceFromStart,
        load.relativeDistances === true,
        L,
      ),
      px: p.dx,
      pz: p.dz,
      my: 0,
    });
    return;
  }

  // Der Faktor ist ueber den geraden Stab konstant, deshalb bleibt eine lineare
  // Last linear und ein Teilabschnitt bekommt denselben Faktor wie der ganze
  // Stab. Er gilt unabhaengig vom Bezugssystem der Richtung.
  const factor = referenceFactor(load.referenceLength, line);

  const [q1, q2] =
    load.distribution === 'constant' ? [load.q, load.q] : [load.q1, load.q2];
  const start = toLocalComponents(load.frame, load.axis, q1 * factor, line);
  const end = toLocalComponents(load.frame, load.axis, q2 * factor, line);
  const [from, to] = extentOf(load, L);

  target.segments.push({
    from,
    to,
    qx1: start.dx,
    qx2: end.dx,
    qz1: start.dz,
    qz2: end.dz,
    my1: 0,
    my2: 0,
  });
}

/**
 * Momentlasten kennen weder Bezugssystem noch Bezugslaenge — ein ebenes Moment
 * dreht immer um dieselbe Achse, und `m` ist bereits die fertige Groesse.
 *
 * DAS MINUS ist die ganze Uebersetzung: die Eingabe zaehlt positiv gegen den
 * Uhrzeigersinn (rechtshaendig um das globale y, das aus der Zeichenebene
 * zeigt), `LocalElementLoad.my` ist dagegen arbeitskonjugiert zu `theta`, und
 * `theta` zaehlt positiv von +x nach +z. Es gilt `phiY = -theta`. Das
 * Gegenstueck sitzt in der 6x6-Transformation des Solvers; beide zusammen
 * heben sich auf, sodass global wieder `+m` ankommt.
 */
function appendMoment(
  load: Extract<BeamLoad, { kind: 'moment' }>,
  L: number,
  target: LocalElementLoad,
): void {
  if (load.distribution === 'point') {
    target.points.push({
      a: loadStation(
        load.distanceFromStart,
        load.relativeDistances === true,
        L,
      ),
      px: 0,
      pz: 0,
      my: -load.m,
    });
    return;
  }

  const [m1, m2] =
    load.distribution === 'constant' ? [load.m, load.m] : [load.m1, load.m2];
  const [from, to] = extentOf(load, L);

  target.segments.push({
    from,
    to,
    qx1: 0,
    qx2: 0,
    qz1: 0,
    qz2: 0,
    my1: -m1,
    my2: -m2,
  });
}

/** Anfang und Ende eines Lastabschnitts entlang der lokalen x-Achse. */
function extentOf(load: DistributedLoad, L: number): [number, number] {
  // Die Gleichlast liegt per Definition auf dem ganzen Stab und traegt gar
  // keine Abstaende. Zwei getrennte Abfragen, damit TypeScript in der zweiten
  // schon auf das Trapez verengt hat — nur dort gibt es `fullLength`.
  if (load.distribution === 'constant') {
    return [0, L];
  }
  if (load.fullLength === true) {
    return [0, L];
  }
  const relative = load.relativeDistances === true;
  return [
    loadStation(load.from, relative, L),
    loadStation(load.to, relative, L),
  ];
}
