import Konva from 'konva';

export type StageHarness = {
  readonly container: HTMLDivElement;
  readonly stage: Konva.Stage;
  destroy(): void;
};

export function createStageHarness(width = 320, height = 240): StageHarness {
  const container = document.createElement('div');
  container.dataset.testid = 'konva-stage-container';
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);

  const stage = new Konva.Stage({
    container,
    width,
    height,
  });

  return {
    container,
    stage,
    destroy: () => {
      stage.destroy();
      container.remove();
    },
  };
}
