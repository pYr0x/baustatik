import { describe, expect, it } from 'vitest';
import { InvalidSpecError, type SegmentSetSpec, validateSpec } from '../src';

/** Zwei getrennte Strecken auf vier Punkten — der Regelfall eines Drahtgitters. */
function segmentSet(overrides: Partial<SegmentSetSpec> = {}): SegmentSetSpec {
  return {
    id: 'ss1',
    kind: 'segmentSet',
    points: [0, 0, 10, 0, 0, 10, 10, 10],
    segments: [0, 1, 2, 3],
    strokeColor: '#000',
    strokeWidth: 1,
    ...overrides,
  };
}

describe('Der Streckensatz nimmt beide Pufferarten', () => {
  it('akzeptiert gewöhnliche JavaScript-Arrays', () => {
    expect(() => validateSpec(segmentSet())).not.toThrow();
  });

  it('akzeptiert Float64Array und Uint32Array unverändert', () => {
    // DER EIGENTLICHE ZWECK von `ArrayLike`: ein Mesh-Puffer soll ohne Kopie
    // durchgereicht werden können. Ein `Array.isArray`-Test in der Validierung
    // würde genau diesen Fall zurückweisen.
    expect(() =>
      validateSpec(
        segmentSet({
          points: new Float64Array([0, 0, 10, 0, 0, 10, 10, 10]),
          segments: new Uint32Array([0, 1, 2, 3]),
        }),
      ),
    ).not.toThrow();
  });
});

describe('Die Puffer müssen zueinander passen', () => {
  it('weist eine ungerade Koordinatenzahl zurück', () => {
    expect(() => validateSpec(segmentSet({ points: [0, 0, 10] }))).toThrow(
      InvalidSpecError,
    );
  });

  it('weist weniger als zwei Punkte zurück', () => {
    // Ein einzelner Punkt trägt keine Strecke, genau wie ein Polygon unter drei
    // Punkten keine Fläche trägt.
    expect(() => validateSpec(segmentSet({ points: [0, 0] }))).toThrow(
      InvalidSpecError,
    );
  });

  it('weist nicht endliche Koordinaten zurück', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        validateSpec(segmentSet({ points: [0, 0, 10, bad] })),
      ).toThrow(InvalidSpecError);
    }
  });

  it('weist eine ungerade Indexzahl und eine leere Menge zurück', () => {
    expect(() => validateSpec(segmentSet({ segments: [0, 1, 2] }))).toThrow(
      InvalidSpecError,
    );
    expect(() => validateSpec(segmentSet({ segments: [] }))).toThrow(
      InvalidSpecError,
    );
  });

  it('weist negative, gebrochene, nicht endliche und zu große Indizes zurück', () => {
    // Vier Punkte, gültig ist also [0, 4). Ein Index daneben ließe den Adapter
    // aus dem Nichts lesen.
    for (const bad of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 4]) {
      expect(() => validateSpec(segmentSet({ segments: [0, bad] }))).toThrow(
        InvalidSpecError,
      );
    }
  });
});

describe('Erlaubt bleibt, was nur der Erzeuger beurteilen kann', () => {
  it('lässt doppelte, rückwärts gerichtete und entartete Strecken durch', () => {
    // Geometrisch unschädlich und wie bei `LineSpec` nicht Sache der
    // Validierung: sie prüft die Lesbarkeit der Puffer, nicht die Zeichnung.
    expect(() =>
      validateSpec(segmentSet({ segments: [0, 1, 1, 0, 0, 1, 2, 2] })),
    ).not.toThrow();
  });
});

describe('Der Streckensatz ist ein gewöhnliches Primitive', () => {
  it('darf Kind einer Gruppe sein', () => {
    // Er steht in `ShapeSpec` und bekommt damit kein Sonderrecht — anders als
    // `label`, das im Renderer selbst eine Gruppe ist.
    expect(() =>
      validateSpec({
        id: 'g1',
        kind: 'group',
        position: { u: 0, v: 0 },
        translation: { u: 0, v: 0 },
        children: [segmentSet({ layer: undefined })],
      }),
    ).not.toThrow();
  });
});
