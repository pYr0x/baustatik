import {
  createSectionGeometry,
  shapeOutline,
  type CrossSection,
  type FESectionState,
  type SectionGeometry,
  type SectionPolicy,
} from '@baustatik/cross-section';

/**
 * Die Figur, die in die FE geht — für BEIDE Quellen des Vollquerschnitts.
 *
 * DIE PARAMETRISCHE FORM IST NUR EINE SCHREIBWEISE
 * ([ADR 0062](../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)):
 * `shapeOutline` schreibt sie als `Ring[]` aus, `createSectionGeometry` leitet
 * den Umriss unter DERSELBEN Policy ab, unter der gleich gerechnet wird, und
 * heraus kommt eine `SectionGeometry` — dieselbe Tür, dasselbe Ergebnis wie bei
 * der gezeichneten Figur.
 *
 * `undefined` heißt „für diesen Querschnitt gibt es nichts zu rechnen": das
 * Katalogprofil (seine Werte stehen in der Tabellenzeile), die dünnwandige
 * Form (κ, `It` und `yM`/`zM` fallen aus dem Wandweg) und unsinnige
 * Abmessungen. Die Unterscheidung „nicht nötig" gegen „nicht möglich" trifft
 * der Aufrufer nicht — beides führt dazu, dass kein FE-Lauf startet.
 *
 * SIE GEHÖRT IN DIE ANWENDUNG UND NICHT INS PACKAGE. Die Tür von
 * `@baustatik/cross-section-fe` nimmt eine Geometrie und kennt keine IDs; wer
 * das Ergebnis zurückschreibt, ist der Store — und der gehört hierher.
 */
export function feGeometry(
  cs: CrossSection,
  policy: SectionPolicy,
): SectionGeometry | undefined {
  if (cs.kind === 'profile') return undefined;
  if (cs.kind === 'section-geometry') return cs.geometry;

  // Nur der Vollquerschnitt: dem dünnwandigen Zweig antwortet der Wandweg, und
  // ein zweiter Rechenweg daneben wäre genau die Doppelung, die ADR 0062
  // abschafft.
  if (cs.shape.kind !== 'rectangle' && cs.shape.idealisation !== 'solid') {
    return undefined;
  }
  const rings = shapeOutline(cs.shape);
  if (rings === undefined) return undefined;
  return createSectionGeometry({ kind: 'outline', rings }, policy);
}

/** Der FE-Block eines Querschnitts, gleich aus welcher Quelle. */
export function feState(
  cs: CrossSection | undefined,
): FESectionState | undefined {
  if (cs === undefined || cs.kind === 'profile') return undefined;
  return cs.kind === 'shape' ? cs.feValues : cs.geometry.feValues;
}
