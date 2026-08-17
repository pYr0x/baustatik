#!/usr/bin/env node
// Der Driver ist die einzige Stelle mit Emscripten-Argumenten. Lokal kapselt
// Docker die Toolchain; CI und Releases liefern `emcc` nativ und sind strikt.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dockerOutput,
  ensureDockerImage,
  hasDocker,
  runDockerBuild,
} from '../../../scripts/docker-wasm.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLCHAIN = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, 'toolchain.json'), 'utf8'),
);
const PACKAGE_MANAGER = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const PACKAGE_MANAGER_EXECUTABLE = process.env.npm_execpath;
const PACKAGE_MANAGER_COMMAND =
  PACKAGE_MANAGER_EXECUTABLE === undefined
    ? PACKAGE_MANAGER
    : PACKAGE_MANAGER_EXECUTABLE.endsWith('.exe')
      ? PACKAGE_MANAGER_EXECUTABLE
      : process.execPath;
const REQUIRED_ARTIFACTS = [
  'pkg/triangle.mjs',
  'pkg/triangle.wasm',
  'pkg/index.js',
  'pkg/index.d.ts',
  'pkg/build-fingerprint',
];
const FINGERPRINT_INPUTS = [
  'native/mesh-2d.c',
  'native/mesh-2d.h',
  'toolchain.json',
  'vendor/triangle/triangle.c',
  'vendor/triangle/triangle.h',
];
const EMSCRIPTEN_ARGS = [
  'native/mesh-2d.c',
  'vendor/triangle/triangle.c',
  '-Ivendor/triangle',
  '-O3',
  '-DTRILIBRARY',
  '-DANSI_DECLARATORS',
  '-DNO_TIMER',
  '-DREDUCED',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sFILESYSTEM=0',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sENVIRONMENT=web,worker,node',
  '-sEXPORTED_RUNTIME_METHODS=["HEAPF64","HEAP32","stringToNewUTF8"]',
  '-sEXPORTED_FUNCTIONS=["_malloc","_free","_mesh_2d_generate","_mesh_2d_result_free","_mesh_2d_result_points","_mesh_2d_result_elements","_mesh_2d_result_point_markers","_mesh_2d_result_boundary_segments","_mesh_2d_result_boundary_markers","_mesh_2d_result_point_count","_mesh_2d_result_element_count","_mesh_2d_result_element_width","_mesh_2d_result_boundary_segment_count"]',
  '-o',
  'pkg/triangle.mjs',
];

const isCI =
  process.env.CI !== undefined &&
  process.env.CI !== '' &&
  process.env.CI !== 'false';
const forced = process.env.FORCE_WASM_BUILD === '1';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === PACKAGE_MANAGER,
  });
  if (result.error !== undefined) {
    console.error(`[mesh-2d-wasm] ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function output(command, args) {
  const result = spawnSync(command, args, {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  return `${result.stdout}\n${result.stderr}`;
}

function assertVersion(command, args, name) {
  const version = output(command, args);
  if (version === undefined || !version.includes(TOOLCHAIN.emscriptenVersion)) {
    console.error(
      `[mesh-2d-wasm] ${name} liefert nicht Emscripten ${TOOLCHAIN.emscriptenVersion}.`,
    );
    process.exit(1);
  }
}

function buildNative() {
  assertVersion('emcc', ['--version'], 'Das native emcc');
  run('emcc', EMSCRIPTEN_ARGS);
}

function buildDocker() {
  ensureDockerImage(
    TOOLCHAIN.dockerImage,
    TOOLCHAIN.dockerfile,
    'mesh-2d-wasm',
  );
  const version = dockerOutput([
    'run',
    '--rm',
    TOOLCHAIN.dockerImage,
    'emcc',
    '--version',
  ]);
  if (version === undefined || !version.includes(TOOLCHAIN.emscriptenVersion)) {
    console.error(
      `[mesh-2d-wasm] Das Docker-Image liefert nicht Emscripten ${TOOLCHAIN.emscriptenVersion}.`,
    );
    process.exit(1);
  }
  runDockerBuild({
    image: TOOLCHAIN.dockerImage,
    dockerfile: TOOLCHAIN.dockerfile,
    packageRoot: PACKAGE_ROOT,
    command: ['emcc', ...EMSCRIPTEN_ARGS],
    label: 'mesh-2d-wasm',
  });
}

function fingerprint() {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(EMSCRIPTEN_ARGS));
  hash.update('\0');
  for (const input of FINGERPRINT_INPUTS) {
    hash.update(input);
    hash.update('\0');
    hash.update(readFileSync(join(PACKAGE_ROOT, input)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

mkdirSync(join(PACKAGE_ROOT, 'pkg'), { recursive: true });
const expectedFingerprint = fingerprint();

if (isCI || forced) {
  buildNative();
} else if (output('emcc', ['--version']) !== undefined) {
  buildNative();
} else if (hasDocker()) {
  buildDocker();
} else {
  const missing = REQUIRED_ARTIFACTS.filter(
    (artifact) => !existsSync(join(PACKAGE_ROOT, artifact)),
  );
  if (missing.length > 0) {
    console.error(
      `[mesh-2d-wasm] Docker fehlt und es liegt kein vorgebautes pkg/ vor (fehlend: ${missing.join(', ')}).`,
    );
    process.exit(1);
  }
  const actualFingerprint = readFileSync(
    join(PACKAGE_ROOT, 'pkg/build-fingerprint'),
    'utf8',
  ).trim();
  if (actualFingerprint !== expectedFingerprint) {
    console.error(
      '[mesh-2d-wasm] Docker fehlt und das vorgebaute pkg/ passt nicht zu Quellen und Toolchain.',
    );
    process.exit(1);
  }
  console.log(
    '[mesh-2d-wasm] Docker nicht gefunden; passendes vorgebautes pkg/ wird verwendet.',
  );
}

run(
  PACKAGE_MANAGER_COMMAND,
  PACKAGE_MANAGER_EXECUTABLE === undefined ||
    PACKAGE_MANAGER_EXECUTABLE.endsWith('.exe')
    ? ['exec', 'tsc', '--project', 'tsconfig.json']
    : [PACKAGE_MANAGER_EXECUTABLE, 'exec', 'tsc', '--project', 'tsconfig.json'],
);

writeFileSync(
  join(PACKAGE_ROOT, 'pkg/build-fingerprint'),
  `${expectedFingerprint}\n`,
);
