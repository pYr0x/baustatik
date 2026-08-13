import {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  type SectionGeometry,
} from '@baustatik/cross-section';
import type { ArcPathSpec, LineSpec, Spec } from '@baustatik/render-core';
import { Bulge, Point } from '@baustatik/section-geometry';
import { describe, expect, it } from 'vitest';

import { DEFAULT_STYLE } from '../../src/style';
import { thinWallSpecs } from '../../src/thin-walls';
import { OUTLINE, vp1, vp2, wallGeometry } from '../helpers';

const W1 = 'cross-section:thin-wall:w1';

function walls(
  bulge?: number,
  policy = DEFAULT_SECTION_POLICY,
  vp = vp1,
): readonly Spec[] {
  return thinWallSpecs(
    wallGeometry(bulge),
    policy.discretisationTolerance,
    vp,
    DEFAULT_STYLE,
  );
}

describe('Die gerade Wand bleibt eine Linie mit physikalischer Strichbreite', () => {
  it('ohne bulge entsteht eine line-Spec', () => {
    const spec = walls().find((s) => s.id === W1) as LineSpec;

    expect(spec.kind).toBe('line');
    expect(spec.from).toEqual({ u: 0, v: 0 });
    expect(spec.to).toEqual({ u: 100, v: 0 });
    expect(spec.layer).toBe('thin-walls');
    // `t` ist PHYSIK und skaliert deshalb mit dem Viewport.
    expect(spec.strokeWidth).toBe(8);
  });

  it('die Wandstaerke skaliert mit dem Zoom, anders als jede Px-Groesse', () => {
    // Der Gegenfall zu Kreis und Rechteck der Symbole: die Wandstaerke IST eine
    // Weltgroesse, und Konvas screen-konstanter Stroke bildet sie nur ab, weil
    // hier mit `scale` multipliziert wird.
    expect((walls(undefined, DEFAULT_SECTION_POLICY, vp2)[0] as LineSpec).strokeWidth).toBe(16);
  });

  it('ein bulge unter der Toleranz zeichnet ebenfalls gerade', () => {
    // Dieselbe Schranke wie `Bulge.isStraight`: was gerade GERECHNET wird, wird
    // gerade GEZEICHNET. h = 50·0,0001 = 0,005 mm < 0,05 mm.
    expect(walls(0.0001).find((s) => s.id === W1)?.kind).toBe('line');
  });
});

/**
 * DER VORZEICHEN-PIN.
 *
 * Drei Drehsinne treffen hier aufeinander: `bulge` -> `Arc.sweep` (positiv
 * `+y → +z`) -> `ArcPathSpec.sweepAngle` (positiv `+u → +v`). Das Mapping
 * dazwischen ist `worldPoint(y, z)`, also die Identitaet — und genau das ist
 * argumentiert allein nicht zu halten.
 */
describe('Die Bogenwand wird als arcPath gezeichnet, ohne Vorzeichenumrechnung', () => {
  it('bulge = 1 ergibt den Halbkreis mit sweepAngle = +π', () => {
    const spec = walls(1).find((s) => s.id === W1) as ArcPathSpec;

    expect(spec.kind).toBe('arcPath');
    // Sehnenmitte, weil beim Halbkreis der Mittelpunkt auf der Sehne liegt.
    expect(spec.center.u).toBeCloseTo(50, 9);
    expect(spec.center.v).toBeCloseTo(0, 9);
    expect(spec.radius).toBeCloseTo(50, 9);
    // Start bei `a`, also links vom Mittelpunkt: Winkel π.
    expect(spec.startAngle).toBeCloseTo(Math.PI, 9);
    expect(spec.sweepAngle).toBeCloseTo(Math.PI, 9);
    expect(spec.strokeWidth).toBe(8);
  });

  it('bulge = −1 dreht denselben Bogen um: sweepAngle = −π', () => {
    const spec = walls(-1).find((s) => s.id === W1) as ArcPathSpec;

    expect(spec.sweepAngle).toBeCloseTo(-Math.PI, 9);
    expect(spec.startAngle).toBeCloseTo(Math.PI, 9);
  });

  it('Mittelpunkt, Radius und Winkel kommen unveraendert aus Bulge.toArc', () => {
    // Der Pin selbst: die Spec ist eine 1:1-Uebernahme, keine Umrechnung.
    const arc = Bulge.toArc(
      Point.make(0, 0),
      Point.make(100, 0),
      0.4,
      DEFAULT_SECTION_POLICY.discretisationTolerance,
    );
    const spec = walls(0.4).find((s) => s.id === W1) as ArcPathSpec;

    expect(spec.center.u).toBe(arc.center.y);
    expect(spec.center.v).toBe(arc.center.z);
    expect(spec.radius).toBe(arc.radius);
    expect(spec.startAngle).toBe(arc.startAngle);
    expect(spec.sweepAngle).toBe(arc.sweep);
  });

  it('die Toleranz kommt aus dem PULL und nicht aus einer Modulkonstante', () => {
    // h = 50·0,001 = 0,05 mm: unter der Voreinstellung (0,05) gerade, unter
    // einer schaerferen Policy ein Bogen.
    expect(walls(0.001).find((s) => s.id === W1)?.kind).toBe('line');
    expect(
      walls(0.001, createSectionPolicy({ discretisationTolerance: 0.01 })).find(
        (s) => s.id === W1,
      )?.kind,
    ).toBe('arcPath');
  });
});

describe('Der Zeichenweg wirft nicht — auch nicht an einem kaputten bulge', () => {
  // Das Gate prueft `bulge` heute NICHT: G1-G6 sehen Umriss, doppelte Ids,
  // haengende Verweise, `t > 0`, Nulllaenge und Knick — nie die Woelbung. Beide
  // Werte hier koennen also aus einem Store kommen, ohne gemeldet worden zu
  // sein. Ein Wurf loeschte Grid, Umriss und jede andere Wand mit.
  for (const [label, bulge] of [
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    // Ab hier rundet `4·atan(bulge)` genau auf 2π, und `ArcPathSpec` verlangt
    // `|sweepAngle| < 2π`.
    ['ein bulge am Vollkreis-Pol', 1e17],
  ] as const) {
    it(`${label} faellt auf die Sehne zurueck, statt zu werfen`, () => {
      let specs: readonly Spec[] = [];
      expect(() => {
        specs = walls(bulge);
      }).not.toThrow();

      expect(specs.find((s) => s.id === W1)?.kind).toBe('line');
    });
  }
});

describe('Ein haengender Verweis laesst genau diese Wand weg', () => {
  it('die Wand faellt weg, alles andere bleibt Sache der anderen Lagen', () => {
    const geometry: SectionGeometry = {
      kind: 'midline',
      idealisation: 'thin-walled',
      nodes: [{ id: 'a', y: 0, z: 0 }],
      walls: [
        { id: 'w1', startNodeId: 'a', endNodeId: 'fehlt', t: 8, bulge: 1 },
        { id: 'w2', startNodeId: 'a', endNodeId: 'a', t: 8 },
      ],
      outline: OUTLINE,
    };
    const specs = thinWallSpecs(
      geometry,
      DEFAULT_SECTION_POLICY.discretisationTolerance,
      vp1,
      DEFAULT_STYLE,
    );

    expect(specs.find((s) => s.id === W1)).toBeUndefined();
    expect(specs.find((s) => s.id === 'cross-section:thin-wall:w2')).toBeDefined();
  });
});

describe('Ein freier Umriss hat keine Mittellinien', () => {
  it('emittiert fuer kind: outline gar nichts', () => {
    expect(
      thinWallSpecs(
        { kind: 'outline', rings: [], outline: OUTLINE },
        DEFAULT_SECTION_POLICY.discretisationTolerance,
        vp1,
        DEFAULT_STYLE,
      ),
    ).toEqual([]);
  });
});
