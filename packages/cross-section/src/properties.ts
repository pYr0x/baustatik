/**
 * Die Querschnittswerte — Geometrie, KEIN Material.
 *
 * ABGRENZUNG ZU `SectionStiffness` (`@baustatik/fem-element`): dort stehen
 * `EA`, `EI`, `GAs`, also Geometrie MAL Material. Hier steht, was jede
 * Profiltabelle unter *section properties* druckt. Die Multiplikation leistet
 * `@baustatik/fem-section-resolve` und sonst niemand
 * ([ADR 0020](../../../docs/adr/0020-section-properties-versus-section-stiffness.md)).
 *
 * ALLES IN SI-METERN. Der Katalog fuehrt cm2/cm4, weil man das gegen die
 * gedruckte Tabelle diffen koennen muss; hier ist die Umrechnung bereits
 * passiert, und zwar an genau einer Stelle.
 */
export type SectionProperties = {
  /** Querschnittsflaeche A [m2]. */
  A: number;
  /** Traegheitsmoment um die y-Achse, auf den SCHWERPUNKT bezogen [m4]. */
  Iy: number;
  /** Traegheitsmoment um die z-Achse, auf den Schwerpunkt bezogen [m4]. */
  Iz: number;
  /** Deviationsmoment [m4]. 0 bei jeder Form, die eine Symmetrieachse hat. */
  Iyz: number;
  /**
   * Schwerpunkt im EINGABESYSTEM der jeweiligen Quelle [m].
   *
   * Fuer parametrische Formen liegt der Ursprung an der OBERKANTE auf der
   * Symmetrieachse (`y = 0`, `z = 0` am oberen Rand), damit `zs` die Zahl ist,
   * die man von Hand nachrechnet: der Plattenbalken `bf=2,0 / hf=0,2 /
   * bw=0,25 / h=0,5` hat `zs = 0,1395 m`.
   *
   * Fuer ein Walzprofil ist das Eingabesystem das der Tabelle, und das ist
   * bereits schwerpunktsbezogen: `ys = zs = 0`.
   */
  ys: number;
  zs: number;
  /**
   * Schubkorrekturbeiwert kappa = A_s / A [-].
   *
   * `undefined` heisst SCHUBSTARR — nicht „null Schubflaeche". Ein Profil ohne
   * tabellierte Schubflaeche rechnet lieber ohne Schubverformung, als dass hier
   * ein Naeherungswert erfunden wird.
   */
  kappaY?: number;
  kappaZ?: number;
};
