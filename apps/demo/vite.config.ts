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
        crossSectionViewer: page('cross-section-viewer.html'),
        femCantilever: page('fem-cantilever.html'),
        femScripting: page('fem-scripting.html'),
        femViewer: page('fem-viewer.html'),
        konva: page('konva.html'),
        linearSolver: page('linear-solver.html'),
      },
    },
  },
});
