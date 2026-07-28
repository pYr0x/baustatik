import type { FEMModelSnapshot } from '@baustatik/script';

export type ExecuteScriptRequest = {
  readonly type: 'execute';
  readonly requestId: string;
  readonly javaScript: string;
};

export type ScriptErrorKind = 'dsl' | 'runtime' | 'timeout';

export type ExecuteScriptResponse =
  | {
      readonly type: 'success';
      readonly requestId: string;
      readonly snapshot: FEMModelSnapshot;
    }
  | {
      readonly type: 'failure';
      readonly requestId: string;
      readonly error: {
        readonly kind: ScriptErrorKind;
        readonly message: string;
        readonly line?: number;
        readonly column?: number;
        readonly stack?: string;
      };
    };
