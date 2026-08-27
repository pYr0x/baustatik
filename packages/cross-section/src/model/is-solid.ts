import type { CrossSection } from './cross-section';
import type { SectionGeometry } from './section-geometry';
import type { ShapeSpec } from './shape-spec';

/**
 * Die parametrischen Formen, die ein Vollquerschnitt SIND — als Typ, damit die
 * Weiche narrowt statt nur zu antworten.
 *
 * Das Vollrechteck steht für sich; die drei anderen genau dann, wenn ihr
 * `idealisation` auf `'solid'` steht.
 */
type SolidShape =
  | Extract<ShapeSpec, { kind: 'rectangle' }>
  | (Exclude<ShapeSpec, { kind: 'rectangle' }> & { idealisation: 'solid' });

/** Dasselbe für die gezeichnete Figur: der freie Umriss, und der `solid` gezeichnete Wandgraph. */
type SolidGeometry =
  | Extract<SectionGeometry, { kind: 'outline' }>
  | (Extract<SectionGeometry, { kind: 'midline' }> & { idealisation: 'solid' });

/**
 * Ist dieser Querschnitt ein VOLLQUERSCHNITT?
 *
 * DIE EINE WEICHE DES REPOS, und sie stand bis ADR 0064 dreimal ausgeschrieben
 * da — in `calculation/geometry-properties.ts`, in `stress-points/index.ts` und
 * als `feGeometry` in `apps/demo`. Eine vierte Kopie für das Bewehrungs-Gate
 * wäre der Weg gewesen, auf dem drei zu vier werden und dann beim
 * `hollow-rectangle` auseinanderlaufen. Sie ist deshalb eine
 * ZUSAMMENFUEHRUNG und kein Zuwachs.
 *
 * ```text
 * profile           → nie
 * section-geometry  → geometry.kind === 'outline' || geometry.idealisation === 'solid'
 * shape             → shape.kind === 'rectangle' || shape.idealisation === 'solid'
 * ```
 *
 * DAS VOLLRECHTECK IST GENANNT UND NICHT GEPRUEFT: es trägt gar kein
 * `idealisation`, weil es DER Vollquerschnitt ist (`ShapeSpec`). Der freie
 * Umriss ebenso — ein Ringmodell hat keine Mittellinien, längs derer ein
 * Schubfluss laufen könnte, und `SectionGeometry` verbietet die Zelle „freier
 * Umriss, aber dünnwandig gerechnet" schon am Typ.
 *
 * DIE KATALOGZEILE IST NIE EINER, auch nicht das gewalzte I: es hat eine
 * Ausrundung, Gurt und Steg bleiben aber Wände (ADR 0057).
 *
 * DREI SIGNATUREN STATT EINER, weil zwei der drei Aufrufstellen keinen Satz
 * sehen, sondern nur die Figur bzw. nur die Form. Die REGEL steht trotzdem
 * einmal da: `isSolid` fragt die beiden anderen.
 */
export function isSolid(cs: CrossSection): boolean {
  switch (cs.kind) {
    case 'profile':
      return false;
    case 'shape':
      return isSolidShape(cs.shape);
    case 'section-geometry':
      return isSolidGeometry(cs.geometry);
  }
}

/**
 * Dieselbe Frage an der blossen GEOMETRIE — für `geometryValues`, das eine
 * `SectionGeometry` gereicht bekommt und keinen Satz.
 *
 * TYPPRAEDIKAT UND NICHT `boolean`: der `false`-Zweig ist genau der Wandgraph,
 * und die Aufrufstelle liest dort `nodes` und `walls`. Ohne die Einengung
 * stünde die Weiche zwar an einer Stelle, die zweite Bedingung („und ausserdem
 * `midline`") aber wieder daneben.
 */
export function isSolidGeometry(
  geometry: SectionGeometry,
): geometry is SolidGeometry {
  return geometry.kind === 'outline' || geometry.idealisation === 'solid';
}

/**
 * Dieselbe Frage an der blossen FORM — für `stressPoints`, dessen Weiche
 * danach über die drei dünnwandigen Formen läuft.
 *
 * NICHT IM BARREL: nach aussen ist der Querschnitt der Satz, und wer nur eine
 * `ShapeSpec` in der Hand hält, ist innerhalb dieses Packages.
 */
export function isSolidShape(shape: ShapeSpec): shape is SolidShape {
  return shape.kind === 'rectangle' || shape.idealisation === 'solid';
}
