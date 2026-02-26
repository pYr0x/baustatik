/**
 * Prüft, ob ein Wert mathematisch rundbar ist.
 * Gibt false zurück bei NaN, Infinity oder non-number Typen.
 */
export const isUnroundable = (value: any): value is number => {
  return typeof value !== 'number' || !Number.isFinite(value) || value === 0;
};

/**
 * Validiert Faktoren für atomares Runden.
 * Faktoren müssen positiv und endlich sein (Division by Zero/Infinity Schutz).
 */
export const isValidFactor = (factor: any): factor is number => {
  return typeof factor === 'number' && Number.isFinite(factor) && factor > 0;
};
