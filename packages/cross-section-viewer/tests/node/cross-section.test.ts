import {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  type SectionGeometry,
} from '@baustatik/cross-section';
import type {
  ArcPathSpec,
  LineSpec,
  RenderDriver,
  Spec,
  ViewIntent,
} from '@baustatik/render-core';
import { Bulge, Point } from '@baustatik/section-geometry';
import { screenPoint, viewport } from '@baustatik/viewport-2d';
import { describe, expect, it } from 'vitest';
import { createCrossSectionViewer } from '../../src/viewer';

/** Ein Treiber, der nichts zeichnet und nur mitschreibt, was er bekaeme. */
function recordingDriver(): RenderDriver & { readonly specs: Spec[] } {
  let specs: Spec[] = [];
  return {
    get specs() {
      return specs;
    },
    applyViewport: () => {},
    reconcile: (next: readonly Spec[]) => {
      specs = [...next];
    },
    flush: () => {},
    onViewIntent: (_handler: (intent: ViewIntent) => void) => {},
    destroy: () => {},
  };
}

/** Ein tragender Umriss, damit die Wandspecs nicht die einzigen sind. */
const OUTLINE = [
  {
    points: [
      { y: 0, z: 0 },
      { y: 100, z: 0 },
      { y: 100, z: 100 },
    ],
  },
];

function draw(
  geometry: SectionGeometry,
  policy = DEFAULT_SECTION_POLICY,
): Spec[] {
  const driver = recordingDriver();
  createCrossSectionViewer({
    driver,
    getGeometry: () => geometry,
    getSectionPolicy: () => policy,
    getScreenSize: () => ({ width: 800, height: 600 }),
    initialViewport: viewport(screenPoint(0, 0), 1),
  }).requestRender();
  return driver.specs;
}

function wall(bulge?: number): SectionGeometry {
  return {
    kind: 'midline',
    idealisation: 'thin-walled',
    nodes: [
      { id: 'a', y: 0, z: 0 },
      { id: 'b', y: 100, z: 0 },
    ],
    walls: [
      {
        id: 'w1',
        startNodeId: 'a',
        endNodeId: 'b',
        t: 8,
        ...(bulge === undefined ? {} : { bulge }),
      },
    ],
    outline: OUTLINE,
  };
}

describe('Die gerade Wand bleibt eine Linie mit physikalischer Strichbreite', () => {
  it('ohne bulge entsteht eine line-Spec', () => {
    const spec = draw(wall()).find((s) => s.id === 'w1') as LineSpec;

    expect(spec.kind).toBe('line');
    expect(spec.from).toEqual({ u: 0, v: 0 });
    expect(spec.to).toEqual({ u: 100, v: 0 });
    // `t` ist PHYSIK und skaliert deshalb mit dem Viewport.
    expect(spec.strokeWidth).toBe(8);
  });

  it('ein bulge unter der Toleranz zeichnet ebenfalls gerade', () => {
    // Dieselbe Schranke wie `Bulge.isStraight`: was gerade GERECHNET wird, wird
    // gerade GEZEICHNET. h = 50·0,0001 = 0,005 mm < 0,05 mm.
    expect(draw(wall(0.0001)).find((s) => s.id === 'w1')?.kind).toBe('line');
  });
});

/**
 * DER VORZEICHEN-PIN.
 *
 * Drei Drehsinne treffen hier aufeinander: `bulge` -> `Arc.sweep` (positiv
 * `+y → +z`) -> `ArcPathSpec.sweepAngle` (positiv `+u → +v`). Das Mapping
 * dazwischen ist `worldPoint(y, z)`, also die Identitaet — und genau das ist
 * bislang nur ARGUMENTIERT worden.
 */
describe('Die Bogenwand wird als arcPath gezeichnet, ohne Vorzeichenumrechnung', () => {
  it('bulge = 1 ergibt den Halbkreis mit sweepAngle = +π', () => {
    const spec = draw(wall(1)).find((s) => s.id === 'w1') as ArcPathSpec;

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
    const spec = draw(wall(-1)).find((s) => s.id === 'w1') as ArcPathSpec;

    expect(spec.sweepAngle).toBeCloseTo(-Math.PI, 9);
    expect(spec.startAngle).toBeCloseTo(Math.PI, 9);
  });

  it('Mittelpunkt, Radius und Winkel kommen unveraendert aus Bulge.toArc', () => {
    // Der Pin selbst: die Spec ist eine 1:1-Uebernahme, keine Umrechnung.
    const arc = Bulge.toArc(
      Point.make(0, 0),
      Point.make(100, 0),
      0.4,
      DEFAULT_SECTION_POLICY.arcTolerance,
    );
    const spec = draw(wall(0.4)).find((s) => s.id === 'w1') as ArcPathSpec;

    expect(spec.center.u).toBe(arc.center.y);
    expect(spec.center.v).toBe(arc.center.z);
    expect(spec.radius).toBe(arc.radius);
    expect(spec.startAngle).toBe(arc.startAngle);
    expect(spec.sweepAngle).toBe(arc.sweep);
  });

  it('die Toleranz kommt aus dem PULL und nicht aus einer Modulkonstante', () => {
    // h = 50·0,001 = 0,05 mm: unter der Voreinstellung (0,05) gerade, unter
    // einer schaerferen Policy ein Bogen.
    expect(draw(wall(0.001)).find((s) => s.id === 'w1')?.kind).toBe('line');
    expect(
      draw(wall(0.001), createSectionPolicy({ arcTolerance: 0.01 })).find(
        (s) => s.id === 'w1',
      )?.kind,
    ).toBe('arcPath');
  });
});

describe('Der Zeichenweg wirft nicht — auch nicht an einem kaputten bulge', () => {
  // Das Gatter prueft `bulge` heute NICHT: G1-G6 sehen Umriss, doppelte Ids,
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
      let specs: Spec[] = [];
      expect(() => {
        specs = draw(wall(bulge));
      }).not.toThrow();

      expect(specs.find((s) => s.id === 'w1')?.kind).toBe('line');
      // Der Rest der Figur steht noch.
      expect(specs.find((s) => s.id === 'outline-0')).toBeDefined();
    });
  }
});

describe('Ein haengender Verweis laesst den Rest der Figur stehen', () => {
  it('die Wand faellt weg, der Umriss bleibt', () => {
    const specs = draw({
      kind: 'midline',
      idealisation: 'thin-walled',
      nodes: [{ id: 'a', y: 0, z: 0 }],
      walls: [
        { id: 'w1', startNodeId: 'a', endNodeId: 'fehlt', t: 8, bulge: 1 },
      ],
      outline: OUTLINE,
    });

    expect(specs.find((s) => s.id === 'w1')).toBeUndefined();
    expect(specs.find((s) => s.id === 'outline-0')).toBeDefined();
  });
});
