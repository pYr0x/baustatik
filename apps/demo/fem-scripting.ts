import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import { effectiveLoads, type LoadCase } from '@baustatik/fem-loads';
import { createFEMSolver } from '@baustatik/fem-solver';
import { createFEMViewer, FEM_LAYERS } from '@baustatik/fem-viewer';
import { createKonvaAdapter } from '@baustatik/konva-adapter';
import {
  femScriptDeclarations,
  parseFEMModelSnapshot,
} from '@baustatik/script';
import { screenPoint, viewport } from '@baustatik/viewport-2d';
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';
import { createPinia, defineStore } from 'pinia';
import type {
  ExecuteScriptRequest,
  ExecuteScriptResponse,
} from './fem-script-protocol';
import { solveLinearSystem } from './linear-solver-port';

const SCRIPT_URI = monaco.Uri.parse('file:///fem-model.ts');
const SCRIPT_MODULE_URI =
  'file:///node_modules/@baustatik/script/index.d.ts';
const EXECUTION_TIMEOUT_MS = 2_000;

const exampleScript = `import { defineModel } from '@baustatik/script';

export default defineModel(model => {
  const width = 5;
  const count = 4;
  const loadCase = model.loadCase({
    name: 'Schnee',
    category: { action: 'variable', kind: 'snow' },
  });

  const nodes = Array.from({ length: count + 1 }, (_, i) =>
    model.node({ x: i * width, z: 0 }),
  );

  nodes[0].support({ ux: 'fixed', uz: 'fixed', phiY: 'free' });
  nodes.at(-1)!.support({ ux: 'free', uz: 'fixed', phiY: 'free' });

  const beams = nodes.slice(0, -1).map((node, i) =>
    model.beam(node, nodes[i + 1], {
      crossSectionId: 'IPE200',
      materialId: 'S235',
    }),
  );

  loadCase.beamLoad(beams, {
    kind: 'force',
    distribution: 'constant',
    frame: 'global',
    axis: 'z',
    q: 5,
  });
});
`;

configureMonaco();

const editorElement = requireElement('editor');
const viewerElement = requireElement('viewer');
const runButton = requireElement<HTMLButtonElement>('run-script');
const statusElement = requireElement('status');
const problemsElement = requireElement<HTMLUListElement>('problems');

const model = monaco.editor.createModel(exampleScript, 'typescript', SCRIPT_URI);
const editor = monaco.editor.create(editorElement, {
  model,
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 14,
  lineHeight: 22,
  padding: { top: 16 },
  scrollBeyondLastLine: false,
  theme: 'vs-dark',
});

const pinia = createPinia();
const useFEMScriptStore = defineStore('fem-scripting', {
  state: () => ({
    nodes: [] as Node[],
    beams: [] as Beam[],
    supports: [] as NodeSupport[],
    loadCases: [] as LoadCase[],
    activeLoadCaseId: '',
  }),
  getters: {
    activeLoadCase(state): LoadCase | undefined {
      return state.loadCases.find(
        (loadCase) => loadCase.id === state.activeLoadCaseId,
      );
    },
  },
  actions: {
    replaceModel(input: unknown): void {
      const snapshot = parseFEMModelSnapshot(input);
      this.$patch({
        nodes: [...snapshot.nodes],
        beams: [...snapshot.beams],
        supports: [...snapshot.supports],
        loadCases: snapshot.loadCases.map((loadCase) =>
          structuredClone(loadCase),
        ),
        activeLoadCaseId: snapshot.loadCases[0]?.id ?? '',
      });
    },
  },
});
const store = useFEMScriptStore(pinia);

const bounds = viewerElement.getBoundingClientRect();
const stageSize = {
  width: Math.max(320, Math.floor(bounds.width)),
  height: Math.max(260, Math.floor(bounds.height)),
};
const driver = createKonvaAdapter({
  container: viewerElement,
  width: stageSize.width,
  height: stageSize.height,
  layers: FEM_LAYERS,
});
const viewer = createFEMViewer({
  driver,
  initialViewport: viewport(
    screenPoint(48, stageSize.height / 2),
    Math.max(20, (stageSize.width - 96) / 20),
  ),
  getNodes: () => store.nodes,
  getBeams: () => store.beams,
  getSupports: () => store.supports,
  getLoads: () => {
    const active = store.activeLoadCase;
    return active === undefined ? [] : effectiveLoads(active);
  },
  getScreenSize: () => stageSize,
  grid: { spacing: 1 },
});
viewer.requestRender();
store.$subscribe(() => viewer.requestRender());

const solver = createFEMSolver({
  getNodes: () => store.nodes,
  getBeams: () => store.beams,
  getSupports: () => store.supports,
  getLoadCases: () => store.loadCases,
  getSectionProperties: () => ({ EA: 1e6, EI: 1000, GAs: 500 }),
  solveLinearSystem,
});

runButton.addEventListener('click', () => void runScript());
editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
  void runScript();
});

let isRunning = false;

void runScript();

async function runScript(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  runButton.disabled = true;
  setStatus('TypeScript wird geprüft ...', [], 'working');
  try {
    const emitted = await emitJavaScript();
    if (!emitted.ok) {
      setStatus(
        `${emitted.problems.length} TypeScript-Fehler verhindern die Ausführung.`,
        emitted.problems,
        'error',
      );
      return;
    }

    setStatus('Skript läuft im Worker ...', [], 'working');
    const response = await executeInWorker(emitted.javaScript);
    if (response.type === 'failure') {
      const position =
        response.error.line === undefined
          ? ''
          : `JavaScript-Zeile ${response.error.line}${
              response.error.column === undefined
                ? ''
                : `, Spalte ${response.error.column}`
            }: `;
      const label =
        response.error.kind === 'timeout'
          ? 'Timeout'
          : response.error.kind === 'dsl'
            ? 'DSL-Fehler'
            : 'Laufzeitfehler';
      setStatus(label, [`${position}${response.error.message}`], 'error');
      return;
    }

    try {
      store.replaceModel(response.snapshot);
    } catch (error) {
      setStatus('Modellfehler', [errorMessage(error)], 'error');
      return;
    }

    const report =
      store.activeLoadCaseId === ''
        ? undefined
        : solver.check(store.activeLoadCaseId);
    setStatus(
      `Modell übernommen: ${store.nodes.length} Knoten, ${store.beams.length} Stäbe, ${store.loadCases.length} Lastfälle.`,
      report === undefined ? [] : [`Solver-Status: ${report.state}`],
      'success',
    );
  } catch (error) {
    setStatus('Ausführung fehlgeschlagen', [errorMessage(error)], 'error');
  } finally {
    isRunning = false;
    runButton.disabled = false;
  }
}

type DiagnosticMessage =
  | string
  | {
      readonly messageText: string;
      readonly next?: readonly DiagnosticMessage[];
    };

type ScriptDiagnostic = {
  readonly category: number;
  readonly start?: number;
  readonly messageText: DiagnosticMessage;
};

async function emitJavaScript(): Promise<
  | { ok: true; javaScript: string }
  | { ok: false; problems: string[] }
> {
  const getWorker = await getTypeScriptWorker();
  const client = await getWorker(SCRIPT_URI);
  const fileName = SCRIPT_URI.toString();
  const diagnostics = [
    ...(await client.getSyntacticDiagnostics(fileName)),
    ...(await client.getSemanticDiagnostics(fileName)),
  ] as ScriptDiagnostic[];
  const errors = diagnostics.filter((diagnostic) => diagnostic.category === 1);
  if (errors.length > 0) {
    return {
      ok: false,
      problems: errors.map((diagnostic) => {
        const position = model.getPositionAt(diagnostic.start ?? 0);
        return `Zeile ${position.lineNumber}, Spalte ${position.column}: ${flattenMessage(diagnostic.messageText)}`;
      }),
    };
  }

  const output = await client.getEmitOutput(fileName);
  const javaScript = output.outputFiles.find((file) => file.name.endsWith('.js'));
  if (output.emitSkipped || javaScript === undefined) {
    throw new Error('Der TypeScript-Worker hat kein JavaScript erzeugt.');
  }
  return { ok: true, javaScript: javaScript.text };
}

async function getTypeScriptWorker(): Promise<
  Awaited<ReturnType<typeof monaco.typescript.getTypeScriptWorker>>
> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return await monaco.typescript.getTypeScriptWorker();
    } catch (error) {
      if (String(error) !== 'TypeScript not registered!') throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
  }
  throw new Error('Der Monaco-TypeScript-Dienst konnte nicht gestartet werden.');
}

function executeInWorker(javaScript: string): Promise<ExecuteScriptResponse> {
  const requestId = crypto.randomUUID();
  const worker = new Worker(new URL('./fem-script.worker.ts', import.meta.url), {
    type: 'module',
  });
  const request: ExecuteScriptRequest = {
    type: 'execute',
    requestId,
    javaScript,
  };

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      worker.terminate();
      resolve({
        type: 'failure',
        requestId,
        error: {
          kind: 'timeout',
          message: `Das Skript wurde nach ${EXECUTION_TIMEOUT_MS} ms beendet.`,
        },
      });
    }, EXECUTION_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<ExecuteScriptResponse>) => {
      if (event.data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      resolve({
        type: 'failure',
        requestId,
        error: { kind: 'runtime', message: event.message },
      });
    };
    worker.postMessage(request);
  });
}

function configureMonaco(): void {
  const environment = globalThis as typeof globalThis & {
    MonacoEnvironment?: {
      getWorker(moduleId: string, label: string): Worker;
    };
  };
  environment.MonacoEnvironment = {
    getWorker(_moduleId, label) {
      return label === 'typescript' || label === 'javascript'
        ? new TypeScriptWorker()
        : new EditorWorker();
    },
  };

  const defaults = monaco.typescript.typescriptDefaults;
  defaults.setEagerModelSync(true);
  defaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    onlyVisible: true,
  });
  defaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ESNext,
    module: monaco.typescript.ModuleKind.CommonJS,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    strict: true,
    noEmitOnError: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
  });
  defaults.addExtraLib(femScriptDeclarations, SCRIPT_MODULE_URI);
}

function flattenMessage(message: DiagnosticMessage): string {
  if (typeof message === 'string') return message;
  const next = message.next?.map(flattenMessage).join(' ') ?? '';
  return `${message.messageText}${next === '' ? '' : ` ${next}`}`;
}

function setStatus(
  message: string,
  problems: readonly string[],
  kind: 'working' | 'success' | 'error',
): void {
  statusElement.textContent = message;
  statusElement.dataset.kind = kind;
  problemsElement.replaceChildren(
    ...problems.map((problem) => {
      const item = document.createElement('li');
      item.textContent = problem;
      return item;
    }),
  );
}

function requireElement<T extends HTMLElement = HTMLDivElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Element #${id} fehlt.`);
  return element as T;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

Object.assign(globalThis, { editor, store, solver });
