#!/usr/bin/env node
// Führt den Rust/wasm-Task nur aus, wenn die Toolchain auf der Maschine vorhanden
// ist. Grund: der Monorepo-Build soll auf Rechnern ohne Rust/wasm-pack laufen,
// solange dort ein vorgebautes `pkg/` liegt (von einem anderen Rechner kopiert).
// In CI wird nie übersprungen — dort ist eine fehlende Toolchain ein Fehler.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TASKS = {
  build: {
    tool: "wasm-pack",
    command: ["wasm-pack", "build", "rust", "--target", "web", "--out-dir", "../pkg"],
    // Ohne diese Dateien wäre ein Skip stillschweigend kaputt.
    requiredArtifacts: ["pkg/linear_solver_wasm.js", "pkg/linear_solver_wasm_bg.wasm"],
  },
  test: {
    tool: "cargo",
    command: ["cargo", "test", "--manifest-path", "rust/Cargo.toml"],
    requiredArtifacts: [],
  },
};

const taskName = process.argv[2];
const task = TASKS[taskName];

if (task === undefined) {
  console.error(`[linear-solver-wasm] Unbekannter Task "${taskName}". Erlaubt: build, test.`);
  process.exit(1);
}

const isCI = process.env.CI !== undefined && process.env.CI !== "" && process.env.CI !== "false";
const forced = process.env.FORCE_WASM_BUILD === "1";

function hasTool(tool) {
  const probe = spawnSync(tool, ["--version"], { stdio: "ignore", shell: true });
  return probe.error === undefined && probe.status === 0;
}

function run() {
  const [bin, ...args] = task.command;
  const result = spawnSync(bin, args, { cwd: PACKAGE_ROOT, stdio: "inherit", shell: true });
  process.exit(result.status ?? 1);
}

if (isCI || forced || hasTool(task.tool)) {
  run();
}

const missingArtifacts = task.requiredArtifacts.filter(
  (artifact) => !existsSync(join(PACKAGE_ROOT, artifact)),
);

if (missingArtifacts.length > 0) {
  console.error(
    `[linear-solver-wasm] "${task.tool}" fehlt und es liegt kein vorgebautes pkg/ vor ` +
      `(fehlend: ${missingArtifacts.join(", ")}).\n` +
      "    Entweder Rust + wasm-pack installieren oder das pkg/-Verzeichnis von einem " +
      "Rechner mit Toolchain kopieren.",
  );
  process.exit(1);
}

console.log(
  `[linear-solver-wasm] "${task.tool}" nicht gefunden — Task "${taskName}" übersprungen` +
    (task.requiredArtifacts.length > 0 ? ", vorgebautes pkg/ wird verwendet." : "."),
);
process.exit(0);
