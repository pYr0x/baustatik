import { solveLinearSystem } from './linear-solver-port';

// Der kleinste Sichttest fuer die Verdrahtung: ein 2x2-System, von Hand
// nachrechenbar. Die Worker-Verwaltung selbst steht in `linear-solver-port.ts`,
// weil die Kragarm-Demo dieselbe braucht.

const solveButton = requireElement<HTMLButtonElement>('#solve');
const output = requireElement<HTMLPreElement>('#output');

/** Holt ein Element und scheitert laut, wenn es fehlt. */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(id);
  if (element === null) {
    throw new Error(`Das Element #${id.slice(1)} wurde nicht gefunden.`);
  }
  return element;
}

async function solve(button: HTMLButtonElement): Promise<void> {
  // [2 0; 0 3] * d = [4; 9] -> d = [2; 3]
  const stiffness = new Float64Array([2.0, 0.0, 0.0, 3.0]);
  const load = new Float64Array([4.0, 9.0]);

  button.disabled = true;

  try {
    const outcome = await solveLinearSystem(2, stiffness, load);
    if (outcome.kind === 'singular') {
      output.textContent =
        `Das System ist kinematisch — aufgefallen in Zeile ${outcome.index}, ` +
        `kleinstes Pivot ${outcome.pivotRatio}.`;
      return;
    }
    output.textContent = `d = [${outcome.d.join(', ')}]   (erwartet: [2, 3])`;
  } catch (error) {
    output.textContent = `Das Gleichungssystem konnte nicht gelöst werden: ${
      error instanceof Error ? error.message : String(error)
    }`;
  } finally {
    button.disabled = false;
  }
}

solveButton.addEventListener('click', () => void solve(solveButton));