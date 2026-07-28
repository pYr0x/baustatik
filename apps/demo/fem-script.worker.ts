import * as scriptRuntime from '@baustatik/script';
import {
  createFEMModelBuilder,
  FEMScriptError,
  type ModelDefinition,
} from '@baustatik/script';
import type {
  ExecuteScriptRequest,
  ExecuteScriptResponse,
} from './fem-script-protocol';

type WorkerScope = {
  onmessage: ((event: MessageEvent<ExecuteScriptRequest>) => void) | null;
  postMessage(message: ExecuteScriptResponse): void;
};

const workerScope = globalThis as unknown as WorkerScope;

workerScope.onmessage = (event) => {
  void execute(event.data);
};

async function execute(request: ExecuteScriptRequest): Promise<void> {
  if (request.type !== 'execute') return;

  try {
    const definition = evaluate(request.javaScript);
    const builder = createFEMModelBuilder();
    await definition(builder);
    workerScope.postMessage({
      type: 'success',
      requestId: request.requestId,
      snapshot: builder.finish(),
    });
  } catch (error) {
    workerScope.postMessage({
      type: 'failure',
      requestId: request.requestId,
      error: normalizeError(error),
    });
  }
}

function evaluate(javaScript: string): ModelDefinition {
  const exports: Record<string, unknown> = {};
  const module = { exports };
  const requireModule = (specifier: string): typeof scriptRuntime => {
    if (specifier !== '@baustatik/script') {
      throw new FEMScriptError(`Import "${specifier}" ist nicht erlaubt.`);
    }
    return scriptRuntime;
  };

  const run = new Function(
    'require',
    'exports',
    'module',
    `${javaScript}\n//# sourceURL=fem-user-script.js`,
  );
  run(requireModule, exports, module);

  const definition = module.exports.default;
  if (typeof definition !== 'function') {
    throw new FEMScriptError(
      'Das Skript muss ein mit defineModel() erzeugtes default exportieren.',
    );
  }
  return definition as ModelDefinition;
}

function normalizeError(error: unknown): {
  kind: 'dsl' | 'runtime';
  message: string;
  line?: number;
  column?: number;
  stack?: string;
} {
  const value = error instanceof Error ? error : new Error(String(error));
  const position = /fem-user-script\.js:(\d+):(\d+)/.exec(value.stack ?? '');
  return {
    kind: value instanceof FEMScriptError ? 'dsl' : 'runtime',
    message: value.message,
    ...(position === null
      ? {}
      : { line: Number(position[1]), column: Number(position[2]) }),
    ...(value.stack === undefined ? {} : { stack: value.stack }),
  };
}
