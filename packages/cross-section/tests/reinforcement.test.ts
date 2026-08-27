/**
 * DIE DRITTE TÜR DES GATES
 * ([ADR 0064](../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
 *
 * Jeder der sechs Befunde einmal, und zwei Fälle, die AUSDRUECKLICH DURCHLAUFEN
 * sollen: `Asmax` abwesend heisst unbegrenzt, `Asmax === As` heisst
 * eingefroren. Beide wären beim naiven Vergleich `Asmax <= As` ein Fehler
 * geworden, und niemand hätte es gemerkt — die Bedeutung steht nur im ADR.
 *
 * DIE UMRISS-WARNUNG WIRD AN BEIDEN RAENDERN GEPRUEFT: im Loch eines Kastens
 * gibt sie es, genau auf der Kante gibt sie es NICHT. Der zweite Fall ist der,
 * an dem eine naive Gerade-ungerade-Regel je nach Kante verschieden antwortet.
 */

import { describe, expect, it } from 'vitest';
import {
  type CrossSection,
  createSectionGeometry,
  DEFAULT_SECTION_POLICY,
  DuplicateReinforcementElementError,
  DuplicateReinforcementLayerError,
  NonPositiveReinforcementAreaError,
  ReinforcementCeilingBelowAreaError,
  ReinforcementOnThinWalledSectionError,
  ReinforcementOutsideSectionWarning,
  type ReinforcementElement,
  type ReinforcementLayer,
  validateReinforcement,
} from '../src/index';
import type { cm2, mm } from '@baustatik/units';
import { node, wall } from './helpers';

const policy = DEFAULT_SECTION_POLICY;

/** Rechteck 300 x 500: `y` von -150 bis +150, `z` von 0 (oben) bis 500. */
const rectangle = (
  reinforcement?: readonly ReinforcementLayer[],
): CrossSection => ({
  kind: 'shape',
  id: 'r-300x500',
  shape: { kind: 'rectangle', b: 300 as mm, h: 500 as mm },
  ...(reinforcement === undefined ? {} : { reinforcement }),
});

const element = (
  id: string,
  y: number,
  z: number,
  As: number,
  Asmax?: number,
): ReinforcementElement => ({
  id,
  y: y as mm,
  z: z as mm,
  As: As as cm2,
  ...(Asmax === undefined ? {} : { Asmax: Asmax as cm2 }),
});

const layer = (
  id: string,
  elements: readonly ReinforcementElement[],
): ReinforcementLayer => ({ id, elements });

/** Die gesunde Lage: drei Stäbe unten, alle im Rechteck. */
const unten = layer('unten', [
  element('u1', -100, 450, 4.52),
  element('u2', 0, 450, 4.52),
  element('u3', 100, 450, 4.52),
]);

describe('Das Bewehrungs-Gate schweigt, wo nichts zu melden ist', () => {
  it('meldet nichts an einem Querschnitt ohne Bewehrung', () => {
    expect(validateReinforcement(rectangle(), policy)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('meldet nichts an drei ordentlich gesetzten Staeben', () => {
    expect(validateReinforcement(rectangle([unten]), policy)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it('laesst ein abwesendes Asmax durchlaufen — abwesend heisst unbegrenzt', () => {
    const { errors } = validateReinforcement(
      rectangle([layer('l', [element('e1', 0, 450, 4.52)])]),
      policy,
    );
    expect(errors).toEqual([]);
  });

  it('laesst Asmax === As durchlaufen — das ist die eingefrorene Lage', () => {
    const { errors } = validateReinforcement(
      rectangle([layer('l', [element('e1', 0, 450, 2.01, 2.01)])]),
      policy,
    );
    expect(errors).toEqual([]);
  });
});

describe('Bewehrung an einer Figur, die kein Vollquerschnitt ist', () => {
  it('meldet den duennwandigen Wandgraphen als Fehler', () => {
    const geometry = createSectionGeometry(
      {
        kind: 'midline',
        nodes: [node('n1', -150, 0), node('n2', 150, 0), node('n3', 150, 500)],
        walls: [wall('w1', 'n1', 'n2'), wall('w2', 'n2', 'n3')],
        idealisation: 'thin-walled',
      },
      policy,
    );
    const { errors } = validateReinforcement(
      {
        kind: 'section-geometry',
        id: 'g',
        geometry,
        reinforcement: [unten],
      },
      policy,
    );

    expect(errors).toHaveLength(1);
    const [finding] = errors;
    expect(finding).toBeInstanceOf(ReinforcementOnThinWalledSectionError);
    expect((finding as ReinforcementOnThinWalledSectionError).sectionId).toBe(
      'g',
    );
    expect((finding as ReinforcementOnThinWalledSectionError).layerCount).toBe(
      1,
    );
  });

  it('meldet die duennwandige parametrische Form als Fehler', () => {
    const { errors } = validateReinforcement(
      {
        kind: 'shape',
        id: 's',
        shape: {
          kind: 'hollow-rectangle',
          b: 300 as mm,
          h: 500 as mm,
          t: 20 as mm,
          idealisation: 'thin-walled',
        },
        reinforcement: [unten],
      },
      policy,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ReinforcementOnThinWalledSectionError);
  });

  it('kurzt ab: die uebrigen Befunde ueber dieselbe Ursache bleiben aus', () => {
    const { errors, warnings } = validateReinforcement(
      {
        kind: 'shape',
        id: 's',
        shape: {
          kind: 'i-symmetric',
          h: 300 as mm,
          b: 150 as mm,
          tw: 7.1 as mm,
          tf: 10.7 as mm,
          idealisation: 'thin-walled',
        },
        // Eine doppelte Id, eine Flaeche <= 0 und eine Lage weit ausserhalb —
        // nichts davon soll gemeldet werden, solange die Figur die falsche ist.
        reinforcement: [
          layer('l', [element('e1', 0, 450, -1), element('e1', 9999, 9999, 1)]),
        ],
      },
      policy,
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ReinforcementOnThinWalledSectionError);
    expect(warnings).toEqual([]);
  });
});

describe('Die Flaechen', () => {
  it('meldet As <= 0 als Fehler', () => {
    const { errors } = validateReinforcement(
      rectangle([layer('l', [element('e1', 0, 450, 0)])]),
      policy,
    );
    expect(errors).toHaveLength(1);
    const [finding] = errors;
    expect(finding).toBeInstanceOf(NonPositiveReinforcementAreaError);
    expect((finding as NonPositiveReinforcementAreaError).elementId).toBe('e1');
  });

  it('meldet ein nicht endliches As als Fehler', () => {
    const { errors } = validateReinforcement(
      rectangle([layer('l', [element('e1', 0, 450, Number.NaN)])]),
      policy,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(NonPositiveReinforcementAreaError);
  });

  it('meldet Asmax < As als Fehler — der Anfangswert steht ueber seiner Schranke', () => {
    const { errors } = validateReinforcement(
      rectangle([layer('l', [element('e1', 0, 450, 4.52, 2.01)])]),
      policy,
    );
    expect(errors).toHaveLength(1);
    const [finding] = errors;
    expect(finding).toBeInstanceOf(ReinforcementCeilingBelowAreaError);
    expect((finding as ReinforcementCeilingBelowAreaError).As).toBe(4.52);
    expect((finding as ReinforcementCeilingBelowAreaError).Asmax).toBe(2.01);
  });
});

describe('Die Ids', () => {
  it('meldet zwei Lagen mit derselben Id', () => {
    const { errors } = validateReinforcement(
      rectangle([
        layer('unten', [element('e1', -50, 450, 4.52)]),
        layer('unten', [element('e2', 50, 450, 4.52)]),
      ]),
      policy,
    );
    expect(errors).toHaveLength(1);
    const [finding] = errors;
    expect(finding).toBeInstanceOf(DuplicateReinforcementLayerError);
    expect((finding as DuplicateReinforcementLayerError).count).toBe(2);
  });

  it('meldet doppelte Element-Ids UEBER ALLE LAGEN, nicht nur je Lage', () => {
    const { errors } = validateReinforcement(
      rectangle([
        layer('unten', [element('e1', -50, 450, 4.52)]),
        layer('oben', [element('e1', 50, 50, 2.01)]),
      ]),
      policy,
    );
    expect(errors).toHaveLength(1);
    const [finding] = errors;
    expect(finding).toBeInstanceOf(DuplicateReinforcementElementError);
    expect((finding as DuplicateReinforcementElementError).layerIds).toEqual([
      'unten',
      'oben',
    ]);
  });
});

describe('Die Lage in der Betonfigur', () => {
  it('warnt bei einem Element ausserhalb des Rechtecks', () => {
    const { errors, warnings } = validateReinforcement(
      rectangle([layer('l', [element('e1', 500, 450, 4.52)])]),
      policy,
    );
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    const [finding] = warnings;
    expect(finding).toBeInstanceOf(ReinforcementOutsideSectionWarning);
    expect((finding as ReinforcementOutsideSectionWarning).elementId).toBe(
      'e1',
    );
  });

  it('warnt bei einem Element im LOCH eines hollow-rectangle', () => {
    const cs: CrossSection = {
      kind: 'shape',
      id: 'hr',
      shape: {
        kind: 'hollow-rectangle',
        b: 300 as mm,
        h: 500 as mm,
        t: 20 as mm,
        idealisation: 'solid',
      },
      // Die Mitte liegt im Loch: Wandstaerke 20 heisst Loch von -130..130
      // in `y` und 20..480 in `z`.
      reinforcement: [layer('l', [element('e1', 0, 250, 4.52)])],
    };
    const { warnings } = validateReinforcement(cs, policy);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBeInstanceOf(ReinforcementOutsideSectionWarning);
  });

  it('schweigt bei einem Element in der WAND eines hollow-rectangle', () => {
    const cs: CrossSection = {
      kind: 'shape',
      id: 'hr',
      shape: {
        kind: 'hollow-rectangle',
        b: 300 as mm,
        h: 500 as mm,
        t: 20 as mm,
        idealisation: 'solid',
      },
      reinforcement: [layer('l', [element('e1', 0, 10, 4.52)])],
    };
    expect(validateReinforcement(cs, policy).warnings).toEqual([]);
  });

  it('schweigt bei einem Element genau auf dem Rand — Betondeckung 0 ist EN 1992', () => {
    const onEdges = layer('rand', [
      element('unten', 0, 500, 4.52),
      element('oben', 0, 0, 4.52),
      element('links', -150, 250, 4.52),
      element('rechts', 150, 250, 4.52),
      element('ecke', -150, 500, 4.52),
    ]);
    expect(validateReinforcement(rectangle([onEdges]), policy).warnings).toEqual(
      [],
    );
  });

  it('misst am gezeichneten Umriss dieselbe Frage', () => {
    const geometry = createSectionGeometry(
      {
        kind: 'outline',
        rings: [
          {
            // Material laeuft mit positivem Umlaufsinn (ADR 0034).
            vertices: [
              { y: -150 as mm, z: 0 as mm },
              { y: 150 as mm, z: 0 as mm },
              { y: 150 as mm, z: 500 as mm },
              { y: -150 as mm, z: 500 as mm },
            ],
          },
        ],
      },
      policy,
    );
    const cs: CrossSection = {
      kind: 'section-geometry',
      id: 'g',
      geometry,
      reinforcement: [
        layer('l', [element('drin', 0, 450, 4.52), element('draussen', 0, 900, 4.52)]),
      ],
    };
    const { warnings } = validateReinforcement(cs, policy);
    expect(warnings).toHaveLength(1);
    expect((warnings[0] as ReinforcementOutsideSectionWarning).elementId).toBe(
      'draussen',
    );
  });
});

describe('Die Katalogzeile', () => {
  it('kann gar keine Bewehrung tragen — der Zweig ist ein Typ', () => {
    // Sie steht hier nur, damit der Aufrufer die Tuer bedenkenlos ueber jeden
    // Querschnitt laufen lassen kann.
    const { errors, warnings } = validateReinforcement(
      {
        kind: 'profile',
        id: 'p',
        profile: 'IPE 300',
        data: {
          A: 53.8,
          Iy: 8356,
          Iz: 604,
          h: 300,
          b: 150,
          tw: 7.1,
          tf: 10.7,
          r: 15,
        } as never,
      },
      policy,
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
