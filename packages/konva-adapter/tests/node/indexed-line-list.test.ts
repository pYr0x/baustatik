import type { IndexedLineListSpec } from '@baustatik/render-core';
import type Konva from 'konva';
import { describe, expect, it } from 'vitest';
import { indexedLineListConfig } from '../../src/primitives';

/** Zwei getrennte waagerechte Strecken, übereinander. */
function indexedLineList(
  overrides: Partial<IndexedLineListSpec> = {},
): IndexedLineListSpec {
  return {
    id: 'ss1',
    kind: 'indexedLineList',
    points: [0, 0, 10, 0, 0, 10, 10, 10],
    indices: [0, 1, 2, 3],
    strokeColor: '#d9b48a',
    strokeWidth: 1,
    ...overrides,
  };
}

/**
 * Ein Canvas-Kontext, der nur MITSCHREIBT.
 *
 * Der Streckensatz ist das einzige Primitive, dessen Aussage nicht in der
 * Config steht, sondern in dem, was seine `sceneFunc` zeichnet. Ein
 * Feldvergleich wie bei den übrigen Primitives träfe sie deshalb nicht.
 */
function recordingContext(): {
  readonly calls: string[];
  readonly context: Konva.Context;
} {
  const calls: string[] = [];
  const context = {
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    strokeShape: () => calls.push('strokeShape'),
  };
  return { calls, context: context as unknown as Konva.Context };
}

function draw(spec: IndexedLineListSpec): readonly string[] {
  const { calls, context } = recordingContext();
  const sceneFunc = indexedLineListConfig(spec).sceneFunc as (
    context: Konva.Context,
    shape: Konva.Shape,
  ) => void;
  sceneFunc(context, {} as Konva.Shape);
  return calls;
}

describe('indexedLineListConfig()', () => {
  it('trägt die vollständige Stroke-Konfiguration', () => {
    const { sceneFunc, ...rest } = indexedLineListConfig(indexedLineList());

    expect(typeof sceneFunc).toBe('function');
    expect(rest).toEqual({
      id: 'ss1',
      stroke: '#d9b48a',
      strokeWidth: 1,
      // Screen-konstanter Strich wie bei jedem anderen Primitive: die
      // Kantendicke eines Drahtgitters ist eine Anzeigegröße, keine Weltgröße.
      strokeScaleEnabled: false,
      dash: undefined,
    });
  });

  it('reicht strokeStyle als Dash-Muster durch', () => {
    expect(
      indexedLineListConfig(
        indexedLineList({ strokeStyle: 'dashed' }),
      ).dash,
    ).toEqual([8, 4]);
  });
});

describe('Die sceneFunc trennt die Strecken', () => {
  it('zeichnet je Strecke einen eigenen Teilpfad', () => {
    // DER PIN: ohne das `moveTo` je Strecke zöge der Canvas eine Linie vom Ende
    // der einen zum Anfang der nächsten Kante — und ein Drahtgitter wäre voller
    // Kanten, die es im Netz nicht gibt.
    expect(draw(indexedLineList())).toEqual([
      'beginPath',
      'moveTo(0,0)',
      'lineTo(10,0)',
      'moveTo(0,10)',
      'lineTo(10,10)',
      'strokeShape',
    ]);
  });

  it('strichelt einmal, nicht je Strecke', () => {
    // `beginPath` und `strokeShape` stehen außen: ein Aufruf je Kante wäre
    // genau die Knotenlawine, die der Spec vermeidet.
    const calls = draw(
      indexedLineList({ indices: [0, 1, 1, 3, 3, 2, 2, 0] }),
    );

    expect(calls.filter((call) => call === 'beginPath')).toHaveLength(1);
    expect(calls.filter((call) => call === 'strokeShape')).toHaveLength(1);
    expect(calls.filter((call) => call.startsWith('moveTo'))).toHaveLength(4);
  });

  it('liest die Puffer über die Indizes, nicht der Reihe nach', () => {
    expect(draw(indexedLineList({ indices: [3, 0] }))).toEqual([
      'beginPath',
      'moveTo(10,10)',
      'lineTo(0,0)',
      'strokeShape',
    ]);
  });

  it('nimmt typisierte Puffer ohne Umweg', () => {
    expect(
      draw(
        indexedLineList({
          points: new Float64Array([0, 0, 4, 3]),
          indices: new Uint32Array([0, 1]),
        }),
      ),
    ).toEqual(['beginPath', 'moveTo(0,0)', 'lineTo(4,3)', 'strokeShape']);
  });
});
