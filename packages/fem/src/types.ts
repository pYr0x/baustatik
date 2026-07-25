/**
 * Das ebene Stabwerksmodell.
 *
 * ACHSEN: x nach rechts, z nach UNTEN (Baustatik-Konvention, wie
 * @baustatik/fem-geometry und @baustatik/fem-loads).
 *
 * DREHSINN von `phiY`: das globale y zeigt AUS der Zeichenebene heraus — bei
 * x rechts und z abwaerts die einzige rechtshaendige Wahl (z x x = y). Eine
 * positive Verdrehung `phiY` dreht damit nach der Rechte-Hand-Regel im Bild
 * GEGEN den Uhrzeigersinn, also von +z nach +x. So zeigt es RSTAB
 * (apps/demo/Knotenlast1.png).
 *
 * Das ist NICHT der Drehsinn von `theta` in @baustatik/fem-element (dort
 * `theta = dw/dx`, positiv von +x nach +z). Es gilt `phiY = -theta`; die
 * Umrechnung leistet die Transformation im Solver, nicht dieses Package.
 * Heute traegt `phiY` hier nur Sperr-Flags und damit noch gar kein Vorzeichen —
 * die Konvention steht fuer die spaeteren Ergebnisgroessen und die
 * Transformation bereits fest.
 */
export type Node = {
  id: string;
  /**
   * Koordinaten in METERN.
   *
   * Solange nur gezeichnet wurde, war die Einheit folgenlos — der Viewer
   * skaliert ohnehin. Ab `solve()` geht die Stablaenge als `L`, `L^2` und `L^3`
   * in die Steifigkeit ein und muss zu `EA` in kN und `EI` in kNm^2 passen
   * (@baustatik/fem-element). Eine Koordinate in Zentimetern verschiebt jedes
   * Ergebnis um sechs Groessenordnungen, ohne dass irgendetwas auffaellt.
   */
  position: { x: number; z: number };
};

export type Beam = {
  id: string;
  startNodeId: string;
  endNodeId: string;
  crossSectionId: string;
  materialId: string;
  releases?: {
    start?: { phiY?: true };
    end?: { phiY?: true };
  };
};

export type NodeSupport = {
  id: string;
  nodeId: string;
  ux: 'fixed' | 'free';
  uz: 'fixed' | 'free';
  phiY: 'fixed' | 'free';
};
