import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let cachedDockerMode;

/**
 * Konvertiert einen Windows-Pfad (z. B. "C:\foo\bar") in einen WSL-Pfad ("/mnt/c/foo/bar").
 */
function toPosixOrWslPath(pathStr, useWsl) {
  if (!useWsl) return pathStr;
  return pathStr
    .replace(/^([a-zA-Z]):[/\\]?/, (_, drive) => `/mnt/${drive.toLowerCase()}/`)
    .replaceAll('\\', '/');
}

/**
 * Prüft den Docker-Modus: 'native', 'wsl' oder null.
 */
export function getDockerMode() {
  if (cachedDockerMode !== undefined) return cachedDockerMode;

  // 1. Nativ prüfen
  const nativeProbe = spawnSync(
    'docker',
    ['info', '--format', '{{.ServerVersion}}'],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    },
  );
  if (nativeProbe.error === undefined && nativeProbe.status === 0) {
    cachedDockerMode = 'native';
    return cachedDockerMode;
  }

  // 2. WSL prüfen (nur unter Windows)
  if (process.platform === 'win32') {
    const wslProbe = spawnSync(
      'wsl',
      ['-e', 'docker', 'info', '--format', '{{.ServerVersion}}'],
      {
        cwd: REPOSITORY_ROOT,
        encoding: 'utf8',
      },
    );
    if (wslProbe.error === undefined && wslProbe.status === 0) {
      cachedDockerMode = 'wsl';
      return cachedDockerMode;
    }
  }

  cachedDockerMode = null;
  return cachedDockerMode;
}

export function hasDocker() {
  return getDockerMode() !== null;
}

function getCommandAndArgs(args) {
  const mode = getDockerMode();
  if (mode === 'wsl') {
    return { command: 'wsl', fullArgs: ['-e', 'docker', ...args] };
  }
  return { command: 'docker', fullArgs: args };
}

export function runDocker(args, label) {
  const { command, fullArgs } = getCommandAndArgs(args);
  const result = spawnSync(command, fullArgs, {
    cwd: REPOSITORY_ROOT,
    stdio: 'inherit',
  });
  if (result.error !== undefined) {
    console.error(`[${label}] ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function dockerOutput(args) {
  const { command, fullArgs } = getCommandAndArgs(args);
  const result = spawnSync(command, fullArgs, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  return `${result.stdout}\n${result.stderr}`;
}

export function ensureDockerImage(image, dockerfile, label) {
  if (dockerOutput(['image', 'inspect', image]) !== undefined) return;

  const isWsl = getDockerMode() === 'wsl';
  const dockerfilePath = toPosixOrWslPath(
    resolve(REPOSITORY_ROOT, dockerfile),
    isWsl,
  );
  const contextPath = toPosixOrWslPath(REPOSITORY_ROOT, isWsl);

  console.log(
    `[${label}] baue Docker-Image ${image}${isWsl ? ' (in WSL)' : ''}.`,
  );
  runDocker(
    [
      'build',
      '--file',
      dockerfilePath,
      '--tag',
      image,
      contextPath,
    ],
    label,
  );
}

export function runDockerBuild({
  image,
  dockerfile,
  packageRoot,
  command,
  label,
}) {
  ensureDockerImage(image, dockerfile, label);
  const isWsl = getDockerMode() === 'wsl';
  const mountSource = toPosixOrWslPath(packageRoot, isWsl);

  console.log(`[${label}] verwende ${image}${isWsl ? ' (in WSL)' : ''}.`);
  runDocker(
    [
      'run',
      '--rm',
      '--mount',
      `type=bind,source=${mountSource},target=/work`,
      '--workdir',
      '/work',
      image,
      ...command,
    ],
    label,
  );
}
