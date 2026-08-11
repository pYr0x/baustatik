#!/usr/bin/env node
// CI baut mit der nativen Toolchain. Lokal ist sie der schnellste Weg; fehlt
// sie, kapselt das vorhandene Docker-Image die Toolchain. Erst ohne beides darf
// ein vorhandenes pkg/ den Build überspringen.

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUST_WASM_IMAGE = 'rust-wasm:latest';

const TASKS = {
  build: {
    tool: 'wasm-pack',
    command: [
      'wasm-pack',
      'build',
      'rust',
      '--target',
      'web',
      '--out-dir',
      '../pkg',
    ],
    requiredArtifacts: [
      'pkg/sparse_solver_wasm.js',
      'pkg/sparse_solver_wasm_bg.wasm',
    ],
  },
  test: {
    tool: 'cargo',
    command: ['cargo', 'test', '--manifest-path', 'rust/Cargo.toml'],
    requiredArtifacts: [],
  },
};

const taskName = process.argv[2];
const task = TASKS[taskName];

if (task === undefined) {
  console.error(
    `[sparse-solver-wasm] Unbekannter Task "${taskName}". Erlaubt: build, test.`,
  );
  process.exit(1);
}

const isCI =
  process.env.CI !== undefined &&
  process.env.CI !== '' &&
  process.env.CI !== 'false';
const forced = process.env.FORCE_WASM_BUILD === '1';

function hasTool(tool) {
  const probe = spawnSync(tool, ['--version'], {
    stdio: 'ignore',
    shell: true,
  });
  return probe.error === undefined && probe.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error !== undefined) {
    console.error(`[sparse-solver-wasm] ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function removeWasmPackGitignore() {
  // wasm-pack legt ein `.gitignore` mit `*` ab. Ohne das Entfernen würde npm
  // das veröffentlichte WASM trotz package.json#files aus dem Tarball lassen.
  rmSync(join(PACKAGE_ROOT, 'pkg/.gitignore'), { force: true });
}

function runNative() {
  const [bin, ...args] = task.command;
  run(bin, args);
  if (taskName === 'build') removeWasmPackGitignore();
}

function hasDocker() {
  const probe = spawnSync(
    'docker',
    ['info', '--format', '{{.ServerVersion}}'],
    {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    },
  );
  return probe.error === undefined && probe.status === 0;
}

function runDocker() {
  const [bin, ...args] = task.command;
  console.log(
    `[sparse-solver-wasm] lokale Toolchain fehlt; verwende ${RUST_WASM_IMAGE}.`,
  );
  run('docker', [
    'run',
    '--rm',
    '--mount',
    `type=bind,source=${PACKAGE_ROOT},target=/work`,
    '--workdir',
    '/work',
    RUST_WASM_IMAGE,
    bin,
    ...args,
  ]);
  if (taskName === 'build') removeWasmPackGitignore();
}

if (isCI || forced) {
  runNative();
  process.exit(0);
}

if (hasTool(task.tool)) {
  runNative();
  process.exit(0);
}

if (hasDocker()) {
  runDocker();
  process.exit(0);
}

const missingArtifacts = task.requiredArtifacts.filter(
  (artifact) => !existsSync(join(PACKAGE_ROOT, artifact)),
);

if (missingArtifacts.length > 0) {
  console.error(
    `[sparse-solver-wasm] "${task.tool}" und Docker fehlen, und es liegt kein vorgebautes pkg/ vor ` +
      `(fehlend: ${missingArtifacts.join(', ')}).\n` +
      '    Entweder Rust + wasm-pack installieren, Docker mit rust-wasm:latest bereitstellen ' +
      'oder das pkg/-Verzeichnis von einem Rechner mit Toolchain kopieren.',
  );
  process.exit(1);
}

console.log(
  `[sparse-solver-wasm] "${task.tool}" und Docker nicht gefunden — Task "${taskName}" übersprungen` +
    (task.requiredArtifacts.length > 0
      ? ', vorgebautes pkg/ wird verwendet.'
      : '.'),
);
