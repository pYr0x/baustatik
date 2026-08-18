import { sectionProperties } from '../calculation/section-properties';
import { tSectionCentroid } from '../calculation/shapes/t-section';
import type { CrossSection } from '../model/cross-section';
import {
  hollowRectanglePoints,
  iSymmetricPoints,
  rectanglePoints,
  tSectionPoints,
} from './compact';
import { rolledIStressPoints } from './rolled-i';
import {
  hollowRectangleThinPoints,
  iSymmetricThinPoints,
  tSectionThinPoints,
} from './thin';
import type { StressPoint } from './types';

/**
 * Die Spannungspunkte eines Querschnitts.
 *
 * DIE VERZWEIGUNG GEHT UEBER FORM UND IDEALISIERUNG, nicht ueber die Form
 * allein. `idealisation` beantwortet die Frage „wie fliesst der Schub", und
 * dieselbe Frage darf nicht zwei Maschinen haben: sie steuert kappa UND die
 * Spannungspunkte, oder keines von beiden
 * ([ADR 0029](../../../../docs/adr/0029-stress-points-follow-the-idealisation.md)).
 *
 * | Form | `solid` | `thin-walled` |
 * | --- | --- | --- |
 * | `rectangle` | Umrissmodell | — (traegt kein `idealisation`) |
 * | `i-symmetric` | Umrissmodell | Wandmodell |
 * | `t-section` | Umrissmodell | Wandmodell |
 * | `hollow-rectangle` | Umrissmodell | Wandmodell |
 *
 * `solid` behaelt das Umrissmodell, und das ist keine Uebergangsloesung:
 * Grashof IST fuer Vollquerschnitte richtig, die Rechteckparabel faellt genau
 * daraus.
 *
 * WO DIE PUNKTE LIEGEN, entscheidet keine der Vorlagen selbst: die Stellen
 * stehen in `open-stations.ts` (I und T) und `hollow-stations.ts` (Kasten),
 * und beide Idealisierungen lesen dieselbe Liste. Die Regel dahinter — jede
 * Stelle, an der `S` oder `t` springt oder ein Maximum hat, und die
 * Koordinate dort in der RANDFASER — steht bei `OpenStation`
 * ([ADR 0052](../../../../docs/adr/0052-stress-points-sit-on-the-extreme-fibre.md)).
 *
 * `undefined` heisst „fuer diese Form gibt es keine Vorlage" — heute nur noch
 * die GEZEICHNETE Geometrie, fuer die im Voraus gar keine Form feststeht.
 *
 * Der geschlossene Kasten hatte bisher keine
 * REFERENZDATEN — die Theorie fehlte ihm nie, den umlaufenden Weg hat
 * `closedBoxPath` in `shapes/hollow-rectangle.ts` laengst und kappa faellt
 * daraus. Mit der Referenz stehen jetzt beide Vorlagen, und der Kasten ist die
 * einzige Form, deren Punkte NICHT auf ihrem Schwerpunkt liegen koennen: der
 * liegt im Loch.
 *
 * WARUM UEBERHAUPT GERECHNET, wo nebenan „tabelliert, nicht nachgerechnet"
 * gilt: die Spannungspunkte fallen aus DENSELBEN Abmessungen wie alles andere,
 * und der parametrische Zweig hat gar keine Tabelle, aus der sie kommen
 * koennten. Sie zu tabellieren hiesse, zwei Quellen fuer eine Groesse zu
 * fuehren, von denen eine fuer die Haelfte der Querschnitte leer bliebe
 * ([ADR 0022](../../../../docs/adr/0022-stress-points-are-computed-from-a-template.md)).
 */
export function stressPoints(
  cs: CrossSection,
): readonly StressPoint[] | undefined {
  // Keine Umrechnung: die Tabelle fuehrt mm, die Vorlage rechnet in mm. Und
  // kein Nachschlagen mehr: die Zeile steht seit ADR 0027 im Satz, der Zweig
  // ist damit total.
  if (cs.kind === 'profile') return rolledIStressPoints(cs.data);

  // Die freie Geometrie hat keine VORLAGE — sie ist ja gerade der Fall, fuer
  // den keine Form im Voraus feststeht. Ihre Spannungspunkte fallen spaeter aus
  // dem Umriss selbst (Ecken plus Schwerpunkt, dieselbe Regel wie ueberall),
  // und das setzt die Green-Rechnung aus P2 voraus.
  if (cs.kind === 'section-geometry') return undefined;

  // EINE Gueltigkeitspruefung, nicht zwei. Die Abmessungen hier noch einmal
  // von Hand zu pruefen hiesse, zwei Antworten auf „ist dieser Querschnitt
  // brauchbar" zu fuehren — und sie waeren auseinandergelaufen: `tf = -1`
  // haette Spannungspunkte geliefert, aber keine Querschnittswerte.
  if (sectionProperties(cs) === undefined) return undefined;

  const shape = cs.shape;
  switch (shape.kind) {
    case 'rectangle':
      // Ein duennwandiges Vollrechteck gibt es nicht, also traegt die Form
      // kein `idealisation` — und hier gibt es nichts zu verzweigen.
      return rectanglePoints(shape.b, shape.h);
    case 'i-symmetric':
      return shape.idealisation === 'solid'
        ? iSymmetricPoints(shape.h, shape.b, shape.tw, shape.tf)
        : iSymmetricThinPoints(shape.h, shape.b, shape.tw, shape.tf);
    case 't-section': {
      const { bf, hf, bw, h } = shape;
      // `sectionProperties` hat die Masse eben erst durchgelassen; der
      // Schwerpunkt ist damit bestimmt.
      const zs = tSectionCentroid(bf, hf, bw, h) as number;
      return shape.idealisation === 'solid'
        ? tSectionPoints(bf, hf, bw, h, zs)
        : // EIN Schwerpunkt fuer beide Idealisierungen, seit ADR 0053: die
          // duennwandigen Waende kacheln die Umrissfigur, ihr Schwerpunkt IST
          // `zs`. `tSectionWall` bleibt fuer kappa zustaendig.
          tSectionThinPoints(bf, hf, bw, h, zs);
    }
    case 'hollow-rectangle':
      // Der Schwerpunkt liegt im LOCH; an seine Stelle treten die vier
      // Wandmitten. Warum die sechzehn Stellen so und nicht anders liegen,
      // steht bei `hollowStations`.
      return shape.idealisation === 'solid'
        ? hollowRectanglePoints(shape.b, shape.h, shape.t)
        : hollowRectangleThinPoints(shape.b, shape.h, shape.t);
  }
}

export type { StressPoint } from './types';
