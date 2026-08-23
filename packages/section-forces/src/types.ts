/**
 * Die Schnittgrößen an EINER Stelle eines Stabes — die Zahlen, aus denen eine
 * Spannung wird.
 *
 * ALLE FELDER OPTIONAL, und das ist der ganze Grund für dieses Blatt: der ebene
 * Rahmen füllt drei davon (`N`, `Vz`, `My`), ein späterer räumlicher sechs. Ein
 * Pflichtfeld mehr wäre der Schritt auf 3D ein Breaking Change an genau der
 * Stelle, durch die jede Spannung des Programms läuft
 * ([ADR 0054](../../../docs/adr/0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md)).
 *
 * NICHT ZU VERWECHSELN MIT `SectionForces` AUS `@baustatik/fem-element`. Das ist
 * das Tripel `N`/`V`/`M` des ebenen Stabs, hier steht das Sechstupel des
 * allgemeinen Schnittufers. Die Namensgleichheit ist bekannt und in ADR 0054
 * ausdrücklich nicht aufgelöst.
 *
 * DIE VORZEICHENKONVENTION STEHT HIER, nicht bei der Formel, die sie verbraucht:
 * sie gehört zur BEDEUTUNG DER ZAHL. Ein späterer räumlicher Solver importiert
 * dieses Blatt und liest sie an seinen Feldern ab; `@baustatik/cross-section-stress`
 * wird er nie ansehen
 * ([ADR 0060](../../../docs/adr/0060-the-section-forces-are-right-handed-components.md)).
 *
 * ```text
 * N, Vy, Vz sind die Komponenten der Schnittkraft, Mt, My, Mz die des
 * Schnittmoments — in einem rechtshändigen (x, y, z) mit x als Stabachse.
 * Bei y nach rechts und z nach unten zeigt x in die Schnittebene hinein.
 *
 *   M = ∫ r × σₓ dA,  r = (0, y, z),  F = (σ dA, 0, 0)
 *   ⇒ My = +∫ z·σ dA        Mz = −∫ y·σ dA
 *   ⇒ My > 0 = Zug auf +z   Mz > 0 = DRUCK auf +y
 *   ⇒ dMy/dx = +Vz          dMz/dx = −Vy
 * ```
 */
export type SectionForces = {
  /** Normalkraft [kN], positiv = Zug. */
  readonly N?: number;
  /**
   * Querkraft in `y`-Richtung [kN].
   *
   * **`Vy` UND `Mz` SIND EIN PAAR** (ADR 0060). `Mz > 0` = Druck auf `+y` gehört
   * zu `dMz/dx = −Vy`; beides fällt aus demselben Kreuzprodukt. Wer eines von
   * beiden anders liefert, bekommt ein τ mit falschem Vorzeichen im `Vy`-Anteil
   * — und **kein Test im Repo schlägt an**, weil heute kein Solver `Vy` liefert.
   */
  readonly Vy?: number;
  /** Querkraft in `z`-Richtung [kN], positiv am positiven Schnittufer in `+z`. */
  readonly Vz?: number;
  /** Biegemoment um die `y`-Achse [kNm], positiv = Zug auf der `+z`-Seite. */
  readonly My?: number;
  /**
   * Biegemoment um die `z`-Achse [kNm], positiv = **DRUCK** auf der `+y`-Seite.
   *
   * Das ungleiche Vorzeichen gegenüber `My` ist kein Bruch, sondern das
   * Kreuzprodukt: `Mz = −∫ y·σ dA`. Siehe `Vy` — die beiden gehören zusammen.
   */
  readonly Mz?: number;
  /** Torsionsmoment um die Stabachse [kNm], positiv als Rechtsschraube um `+x`. */
  readonly Mt?: number;
};
