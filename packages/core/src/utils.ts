import { AssertionError } from './errors';

/**
 * Interner Guard für bereits geprüfte Array-Zugriffe
 *
 * `ArrayLike<T>` UND NICHT `readonly T[]`, seit die FE des Vollquerschnitts
 * (`@baustatik/cross-section-fe`) in typisierten Feldern rechnet: ein
 * `Float64Array` ist kein `T[]`, und die Hausregel „`!` steht in keinem `src/`"
 * war dort ohne diese Erweiterung nicht einzuhalten — man schrieb stattdessen
 * je Datei eine eigene Fassung mit `undefined`-Prüfung. Strikt weiter als
 * vorher: jedes `readonly T[]` ist ein `ArrayLike<T>`.
 */
export function at<T>(arr: ArrayLike<T>, i: number): T {
  const v = arr[i];
  if (v === undefined)
    throw new AssertionError(`at(${i}): Index außerhalb des Arrays`);
  return v;
}
