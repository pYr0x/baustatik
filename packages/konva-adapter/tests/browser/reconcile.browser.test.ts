import type {
  GroupSpec,
  LabelSpec,
  LineSpec,
  Spec,
} from '@baustatik/render-core';
import Konva from 'konva';
import { afterEach, describe, expect, it } from 'vitest';
import { createAdapterHarness } from './harness';

// Der Adapter kapselt seine Stage bewusst. Fuer Verhaltens-Assertions greifen
// wir auf Konvas globales Stage-Register zu und nehmen die zuletzt erzeugte.
function currentStage(): Konva.Stage {
  const stage = Konva.stages.at(-1);
  if (!stage) throw new Error('keine Konva-Stage vorhanden');
  return stage;
}

const line = (id: string, overrides: Partial<LineSpec> = {}): LineSpec => ({
  id,
  kind: 'line',
  from: { u: 0, v: 0 },
  to: { u: 10, v: 0 },
  strokeColor: 'black',
  strokeWidth: 2,
  ...overrides,
});

describe('reconcile — diffing against the live Konva tree', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('builds a primitive for each spec', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([line('a'), line('b')]);

    const stage = currentStage();
    expect(stage.findOne('#a')).toBeInstanceOf(Konva.Line);
    expect(stage.findOne('#b')).toBeInstanceOf(Konva.Line);

    h.destroy();
  });

  it('patches in place, keeping the same node instance across reconciles', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([line('a', { strokeColor: 'black' })]);
    const first = currentStage().findOne('#a');

    h.driver.reconcile([line('a', { strokeColor: 'red' })]);
    const second = currentStage().findOne('#a');

    expect(second).toBe(first);
    expect((second as Konva.Line).stroke()).toBe('red');

    h.destroy();
  });

  it('resets a value to undefined on patch (build/patch parity)', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([line('a', { strokeColor: 'red' })]);
    h.driver.reconcile([line('a', { strokeColor: undefined })]);

    expect((currentStage().findOne('#a') as Konva.Line).stroke()).toBeUndefined();

    h.destroy();
  });

  it('replaces the node when the same id changes kind', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([line('a')]);
    expect(currentStage().findOne('#a')).toBeInstanceOf(Konva.Line);

    const circle: Spec = {
      id: 'a',
      kind: 'circle',
      center: { u: 0, v: 0 },
      radius: 5,
      fillColor: 'blue',
    };
    h.driver.reconcile([circle]);

    expect(currentStage().findOne('#a')).toBeInstanceOf(Konva.Circle);

    h.destroy();
  });

  it('destroys orphaned nodes that vanish from the spec list', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([line('a'), line('b')]);
    h.driver.reconcile([line('a')]);

    const stage = currentStage();
    expect(stage.findOne('#a')).toBeInstanceOf(Konva.Line);
    expect(stage.findOne('#b')).toBeUndefined();

    h.destroy();
  });

  it('implements every primitive kind, triangle included', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([
      line('l'),
      { id: 'c', kind: 'circle', center: { u: 0, v: 0 }, radius: 5 },
      {
        id: 'p',
        kind: 'polygon',
        points: [
          { u: 0, v: 0 },
          { u: 10, v: 0 },
          { u: 5, v: 5 },
        ],
        closed: true,
      },
      {
        id: 'r',
        kind: 'rectangle',
        topLeft: { u: 0, v: 0 },
        width: 10,
        height: 5,
      },
      { id: 't', kind: 'triangle', center: { u: 0, v: 0 }, sideLength: 6 },
      {
        id: 'a',
        kind: 'arcPath',
        center: { u: 0, v: 0 },
        radius: 5,
        startAngle: 0,
        sweepAngle: Math.PI / 2,
      },
    ]);

    const stage = currentStage();
    expect(stage.findOne('#l')).toBeInstanceOf(Konva.Line);
    expect(stage.findOne('#c')).toBeInstanceOf(Konva.Circle);
    expect(stage.findOne('#p')).toBeInstanceOf(Konva.Line);
    expect(stage.findOne('#r')).toBeInstanceOf(Konva.Rect);
    expect(stage.findOne('#t')).toBeInstanceOf(Konva.RegularPolygon);
    // Der Bogen ist ein Pfad: Konva.Arc waere das Ringsegment und zoege die
    // beiden Radien mit. Konva muss den SVG-String auch WIRKLICH lesen — ein
    // unparsbares `data` ergaebe eine Shape ohne Segmente statt eines Fehlers.
    const arc = stage.findOne('#a') as Konva.Path;
    expect(arc).toBeInstanceOf(Konva.Path);
    expect(arc.dataArray.map((segment) => segment.command)).toEqual(['M', 'A']);

    h.destroy();
  });

  it('builds an indexed line list as ONE Konva.Shape and patches its buffers', () => {
    // Der ganze Zweck des Specs: ein Drahtgitter ist EIN Knoten, nicht einer je
    // Kante. Und weil die Puffer in der `sceneFunc` stecken, muss der
    // gewoehnliche setAttrs-Patch eine NEUE sceneFunc auf dieselbe Shape setzen
    // — sonst zeigte das Bild nach einem neuen Netz noch das alte.
    const h = createAdapterHarness({ layers: ['grid', 'fe'] });
    const mesh = (points: number[]): Spec => ({
      id: 'wire',
      kind: 'indexedLineList',
      layer: 'fe',
      points: new Float64Array(points),
      indices: new Uint32Array([0, 1]),
      strokeColor: '#d9b48a',
      strokeWidth: 1,
    });

    h.driver.reconcile([mesh([0, 0, 10, 0])]);
    const first = currentStage().findOne('#wire') as Konva.Shape;
    expect(first).toBeInstanceOf(Konva.Shape);
    expect(first).not.toBeInstanceOf(Konva.Line);
    const firstSceneFunc = first.sceneFunc();
    // Das erklaerte Band, nicht die Einfuegereihenfolge.
    expect(first.getParent()).toBeInstanceOf(Konva.Group);

    h.driver.reconcile([mesh([0, 0, 20, 20])]);
    const second = currentStage().findOne('#wire') as Konva.Shape;

    expect(second).toBe(first);
    expect(second.sceneFunc()).not.toBe(firstSceneFunc);
    expect(second.strokeScaleEnabled()).toBe(false);

    h.destroy();
  });

  it('patches a rectangle on a second reconcile without throwing', () => {
    const h = createAdapterHarness();
    const rect = (w: number): Spec => ({
      id: 'r',
      kind: 'rectangle',
      topLeft: { u: 0, v: 0 },
      width: w,
      height: 5,
    });
    h.driver.reconcile([rect(10)]);
    // Regression: patch hatte keinen rectangle-Case und warf ab Frame 2.
    expect(() => h.driver.reconcile([rect(20)])).not.toThrow();
    expect((currentStage().findOne('#r') as Konva.Rect).width()).toBe(20);

    h.destroy();
  });
});

describe('reconcile — arrow and label', () => {
  const label = (overrides: Partial<LabelSpec> = {}): LabelSpec => ({
    id: 'lb',
    kind: 'label',
    text: '10 kN',
    anchor: { u: 0, v: 0 },
    direction: { u: 0, v: -1 },
    gap: 6,
    fontSize: 12,
    fontFamily: 'sans-serif',
    textColor: '#1d4ed8',
    padding: 3,
    backgroundColor: '#dbeafe',
    borderColor: '#1d4ed8',
    borderWidth: 1,
    cornerRadius: 3,
    ...overrides,
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  /**
   * Die Boxmaße in WELTeinheiten.
   *
   * Der Text wird in einer festen REFERENZgroesse gebaut und die Gruppe
   * skaliert — `getText().width()` ist deshalb ein Referenzmaß, und erst mal
   * `scaleX()` steht da, was im Bild steht. Genau darauf bezieht sich die
   * Platzierungsregel.
   */
  const boxSize = (node: Konva.Label): { width: number; height: number } => ({
    width: node.getText().width() * node.scaleX(),
    height: node.getText().height() * node.scaleY(),
  });

  it('builds an arrow as a real Konva.Arrow with the head at the tip', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([
      {
        id: 'a',
        kind: 'arrow',
        tail: { u: 0, v: -30 },
        tip: { u: 0, v: 0 },
        pointerLength: 8,
        pointerWidth: 6,
        strokeColor: '#1d4ed8',
        strokeWidth: 2,
        fillColor: '#1d4ed8',
      },
    ]);

    const arrow = currentStage().findOne('#a') as Konva.Arrow;
    expect(arrow).toBeInstanceOf(Konva.Arrow);
    expect(arrow.points()).toEqual([0, -30, 0, 0]);
    expect(arrow.pointerLength()).toBe(8);

    h.destroy();
  });

  it('builds a label as a Konva.Label holding exactly one tag and one text', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([label()]);

    const node = currentStage().findOne('#lb') as Konva.Label;
    expect(node).toBeInstanceOf(Konva.Label);
    expect(node.getChildren()).toHaveLength(2);
    expect(node.getTag()).toBeInstanceOf(Konva.Tag);
    expect(node.getText().text()).toBe('10 kN');
    // Waagerecht, ohne Zeiger: die Box liegt neben dem Anker, sie haengt nicht
    // daran.
    expect(node.rotation()).toBe(0);
    expect((node.getTag() as Konva.Tag).pointerDirection()).toBe('none');

    h.destroy();
  });

  it('patches a label in place and re-measures its box for the new text', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([label()]);
    const first = currentStage().findOne('#lb') as Konva.Label;
    const narrow = first.getText().width();

    h.driver.reconcile([label({ text: '1234.56 kN' })]);
    const second = currentStage().findOne('#lb') as Konva.Label;

    expect(second).toBe(first);
    expect(second.getText().text()).toBe('1234.56 kN');
    expect(second.getText().width()).toBeGreaterThan(narrow);

    h.destroy();
  });

  it('resets dropped label fields on patch (build/patch parity)', () => {
    // Der Label-Patch geht NICHT durch das eine setAttrs der uebrigen
    // Primitives, kann also eigenstaendig vom Neubau abweichen. Ein
    // weggefallener Rand muss auch hier verschwinden statt einzufrieren.
    const h = createAdapterHarness();
    h.driver.reconcile([label()]);
    h.driver.reconcile([
      label({
        borderColor: undefined,
        borderWidth: undefined,
        cornerRadius: undefined,
      }),
    ]);
    const patched = (currentStage().findOne('#lb') as Konva.Label).getTag();

    h.driver.reconcile([]);
    h.driver.reconcile([
      label({
        borderColor: undefined,
        borderWidth: undefined,
        cornerRadius: undefined,
      }),
    ]);
    const built = (currentStage().findOne('#lb') as Konva.Label).getTag();

    expect(patched.stroke()).toBeUndefined();
    expect(patched.stroke()).toBe(built.stroke());
    expect(patched.strokeWidth()).toBe(built.strokeWidth());
    expect(patched.cornerRadius()).toBe(built.cornerRadius());

    h.destroy();
  });

  it('places the box so the ray from the anchor meets its edge at gap — axis-parallel', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([label()]);

    const node = currentStage().findOne('#lb') as Konva.Label;
    const { width, height } = boxSize(node);

    // Richtung (0,-1): der untere Rand liegt 6 ueber dem Anker, waagerecht
    // zentriert.
    expect(node.x() + width / 2).toBeCloseTo(0, 6);
    expect(node.y() + height).toBeCloseTo(-6, 6);

    h.destroy();
  });

  it('places the box by ray-rectangle intersection for a skewed direction', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([label({ direction: { u: 1, v: -1 } })]);

    const node = currentStage().findOne('#lb') as Konva.Label;
    const { width, height } = boxSize(node);

    // d = (1,-1)/sqrt(2), t = min(hw, hh) * sqrt(2) — bei einer breiten Box
    // also ueber die Hoehe bestimmt.
    const reach = Math.min(width / 2, height / 2) * Math.SQRT2;
    const distance = 6 + reach;

    expect(node.x() + width / 2).toBeCloseTo(Math.SQRT1_2 * distance, 6);
    expect(node.y() + height / 2).toBeCloseTo(-Math.SQRT1_2 * distance, 6);

    h.destroy();
  });

  it('keeps the box proportional to fontSize however far one zooms in', () => {
    // DER FALL, FUER DEN DIE REFERENZGROESSE DA IST. `fontSize` ist ein Weltmaß
    // und wird beim Reinzoomen beliebig klein; direkt im Fontstring („0.006px")
    // quantisieren die Browser die Schrift oder verwerfen sie ganz — die Box
    // waere dann sprunghaft breit und irgendwann leer. Ueber die Skalierung
    // bleibt das Verhaeltnis Boxbreite/fontSize exakt dasselbe, und genau das
    // heisst „auf dem Schirm gleich gross".
    const h = createAdapterHarness();

    h.driver.reconcile([label({ fontSize: 12, padding: 3, gap: 6 })]);
    const coarse = boxSize(currentStage().findOne('#lb') as Konva.Label);

    // Ein Zoomfaktor von 2000 — dort steht ohne die Referenzgroesse `0.006px`
    // im Fontstring.
    h.driver.reconcile([
      label({ fontSize: 12 / 2000, padding: 3 / 2000, gap: 6 / 2000 }),
    ]);
    const node = currentStage().findOne('#lb') as Konva.Label;
    const fine = boxSize(node);

    expect(node.getText().fontSize()).toBe(100);
    expect(fine.width * 2000).toBeCloseTo(coarse.width, 6);
    expect(fine.height * 2000).toBeCloseTo(coarse.height, 6);

    h.destroy();
  });

  it('replaces the node when a label id turns into a shape', () => {
    const h = createAdapterHarness();
    h.driver.reconcile([label({ id: 'x' })]);
    expect(currentStage().findOne('#x')).toBeInstanceOf(Konva.Label);

    h.driver.reconcile([line('x')]);
    expect(currentStage().findOne('#x')).toBeInstanceOf(Konva.Line);

    h.destroy();
  });
});

describe('reconcile — paint bands', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('places specs into their declared band group', () => {
    const h = createAdapterHarness({ layers: ['grid', 'content'] });
    h.driver.reconcile([line('g', { layer: 'grid' })]);

    const node = currentStage().findOne('#g');
    expect(node?.getParent()).toBeInstanceOf(Konva.Group);

    h.destroy();
  });

  it('throws UnknownLayerError for an undeclared band', () => {
    const h = createAdapterHarness({ layers: ['grid'] });
    expect(() =>
      h.driver.reconcile([line('x', { layer: 'nope' })]),
    ).toThrow(/nope|Band/);

    h.destroy();
  });

  it('keeps a later-built content node above an earlier grid node', () => {
    const h = createAdapterHarness({ layers: ['grid', 'content'] });
    h.driver.reconcile([
      line('c', { layer: 'content' }),
      line('g', { layer: 'grid' }),
    ]);

    const stage = currentStage();
    const grid = stage.findOne('#g');
    const content = stage.findOne('#c');
    // Band-Reihenfolge schlaegt Array-Reihenfolge: content-Band liegt oben.
    expect(grid?.getAbsoluteZIndex()).toBeLessThan(
      content?.getAbsoluteZIndex() ?? -1,
    );

    h.destroy();
  });
});

describe('reconcile — groups', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('builds a group with its children and applies rotation', () => {
    const h = createAdapterHarness();
    const group: GroupSpec = {
      id: 'grp',
      kind: 'group',
      position: { u: 5, v: 5 },
      translation: { u: 0, v: 0 },
      rotationDeg: 30,
      children: [line('child')],
    };
    h.driver.reconcile([group]);

    const node = currentStage().findOne('#grp');
    expect(node).toBeInstanceOf(Konva.Group);
    expect((node as Konva.Group).rotation()).toBe(30);
    expect(currentStage().findOne('#child')).toBeInstanceOf(Konva.Line);

    h.destroy();
  });
});
