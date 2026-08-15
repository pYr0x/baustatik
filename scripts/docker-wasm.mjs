import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function runDocker(args, label) {
  const result = spawnSync('docker', args, {
    cwd: REPOSITORY_ROOT,
    stdio: 'inherit',
  });
  if (result.error !== undefined) {
    console.error(`[${label}] ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function dockerOutput(args) {
  const result = spawnSync('docker', args, {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  return result.stdout;
}

export function hasDocker() {
  return dockerOutput(['info', '--format', '{{.ServerVersion}}']) !== undefined;
}

export function ensureDockerImage(image, dockerfile, label) {
  if (dockerOutput(['image', 'inspect', image]) !== undefined) return;

  console.log(`[${label}] baue Docker-Image ${image}.`);
  runDocker(
    [
      'build',
      '--file',
      resolve(REPOSITORY_ROOT, dockerfile),
      '--tag',
      image,
      REPOSITORY_ROOT,
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
  console.log(`[${label}] verwende ${image}.`);
  runDocker(
    [
      'run',
      '--rm',
      '--mount',
      `type=bind,source=${packageRoot},target=/work`,
      '--workdir',
      '/work',
      image,
      ...command,
    ],
    label,
  );
}
