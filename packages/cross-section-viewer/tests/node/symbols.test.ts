import type { SectionProperties, StressPoint } from '@baustatik/cross-section';
import type { CircleSpec, GroupSpec, RectangleSpec } from '@baustatik/render-core';
import { describe, expect, it } from 'vitest';

import { DEFAULT_STYLE } from '../../src/style';
import { symbolSpecs } from '../../src/symbols';
import { PROPERTIES, vp1, vp2 } from '../helpers';

const CENTROID = 'cross-section:symbol:centroid';
const SHEAR_CENTRE = 'cross-section:symbol:shear-centre';

/** Zwei Punkte, absichtlich verkehrt herum eingereicht. */
const STRESS_POINTS: readonly StressPoint[] = [
  { nr: 2, wall: 'flange-top-right', y: 10, z: -20, t: 8, Sy: 0, Sz: 0, ty: -1, tz: 0 },
  { nr: 1, wall: 'flange-top-left', y: -10, z: 20, t: 8, Sy: 0, Sz: 0, ty: 1, tz: 0 },
];

function group(
  properties: SectionProperties | undefined = PROPERTIES,
  stressPoints?: readonly StressPoint[],
  vp = vp1,
): GroupSpec | undefined {
  const specs = symbolSpecs(properties, stressPoints, vp, DEFAULT_STYLE);
  return specs[0] as GroupSpec | undefined;
}

function child<T>(id: string, spec: GroupSpec): T {
  const found = spec.children.find((c) => c.id === id);
  expect(found, `kein Kind mit id ${id}`).toBeDefined();
  return found as T;
}

describe('Die Symbole liegen in EINER Gruppe auf dem symbols-Band', () => {
  it('ist eine Gruppe, deren Kinder kein eigenes Band tragen', () => {
    const spec = group() as GroupSpec;

    expect(spec.kind).toBe('group');
    expect(spec.layer).toBe('symbols');
    for (const kid of spec.children) expect(kid.layer).toBeUndefined();
  });

  it('ordnet Schwerpunkt, Schubmittelpunkt, Spannungspunkte nach nr', () => {
    // Die Ueberdeckung soll reproduzierbar sein — etwa wenn der letzte
    // Spannungspunkt genau im Schwerpunkt liegt. Sortiert wird nach `nr`, nicht
    // nach Arrayreihenfolge.
    const spec = group(PROPERTIES, STRESS_POINTS) as GroupSpec;

    expect(spec.children.map((c) => c.id)).toEqual([
      CENTROID,
      SHEAR_CENTRE,
      'cross-section:symbol:stress-point:1',
      'cross-section:symbol:stress-point:2',
    ]);
  });
});

describe('Die Millimeterlage stimmt auf die Nachkommastelle', () => {
  it('rechnet den Schwerpunkt EXAKT von m nach mm', () => {
    // Der eigentliche Pin: `to('mm')` rundete auf ganze Millimeter, und
    // 139,5 mm landete als 140 mm in der Szene. Deshalb `toExact`.
    const spec = child<CircleSpec>(CENTROID, group() as GroupSpec);

    expect(spec.center.u).toBeCloseTo(6.9, 9);
    expect(spec.center.v).toBeCloseTo(139.5, 9);
    expect(spec.center.v).not.toBe(140);
  });

  it('setzt den Schubmittelpunkt ins SELBE System wie den Schwerpunkt', () => {
    // Keine Verschiebung: `yM`/`zM` sind absolut im Eingabesystem, das ist die
    // Invariante von `SectionProperties`.
    const spec = child<CircleSpec>(SHEAR_CENTRE, group() as GroupSpec);

    expect(spec.center.u).toBeCloseTo(12.3, 9);
    expect(spec.center.v).toBeCloseTo(45.6, 9);
  });

  it('legt Spannungspunkte RELATIV zum Schwerpunkt ab', () => {
    // `StressPoint.y`/`z` sind bereits Millimeter und relativ; der absolute Ort
    // entsteht erst hier.
    const spec = child<RectangleSpec>(
      'cross-section:symbol:stress-point:1',
      group(PROPERTIES, STRESS_POINTS) as GroupSpec,
    );
    const half = DEFAULT_STYLE.stressPointSizePx / 2;

    // Das Rechteck ist auf dem Punkt ZENTRIERT, `topLeft` liegt eine halbe
    // Kantenlaenge davor.
    expect(spec.topLeft.u).toBeCloseTo(6.9 - 10 - half, 9);
    expect(spec.topLeft.v).toBeCloseTo(139.5 + 20 - half, 9);
  });

  it('zeichnet den Verzweigungsknoten einmal, nicht zweimal', () => {
    // SEIT ADR 0059 tragen zwei Punkte denselben Ort — je einer fuer das linke
    // und das rechte Wandelement. Fuer den Betrachter ist es EINE Stelle;
    // zwei deckungsgleiche Rechtecke waeren ein zweites Spec ohne zweites
    // Bild. Gezeichnet wird der mit der kleineren Nummer.
    const node: readonly StressPoint[] = [
      { nr: 3, wall: 'flange-top-left', y: 0, z: -20, t: 8, Sy: -1, Sz: -2, ty: 1, tz: 0 },
      { nr: 4, wall: 'flange-top-right', y: 0, z: -20, t: 8, Sy: -1, Sz: 2, ty: -1, tz: 0 },
    ];
    const specs = (group(PROPERTIES, node) as GroupSpec).children.filter((c) =>
      c.id.startsWith('cross-section:symbol:stress-point:'),
    );

    expect(specs.map((c) => c.id)).toEqual([
      'cross-section:symbol:stress-point:3',
    ]);
  });
});

describe('Die Symbolgroessen bleiben screen-konstant', () => {
  it('teilt jede Px-Groesse durch die Skalierung', () => {
    // Der Gegenfall zur Wandstaerke: ein Schwerpunkt hat keine Ausdehnung, sein
    // Kreis ist ein Zeichen und darf beim Zoom nicht mitwachsen.
    const zoomed = group(PROPERTIES, STRESS_POINTS, vp2) as GroupSpec;

    expect(child<CircleSpec>(CENTROID, zoomed).radius).toBe(
      DEFAULT_STYLE.centroidRadiusPx / 2,
    );
    expect(child<CircleSpec>(SHEAR_CENTRE, zoomed).radius).toBe(
      DEFAULT_STYLE.shearCentreRadiusPx / 2,
    );
    expect(
      child<RectangleSpec>('cross-section:symbol:stress-point:1', zoomed).width,
    ).toBe(DEFAULT_STYLE.stressPointSizePx / 2);
  });

  it('zeichnet den Schubmittelpunkt kleiner als den Schwerpunkt', () => {
    // Bei jeder doppelt symmetrischen Figur fallen die beiden Punkte zusammen;
    // gleich gross bliebe der Schubmittelpunkt unsichtbar.
    const spec = group() as GroupSpec;

    expect(child<CircleSpec>(SHEAR_CENTRE, spec).radius).toBeLessThan(
      child<CircleSpec>(CENTROID, spec).radius,
    );
  });
});

describe('Was fehlt, wird nicht erfunden', () => {
  it('unterdrueckt ohne properties ALLE Ergebnissymbole', () => {
    // Auch die Spannungspunkte: ihre Koordinaten sind relativ und haben ohne
    // Schwerpunkt keinen absoluten Ort.
    expect(symbolSpecs(undefined, STRESS_POINTS, vp1, DEFAULT_STYLE)).toEqual([]);
  });

  it('laesst nur das gruene Symbol weg, wenn der Schubmittelpunkt fehlt', () => {
    // `undefined` heisst „nicht ermittelt" und nicht „faellt mit dem
    // Schwerpunkt zusammen" — weder als 0 noch als Schwerpunkt gedeutet.
    const { yM, zM, ...withoutShearCentre } = PROPERTIES;
    const spec = group(withoutShearCentre) as GroupSpec;

    expect(spec.children.map((c) => c.id)).toEqual([CENTROID]);
  });

  it('verlangt BEIDE Koordinaten des Schubmittelpunkts', () => {
    // Eine halbe Lage ist keine Lage.
    for (const half of [{ ...PROPERTIES, yM: undefined }, { ...PROPERTIES, zM: undefined }]) {
      expect((group(half) as GroupSpec).children.map((c) => c.id)).toEqual([
        CENTROID,
      ]);
    }
  });

  it('laesst nur die blauen Rechtecke weg, wenn Spannungspunkte fehlen', () => {
    const spec = group(PROPERTIES, undefined) as GroupSpec;

    expect(spec.children.map((c) => c.id)).toEqual([CENTROID, SHEAR_CENTRE]);
  });
});
