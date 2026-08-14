/**
 * Was aus der FE-Rechnung eines VOLLQUERSCHNITTS in den Satz wandert.
 *
 * DER TYP LIEGT HIER, DIE RECHNUNG NICHT. `@baustatik/cross-section` bleibt
 * frei von WASM; gerechnet wird in `@baustatik/cross-section-fe`
 * ([ADR 0047](../../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md)).
 * Der Satz braucht den Typ trotzdem, denn `SectionGeometry` traegt das Feld —
 * und `sectionProperties` liest es.
 *
 * KEINE MATERIALZAHL, KEIN ν. Das ist der ganze Trick von
 * [ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md):
 * κ haengt an der Querdehnzahl, der Querschnitt darf sie aber nicht kennen
 * (ADR 0020/0023/0026). Also wird nicht die Zahl gespeichert, sondern die
 * FORMEL — zwei Koeffizienten je Achse, und ν wird erst dort eingesetzt, wo
 * Geometrie und Material ohnehin zusammenkommen
 * (`@baustatik/fem-section-resolve`).
 */

/**
 * Die ν-freien FE-Werte eines gezeichneten Vollquerschnitts. ALLES IN SI.
 *
 * `It`, `yM` und `zM` sind EINZELNE Zahlen, `inverseKappaY`/`inverseKappaZ`
 * PAARE — und der Unterschied ist Physik und keine Darstellung:
 *
 *   `It` faellt aus `∇²ω = 0`. Reine Saint-Venant-Torsion hat keine
 *   Normalspannungen, und ν koppelt Dehnungen verschiedener Richtungen — es
 *   gibt nichts zu koppeln. Nur `G·It` sieht ν, ueber `G` selbst.
 *
 *   `yM`/`zM` nach TREFFTZ sind ν-frei, gemessen auf 10⁻¹² des
 *   Traegheitsradius. Nach Weber waeren sie es nicht (bis 0,55 %); gewaehlt ist
 *   Trefftz wegen des Stabelements, dessen Torsionsfreiheitsgrad die
 *   Steifigkeit `G·It` aus demselben Woelbproblem traegt.
 *
 *   κ faellt aus der Schub-ENERGIE, also einer quadratischen Form ueber einem
 *   in `m` affinen Spannungsfeld. `1/κ` ist damit exakt quadratisch in `m`.
 */
export type FESectionValues = {
  /** Torsionstraegheitsmoment It [m4] — aus `∇²ω = 0`, ν-frei. */
  readonly It: number;
  /**
   * Schubmittelpunkt nach TREFFTZ [m] — ν-frei, im selben System wie
   * `ys`/`zs`.
   */
  readonly yM: number;
  readonly zM: number;
  /**
   * `[d0, d2]` mit `1/kappaY = d0 + d2·m²` und `m = ν/(1+ν)`.
   *
   * ZWEI ZAHLEN UND NICHT DREI: der lineare Anteil `d₁` ist beweisbar null,
   * auch mit Loch (ADR 0045). Ein rein linearer Ansatz — `1/κ = d0 + d1·m` —
   * liesse dagegen 16 % stehen; die Koeffizientenform ist keine Naeherung,
   * sondern die exakte Loesung in geschlossener Form ueber `m`.
   */
  readonly inverseKappaY: readonly [number, number];
  readonly inverseKappaZ: readonly [number, number];
};

/**
 * Der Zustand des FE-Blocks im Satz — DREI unterscheidbare Faelle, nicht zwei.
 *
 * ABWESENHEIT heisst „der Aufloesungsschritt lief noch nicht". Sie ist der
 * dritte Fall und steht deshalb nicht in dieser Union: „noch nicht gerechnet"
 * und „gerechnet und verweigert" duerfen nicht gleich aussehen, sonst ruft die
 * Anwendung ewig neu auf.
 */
export type FESectionState =
  | {
      readonly status: 'computed';
      readonly values: FESectionValues;
      /**
       * Der Fingerabdruck des Umrisses, unter dem gerechnet wurde.
       *
       * DAS GATE KANN DEN BLOCK NICHT NEU RECHNEN — die FE ist asynchron, das
       * Gate ist es nicht. Es leitet den Umriss aber ohnehin neu ab: weicht `A`
       * oder `Iy` ab, wird aus stiller Drift ein Befund
       * (`OutlineDriftWarning`). In SI, wie die Werte selbst.
       */
      readonly fingerprint: { readonly A: number; readonly Iy: number };
    }
  | {
      readonly status: 'unsupported';
      /**
       * `hole-off-bending-axis`: der Schwerpunkt eines Lochs liegt nicht auf
       * der Biegeachse. Dann ist `Φ` mehrdeutig und als FE-Feld nicht
       * darstellbar — und der Restfluss zeigt das NICHT an, er steht bei
       * 10⁻¹⁷. Der Anzeiger ist der Randschluss je Schleife (ADR 0045).
       *
       * `disconnected-areas`: zwei getrennte Materialflaechen. Der Mesher kann
       * sie, das Stabmodell nicht.
       */
      readonly reason: 'hole-off-bending-axis' | 'disconnected-areas';
      /**
       * Torsionstraegheitsmoment It [m4] — DA, wenn ueberhaupt vernetzt wurde.
       *
       * `It` ist von beiden Gruenden unberuehrt: `ω` ist eine physische
       * Verschiebung und auf jedem Gebiet eindeutig. Es waere unehrlich, eine
       * gerechnete Zahl wegzuwerfen, nur weil κ danebenfaellt (ADR 0045).
       * Abwesend bei `disconnected-areas`, wo vor dem Vernetzen verweigert
       * wurde.
       */
      readonly It?: number;
    };

/**
 * κ aus den Koeffizienten und einer Querdehnzahl.
 *
 * `undefined` heisst SCHUBSTARR, im selben Vokabular wie `kappaZ === undefined`
 * — nicht „null Schubflaeche". Es kommt heraus, wenn `nu` fehlt: beim Holz ist
 * das der ehrliche Fall, denn orthotrop gibt es kein isotropes ν, und aus `E`
 * und `G` zurueckgerechnet ergaebe es `6,97` (ADR 0045).
 */
export function kappaFromCoefficients(
  coefficients: readonly [number, number] | undefined,
  nu: number | undefined,
): number | undefined {
  if (coefficients === undefined || nu === undefined) return undefined;
  const m = nu / (1 + nu);
  const [d0, d2] = coefficients;
  const inverse = d0 + d2 * m * m;
  return Number.isFinite(inverse) && inverse > 0 ? 1 / inverse : undefined;
}
