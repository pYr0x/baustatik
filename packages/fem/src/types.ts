/**
 * Das ebene Stabwerksmodell.
 *
 * ACHSEN: x nach rechts, z nach UNTEN (Baustatik-Konvention, wie
 * @baustatik/fem-geometry und @baustatik/fem-loads).
 *
 * DREHSINN von `phiY`: das globale y zeigt AUS der Zeichenebene heraus — bei
 * x rechts und z abwaerts die einzige rechtshaendige Wahl (z x x = y). Eine
 * positive Verdrehung `phiY` dreht damit nach der Rechte-Hand-Regel im Bild
 * GEGEN den Uhrzeigersinn, also von +z nach +x.
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

/**
 * Die an EINEM Stabende freigesetzten Freiheitsgrade — das Gelenk.
 *
 * DIE NAMEN SIND DIE DES STABS, nicht die des Knotens: `u` laengs der
 * Stabachse, `w` quer dazu, `theta` die Verdrehung. Das ist dieselbe
 * Reihenfolge und dasselbe Vokabular wie `d_e = [u1, w1, theta1, u2, w2,
 * theta2]` in @baustatik/fem-element, und damit dieselbe Reihenfolge wie die
 * Kondensationsindizes 0/1/2 und 3/4/5 im Solver.
 *
 * Die Knotenwelt heisst `ux`, `uz`, `phiY` (`NodeSupport`) — ein ANDERES
 * System. Bei der Verdrehung faellt der Unterschied nicht auf, weil die Drehung
 * in der Ebene rahmeninvariant ist; bei `u` auf einem schraegen Stab ist ein
 * Gleiten laengs der Stabachse etwas ganz anderes als ein globales `ux`
 * ([ADR 0017](../../docs/adr/0017-releases-are-named-in-the-local-frame.md)).
 *
 * Der Vorzeichenstreit `phiY = -theta` (ADR 0005) reist NICHT mit: ein
 * Freisetzungs-Flag ist ein `true`, kein Wert, und hat deshalb kein Vorzeichen.
 * Deshalb auch `true` oder weg statt `boolean` — `false` waere ein zweites Wort
 * fuer „nicht freigesetzt".
 *
 * Das Gelenk sitzt am STABENDE, nicht am Knoten. Nur so lassen sich an einem
 * Knoten mit drei Staeben zwei gelenkig und einer biegesteif anschliessen.
 */
export type BeamEndReleases = {
  /** Laengs der Stabachse — das Normalkraftgelenk. */
  u?: true;
  /** Quer zur Stabachse — das Querkraftgelenk. */
  w?: true;
  /** Die Verdrehung — das gewoehnliche Momentengelenk. */
  theta?: true;
};

export type Beam = {
  id: string;
  startNodeId: string;
  endNodeId: string;
  crossSectionId: string;
  materialId: string;
  releases?: {
    start?: BeamEndReleases;
    end?: BeamEndReleases;
  };
};

export type NodeSupport = {
  id: string;
  nodeId: string;
  ux: 'fixed' | 'free';
  uz: 'fixed' | 'free';
  phiY: 'fixed' | 'free';
};
