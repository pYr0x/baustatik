type SolveResponse =
  | { readonly type: "solved"; readonly id: number; readonly d: Float64Array }
  | { readonly type: "failed"; readonly id: number; readonly message: string };

const solveButton = document.querySelector<HTMLButtonElement>("#solve");

if (!solveButton) {
  throw new Error("Der Button zum Lösen wurde nicht gefunden.");
}

let nextRequestId = 0;
let worker: Worker | undefined;
const pendingSolves = new Map<
  number,
  {
    resolve: (d: Float64Array) => void;
    reject: (reason: Error) => void;
  }
>();

function handleWorkerMessage({ data }: MessageEvent<SolveResponse>): void {
  const pending = pendingSolves.get(data.id);
  if (!pending) return;

  pendingSolves.delete(data.id);

  if (data.type === "solved") {
    pending.resolve(data.d);
  } else {
    pending.reject(new Error(data.message));
  }
}

function rejectPendingSolves(reason: Error): void {
  for (const { reject } of pendingSolves.values()) {
    reject(reason);
  }

  pendingSolves.clear();
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./linear-solver.worker.ts", import.meta.url), {
    type: "module",
  });

  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", ({ message }: ErrorEvent) => {
    rejectPendingSolves(
      new Error(message || "Der Solver-Worker konnte nicht gestartet werden."),
    );
  });
  worker.addEventListener("messageerror", () => {
    rejectPendingSolves(new Error("Die Nachricht des Solver-Workers ist ungültig."));
  });

  return worker;
}

function solveInWorker(
  n: number,
  stiffness: Float64Array,
  load: Float64Array,
): Promise<Float64Array> {
  const id = nextRequestId++;
  const solverWorker = getWorker();

  return new Promise((resolve, reject) => {
    pendingSolves.set(id, { resolve, reject });
    // Die Eingaben werden übertragen statt kopiert und sind danach im Hauptthread nicht mehr nutzbar.
    solverWorker.postMessage({ type: "solve", id, n, k: stiffness, f: load }, [
      stiffness.buffer as ArrayBuffer,
      load.buffer as ArrayBuffer,
    ]);
  });
}

async function solve(button: HTMLButtonElement): Promise<void> {
  // [2 0; 0 3] * d = [4; 9] -> d = [2; 3]
  const stiffness = new Float64Array([2.0, 0.0, 0.0, 3.0]);
  const load = new Float64Array([4.0, 9.0]);

  button.disabled = true;

  try {
    const d = await solveInWorker(2, stiffness, load);
    console.log("d =", d); // erwartet: [2, 3]
  } catch (error) {
    console.error("Das Gleichungssystem konnte nicht gelöst werden.", error);
  } finally {
    button.disabled = false;
  }
}

solveButton.addEventListener("click", () => void solve(solveButton));
