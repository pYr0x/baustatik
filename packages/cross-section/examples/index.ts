import { hollowRectangleExample } from './hollow-rectangle.ts';
import { iSymmetricExample } from './i-symmetric.ts';
import { rectangleExample } from './rectangle.ts';
import { rolledProfileExample } from './rolled-profile.ts';
import { tSectionExample } from './t-section.ts';
import { undefinedCasesExample } from './undefined-cases.ts';

/**
 * Jede Querschnittsart dieses Packages einmal — zum ANSEHEN, nicht zum Pruefen.
 *
 *     pnpm --filter @baustatik/cross-section example
 *
 * Was hier steht, ist kein Test: es behauptet nichts und faellt nicht um. Es
 * zeigt, wie die beiden Aufrufe aussehen (`sectionProperties`, `stressPoints`)
 * und was sie zurueckgeben. Die Zusicherungen stehen in `tests/`.
 */
rectangleExample();
iSymmetricExample();
tSectionExample();
hollowRectangleExample();
rolledProfileExample();
undefinedCasesExample();
