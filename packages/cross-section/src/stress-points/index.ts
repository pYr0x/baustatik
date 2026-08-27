import { sectionProperties } from '../calculation/section-properties';
import { tSectionCentroid } from '../calculation/shapes/t-section';
import type { CrossSection } from '../model/cross-section';
import { isSolidShape } from '../model/is-solid';
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
 * EIN SPANNUNGSPUNKT IST EIN SCHNITTMODELL, und ein Schnittmodell hat nur der
 * dünnwandige Querschnitt. `t` und `S` sind der Nenner von `tau = V*S/(I*t)`,
 * und diese Formel setzt voraus, dass der Schubfluss längs einer Wand läuft
 * und über die Schnittbreite konstant ist. Wo das nicht gilt, gibt es nicht
 * etwa einen ungenauen Punkt — es gibt gar keinen
 * ([ADR 0057](../../../../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)).
 *
 * | Form | `solid` | `thin-walled` |
 * | --- | --- | --- |
 * | `rectangle` | `undefined` | — (trägt kein `idealisation`) |
 * | `i-symmetric` | `undefined` | Wandmodell |
 * | `t-section` | `undefined` | Wandmodell |
 * | `hollow-rectangle` | `undefined` | Wandmodell |
 *
 * BIS ADR 0057 TRUG `solid` DAS UMRISSMODELL — waagerechte Schnitte quer durch
 * die volle Figur, Grashof. Die parametrische Eingabe ist aber nur die bequeme
 * Schreibweise für eine gezeichnete Figur, und die gezeichnete Vollfigur
 * antwortet mit der FE (`@baustatik/cross-section-fe`), nicht mit einem
 * Schnitt. Zwei Wege zu derselben Figur, die verschiedene Zahlen liefern,
 * wären zwei Maschinen für eine Frage — dasselbe Argument, mit dem ADR 0029
 * die Idealisierung zur einen Weiche gemacht hat.
 *
 * `idealisation` STEUERT WEITER kappa. Dass `solid` dort Grashof behält und
 * hier gar nichts liefert, ist kein Widerspruch: eine Schubsteifigkeit MUSS
 * der Balken haben, ein Spannungspunkt muss nicht existieren. `undefined` ist
 * keine zweite Maschine, sondern die Abwesenheit einer Antwort.
 *
 * WO DIE PUNKTE LIEGEN, entscheidet keine der Vorlagen selbst: die Stellen
 * stehen in `open-stations.ts` (I und T) und `hollow-stations.ts` (Kasten).
 * Die Regel dahinter — jede Stelle, an der `S` oder `t` springt oder ein
 * Maximum hat, und die Koordinate dort in der RANDFASER — steht bei
 * `OpenStation`
 * ([ADR 0052](../../../../docs/adr/0052-stress-points-sit-on-the-extreme-fibre.md)).
 *
 * `undefined` heißt „für diesen Querschnitt gibt es kein Schnittmodell": die
 * gezeichnete Geometrie, für die im Voraus gar keine Form feststeht, und seit
 * ADR 0057 jede parametrische Vollfigur.
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
  // ist damit total. Das GEWALZTE Profil bleibt ein Schnittmodell: es hat eine
  // Ausrundung, aber Gurt und Steg sind Wände (ADR 0057).
  if (cs.kind === 'profile') return rolledIStressPoints(cs.data);

  // Die freie Geometrie hat keine VORLAGE — sie ist ja gerade der Fall, fuer
  // den keine Form im Voraus feststeht. Der gezeichnete Vollquerschnitt bekommt
  // seine Spannungen aus der FE (ADR 0054), nicht aus einem Schnitt.
  if (cs.kind === 'section-geometry') return undefined;

  // EINE Gueltigkeitspruefung, nicht zwei. Die Abmessungen hier noch einmal
  // von Hand zu pruefen hiesse, zwei Antworten auf „ist dieser Querschnitt
  // brauchbar" zu fuehren — und sie waeren auseinandergelaufen: `tf = -1`
  // haette Spannungspunkte geliefert, aber keine Querschnittswerte.
  if (sectionProperties(cs) === undefined) return undefined;

  const shape = cs.shape;
  // DIE EINE WEICHE, und sie steht vor der Form: ein Vollquerschnitt trägt kein
  // Schnittmodell (ADR 0057). Sie steht seit ADR 0064 in `isSolidShape` und
  // nicht mehr hier ausgeschrieben — dieselbe Regel, die `isSolid` am Satz
  // beantwortet (ADR 0064).
  if (isSolidShape(shape)) return undefined;

  switch (shape.kind) {
    case 'i-symmetric':
      return iSymmetricThinPoints(shape.h, shape.b, shape.tw, shape.tf);
    case 't-section': {
      const { bf, hf, bw, h } = shape;
      // `sectionProperties` hat die Masse eben erst durchgelassen; der
      // Schwerpunkt ist damit bestimmt. EIN Schwerpunkt fuer die Koordinaten
      // und fuer `S`, seit ADR 0053: die duennwandigen Waende kacheln die
      // Umrissfigur, ihr Schwerpunkt IST `zs`. `tSectionWall` bleibt fuer kappa
      // zustaendig.
      const zs = tSectionCentroid(bf, hf, bw, h) as number;
      return tSectionThinPoints(bf, hf, bw, h, zs);
    }
    case 'hollow-rectangle':
      // Der Schwerpunkt liegt im LOCH; an seine Stelle treten die vier
      // Wandmitten. Warum die sechzehn Stellen so und nicht anders liegen,
      // steht bei `hollowStations`.
      return hollowRectangleThinPoints(shape.b, shape.h, shape.t);
  }
}

export type { StressPoint } from './types';
