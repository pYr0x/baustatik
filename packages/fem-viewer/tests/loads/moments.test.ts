import { describe, expect, it } from 'vitest';

import type { FEMLoad } from '@baustatik/fem-loads';
import { UnknownLoadTargetError } from '@baustatik/fem-loads';
import type { ArcPathSpec, LabelSpec, PolygonSpec } from '@baustatik/render-core';
import { validateSpecs } from '@baustatik/render-core';

import { beamAB, drawingOf, nodeA, nodeB, vp1, vp4 } from './helpers';

// Das Moment braucht keinen schraegen Stab: es dreht immer um y, `frame` und
// `axis` gibt es fuer das Einzelmoment gar nicht.
const NODES = [nodeA, nodeB];
const BEAMS = [beamAB];

const DEG = Math.PI / 180;
const RADIUS = 22;
const POINTER_LENGTH = 10;
// Der Winkel, den die Spitze vom Mittelpunkt aus einnimmt: sie steht tangential
// auf dem Kreis, Basis und Spitze spannen also ein rechtwinkliges Dreieck auf.
// Hier steht die Absicht, nicht eine aus `moment.ts` abgeschriebene Zahl.
const HEAD_SPAN = Math.atan(POINTER_LENGTH / RADIUS);

const { specsFor, loadOnly, specById } = drawingOf(NODES, BEAMS);

const arc = (loads: readonly FEMLoad[], id: string, vp = vp1) =>
  specById<ArcPathSpec>(loads, id, vp);
const head = (loads: readonly FEMLoad[], id: string, vp = vp1) =>
  specById<PolygonSpec>(loads, id, vp);
const label = (loads: readonly FEMLoad[], id: string, vp = vp1) =>
  specById<LabelSpec>(loads, id, vp);

const nodeMoment = (my: number, fields: Record<string, unknown> = {}): FEMLoad =>
  ({
    id: 'nm',
    target: 'node',
    nodeIds: ['b'],
    my,
    ...fields,
  }) as FEMLoad;

const beamMoment = (m: number, fields: Record<string, unknown> = {}): FEMLoad =>
  ({
    id: 'bm',
    target: 'beam',
    beamIds: ['ab'],
    kind: 'moment',
    distribution: 'point',
    m,
    distanceFromStart: 50,
    ...fields,
  }) as FEMLoad;

/** Der Winkel eines Punktes um den Angriffspunkt, in (-180, 180] Grad. */
function angleDegAt(
  center: { u: number; v: number },
  point: { u: number; v: number },
): number {
  return Math.atan2(point.v - center.v, point.u - center.u) / DEG;
}

function midpoint(a: { u: number; v: number }, b: { u: number; v: number }) {
  return { u: (a.u + b.u) / 2, v: (a.v + b.v) / 2 };
}

/** Liegt der Winkel auf dem ueberstrichenen Teil des Kreises — oder in der Luecke? */
function covers(spec: ArcPathSpec, angleDeg: number): boolean {
  const turn = 2 * Math.PI;
  const ahead = Math.sign(spec.sweepAngle) * (angleDeg * DEG - spec.startAngle);
  return ((ahead % turn) + turn) % turn <= Math.abs(spec.sweepAngle);
}

describe('Drehsinn', () => {
  // Die eine Regel, die nicht geraten werden darf: global y zeigt aus der Ebene
  // heraus, ein positives Moment dreht im Bild also GEGEN den Uhrzeigersinn.
  // Auf dem Schirm waechst der Winkel im Uhrzeigersinn — daher das Minus.
  it('turns counter-clockwise for a positive moment', () => {
    const spec = arc([nodeMoment(10)], 'load:nm:b:my:arc');

    expect(spec.sweepAngle).toBeLessThan(0);
    expect(spec.startAngle / DEG).toBeCloseTo(45, 10);
  });

  it('mirrors the symbol for a negative moment', () => {
    const spec = arc([nodeMoment(-10)], 'load:nm:b:my:arc');

    expect(spec.sweepAngle).toBeGreaterThan(0);
    expect(spec.startAngle / DEG).toBeCloseTo(135, 10);
  });

  it('sweeps 270 degrees, minus the angle the head occupies', () => {
    // Bogen UND Spitze fuellen zusammen die 270 Grad — sonst steht die Luecke
    // schief zur Figur und der Bogen laeuft unter der Spitze hervor.
    for (const my of [10, -10]) {
      const spec = arc([nodeMoment(my)], 'load:nm:b:my:arc');
      expect(Math.abs(spec.sweepAngle)).toBeCloseTo(270 * DEG - HEAD_SPAN, 12);
    }
  });
});

describe('Luecke', () => {
  // Festgehalten wird die LUECKE, nicht der Kopf: haelt man den Kopf fest,
  // wandert sie mit dem Umlaufsinn und steht beim einen Vorzeichen unten, beim
  // anderen seitlich.
  it('stays at the bottom, whichever way the moment turns', () => {
    for (const my of [10, -10]) {
      const spec = arc([nodeMoment(my)], 'load:nm:b:my:arc');

      // `v` waechst nach unten: +90 Grad ist unten, -90 Grad ist oben.
      expect(covers(spec, 90)).toBe(false);
      expect(covers(spec, -90)).toBe(true);
      expect(covers(spec, 0)).toBe(true);
      expect(covers(spec, 180)).toBe(true);
    }
  });

  it('is symmetric about the bottom — 45 degrees to either side', () => {
    for (const my of [10, -10]) {
      const spec = arc([nodeMoment(my)], 'load:nm:b:my:arc');
      // Der volle Umlauf, ohne die Kuerzung um den Kopf: der zeigt in die
      // Luecke hinein und gehoert zur Figur.
      const ends = [
        spec.startAngle / DEG,
        (spec.startAngle + Math.sign(spec.sweepAngle) * 270 * DEG) / DEG,
      ].map((deg) => ((((deg + 180) % 360) + 360) % 360) - 180);

      expect(ends.sort((a, b) => a - b).map((d) => Math.round(d))).toEqual([
        45, 135,
      ]);
    }
  });
});

describe('Pfeilspitze', () => {
  // Der Kopf sitzt am ENDE des Bogens, also an der Kante der Luecke, in die er
  // hineinzeigt — beim positiven Moment unten links, beim negativen unten
  // rechts. Um seine eigene Spanne davor, damit die Spitze die Kante trifft.
  it('sits at the edge of the gap it points into', () => {
    for (const [my, expected] of [
      [10, 135 + HEAD_SPAN / DEG],
      [-10, 45 - HEAD_SPAN / DEG],
    ] as const) {
      const spec = head([nodeMoment(my)], 'load:nm:b:my:head');
      const base = midpoint(spec.points[1]!, spec.points[2]!);

      expect(angleDegAt({ u: 100, v: 0 }, base)).toBeCloseTo(expected, 10);
    }
  });

  it('puts the base of the triangle exactly where the arc ends', () => {
    // Sonst steht die stumpfe Strichkappe des Bogens dort, wo das Dreieck
    // spitz sein soll — oder es klafft eine Fuge.
    const line = arc([nodeMoment(10)], 'load:nm:b:my:arc');
    const spec = head([nodeMoment(10)], 'load:nm:b:my:head');
    const end = line.startAngle + line.sweepAngle;
    const base = midpoint(spec.points[1]!, spec.points[2]!);

    expect(base.u).toBeCloseTo(line.center.u + line.radius * Math.cos(end), 10);
    expect(base.v).toBeCloseTo(line.center.v + line.radius * Math.sin(end), 10);
  });

  it('stands tangentially on the circle, pointing the way the arc runs', () => {
    const spec = head([nodeMoment(10)], 'load:nm:b:my:head');
    const base = midpoint(spec.points[1]!, spec.points[2]!);
    const tip = spec.points[0]!;

    // Laenge = pointerLength, und senkrecht auf dem Radius.
    expect(Math.hypot(tip.u - base.u, tip.v - base.v)).toBeCloseTo(
      POINTER_LENGTH,
      10,
    );
    const radial = { u: base.u - 100, v: base.v - 0 };
    expect(
      (tip.u - base.u) * radial.u + (tip.v - base.v) * radial.v,
    ).toBeCloseTo(0, 8);
    // Gegen den Uhrzeigersinn heisst: die Spitze liegt bei kleinerem Winkel.
    expect(angleDegAt({ u: 100, v: 0 }, tip)).toBeLessThan(
      angleDegAt({ u: 100, v: 0 }, base),
    );
  });

  it('is filled AND stroked, exactly as Konva draws the force arrow head', () => {
    // Sonst faellt der Kopf bei gleichem `pointerLength`/`pointerWidth` kleiner
    // aus als der des Kraftpfeils — der Strich liegt mittig auf der Kontur und
    // traegt nach aussen auf.
    const spec = head([nodeMoment(10)], 'load:nm:b:my:head');

    expect(spec.points).toHaveLength(3);
    expect(spec.closed).toBe(true);
    expect(spec.fillColor).toBe('#1d4ed8');
    expect(spec.strokeColor).toBe('#1d4ed8');
    expect(spec.strokeWidth).toBe(2);
  });

  it('reads pointerWidth as the FULL base width, as Konva does', () => {
    const spec = head([nodeMoment(10)], 'load:nm:b:my:head');
    const [, left, right] = spec.points;

    expect(Math.hypot(left!.u - right!.u, left!.v - right!.v)).toBeCloseTo(8, 10);
  });
});

describe('Lage und Groesse', () => {
  it('centres the arc on the point of application', () => {
    expect(arc([nodeMoment(10)], 'load:nm:b:my:arc').center).toEqual({
      u: 100,
      v: 0,
    });
  });

  it('interpolates the point of application along the beam axis', () => {
    expect(arc([beamMoment(5)], 'load:bm:ab:arc').center).toEqual({
      u: 50,
      v: 0,
    });
  });

  it('reads a relative station as PERCENT of the beam length', () => {
    const spec = arc(
      [beamMoment(5, { distanceFromStart: 25, relativeDistances: true })],
      'load:bm:ab:arc',
    );

    expect(spec.center).toEqual({ u: 25, v: 0 });
  });

  it('keeps radius, head and label screen-constant while zooming', () => {
    const at1 = arc([nodeMoment(10)], 'load:nm:b:my:arc');
    const at4 = arc([nodeMoment(10)], 'load:nm:b:my:arc', vp4);
    const text1 = label([nodeMoment(10)], 'load:nm:b:my:label');
    const text4 = label([nodeMoment(10)], 'load:nm:b:my:label', vp4);

    expect(at1.radius).toBe(RADIUS);
    expect(at4.radius).toBe(RADIUS / 4);
    // Winkel sind Verhaeltnisse und aendern sich deshalb NICHT: die Figur wird
    // kleiner, nicht anders.
    expect(at4.startAngle).toBe(at1.startAngle);
    expect(at4.sweepAngle).toBeCloseTo(at1.sweepAngle, 12);
    expect(text4.gap).toBe(text1.gap / 4);
  });

  it('leaves the stroke width untouched — the adapter draws it in screen px', () => {
    expect(arc([nodeMoment(10)], 'load:nm:b:my:arc', vp4).strokeWidth).toBe(
      arc([nodeMoment(10)], 'load:nm:b:my:arc').strokeWidth,
    );
  });
});

describe('Label', () => {
  it('formats the magnitude with roundSmart and a kNm unit', () => {
    expect(label([nodeMoment(10)], 'load:nm:b:my:label').text).toBe('10 kNm');
    expect(label([nodeMoment(-1.23456)], 'load:nm:b:my:label').text).toBe(
      '1.235 kNm',
    );
  });

  it('anchors on the arc circle, above it, with the same gap as a force', () => {
    // Oben, weil unten die Luecke sitzt: dorthin zeigt der Kopf.
    for (const my of [10, -10]) {
      const spec = label([nodeMoment(my)], 'load:nm:b:my:label');

      expect(spec.anchor).toEqual({ u: 100, v: -RADIUS });
      expect(spec.direction).toEqual({ u: 0, v: -1 });
      expect(spec.gap).toBe(6);
    }
  });
});

describe('Nicht gezeichnete Momente', () => {
  it('skips a moment that is absent or zero', () => {
    expect(loadOnly([nodeMoment(0)])).toHaveLength(0);
    expect(loadOnly([beamMoment(0)])).toHaveLength(0);
  });
});

describe('Ziele', () => {
  it('fans out over every target', () => {
    expect(loadOnly([nodeMoment(5, { nodeIds: ['a', 'b'] })]).map((s) => s.id)).toEqual([
      'load:nm:a:my:arc',
      'load:nm:a:my:head',
      'load:nm:a:my:label',
      'load:nm:b:my:arc',
      'load:nm:b:my:head',
      'load:nm:b:my:label',
    ]);
  });

  it('throws UnknownLoadTargetError for a beam that does not exist', () => {
    expect(() => specsFor([beamMoment(5, { beamIds: ['missing'] })])).toThrow(
      UnknownLoadTargetError,
    );
  });
});

describe('Szene bleibt gueltig', () => {
  it('puts the moment into the topmost paint band', () => {
    expect(
      loadOnly([nodeMoment(5), beamMoment(3)]).every((s) => s.layer === 'loads'),
    ).toBe(true);
  });

  it('produces specs that pass render-core validation', () => {
    expect(() =>
      validateSpecs(specsFor([nodeMoment(5), beamMoment(-3)])),
    ).not.toThrow();
  });
});
