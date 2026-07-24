/**
 * Validierung des Lastmodells — die Regeln aus Abschnitt G des Pseudocodes in
 * `apps/demo/fem-viewer.ts`.
 *
 * ZWECK: Das Tor vor `@baustatik/fem-load-resolve`. Wer hier durchkommt, darf
 * dort ohne weitere Pruefung `0 <= from <= to <= L` annehmen, eine Stablaenge
 * `L > 0` haben und eine projizierte Bezugslaenge ungleich 0 — sonst stuende
 * dieselbe Pruefung zweimal.
 *
 * ZWEI AUSGAENGE, weil es zwei Aufrufer mit verschiedenen Beduerfnissen gibt:
 *
 *   `validateLoads`     — sammelt ALLE Beanstandungen und gibt sie zurueck.
 *                         Fuer den Eingabedialog: eine Lasteingabe ist keine
 *                         verletzte Precondition des Entwicklers, sondern ein
 *                         Tippfehler des Anwenders, und der will alle Fehler
 *                         auf einmal sehen.
 *   `assertValidLoads`  — wirft den ersten Fehler. Fuer die Rechenkette, die
 *                         nach der Regel aus `error-handling-in-libraries.md`
 *                         laut und frueh scheitern soll.
 *
 * WARUM KEIN IMPORT AUS `@baustatik/fem`: das Package soll nach seinem eigenen
 * Handoff nicht das gesamte Modell mitziehen. Gebraucht werden nur zwei
 * Auskuenfte ueber die Geometrie — gibt es den Knoten, und wo liegt die
 * Stabachse. Die stecken in `LoadModelGeometry`; die Abbildung `Beam -> Line`
 * leistet der Aufrufer, der `@baustatik/fem` ohnehin kennt. Einzige neue
 * Abhaengigkeit ist `fem-geometry`, damit die x/z-Konvention (z abwaerts) an
 * genau einer Stelle definiert bleibt.
 */

import { Line } from '@baustatik/fem-geometry';
import {
  BackwardsLoadExtentError,
  DegenerateBeamError,
  DistanceOutOfRangeError,
  EmptyLoadTargetError,
  type LoadValidationError,
  NegativeDistanceError,
  NonFiniteLoadValueError,
  UnknownLoadTargetError,
  ZeroNodeLoadError,
  ZeroProjectedLengthError,
} from './errors';
import { referenceFactor } from './reference-length';
import type { BeamLoad, FEMLoad, NodeLoad } from './types';

/**
 * Was die Validierung vom Modell wissen muss — nicht mehr.
 *
 * `beamAxis` liefert die Stabachse mit `p1` am Anfangs- und `p2` am
 * Endknoten (dieselbe Richtung, in der `distanceFromStart`, `from` und `to`
 * gemessen werden). `undefined` heisst: diese id kennt das Modell nicht.
 */
export type LoadModelGeometry = {
  hasNode(nodeId: string): boolean;
  beamAxis(beamId: string): Line | undefined;
};

/** Obergrenze der Abstaende bei `relativeDistances: true`. */
const PERCENT = 100;

/**
 * Relative Toleranz fuer die Laengenvergleiche.
 *
 * Absolute Abstaende werden gegen eine gerechnete Stablaenge geprueft, die
 * praktisch nie glatt ist (`Math.hypot`). Ein Abstand exakt am Stabende soll
 * nicht an der letzten Binaerstelle scheitern. Gleiche Groessenordnung wie die
 * Toleranz in `fem-element` (1e-9), dort fuer Rundungsreste aus `resolve`.
 */
const RELATIVE_TOLERANCE = 1e-9;

/** Ein Abstand entlang der Stabachse, mit dem Feldnamen aus `types.ts`. */
type Station = {
  field: 'distanceFromStart' | 'from' | 'to';
  value: number;
};

/**
 * Die Lageangaben einer Stablast, auf eine Form gebracht. `second` fehlt bei
 * `distribution: 'point'`; `undefined` als Ganzes heisst "nichts zu pruefen"
 * (Gleichlast, oder Trapez mit `fullLength`).
 */
type Placement = {
  relative: boolean;
  first: Station;
  second?: Station;
};

/**
 * Prueft eine einzelne Last und gibt alle Beanstandungen zurueck.
 * Leeres Array = die Last ist in Ordnung.
 */
export function validateLoad(
  model: LoadModelGeometry,
  load: FEMLoad,
): LoadValidationError[] {
  return load.target === 'node'
    ? validateNodeLoad(model, load)
    : validateBeamLoad(model, load);
}

/** Prueft alle Lasten eines Modells. Reihenfolge = Eingabereihenfolge. */
export function validateLoads(
  model: LoadModelGeometry,
  loads: readonly FEMLoad[],
): LoadValidationError[] {
  return loads.flatMap((load) => validateLoad(model, load));
}

/**
 * Wirft den ersten Fehler, wenn irgendeine Last unzulaessig ist. Das Tor fuer
 * die Rechenkette; die Oberflaeche nimmt statt dessen `validateLoads`.
 */
export function assertValidLoads(
  model: LoadModelGeometry,
  loads: readonly FEMLoad[],
): void {
  const [firstError] = validateLoads(model, loads);
  if (firstError) {
    throw firstError;
  }
}

function validateNodeLoad(
  model: LoadModelGeometry,
  load: NodeLoad,
): LoadValidationError[] {
  const errors: LoadValidationError[] = [];

  if (load.nodeIds.length === 0) {
    errors.push(new EmptyLoadTargetError(load.id, 'node'));
  }
  for (const nodeId of load.nodeIds) {
    if (!model.hasNode(nodeId)) {
      errors.push(new UnknownLoadTargetError(load.id, 'node', nodeId));
    }
  }

  const components = [
    { field: 'fx', value: load.fx },
    { field: 'fz', value: load.fz },
    { field: 'my', value: load.my },
  ];
  for (const { field, value } of components) {
    if (value !== undefined && !Number.isFinite(value)) {
      errors.push(new NonFiniteLoadValueError(load.id, field, value));
    }
  }

  // Weggelassen ist dasselbe wie 0 — die Komponente wirkt nicht.
  const acts = components.some(
    ({ value }) => value !== undefined && Number.isFinite(value) && value !== 0,
  );
  if (!acts) {
    errors.push(new ZeroNodeLoadError(load.id));
  }

  return errors;
}

function validateBeamLoad(
  model: LoadModelGeometry,
  load: BeamLoad,
): LoadValidationError[] {
  const errors: LoadValidationError[] = [];

  if (load.beamIds.length === 0) {
    errors.push(new EmptyLoadTargetError(load.id, 'beam'));
  }
  for (const { field, value } of valuesOf(load)) {
    if (!Number.isFinite(value)) {
      errors.push(new NonFiniteLoadValueError(load.id, field, value));
    }
  }

  const placement = placementOf(load);
  const stations = stationsOf(placement);

  // Regeln ohne Geometrie: sie gelten fuer alle Ziele gleich und wuerden im
  // Stab-Loop je Stab einmal gemeldet.
  for (const { field, value } of stations) {
    if (!Number.isFinite(value)) {
      errors.push(new NonFiniteLoadValueError(load.id, field, value));
      continue;
    }
    if (value < 0) {
      errors.push(new NegativeDistanceError(load.id, field, value));
    }
  }
  if (
    placement?.second !== undefined &&
    Number.isFinite(placement.first.value) &&
    Number.isFinite(placement.second.value) &&
    placement.second.value < placement.first.value
  ) {
    errors.push(
      new BackwardsLoadExtentError(
        load.id,
        placement.first.value,
        placement.second.value,
      ),
    );
  }
  // Die Obergrenze relativer Abstaende ist die Stablaenge selbst — 100 %.
  if (placement?.relative === true) {
    for (const { field, value } of stations) {
      if (Number.isFinite(value) && value > PERCENT) {
        errors.push(
          new DistanceOutOfRangeError(
            load.id,
            field,
            value,
            PERCENT,
            undefined,
          ),
        );
      }
    }
  }

  // Regeln, die je Stab anders ausfallen: L und die Neigung sind pro Stab
  // verschieden, dieselbe Last kann auf einem Stab passen und auf dem naechsten
  // nicht.
  for (const beamId of load.beamIds) {
    const axis = model.beamAxis(beamId);
    if (axis === undefined) {
      errors.push(new UnknownLoadTargetError(load.id, 'beam', beamId));
      continue;
    }

    const length = Line.length(axis);
    if (!(length > 0)) {
      errors.push(new DegenerateBeamError(load.id, beamId));
      continue;
    }

    if (placement !== undefined && !placement.relative) {
      for (const { field, value } of stations) {
        if (
          Number.isFinite(value) &&
          value > length * (1 + RELATIVE_TOLERANCE)
        ) {
          errors.push(
            new DistanceOutOfRangeError(load.id, field, value, length, beamId),
          );
        }
      }
    }

    // Der Faktor ist dimensionslos, deshalb ist die Schranke direkt die
    // relative Toleranz — dieselbe Zahl, die `fem-load-resolve` gleich mit
    // `q * faktor` weiterrechnet.
    const reference = referenceLengthOf(load);
    if (
      reference !== undefined &&
      referenceFactor(reference, axis) <= RELATIVE_TOLERANCE
    ) {
      errors.push(new ZeroProjectedLengthError(load.id, beamId, reference));
    }
  }

  return errors;
}

/** Die Lastwerte mit ihren Feldnamen — je Variante ein oder zwei. */
function valuesOf(load: BeamLoad): { field: string; value: number }[] {
  if (load.kind === 'force') {
    switch (load.distribution) {
      case 'point':
        return [{ field: 'p', value: load.p }];
      case 'constant':
        return [{ field: 'q', value: load.q }];
      case 'trapezoidal':
        return [
          { field: 'q1', value: load.q1 },
          { field: 'q2', value: load.q2 },
        ];
    }
  }
  switch (load.distribution) {
    case 'point':
    case 'constant':
      return [{ field: 'm', value: load.m }];
    case 'trapezoidal':
      return [
        { field: 'm1', value: load.m1 },
        { field: 'm2', value: load.m2 },
      ];
  }
}

function placementOf(load: BeamLoad): Placement | undefined {
  // Die Gleichlast liegt immer auf dem ganzen Stab und traegt keine Abstaende.
  if (load.distribution === 'constant') {
    return undefined;
  }
  if (load.distribution === 'point') {
    return {
      relative: load.relativeDistances === true,
      first: { field: 'distanceFromStart', value: load.distanceFromStart },
    };
  }
  if (load.fullLength === true) {
    return undefined;
  }
  return {
    relative: load.relativeDistances === true,
    first: { field: 'from', value: load.from },
    second: { field: 'to', value: load.to },
  };
}

function stationsOf(placement: Placement | undefined): Station[] {
  if (placement === undefined) {
    return [];
  }
  return placement.second === undefined
    ? [placement.first]
    : [placement.first, placement.second];
}

/**
 * Die Bezugslaenge, SOFERN es eine zu pruefen gibt.
 *
 * Momentlasten und Einzellasten tragen das Feld gar nicht erst — bei beiden
 * gaebe es nichts zu skalieren (`m` bzw. `p` sind Gesamtgroessen, nicht je
 * Laenge). Und `'trueLength'` kann nicht 0 sein, sobald `L > 0` geprueft ist.
 * Bleibt also nur der Projektionsfall.
 */
function referenceLengthOf(
  load: BeamLoad,
): 'horizontalProjection' | 'verticalProjection' | undefined {
  if (load.kind !== 'force' || load.distribution === 'point') {
    return undefined;
  }
  return load.referenceLength === 'trueLength'
    ? undefined
    : load.referenceLength;
}
