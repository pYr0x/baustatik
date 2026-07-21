import { createKonvaAdapter, type KonvaDriverConfig } from '../../src';

// Zwei rAF: batchDraw plant die Zeichnung per requestAnimationFrame ein. Nach
// EINEM Frame ist gezeichnet, der zweite stellt sicher, dass der Canvas-Inhalt
// vor einem Screenshot committet ist.
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export interface AdapterHarness {
  readonly container: HTMLDivElement;
  readonly driver: ReturnType<typeof createKonvaAdapter>;
  destroy(): void;
}

// Baut einen Container im DOM und einen Adapter darauf. Der Container traegt
// data-testid, damit Browser-Tests ihn per Locator finden.
export function createAdapterHarness(
  options: Partial<KonvaDriverConfig> = {},
): AdapterHarness {
  const width = options.width ?? 320;
  const height = options.height ?? 240;

  const container = document.createElement('div');
  container.dataset.testid = 'konva-stage-container';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  // Deckender Hintergrund: der Canvas ist transparent, ein weisser Grund macht
  // die Screenshot-Baselines reproduzierbar.
  container.style.background = '#ffffff';
  document.body.appendChild(container);

  const driver = createKonvaAdapter({
    container,
    width,
    height,
    ...options,
  });

  return {
    container,
    driver,
    destroy: () => {
      driver.destroy();
      container.remove();
    },
  };
}
