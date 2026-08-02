/**
 * Die Moduln einer Sorte — OHNE Nationalen Anhang.
 *
 * Das Gegenstueck zu `lookupProfile` in `@baustatik/steel-profiles`: dieselbe
 * Faltungsregel, dasselbe `undefined`, und wie dort die kanonische Bezeichnung
 * mit heraus. Wer ein Modell BAUT, ruft das hier; wer BEMISST, ruft den
 * Katalog.
 *
 * WARUM OHNE ANHANG: `Es`, `Ecm` und `E0,mean` sind charakteristische Werte.
 * ADR 0026 hat das per Test festgehalten — hier wird es strukturell: die
 * Funktion hat gar keinen Parameter, an dem ein Anhang haengen koennte, und
 * damit braucht das Anlegen eines Modellsatzes keinen
 * ([ADR 0027](../../../docs/adr/0027-catalogues-are-import-sources.md)).
 */

import { concreteShearModulus } from './concrete';
import { CONCRETE_DATA } from './data/concrete';
import { STEEL_DATA } from './data/steel';
import { TIMBER_DATA } from './data/timber';
import { UnknownGradeError } from './errors';
import { lookupGrade } from './lookup';
import type { ElasticModuli, MaterialKind } from './model';
import { STEEL_SHEAR_MODULUS } from './steel';

/** Was `lookupMaterial` zurueckgibt: die kanonische Sorte und ihre Moduln. */
export type MaterialLookup = {
  /** Die kanonische Schreibweise — `'s 235'` kommt als `'S235'` zurueck. */
  readonly grade: string;
  readonly moduli: ElasticModuli;
};

/**
 * Schlaegt die Moduln einer Sorte nach.
 *
 * WIRFT NICHT. `lookupGrade` wirft — und das ist dort richtig, weil
 * `steel('S234')` im Code ein Tippfehler ist. An dieser Grenze ist ein
 * unbekannter Name aber eine Aussage ueber die EINGABE, und die gehoert dem
 * Aufrufer gemeldet, nicht als Ausnahme durchgereicht. Der Builder in
 * `@baustatik/script` macht daraus einen `FEMScriptError` an der Zeile, in der
 * die Sorte steht.
 *
 * `kind` waehlt die Tabelle, statt sie zu erraten: die Sortenlisten sind zwar
 * disjunkt, aber unter der Faltungsregel ist `'C30'` nicht von einem
 * verkuerzten `'C30/37'` zu unterscheiden (ADR 0026).
 */
export function lookupMaterial(
  kind: MaterialKind,
  grade: string,
): MaterialLookup | undefined {
  try {
    switch (kind) {
      case 'steel': {
        const found = lookupGrade('steel', STEEL_DATA, grade);
        return {
          grade: found.grade,
          moduli: { E: found.data.Es, G: STEEL_SHEAR_MODULUS },
        };
      }
      case 'concrete': {
        const found = lookupGrade('concrete', CONCRETE_DATA, grade);
        return {
          grade: found.grade,
          moduli: {
            E: found.data.Ecm,
            G: concreteShearModulus(found.data.Ecm),
          },
        };
      }
      case 'timber': {
        const found = lookupGrade('timber', TIMBER_DATA, grade);
        return {
          grade: found.grade,
          moduli: { E: found.data.E0mean, G: found.data.Gmean },
        };
      }
    }
  } catch (error) {
    if (error instanceof UnknownGradeError) return undefined;
    throw error;
  }
}
