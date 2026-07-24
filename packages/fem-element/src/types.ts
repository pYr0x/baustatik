/**
 * Typen und Interface der ebenen Stabwerks-Elementformulierung.
 *
 * Dieses Package ist bewusst abhaengigkeitsfrei (`dependencies: {}`): die
 * Element-Mathematik ist reine Funktion ohne Konva/DOM/WASM und definiert ihre
 * eigenen Typen. Alle anderen FEM-Packages (fem-solver, fem-load-resolve,
 * linalg-wasm) haengen an fem-element, nie umgekehrt.
 *
 * KONVENTIONEN (eine Konvention fuer Ansatz, K, f, Schnittgroessen):
 *
 * - Lokale Freiheitsgrade in fester Reihenfolge
 *     d_e = [u1, w1, theta1, u2, w2, theta2]^T
 *   mit u = axial (entlang der Stabachse), w = quer, theta = Drehung.
 *   Dieselbe Reihenfolge gilt fuer beide Balkentheorien, damit Transformation,
 *   Assemblierung und Solver gemeinsam bleiben.
 *
 * - Knotenwelt-Entsprechung: w entspricht uz, theta entspricht phiY
 *   (siehe @baustatik/fem). Nur die lokale x-Achse ist um den Stabwinkel
 *   gedreht; die Zuordnung zur Knotenwelt leistet spaeter die Transformation
 *   im Solver, nicht dieses Package.
 *
 * - z zeigt nach unten (Baustatik-Konvention, wie fem-geometry / fem-loads);
 *   eine nach unten wirkende Last ist positiv. Die lokale x-Achse laeuft vom
 *   Anfangs- zum Endknoten.
 *
 * - theta ist als Neigung dw/dx definiert, positiver Drehsinn von +x nach +z.
 *   Diese (bewusste) Wahl haelt die Steifigkeitsmatrix in der klassischen
 *   Hermite-Form und deckt sich mit dem konsistenten Lastvektor der
 *   Ersatzknotenlasten. Die Zuordnung zum rechtshaendigen phiY am Knoten ist
 *   Sache der Transformation.
 *
 *   Konkret gilt `phiY = -theta`: am Knoten zeigt das globale y AUS der
 *   Zeichenebene (die einzige rechtshaendige Wahl bei x rechts, z abwaerts),
 *   eine positive Drehung um +y fuehrt also +z nach +x — entgegengesetzt zu
 *   theta. Der Vorzeichenwechsel lebt an genau ZWEI Stellen:
 *
 *     @baustatik/fem-load-resolve   Stab-Momentlasten:  my_e = -m
 *     @baustatik/fem-solver         6x6-Transformation: -1 in der phiY-Zeile
 *
 *   Beide heben sich auf — global kommt wieder das an, was der Anwender
 *   eingegeben hat. Knotenlasten laufen nie durch ein Element und bekommen
 *   deshalb KEIN Minus. Der 3x3-Block der Transformation
 *   [[cos, sin, 0], [-sin, cos, 0], [0, 0, -1]] hat zwar det = -1, ist aber
 *   orthogonal, sodass T^-1 = T^T und damit T^T K T gueltig bleibt.
 */

/** Fester 6-Vektor (lokale Freiheitsgrade oder Lastvektor). Laenge im Typ. */
export type Vector6 = readonly [number, number, number, number, number, number];

/**
 * Feste 6x6-Matrix (lokale Steifigkeit). Hand-gerollt, keine externe
 * Matrix-Library: auf Element-Ebene wird nichts invertiert/zerlegt/geloest,
 * nur eine 6x6 per geschlossener Formel gebaut und ein K*d gerechnet. Die reine
 * lineare Algebra (Solve K d = F) liegt spaeter in linalg-wasm; die Umwandlung
 * dieser Matrix in ein Float64Array passiert erst im Solver beim Assemblieren.
 */
export type Matrix6 = readonly [
  Vector6,
  Vector6,
  Vector6,
  Vector6,
  Vector6,
  Vector6,
];

/**
 * Effektive Steifigkeiten eines Stabquerschnitts, vom (spaeteren) Adapter aus
 * `material` x `cross-section` EINMAL berechnet. Die Element-Mathematik
 * importiert nie material/cross-section, sondern rechnet nur mit diesen Zahlen.
 *
 * `GAs` = kappa*G*A ist die EINE effektive Schubsteifigkeit (kappa steckt schon
 * drin), damit kappa nicht doppelt angewendet wird. Der schubstarre Fall
 * (Schub vernachlaessigen, φ=0) wird ausgedrueckt durch:
 *   - `'rigid'`  — der kanonische, JSON-serialisierbare Weg, oder
 *   - `Infinity` — geduldeter In-Memory-Wert (ueberlebt JSON NICHT: wird zu
 *                  null, deshalb nicht persistieren).
 * `NaN` und Werte <= 0 sind unzulaessig und werden bei der Normalisierung
 * abgelehnt.
 *
 * INVARIANTE: `GAs` tritt in der Formulierung NIE als roher additiver
 * Steifigkeitsterm auf, sondern ausschliesslich im Schubparameter
 *   φ = 12*EI / (GAs * L^2)
 * an genau EINER Normalisierungsstelle. Das haelt den Grenzfall exakt
 * (endlich/Infinity = 0 in IEEE-754) und verhindert Infinity - Infinity = NaN.
 *
 * Ob Schub ueberhaupt beruecksichtigt wird, ist eine GLOBALE Analyse-Einstellung
 * (RSTAB-Konvention) und lebt spaeter im Adapter/fem-solver. Dieses Package
 * weiss davon nichts; es sieht nur das fertige `GAs` pro Element.
 */
export type SectionProperties = {
  /** Dehnsteifigkeit E*A [kN]. */
  EA: number;
  /** Biegesteifigkeit E*I [kNm^2]. */
  EI: number;
  /** Effektive Schubsteifigkeit kappa*G*A [kN], oder 'rigid' fuer schubstarr. */
  GAs: number | 'rigid';
};

/**
 * Ein linearer Streckenlast-Abschnitt auf dem Stab, in LOKALEN, bereits
 * aufgeloesten Koordinaten (Ausgabe des spaeteren fem-load-resolve).
 *
 * Werte veraendern sich linear von `from` bis `to` entlang der lokalen x-Achse
 * (0 <= from <= to <= L). Die lineare Form deckt konstant (q1 == q2), dreieckig
 * (ein Wert 0) und trapezfoermig ab — mehr Ausdruckskraft braucht der Typ nicht,
 * weil die Eingabe (fem-loads) per Konstruktion stueckweise linear ist.
 * Sprungstellen zwischen Abschnitten sieht das Element explizit und splittet
 * dort die (spaetere) Gauss-Integration.
 */
export type LineLoadSegment = {
  /** Abschnittsanfang entlang lokaler x [m], 0..L. */
  from: number;
  /** Abschnittsende entlang lokaler x [m], from..L. */
  to: number;
  /** Axiale Streckenlast bei `from` / `to` [kN/m]. */
  qx1: number;
  qx2: number;
  /** Quer-Streckenlast bei `from` / `to` [kN/m]. */
  qz1: number;
  qz2: number;
  /** Strecken-Moment bei `from` / `to` [kNm/m]. */
  my1: number;
  my2: number;
};

/**
 * Eine punktuelle Last auf dem Stab an lokaler Position `a` (0 <= a <= L,
 * entlang der Stabachse gemessen).
 */
export type PointElementLoad = {
  /** Position entlang lokaler x [m], 0..L. */
  a: number;
  /** Axiale Einzelkraft [kN]. */
  px: number;
  /** Quer-Einzelkraft [kN]. */
  pz: number;
  /** Einzelmoment [kNm]. */
  my: number;
};

/**
 * Alle auf EIN Element aufgeloesten Lasten, gebuendelt: fem-load-resolve
 * verschmilzt saemtliche an einem Stab anliegenden Lasten zu einem Objekt,
 * damit `consistentLoad` die Sprungstellen an einer Stelle sieht und nicht ueber
 * eine Liste einzelner Lasten iterieren und selbst summieren muss.
 */
export type LocalElementLoad = {
  segments: LineLoadSegment[];
  points: PointElementLoad[];
};

/**
 * Eine an `props` und `L` gebundene Elementinstanz. Die Fabrik `prepare`
 * berechnet den Schubparameter φ GENAU EINMAL; alle Methoden teilen sich
 * dasselbe φ, sodass Steifigkeit, Ansatzfunktionen und Schnittgroessen nicht
 * mit unterschiedlichem φ auseinanderdriften koennen.
 */
export type PreparedElement = {
  /** Lokale 6x6-Steifigkeitsmatrix. */
  stiffness(): Matrix6;
  /**
   * Konsistenter Ersatzknotenvektor (= f_e). Nutzt die element-eigenen
   * Ansatzfunktionen — dieselben N wie fuer die Verschiebung, nie gemischt.
   */
  consistentLoad(load: LocalElementLoad): Vector6;
  /**
   * Schnittgroessen an lokaler Stelle `x` aus den Knotenverschiebungen und der
   * Originallast. Liegt hier (nicht im Solver), weil die Rekonstruktion des
   * Verlaufs zwischen den Knoten die element-eigenen Ansatzfunktionen braucht.
   */
  internalForces(
    x: number,
    dLocal: Vector6,
    load: LocalElementLoad,
  ): { N: number; V: number; M: number };
  /** Ansatzfunktionen an lokaler Stelle `x` (fuer Tests und Verlaeufe). */
  shapeFunctions(x: number): { Nu: number[]; Nw: number[]; Ntheta: number[] };
};

/**
 * Eine Elementformulierung ist ein untrennbares Paket aus Kinematik,
 * Ansatzfunktionen, Steifigkeit, konsistentem Lastvektor und
 * Schnittgroessen-Rekonstruktion. Der Solver kennt nur dieses Interface und
 * NIE die Balkentheorie: tritt Timoshenko neben Euler-Bernoulli, bleibt der
 * Solver unberuehrt — das ist der Lackmustest, ob die Grenze haelt.
 */
export type FrameElement2DFormulation = {
  prepare(props: SectionProperties, L: number): PreparedElement;
};
