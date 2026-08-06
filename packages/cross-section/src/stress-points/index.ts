import { type CrossSection, sectionProperties } from '../section';
import { tSectionCentroid, tSectionWall } from '../shapes/t-section';
import { iSymmetricPoints, rectanglePoints, tSectionPoints } from './compact';
import { rolledIStressPoints } from './rolled-i';
import { iSymmetricThinPoints, tSectionThinPoints } from './thin';
import type { StressPoint } from './types';

/**
 * Die Spannungspunkte eines Querschnitts.
 *
 * DIE VERZWEIGUNG GEHT UEBER FORM UND IDEALISIERUNG, nicht ueber die Form
 * allein. `idealisation` beantwortet die Frage „wie fliesst der Schub", und
 * dieselbe Frage darf nicht zwei Maschinen haben: sie steuert kappa UND die
 * Spannungspunkte, oder keines von beiden
 * ([ADR 0029](../../../docs/adr/0029-stress-points-follow-the-idealisation.md)).
 *
 * | Form | `solid` | `thin-walled` |
 * | --- | --- | --- |
 * | `rectangle` | Umrissmodell | — (traegt kein `idealisation`) |
 * | `i-symmetric` | Umrissmodell | Wandmodell |
 * | `t-section` | Umrissmodell | Wandmodell |
 * | `hollow-rectangle` | `undefined` | `undefined` |
 *
 * `solid` behaelt das Umrissmodell, und das ist keine Uebergangsloesung:
 * Grashof IST fuer Vollquerschnitte richtig, die Rechteckparabel faellt genau
 * daraus.
 *
 * `undefined` heisst „fuer diese Form gibt es (noch) keine Vorlage" — heute der
 * geschlossene Kasten. Ihm fehlen die REFERENZDATEN, nicht die Theorie: den
 * umlaufenden Weg hat `closedBoxPath` in `shapes/hollow-rectangle.ts` bereits,
 * und kappa faellt daraus. Eine Vorlage ohne Referenz, gegen die sie zu pruefen
 * waere, ist geraten und nicht gerechnet; der Kasten kommt zusammen mit den
 * QRO-Daten, die ausserdem Bogentangenten mitbringen und deshalb eine eigene
 * Herleitung brauchen.
 *
 * WARUM UEBERHAUPT GERECHNET, wo nebenan „tabelliert, nicht nachgerechnet"
 * gilt: die Spannungspunkte fallen aus DENSELBEN Abmessungen wie alles andere,
 * und der parametrische Zweig hat gar keine Tabelle, aus der sie kommen
 * koennten. Sie zu tabellieren hiesse, zwei Quellen fuer eine Groesse zu
 * fuehren, von denen eine fuer die Haelfte der Querschnitte leer bliebe
 * ([ADR 0022](../../../docs/adr/0022-stress-points-are-computed-from-a-template.md)).
 */
export function stressPoints(
  cs: CrossSection,
): readonly StressPoint[] | undefined {
  // Keine Umrechnung: die Tabelle fuehrt mm, die Vorlage rechnet in mm. Und
  // kein Nachschlagen mehr: die Zeile steht seit ADR 0027 im Satz, der Zweig
  // ist damit total.
  if (cs.kind === 'profile') return rolledIStressPoints(cs.data);

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
      // `sectionProperties` hat die Masse eben erst durchgelassen; beide
      // Schwerpunkte sind damit bestimmt.
      const zs = tSectionCentroid(bf, hf, bw, h) as number;
      return shape.idealisation === 'solid'
        ? tSectionPoints(bf, hf, bw, h, zs)
        : // `S` laeuft um den Schwerpunkt des WANDMODELLS, die Koordinaten um
          // den der Umrissfigur. Beide kommen aus `shapes/t-section.ts`, damit
          // kappa und die Spannungspunkte dieselben Zahlen benutzen.
          tSectionThinPoints(
            bf,
            hf,
            bw,
            h,
            zs,
            tSectionWall(bf, hf, bw, h).zsWall,
          );
    }
    case 'hollow-rectangle':
      // Siehe oben: dem Kasten fehlen die Referenzdaten, nicht der Weg.
      return undefined;
  }
}

export type { StressPoint } from './types';
