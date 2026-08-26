/**
 * Der in SI gespeicherte FE-Block, zurueck in Katalogeinheiten.
 *
 * EINE STELLE, ZWEI AUFRUFER, und das ist der ganze Grund fuer die eigene
 * Datei: seit
 * [ADR 0062](../../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
 * traegt auch die parametrische Form einen FE-Block, und `geometryValues`
 * (gezeichnet) wie `sectionProperties` (parametrisch) lesen ihn. Zweimal
 * hingeschrieben waeren es zwei Gelegenheiten, den `unsupported`-Zweig
 * verschieden zu behandeln.
 *
 * Vorher war das eine lokale Funktion in `geometry-properties.ts`.
 */

import type { FESectionState } from '../model/fe-section-values';
import type { CatalogueValues } from './to-si';
import { CM_TO_M, CM4_TO_M4 } from './units';

/**
 * Was vom FE-Block in die Katalogwerte faellt — `{}`, wenn er fehlt.
 *
 * ABWESEND HEISST „NOCH NICHT GERECHNET", und das Ergebnis ist dasselbe wie bei
 * `unsupported` ohne `It`: kein `It`, kein Schubmittelpunkt, kein κ. Der
 * Unterschied zwischen den beiden liegt nicht in den Werten, sondern in der
 * Frage, ob ein erneuter Aufruf etwas aendern wuerde — und die stellt die
 * Anwendung, nicht diese Funktion.
 */
export function feBlock(
  state: FESectionState | undefined,
): Partial<CatalogueValues> {
  if (state === undefined) return {};
  if (state.status === 'unsupported') {
    return state.It === undefined ? {} : { It: state.It / CM4_TO_M4 };
  }
  const { values } = state;
  return {
    It: values.It / CM4_TO_M4,
    yM: values.yM / CM_TO_M,
    zM: values.zM / CM_TO_M,
    inverseKappaY: values.inverseKappaY,
    inverseKappaZ: values.inverseKappaZ,
  };
}
