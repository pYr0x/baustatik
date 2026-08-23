import { BaustatikError } from '@baustatik/errors';

/**
 * Die Querdehnzahl der Spannungsrueckrechnung liegt ausserhalb `[0, 0,5)`.
 *
 * WARUM UEBERHAUPT EIN WAECHTER, wo `@baustatik/cross-section-stress` seine
 * Nenner bewusst ungeschuetzt laesst: dort kommt jede Zahl aus
 * `sectionProperties()`, hier ist `nu` eine BLANKE ZAHL aus der Hand des
 * Aufrufers (ADR 0061). `ν = 30` statt `0,30` ist ein plausibler Tippfehler und
 * gaebe ein `m` nahe `1`, also ein Feld mit dem falschen Gewicht auf `ψ₁`; bei
 * `ν = −1` teilte `m = ν/(1+ν)` durch null. Beides sieht dem Ergebnis niemand
 * an.
 *
 * `ν = 0` LAEUFT DURCH — das ist `m = 0` und ein zulaessiger Grenzfall, an dem
 * die Orakel des Packages haengen. `ν = 0,5` nicht: dort ist das Material
 * inkompressibel, und die Formulierung dieses Packages ist dafuer nicht
 * geeicht.
 *
 * DER HOLZFALL WIRD HIER NICHT GELOEST. `ElasticModuli.nu` ist optional, und
 * seine Abwesenheit ist eine Antwort (ADR 0045): ohne ν gibt es kein
 * Querkraftschubfeld. Wer `undefined` hat, hat keine Spannung — nicht eine mit
 * `ν = 0`.
 */
export class InvalidPoissonRatioError extends BaustatikError {
  constructor(
    /** Die abgelehnte Querdehnzahl. */
    readonly nu: number,
  ) {
    super(
      `nu = ${nu}: die Querdehnzahl der FE-Spannungsrueckrechnung muss ` +
        'endlich und in [0, 0,5) sein.',
    );
  }
}
