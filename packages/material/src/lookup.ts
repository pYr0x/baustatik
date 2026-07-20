import { UnknownGradeError } from './errors';

/**
 * Resolve a grade designation tolerantly (trimmed, case-insensitive) against
 * the vendored table, returning the canonical key and its data. The public
 * String-Literal-Union types constrain valid grades at compile time; this
 * normalization additionally accepts dynamically built strings (e.g. `"c30/37"`).
 */
export function lookupGrade<D extends Record<string, unknown>>(
  material: string,
  data: D,
  raw: string,
): { grade: keyof D & string; data: D[keyof D] } {
  const normalized = raw.trim().toUpperCase();
  for (const key of Object.keys(data) as (keyof D & string)[]) {
    if (key.toUpperCase() === normalized) {
      return { grade: key, data: data[key] };
    }
  }
  throw new UnknownGradeError(material, raw, Object.keys(data));
}
