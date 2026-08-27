import type { ReinforcementLayer, Ring } from '@baustatik/cross-section';
import { IPE, HEA } from '@baustatik/steel-profiles';

/**
 * Die vorgegebenen Querschnitte der Demo — RINGE, kein Wandgraph.
 *
 * Jeder Satz ist ein Umrissmodell (`kind: 'outline'`): geschlossene Ringe aus
 * `Vertex`, mehr nicht. Es gibt keine Wandstaerke, keine Mittellinie und keine
 * `idealisation` — der Typ laesst sie in diesem Zweig gar nicht zu
 * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)),
 * denn ein freier Umriss hat keine Linien, laengs derer ein Schubfluss laufen
 * koennte.
 *
 * DER UNTERSCHIED ZUR SEITE „MITTELLINIEN-QUERSCHNITTE" IST DER GANZE PUNKT.
 * Dort ist der Umriss ein ERGEBNIS: die Waende werden um `t/2` aufgeweitet und
 * vereinigt (ADR 0037). Hier BESCHREIBT der Ring den Umriss bereits, und
 * `deriveOutlineFromRings` tut nur noch eines — die Boegen in Sehnen zerlegen.
 * Deshalb wirkt auf dieser Seite `discretisationTolerance` und nicht `miterLimit`: es wird
 * nichts aufgeweitet, also entsteht auch keine Miter-Ecke.
 *
 * > **Material laeuft mit `signedArea > 0`, ein Loch mit `< 0`.**
 *
 * Die Regel des `Ring` steht hier nicht zufaellig: der Hohlkasten unten ist der
 * einzige Satz mit zwei Ringen, und sein Innenring laeuft ANDERSHERUM als der
 * Aussenring. Das ist die ganze Lochbehandlung — kein Verschachtelungstest, kein
 * Sonderfall in `green.ts`
 * ([ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 *
 * DAS BEZUGSSYSTEM IST DAS DER ANDEREN BEIDEN SEITEN: `y = 0` auf der
 * senkrechten Symmetrieachse, `z = 0` an der OBERKANTE, `z` nach unten
 * ([ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md)). Nur so ist
 * `zs` dieselbe Zahl wie dort.
 *
 * ABMESSUNGEN IN MILLIMETERN, wie `Vertex.y` und `Vertex.z`.
 */
export type OutlinePreset = {
  readonly id: string;
  readonly name: string;
  /** Die Abmessungen in einer Zeile, wie sie im Katalog stehen. */
  readonly dimensions: string;
  /** Was an diesem Satz zu sehen ist — und woher seine Zahlen kommen. */
  readonly note: string;
  readonly rings: readonly Ring[];
  /**
   * Die Bewehrungslagen, wo der Satz welche hat
   * ([ADR 0064](../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
   *
   * ABWESEND HEISST „KEINE BEWEHRUNG" und nicht „noch nicht eingegeben" — der
   * Regelfall der Saetze hier, die alle Stahlfiguren sind. Nur der
   * Stahlbetonbalken traegt welche, und er ist deshalb dabei: ohne ihn haette
   * die Bande nichts zu zeigen.
   *
   * DIE KOORDINATEN SIND ABSOLUT, im Rahmen der `rings` daneben: `y = 0` auf
   * der Symmetrieachse, `z = 0` an der Oberkante, `z` nach unten (ADR 0031).
   * `As` und `Asmax` in cm², wie der Bewehrungsplan sie schreibt.
   */
  readonly reinforcement?: readonly ReinforcementLayer[];
  /**
   * Die Zahl, gegen die dieser Satz gehalten wird — der eigentliche Zweck der
   * Seite.
   *
   * Jeder Querschnitt hier hat eine zweite Quelle fuer dieselben Werte: eine
   * Handrechnung, das Mittellinienmodell derselben Figur oder die Katalogzeile.
   * Sie steht MIT im Satz, damit die Abweichung auf der Seite ausgerechnet wird
   * und nicht im Kopf des Lesers.
   *
   * EINHEITEN WIE IN DER ANZEIGE: `A` in cm², `Iy`/`Iz` in cm⁴.
   */
  readonly reference: {
    readonly label: string;
    readonly A: number;
    readonly Iy: number;
    readonly Iz: number;
  };
};

/**
 * Die Woelbung eines VIERTELKREISES: `bulge = tan(Δ/4)` mit `Δ = π/2`.
 *
 * Das Vorzeichen bleibt am Aufrufer, denn es haengt an der DURCHLAUFRICHTUNG
 * und an der Kruemmung: positiv dreht von `+y` nach `+z` (ADR 0031). Die
 * AUSSENecke eines im Bilduhrzeigersinn umlaufenen Rings braucht `+`, die
 * einspringende Ausrundung eines IPE-Stegansatzes im selben Umlauf `−`.
 *
 * `bulge` GEHOERT DER ABGEHENDEN KANTE: der Wert an einem Vertex woelbt die
 * Kante zum NAECHSTEN. Deshalb steht er hier immer am ERSTEN Punkt des Bogens.
 */
const QUARTER_BULGE = Math.tan(Math.PI / 8);

/**
 * Rechteckiger Vollquerschnitt — EIN RING, VIER PUNKTE, keine Naeherung.
 *
 * Der Satz, an dem sich die Rechenstrecke gegen die Formel pruefen laesst:
 * `A = b·h`, `Iy = b·h³/12`, `Iz = h·b³/12` fallen EXAKT heraus, weil Green
 * ueber ein Polygon aus geraden Kanten exakt integriert — hier wird nichts
 * diskretisiert. `discretisationTolerance` aendert an diesen Zahlen deshalb nichts, und
 * genau das soll man am Regler sehen.
 *
 * DAS IST DER FALL, DEN DAS MITTELLINIENMODELL NICHT KANN. Einem
 * Vollquerschnitt ist keine Wandstaerke zuzuordnen — ihn als eine Wand mit
 * `t = 200` zu zeichnen hiesse, seine Hoehe zur Dicke zu erklaeren. Dafuer gibt
 * es die `outline`-Variante.
 *
 * DER UMLAUFSINN: von der oberen linken Ecke nach `+y`, dann nach `+z`. Das ist
 * die positive Drehung und damit `signedArea > 0` — Material.
 */
function rectangle(): Pick<OutlinePreset, 'rings' | 'reference'> {
  const b = 200;
  const h = 300;
  const y = b / 2;

  return {
    rings: [
      {
        vertices: [
          { y: -y, z: 0 },
          { y, z: 0 },
          { y, z: h },
          { y: -y, z: h },
        ],
      },
    ],
    reference: {
      label: 'Handrechnung b·h und b·h³/12',
      A: (b * h) / 100,
      Iy: (b * h ** 3) / 12 / 1e4,
      Iz: (h * b ** 3) / 12 / 1e4,
    },
  };
}

/**
 * Plattenbalken 2000/200/250/500 — EIN RING, ACHT PUNKTE, keine Naeherung.
 *
 * Derselbe Querschnitt wie „Plattenbalken 2000/200/250/500 — solid" auf der
 * Seite „Parametrische Querschnitte": der Fall, der Steiner prueft. `zs =
 * 139,5 mm` liegt IM GURT (`hf = 200 mm`) — der Schwerpunkt faellt in die
 * Platte, und genau das ist die Aussage dieses Satzes. Wie beim Rechteck gibt
 * es hier keinen Bogen und damit keine Diskretisierung: Green integriert ueber
 * gerade Kanten exakt, und die Zahlen treffen die Handrechnung auf jede Stelle.
 *
 * DER UNTERSCHIED ZUM PARAMETRISCHEN VORBILD. Dort ist der Plattenbalken eine
 * Form mit `idealisation`; hier ist er ein freier Umriss, und der traegt keine
 * Wandstaerke ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
 * Die Querschnittswerte sind trotzdem DIESELBEN: das duennwandige Modell
 * rechnet `A`, `Iy`, `Iz` aus der Umrissfigur, also aus genau diesem Ring
 * (CONTEXT.md: „die bekannte Luecke"). Die Vergleichsspalte ist damit ein
 * Exaktheitsbeweis, kein Naeherungsvergleich.
 *
 * UMLAUFSINN wie beim Rechteck: von der oberen linken Ecke nach `+y`, an der
 * Gurtunterkante nach innen, dann an der Stegflanke nach `+z` — im
 * Bilduhrzeigersinn, `signedArea > 0`, Material.
 */
function plattenbalken(): Pick<OutlinePreset, 'rings' | 'reference'> {
  const bf = 2000;
  const hf = 200;
  const bw = 250;
  const h = 500;
  const yFlange = bf / 2;
  const yWeb = bw / 2;

  return {
    rings: [
      {
        vertices: [
          { y: -yFlange, z: 0 },
          { y: yFlange, z: 0 },
          { y: yFlange, z: hf },
          { y: yWeb, z: hf },
          { y: yWeb, z: h },
          { y: -yWeb, z: h },
          { y: -yWeb, z: hf },
          { y: -yFlange, z: hf },
        ],
      },
    ],
    reference: {
      label: 'Parametrische Form t-section, solid (Seite „Parametrische Querschnitte")',
      A: 4750,
      Iy: 584320.1754385965,
      Iz: 13372395.833333334,
    },
  };
}

/**
 * Geschweisstes, doppeltsymmetrisches I — DERSELBE QUERSCHNITT wie
 * „I-Profil, geschweisst" auf der Seite „Mittellinien-Querschnitte".
 *
 * Zwoelf Punkte, scharfe Ecken, keine Ausrundung: genau die Figur, die dort aus
 * fuenf Waenden entsteht. Und die Zahlen sind DIESELBEN, nicht bloss aehnlich —
 * `A = 27,248 cm²`, `Iy = 1845,590 cm⁴`, `Iz = 141,934 cm⁴` stimmen auf zwoelf
 * Stellen ueberein.
 *
 * DASS SIE EXAKT UEBEREINSTIMMEN, IST DIE AUSSAGE DIESES SATZES. Die Aufweitung
 * um `t/2` mit Miter-Ecken erzeugt hier keinen Naeherungsfehler: der Steg laeuft
 * bis in die Gurtmittellinie, die Ueberdeckung faellt bei der Vereinigung
 * heraus, und was uebrig bleibt, ist genau dieses Zwoelfeck. Waere `JoinType` auf
 * `Round` gestellt, waere es das nicht mehr — deshalb ist er festgenagelt
 * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
 *
 * Die Abmessungen stammen aus `examples/i-symmetric.ts`, damit derselbe
 * Querschnitt auf allen drei Seiten der Demo dieselbe Zeile hat.
 */
function weldedI(): Pick<OutlinePreset, 'rings' | 'reference'> {
  const h = 200;
  const b = 100;
  const tw = 5.6;
  const tf = 8.5;
  // Die AUSSENKANTE des Gurts und die Stegflanke — hier steht kein `t/2` mehr,
  // der Ring beschreibt den Umriss unmittelbar.
  const yFlange = b / 2;
  const yWeb = tw / 2;

  return {
    rings: [
      {
        // Im Umlaufsinn `+y → +z → −y → −z`, also im Bilduhrzeigersinn
        // (`z` zeigt nach unten): `signedArea > 0`, Material.
        vertices: [
          { y: -yFlange, z: 0 },
          { y: yFlange, z: 0 },
          { y: yFlange, z: tf },
          { y: yWeb, z: tf },
          { y: yWeb, z: h - tf },
          { y: yFlange, z: h - tf },
          { y: yFlange, z: h },
          { y: -yFlange, z: h },
          { y: -yFlange, z: h - tf },
          { y: -yWeb, z: h - tf },
          { y: -yWeb, z: tf },
          { y: -yFlange, z: tf },
        ],
      },
    ],
    reference: {
      label: 'Mittellinienmodell derselben Figur (Seite „Mittellinien-Querschnitte")',
      A: 27.248,
      Iy: 1845.5902266667,
      Iz: 141.9344810667,
    },
  };
}

/**
 * IPE 300 nachmodelliert — MIT den vier Stegausrundungen, gegen die
 * Katalogzeile.
 *
 * DIE ABMESSUNGEN KOMMEN AUS DEM KATALOG SELBST (`@baustatik/steel-profiles`),
 * nicht aus einer abgetippten Zeile: `h`, `b`, `tw`, `tf` und `r` werden aus
 * derselben Zeile gelesen, gegen deren `A`, `Iy` und `Iz` das Ergebnis danach
 * gehalten wird. Eine hier hingeschriebene `10,7` koennte gegenueber der
 * Tabelle abdriften — und ausgerechnet dieser Satz will ja die Abweichung
 * MESSEN.
 *
 * DIE AUSRUNDUNG IST EINSPRINGEND, und daran haengt das Vorzeichen: der Bogen
 * verbindet die Gurtunterseite tangential mit der Stegflanke, sein Mittelpunkt
 * liegt AUSSERHALB des Materials. Im positiven Umlauf dreht er deshalb um
 * `−90°`, waehrend die Aussenecken des Hohlkastens weiter unten um `+90°`
 * drehen.
 *
 * WAS DIE ABWEICHUNG BEDEUTET: die Katalogzeile ist ein TABELLENWERT der Norm,
 * gerundet und nicht nachgerechnet (siehe den Kopf von
 * `steel-profiles/src/data/ipe.ts`). Der Umriss hier ist eine ehrliche
 * Integration ueber ein Polygon, dessen Boegen unter `discretisationTolerance` zerlegt
 * sind. Sie treffen sich auf rund 0,02 % — `A` und `Iy` weichen in der VIERTEN
 * signifikanten Stelle ab (53,82 gegen 53,81 cm², 8357 gegen 8356 cm⁴), `Iz`
 * noch weniger. Eine Abweichung in der dritten waere ein Fehler.
 */
function ipe300(): Pick<OutlinePreset, 'rings' | 'reference'> {
  const row = IPE['IPE 300'];
  const { h, b, tw, tf, r } = row;
  const yFlange = b / 2;
  const yWeb = tw / 2;
  // Die beiden Gurtinnenseiten — dort setzen die Ausrundungen tangential an.
  const zTop = tf;
  const zBottom = h - tf;

  return {
    rings: [
      {
        vertices: [
          { y: -yFlange, z: 0 },
          { y: yFlange, z: 0 },
          { y: yFlange, z: zTop },
          // Tangentenpunkt auf der Gurtunterseite, Bogen zur Stegflanke.
          { y: yWeb + r, z: zTop, bulge: -QUARTER_BULGE },
          { y: yWeb, z: zTop + r },
          { y: yWeb, z: zBottom - r, bulge: -QUARTER_BULGE },
          { y: yWeb + r, z: zBottom },
          { y: yFlange, z: zBottom },
          { y: yFlange, z: h },
          { y: -yFlange, z: h },
          { y: -yFlange, z: zBottom },
          { y: -(yWeb + r), z: zBottom, bulge: -QUARTER_BULGE },
          { y: -yWeb, z: zBottom - r },
          { y: -yWeb, z: zTop + r, bulge: -QUARTER_BULGE },
          { y: -(yWeb + r), z: zTop },
          { y: -yFlange, z: zTop },
        ],
      },
    ],
    reference: {
      label: 'Katalogzeile IPE 300 (Querschnittsdatenbank)',
      A: row.A,
      Iy: row.Iy,
      Iz: row.Iz,
    },
  };
}

/**
 * Hohlkasten mit Eckausrundung — ZWEI RINGE, und der zweite ist das LOCH.
 *
 * Der Satz, an dem sich die Windungsregel ansehen laesst: der Aussenring laeuft
 * `+y → +z → −y → −z` und traegt `signedArea > 0`, der Innenring laeuft
 * ANDERSHERUM und traegt `< 0`. Green summiert beide, das Loch faellt von selbst
 * heraus — es gibt keinen Verschachtelungstest auf der Rechenstrecke
 * (ADR 0034). Wer den Innenring versehentlich gleichsinnig legt, bekommt kein
 * falsches Ergebnis, sondern einen Befund: `NegativeOutlineAreaError` oder
 * `UnnestedHoleWarning`.
 *
 * DIESELBE FIGUR WIE „HOHLKASTEN MIT ECKAUSRUNDUNG" auf der Seite
 * „Mittellinien-Querschnitte" — dort acht Waende der Dicke `t = 10` mit
 * Mittellinienradius `r = 25`, hier die beiden Ringe, die daraus entstehen:
 * aussen `r + t/2 = 30`, innen `r − t/2 = 20`.
 *
 * DIE ZAHLEN GEHEN AUSEINANDER, ANDERS ALS BEIM I — und das ist kein Fehler,
 * sondern die Diskretisierung. Der Umriss dort wird aus AUFGEWEITETEN Boegen
 * gebaut, der hier aus den Ringboegen selbst; beide zerlegen in Sehnen, aber
 * nicht in dieselben. Die Abweichung liegt bei 0,002 % bis 0,004 % und wandert
 * sichtbar, wenn man `discretisationTolerance` verstellt.
 */
function roundedBox(): Pick<OutlinePreset, 'rings' | 'reference'> {
  const b = 200;
  const h = 400;
  const t = 10;
  const outerR = 30;
  const innerR = 20;
  const yOuter = b / 2;
  const yInner = b / 2 - t;

  return {
    rings: [
      {
        // AUSSEN: im Umlaufsinn `+y → +z → −y → −z`. Jede Ecke ist konvex und
        // dreht um `+90°`, deshalb tragen alle vier Boegen dasselbe Vorzeichen.
        vertices: [
          { y: -yOuter + outerR, z: 0 },
          { y: yOuter - outerR, z: 0, bulge: QUARTER_BULGE },
          { y: yOuter, z: outerR },
          { y: yOuter, z: h - outerR, bulge: QUARTER_BULGE },
          { y: yOuter - outerR, z: h },
          { y: -yOuter + outerR, z: h, bulge: QUARTER_BULGE },
          { y: -yOuter, z: h - outerR },
          { y: -yOuter, z: outerR, bulge: QUARTER_BULGE },
        ],
      },
      {
        // INNEN: derselbe Weg RUECKWAERTS, also `−y → +z → +y → −z`. Damit ist
        // `signedArea < 0` — ein Loch. Die Boegen sind weiterhin konvex zur
        // Lochmitte hin und drehen im umgekehrten Umlauf um `−90°`.
        vertices: [
          { y: yInner - innerR, z: t },
          { y: -yInner + innerR, z: t, bulge: -QUARTER_BULGE },
          { y: -yInner, z: t + innerR },
          { y: -yInner, z: h - t - innerR, bulge: -QUARTER_BULGE },
          { y: -yInner + innerR, z: h - t },
          { y: yInner - innerR, z: h - t, bulge: -QUARTER_BULGE },
          { y: yInner, z: h - t - innerR },
          { y: yInner, z: t + innerR, bulge: -QUARTER_BULGE },
        ],
      },
    ],
    reference: {
      label: 'Mittellinienmodell derselben Figur (Seite „Mittellinien-Querschnitte")',
      A: 111.70538,
      Iy: 22650.785,
      Iz: 7775.0707,
    },
  };
}

/**
 * Stahlbetonbalken 300/500 mit Bewehrung — DER EINE SATZ MIT `reinforcement`
 * ([ADR 0064](../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
 *
 * Die Figur ist dieselbe wie beim Rechteck oben: ein Ring, vier Punkte, Green
 * integriert exakt. DAS IST DER PUNKT — die Bewehrung aendert an `A`, `Iy` und
 * `Iz` NICHTS, und die Vergleichsspalte gegen `b·h` und `b·h³/12` sagt
 * „exakt", obwohl fuenf Staebe im Bild stehen. Das eingegebene `As` ist der
 * ANFANGSWERT einer Bemessung und keine Aussage ueber den fertigen Querschnitt.
 *
 * UNTEN DREI Ø24 (`As = π·24²/4 = 452,4 mm²` je Stab), mit `Asmax` auf dem
 * Doppelten: die Lage darf wachsen. OBEN ZWEI Ø16 mit `Asmax === As` — das ist
 * die Art, „nicht erhoehen" zu sagen, und es ist kein Flag daneben.
 *
 * DIE ACHSABSTAENDE sind 50 mm oben wie unten (`z = 50` und `z = 450`) — eine
 * runde Zahl fuer die Anschauung, kein Nachweis der Betondeckung. Der gehoert
 * `@baustatik/concrete-design` (ADR 0056), und das Gate hier prueft ihn
 * ausdruecklich nicht.
 */
function stahlbetonbalken(): Pick<
  OutlinePreset,
  'rings' | 'reference' | 'reinforcement'
> {
  const b = 300;
  const h = 500;
  const y = b / 2;
  const area = (d: number) => Math.round((Math.PI * d ** 2) / 4) / 100;
  const As24 = area(24);
  const As16 = area(16);

  return {
    rings: [
      {
        vertices: [
          { y: -y, z: 0 },
          { y, z: 0 },
          { y, z: h },
          { y: -y, z: h },
        ],
      },
    ],
    reinforcement: [
      {
        id: 'unten',
        elements: [
          { id: 'u1', y: -100, z: 450, As: As24, Asmax: 2 * As24 },
          { id: 'u2', y: 0, z: 450, As: As24, Asmax: 2 * As24 },
          { id: 'u3', y: 100, z: 450, As: As24, Asmax: 2 * As24 },
        ],
      },
      {
        id: 'oben',
        elements: [
          { id: 'o1', y: -100, z: 50, As: As16, Asmax: As16 },
          { id: 'o2', y: 100, z: 50, As: As16, Asmax: As16 },
        ],
      },
    ],
    reference: {
      label: 'Handrechnung b·h und b·h³/12 — OHNE die Bewehrung (ADR 0064)',
      A: (b * h) / 100,
      Iy: (b * h ** 3) / 12 / 1e4,
      Iz: (h * b ** 3) / 12 / 1e4,
    },
  };
}

/** Die Auswahl der Seite, in der Reihenfolge, in der sie rechts steht. */
export const OUTLINE_PRESETS: readonly OutlinePreset[] = Object.freeze([
  {
    id: 'rechteck-200x300',
    name: 'Rechteck, Vollquerschnitt',
    dimensions: 'b 200 · h 300',
    note:
      'Ein Ring aus vier Punkten, keine Boegen. Green integriert ueber gerade Kanten ' +
      'exakt: A, Iy und Iz treffen die Formel auf jede Stelle, und discretisationTolerance aendert ' +
      'daran nichts. Ein Vollquerschnitt hat keine Wandstaerke — als Mittellinienmodell ' +
      'ist er nicht darstellbar.',
    ...rectangle(),
  },
  {
    id: 'stahlbetonbalken-300x500',
    name: 'Stahlbetonbalken mit Bewehrung',
    dimensions: 'b 300 · h 500 · unten 3 Ø24 · oben 2 Ø16',
    note:
      'Der einzige Satz mit reinforcement (ADR 0064). Die Bewehrung ist EINGABE und ' +
      'keine Rechnung: A, Iy und Iz sind auf die letzte Stelle dieselben wie ohne sie, ' +
      'und die Vergleichsspalte sagt „exakt". Das eingegebene As ist der Anfangswert ' +
      'einer Bemessung — es in die Steifigkeit zu multiplizieren hiesse, mit einer Zahl ' +
      'zu rechnen, die die Bemessung gerade fuer falsch erklaert. Unten Asmax = 2·As ' +
      '(darf wachsen), oben Asmax = As (eingefroren).',
    ...stahlbetonbalken(),
  },
  {
    id: 'plattenbalken-2000x200x250x500',
    name: 'Plattenbalken, Vollquerschnitt',
    dimensions: 'bf 2000 · hf 200 · bw 250 · h 500',
    note:
      'Der Fall, der Steiner prueft: zs = 139,5 mm liegt IM Gurt (hf = 200 mm). ' +
      'Acht Punkte, keine Boegen — Green integriert exakt, die Zahlen treffen die ' +
      'Handrechnung A = bf·hf + bw·(h − hf) = 4750 cm² auf jede Stelle. Dieselbe ' +
      'Figur wie „Plattenbalken 2000/200/250/500 — solid" auf der Seite ' +
      '„Parametrische Querschnitte".',
    ...plattenbalken(),
  },
  {
    id: 'i-200-geschweisst',
    name: 'I-Profil, geschweisst',
    dimensions: 'h 200 · b 100 · tw 5,6 · tf 8,5',
    note:
      'Derselbe Querschnitt wie auf der Seite „Mittellinien-Querschnitte", dort aus fuenf ' +
      'Waenden abgeleitet. Die Zahlen stimmen auf zwoelf Stellen ueberein: die Aufweitung ' +
      'um t/2 mit Miter-Ecken liefert exakt dieses Zwoelfeck.',
    ...weldedI(),
  },
  {
    id: 'ipe-300-modelliert',
    name: 'IPE 300, nachmodelliert',
    dimensions: 'h 300 · b 150 · tw 7,1 · tf 10,7 · r 15',
    note:
      'Sechzehn Punkte, davon vier einspringende Viertelkreise am Stegansatz. Gehalten ' +
      'gegen die Katalogzeile, aus der auch die Abmessungen stammen. Die Tabelle ist ' +
      'gerundet und nicht nachgerechnet — die rund 0,02 % Unterschied in A und Iy sind ' +
      'zu erwarten, eine Abweichung in der dritten signifikanten Stelle waere ein Fehler.',
    ...ipe300(),
  },
  {
    id: 'kasten-200x400x10-r30',
    name: 'Hohlkasten mit Eckausrundung',
    dimensions: 'b 200 · h 400 · t 10 · r 30 aussen / 20 innen',
    note:
      'Zwei Ringe mit ENTGEGENGESETZTEM Umlaufsinn — aussen Material, innen Loch. Green ' +
      'summiert beide vorzeichenrichtig; ein Verschachtelungstest kommt auf der ' +
      'Rechenstrecke nicht vor. Gegen das Mittellinienmodell derselben Figur bleiben ' +
      '0,002 % bis 0,004 % Unterschied aus der Bogendiskretisierung.',
    ...roundedBox(),
  },
]);
