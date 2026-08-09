import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const page = (name: string) => resolve(__dirname, name);

export default defineConfig({
  optimizeDeps: {
    exclude: ['monaco-editor'],
  },
  build: {
    rolldownOptions: {
      input: {
        index: page('index.html'),
        crossSectionViewer: page('cross-section/cross-section-viewer.html'),
        parametricSections: page('cross-section/parametric-sections.html'),
        midlineSections: page('cross-section/midline-sections.html'),
        outlineSections: page('cross-section/outline-sections.html'),
        femCantilever: page('fem/fem-cantilever.html'),
        femScripting: page('fem/fem-scripting.html'),
        femViewer: page('fem/fem-viewer.html'),
        femViewer2: page('fem/fem-viewer-2.html'),
        linearSolver: page('fem/linear-solver.html'),
        konva: page('konva.html'),
      },
    },
  },
});
