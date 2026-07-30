/**
 * `Timoshenko2D` — das Produktivelement des ebenen Stabwerks.
 *
 * Locking-freies IIE (Interdependent Interpolation Element): `u` linear, `w`
 * kubisch, `theta` quadratisch, ueber phi gekoppelt. Der schubstarre Fall ist
 * der exakte Grenzfall phi = 0 und deckt Euler-Bernoulli ab — es gibt bewusst
 * KEIN zweites Element und keinen zweiten Codepfad dafuer.
 *
 * ZWEI FORMULIERUNGEN, EIN KERN: `Timoshenko2D` bildet K aus der geschlossenen
 * Formel, `Timoshenko2DIntegrated` integriert sie per Gauss aus denselben
 * Ansatzfunktionen. phi-Normalisierung, N, konsistenter Lastvektor,
 * Kondensation und Auswertungszustand sind identisch; nur `stiffness()` ist
 * injiziert. Beide erfuellen dasselbe `FrameElement2DFormulation` und liefern
 * dasselbe `deformation.kind` — sie unterscheiden sich im Bau von `K`, nicht in
 * der Kinematik. Sie pruefen sich gegenseitig (Test-Anker K<->N). Siehe
 * `docs/adr/0004-timoshenko-closed-and-integrated-stiffness.md`.
 *
 * DREI BINDUNGSSTUFEN: `prepare(props, L, releases)` bindet `phi` UND die
 * Freisetzungen (und kondensiert dabei einmal), `withLoad(load)` bindet die
 * Last, `evaluate(dLocal)` bindet das Ergebnis des Loesens. Warum die Last eine
 * eigene Stufe bekommt und nicht Argument bleibt, steht an `LoadedElement` in
 * `types.ts` — kurz: `evaluate` rechnet mit demselben Lastvektor weiter wie
 * `consistentLoad`, und zwei verschiedene Lasten ergaeben plausible falsche
 * Zahlen. Dieselbe Begruendung wie ADR-0003 fuer `prepare`, eine Ebene weiter.
 */

import {
  condenseLoad,
  condenseStiffness,
  endForces,
  recoverEndDisplacements,
  releasedIndices,
} from './condense';
import {
  BackwardsLoadSegmentError,
  InvalidElementInputError,
  InvalidShearStiffnessError,
  LoadOutsideElementError,
} from './errors';
import { gauss3 } from './gauss';
import { shapeFunctionsAt } from './shape-functions';
import {
  closedStiffness,
  gaussStiffness,
  type StiffnessBuilder,
} from './stiffness';
import type {
  ElementReleases,
  FrameElement2DFormulation,
  LocalElementLoad,
  PreparedElement,
  SectionStiffness,
  Vector6,
} from './types';

/**
 * Toleranz fuer die Lage von Lastabschnitten und Einzellasten auf dem Stab.
 * `fem-load-resolve` rechnet Teillasten geometrisch aus; dabei entstehen
 * Rundungsreste in der Groessenordnung der Maschinengenauigkeit mal Stablaenge.
 * Die Toleranz faengt die ab, ohne echte Bereichsfehler durchzulassen.
 *
 * RELATIV zu `L` angewandt (siehe `requireOnElement`), weil der Fehler den sie
 * abfangen soll relativ ist — das steht schon im Satz darueber. Dieselbe FORM
 * hat das Tor davor: `fem-loads/src/validate.ts` prueft
 * `value > length * (1 + stationRelativeTolerance)`. Die ZAHL dort ist seit der
 * Lastvalidierungs-Policy nicht mehr fest, dieser Wert hier bleibt fest — und
 * das ist folgenlos, weil `fem-load-resolve` jede Station ohnehin auf `[0, L]`
 * klemmt (`resolve.ts:257`). Diese Toleranz ist Doppelsicherung, nicht tragend;
 * genau deshalb wird sie NICHT konfigurierbar (ADR 0011). `Math.max(1, L)`
 * verhindert zugleich, dass die Schranke am sehr kurzen Stab unbrauchbar klein
 * wird.
 */
const GEOMETRY_EPS = 1e-9;

function requirePositiveFinite(value: number, name: string): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new InvalidElementInputError(name, value);
  }
}

/**
 * Die EINE Normalisierungsstelle fuer den Schub (ADR-0003): schubstarr wird auf
 * exakt `phi = 0` abgebildet, damit alle Grenzfall-Vergleiche FP-exakt sind und
 * `phi === 0` spaeter ohne Epsilon abgefragt werden darf.
 *
 * Weil `phi` hier und nur hier entsteht, wird hier auch seine Endlichkeit
 * geprueft: ein positives, aber winziges `GAs` laesst `GAs*L^2` unterlaufen und
 * `phi` ueberlaufen. `phi = Infinity` wuerde `(4 + phi) * kb` in der
 * geschlossenen K zu `Infinity * 0 = NaN` machen und in den Ansatzfunktionen
 * `c * phi = 0 * Infinity = NaN` — also gleichzeitig K, N und den
 * Ersatzknotenvektor vergiften. Der eine Check deckt alle drei ab.
 */
function normalizeShear(
  GAs: number | 'rigid',
  EI: number,
  L: number,
): { phi: number; GAs: number } {
  if (GAs === 'rigid' || GAs === Number.POSITIVE_INFINITY) {
    return { phi: 0, GAs: Number.POSITIVE_INFINITY };
  }
  if (!(GAs > 0)) {
    throw new InvalidShearStiffnessError(
      `muss groesser 0, 'rigid' oder Infinity sein (war: ${GAs}).`,
    );
  }

  const phi = (12 * EI) / (GAs * L * L);
  if (!Number.isFinite(phi)) {
    throw new InvalidShearStiffnessError(
      `zu klein — phi = 12*EI/(GAs*L^2) ist nicht endlich ` +
        `(GAs=${GAs}, EI=${EI}, L=${L}).`,
    );
  }

  return { phi, GAs };
}

/** Die auf `L` bezogene Lagetoleranz. Eine Stelle, damit alle Lagepruefungen
 *  eines Elements dieselbe Schranke benutzen. */
function geometryEps(L: number): number {
  return GEOMETRY_EPS * Math.max(1, L);
}

function requireOnElement(value: number, L: number, what: string): void {
  const eps = geometryEps(L);
  if (!(value >= -eps) || !(value <= L + eps)) {
    throw new LoadOutsideElementError(what, value, L);
  }
}

/**
 * Konsistenter Ersatzknotenvektor `f_e = sum_seg int(N^T q) + sum_pts N(a) * P`.
 *
 * Das verteilte Moment `my` koppelt ueber `Ntheta`, NICHT ueber `Nw'`: ein
 * Moment leistet virtuelle Arbeit an der Verdrehung, und bei Timoshenko sind
 * `theta` und `w'` verschiedene Felder (`w' = theta + gamma`). Bei phi = 0
 * faellt `Ntheta` exakt auf `Nw'` zurueck, weshalb der Euler-Bernoulli-Anker
 * weiter haelt. Mit `Nw'` gewichtet passten K und f fuer phi > 0 nicht mehr
 * zusammen — genau das "Formeln verschiedener Elemente mischen", das dieses
 * Package verhindern soll.
 *
 * Einzellasten werden ausgewertet (`N(a)`), nicht integriert.
 */
function consistentLoad(
  load: LocalElementLoad,
  L: number,
  phi: number,
): Vector6 {
  const f = [0, 0, 0, 0, 0, 0];

  for (const seg of load.segments) {
    requireOnElement(seg.from, L, 'Lastabschnitt-Anfang');
    requireOnElement(seg.to, L, 'Lastabschnitt-Ende');
    if (!(seg.from <= seg.to + geometryEps(L))) {
      throw new BackwardsLoadSegmentError(seg.from, seg.to);
    }

    const span = seg.to - seg.from;
    // Entartetes Segment traegt nichts bei; ohne diese Abkuerzung entstuende
    // bei der Interpolation eine Division durch null.
    if (span <= 0) continue;

    // Ein Segment ist per Definition stetig — daher genau EIN Integral je
    // Abschnitt. Sprungstellen sieht das Element als Segmentgrenzen.
    for (const gp of gauss3(seg.from, seg.to)) {
      const t = (gp.x - seg.from) / span;
      const qx = seg.qx1 + (seg.qx2 - seg.qx1) * t;
      const qz = seg.qz1 + (seg.qz2 - seg.qz1) * t;
      const my = seg.my1 + (seg.my2 - seg.my1) * t;
      const n = shapeFunctionsAt(gp.x, L, phi);

      for (let i = 0; i < 6; i++) {
        f[i] += gp.w * (qx * n.Nu[i] + qz * n.Nw[i] + my * n.Ntheta[i]);
      }
    }
  }

  for (const p of load.points) {
    requireOnElement(p.a, L, 'Einzellast-Position');
    const n = shapeFunctionsAt(p.a, L, phi);

    for (let i = 0; i < 6; i++) {
      f[i] += p.px * n.Nu[i] + p.pz * n.Nw[i] + p.my * n.Ntheta[i];
    }
  }

  return [f[0], f[1], f[2], f[3], f[4], f[5]];
}

/**
 * Baut eine Formulierung aus einem Steifigkeits-Bauer. Alles ausser
 * `stiffness()` ist zwischen den beiden Varianten identisch — deshalb hier eine
 * Fabrik statt zweier Objekte mit kopiertem Inhalt.
 */
function createFormulation(
  buildStiffness: StiffnessBuilder,
): FrameElement2DFormulation {
  return {
    prepare(
      props: SectionStiffness,
      L: number,
      releases?: ElementReleases,
    ): PreparedElement {
      requirePositiveFinite(L, 'L');
      requirePositiveFinite(props.EA, 'EA');
      requirePositiveFinite(props.EI, 'EI');
      const { phi, GAs } = normalizeShear(props.GAs, props.EI, L);
      const input = { EA: props.EA, EI: props.EI, GAs, L, phi };

      // EINMAL kondensiert, nicht je Aufruf: `steps` ist der Bauplan der
      // Rueckrechnung und muss zu genau dieser Matrix gehoeren.
      const { K, steps } = condenseStiffness(
        buildStiffness(input),
        releasedIndices(releases),
      );

      return {
        stiffness: () => K,

        shapeFunctions: (x) => {
          // Ableitungen bleiben package-intern; oeffentlich sind nur die Werte.
          const { Nu, Nw, Ntheta } = shapeFunctionsAt(x, L, phi);
          return { Nu, Nw, Ntheta };
        },

        withLoad: (load) => {
          const { f, pivotLoads } = condenseLoad(
            consistentLoad(load, L, phi),
            steps,
          );

          return {
            consistentLoad: () => f,

            evaluate: (dLocal) => {
              // Erst die Endverformungen aus den UNKONDENSIERTEN Zeilen, dann
              // die Stabendkraefte aus der KONDENSIERTEN Matrix. Die
              // Reihenfolge ist die Falle, die frueher beim Solver lag.
              const endDisplacements = recoverEndDisplacements(
                dLocal,
                steps,
                pivotLoads,
              );

              return {
                L,
                endForces: endForces(K, endDisplacements, f),
                endDisplacements,
                load,
                deformation: {
                  kind: 'timoshenko-2d-iie',
                  phi,
                  EI: props.EI,
                  EA: props.EA,
                },
              };
            },
          };
        },
      };
    },
  };
}

/**
 * Das Produktivelement: geschlossene Steifigkeitsformel. Erste Wahl, solange
 * es keinen Grund fuer die integrierte Variante gibt.
 */
export const Timoshenko2D: FrameElement2DFormulation =
  createFormulation(closedStiffness);

/**
 * Dieselbe Formulierung, aber mit K numerisch aus den Ansatzfunktionen
 * integriert (`int(B^T D B)`, 3-Punkt-Gauss). Gleichwertig und gleich benutzbar;
 * dient zugleich als gegenseitiger Konsistenzanker zu `Timoshenko2D`.
 */
export const Timoshenko2DIntegrated: FrameElement2DFormulation =
  createFormulation(gaussStiffness);
