import type { ViewIntent } from '@baustatik/render-core';
import Konva from 'konva';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdapterHarness } from './harness';

function stage(): Konva.Stage {
  const s = Konva.stages.at(-1);
  if (!s) throw new Error('keine Konva-Stage vorhanden');
  return s;
}

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    pointerId: 1,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  });
}

describe('interaction — pointer-driven view intents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('emits a pan intent with the pointer delta while dragging', () => {
    const h = createAdapterHarness();
    const intents: ViewIntent[] = [];
    h.driver.onViewIntent((i) => intents.push(i));

    const el = stage().content;
    el.dispatchEvent(pointer('pointerdown', 100, 100));
    el.dispatchEvent(pointer('pointermove', 115, 90));

    expect(intents).toEqual([{ type: 'pan', dx: 15, dy: -10 }]);

    h.destroy();
  });

  it('captures the pointer on the container so a drag survives leaving the canvas', () => {
    const h = createAdapterHarness();
    // setPointerCapture wirft bei synthetischen Events (kein aktiver Zeiger);
    // der Spy belegt, dass der Adapter das native Capture ueberhaupt anfordert.
    const capture = vi
      .spyOn(h.container, 'setPointerCapture')
      .mockImplementation(() => undefined);

    stage().content.dispatchEvent(pointer('pointerdown', 100, 100));

    expect(capture).toHaveBeenCalledWith(1);

    h.destroy();
  });

  it('releases capture and stops panning once the pointer is up', () => {
    const h = createAdapterHarness();
    vi.spyOn(h.container, 'setPointerCapture').mockImplementation(
      () => undefined,
    );
    const release = vi
      .spyOn(h.container, 'releasePointerCapture')
      .mockImplementation(() => undefined);
    const intents: ViewIntent[] = [];
    h.driver.onViewIntent((i) => intents.push(i));

    const el = stage().content;
    el.dispatchEvent(pointer('pointerdown', 100, 100));
    el.dispatchEvent(pointer('pointermove', 110, 100));
    // Unter Pointer Capture liefert der Browser das pointerup an den
    // Capture-Target — auch wenn der Zeiger laengst ausserhalb ist.
    el.dispatchEvent(pointer('pointerup', 9999, 9999));
    el.dispatchEvent(pointer('pointermove', 200, 100));

    expect(release).toHaveBeenCalledWith(1);
    expect(intents).toEqual([{ type: 'pan', dx: 10, dy: 0 }]);

    h.destroy();
  });

  it('does not emit pan without a preceding pointerdown', () => {
    const h = createAdapterHarness();
    const intents: ViewIntent[] = [];
    h.driver.onViewIntent((i) => intents.push(i));

    stage().content.dispatchEvent(pointer('pointermove', 50, 50));

    expect(intents).toEqual([]);

    h.destroy();
  });

  it('emits a zoom intent on wheel', () => {
    const h = createAdapterHarness();
    const intents: ViewIntent[] = [];
    h.driver.onViewIntent((i) => intents.push(i));

    stage().content.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
    );

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ type: 'zoom' });
    if (intents[0]?.type === 'zoom') {
      expect(intents[0].factor).toBeGreaterThan(1);
    }

    h.destroy();
  });
});
