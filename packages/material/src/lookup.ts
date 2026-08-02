import { UnknownGradeError } from './errors';

/**
 * Resolve a grade designation tolerantly against the vendored table, returning
 * the canonical key and its data. The public String-Literal-Union types
 * constrain valid grades at compile time; this normalization additionally
 * accepts dynamically built strings (e.g. `"c30/37"`).
 *
 * Die Faltungsregel ist die von `lookupProfile` (`@baustatik/steel-profiles`):
 * ALLE Leerzeichen weg, dann Grossschreibung. Nicht nur `trim()` — `'S 235'`
 * und `'C 30/37'` sind genau, wie man tippt und wie Normtabellen setzen, und
 * zwei Kataloge desselben Programms sollen dieselbe Schreibweise annehmen.
 */
function fold(id: string): string {
  return id.replace(/\s+/g, '').toUpperCase();
}

export function lookupGrade<D extends Record<string, unknown>>(
  material: string,
  data: D,
  raw: string,
): { grade: keyof D & string; data: D[keyof D] } {
  const normalized = fold(raw);
  for (const key of Object.keys(data) as (keyof D & string)[]) {
    if (fold(key) === normalized) {
      return { grade: key, data: data[key] };
    }
  }
  throw new UnknownGradeError(material, raw, Object.keys(data));
}
