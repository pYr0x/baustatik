import type { SectionGeometry } from '@baustatik/cross-section';
import type { PolygonSpec } from '@baustatik/render-core';
import { describe, expect, it } from 'vitest';

import { outlineSpecs } from '../../src/outlines';
import { DEFAULT_STYLE } from '../../src/style';
import { OUTLINE, wallGeometry } from '../helpers';

function outlineOnly(outline: SectionGeometry['outline']): SectionGeometry {
  return { kind: 'outline', rings: [], outline };
}

describe('Jeder tragende Ring wird ein geschlossenes Polygon', () => {
  it('bildet y/z ohne Vorzeichenwechsel auf u/v ab', () => {
    const spec = outlineSpecs(
      wallGeometry(),
      DEFAULT_STYLE,
    )[0] as PolygonSpec;

    expect(spec.kind).toBe('polygon');
    expect(spec.id).toBe('cross-section:outline:0');
    expect(spec.layer).toBe('outlines');
    expect(spec.closed).toBe(true);
    expect(spec.points).toEqual([
      { u: 0, v: 0 },
      { u: 100, v: 0 },
      { u: 100, v: 100 },
    ]);
  });

  it('zeichnet den Umriss unabhaengig von der Wanddarstellung', () => {
    // ORANGE, weil ABGELEITET — in Schwarz auf Schwarz saehe man die Kerbe am
    // Grad-3-Knoten nicht (ADR 0037). Und in SCREEN-Pixeln, weil die
    // Umrisslinie eine Kante ist und keine Wand.
    const spec = outlineSpecs(wallGeometry(), DEFAULT_STYLE)[0] as PolygonSpec;

    expect(spec.strokeColor).toBe(DEFAULT_STYLE.outlineColor);
    expect(spec.strokeColor).not.toBe(DEFAULT_STYLE.thinWallColor);
    expect(spec.strokeWidth).toBe(DEFAULT_STYLE.outlineWidthPx);
  });

  it('zeichnet auch den freien Umriss, der gar keine Waende hat', () => {
    expect(outlineSpecs(outlineOnly(OUTLINE), DEFAULT_STYLE)).toHaveLength(1);
  });
});

describe('Ein unfertiger Ring unterdrueckt den Rest nicht', () => {
  it('laesst Ringe unter drei Punkten weg', () => {
    // `render-core` weist sie zu Recht zurueck; das Gate laesst sie durch, weil
    // ein halb gezogener Ring waehrend der Eingabe der Normalfall ist.
    const specs = outlineSpecs(
      outlineOnly([{ points: [{ y: 0, z: 0 }, { y: 1, z: 1 }] }, ...OUTLINE]),
      DEFAULT_STYLE,
    );

    expect(specs).toHaveLength(1);
  });

  it('behaelt den Ringindex in der ID, auch wenn ein frueherer Ring entfaellt', () => {
    // Sonst bekaeme jeder folgende Ring eine neue ID, sobald Ring 0 waehrend
    // der Eingabe kurz entartet — und der Reconciler baute Shapes ab und wieder
    // auf, die sich gar nicht geaendert haben.
    const specs = outlineSpecs(
      outlineOnly([{ points: [{ y: 0, z: 0 }] }, ...OUTLINE]),
      DEFAULT_STYLE,
    );

    expect(specs.map((s) => s.id)).toEqual(['cross-section:outline:1']);
  });
});
