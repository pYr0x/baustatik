import { solveLinearSystem } from './linear-solver-port';

// Der kleinste Sichttest fuer die Verdrahtung: ein 2x2-System, von Hand
// nachrechenbar. Die Worker-Verwaltung selbst steht in `linear-solver-port.ts`,
// weil die Kragarm-Demo dieselbe braucht.

const solveButton = document.querySelector<HTMLButtonElement>('#solve');

if (!solveButton) {
  throw new Error('Der Button zum Lösen wurde nicht gefunden.');
}

async function solve(button: HTMLButtonElement): Promise<void> {
  // [2 0; 0 3] * d = [4; 9] -> d = [2; 3]
  const stiffness = new Float64Array([2.0, 0.0, 0.0, 3.0]);
  const load = new Float64Array([4.0, 9.0]);

  button.disabled = true;

  try {
    const d = await solveLinearSystem(2, stiffness, load);
    console.log('d =', d); // erwartet: [2, 3]
  } catch (error) {
    console.error('Das Gleichungssystem konnte nicht gelöst werden.', error);
  } finally {
    button.disabled = false;
  }
}

solveButton.addEventListener('click', () => void solve(solveButton));
