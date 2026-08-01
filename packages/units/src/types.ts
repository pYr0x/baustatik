export type UnitCategory =
  | 'length'
  | 'area'
  | 'volume'
  | 'moment_of_inertia'
  | 'mass'
  | 'force'
  | 'force_per_length'
  | 'force_per_area';

export interface UnitDefinition {
  category: UnitCategory;
  toBase: number;
}

export interface FromChain {
  /**
   * Umrechnung MIT der kategoriespezifischen Rundung — die berichtsseitige
   * Variante, und die Vorgabe.
   */
  to(target: string): number;
  /**
   * Dieselbe Umrechnung OHNE jede Rundung — die Variante für RECHENKETTEN.
   *
   * `to('m')` rundet auf ganze Millimeter: aus `139.5` mm wird `0.14` m, aus
   * `6.9` mm wird `0.007` m. Für einen Ausdruck ist das richtig, für eine
   * Schwerpunktlage oder einen Spannungspunkt ist es falsch. Wer den Wert
   * weiterrechnet, nimmt `toExact`; wer ihn druckt, nimmt `to`.
   */
  toExact(target: string): number;
}

export interface ConvertChain {
  from(source: string): FromChain;
}
