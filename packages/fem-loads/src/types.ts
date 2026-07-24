/**
 * Fachliches Lastmodell fuer das ebene Stabwerk.
 *
 * Reine Typen: keine Aufloesung auf Weltkoordinaten, keine Ersatzknotenlasten,
 * keine Lastfaelle. Ziele werden ueber ids referenziert, deshalb braucht diese
 * Datei keinen Import aus @baustatik/fem.
 *
 * VORZEICHEN: z zeigt nach unten (Baustatik-Konvention, wie in fem-geometry).
 * Eine nach unten wirkende Last ist damit POSITIV.
 *
 * DREHSINN: das globale y zeigt AUS der Zeichenebene heraus — das ist bei
 * x nach rechts und z nach unten die einzige rechtshaendige Wahl (z x x = y).
 * Ein positives Moment dreht deshalb nach der Rechte-Hand-Regel im Bild
 * GEGEN den Uhrzeigersinn, also von +z nach +x. So zeigt es RSTAB
 * (apps/demo/Knotenlast1.png, apps/demo/stabachsen.png).
 *
 * ACHTUNG, das ist NICHT der Drehsinn von `theta` in @baustatik/fem-element:
 * dort ist `theta = dw/dx` positiv von +x nach +z, also im Bild MIT dem
 * Uhrzeigersinn. Es gilt `phiY = -theta`. Beide Konventionen sind fuer sich
 * richtig; die Umrechnung leistet nicht dieses Package, sondern
 * @baustatik/fem-load-resolve (beim Durchreichen von Stab-Momentlasten) und
 * spaeter die 6x6-Transformation im Solver. Die beiden Vorzeichenwechsel
 * heben sich auf — global kommt wieder das an, was hier eingegeben wurde.
 *
 * EINHEITEN stehen als Kommentar am Feld. Bewusst blanke `number` und keine
 * gebrandeten Quantity-Typen wie in @baustatik/material: dieses Package soll
 * wie @baustatik/fem abhaengigkeitsfrei bleiben. Nachruesten ist moeglich,
 * sobald die Einheiten wirklich gemischt werden.
 */

/**
 * Bezugssystem der Lastrichtung.
 *
 * 'global' — Achsen des Modells, 'local' — Achsen des Stabes (x laengs,
 * z senkrecht zur Stabachse). Am waagrechten Stab fallen beide zusammen;
 * unterscheidbar wird es erst am schraegen Stab.
 */
export type LoadFrame = 'global' | 'local';

/** Achse innerhalb des Bezugssystems. y entfaellt: die Ebene ist x-z. */
export type LoadAxis = 'x' | 'z';

/**
 * Laenge, auf die der Wert einer Streckenlast bezogen ist.
 *
 * Achtung beim Vergleich mit RFEM: dort heisst die Option nach der
 * BLICKRICHTUNG, hier nach der GEMESSENEN Ausdehnung.
 *
 *   'trueLength'           — wahre Stablaenge (RFEM: "Wahre Stablaenge")
 *   'horizontalProjection' — x-Ausdehnung, Grundriss (RFEM: "Projektion in Z").
 *                            Der Schneefall.
 *   'verticalProjection'   — z-Ausdehnung, Ansicht  (RFEM: "Projektion in X")
 *
 * Nur im 2D-Stabwerk relevant. Im 1D-Durchlauftraeger liegen alle Staebe
 * waagrecht; dort ist einzig 'trueLength' sinnvoll, was die Eingabe
 * einschraenkt — nicht der Typ.
 */
export type ReferenceLength =
  | 'trueLength'
  | 'horizontalProjection'
  | 'verticalProjection';

/**
 * Woher die Last stammt. Fehlt das Feld, ist die Last von Hand eingegeben.
 * Generatoren gibt es noch nicht; der Typ haelt nur den Platz frei.
 */
export type LoadOrigin =
  | { kind: 'manual' }
  | { kind: 'self-weight' }
  | { kind: 'generated'; generatorId: string };

/** Gemeinsame Felder aller Lasten. */
type LoadBase = {
  id: string;
  origin?: LoadOrigin;
  /** Freitext des Anwenders, wird nicht ausgewertet. */
  comment?: string;
};

/**
 * Knotenlast — KOMPONENTENWEISE im globalen System.
 *
 * Anders als die Stablast traegt sie Kraft und Moment gleichzeitig: die drei
 * Komponenten sind eine Last mit einer id. Eine Komponente entfaellt durch
 * Weglassen; mindestens eine muss ungleich 0 sein.
 */
export type NodeLoad = LoadBase & {
  target: 'node';
  /** Dieselbe Last kann an mehreren Knoten haengen. Nie leer. */
  nodeIds: string[];
  /** kN, global */
  fx?: number;
  /** kN, global, positiv nach unten */
  fz?: number;
  /**
   * kNm, Drehung um die globale y-Achse (zeigt aus der Ebene heraus).
   * Positiv = im Bild gegen den Uhrzeigersinn, siehe DREHSINN im Dateikopf.
   *
   * Diese Groesse geht UNVERAENDERT in den globalen Lastvektor: eine
   * Knotenlast laeuft nie durch ein Element und braucht deshalb den
   * Vorzeichenwechsel nach `theta` nicht, den eine Stab-Momentlast braucht.
   */
  my?: number;
};

/** Gemeinsame Felder aller Stablasten. */
type BeamLoadBase = LoadBase & {
  target: 'beam';
  /** Dieselbe Last kann auf mehreren Staeben liegen. Nie leer. */
  beamIds: string[];
};

/**
 * Richtung einer Stab-KRAFT: eine Achse in einem Bezugssystem. Es gibt bewusst
 * keinen Kraftvektor {fx, fz} auf dem Stab — zwei Richtungen sind zwei Lasten.
 * So gibt es der Anwender ein, und so bleibt die Darstellung eine
 * Pfeilrichtung statt einer Resultierenden.
 */
type BeamForceDirection = {
  frame: LoadFrame;
  axis: LoadAxis;
};

/**
 * Bezugslaenge einer STRECKENlast — getrennt von der Richtung, weil sie nur an
 * Streckenlasten haengt.
 *
 * Die Einzellast traegt sie NICHT: `p` ist in kN angegeben, nicht je Laenge,
 * und eine Bezugslaenge skaliert `Wert x L_proj/L`. An einer Gesamtkraft gibt
 * es nichts zu skalieren. Dieselbe Begruendung, mit der die Momentenlast
 * `frame`/`axis` verloren hat: ein Feld ohne Wirkung waere Zustand, den
 * Zeichnen und Solver mitschleppen und ignorieren muessten.
 */
type BeamForceReference = {
  referenceLength: ReferenceLength;
};

/**
 * Lage einer punktuellen Last auf dem Stab.
 *
 * Gemessen ab dem Anfangsknoten ENTLANG DER STABACHSE, unabhaengig von
 * `referenceLength` — die betrifft nur den Lastwert, nie die Lage.
 */
type PointPlacement = {
  /** Weltlaenge, oder Prozent der Stablaenge wenn relativeDistances gesetzt. */
  distanceFromStart: number;
  relativeDistances?: boolean;
};

/**
 * Ausdehnung einer trapezfoermigen Last: entweder ueber den ganzen Stab oder
 * ueber einen Teilabschnitt. Zwei Varianten statt optionaler Felder, weil
 * `fullLength` und `from`/`to` sich gegenseitig ausschliessen — im Dialog
 * sperrt die Checkbox die beiden Abstandsfelder.
 *
 * Es gilt 0 <= from <= to <= Stablaenge (bzw. <= 100 bei relativeDistances).
 * Das kann der Typ nicht ausdruecken und gehoert nach validate.ts.
 */
type TrapezoidalExtent =
  | { fullLength: true }
  | {
      fullLength?: false;
      /** Abstand zum ersten Wert, ab Stabanfang entlang der Stabachse. */
      from: number;
      /** Abstand zum zweiten Wert, ab Stabanfang entlang der Stabachse. */
      to: number;
      /** Gilt fuer from UND to gemeinsam, nicht pro Wert. */
      relativeDistances?: boolean;
    };

/** Einzellast auf dem Stab. */
export type BeamForcePointLoad = BeamLoadBase &
  BeamForceDirection &
  PointPlacement & {
    kind: 'force';
    distribution: 'point';
    /** kN */
    p: number;
  };

/**
 * Gleichstreckenlast. Liegt immer auf dem GANZEN Stab — ein konstanter
 * Teilabschnitt wird als Trapez mit q1 === q2 eingegeben. Deshalb hat diese
 * Variante keine Abstaende.
 */
export type BeamForceConstantLoad = BeamLoadBase &
  BeamForceDirection &
  BeamForceReference & {
    kind: 'force';
    distribution: 'constant';
    /** kN/m */
    q: number;
  };

/**
 * Trapezlast. Deckt Dreieckslast (ein Wert 0) und den konstanten
 * Teilabschnitt (q1 === q2) mit ab.
 */
export type BeamForceTrapezoidalLoad = BeamLoadBase &
  BeamForceDirection &
  BeamForceReference &
  TrapezoidalExtent & {
    kind: 'force';
    distribution: 'trapezoidal';
    /** kN/m, Wert am Anfang des Lastabschnitts */
    q1: number;
    /** kN/m, Wert am Ende des Lastabschnitts */
    q2: number;
  };

/**
 * Momentenlasten tragen weder `frame` noch `axis` noch `referenceLength`.
 *
 * Ein ebenes Moment dreht immer um y. Der RFEM-Dialog laesst zwar "Lokal y"
 * und "Global Y" waehlen, aber fuer einen Stab in der x-z-Ebene sind beide
 * dieselbe Achse — die Wahl hat keine beobachtbare Wirkung. Ein Feld, das
 * nichts aendert, waere Zustand, den Zeichnen und Solver mitschleppen und
 * ignorieren muessten. Sobald 3D dazukommt, kommt `frame` hier wieder rein.
 *
 * Die Bezugslaenge ist im Dialog ebenfalls auf die wahre Stablaenge
 * festgenagelt (Stablast6.png, Stablast7.png).
 */
export type BeamMomentPointLoad = BeamLoadBase &
  PointPlacement & {
    kind: 'moment';
    distribution: 'point';
    /** kNm, positiv im Bild gegen den Uhrzeigersinn (DREHSINN im Dateikopf). */
    m: number;
  };

/** Konstantes Streckenmoment ueber den ganzen Stab. */
export type BeamMomentConstantLoad = BeamLoadBase & {
  kind: 'moment';
  distribution: 'constant';
  /**
   * kNm/m — nicht kNm wie bei BeamMomentPointLoad. Gleicher Feldname, andere
   * Einheit; die Diskriminante ist `distribution`.
   * Drehsinn wie dort: positiv gegen den Uhrzeigersinn.
   */
  m: number;
};

/** Trapezfoermiges Streckenmoment. */
export type BeamMomentTrapezoidalLoad = BeamLoadBase &
  TrapezoidalExtent & {
    kind: 'moment';
    distribution: 'trapezoidal';
    /** kNm/m, Wert am Anfang des Lastabschnitts. Drehsinn wie `m`. */
    m1: number;
    /** kNm/m, Wert am Ende des Lastabschnitts. Drehsinn wie `m`. */
    m2: number;
  };

export type BeamForceLoad =
  | BeamForcePointLoad
  | BeamForceConstantLoad
  | BeamForceTrapezoidalLoad;

export type BeamMomentLoad =
  | BeamMomentPointLoad
  | BeamMomentConstantLoad
  | BeamMomentTrapezoidalLoad;

/**
 * Stablast. Kraft ODER Moment, nie beides in einer Last — anders als bei der
 * Knotenlast. Diskriminanten sind `kind` und `distribution`.
 */
export type BeamLoad = BeamForceLoad | BeamMomentLoad;

/** Jede Last des Modells. Diskriminante ist `target`. */
export type FEMLoad = NodeLoad | BeamLoad;
