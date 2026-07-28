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
 * Die an EINEM Stabende freigesetzten Freiheitsgrade.
 *
 * FORMGLEICH mit `BeamEndReleases` in `@baustatik/fem`, aber ein eigener Typ:
 * dieses Package ist abhaengigkeitsfrei und darf `fem` nicht importieren. Dass
 * die Namen sich decken, ist kein Zufall — ADR 0017 hat sie dort gerade
 * deshalb auf `{ u, w, theta }` gelegt, weil es das Vokabular DIESES Packages
 * ist. Die „Uebersetzung" im Solver ist damit ein Durchreichen.
 */
export type ElementEndReleases = {
  /** Laengs der Stabachse — das Normalkraftgelenk. */
  u?: true;
  /** Quer zur Stabachse — das Querkraftgelenk. */
  w?: true;
  /** Die Verdrehung — das gewoehnliche Momentengelenk. */
  theta?: true;
};

export type ElementReleases = {
  start?: ElementEndReleases;
  end?: ElementEndReleases;
};

/** Die drei Schnittgroessen des ebenen Stabs an EINER Stelle. */
export type SectionForces = {
  /** Normalkraft [kN], positiv = Zug. */
  N: number;
  /** Querkraft [kN], positiv auf dem positiven Schnittufer in +z-Richtung. */
  V: number;
  /** Biegemoment [kNm], positiv = Zug auf der lokalen +z-Seite. */
  M: number;
};

/**
 * Welcher einseitige Grenzwert an einer Sprungstelle gemeint ist.
 *
 * An einer Einzellast ist die Schnittgroesse UNSTETIG — es gibt dort keinen
 * einen Wert, und ein Aufrufer, der sich einen aussuchen muesste, raet. `left`
 * summiert die Einzellasten mit `a < x`, `right` die mit `a <= x`.
 */
export type Side = 'left' | 'right';

/**
 * Das serialisierbare Rechenergebnis EINES Stabs — alles, was noetig ist, um
 * `N`, `V` und `M` an jeder Stelle zu beantworten, ohne irgendwo nachzulesen.
 *
 * REINE DATEN: keine Closure, keine Klasseninstanz, nichts, was auf `config`
 * zeigt. Genau das macht ein abgelegtes Ergebnis moeglich — es ist klonbar,
 * serialisierbar, und es kann nicht veralten, weil es nichts nachschlaegt
 * ([ADR 0019](../../../docs/adr/0019-result-carries-an-evaluation-state.md)).
 */
export type ElementEvaluationState = {
  /** Stablaenge [m]. */
  L: number;
  /**
   * `[Fx1, Fz1, My1, Fx2, Fz2, My2]`, lokal, in DOF-Richtung — die
   * STABENDKRAEFTE `K d - f`, NICHT die Schnittgroessen. Die Vorzeichen
   * stimmen nicht ueberein; die Umrechnung leistet `internalForcesAt`.
   *
   * Selbstpruefende Eigenschaft: an einem freigesetzten Freiheitsgrad steht
   * exakt 0.
   */
  endForces: Vector6;
  /**
   * `[u1, w1, theta1, u2, w2, theta2]`, lokal. Die freigesetzten
   * Freiheitsgrade sind ZURUECKGERECHNET und tragen damit die Bewegung des
   * STABENDES, nicht die des Knotens.
   */
  endDisplacements: Vector6;
  /** Die Stablast, UNKONDENSIERT — das Gleichgewicht braucht sie im Original. */
  load: LocalElementLoad;
  /**
   * Proviant fuer die spaetere Biegelinie: aus `M/EI` (Kruemmung), `V/GAs`
   * (Schub, `GAs = 12*EI/(phi*L^2)`, `phi === 0` heisst schubstarr) und `N/EA`.
   * `phi` ist von aussen sonst unsichtbar — deshalb kommt der Datensatz vom
   * Element und nicht vom Solver.
   *
   * `kind` ist der Diskriminator und damit zugleich der Versionsmechanismus
   * (Muster wie `ActionCategory`, `BeamLoad`); es gibt bewusst kein
   * `schemaVersion`. `Timoshenko2D` und `Timoshenko2DIntegrated` liefern
   * DASSELBE `kind` — sie unterscheiden sich nur im Bau von `K`, nicht in der
   * Kinematik.
   */
  deformation: {
    kind: 'timoshenko-2d-iie';
    phi: number;
    EI: number;
    EA: number;
  };
};

/**
 * Die DRITTE Bindungsstufe: an `props`, `L`, die Releases UND die Last
 * gebunden.
 *
 * WARUM DIE LAST GEBUNDEN WIRD und nicht bei jedem Aufruf hereinkommt: die
 * Rueckrechnung des freigesetzten Freiheitsgrads
 * `d_i = (f[i] - sum_{j != i} K[i,j] * d_j) / K[i,i]` greift auf `f[i]` der
 * UNKONDENSIERTEN Last zu — `evaluate` rechnet buchstaeblich mit demselben
 * Vektor weiter wie `consistentLoad`. Zwei verschiedene Lasten ergaeben eine
 * falsche Endverformung UND falsche Stabendkraefte, beide plausibel aussehend.
 * Dieselbe Begruendung wie ADR 0003 fuer `prepare`, eine Ebene weiter.
 */
export type LoadedElement = {
  /**
   * Konsistenter Ersatzknotenvektor (= f_e), KONDENSIERT. Nutzt die
   * element-eigenen Ansatzfunktionen — dieselben N wie fuer die Verschiebung,
   * nie gemischt.
   */
  consistentLoad(): Vector6;
  /**
   * Der Auswertungszustand aus den LOKALEN Knotenverformungen des geloesten
   * Systems.
   *
   * Endverformungen aus den UNKONDENSIERTEN Zeilen, Stabendkraefte aus der
   * KONDENSIERTEN Matrix — genau diese Falle liegt hier in EINEM Aufruf und
   * nicht mehr beim Solver.
   */
  evaluate(dLocal: Vector6): ElementEvaluationState;
};

/**
 * Eine an `props`, `L` und die Releases gebundene Elementinstanz. Die Fabrik
 * `prepare` berechnet den Schubparameter φ GENAU EINMAL und kondensiert GENAU
 * EINMAL; alle Methoden teilen sich dasselbe φ und dieselbe kondensierte
 * Matrix, sodass Steifigkeit, Ansatzfunktionen und Schnittgroessen nicht
 * auseinanderdriften koennen.
 *
 * `stiffness()` und `shapeFunctions(x)` bleiben AUF DIESER Stufe, weil sie
 * nicht von der Last abhaengen: sonst muesste jeder Steifigkeitstest
 * (Quervergleich geschlossen <-> integriert, Locking-Sweep, Rangtest) eine
 * leere Last erfinden, ebenso jede spaetere Eigenwert- oder Knicklastrechnung.
 */
export type PreparedElement = {
  /** Lokale 6x6-Steifigkeitsmatrix, KONDENSIERT und lastunabhaengig. */
  stiffness(): Matrix6;
  /** Ansatzfunktionen an lokaler Stelle `x` (fuer Tests und Verlaeufe). */
  shapeFunctions(x: number): { Nu: number[]; Nw: number[]; Ntheta: number[] };
  /** Bindet die aufgeloeste Stablast. */
  withLoad(load: LocalElementLoad): LoadedElement;
};

/**
 * Eine Elementformulierung ist ein untrennbares Paket aus Kinematik,
 * Ansatzfunktionen, Steifigkeit, konsistentem Lastvektor und
 * Schnittgroessen-Rekonstruktion. Der Solver kennt nur dieses Interface und
 * NIE die Balkentheorie: tritt Timoshenko neben Euler-Bernoulli, bleibt der
 * Solver unberuehrt — das ist der Lackmustest, ob die Grenze haelt.
 */
export type FrameElement2DFormulation = {
  prepare(
    props: SectionProperties,
    L: number,
    releases?: ElementReleases,
  ): PreparedElement;
};
