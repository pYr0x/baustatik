import type { SectionNode, Wall } from '@baustatik/cross-section';

/**
 * Die vorgegebenen Querschnitte der Demo — WANDGRAPHEN, keine `ShapeSpec`.
 *
 * Jeder Satz ist ein Mittellinienmodell (`kind: 'midline'`): Knoten, Waende
 * mit Dicke, mehr nicht — die Idealisierung (duennwandig/Vollquerschnitt) ist
 * eine Deutung und wird auf der Seite gewaehlt, nicht im Satz mitgegeben
 * (ADR 0029). Der Umriss steht hier NICHT dabei — er wird auf Knopfdruck
 * abgeleitet
 * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)),
 * und genau das soll die Seite zeigen: die Eingabe ist der Graph, die
 * Umrisslinie ist ein Ergebnis.
 *
 * DIE ABMESSUNGEN SIND DIE DER BEISPIELE aus
 * `packages/cross-section/examples`, damit sich die Zahlen dieser Seite gegen
 * die parametrischen Formen halten lassen: dieselbe Figur, einmal aus der
 * Formel und einmal aus dem gezeichneten Umriss. Zwei Saetze haben dort kein
 * Gegenstueck (das Rohr und die beiden Ausrundungen) — bei ihnen steht die
 * Herkunft der Zahlen im `note`-Text.
 *
 * DAS BEZUGSSYSTEM IST DAS DER PARAMETRISCHEN FORMEN: `y = 0` auf der
 * senkrechten Symmetrieachse, `z = 0` an der OBERKANTE, `z` nach unten
 * ([ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md)). Nur so ist
 * `zs` dieselbe Zahl wie auf der Seite „Parametrische Querschnitte".
 *
 * ABMESSUNGEN IN MILLIMETERN, wie `Wall.t` und `SectionNode.y`.
 */
export type SectionPreset = {
  readonly id: string;
  readonly name: string;
  /** Die Abmessungen in einer Zeile, wie sie im Katalog stehen. */
  readonly dimensions: string;
  /** Was an diesem Satz zu sehen ist — und woher seine Zahlen kommen. */
  readonly note: string;
  readonly nodes: readonly SectionNode[];
  readonly walls: readonly Wall[];
};

/**
 * Die Woelbung eines VIERTELKREISES: `bulge = tan(Δ/4)` mit `Δ = π/2`.
 *
 * Das Vorzeichen bleibt am Aufrufer, denn es haengt an der DURCHLAUFRICHTUNG:
 * positiv dreht von `+y` nach `+z` (ADR 0031). Wer den Kasten im Uhrzeigersinn
 * des Bildschirms umlaeuft, braucht `+`, das U laeuft andersherum und braucht
 * `-`.
 */
const QUARTER_BULGE = Math.tan(Math.PI / 8);

/**
 * Geschweisstes, doppeltsymmetrisches I — die Abmessungen aus
 * `examples/i-symmetric.ts`.
 *
 * DIE GURTE SIND JE ZWEIGETEILT, damit der Steg an einem Knoten haengt, den es
 * gibt: ein Grad-3-Knoten je Gurt. Die Ableitung verbindet dort die beiden
 * Gurthaelften durch (sie sind die geradeste Fortsetzung) und laesst den Steg
 * als eigenen Pfad abzweigen — die Vereinigung schliesst die Fuge trotzdem.
 */
function weldedI(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const h = 200;
  const b = 100;
  const tw = 5.6;
  const tf = 8.5;
  // Die MITTELLINIE des Gurts, nicht seine Kante: sie liegt um `tf/2` innen.
  const zTop = tf / 2;
  const zBottom = h - tf / 2;

  return {
    nodes: [
      { id: 'oben-links', y: -b / 2, z: zTop },
      { id: 'oben-mitte', y: 0, z: zTop },
      { id: 'oben-rechts', y: b / 2, z: zTop },
      { id: 'unten-links', y: -b / 2, z: zBottom },
      { id: 'unten-mitte', y: 0, z: zBottom },
      { id: 'unten-rechts', y: b / 2, z: zBottom },
    ],
    walls: [
      { id: 'gurt-oben-links', startNodeId: 'oben-links', endNodeId: 'oben-mitte', t: tf },
      { id: 'gurt-oben-rechts', startNodeId: 'oben-mitte', endNodeId: 'oben-rechts', t: tf },
      { id: 'steg', startNodeId: 'oben-mitte', endNodeId: 'unten-mitte', t: tw },
      { id: 'gurt-unten-links', startNodeId: 'unten-links', endNodeId: 'unten-mitte', t: tf },
      { id: 'gurt-unten-rechts', startNodeId: 'unten-mitte', endNodeId: 'unten-rechts', t: tf },
    ],
  };
}

/**
 * Geschweisster Stahl-T — die Abmessungen aus `examples/t-section.ts`.
 *
 * Der Steg endet auf `z = h`, also auf der UNTERKANTE: ein offener Lauf wird
 * stumpf abgeschlossen (`endType: 'butt'`), die Aufweitung verlaengert ihn
 * nicht. Am oberen Ende laeuft er dagegen bis in die Gurtmittellinie hinein —
 * die Ueberdeckung faellt bei der Vereinigung heraus, und `A` ist exakt
 * `bf·hf + bw·(h − hf)`.
 */
function weldedT(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const bf = 200;
  const hf = 15;
  const bw = 10;
  const h = 300;
  const zFlange = hf / 2;

  return {
    nodes: [
      { id: 'gurt-links', y: -bf / 2, z: zFlange },
      { id: 'gurt-mitte', y: 0, z: zFlange },
      { id: 'gurt-rechts', y: bf / 2, z: zFlange },
      { id: 'steg-unten', y: 0, z: h },
    ],
    walls: [
      { id: 'gurt-links', startNodeId: 'gurt-links', endNodeId: 'gurt-mitte', t: hf },
      { id: 'gurt-rechts', startNodeId: 'gurt-mitte', endNodeId: 'gurt-rechts', t: hf },
      { id: 'steg', startNodeId: 'gurt-mitte', endNodeId: 'steg-unten', t: bw },
    ],
  };
}

/**
 * Geschweisster Winkel — ZWEI WAENDE, und der einzige Satz OHNE Symmetrieachse.
 *
 * Er ist deshalb der Fall, an dem die Hauptachsen etwas zu sagen haben: `Iyz`
 * ist hier keine Rundung, sondern eine echte Zahl, `alpha` dreht die Achsen
 * sichtbar, und das Gate meldet mit `NotPrincipalAxesWarning` genau das, wofuer
 * die Warnung gebaut ist. Bei jedem anderen Querschnitt dieser Seite schweigt
 * sie (ADR 0032).
 *
 * Ungleichschenklig 200 x 100 x 10 — ohne Vorbild in den Beispielen, aber in
 * der Groessenordnung des I daneben. Der senkrechte Schenkel steht LINKS, seine
 * Mittellinie liegt um `t/2` innerhalb der Aussenkante; beide Schenkel enden
 * stumpf auf der Aussenkante. A = t·h + t·(b − t) = 29,00 cm².
 *
 * ZUM VORZEICHEN VON `alpha`: es zaehlt positiv von `+y` nach `+z` (ADR 0031)
 * und ist damit gegenueber Dlubal gespiegelt — gedreht wird erst in der
 * Berichtsausgabe (`SectionProperties.alpha`).
 */
function weldedAngle(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const h = 200;
  const b = 100;
  const t = 10;
  const yLeg = -b / 2 + t / 2;
  const zLeg = h - t / 2;

  return {
    nodes: [
      { id: 'schenkel-oben', y: yLeg, z: 0 },
      { id: 'ecke', y: yLeg, z: zLeg },
      { id: 'schenkel-rechts', y: b / 2, z: zLeg },
    ],
    walls: [
      { id: 'schenkel-senkrecht', startNodeId: 'schenkel-oben', endNodeId: 'ecke', t },
      { id: 'schenkel-waagerecht', startNodeId: 'ecke', endNodeId: 'schenkel-rechts', t },
    ],
  };
}

/**
 * Rohr — ZWEI HALBKREISE, `bulge = tan(π/4) = 1`.
 *
 * Der geschlossene Umlauf ohne Dickensprung geht als EIN Pfad in die
 * Aufweitung (`endType: 'joined'`), und nur deshalb faellt der Innenring in
 * einem Zug heraus: das Rohr ist hohl, nicht voll.
 *
 * OHNE VORBILD IN DEN BEISPIELEN — `packages/cross-section` kennt keine runde
 * Form. Der Durchmesser ist frei gewaehlt, die Wandstaerke `t = 10` ist die
 * des Kastens daneben, damit sich die beiden Hohlquerschnitte vergleichen
 * lassen.
 */
function tube(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const d = 200;
  const t = 10;
  // Der Mittellinienradius, und der Mittelpunkt liegt um den AUSSENRADIUS
  // unter der Oberkante — `z = 0` bleibt damit die Oberkante wie ueberall.
  const r = (d - t) / 2;
  const zCentre = d / 2;

  return {
    nodes: [
      { id: 'links', y: -r, z: zCentre },
      { id: 'rechts', y: r, z: zCentre },
    ],
    walls: [
      // Von links nach rechts mit positiver Woelbung: `+y` dreht nach `+z`,
      // der Bogen haengt also nach UNTEN durch.
      { id: 'halbrund-unten', startNodeId: 'links', endNodeId: 'rechts', t, bulge: 1 },
      { id: 'halbrund-oben', startNodeId: 'rechts', endNodeId: 'links', t, bulge: 1 },
    ],
  };
}

/**
 * Hohlkasten mit SCHARFEN Ecken — die Abmessungen aus
 * `examples/hollow-rectangle.ts`.
 *
 * Vier Waende, ein geschlossener Umlauf, ueberall dieselbe Dicke: `A` ist die
 * Mittellinienlaenge mal `t`, also exakt `2·(b−t + h−t)·t = 11 600 mm²`. Die
 * Miter-Ecke am rechten Winkel steht mit `1/sin(45°) = 1,41` weit unter dem
 * voreingestellten `miterLimit = 2` und wird deshalb nicht gekappt.
 */
function box(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const b = 200;
  const h = 400;
  const t = 10;
  const y = b / 2 - t / 2;
  const zTop = t / 2;
  const zBottom = h - t / 2;

  return {
    nodes: [
      { id: 'ecke-oben-links', y: -y, z: zTop },
      { id: 'ecke-oben-rechts', y, z: zTop },
      { id: 'ecke-unten-rechts', y, z: zBottom },
      { id: 'ecke-unten-links', y: -y, z: zBottom },
    ],
    walls: [
      { id: 'gurt-oben', startNodeId: 'ecke-oben-links', endNodeId: 'ecke-oben-rechts', t },
      { id: 'steg-rechts', startNodeId: 'ecke-oben-rechts', endNodeId: 'ecke-unten-rechts', t },
      { id: 'gurt-unten', startNodeId: 'ecke-unten-rechts', endNodeId: 'ecke-unten-links', t },
      { id: 'steg-links', startNodeId: 'ecke-unten-links', endNodeId: 'ecke-oben-links', t },
    ],
  };
}

/**
 * Derselbe Kasten MIT ECKAUSRUNDUNG — acht Waende, vier davon Viertelkreise.
 *
 * Die Ausrundung ist keine Eigenschaft des Knotens, sondern eine EIGENE WAND
 * mit `bulge`: die Gerade endet um `r` vor der Ecke, der Bogen setzt sie
 * tangential fort. Damit steht sie schon in der Eingabe und nicht erst im
 * Umriss — und das Gate schweigt, weil die Tangenten stimmen. Ein Knick
 * meldete sich als `TangentKinkWarning`.
 *
 * `r` ist der Radius der MITTELLINIE. Aussen entspricht das `r + t/2 = 30 mm`,
 * innen `r − t/2 = 20 mm` — die uebliche Bemassung eines kaltgeformten
 * Hohlprofils. Die vier Bogen kuerzen die Mittellinie um
 * `4·(2r − π·r/2)`, `A` faellt gegenueber der scharfen Ecke also von
 * 11 600 mm² auf rund 11 171 mm².
 */
function roundedBox(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const b = 200;
  const h = 400;
  const t = 10;
  const r = 25;
  const y = b / 2 - t / 2;
  const zTop = t / 2;
  const zBottom = h - t / 2;

  return {
    nodes: [
      { id: 'oben-links', y: -y + r, z: zTop },
      { id: 'oben-rechts', y: y - r, z: zTop },
      { id: 'rechts-oben', y, z: zTop + r },
      { id: 'rechts-unten', y, z: zBottom - r },
      { id: 'unten-rechts', y: y - r, z: zBottom },
      { id: 'unten-links', y: -y + r, z: zBottom },
      { id: 'links-unten', y: -y, z: zBottom - r },
      { id: 'links-oben', y: -y, z: zTop + r },
    ],
    // Im Umlaufsinn `+y → +z → −y → −z`, also im Uhrzeigersinn des Bildes
    // (`z` zeigt nach unten). Jede Ecke dreht dabei um `+90°`, deshalb tragen
    // alle vier Bogen DASSELBE Vorzeichen.
    walls: [
      { id: 'gurt-oben', startNodeId: 'oben-links', endNodeId: 'oben-rechts', t },
      { id: 'ecke-oben-rechts', startNodeId: 'oben-rechts', endNodeId: 'rechts-oben', t, bulge: QUARTER_BULGE },
      { id: 'steg-rechts', startNodeId: 'rechts-oben', endNodeId: 'rechts-unten', t },
      { id: 'ecke-unten-rechts', startNodeId: 'rechts-unten', endNodeId: 'unten-rechts', t, bulge: QUARTER_BULGE },
      { id: 'gurt-unten', startNodeId: 'unten-rechts', endNodeId: 'unten-links', t },
      { id: 'ecke-unten-links', startNodeId: 'unten-links', endNodeId: 'links-unten', t, bulge: QUARTER_BULGE },
      { id: 'steg-links', startNodeId: 'links-unten', endNodeId: 'links-oben', t },
      { id: 'ecke-oben-links', startNodeId: 'links-oben', endNodeId: 'oben-links', t, bulge: QUARTER_BULGE },
    ],
  };
}

/**
 * Kaltgeformtes U mit Eckausrundung — der OFFENE Lauf mit Bogen.
 *
 * Der Gegenversuch zum runden Kasten: derselbe Viertelkreis, aber ein Lauf,
 * der an beiden Gurtspitzen endet. Er geht mit `endType: 'butt'` in die
 * Aufweitung, die Spitzen liegen deshalb exakt auf `y = +b/2` und werden nicht
 * ueberstehen.
 *
 * Die Abmessungen sind die des I aus `examples/i-symmetric.ts` — `h = 200`,
 * `b = 100`, ueberall `t = 5,6` —, damit die Zahl neben einem bekannten Satz
 * steht. Der Radius `r = 12,2` ist der der Mittellinie, aussen also
 * `r + t/2 = 15 mm`.
 */
function roundedChannel(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const h = 200;
  const b = 100;
  const t = 5.6;
  const r = 12.2;
  // Der Steg steht LINKS: seine Mittellinie liegt um `t/2` innerhalb der
  // linken Aussenkante, die Gurte enden auf der rechten Aussenkante.
  const yWeb = -b / 2 + t / 2;
  const yTip = b / 2;
  const zTop = t / 2;
  const zBottom = h - t / 2;

  return {
    nodes: [
      { id: 'gurt-oben-spitze', y: yTip, z: zTop },
      { id: 'gurt-oben-ecke', y: yWeb + r, z: zTop },
      { id: 'steg-oben', y: yWeb, z: zTop + r },
      { id: 'steg-unten', y: yWeb, z: zBottom - r },
      { id: 'gurt-unten-ecke', y: yWeb + r, z: zBottom },
      { id: 'gurt-unten-spitze', y: yTip, z: zBottom },
    ],
    // Durchlaufen von der oberen Spitze nach `−y`, dann nach `+z`, dann nach
    // `+y`: beide Ecken drehen um `−90°`, das Vorzeichen kehrt sich gegenueber
    // dem Kasten also um.
    walls: [
      { id: 'gurt-oben', startNodeId: 'gurt-oben-spitze', endNodeId: 'gurt-oben-ecke', t },
      { id: 'ecke-oben', startNodeId: 'gurt-oben-ecke', endNodeId: 'steg-oben', t, bulge: -QUARTER_BULGE },
      { id: 'steg', startNodeId: 'steg-oben', endNodeId: 'steg-unten', t },
      { id: 'ecke-unten', startNodeId: 'steg-unten', endNodeId: 'gurt-unten-ecke', t, bulge: -QUARTER_BULGE },
      { id: 'gurt-unten', startNodeId: 'gurt-unten-ecke', endNodeId: 'gurt-unten-spitze', t },
    ],
  };
}

/**
 * Gleichschenkliges Dreieck, SPITZE NACH UNTEN — der Satz, an dem das
 * `miterLimit` greift.
 *
 * Ein geschlossener Umlauf aus drei Waenden, ueberall dieselbe Dicke, also EIN
 * Pfad mit Innenring wie beim Kasten. Der Unterschied steht an der Spitze: der
 * Innenwinkel betraegt dort `2·atan(100/200) = 53,13°`, der ungekappte
 * Miter-Spitz stuende um `1/sin(26,57°) = 2,24` heraus und liegt damit ueber
 * dem voreingestellten `miterLimit = 2`. Clipper2 kappt ihn, und das Gate sagt
 * es mit `MiterLimitExceededWarning` — im Bild wird aus der Spitze eine kurze
 * waagerechte Kante (ADR 0037).
 *
 * `b` UND `h` SIND DIE MITTELLINIE, nicht das Aussenmass: der Umriss liegt
 * ueberall um `t/2` weiter draussen. Aussenmasse anzugeben hiesse, die
 * Rueckrechnung ueber die Eckwinkel zu behaupten, die diese Datei nicht macht.
 */
function triangle(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const b = 200;
  const h = 200;
  const t = 10;
  const t2 = 20;

  return {
    nodes: [
      { id: 'ecke-links', y: -b / 2, z: 0 },
      { id: 'ecke-rechts', y: b / 2, z: 0 },
      { id: 'spitze', y: 0, z: h },
    ],
    walls: [
      { id: 'gurt-oben', startNodeId: 'ecke-links', endNodeId: 'ecke-rechts', t:t2 },
      { id: 'schenkel-rechts', startNodeId: 'ecke-rechts', endNodeId: 'spitze', t },
      { id: 'schenkel-links', startNodeId: 'spitze', endNodeId: 'ecke-links', t },
    ],
  };
}

/**
 * Y-Profil — DREI WAENDE AN EINEM GRAD-3-KNOTEN, unter je 120°.
 *
 * Der Satz zur Durchlaufregel (ADR 0037): durchverbunden wird immer nur EIN
 * Paar, und hier sind alle drei Paare gleich gerade. Den Gleichstand
 * entscheidet die Wand-Id — `arm-links`/`arm-rechts` gewinnen gegen jede
 * Paarung mit `fuss` —, also laufen die beiden oberen Arme als ein Pfad mit
 * Miter-Ecke, der Fuss als eigener Pfad mit stumpfem Ende am Knoten. Die
 * Vereinigung schliesst trotzdem lueckenlos: die Baender der Arme laufen ueber
 * den Knoten hinaus und decken den Fussansatz mit ab. (Eine Kerbe entsteht
 * nicht hier, sondern beim DICKENSPRUNG in der Ecke — siehe
 * `apps/demo/cross-section/cross-section-viewer.ts`.)
 *
 * DREIZAEHLIG SYMMETRISCH, und das sieht man an den Zahlen: `Iy = Iz` und
 * `Iyz = 0` — jede Achse durch den Schwerpunkt ist Hauptachse.
 *
 * Die Armlaenge ist die der MITTELLINIE, gemessen vom Knoten bis zum stumpfen
 * Ende.
 */
function yShape(): Pick<SectionPreset, 'nodes' | 'walls'> {
  const arm = 100;
  const t = 10;
  const zCentre = 100;
  // Die beiden oberen Arme stehen um 120° gegen den Fuss, der senkrecht nach
  // unten (`+z`) laeuft.
  const yArm = arm * Math.sin(Math.PI / 3);
  const zArm = arm * Math.cos(Math.PI / 3);

  return {
    nodes: [
      { id: 'mitte', y: 0, z: zCentre },
      { id: 'arm-links-ende', y: -yArm, z: zCentre - zArm },
      { id: 'arm-rechts-ende', y: yArm, z: zCentre - zArm },
      { id: 'fuss-ende', y: 0, z: zCentre + arm },
    ],
    walls: [
      { id: 'arm-links', startNodeId: 'mitte', endNodeId: 'arm-links-ende', t },
      { id: 'arm-rechts', startNodeId: 'mitte', endNodeId: 'arm-rechts-ende', t },
      { id: 'fuss', startNodeId: 'mitte', endNodeId: 'fuss-ende', t },
    ],
  };
}

/** Die Auswahl der Seite, in der Reihenfolge, in der sie rechts steht. */
export const SECTION_PRESETS: readonly SectionPreset[] = Object.freeze([
  {
    id: 'i-200-geschweisst',
    name: 'I-Profil, geschweisst',
    dimensions: 'h 200 · b 100 · tw 5,6 · tf 8,5',
    note:
      'Fuenf Waende, zwei Grad-3-Knoten. A = 2·b·tf + tw·(h − 2·tf) = 27,25 cm² — ' +
      'dieselbe Zahl wie die parametrische Form „i-symmetric, thin-walled".',
    ...weldedI(),
  },
  {
    id: 't-300-geschweisst',
    name: 'T-Profil, geschweisst',
    dimensions: 'bf 200 · hf 15 · bw 10 · h 300',
    note:
      'Einfach symmetrisch, der Schwerpunkt liegt unter dem Gurt. ' +
      'A = bf·hf + bw·(h − hf) = 58,50 cm², wie „t-section, thin-walled".',
    ...weldedT(),
  },
  {
    id: 'l-200x100x10-geschweisst',
    name: 'L-Profil, geschweisst',
    dimensions: 'h 200 · b 100 · t 10',
    note:
      'Zwei Waende, keine Symmetrieachse — der einzige Satz hier mit echtem Iyz. ' +
      'A = t·h + t·(b − t) = 29,00 cm²; das Gate meldet zu Recht keine Hauptachsenlage.',
    ...weldedAngle(),
  },
  {
    id: 'rohr-200x10',
    name: 'Rohr',
    dimensions: 'd 200 · t 10',
    note:
      'Zwei Halbkreiswaende (bulge = 1). Der geschlossene Umlauf liefert Aussen- UND ' +
      'Innenring; A ≈ 59,69 cm² folgt der Diskretisierung unter arcTolerance.',
    ...tube(),
  },
  {
    id: 'kasten-200x400x10',
    name: 'Hohlkasten, scharfe Ecken',
    dimensions: 'b 200 · h 400 · t 10',
    note:
      'Vier Waende im geschlossenen Umlauf. A = 116,00 cm² wie „hollow-rectangle, ' +
      'thin-walled" — die Mittellinienlaenge mal t.',
    ...box(),
  },
  {
    id: 'kasten-200x400x10-r30',
    name: 'Hohlkasten mit Eckausrundung',
    dimensions: 'b 200 · h 400 · t 10 · r 30 (aussen)',
    note:
      'Derselbe Kasten, die Ecken als Viertelkreiswaende. Die Ausrundung kuerzt die ' +
      'Mittellinie: A faellt von 116,00 auf rund 111,71 cm².',
    ...roundedBox(),
  },
  {
    id: 'u-200x100x5-6-r15',
    name: 'U-Profil mit Eckausrundung',
    dimensions: 'h 200 · b 100 · t 5,6 · r 15 (aussen)',
    note:
      'Offener Lauf mit zwei Bogen; der Schwerpunkt liegt bei ys = −22,2 mm, also neben ' +
      'der Stegmittellinie. Hier meldet das Gate ausserdem knapp keine Hauptachsenlage: ' +
      'Iyz ist reines Rauschen der Bogendiskretisierung und liegt eine Winzigkeit ueber ' +
      'der Schranke.',
    ...roundedChannel(),
  },
  {
    id: 'dreieck-200x200x10',
    name: 'Dreieck, Spitze nach unten',
    dimensions: 'b 200 · h 200 · t 10 (Mittellinie)',
    note:
      'Geschlossener Umlauf mit Innenring. An der Spitze (Innenwinkel 53,1°) uebersteigt ' +
      'der Miter-Ueberstand 2,24 das miterLimit = 2: Clipper2 kappt den Spitz, das Gate ' +
      'meldet es, und aus der Spitze wird im Bild eine kurze Kante. A = 64,53 cm².',
    ...triangle(),
  },
  {
    id: 'y-profil-100-120',
    name: 'Y-Profil',
    dimensions: 'Arm 100 · 120° · t 10 (Mittellinie)',
    note:
      'Drei Waende an EINEM Grad-3-Knoten. Durchverbunden wird nur das geradeste Paar — ' +
      'bei drei gleichen Winkeln entscheidet die Wand-Id, hier also die beiden Arme; der ' +
      'Fuss laeuft als eigener Pfad. Dreizaehlig symmetrisch: Iy = Iz = 501 cm⁴.',
    ...yShape(),
  },
]);
