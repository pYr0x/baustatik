import { AssertionError } from './errors';

/**
 * Der Abschluss eines erschöpfenden `switch`.
 *
 * Er tut zwei Dinge, und das erste ist das wichtigere: Der Parameter `never`
 * macht eine neue Variante der Union zu einem ÜBERSETZUNGSFEHLER an jeder
 * Stelle, die sie noch nicht behandelt. Der Wurf zur Laufzeit ist nur das Netz
 * darunter, für Aufrufer ohne Typprüfung.
 *
 * Er wohnt hier und nicht bei den Erzeugern von Unions: `@baustatik/core` ist
 * das Package, von dem jedes andere abhängen darf — dieselbe Überlegung wie bei
 * `atOrThrow`. `@baustatik/render-core` hält bis auf Weiteres eine eigene
 * Fassung; sie zusammenzulegen ist eine eigene Änderung.
 */
export function assertNever(value: never): never {
  throw new AssertionError(
    `unerreichbarer Fall: ${JSON.stringify(value as unknown)}`,
  );
}
