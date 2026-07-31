import { lookupProfile } from '@baustatik/steel-profiles';
import { type CrossSection, sectionProperties } from '../section';
import { tBeamCentroid } from '../shapes/t-beam';
import { iSymmetricPoints, rectanglePoints, tBeamPoints } from './compact';
import { rolledIStressPoints } from './rolled-i';
import type { StressPoint } from './types';

/** mm -> m fuer die Katalogabmessungen. */
const MM = 1e-3;

/**
 * Die Spannungspunkte eines Querschnitts.
 *
 * `undefined` heisst „fuer diese Form gibt es (noch) keine Vorlage" — heute der
 * geschlossene Kasten. Eine Vorlage ohne Referenzdaten, gegen die sie zu pruefen
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
  if (cs.kind === 'profile') {
    const profile = lookupProfile(cs.profileId);
    if (profile === undefined) return undefined;
    return rolledIStressPoints({
      h: profile.h * MM,
      b: profile.b * MM,
      tw: profile.tw * MM,
      tf: profile.tf * MM,
      r: profile.r * MM,
    });
  }

  // EINE Gueltigkeitspruefung, nicht zwei. Die Abmessungen hier noch einmal
  // von Hand zu pruefen hiesse, zwei Antworten auf „ist dieser Querschnitt
  // brauchbar" zu fuehren — und sie waeren auseinandergelaufen: `tf = -1`
  // haette Spannungspunkte geliefert, aber keine Querschnittswerte.
  if (sectionProperties(cs) === undefined) return undefined;

  const shape = cs.shape;
  switch (shape.kind) {
    case 'rectangle':
      return rectanglePoints(shape.b, shape.h);
    case 'i-symmetric':
      return iSymmetricPoints(shape.h, shape.b, shape.tw, shape.tf);
    case 't-beam':
      return tBeamPoints(
        shape.bf,
        shape.hf,
        shape.bw,
        shape.h,
        // `sectionProperties` hat die Masse eben erst durchgelassen; der
        // Schwerpunkt ist damit bestimmt.
        tBeamCentroid(shape.bf, shape.hf, shape.bw, shape.h) as number,
      );
    case 'hollow-rectangle':
      // Siehe oben: der geschlossene Kasten wartet auf die QRO-Daten.
      return undefined;
  }
}

export type { StressPoint } from './types';
