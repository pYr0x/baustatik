/**
 * Der Nenner beider Spannungsformeln, in mm — dieselben vier Zahlen für σ und
 * für τ.
 */
export type BendingDenominator = {
  /** Trägheitsmoment um `y` [mm⁴]. */
  readonly Iy: number;
  /** Trägheitsmoment um `z` [mm⁴]. */
  readonly Iz: number;
  /** Deviationsmoment [mm⁴]. */
  readonly Iyz: number;
  /** `D = Iy·Iz − Iyz²` [mm⁸] — die Determinante der 2×2-Klammer. */
  readonly D: number;
};

/**
 * Die beiden Koeffizienten eines linearen Feldes über dem Querschnitt.
 *
 * Für σ sind es `1/mm³`-Werte (mal einer Koordinate ergibt MPa), für den
 * Schubfluss `1/mm⁴`-Werte (mal einem statischen Moment ergibt N/mm).
 */
export type FieldCoefficients = {
  readonly cy: number;
  readonly cz: number;
};

/**
 * Die 2×2-Auflösung der allgemeinen Biegung — die EINE Stelle, an der `Iyz`
 * verrechnet wird.
 *
 * ```text
 * D  = Iy·Iz − Iyz²
 * cy = −(aboutZ·Iy + aboutY·Iyz) / D
 * cz =  (aboutY·Iz + aboutZ·Iyz) / D
 * ```
 *
 * ZWEIMAL AUFGERUFEN, EINMAL GESCHRIEBEN. Der Schubfluss IST σ mit der
 * Ersetzung `My → Vz`, `Mz → −Vy`, negiert und mit `S` statt einer Koordinate:
 *
 * ```text
 * σ = N/A + cy·y  + cz·z         mit (cy, cz)   = field(d, My, Mz)
 * q =     −(c'y·Sz + c'z·Sy)     mit (c'y, c'z) = field(d, Vz, −Vy)
 * ```
 *
 * WARUM AUCH τ DEN ALLGEMEINEN ZWEIG TRAEGT und nicht die entkoppelte Form aus
 * [ADR 0058](../../../docs/adr/0058-the-stress-point-carries-a-wall-tangent.md):
 * jene gilt nur für `Iyz = 0`. Das ist heute folgenlos — jede Form mit
 * Spannungspunkten ist mindestens einfach symmetrisch —, aber σ trüge dann den
 * allgemeinen Zweig und τ nicht, und die Naht stünde nirgends. Es wäre dieselbe
 * unausgesprochene Vorbedingung, die ADR 0059 an `branched` verworfen hat.
 *
 * Bei `Iyz = 0` fällt beides exakt auf die vertraute Form zusammen:
 * `σ = N/A − Mz·y/Iz + My·z/Iy` und `q = −(Vz·Sy/Iy + Vy·Sz/Iz)`.
 *
 * DIE VORZEICHEN SIND NICHT GEWAEHLT, sondern das Kreuzprodukt
 * ([ADR 0060](../../../docs/adr/0060-the-section-forces-are-right-handed-components.md)):
 * `My = +∫z·σ dA` und `Mz = −∫y·σ dA`.
 */
export function field(
  d: BendingDenominator,
  /** Der Anteil um die `y`-Achse: `My` [Nmm] beziehungsweise `Vz` [N]. */
  aboutY: number,
  /** Der Anteil um die `z`-Achse: `Mz` [Nmm] beziehungsweise `−Vy` [N]. */
  aboutZ: number,
): FieldCoefficients {
  return {
    cy: -(aboutZ * d.Iy + aboutY * d.Iyz) / d.D,
    cz: (aboutY * d.Iz + aboutZ * d.Iyz) / d.D,
  };
}
