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
 * EINE POLICY, EINMAL GEBUNDEN: die Zahlen, gegen die geprueft wird, stehen in
 * `src/policy.ts` und kommen ueber `createLoadValidator` herein — nicht als
 * drittes Argument an jeder Signatur. Die drei freien Exporte sind die
 * Ausgaenge des Default-Validators und bleiben zweiargumentig. Begruendung am
 * Typ `LoadValidator` weiter unten.
 *
 * WARUM DIE REGELN DAS MODELL NICHT KENNEN: gebraucht werden nur zwei
 * Auskuenfte ueber die Geometrie — gibt es den Knoten, und wo liegt die
 * Stabachse. Die stecken in `LoadModelGeometry`. Diese Datei importiert
 * deshalb nichts aus `@baustatik/fem`: eine Regel wie `from <= to <= L` haengt
 * an einer Laenge, nicht an einem Querschnitt oder einem Gelenk.
 *
 * Das PACKAGE haengt seit `model-geometry.ts` sehr wohl an `@baustatik/fem` —
 * irgendwer muss die Auskunft ja geben, und die mitgelieferte Implementierung
 * tut es. Die Kopplung ist bewusst auf jene eine Datei begrenzt; siehe dort
 * und ADR 0006. Die Abhaengigkeit auf `fem-geometry` haelt die x/z-Konvention
 * (z abwaerts) an genau einer Stelle.
 */

import { Line } from '@baustatik/fem-geometry';
import {
  BackwardsLoadExtentError,
  DegenerateBeamError,
  DistanceOutOfRangeError,
  EmptyLoadTargetError,
  type LoadValidationError,
  type LoadValidationWarning,
  NearlyDegenerateReferenceLengthWarning,
  NegativeDistanceError,
  NonFiniteLoadValueError,
  ReferenceFactorBelowMinimumError,
  UnknownLoadTargetError,
  ZeroBeamLoadError,
  ZeroExtentLoadSegmentWarning,
  ZeroNodeLoadError,
} from './errors';
import {
  DEFAULT_LOAD_VALIDATION_POLICY,
  type LoadValidationPolicy,
} from './policy';
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

/**
 * Obergrenze der Abstaende bei `relativeDistances: true`.
 *
 * Bleibt eine private Konstante und wird KEINE Einstellung: „relativ" heisst
 * definitionsgemaess „in Prozent der Stablaenge". Wer daran dreht, aendert
 * nicht die Pruefung, sondern die Bedeutung des Feldes.
 */
const PERCENT = 100;

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
 * Das Ergebnis einer Lastpruefung. Zwei Sorten Befund, weil der Ablauf drei
 * Ausgaenge hat: `errors` halten die Rechnung auf, `warnings` nicht.
 */
export type LoadValidationResult = {
  errors: LoadValidationError[];
  warnings: LoadValidationWarning[];
};

/**
 * Die drei Ausgaenge der Lastpruefung, an EINE Policy gebunden.
 *
 * WARUM GEBUNDEN UND NICHT EIN DRITTES ARGUMENT: der realistische Fehler ist
 * nicht, dass jemand absichtlich zwei verschiedene Policies benutzt, sondern
 * dass jemand das dritte Argument VERGISST. Der Eingabedialog riefe
 * `validateLoad(geom, draft)` mit der Default-Policy, waehrend der Solver mit
 * einer ueberschriebenen rechnet — der Dialog akzeptierte dann, was der
 * Rechnen-Knopf ablehnt, und nichts zeigte es an. Wer eine abweichende Policy
 * will, muss deshalb durch die Fabrik; ein vergessbares Argument gibt es
 * nicht. Dasselbe Muster wie die gebundene Formulierung in ADR 0003.
 */
export type LoadValidator = {
  validateLoad(model: LoadModelGeometry, load: FEMLoad): LoadValidationResult;
  validateLoads(
    model: LoadModelGeometry,
    loads: readonly FEMLoad[],
  ): LoadValidationResult;
  assertValidLoads(
    model: LoadModelGeometry,
    loads: readonly FEMLoad[],
  ): void;
};

/**
 * Bindet eine vollstaendige Policy an die drei Ausgaenge.
 *
 * Ohne Argument entsteht der Default-Validator — genau der, dessen Methoden die
 * freien Exporte `validateLoad`, `validateLoads` und `assertValidLoads` sind.
 */
export function createLoadValidator(
  policy: LoadValidationPolicy = DEFAULT_LOAD_VALIDATION_POLICY,
): LoadValidator {
  function validateLoad(
    model: LoadModelGeometry,
    load: FEMLoad,
  ): LoadValidationResult {
    return load.target === 'node'
      ? validateNodeLoad(model, load)
      : validateBeamLoad(model, load, policy);
  }

  function validateLoads(
    model: LoadModelGeometry,
    loads: readonly FEMLoad[],
  ): LoadValidationResult {
    const errors: LoadValidationError[] = [];
    const warnings: LoadValidationWarning[] = [];
    // Die gebundene Policy wird an JEDE Einzelpruefung durchgereicht — sonst
    // gaebe es zwei Ergebnisse fuer dieselbe Last.
    for (const load of loads) {
      const result = validateLoad(model, load);
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    }
    return { errors, warnings };
  }

  function assertValidLoads(
    model: LoadModelGeometry,
    loads: readonly FEMLoad[],
  ): void {
    const [firstError] = validateLoads(model, loads).errors;
    if (firstError) {
      throw firstError;
    }
  }

  return { validateLoad, validateLoads, assertValidLoads };
}

const defaultValidator = createLoadValidator();

/**
 * Prueft eine einzelne Last gegen die Default-Policy. Leeres `errors` = die
 * Last ist zulaessig.
 *
 * Der Ausgang fuer den Eingabedialog: er prueft einen Entwurf waehrend des
 * Tippens, den der Store noch gar nicht kennt. Rechnet die Anwendung mit einer
 * abweichenden Policy, nimmt der Dialog statt dessen
 * `createLoadValidator(policy).validateLoad`.
 */
export function validateLoad(
  model: LoadModelGeometry,
  load: FEMLoad,
): LoadValidationResult {
  return defaultValidator.validateLoad(model, load);
}

/**
 * Prueft alle Lasten eines Modells gegen die Default-Policy. Reihenfolge =
 * Eingabereihenfolge.
 */
export function validateLoads(
  model: LoadModelGeometry,
  loads: readonly FEMLoad[],
): LoadValidationResult {
  return defaultValidator.validateLoads(model, loads);
}

/**
 * Wirft den ersten Fehler, wenn irgendeine Last unzulaessig ist. Das Tor fuer
 * die Rechenkette; die Oberflaeche nimmt statt dessen `validateLoads`.
 *
 * Ignoriert Warnungen: sie melden zulaessige Eingaben und duerfen nichts
 * aufhalten.
 */
export function assertValidLoads(
  model: LoadModelGeometry,
  loads: readonly FEMLoad[],
): void {
  defaultValidator.assertValidLoads(model, loads);
}

function validateNodeLoad(
  model: LoadModelGeometry,
  load: NodeLoad,
): LoadValidationResult {
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

  // Die Knotenlast auf einem Knoten OHNE Stab waere hier der naheliegende
  // dritte Hinweis. Sie steht bewusst nicht hier: „haengt an diesem Knoten ein
  // Stab" ist eine Modell-, keine Lastfrage, und sie waere eine dritte Auskunft
  // an `LoadModelGeometry`. Sie entsteht im `fem-solver`, der Modell und Lasten
  // ohnehin beide sieht, aus `isolatedNodeIds` in `@baustatik/fem`.
  return { errors, warnings: [] };
}

function validateBeamLoad(
  model: LoadModelGeometry,
  load: BeamLoad,
  policy: LoadValidationPolicy,
): LoadValidationResult {
  const errors: LoadValidationError[] = [];
  const warnings: LoadValidationWarning[] = [];

  if (load.beamIds.length === 0) {
    errors.push(new EmptyLoadTargetError(load.id, 'beam'));
  }

  const values = valuesOf(load);
  for (const { field, value } of values) {
    if (!Number.isFinite(value)) {
      errors.push(new NonFiniteLoadValueError(load.id, field, value));
    }
  }

  // Symmetrisch zur Knotenlast: eine Last, die nichts eintraegt, ist keine
  // Last. Die Dreieckslast (`q1: 0, q2: 8`) bleibt zulaessig — es muss nur
  // IRGENDEIN Wert wirken, nicht jeder.
  const acts = values.some(
    ({ value }) => Number.isFinite(value) && value !== 0,
  );
  if (!acts) {
    errors.push(
      new ZeroBeamLoadError(
        load.id,
        values.map(({ field }) => field),
      ),
    );
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
  // Rueckwaerts ist ein Fehler, gleich nur ein Hinweis: die Angabe ist
  // widerspruchsfrei, sie traegt bloss nichts ein.
  if (
    placement?.second !== undefined &&
    Number.isFinite(placement.first.value) &&
    placement.second.value === placement.first.value
  ) {
    warnings.push(
      new ZeroExtentLoadSegmentWarning(
        load.id,
        placement.first.value,
        placement.relative,
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
          value > length * (1 + policy.stationRelativeTolerance)
        ) {
          errors.push(
            new DistanceOutOfRangeError(load.id, field, value, length, beamId),
          );
        }
      }
    }

    // Zwei UNABHAENGIGE Schranken auf demselben dimensionslosen Faktor: bis
    // `minimumReferenceFactor` wird abgelehnt, bis `suspiciousReferenceFactor`
    // gewarnt. Frueher war die untere Schranke dieselbe Zahl wie die
    // Stationstoleranz; das war ein Zufall der Groessenordnung, keine Regel.
    //
    // DAS `<=` IST DIE INVARIANTE: auch bei `minimumReferenceFactor: 0` bleibt
    // der EXAKTE Faktor 0 abgelehnt — eine Last, deren Bezugslaenge am Stab
    // exakt 0 misst, traegt nichts ein und ist immer ein Fehler. Nicht zu
    // einem `<` „aufraeumen".
    const reference = referenceLengthOf(load);
    if (reference !== undefined) {
      const factor = referenceFactor(reference, axis);
      if (factor <= policy.minimumReferenceFactor) {
        errors.push(
          new ReferenceFactorBelowMinimumError(
            load.id,
            beamId,
            reference,
            factor,
            policy.minimumReferenceFactor,
          ),
        );
      } else if (factor < policy.suspiciousReferenceFactor) {
        // Kein Fehler: die Eingabe ist zulaessig und soll durchgehen. Sie sieht
        // nur nach einem Versehen aus — und faellt sonst nirgends auf, weil die
        // Zeichnung die Last unveraendert zeigt.
        warnings.push(
          new NearlyDegenerateReferenceLengthWarning(
            load.id,
            beamId,
            reference,
            factor,
            policy.suspiciousReferenceFactor,
            values.map(({ field, value }) => ({
              field,
              value,
              effective: value * factor,
            })),
          ),
        );
      }
    }
  }

  return { errors, warnings };
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
