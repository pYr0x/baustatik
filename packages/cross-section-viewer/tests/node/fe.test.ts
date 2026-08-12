import type { IndexedLineListSpec } from '@baustatik/render-core';
import { describe, expect, it } from 'vitest';

import { InvalidFEMeshError } from '../../src/errors';
import { type CrossSectionFEMesh, feSpecs } from '../../src/fe';
import { DEFAULT_STYLE } from '../../src/style';

/**
 * Zwei Dreiecke ueber einem Quadrat, die sich die Diagonale teilen:
 *
 *   0 (0,0) —— 1 (10,0)
 *   |        / |
 *   2 (0,10) — 3 (10,10)
 *
 * Fuenf Kanten, nicht sechs — die Diagonale 1–2 gehoert beiden Elementen.
 */
const POINTS = new Float64Array([0, 0, 10, 0, 0, 10, 10, 10]);

function tri3(): CrossSectionFEMesh {
  return {
    kind: 'tri3',
    points: POINTS,
    elements: new Uint32Array([0, 1, 2, 1, 3, 2]),
  };
}

/**
 * Dieselbe Figur als Tri6. Die Mittelknoten liegen exakt in den Kantenmitten;
 * fuer die Darstellung tragen sie nichts bei.
 */
function tri6(): CrossSectionFEMesh {
  return {
    kind: 'tri6',
    points: new Float64Array([
      ...POINTS,
      5, 0, 5, 5, 0, 5, 10, 5, 5, 10,
    ]),
    elements: new Uint32Array([
      0, 1, 2, 4, 5, 6,
      1, 3, 2, 7, 8, 5,
    ]),
  };
}

function wireframe(mesh: CrossSectionFEMesh): IndexedLineListSpec {
  const specs = feSpecs(mesh, DEFAULT_STYLE);
  expect(specs).toHaveLength(1);
  return specs[0] as IndexedLineListSpec;
}

/** Die Kanten als vergleichbare, sortierte Paare. */
function edges(spec: IndexedLineListSpec): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < spec.indices.length; i += 2) {
    pairs.push(`${spec.indices[i]}-${spec.indices[i + 1]}`);
  }
  return pairs.sort();
}

describe('Das Netz wird zu genau einer indexierten Linienliste', () => {
  it('liegt auf dem fe-Band und traegt die Netzpunkte ohne Kopie', () => {
    const spec = wireframe(tri3());

    expect(spec.kind).toBe('indexedLineList');
    expect(spec.id).toBe('cross-section:fe:wireframe');
    expect(spec.layer).toBe('fe');
    // Die Punkte liegen bereits in y/z-Millimetern — es gibt nichts
    // umzurechnen, also auch nichts zu kopieren.
    expect(spec.points).toBe(POINTS);
    expect(spec.strokeColor).toBe(DEFAULT_STYLE.feColor);
    expect(spec.strokeWidth).toBe(DEFAULT_STYLE.feWidthPx);
  });

  it('gibt jede gemeinsame Kante genau EINMAL heraus', () => {
    // Ohne die min/max-Kanonisierung stuende die Diagonale zweimal im Puffer,
    // und ein Strich mit Alpha saehe an jeder Innenkante dunkler aus.
    const spec = wireframe(tri3());

    expect(spec.indices).toHaveLength(10);
    expect(edges(spec)).toEqual(['0-1', '0-2', '1-2', '1-3', '2-3']);
  });

  it('erzeugt aus Tri3 und Tri6 DIESELBEN geometrischen Eckkanten', () => {
    // Ein Tri6 hat die Reihenfolge [v0, v1, v2, m01, m12, m20]; seine Kanten
    // bleiben gerade und die Mittelknoten liegen in deren Mitten. Sie
    // mitzuzeichnen verdoppelte nur die Streckenzahl.
    expect(edges(wireframe(tri6()))).toEqual(edges(wireframe(tri3())));
  });
});

describe('Ein neues Netz ersetzt den Wireframe', () => {
  it('liest die Kanten je Netzobjekt genau einmal ab und cacht sie', () => {
    // Pan und Zoom aendern nur den Viewport, nicht die Topologie: derselbe
    // Puffer, kein zweiter Durchlauf.
    const mesh = tri3();
    expect(wireframe(mesh).indices).toBe(wireframe(mesh).indices);
  });

  it('ein anderes Netzobjekt liefert andere Puffer bei gleicher ID', () => {
    // Die stabile ID fuehrt im Adapter zum Patch derselben Konva.Shape.
    const before = wireframe(tri3());
    const after = wireframe({
      kind: 'tri3',
      points: new Float64Array([0, 0, 10, 0, 0, 10]),
      elements: new Uint32Array([0, 1, 2]),
    });

    expect(after.id).toBe(before.id);
    expect(after.indices).not.toBe(before.indices);
    expect(edges(after)).toEqual(['0-1', '0-2', '1-2']);
  });
});

describe('Kein Netz heisst kein Band', () => {
  it('emittiert ohne Netz gar nichts', () => {
    expect(feSpecs(undefined, DEFAULT_STYLE)).toEqual([]);
  });

  it('emittiert auch fuer ein leeres Netz keine Spec', () => {
    // `IndexedLineListSpec` verlangt mindestens eine Linie; eine leere Menge waere
    // eine Spec, die nichts zeigt.
    expect(
      feSpecs(
        {
          kind: 'tri3',
          points: POINTS,
          elements: new Uint32Array([]),
        },
        DEFAULT_STYLE,
      ),
    ).toEqual([]);
  });
});

describe('Ein fehlerhaftes Netz ist eine gebrochene Vorbedingung', () => {
  it('wirft, statt es still wegzuzeichnen', () => {
    // Anders als der Wandgraph, der waehrend der Eingabe unfertig sein DARF:
    // ein Netz ist ein Rechenergebnis.
    expect(() =>
      feSpecs(
        { kind: 'tri6', points: POINTS, elements: new Uint32Array([0, 1, 2]) },
        DEFAULT_STYLE,
      ),
    ).toThrow(InvalidFEMeshError);
  });

  it('nennt Elementbreite und Elementzahl als Felder', () => {
    try {
      feSpecs(
        { kind: 'tri3', points: POINTS, elements: new Uint32Array([0, 1]) },
        DEFAULT_STYLE,
      );
      expect.unreachable('haette werfen muessen');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidFEMeshError);
      expect(error).toMatchObject({
        kind: 'tri3',
        elementWidth: 3,
        elementLength: 2,
      });
    }
  });
});
