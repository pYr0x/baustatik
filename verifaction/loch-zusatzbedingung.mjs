/**
 * MESSGERAET, kein Regressionstest. Zweites Geraet neben
 * `nu-koeffizientenform.mjs`, das unberuehrt bleibt.
 *
 * DIE FRAGE: Was aendert ein LOCH am Schubproblem — und was kostet es, die
 * Zusatzbedingung wegzulassen?
 *
 * WORUM ES GEHT. Die Randbedingung `dΦ/ds = −z²/(2·Iy)·dy/ds` legt Φ ENTLANG
 * eines Randes fest, aber nur bis auf eine Konstante. Am Aussenrand ist die
 * gleichgueltig (additiv, aendert keine Spannung, auf null setzen). An jedem
 * Innenrand ist sie relativ dazu eine echte UNBEKANNTE `c_k`, und sie faellt
 * erst aus einer Zusatzbedingung: die Verwoelbung muss beim Umlauf um das Loch
 * wieder auf ihrem Ausgangswert ankommen. Ausgeschrieben ist das
 *
 *   ∮_Γk ∂Φ/∂n ds = 0
 *
 * Herleitung in einer Zeile: die Eindeutigkeit von u verlangt
 * ∮(τ_y dy + τ_z dz) = 0 (bei verschwindender Verdrillung, also Weber), und
 * mit τ_y = ∂Φ/∂z, τ_z = −∂Φ/∂y − z²/(2·Iy) wird daraus
 * −∮ ∂Φ/∂n ds − ∮ z²/(2·Iy) dz, wobei das zweite Integral als exaktes
 * Differential ueber eine geschlossene Kurve verschwindet.
 *
 * WARUM DAS HIER STEHT. Der Beweis `d₁ = 0` (siehe ADR 0045) braucht Φ₁ = 0 auf
 * dem GANZEN Rand. Genau das zerstoert ein Loch: dort ist Φ₁ die Konstante
 * `c_k`, und aus dem Randterm wird `c_k·∮∂Φ₀/∂n ds`. Ob `d₁` damit wirklich
 * auftaucht, ist eine Messfrage.
 *
 * DREI SCHRITTE, NICHT ZWEI — der Kreisring allein genuegt nicht:
 *
 *   0. RECHTECK ohne Loch. Der neue Mehrfachumlauf muss die alte Zahl
 *      reproduzieren: kappa(ν=0) = 5/6 auf Maschinengenauigkeit. Sonst misst
 *      alles Weitere den Umbau statt der Physik.
 *   1. KREISRING. `It` gegen `π(a⁴−b⁴)/2`. Das prueft die INSTALLATION —
 *      vernetzt der Mesher mit Loch, findet der Umlauf beide Schleifen. Es
 *      prueft die Zusatzbedingung NICHT: beim konzentrischen Ring ist
 *      `c₁ = 0` aus Symmetrie (Φ ist bei Qz ungerade in y). Das ist hier eine
 *      VORHERSAGE und wird als solche geprueft.
 *   2. KASTEN mit MITTIGEM Loch (die Figur aus `apps/demo/cross-section/
 *      mesh-2d.ts`). Wieder symmetrisch, also wieder `c₁ = 0` vorhergesagt —
 *      zweite Bestaetigung, andere Figur.
 *   3. KASTEN mit VERSCHOBENEM Loch. Erst hier ist die Symmetrie gebrochen,
 *      erst hier kann `c₁ != 0` sein, und erst hier kann `d₁` auftauchen. Das
 *      ist die eigentliche Messung. Daneben laeuft derselbe Fall mit `c₁ = 0`
 *      erzwungen — die Differenz ist die Zahl, die zaehlt: wieviel kostet es,
 *      das Loch zu ignorieren?
 *   5. MEHRERE Loecher. Bis Schritt 4 ist h = 1, und dann ist das
 *      „h×h-System" eine Division — die KOPPLUNG zwischen Loechern kommt gar
 *      nicht vor. Zwei gespiegelte Loecher liefern eine Symmetrievorhersage,
 *      drei unsymmetrische pruefen den Rest. Siehe dort.
 *
 * WAS DIE UEBLICHEN KONTROLLEN NICHT SEHEN. Die Gleichgewichtsprobe
 * `∫τ_z dA = Qz` sieht `c₁` NICHT: ein additiver Randwert erzeugt ein
 * umlaufendes Feld ohne Resultierende. Wer nur sie prueft, merkt nichts.
 *
 * DIE TORSION IST NICHT BETROFFEN. `It` faellt aus der Verwoelbungsfunktion
 * (∇²ω = 0, Neumann), und ω ist eine physische Verschiebung, also ohnehin
 * eindeutig. Angepasst werden muss dort allein der Randumlauf: die
 * Neumann-Last laeuft ueber ALLE Schleifen.
 *
 * Lauf:  node verifaction/loch-zusatzbedingung.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

register('./extensionless-hook.mjs', import.meta.url);

const MESH_ENTRY = new URL(
  '../packages/mesh-2d-wasm/pkg/index.js',
  import.meta.url,
);
const SPARSE_ENTRY = new URL(
  '../packages/sparse-solver-wasm/pkg/sparse_solver_wasm.js',
  import.meta.url,
);
const SPARSE_WASM = new URL(
  '../packages/sparse-solver-wasm/pkg/sparse_solver_wasm_bg.wasm',
  import.meta.url,
);

// ---------------------------------------------------------------------------
// Numerik-Handwerk
// ---------------------------------------------------------------------------

/** Siebenpunkt-Regel auf dem Dreieck, exakt bis Grad 5. */
const QUADRATURE = (() => {
  const r15 = Math.sqrt(15);
  const a = (6 - r15) / 21;
  const b = (6 + r15) / 21;
  const wa = (155 - r15) / 1200;
  const wb = (155 + r15) / 1200;
  return [
    { L: [1 / 3, 1 / 3, 1 / 3], w: 9 / 40 },
    { L: [1 - 2 * a, a, a], w: wa },
    { L: [a, 1 - 2 * a, a], w: wa },
    { L: [a, a, 1 - 2 * a], w: wa },
    { L: [1 - 2 * b, b, b], w: wb },
    { L: [b, 1 - 2 * b, b], w: wb },
    { L: [b, b, 1 - 2 * b], w: wb },
  ];
})();

/** Ausgleichspolynom ueber die Normalgleichungen mit Gauss-Elimination. */
function polyfit(x, y, degree) {
  const n = degree + 1;
  const matrix = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < x.length; k++) sum += x[k] ** (i + j);
      matrix[i][j] = sum;
    }
    let sum = 0;
    for (let k = 0; k < x.length; k++) sum += y[k] * x[k] ** i;
    matrix[i][n] = sum;
  }
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = matrix[row][col] / matrix[col][col];
      for (let k = col; k <= n; k++) matrix[row][k] -= factor * matrix[col][k];
    }
  }
  return Array.from({ length: n }, (_, i) => matrix[i][n] / matrix[i][i]);
}

function maxResidual(x, y, coefficients) {
  let worst = 0;
  for (let k = 0; k < x.length; k++) {
    let value = 0;
    for (let i = 0; i < coefficients.length; i++) {
      value += coefficients[i] * x[k] ** i;
    }
    worst = Math.max(worst, Math.abs(value - y[k]));
  }
  return worst;
}

const span = (values) => Math.max(...values) - Math.min(...values);

// ---------------------------------------------------------------------------
// Die Figuren
// ---------------------------------------------------------------------------

const rectangleRing = (b, h) =>
  new Float64Array([-b / 2, -h / 2, b / 2, -h / 2, b / 2, h / 2, -b / 2, h / 2]);

/** Kreis als Sehnenzug, um `(0,0)`. */
function discRing(a, segments) {
  const points = new Float64Array(2 * segments);
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    points[2 * i] = a * Math.cos(angle);
    points[2 * i + 1] = a * Math.sin(angle);
  }
  return points;
}

/** Achsenparalleles Rechteck aus Mittelpunkt und Abmessungen. */
const boxRing = (yc, zc, b, h) =>
  new Float64Array([
    yc - b / 2,
    zc - h / 2,
    yc + b / 2,
    zc - h / 2,
    yc + b / 2,
    zc + h / 2,
    yc - b / 2,
    zc + h / 2,
  ]);

// ---------------------------------------------------------------------------
// Netz und Querschnittswerte
// ---------------------------------------------------------------------------

/**
 * Vernetzt eine Figur aus MEHREREN Ringen und bereitet alles vor, was fuer
 * jedes ν gleich bleibt.
 *
 * Der Umlaufsinn der Eingaberinge ist dem Mesher gleichgueltig; `kind` sagt
 * ihm, was Loch ist. Die Orientierung, auf die es ankommt, wird unten am Netz
 * selbst hergestellt.
 */
function prepare(mesher, rings, maxElementArea, holeStartShift = 0) {
  const mesh = mesher.generate({
    rings,
    element: 'tri3',
    maxElementArea,
    switches: { quality: true },
  });

  const nodeCount = mesh.points.length / 2;
  const y = new Float64Array(nodeCount);
  const z = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    y[i] = mesh.points[2 * i];
    z[i] = mesh.points[2 * i + 1];
  }

  const elementCount = mesh.elements.length / 3;

  let A = 0;
  let Sy = 0;
  let Sz = 0;
  for (let e = 0; e < elementCount; e++) {
    const n0 = mesh.elements[3 * e];
    const n1 = mesh.elements[3 * e + 1];
    const n2 = mesh.elements[3 * e + 2];
    const area =
      ((y[n1] - y[n0]) * (z[n2] - z[n0]) - (y[n2] - y[n0]) * (z[n1] - z[n0])) /
      2;
    A += area;
    Sy += (area * (y[n0] + y[n1] + y[n2])) / 3;
    Sz += (area * (z[n0] + z[n1] + z[n2])) / 3;
  }
  const yc = Sy / A;
  const zc = Sz / A;
  for (let i = 0; i < nodeCount; i++) {
    y[i] -= yc;
    z[i] -= zc;
  }

  const area = new Float64Array(elementCount);
  const bCoefficients = new Float64Array(3 * elementCount);
  const cCoefficients = new Float64Array(3 * elementCount);
  let Iy = 0;
  let Iz = 0;
  let Iyz = 0;
  for (let e = 0; e < elementCount; e++) {
    const n = [
      mesh.elements[3 * e],
      mesh.elements[3 * e + 1],
      mesh.elements[3 * e + 2],
    ];
    const [y0, y1, y2] = [y[n[0]], y[n[1]], y[n[2]]];
    const [z0, z1, z2] = [z[n[0]], z[n[1]], z[n[2]]];
    const twoA = (y1 - y0) * (z2 - z0) - (y2 - y0) * (z1 - z0);
    area[e] = twoA / 2;
    bCoefficients[3 * e] = z1 - z2;
    bCoefficients[3 * e + 1] = z2 - z0;
    bCoefficients[3 * e + 2] = z0 - z1;
    cCoefficients[3 * e] = y2 - y1;
    cCoefficients[3 * e + 1] = y0 - y2;
    cCoefficients[3 * e + 2] = y1 - y0;
    const sy = y0 + y1 + y2;
    const sz = z0 + z1 + z2;
    Iy += (area[e] / 12) * (z0 * z0 + z1 * z1 + z2 * z2 + sz * sz);
    Iz += (area[e] / 12) * (y0 * y0 + y1 * y1 + y2 * y2 + sy * sy);
    Iyz += (area[e] / 12) * (y0 * z0 + y1 * z1 + y2 * z2 + sy * sz);
  }

  const boundary = boundaryLoops(mesh, y, z, Iy, holeStartShift);

  return {
    mesh,
    nodeCount,
    elementCount,
    y,
    z,
    area,
    bCoefficients,
    cCoefficients,
    A,
    Iy,
    Iz,
    Iyz,
    centroid: { yc, zc },
    ...boundary,
  };
}

/**
 * ALLE Randschleifen, orientiert, mit ihren Dirichlet-Werten.
 *
 * Zwei Dinge, die der einfach zusammenhaengende Fall nicht kannte:
 *
 * ORIENTIERUNG. Das Torsionsproblem hat eine Neumann-Bedingung, und deren
 * aeussere Normale kennt kein „egal herum". Fuer die Kante a→b liefert
 * `n = (dz, −dy)/L` die Normale, die nach RECHTS zeigt — also nach aussen,
 * wenn das Material links liegt. Damit muss der Aussenrand mathematisch
 * positiv (Flaeche > 0) und jeder Innenrand negativ umlaufen werden; dann
 * zeigt die Normale am Loch IN das Loch hinein, und das ist dort „aus dem
 * Material heraus".
 *
 * BASISWERT. Auf jeder Schleife wird `Φ` aus `−1/(2·Iy)·∫z²dy` aufsummiert,
 * beginnend bei null. Fuer den Aussenrand ist das die Loesung; fuer jeden
 * Innenrand fehlt eine additive Konstante `c_k`, die hier NICHT bestimmt wird
 * — sie ist die Unbekannte, um die es geht.
 *
 * `closure` ist die Selbstpruefung je Schleife: `∮z²dy = 0` nach Green, weil
 * der Integrand kein y enthaelt. Steht dort etwas anderes als Rundung, ist der
 * Umlauf zerrissen.
 */
function boundaryLoops(mesh, y, z, Iy, holeStartShift = 0) {
  const segmentCount = mesh.boundarySegments.length / 2;
  const neighbours = new Map();
  for (let s = 0; s < segmentCount; s++) {
    const a = mesh.boundarySegments[2 * s];
    const b = mesh.boundarySegments[2 * s + 1];
    if (!neighbours.has(a)) neighbours.set(a, []);
    if (!neighbours.has(b)) neighbours.set(b, []);
    neighbours.get(a).push(b);
    neighbours.get(b).push(a);
  }

  const isBoundary = new Uint8Array(y.length);
  for (const node of neighbours.keys()) isBoundary[node] = 1;

  const visited = new Set();
  const loops = [];
  for (const start of neighbours.keys()) {
    if (visited.has(start)) continue;
    const nodes = [start];
    visited.add(start);
    let previous = -1;
    let current = start;
    for (;;) {
      const next = neighbours
        .get(current)
        .find((node) => node !== previous && !visited.has(node));
      if (next === undefined) break;
      nodes.push(next);
      visited.add(next);
      previous = current;
      current = next;
    }
    let twiceArea = 0;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % nodes.length];
      twiceArea += y[a] * z[b] - y[b] * z[a];
    }
    loops.push({ nodes, signedArea: twiceArea / 2 });
  }

  if (visited.size !== neighbours.size) {
    throw new Error('Der Rand liess sich nicht vollstaendig in Schleifen zerlegen.');
  }

  // Die groesste Schleife umschliesst alles — das ist der Aussenrand.
  let outer = 0;
  for (let i = 1; i < loops.length; i++) {
    if (Math.abs(loops[i].signedArea) > Math.abs(loops[outer].signedArea)) {
      outer = i;
    }
  }

  const potential = new Float64Array(y.length);
  for (let index = 0; index < loops.length; index++) {
    const loop = loops[index];
    loop.isOuter = index === outer;
    const wanted = loop.isOuter ? 1 : -1;
    if (Math.sign(loop.signedArea) !== wanted) {
      loop.nodes.reverse();
      loop.signedArea = -loop.signedArea;
    }

    // DER STARTKNOTEN IST WILLKUER. Auf ihm steht `g = 0`, und auf einem
    // Innenrand ist das keine Normierung, sondern eine Eichung: wer die
    // Zusatzbedingung weglaesst, laesst genau diese Willkuer stehen. Mit
    // `holeStartShift` wird sie verschoben, um zu zeigen, dass sie durchschlaegt.
    if (!loop.isOuter && holeStartShift !== 0) {
      const at = ((holeStartShift % loop.nodes.length) + loop.nodes.length) %
        loop.nodes.length;
      loop.nodes = loop.nodes.slice(at).concat(loop.nodes.slice(0, at));
    }

    const nodes = loop.nodes;
    let closure = 0;
    let perimeter = 0;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % nodes.length];
      perimeter += Math.hypot(y[b] - y[a], z[b] - z[a]);
      const increment =
        ((-1 / (2 * Iy)) *
          ((y[b] - y[a]) * (z[a] * z[a] + z[a] * z[b] + z[b] * z[b]))) /
        3;
      if (i + 1 === nodes.length) closure = potential[a] + increment;
      else potential[b] = potential[a] + increment;
    }
    loop.closure = closure;
    loop.perimeter = perimeter;
  }

  return {
    isBoundary,
    boundaryValues: potential,
    loops,
    holeLoops: loops.filter((loop) => !loop.isOuter),
    outerLoop: loops[outer],
  };
}

/**
 * Das bogenlaengengewichtete Mittel von Φ ueber eine Randschleife.
 *
 * WOZU. `c_k` selbst ist keine Messgroesse: es steht relativ zum willkuerlichen
 * Startknoten des Umlaufs (siehe die Eichung weiter unten). Wer eine
 * Symmetrievorhersage pruefen will, braucht eine Groesse ohne diese Willkuer —
 * das Mittel von Φ ueber die Schleife ist eine, denn es haengt nur am Feld.
 * Bezogen auf das Mittel am Aussenrand faellt zusaetzlich die globale Konstante
 * heraus, die das ganze Φ ohnehin offen laesst.
 */
function loopMean(section, loop, phi) {
  const { y, z } = section;
  const nodes = loop.nodes;
  let sum = 0;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    const b = nodes[(i + 1) % nodes.length];
    const length = Math.hypot(y[b] - y[a], z[b] - z[a]);
    sum += (length * (phi[a] + phi[b])) / 2;
  }
  return sum / loop.perimeter;
}

/** Dichtes n×n-System mit Spaltenpivotierung. */
function solveDense(matrix, rhs) {
  const n = rhs.length;
  const work = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(n + 1);
    row.set(matrix[i], 0);
    row[n] = rhs[i];
    return row;
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(work[row][col]) > Math.abs(work[pivot][col])) pivot = row;
    }
    [work[col], work[pivot]] = [work[pivot], work[col]];
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = work[row][col] / work[col][col];
      for (let k = col; k <= n; k++) work[row][k] -= factor * work[col][k];
    }
  }
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = work[i][n] / work[i][i];
  return x;
}

// ---------------------------------------------------------------------------
// Torsion — unveraendert richtig, nur der Randumlauf wird laenger
// ---------------------------------------------------------------------------

function solveTorsion(sparse, section) {
  const { nodeCount, elementCount, y, z, area, bCoefficients, cCoefficients } =
    section;

  const freeIndex = new Int32Array(nodeCount).fill(-1);
  let free = 0;
  for (let i = 1; i < nodeCount; i++) freeIndex[i] = free++;

  const entries = new Map();
  const rhs = new Float64Array(free);

  for (let e = 0; e < elementCount; e++) {
    const nodes = [
      section.mesh.elements[3 * e],
      section.mesh.elements[3 * e + 1],
      section.mesh.elements[3 * e + 2],
    ];
    for (let i = 0; i < 3; i++) {
      const row = freeIndex[nodes[i]];
      if (row < 0) continue;
      for (let j = 0; j < 3; j++) {
        const k =
          (bCoefficients[3 * e + i] * bCoefficients[3 * e + j] +
            cCoefficients[3 * e + i] * cCoefficients[3 * e + j]) /
          (4 * area[e]);
        const column = freeIndex[nodes[j]];
        if (column >= 0 && column <= row) {
          const key = row * nodeCount + column;
          entries.set(key, (entries.get(key) ?? 0) + k);
        }
      }
    }
  }

  // ∮ (z·n_y − y·n_z)·N_i ds ueber ALLE Schleifen.
  let neumannTotal = 0;
  for (const loop of section.loops) {
    const nodes = loop.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      const b = nodes[(i + 1) % nodes.length];
      const dy = y[b] - y[a];
      const dz = z[b] - z[a];
      const length = Math.hypot(dy, dz);
      if (length === 0) continue;
      const ny = dz / length;
      const nz = -dy / length;
      const fa = z[a] * ny - y[a] * nz;
      const fb = z[b] * ny - y[b] * nz;
      neumannTotal += (length * (fa + fb)) / 2;
      if (freeIndex[a] >= 0) rhs[freeIndex[a]] += (length * (2 * fa + fb)) / 6;
      if (freeIndex[b] >= 0) rhs[freeIndex[b]] += (length * (fa + 2 * fb)) / 6;
    }
  }

  const count = entries.size;
  const rows = new Uint32Array(count);
  const columns = new Uint32Array(count);
  const values = new Float64Array(count);
  let at = 0;
  for (const [key, value] of entries) {
    rows[at] = Math.floor(key / nodeCount);
    columns[at] = key % nodeCount;
    values[at] = value;
    at++;
  }

  const outcome = sparse.solve(free, rows, columns, values, 1, rhs);
  if (outcome.unfixed) throw new Error('Torsionsmatrix nicht positiv definit.');

  const omega = new Float64Array(nodeCount);
  for (let i = 1; i < nodeCount; i++) omega[i] = outcome.d[freeIndex[i]];

  const dOmegaDy = new Float64Array(elementCount);
  const dOmegaDz = new Float64Array(elementCount);
  let It = 0;
  for (let e = 0; e < elementCount; e++) {
    const nodes = [
      section.mesh.elements[3 * e],
      section.mesh.elements[3 * e + 1],
      section.mesh.elements[3 * e + 2],
    ];
    const twoA = 2 * area[e];
    let gy = 0;
    let gz = 0;
    for (let i = 0; i < 3; i++) {
      gy += (omega[nodes[i]] * bCoefficients[3 * e + i]) / twoA;
      gz += (omega[nodes[i]] * cCoefficients[3 * e + i]) / twoA;
    }
    dOmegaDy[e] = gy;
    dOmegaDz[e] = gz;
    for (const point of QUADRATURE) {
      const py =
        point.L[0] * y[nodes[0]] +
        point.L[1] * y[nodes[1]] +
        point.L[2] * y[nodes[2]];
      const pz =
        point.L[0] * z[nodes[0]] +
        point.L[1] * z[nodes[1]] +
        point.L[2] * z[nodes[2]];
      It += (py * py + pz * pz + py * gz - pz * gy) * point.w * area[e];
    }
  }

  return { dOmegaDy, dOmegaDz, It, neumannTotal };
}

// ---------------------------------------------------------------------------
// Das Schubproblem mit Loechern
// ---------------------------------------------------------------------------

/**
 * `K` (freie Knoten, unteres Dreieck) und `2 + h` rechte Seiten:
 *
 *   Spalte 0        — die Randwerte `g`, mit Basis null auf jedem Innenrand.
 *   Spalte 1        — der Lastanteil `(1/Iy)·∫y N_i dA`, ohne den Faktor m.
 *   Spalte 2 … 1+h  — je Loch die harmonische Funktion `Φ_k`: eins auf Rand k,
 *                     null auf allen uebrigen Raendern, ohne Last.
 *
 * Alles auf DERSELBEN Zerlegung — das ist die Figur aus ADR 0042 und der
 * Grund, warum ein Loch das Kostenmodell nicht bricht.
 *
 * `loadFull` ist derselbe Lastvektor ueber ALLE Knoten, auch die des Randes.
 * Er wird fuer den Fluss gebraucht: die Randzeilen fallen bei der
 * Dirichlet-Elimination heraus, in der schwachen Form stehen sie aber.
 */
function assemble(section) {
  const { nodeCount, elementCount, y, area, bCoefficients, cCoefficients } =
    section;
  const holeCount = section.holeLoops.length;

  const freeIndex = new Int32Array(nodeCount).fill(-1);
  let free = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (section.isBoundary[i] === 0) freeIndex[i] = free++;
  }

  // Indikatoren der Innenraender, als Dirichlet-Daten der Zusatzfelder.
  const holeIndicator = [];
  for (const loop of section.holeLoops) {
    const indicator = new Float64Array(nodeCount);
    for (const node of loop.nodes) indicator[node] = 1;
    holeIndicator.push(indicator);
  }

  const entries = new Map();
  const rhsDirichlet = new Float64Array(free);
  const rhsLoad = new Float64Array(free);
  const rhsHole = holeIndicator.map(() => new Float64Array(free));
  const loadFull = new Float64Array(nodeCount);

  for (let e = 0; e < elementCount; e++) {
    const nodes = [
      section.mesh.elements[3 * e],
      section.mesh.elements[3 * e + 1],
      section.mesh.elements[3 * e + 2],
    ];
    const Ae = area[e];
    const sumY = y[nodes[0]] + y[nodes[1]] + y[nodes[2]];

    for (let i = 0; i < 3; i++) {
      const load = ((Ae / 12) * (y[nodes[i]] + sumY)) / section.Iy;
      loadFull[nodes[i]] += load;

      const row = freeIndex[nodes[i]];
      if (row < 0) continue;
      rhsLoad[row] += load;

      for (let j = 0; j < 3; j++) {
        const k =
          (bCoefficients[3 * e + i] * bCoefficients[3 * e + j] +
            cCoefficients[3 * e + i] * cCoefficients[3 * e + j]) /
          (4 * Ae);
        const column = freeIndex[nodes[j]];
        if (column < 0) {
          rhsDirichlet[row] -= k * section.boundaryValues[nodes[j]];
          for (let h = 0; h < holeCount; h++) {
            rhsHole[h][row] -= k * holeIndicator[h][nodes[j]];
          }
        } else if (column <= row) {
          const key = row * nodeCount + column;
          entries.set(key, (entries.get(key) ?? 0) + k);
        }
      }
    }
  }

  const count = entries.size;
  const rows = new Uint32Array(count);
  const columns = new Uint32Array(count);
  const values = new Float64Array(count);
  let at = 0;
  for (const [key, value] of entries) {
    rows[at] = Math.floor(key / nodeCount);
    columns[at] = key % nodeCount;
    values[at] = value;
    at++;
  }

  return {
    free,
    freeIndex,
    rows,
    columns,
    values,
    rhsDirichlet,
    rhsLoad,
    rhsHole,
    holeIndicator,
    loadFull,
    holeCount,
  };
}

/** Knotenwerte aus der Loesung der freien Knoten plus vorgegebenen Randwerten. */
function expand(section, system, freeValues, boundary) {
  const phi = new Float64Array(section.nodeCount);
  for (let i = 0; i < section.nodeCount; i++) {
    phi[i] =
      section.isBoundary[i] === 1 ? boundary[i] : freeValues[system.freeIndex[i]];
  }
  return phi;
}

/**
 * `K · φ` ueber ALLE Knoten, elementweise und ohne die Matrix aufzubauen.
 *
 * Gebraucht wird davon nur die Summe ueber die Knoten einer Randschleife —
 * aber die Randzeilen fehlen in `system`, also wird hier frisch multipliziert.
 */
function stiffnessApply(section, phi) {
  const { elementCount, area, bCoefficients, cCoefficients } = section;
  const out = new Float64Array(section.nodeCount);
  for (let e = 0; e < elementCount; e++) {
    const nodes = [
      section.mesh.elements[3 * e],
      section.mesh.elements[3 * e + 1],
      section.mesh.elements[3 * e + 2],
    ];
    for (let i = 0; i < 3; i++) {
      let sum = 0;
      for (let j = 0; j < 3; j++) {
        const k =
          (bCoefficients[3 * e + i] * bCoefficients[3 * e + j] +
            cCoefficients[3 * e + i] * cCoefficients[3 * e + j]) /
          (4 * area[e]);
        sum += k * phi[nodes[j]];
      }
      out[nodes[i]] += sum;
    }
  }
  return out;
}

/**
 * Der Fluss `∮_Γk ∂Φ/∂n ds` je Innenrand, aus der schwachen Form.
 *
 * Mit `w` = eins auf Γk, null auf allen uebrigen Raendern, gilt
 *
 *   ∮ w ∂Φ/∂n ds = ∫∇Φ·∇w dA − m/Iy ∫ w·y dA = (K·Φ)·w − m·loadFull·w
 *
 * Also eine Summe ueber die Knoten der Schleife. KEINE Kanten-Element-
 * Zuordnung, keine Normalenrichtung, kein Vorzeichenrisiko.
 */
function holeFlux(section, system, phi, m) {
  const stiff = stiffnessApply(section, phi);
  return section.holeLoops.map((loop) => {
    let sum = 0;
    for (const node of loop.nodes) sum += stiff[node] - m * system.loadFull[node];
    return sum;
  });
}

/**
 * Die h×h-Matrix der Zusatzbedingungen, `M[k][j] = ∮_Γk ∂Φ_j/∂n ds`.
 *
 * Bei EINEM Loch ist das eine Zahl und das „System" eine Division — die
 * eigentliche Frage stellt sich erst ab zwei Loechern: `Φ_j` legt auf Rand j
 * eine Eins ab und veraendert damit den Fluss durch ALLE anderen Loecher. Die
 * Nebendiagonale ist genau diese Kopplung.
 *
 * M haengt NICHT von m ab (die Zusatzfelder tragen keine Last), wird also
 * einmal je Figur gebaut und fuer alle ν benutzt.
 *
 * M ist die Schur-Ergaenzung von K auf die Innenraender und damit SYMMETRISCH.
 * Das ist eine Selbstpruefung, die kein Orakel von aussen braucht: `M_kj` und
 * `M_jk` entstehen aus verschiedenen Loesungen und verschiedenen Summen.
 */
function capacitance(section, system, fields) {
  const holeCount = system.holeCount;
  const matrix = Array.from({ length: holeCount }, () =>
    new Float64Array(holeCount),
  );
  for (let j = 0; j < holeCount; j++) {
    const column = holeFlux(section, system, fields.phiHole[j], 0);
    for (let k = 0; k < holeCount; k++) matrix[k][j] = column[k];
  }
  return matrix;
}

/**
 * Loest das Schubproblem fuer ein gegebenes m, wahlweise MIT oder OHNE die
 * Zusatzbedingung an den Innenraendern.
 *
 * Die Ueberlagerung `Φ = Φ_g + m·Φ_load + Σ c_k·Φ_k` ist hier keine Vermutung,
 * sondern exakte lineare Algebra: die drei Anteile loesen dasselbe lineare
 * Problem mit verschiedenen Daten. Die Vermutung, die geprueft wird, steht
 * weiter unten und heisst `d₁`.
 *
 * `enforce = false` erzwingt `c_k = 0` — das ist der Fall „Loch ignoriert",
 * und der Fluss, der dann stehen bleibt, ist das Mass fuer den Fehler.
 *
 * `couple = false` benutzt nur die Diagonale von M, behandelt also jedes Loch
 * fuer sich. Das schlaegt niemand ernsthaft vor; es ist die Messung dafuer,
 * wie stark die Loecher einander ueberhaupt sehen.
 */
function solveShear(sparse, section, system, fields, m, options = {}) {
  const { enforce = true, couple = true } = options;
  const holeCount = system.holeCount;
  let c = new Float64Array(holeCount);

  if (enforce && holeCount > 0) {
    // flux_k(base) + Σ_j c_j · M_kj = 0
    const base = new Float64Array(section.nodeCount);
    for (let i = 0; i < section.nodeCount; i++) {
      base[i] = fields.phiG[i] + m * fields.phiLoad[i];
    }
    const right = Float64Array.from(
      holeFlux(section, system, base, m),
      (value) => -value,
    );
    if (couple) {
      c = solveDense(fields.capacitance, right);
    } else {
      for (let k = 0; k < holeCount; k++) {
        c[k] = right[k] / fields.capacitance[k][k];
      }
    }
  }

  const phi = new Float64Array(section.nodeCount);
  for (let i = 0; i < section.nodeCount; i++) {
    let value = fields.phiG[i] + m * fields.phiLoad[i];
    for (let k = 0; k < holeCount; k++) value += c[k] * fields.phiHole[k][i];
    phi[i] = value;
  }

  return { phi, c, flux: holeFlux(section, system, phi, m) };
}

/** Die drei Grundfelder — EINE Zerlegung, `2 + h` rechte Seiten. */
function buildFields(sparse, section, system) {
  const columns = 2 + system.holeCount;
  const all = new Float64Array(system.free * columns);
  all.set(system.rhsDirichlet, 0);
  all.set(system.rhsLoad, system.free);
  for (let h = 0; h < system.holeCount; h++) {
    all.set(system.rhsHole[h], (2 + h) * system.free);
  }

  const outcome = sparse.solve(
    system.free,
    system.rows,
    system.columns,
    system.values,
    columns,
    all,
  );
  if (outcome.unfixed) throw new Error('K ist nicht positiv definit.');

  const zero = new Float64Array(section.nodeCount);
  const phiG = expand(
    section,
    system,
    outcome.d.subarray(0, system.free),
    section.boundaryValues,
  );
  const phiLoad = expand(
    section,
    system,
    outcome.d.subarray(system.free, 2 * system.free),
    zero,
  );
  const phiHole = [];
  for (let h = 0; h < system.holeCount; h++) {
    phiHole.push(
      expand(
        section,
        system,
        outcome.d.subarray((2 + h) * system.free, (3 + h) * system.free),
        system.holeIndicator[h],
      ),
    );
  }
  const fields = { phiG, phiLoad, phiHole };
  fields.capacitance = capacitance(section, system, fields);
  return fields;
}

function evaluate(section, phi, torsion) {
  const { elementCount, y, z, area, bCoefficients, cCoefficients, Iy } = section;
  let Fz = 0;
  let Fy = 0;
  let torque = 0;
  let energy = 0;
  let projection = 0;

  for (let e = 0; e < elementCount; e++) {
    const nodes = [
      section.mesh.elements[3 * e],
      section.mesh.elements[3 * e + 1],
      section.mesh.elements[3 * e + 2],
    ];
    const Ae = area[e];
    const twoA = 2 * Ae;
    let dPhiDy = 0;
    let dPhiDz = 0;
    for (let i = 0; i < 3; i++) {
      dPhiDy += (phi[nodes[i]] * bCoefficients[3 * e + i]) / twoA;
      dPhiDz += (phi[nodes[i]] * cCoefficients[3 * e + i]) / twoA;
    }
    for (const point of QUADRATURE) {
      const py =
        point.L[0] * y[nodes[0]] +
        point.L[1] * y[nodes[1]] +
        point.L[2] * y[nodes[2]];
      const pz =
        point.L[0] * z[nodes[0]] +
        point.L[1] * z[nodes[1]] +
        point.L[2] * z[nodes[2]];
      const tauY = dPhiDz;
      const tauZ = -dPhiDy - (pz * pz) / (2 * Iy);
      const weight = point.w * Ae;
      Fy += tauY * weight;
      Fz += tauZ * weight;
      torque += (py * tauZ - pz * tauY) * weight;
      energy += (tauY * tauY + tauZ * tauZ) * weight;
      if (torsion !== undefined) {
        projection +=
          (tauY * (torsion.dOmegaDy[e] - pz) +
            tauZ * (torsion.dOmegaDz[e] + py)) *
          weight;
      }
    }
  }

  return {
    Fz,
    Fy,
    yM: torque,
    yMTrefftz: torsion === undefined ? undefined : torque - projection,
    kappa: 1 / (section.A * energy),
  };
}

// ---------------------------------------------------------------------------
// Die Messreihe
// ---------------------------------------------------------------------------

const POISSON_VALUES = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];

function measure(sparse, section, label, { enforce = true, couple = true } = {}) {
  const system = assemble(section);
  const fields = buildFields(sparse, section, system);
  const torsion = solveTorsion(sparse, section);

  const m = [];
  const inverseKappa = [];
  const yM = [];
  const yMTrefftz = [];
  const cValues = [];
  const cAll = [];
  const phiBar = [];
  let worstFlux = 0;
  let worstEquilibrium = 0;

  for (const nu of POISSON_VALUES) {
    const factor = nu / (1 + nu);
    const solution = solveShear(sparse, section, system, fields, factor, {
      enforce,
      couple,
    });
    const result = evaluate(section, solution.phi, torsion);
    m.push(factor);
    inverseKappa.push(1 / result.kappa);
    yM.push(result.yM);
    yMTrefftz.push(result.yMTrefftz);
    cValues.push(solution.c[0] ?? 0);
    cAll.push(Array.from(solution.c));
    const outerMean = loopMean(section, section.outerLoop, solution.phi);
    phiBar.push(
      section.holeLoops.map(
        (loop) => loopMean(section, loop, solution.phi) - outerMean,
      ),
    );
    for (const value of solution.flux) {
      worstFlux = Math.max(worstFlux, Math.abs(value));
    }
    worstEquilibrium = Math.max(
      worstEquilibrium,
      Math.abs(result.Fz - 1),
      Math.abs(result.Fy),
    );
  }

  const d = polyfit(m, inverseKappa, 2);
  const yMFit = polyfit(m, yM, 1);
  const radius = Math.sqrt(section.Iy / section.A);

  // Symmetrie und Staerke der Kopplung, beides bezogen auf die Diagonale.
  const M = fields.capacitance;
  let symmetryError = 0;
  let offDiagonal = 0;
  let diagonal = 0;
  for (let k = 0; k < M.length; k++) {
    diagonal = Math.max(diagonal, Math.abs(M[k][k]));
    for (let j = 0; j < M.length; j++) {
      if (j === k) continue;
      symmetryError = Math.max(symmetryError, Math.abs(M[k][j] - M[j][k]));
      offDiagonal = Math.max(offDiagonal, Math.abs(M[k][j]));
    }
  }

  return {
    label,
    section,
    system,
    fields,
    torsion,
    m,
    inverseKappa,
    yM,
    yMTrefftz,
    cValues,
    cAll,
    phiBar,
    capacitance: M,
    symmetryError: diagonal === 0 ? 0 : symmetryError / diagonal,
    offDiagonalRatio: diagonal === 0 ? 0 : offDiagonal / diagonal,
    d,
    yMFit,
    radius,
    worstFlux,
    worstEquilibrium,
    kappaAtZero: 1 / inverseKappa[0],
    residualKappa: maxResidual(m, inverseKappa, d),
    residualYM: maxResidual(m, yM, yMFit),
    spanKappa: span(inverseKappa),
    spanYM: span(yM),
    spanC: span(cValues),
  };
}

function reportFigure(run) {
  const { section } = run;
  console.log(`\n${'-'.repeat(74)}`);
  console.log(run.label);
  console.log('-'.repeat(74));
  console.log(
    `Netz            ${section.elementCount} Elemente, ${section.nodeCount} Knoten, ` +
      `${section.loops.length} Randschleife(n)`,
  );
  console.log(
    `Randschluss     ${section.loops
      .map((loop) => loop.closure.toExponential(2))
      .join('   ')}`,
  );
  console.log(
    `A = ${section.A.toExponential(8)}   Iy = ${section.Iy.toExponential(8)}   ` +
      `Iyz = ${section.Iyz.toExponential(2)}`,
  );
  console.log(
    `Gleichgewicht   max|Fz−1|, |Fy| = ${run.worstEquilibrium.toExponential(2)}`,
  );
  console.log(`Restfluss       max|∮∂Φ/∂n ds| = ${run.worstFlux.toExponential(2)}`);
  console.log(`It              ${run.torsion.It.toExponential(9)}`);
  console.log(
    `kappa(ν=0)      ${run.kappaAtZero.toFixed(12)}   ` +
      `kappa(ν=0,3) ${(1 / (run.d[0] + run.d[1] * (0.3 / 1.3) + run.d[2] * (0.3 / 1.3) ** 2)).toFixed(12)}`,
  );
  console.log(
    `1/kappa         d₀ = ${run.d[0].toExponential(6)}   ` +
      `d₁ = ${run.d[1].toExponential(6)}   d₂ = ${run.d[2].toExponential(6)}`,
  );
  console.log(
    `                Rest gegen die Parabel: ` +
      `${((100 * run.residualKappa) / (run.spanKappa || 1)).toExponential(2)} % der Spannweite`,
  );
  if (section.holeLoops.length > 0) {
    console.log(
      `c₁              ${run.cValues[0].toExponential(6)} … ` +
        `${run.cValues[run.cValues.length - 1].toExponential(6)}   ` +
        `(Spannweite ${run.spanC.toExponential(2)})`,
    );
    const scale = span(Array.from(section.boundaryValues)) || 1;
    console.log(
      `                bezogen auf die Spannweite von g (${scale.toExponential(3)}): ` +
        `${((100 * Math.max(...run.cValues.map(Math.abs))) / scale).toExponential(3)} %`,
    );
    if (section.holeLoops.length > 1) {
      const M = run.capacitance;
      console.log(
        `Kopplungsmatrix ${M.length}×${M.length}, Symmetriefehler ` +
          `${run.symmetryError.toExponential(2)}, ` +
          `max|Nebendiagonale|/max|Diagonale| = ${run.offDiagonalRatio.toExponential(3)}`,
      );
      for (const row of M) {
        console.log(
          `                [ ${Array.from(row)
            .map((value) => value.toExponential(6).padStart(14))
            .join(' ')} ]`,
        );
      }
      console.log(
        `c (ν=0,3)       ${run.cAll[6].map((v) => v.toExponential(4)).join('   ')}`,
      );
      console.log(
        `Φ-Mittel (ν=0,3, gegen den Aussenrand)   ` +
          `${run.phiBar[6].map((v) => v.toExponential(4)).join('   ')}`,
      );
    }
  }
  console.log(
    `yM (Weber)      ${run.yM[0].toExponential(6)} … ${run.yM[run.yM.length - 1].toExponential(6)}`,
  );
  console.log(
    `yM (Trefftz)    ${run.yMTrefftz[0].toExponential(6)} … ${run.yMTrefftz[run.yMTrefftz.length - 1].toExponential(6)}`,
  );
}

async function main() {
  const { createMesher2D } = await import(MESH_ENTRY.href);
  const sparse = await import(SPARSE_ENTRY.href);
  sparse.initSync({ module: readFileSync(SPARSE_WASM) });
  const mesher = await createMesher2D();

  console.log('='.repeat(74));
  console.log('DIE ZUSATZBEDINGUNG AM LOCH — was kostet es, sie wegzulassen?');
  console.log('='.repeat(74));

  // --- Schritt 0: der Umbau darf die alte Zahl nicht bewegen ---------------
  const rectangle = prepare(
    mesher,
    [{ kind: 'material', coordinates: rectangleRing(1, 1.5) }],
    1.5 / 30000,
  );
  const rectangleRun = measure(sparse, rectangle, 'SCHRITT 0 — Rechteck 1 × 1,5 OHNE Loch (Regression)');
  reportFigure(rectangleRun);
  console.log(
    `\n  Orakel: kappa(ν=0) muss 5/6 = 0.833333333333 sein. Abweichung ` +
      `${Math.abs(rectangleRun.kappaAtZero - 5 / 6).toExponential(2)}`,
  );

  // --- Schritt 1: der Kreisring, mit einer VORHERSAGE ----------------------
  const a = 1;
  const b = 0.5;
  const ring = prepare(
    mesher,
    [
      { kind: 'material', coordinates: discRing(a, 720) },
      { kind: 'hole', coordinates: discRing(b, 480) },
    ],
    (Math.PI * (a * a - b * b)) / 30000,
  );
  const ringRun = measure(sparse, ring, 'SCHRITT 1 — Kreisring a = 1, b = 0,5');
  reportFigure(ringRun);
  const itExact = (Math.PI * (a ** 4 - b ** 4)) / 2;
  console.log(
    `\n  Orakel: It = π(a⁴−b⁴)/2 = ${itExact.toExponential(9)}   ` +
      `Abweichung ${(100 * Math.abs(ringRun.torsion.It / itExact - 1)).toFixed(4)} %`,
  );
  console.log(
    `  Vorhersage: c₁ = 0 aus Symmetrie (Φ ungerade in y). ` +
      `Gemessen max|c₁| = ${Math.max(...ringRun.cValues.map(Math.abs)).toExponential(2)}`,
  );

  // --- Schritt 1b: das fehlende Orakel FUER DAS SCHUBPROBLEM ---------------
  // `It` prueft die Torsion, nicht die Schubrechnung. Ein duennwandiges Rohr
  // hat dagegen eine klassische, unabhaengige Antwort: die Schubflaeche ist die
  // halbe Flaeche, also kappa → 1/2 fuer t/a → 0. Trifft die Rechnung MIT
  // Zusatzbedingung diesen Grenzwert, ist nicht nur die Umsetzung geprueft,
  // sondern auch die WAHL der Nebenbedingung (θ' = 0).
  console.log(`\n${'-'.repeat(74)}`);
  console.log('SCHRITT 1b — duennwandiger Grenzfall: kappa(ν=0) muss gegen 1/2 gehen');
  console.log('-'.repeat(74));
  const tubeRuns = [];
  for (const inner of [0.8, 0.9, 0.95]) {
    const tube = prepare(
      mesher,
      [
        { kind: 'material', coordinates: discRing(1, 1440) },
        { kind: 'hole', coordinates: discRing(inner, 1440) },
      ],
      (Math.PI * (1 - inner * inner)) / 40000,
    );
    const run = measure(sparse, tube, `Rohr b/a = ${inner}`);
    tubeRuns.push({ inner, run });
    console.log(
      `  b/a = ${inner.toFixed(2)}   t/a = ${(1 - inner).toFixed(2)}   ` +
        `kappa(ν=0) = ${run.kappaAtZero.toFixed(9)}   ` +
        `Abstand zu 1/2 = ${(run.kappaAtZero - 0.5).toExponential(3)}   ` +
        `d₁/d₀ = ${(run.d[1] / run.d[0]).toExponential(2)}`,
    );
  }

  // --- Schritt 2: der Kasten aus der Demo, mittiges Loch -------------------
  const box = prepare(
    mesher,
    [
      { kind: 'material', coordinates: boxRing(100, 150, 200, 300) },
      { kind: 'hole', coordinates: boxRing(100, 150, 60, 120) },
    ],
    52800 / 30000,
  );
  const boxRun = measure(
    sparse,
    box,
    'SCHRITT 2 — Kasten 200 × 300, Loch 60 × 120 MITTIG (Demo-Figur)',
  );
  reportFigure(boxRun);
  console.log(
    `\n  Flaeche muss 52800 sein: ${box.A.toFixed(6)}`,
  );
  console.log(
    `  Vorhersage: c₁ = 0, wieder aus Symmetrie. ` +
      `Gemessen max|c₁| = ${Math.max(...boxRun.cValues.map(Math.abs)).toExponential(2)}`,
  );

  // --- Schritt 3: Symmetrie gebrochen — die eigentliche Messung ------------
  const skewed = prepare(
    mesher,
    [
      { kind: 'material', coordinates: boxRing(100, 150, 200, 300) },
      { kind: 'hole', coordinates: boxRing(55, 150, 60, 120) },
    ],
    52800 / 30000,
  );
  const skewedRun = measure(
    sparse,
    skewed,
    'SCHRITT 3 — Kasten 200 × 300, Loch 60 × 120 VERSCHOBEN (y = 55)',
  );
  reportFigure(skewedRun);

  const ignoredRun = measure(
    sparse,
    skewed,
    'SCHRITT 3b — dieselbe Figur, Zusatzbedingung WEGGELASSEN (c₁ = 0)',
    { enforce: false },
  );
  reportFigure(ignoredRun);

  console.log(`\n${'='.repeat(74)}`);
  console.log('WAS KOSTET ES, DAS LOCH ZU IGNORIEREN?');
  console.log('='.repeat(74));
  const kappaWith = 1 / skewedRun.inverseKappa[6];
  const kappaWithout = 1 / ignoredRun.inverseKappa[6];
  console.log(`bei ν = 0,3:`);
  console.log(
    `  kappa        mit Bedingung ${kappaWith.toFixed(9)}   ohne ${kappaWithout.toFixed(9)}   ` +
      `Unterschied ${(100 * Math.abs(kappaWithout / kappaWith - 1)).toFixed(4)} %`,
  );
  const yMWith = skewedRun.yMTrefftz[6];
  const yMWithout = ignoredRun.yMTrefftz[6];
  console.log(
    `  yM Trefftz   mit ${yMWith.toExponential(6)}   ohne ${yMWithout.toExponential(6)}   ` +
      `Unterschied ${(100 * Math.abs(yMWith - yMWithout) / skewedRun.radius).toExponential(3)} % von √(Iy/A)`,
  );
  console.log(
    `  Restfluss    mit ${skewedRun.worstFlux.toExponential(2)}   ohne ${ignoredRun.worstFlux.toExponential(2)}`,
  );
  // --- Schritt 4: die Eichung ---------------------------------------------
  // Wer die Zusatzbedingung weglaesst, bekommt keine falsche Zahl, sondern eine
  // BELIEBIGE: `c₁ = 0` heisst „null am Startknoten des Randumlaufs", und der
  // haengt an der Knotennummerierung des Netzes. Dieselbe Figur, derselbe
  // Loeser, ein anderer Startknoten — und κ ist ein anderes.
  const shifted = prepare(
    mesher,
    [
      { kind: 'material', coordinates: boxRing(100, 150, 200, 300) },
      { kind: 'hole', coordinates: boxRing(55, 150, 60, 120) },
    ],
    52800 / 30000,
    137,
  );
  const shiftedEnforced = measure(sparse, shifted, 'x', { enforce: true });
  const shiftedIgnored = measure(sparse, shifted, 'x', { enforce: false });

  console.log(`\nDIE EICHUNG — derselbe Fall, Randumlauf um 137 Knoten versetzt:`);
  console.log(
    `  MIT Bedingung    ${(1 / skewedRun.inverseKappa[6]).toFixed(9)}  →  ` +
      `${(1 / shiftedEnforced.inverseKappa[6]).toFixed(9)}   ` +
      `Unterschied ${(100 * Math.abs(shiftedEnforced.inverseKappa[6] / skewedRun.inverseKappa[6] - 1)).toExponential(2)} %`,
  );
  console.log(
    `  OHNE Bedingung   ${(1 / ignoredRun.inverseKappa[6]).toFixed(9)}  →  ` +
      `${(1 / shiftedIgnored.inverseKappa[6]).toFixed(9)}   ` +
      `Unterschied ${(100 * Math.abs(shiftedIgnored.inverseKappa[6] / ignoredRun.inverseKappa[6] - 1)).toFixed(4)} %`,
  );
  console.log(
    `  yM Trefftz OHNE  ${ignoredRun.yMTrefftz[6].toExponential(9)}  →  ` +
      `${shiftedIgnored.yMTrefftz[6].toExponential(9)}`,
  );

  // --- Schritt 5: MEHRERE Loecher -----------------------------------------
  // Bis hierher war h = 1, und dann ist das „h×h-System" eine Division: die
  // Kopplung, um die es geht, kommt gar nicht vor. Ab zwei Loechern schon —
  // `Φ_j` legt auf Rand j eine Eins ab und veraendert den Fluss durch die
  // anderen Loecher. Was hier geprueft wird:
  //
  //   (a) Ist die Kopplungsmatrix symmetrisch? Selbstpruefung ohne Orakel:
  //       M_kj und M_jk entstehen aus verschiedenen Loesungen.
  //   (b) Verschwindet der Fluss GLEICHZEITIG an allen Innenraendern?
  //   (c) Trifft die gespiegelte Figur ihre Symmetrievorhersage?
  //   (d) Wie stark ist die Kopplung — was kostet es, sie wegzulassen?
  //   (e) Bleiben d₁ = 0, die Trefftz-Immunitaet und die Eichfreiheit stehen?
  //
  // EIN ORAKEL VON AUSSEN GIBT ES HIER NICHT. Fuer den einzelligen Fall war es
  // das duennwandige Rohr; fuer zwei und drei Zellen kennt die Literatur keinen
  // geschlossenen kappa-Wert, an dem man messen koennte. Das ist offen gesagt
  // eine schwaechere Beweislage als oben, und sie wird im Bericht auch so
  // ausgewiesen.
  console.log(`\n${'='.repeat(74)}`);
  console.log('SCHRITT 5 — MEHRERE LOECHER: die Kopplung');
  console.log('='.repeat(74));

  // 5a: zwei Loecher, in y gespiegelt. Damit gibt es eine Vorhersage.
  const twoHole = prepare(
    mesher,
    [
      { kind: 'material', coordinates: boxRing(100, 150, 200, 300) },
      { kind: 'hole', coordinates: boxRing(55, 150, 40, 120) },
      { kind: 'hole', coordinates: boxRing(145, 150, 40, 120) },
    ],
    50400 / 30000,
  );
  const twoHoleRun = measure(
    sparse,
    twoHole,
    'SCHRITT 5a — Kasten 200 × 300, ZWEI Löcher 40 × 120, in y gespiegelt',
  );
  reportFigure(twoHoleRun);
  console.log(`\n  Flaeche muss 50400 sein: ${twoHole.A.toFixed(6)}`);

  // Die Vorhersage. Unter y → −y geht die Figur in sich ueber, die rechte Seite
  // `−m·y/Iy` und der Randwert `g = −1/(2Iy)∫z²dy` wechseln beide das
  // Vorzeichen. Also ist Φ ungerade in y, und die beiden Loecher tauschen die
  // Plaetze: die Φ-Mittel der beiden Innenraender muessen entgegengesetzt
  // gleich sein — gemessen gegen das Mittel am Aussenrand, damit weder der
  // Startknoten noch die globale Konstante hineinspielt.
  const gScale = span(Array.from(twoHole.boundaryValues));
  const mirrorError = Math.max(
    ...twoHoleRun.phiBar.map((pair) => Math.abs(pair[0] + pair[1])),
  );
  console.log(
    `\n  Vorhersage (Φ ungerade in y): Φ̄₁ + Φ̄₂ = 0.` +
      `\n  Gemessen ueber alle ν: max|Φ̄₁ + Φ̄₂| = ${mirrorError.toExponential(3)}, ` +
      `das sind ${((100 * mirrorError) / gScale).toExponential(3)} % der Spannweite von g` +
      `\n  (Φ̄₁ = ${twoHoleRun.phiBar[6][0].toExponential(6)}, ` +
      `Φ̄₂ = ${twoHoleRun.phiBar[6][1].toExponential(6)} bei ν = 0,3)`,
  );

  // 5b: dieselbe Figur, aber jedes Loch fuer sich — nur die Diagonale von M.
  const uncoupledRun = measure(
    sparse,
    twoHole,
    'SCHRITT 5b — dieselbe Figur, KOPPLUNG weggelassen (nur die Diagonale)',
    { couple: false },
  );
  console.log(
    `\n  Kopplung weggelassen: Restfluss ${uncoupledRun.worstFlux.toExponential(2)} ` +
      `statt ${twoHoleRun.worstFlux.toExponential(2)}, ` +
      `kappa(ν=0,3) ${(1 / uncoupledRun.inverseKappa[6]).toFixed(9)} ` +
      `statt ${(1 / twoHoleRun.inverseKappa[6]).toFixed(9)} ` +
      `(${(100 * Math.abs(twoHoleRun.inverseKappa[6] / uncoupledRun.inverseKappa[6] - 1)).toFixed(4)} %)`,
  );

  // 5c: drei Loecher, drei verschiedene Groessen, keine Symmetrie in y. Hier
  // ist nichts vorhersagbar — geprueft werden Symmetrie von M, gleichzeitiger
  // Nullfluss und die drei Aussagen, die aus dem einfachen Fall mitkommen.
  //
  // ALLE DREI LOECHER LIEGEN AUF z = 150, und das ist keine Bequemlichkeit,
  // sondern Pflicht: siehe Schritt 6. Ein Loch daneben macht Φ mehrdeutig, und
  // die Figur waere unbrauchbar.
  const threeHoleRings = [
    { kind: 'material', coordinates: boxRing(100, 150, 200, 300) },
    { kind: 'hole', coordinates: boxRing(40, 150, 30, 160) },
    { kind: 'hole', coordinates: boxRing(95, 150, 40, 80) },
    { kind: 'hole', coordinates: boxRing(160, 150, 50, 40) },
  ];
  const threeHole = prepare(mesher, threeHoleRings, 50000 / 30000);
  const threeHoleRun = measure(
    sparse,
    threeHole,
    'SCHRITT 5c — Kasten 200 × 300, DREI Löcher, ohne jede Symmetrie',
  );
  reportFigure(threeHoleRun);
  console.log(`\n  Flaeche muss 50000 sein: ${threeHole.A.toFixed(6)}`);

  const threeIgnored = measure(
    sparse,
    threeHole,
    'SCHRITT 5d — dieselbe Figur, Zusatzbedingung WEGGELASSEN',
    { enforce: false },
  );
  const threeUncoupled = measure(
    sparse,
    threeHole,
    'SCHRITT 5d — dieselbe Figur, KOPPLUNG weggelassen',
    { couple: false },
  );
  const threeShifted = measure(
    sparse,
    prepare(mesher, threeHoleRings, 50000 / 30000, 137),
    'SCHRITT 5e — dieselbe Figur, Randumlauf versetzt',
  );
  const threeFine = measure(
    sparse,
    prepare(mesher, threeHoleRings, 50000 / 120000),
    'SCHRITT 5f — dieselbe Figur, viermal feiner',
  );

  console.log(`\n  Drei Loecher, bei ν = 0,3:`);
  console.log(
    `    kappa  vollstaendig ${(1 / threeHoleRun.inverseKappa[6]).toFixed(9)}   ` +
      `ohne Kopplung ${(1 / threeUncoupled.inverseKappa[6]).toFixed(9)}   ` +
      `ohne Bedingung ${(1 / threeIgnored.inverseKappa[6]).toFixed(9)}`,
  );
  console.log(
    `    Restfluss    ${threeHoleRun.worstFlux.toExponential(2)}   ` +
      `${threeUncoupled.worstFlux.toExponential(2)}   ` +
      `${threeIgnored.worstFlux.toExponential(2)}`,
  );
  console.log(
    `    yM Trefftz   ${threeHoleRun.yMTrefftz[6].toExponential(9)}   ` +
      `ohne Bedingung ${threeIgnored.yMTrefftz[6].toExponential(9)}`,
  );
  console.log(
    `    yM Weber     ${threeHoleRun.yM[6].toExponential(6)}   ` +
      `ohne Bedingung ${threeIgnored.yM[6].toExponential(6)}`,
  );
  console.log(
    `    Eichung      Randumlauf versetzt: kappa ` +
      `${(1 / threeShifted.inverseKappa[6]).toFixed(9)}   ` +
      `(${(100 * Math.abs(threeShifted.inverseKappa[6] / threeHoleRun.inverseKappa[6] - 1)).toExponential(2)} %)`,
  );
  console.log(
    `    Netzprobe    ${threeHole.elementCount} Elemente → ` +
      `${(1 / threeHoleRun.inverseKappa[6]).toFixed(9)},   ` +
      `${threeFine.section.elementCount} Elemente → ` +
      `${(1 / threeFine.inverseKappa[6]).toFixed(9)}   ` +
      `(${(100 * Math.abs(threeFine.inverseKappa[6] / threeHoleRun.inverseKappa[6] - 1)).toFixed(4)} %)`,
  );

  // --- Schritt 6: die Grenze der Formulierung ------------------------------
  // GEFUNDEN BEIM ERSTEN VERSUCH ZU SCHRITT 5c, mit einer Figur, deren Loecher
  // ueber den Querschnitt verstreut lagen. Dort stand im Randschluss 1e-4 statt
  // 1e-16, und das Gleichgewicht war um 10 % daneben.
  //
  // WARUM. Die Randbedingung `dΦ = −z²/(2·Iy) dy` legt Φ entlang des Randes
  // fest. Damit Φ nach einem vollen Umlauf wieder auf seinem Ausgangswert
  // ankommt, muss `∮_Γk z² dy = 0` sein — und das ist NICHT geschenkt. Green
  // gibt fuer die Form `∮(L dy + M dz) = ∫∫(∂M/∂y − ∂L/∂z) dA`, also
  //
  //     ∮_Γk z² dy = −2·∫∫_{D_k} z dA
  //
  // ueber das von der Schleife EINGESCHLOSSENE Gebiet. Der Sprung je Umlauf ist
  // damit `(1/Iy)·∫∫_{D_k} z dA`, und er verschwindet genau dann, wenn der
  // Schwerpunkt jedes Lochs auf der Biegeachse liegt. Bei Qy steht dort
  // entsprechend `∫∫ y dA`.
  //
  // Das ist keine Eigenheit mehrerer Loecher: EIN Loch neben der Achse genuegt.
  // Alle Loecher der Schritte 1 bis 5 lagen auf z = z_s — beim Kasten aus
  // Schritt 3 wurde das Loch in y verschoben, nicht in z. Deshalb ist es bis
  // hierher nie aufgefallen.
  //
  // Geprueft wird gegen die Handrechnung, nicht gegen sich selbst: die
  // Vorhersage unten steht aus zwei Rechteckdaten, die Messung aus rund 500
  // Segmentintegralen.
  console.log(`\n${'='.repeat(74)}`);
  console.log('SCHRITT 6 — die Grenze: ein Loch NEBEN der Biegeachse');
  console.log('='.repeat(74));
  const offAxis = prepare(
    mesher,
    [
      { kind: 'material', coordinates: boxRing(100, 150, 200, 300) },
      { kind: 'hole', coordinates: boxRing(100, 210, 60, 120) },
    ],
    52800 / 30000,
  );
  const offAxisRun = measure(
    sparse,
    offAxis,
    'SCHRITT 6 — Kasten 200 × 300, Loch 60 × 120 bei z = 210 (neben der Achse)',
  );
  reportFigure(offAxisRun);

  const zCentroid = (60000 * 150 - 7200 * 210) / 52800;
  const predictedOuter = (60000 * (150 - zCentroid)) / offAxis.Iy;
  const predictedHole = (-7200 * (210 - zCentroid)) / offAxis.Iy;
  const gSpanOffAxis = span(Array.from(offAxis.boundaryValues));
  console.log(
    `\n  Schwerpunkt z_s = ${zCentroid.toFixed(6)} (Handrechnung), ` +
      `Iy = ${offAxis.Iy.toExponential(6)}`,
  );
  console.log(
    `  Sprung je Umlauf = (1/Iy)·∫∫z dA ueber das eingeschlossene Gebiet:`,
  );
  console.log(
    `    Aussenrand   vorhergesagt ${predictedOuter.toExponential(6)}   ` +
      `gemessen ${offAxis.outerLoop.closure.toExponential(6)}`,
  );
  console.log(
    `    Loch         vorhergesagt ${predictedHole.toExponential(6)}   ` +
      `gemessen ${offAxis.holeLoops[0].closure.toExponential(6)}`,
  );
  console.log(
    `    Das sind ${((100 * Math.abs(predictedHole)) / gSpanOffAxis).toFixed(2)} % der Spannweite von g — kein Rundungseffekt.`,
  );
  console.log(
    `  Folge: Gleichgewicht max|Fz−1|,|Fy| = ${offAxisRun.worstEquilibrium.toExponential(2)} ` +
      `(sonst ~1e-14). kappa(ν=0,3) = ${(1 / offAxisRun.inverseKappa[6]).toFixed(9)} ist damit ohne Bedeutung.`,
  );
  console.log(
    `  Der Restfluss merkt davon NICHTS (${offAxisRun.worstFlux.toExponential(2)}): die Zusatzbedingung ` +
      `wird erfuellt,\n  nur eben fuer ein falsches Randwertproblem. Der Anzeiger ist hier der Randschluss.`,
  );

  console.log(
    `\nd₁ (der Koeffizient, der ohne Loch beweisbar null ist):`,
  );
  for (const run of [
    rectangleRun,
    ringRun,
    boxRun,
    skewedRun,
    twoHoleRun,
    threeHoleRun,
  ]) {
    console.log(
      `  ${run.label.split('—')[1].trim().padEnd(46)} d₁ = ${run.d[1].toExponential(3)}   ` +
        `d₁/d₀ = ${(run.d[1] / run.d[0]).toExponential(2)}`,
    );
  }
  console.log('='.repeat(74));

  writeReport({
    rectangleRun,
    ringRun,
    tubeRuns,
    boxRun,
    skewedRun,
    ignoredRun,
    shiftedEnforced,
    shiftedIgnored,
    itExact,
    twoHoleRun,
    uncoupledRun,
    mirrorError,
    gScale,
    threeHoleRun,
    threeIgnored,
    threeUncoupled,
    threeShifted,
    threeFine,
    offAxisRun,
    predictedOuter,
    predictedHole,
    gSpanOffAxis,
    zCentroid,
  });
}

// ---------------------------------------------------------------------------
// Der Bericht
// ---------------------------------------------------------------------------

function writeReport(data) {
  const {
    rectangleRun,
    ringRun,
    tubeRuns,
    boxRun,
    skewedRun,
    ignoredRun,
    shiftedEnforced,
    shiftedIgnored,
    itExact,
    twoHoleRun,
    uncoupledRun,
    mirrorError,
    gScale,
    threeHoleRun,
    threeIgnored,
    threeUncoupled,
    threeShifted,
    threeFine,
    offAxisRun,
    predictedOuter,
    predictedHole,
    gSpanOffAxis,
    zCentroid,
  } = data;

  const pct = (value) => `${(100 * value).toFixed(4)} %`;
  const at = 6; // ν = 0,3

  const lines = [];
  lines.push('# Die Zusatzbedingung am Loch');
  lines.push('');
  lines.push('<!-- ERZEUGT von verifaction/loch-zusatzbedingung.mjs.');
  lines.push('     Nicht von Hand bearbeiten — der nächste Lauf überschreibt die Datei. -->');
  lines.push('');
  lines.push(
    '> **Weg 2 ist gegangen worden.** Der Ausblick weiter unten nennt zwei Auswege aus',
  );
  lines.push(
    '> der Lochgrenze; der zweite — die Verwölbungsformulierung — ist seit',
  );
  lines.push(
    '> [ADR 0048](../adr/0048-the-shear-problem-uses-the-warping-formulation.md) der',
  );
  lines.push(
    '> Produktivweg, und die Grenze gibt es nicht mehr. Dieser Bericht misst die',
  );
  lines.push(
    '> **Dirichlet-Fassung** und bleibt als Begründungsspur stehen: er ist der Grund,',
  );
  lines.push(
    '> aus dem gewechselt wurde. Der Ablösebeleg steht in',
  );
  lines.push(
    '> [Verwölbungsformulierung gegen Dirichlet](verwoelbung-gegen-dirichlet.md).',
  );
  lines.push('');
  lines.push(
    'Beleg-Artefakt zu [ADR 0045](../adr/0045-solid-section-values-are-nu-free-coefficients.md),',
  );
  lines.push(
    'Fortsetzung von [ν-Abhängigkeit der Schubwerte](nu-abhaengigkeit-schubwerte.md)',
  );
  lines.push('auf **mehrfach zusammenhängende** Figuren.');
  lines.push('');
  lines.push('## Die Frage');
  lines.push('');
  lines.push(
    'Die Randbedingung `dΦ/ds = −z²/(2·Iy)·dy/ds` legt Φ *entlang* eines Randes',
  );
  lines.push(
    'fest, aber nur bis auf eine Konstante. Am Außenrand ist die gleichgültig. An',
  );
  lines.push(
    'jedem Innenrand ist sie relativ dazu eine echte Unbekannte `c_k` und fällt',
  );
  lines.push('erst aus der Forderung, dass die Verwölbung beim Umlauf um das Loch');
  lines.push('wieder auf ihrem Ausgangswert ankommt:');
  lines.push('');
  lines.push('```text');
  lines.push('∮_Γk ∂Φ/∂n ds = 0');
  lines.push('```');
  lines.push('');
  lines.push(
    'Gerechnet wird als `Φ = Φ_g + m·Φ_load + Σ cₖ·Φₖ` — bei h Löchern `2 + h`',
  );
  lines.push('rechte Seiten auf **einer** Zerlegung, plus ein dichtes h×h-System.');
  lines.push('');
  lines.push(
    '## Zuerst eine Grenze, die beim Nachprüfen aufgefallen ist',
  );
  lines.push('');
  lines.push(
    'Die Randbedingung legt Φ entlang des Randes fest. Damit Φ nach einem vollen',
  );
  lines.push(
    'Umlauf wieder auf seinem Ausgangswert ankommt, muss `∮_Γk z² dy = 0` sein —',
  );
  lines.push('und das ist nicht geschenkt. Green gibt');
  lines.push('');
  lines.push('```text');
  lines.push('∮_Γk z² dy = −2·∫∫_{D_k} z dA        (D_k = das eingeschlossene Gebiet)');
  lines.push('');
  lines.push('Sprung je Umlauf = (1/Iy)·∫∫_{D_k} z dA');
  lines.push('```');
  lines.push('');
  lines.push(
    '**Der Sprung verschwindet genau dann, wenn der Schwerpunkt jedes Lochs auf der',
  );
  lines.push(
    'Biegeachse liegt** — und der Rand des Vollmaterials ebenso. Sonst ist Φ',
  );
  lines.push(
    'mehrdeutig und als Finite-Elemente-Feld gar nicht darstellbar. Bei `Qy` steht',
  );
  lines.push('an derselben Stelle `∫∫ y dA`.');
  lines.push('');
  lines.push(
    'Das ist **keine** Eigenheit mehrerer Löcher: ein einziges Loch neben der Achse',
  );
  lines.push(
    'genügt. Kasten 200 × 300, Loch 60 × 120 bei z = 210 statt 150, Schwerpunkt',
  );
  lines.push(`bei z_s = ${zCentroid.toFixed(4)}:`);
  lines.push('');
  lines.push('| Schleife | Sprung vorhergesagt | gemessen |');
  lines.push('| --- | ---: | ---: |');
  lines.push(
    `| Außenrand | ${predictedOuter.toExponential(6)} | ${offAxisRun.section.outerLoop.closure.toExponential(6)} |`,
  );
  lines.push(
    `| Loch | ${predictedHole.toExponential(6)} | ${offAxisRun.section.holeLoops[0].closure.toExponential(6)} |`,
  );
  lines.push('');
  lines.push(
    `Das sind ${((100 * Math.abs(predictedHole)) / gSpanOffAxis).toFixed(2)} % der Spannweite von g. Die Vorhersage steht aus zwei`,
  );
  lines.push(
    'Rechteckdaten, die Messung aus rund 500 Segmentintegralen — die Diagnose ist',
  );
  lines.push('damit belegt und nicht bloß plausibel. Die Folgen:');
  lines.push('');
  lines.push(
    `- Das Gleichgewicht bricht: \`max|Fz−1|, |Fy|\` = ${offAxisRun.worstEquilibrium.toExponential(2)} statt ~1e-14.`,
  );
  lines.push(
    `- κ = ${(1 / offAxisRun.inverseKappa[at]).toFixed(9)} bei ν = 0,3 ist ohne Bedeutung.`,
  );
  lines.push(
    `- **Der Restfluss merkt nichts** (${offAxisRun.worstFlux.toExponential(1)}): die Zusatzbedingung wird erfüllt, nur`,
  );
  lines.push(
    '  eben für ein falsches Randwertproblem. Der Anzeiger ist hier der Randschluss.',
  );
  lines.push('');
  lines.push(
    'Alle übrigen Figuren dieses Berichts halten die Bedingung ein — beim Kasten aus',
  );
  lines.push(
    'Schritt 3 wurde das Loch in y verschoben, nicht in z. Deshalb ist es bis hierher',
  );
  lines.push(
    'nie aufgefallen. **Für die Umsetzung heißt das: die Dirichlet-Formulierung deckt',
  );
  lines.push(
    'mehrfach zusammenhängende Querschnitte nur teilweise ab.** Sie trägt den',
  );
  lines.push(
    'symmetrischen Hohlkasten und alles, was seine Löcher auf der Biegeachse hat;',
  );
  lines.push(
    'ein außermittiger Hohlraum braucht mehr. Zwei Wege stehen offen, beide',
  );
  lines.push('ungeprüft:');
  lines.push('');
  lines.push(
    '1. **Die partikuläre Lösung ändern.** Der Sprung hängt an der Wahl von `τ^p`',
  );
  lines.push(
    '   nur über dessen Fluss durch die Löcher. Ein zusätzliches harmonisches `∇v`',
  );
  lines.push(
    '   mit vorgegebenem Lochfluss macht Φ wieder eindeutig und lässt die',
  );
  lines.push(
    '   Differentialgleichung unberührt — die dafür nötige Matrix ist dieselbe',
  );
  lines.push('   Kopplungsmatrix wie unten.');
  lines.push(
    '2. **Auf die Verwölbungsformulierung wechseln.** Dort ist die Unbekannte eine',
  );
  lines.push(
    '   Verschiebung und damit ohnehin eindeutig; die Frage stellt sich nicht. Das',
  );
  lines.push('   ist der Weg, den die Torsion in diesem Messgerät schon geht.');
  lines.push('');
  lines.push('## Die Figuren');
  lines.push('');
  lines.push('| Figur | Elemente | Schleifen | Randschluss | Gleichgewicht | Restfluss |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const run of [
    rectangleRun,
    ringRun,
    boxRun,
    skewedRun,
    twoHoleRun,
    threeHoleRun,
    offAxisRun,
  ]) {
    const name = run.label.split('—')[1].trim();
    lines.push(
      `| ${name} | ${run.section.elementCount} | ${run.section.loops.length} | ` +
        `${Math.max(...run.section.loops.map((l) => Math.abs(l.closure))).toExponential(1)} | ` +
        `${run.worstEquilibrium.toExponential(1)} | ${run.worstFlux.toExponential(1)} |`,
    );
  }
  lines.push('');
  lines.push('Zwei Orakel vorweg:');
  lines.push('');
  lines.push(
    `- **Rechteck ohne Loch** — der Mehrfachumlauf darf die alte Zahl nicht bewegen:`,
  );
  lines.push(
    `  κ(ν=0) = \`${rectangleRun.kappaAtZero.toFixed(12)}\`, Abstand zu 5/6 ` +
      `${Math.abs(rectangleRun.kappaAtZero - 5 / 6).toExponential(2)}.`,
  );
  lines.push(
    `- **Kreisring** — \`It\` gegen \`π(a⁴−b⁴)/2\`: gerechnet ` +
      `\`${ringRun.torsion.It.toExponential(9)}\`, exakt \`${itExact.toExponential(9)}\`, ` +
      `Abweichung ${(100 * Math.abs(ringRun.torsion.It / itExact - 1)).toFixed(4)} %.`,
  );
  lines.push('');
  lines.push('Beide prüfen aber nur die **Installation**: der Randschluss prüft den');
  lines.push('Mehrfachumlauf, `It` die Torsion. Für das Schubproblem mit Loch braucht es');
  lines.push('eine eigene, unabhängige Antwort — der dünnwandige Grenzfall hat eine:');
  lines.push('die Schubfläche eines dünnen Rohres ist die halbe Fläche, also `κ → 1/2`.');
  lines.push('');
  lines.push('| b/a | t/a | κ(ν=0) | Abstand zu 1/2 |');
  lines.push('| ---: | ---: | ---: | ---: |');
  for (const { inner, run } of tubeRuns) {
    lines.push(
      `| ${inner.toFixed(2)} | ${(1 - inner).toFixed(2)} | ${run.kappaAtZero.toFixed(9)} | ` +
        `${(run.kappaAtZero - 0.5).toExponential(3)} |`,
    );
  }
  lines.push('');
  lines.push(
    'Der Abstand viertelt sich bei halbierter Wandstärke — das ist die erwartete',
  );
  lines.push(
    'Ordnung `O((t/a)²)`. Damit ist nicht nur die Umsetzung geprüft, sondern auch',
  );
  lines.push(
    'die **Wahl** der Nebenbedingung: der klassische Wert 1/2 gehört zum',
  );
  lines.push('Schubfeld ohne überlagerte Torsion, also zu `θ\' = 0`.');
  lines.push('');
  lines.push('## Was das Loch kostet');
  lines.push('');
  lines.push(
    'Kasten 200 × 300 mit Loch 60 × 120, **außermittig** bei y = 55, damit die',
  );
  lines.push('Symmetrie gebrochen ist. Bei ν = 0,3:');
  lines.push('');
  lines.push('| | mit Zusatzbedingung | ohne (`c₁ = 0`) |');
  lines.push('| --- | ---: | ---: |');
  lines.push(
    `| κ | ${(1 / skewedRun.inverseKappa[at]).toFixed(9)} | ` +
      `${(1 / ignoredRun.inverseKappa[at]).toFixed(9)} |`,
  );
  lines.push(
    `| Restfluss \`∮∂Φ/∂n ds\` | ${skewedRun.worstFlux.toExponential(1)} | ` +
      `${ignoredRun.worstFlux.toExponential(1)} |`,
  );
  lines.push(
    `| yM (Weber) | ${skewedRun.yM[at].toExponential(6)} | ` +
      `${ignoredRun.yM[at].toExponential(6)} |`,
  );
  lines.push(
    `| yM (Trefftz) | ${skewedRun.yMTrefftz[at].toExponential(9)} | ` +
      `${ignoredRun.yMTrefftz[at].toExponential(9)} |`,
  );
  lines.push('');
  // Der Fehler wird an κ ausgewiesen, nicht an 1/κ — sonst steht dort eine
  // andere (und groessere) Zahl fuer denselben Sachverhalt.
  const kappaError = Math.abs(
    skewedRun.inverseKappa[at] / ignoredRun.inverseKappa[at] - 1,
  );
  lines.push(
    `**κ ist um ${pct(kappaError)} zu klein**, wenn die Bedingung fehlt. Das ist kein`,
  );
  lines.push(
    'Feinheitsproblem. Die übliche Gleichgewichtsprobe `∫τ_z dA = Qz` merkt davon',
  );
  lines.push(
    'nichts: ein additiver Randwert erzeugt ein umlaufendes Feld ohne Resultierende.',
  );
  lines.push('');
  lines.push('## Der Trefftz-Schubmittelpunkt merkt es auch nicht — und das ist gut');
  lines.push('');
  lines.push(
    `Weber springt von \`${skewedRun.yM[at].toExponential(4)}\` auf ` +
      `\`${ignoredRun.yM[at].toExponential(4)}\`, also aus der Figur heraus. Trefftz steht in`,
  );
  lines.push('beiden Spalten auf allen ausgewiesenen Stellen gleich. Das ist beweisbar:');
  lines.push('');
  lines.push('```text');
  lines.push('ΔyM_Trefftz = Δtorque − Δprojection = −∫(Φ,z·ω,y − Φ,y·ω,z) dA');
  lines.push('            = −∮ Φ·(ω,y·n_z − ω,z·n_y) ds = Σ_k C_k·∮_Γk ∂ω/∂t ds = 0');
  lines.push('```');
  lines.push('');
  lines.push(
    'weil Φₖ auf jeder Randschleife **konstant** ist und ω als physische',
  );
  lines.push(
    'Verschiebung eindeutig. Der Trefftz-Schubmittelpunkt ist also gegen jede',
  );
  lines.push(
    'additive Randkonstante immun — auch gegen eine falsch bestimmte. Betroffen',
  );
  lines.push('ist allein κ.');
  lines.push('');
  lines.push('## `c₁ = 0` ist keine Näherung, sondern eine Eichung');
  lines.push('');
  lines.push(
    '`c₁ = 0` heißt „null am Startknoten des Randumlaufs" — und der hängt an der',
  );
  lines.push(
    'Knotennummerierung des Netzes. Derselbe Lauf mit einem um 137 Knoten',
  );
  lines.push('versetzten Startpunkt, wieder bei ν = 0,3:');
  lines.push('');
  lines.push('| | Startknoten A | Startknoten B | Unterschied |');
  lines.push('| --- | ---: | ---: | ---: |');
  lines.push(
    `| κ **mit** Bedingung | ${(1 / skewedRun.inverseKappa[at]).toFixed(9)} | ` +
      `${(1 / shiftedEnforced.inverseKappa[at]).toFixed(9)} | ` +
      `${(100 * Math.abs(shiftedEnforced.inverseKappa[at] / skewedRun.inverseKappa[at] - 1)).toExponential(2)} % |`,
  );
  lines.push(
    `| κ **ohne** Bedingung | ${(1 / ignoredRun.inverseKappa[at]).toFixed(9)} | ` +
      `${(1 / shiftedIgnored.inverseKappa[at]).toFixed(9)} | ` +
      `${(100 * Math.abs(shiftedIgnored.inverseKappa[at] / ignoredRun.inverseKappa[at] - 1)).toFixed(4)} % |`,
  );
  lines.push('');
  lines.push(
    'Ohne die Bedingung ist das Ergebnis also nicht falsch-aber-reproduzierbar,',
  );
  lines.push(
    'sondern **von der Knotennummerierung abhängig**. Zwei Netze derselben Figur',
  );
  lines.push('liefern zwei verschiedene κ.');
  lines.push('');
  lines.push('## Mehrere Löcher: die Kopplung');
  lines.push('');
  lines.push(
    'Bei einem Loch ist das „h×h-System" eine Division — die Kopplung, um die es',
  );
  lines.push(
    'geht, kommt gar nicht vor. Ab zwei Löchern schon: `Φ_j` legt auf Rand j eine',
  );
  lines.push(
    'Eins ab und verändert damit den Fluss durch **alle anderen** Löcher. Die',
  );
  lines.push('Matrix der Zusatzbedingungen `M_kj = ∮_Γk ∂Φ_j/∂n ds` ist die');
  lines.push(
    'Schur-Ergänzung von K auf die Innenränder; sie hängt nicht von m ab und wird',
  );
  lines.push('einmal je Figur gebaut.');
  lines.push('');
  lines.push(
    `**Zwei Löcher 40 × 120**, in y gespiegelt (y = 55 und y = 145), ${twoHoleRun.section.elementCount} Elemente:`,
  );
  lines.push('');
  lines.push('```text');
  for (const row of twoHoleRun.capacitance) {
    lines.push(
      `[ ${Array.from(row)
        .map((value) => value.toExponential(6).padStart(14))
        .join(' ')} ]`,
    );
  }
  lines.push('```');
  lines.push('');
  lines.push(
    `Die Nebendiagonale ist ${(100 * twoHoleRun.offDiagonalRatio).toFixed(2)} % der Diagonale — die beiden Löcher sehen`,
  );
  lines.push('einander also deutlich. Drei Proben:');
  lines.push('');
  lines.push(
    `- **M ist symmetrisch** auf ${twoHoleRun.symmetryError.toExponential(1)} genau (bezogen auf die Diagonale).`,
  );
  lines.push(
    '  Das ist eine Selbstprüfung ohne Orakel von außen: `M_kj` und `M_jk` entstehen',
  );
  lines.push('  aus verschiedenen Lösungen und verschiedenen Summen.');
  lines.push(
    `- **Der Fluss verschwindet gleichzeitig an beiden Rändern**: ${twoHoleRun.worstFlux.toExponential(1)}.`,
  );
  lines.push(
    '- **Die Symmetrievorhersage trifft.** Unter y → −y geht die Figur in sich über,',
  );
  lines.push(
    '  während `−m·y/Iy` und `g = −1/(2·Iy)∫z²dy` beide das Vorzeichen wechseln — Φ',
  );
  lines.push(
    '  ist also ungerade in y, und die beiden Löcher tauschen die Plätze. Gemessen',
  );
  lines.push(
    `  am Φ-Mittel jedes Innenrandes (gegen den Außenrand, damit weder Startknoten`,
  );
  lines.push(
    `  noch globale Konstante hineinspielen): \`Φ̄₁ + Φ̄₂\` = ${mirrorError.toExponential(2)}, das sind`,
  );
  lines.push(
    `  ${((100 * mirrorError) / gScale).toExponential(2)} % der Spannweite von g.`,
  );
  lines.push('');
  lines.push('### Was die Kopplung wert ist');
  lines.push('');
  lines.push(
    'Dieselbe Figur, aber nur mit der Diagonale von M gerechnet — jedes Loch für',
  );
  lines.push('sich. Bei ν = 0,3:');
  lines.push('');
  lines.push('| | vollständig | nur Diagonale |');
  lines.push('| --- | ---: | ---: |');
  lines.push(
    `| κ | ${(1 / twoHoleRun.inverseKappa[at]).toFixed(9)} | ${(1 / uncoupledRun.inverseKappa[at]).toFixed(9)} |`,
  );
  lines.push(
    `| Restfluss | ${twoHoleRun.worstFlux.toExponential(1)} | ${uncoupledRun.worstFlux.toExponential(1)} |`,
  );
  lines.push('');
  lines.push(
    `Der Unterschied an κ ist ${(100 * Math.abs(twoHoleRun.inverseKappa[at] / uncoupledRun.inverseKappa[at] - 1)).toFixed(4)} %. Die Kopplung ist also keine`,
  );
  lines.push(
    'Feinheit, und der Restfluss zeigt sie sofort an — dieselbe Anzeige wie beim',
  );
  lines.push('einzelnen Loch.');
  lines.push('');
  lines.push('### Drei Löcher, ohne jede Symmetrie');
  lines.push('');
  lines.push(
    'Kasten 200 × 300 mit Löchern 30 × 160 bei y = 40, 40 × 80 bei y = 95 und',
  );
  lines.push(
    `50 × 40 bei y = 160; ${threeHoleRun.section.elementCount} Elemente, Fläche ${threeHoleRun.section.A.toFixed(3)} (Sollwert 50000).`,
  );
  lines.push(
    'Alle drei liegen auf z = 150 — das ist Pflicht, siehe oben —, in y aber',
  );
  lines.push(
    'unsymmetrisch und verschieden groß. Hier ist nichts vorherzusagen, also wird',
  );
  lines.push('nur geprüft. Bei ν = 0,3:');
  lines.push('');
  lines.push('| | κ | Restfluss |');
  lines.push('| --- | ---: | ---: |');
  lines.push(
    `| vollständig | ${(1 / threeHoleRun.inverseKappa[at]).toFixed(9)} | ${threeHoleRun.worstFlux.toExponential(1)} |`,
  );
  lines.push(
    `| ohne Kopplung | ${(1 / threeUncoupled.inverseKappa[at]).toFixed(9)} | ${threeUncoupled.worstFlux.toExponential(1)} |`,
  );
  lines.push(
    `| ohne Zusatzbedingung | ${(1 / threeIgnored.inverseKappa[at]).toFixed(9)} | ${threeIgnored.worstFlux.toExponential(1)} |`,
  );
  lines.push('');
  lines.push(
    `Die 3×3-Matrix ist auf ${threeHoleRun.symmetryError.toExponential(1)} symmetrisch, ihre stärkste Nebendiagonale`,
  );
  lines.push(
    `beträgt ${(100 * threeHoleRun.offDiagonalRatio).toFixed(2)} % der Diagonale. Alle drei Flüsse verschwinden gleichzeitig.`,
  );
  lines.push('Und die drei Aussagen aus dem einfachen Fall stehen unverändert:');
  lines.push('');
  lines.push(
    `- **Trefftz bleibt immun**: ${threeHoleRun.yMTrefftz[at].toExponential(9)} mit, ${threeIgnored.yMTrefftz[at].toExponential(9)} ohne`,
  );
  lines.push(
    `  Zusatzbedingung — während Weber von ${threeHoleRun.yM[at].toExponential(4)} auf ${threeIgnored.yM[at].toExponential(4)} springt.`,
  );
  lines.push(
    `- **Die Eichung schlägt nicht durch**: Randumlauf um 137 Knoten versetzt, κ ändert`,
  );
  lines.push(
    `  sich um ${(100 * Math.abs(threeShifted.inverseKappa[at] / threeHoleRun.inverseKappa[at] - 1)).toExponential(2)} %.`,
  );
  lines.push(
    `- **Die Zahl ist konvergiert**: bei ${threeFine.section.elementCount} Elementen (viermal feiner) wird κ =`,
  );
  lines.push(
    `  ${(1 / threeFine.inverseKappa[at]).toFixed(9)}, also ${(100 * Math.abs(threeFine.inverseKappa[at] / threeHoleRun.inverseKappa[at] - 1)).toFixed(4)} % Unterschied.`,
  );
  lines.push('');
  lines.push('### Was hier fehlt');
  lines.push('');
  lines.push(
    'Für den einzelligen Fall gab es oben ein **unabhängiges** Orakel, den',
  );
  lines.push(
    'dünnwandigen Grenzwert `κ → 1/2`. Für zwei und drei Zellen gibt es keinen',
  );
  lines.push(
    'entsprechenden geschlossenen κ-Wert, an dem sich messen ließe. Die Beweislage',
  );
  lines.push(
    'ist hier deshalb schwächer als oben: geprüft sind die Symmetrie der Matrix,',
  );
  lines.push(
    'der gleichzeitige Nullfluss, eine Symmetrievorhersage und die Netzkonvergenz —',
  );
  lines.push(
    'alles Eigenschaften der Rechnung. Was ein Orakel von außen bestätigt, ist die',
  );
  lines.push(
    '**Formulierung** (einzelliges Rohr), und die ändert sich mit der Zellenzahl',
  );
  lines.push('nicht; was hinzukommt, ist allein das lineare Gleichungssystem in `c`.');
  lines.push('');
  lines.push('## `d₁` bleibt null — auch mit Loch');
  lines.push('');
  lines.push('| Figur | d₀ | d₁ | d₁/d₀ |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const run of [
    rectangleRun,
    ringRun,
    boxRun,
    skewedRun,
    twoHoleRun,
    threeHoleRun,
  ]) {
    lines.push(
      `| ${run.label.split('—')[1].trim()} | ${run.d[0].toExponential(6)} | ` +
        `${run.d[1].toExponential(2)} | ${(run.d[1] / run.d[0]).toExponential(2)} |`,
    );
  }
  lines.push('');
  lines.push(
    'Der Beweis aus ADR 0045 brauchte `Φ₁ = 0` auf dem *ganzen* Rand. Mit Loch ist',
  );
  lines.push(
    '`Φ₁` auf jedem Innenrand k die Konstante `c_k₁` (der m-Anteil von `c_k`), und',
  );
  lines.push('beide Randterme verschwinden trotzdem:');
  lines.push('');
  lines.push('```text');
  lines.push('∮Φ₁·∂Φ₀/∂n ds       = Σ_k c_k₁·∮_Γk ∂Φ₀/∂n ds = 0   ← die Zusatzbedingung');
  lines.push('                                                       selbst, m⁰-Anteil');
  lines.push('∮z²/(2·Iy)·Φ₁·n_y ds = Σ_k c_k₁/(2·Iy)·∮_Γk z² dz = 0   ← exaktes Differential');
  lines.push('```');
  lines.push('');
  lines.push(
    'Jeder Summand fällt einzeln weg, also hängt nichts an der Zahl der Löcher.',
  );
  lines.push(
    '**`d₁ = 0` gilt also auch mehrfach zusammenhängend**, sobald die',
  );
  lines.push(
    'Zusatzbedingung erfüllt ist. Damit ist die Begründung entfallen, drei Zahlen',
  );
  lines.push('statt zwei zu speichern.');
  lines.push('');
  lines.push(
    'Und `d₁` taugt **nicht** als Anzeiger für eine vergessene Zusatzbedingung:',
  );
  lines.push(
    `bei erzwungenem \`c₁ = 0\` ist \`Φ₁ = Φ_load\`, also wieder null auf dem ganzen`,
  );
  lines.push(
    `Rand — gemessen \`d₁/d₀ = ${(ignoredRun.d[1] / ignoredRun.d[0]).toExponential(2)}\`, obwohl κ um ` +
      `${pct(kappaError)} danebenliegt.`,
  );
  lines.push('Der Anzeiger ist der Restfluss, nicht `d₁`.');
  lines.push('');
  lines.push('### Woran der Beweis hängt');
  lines.push('');
  lines.push(
    'Die erste partielle Integration braucht `∇²Φ₀ = 0`, und das gilt für das Feld',
  );
  lines.push(
    'mit `C = 0`, also **ohne überlagerte Torsion**. Käme κ stattdessen aus dem',
  );
  lines.push(
    'Trefftz-korrigierten Feld, wäre `∇²Φ₀ = C₀ ≠ 0` und es bliebe `−C₀·∫Φ₁ dA`',
  );
  lines.push('stehen — bei unsymmetrischen Figuren ungleich null.');
  lines.push('');
  lines.push(
    '**κ gehört also zum Weber-Feld, `yM`/`zM` zu Trefftz.** Das ist kein',
  );
  lines.push(
    'Widerspruch: κ ist eine Energieäquivalenz im gewöhnlichen Schubproblem (daher',
  );
  lines.push(
    'auch die 5/6 und die 1/2 oben), der Schubmittelpunkt dagegen die Antwort auf',
  );
  lines.push(
    '„wo muss die Last angreifen". Wer κ je auf das Trefftz-Feld umstellt, verliert',
  );
  lines.push('die zweite Zahl und braucht die dritte zurück.');
  lines.push('');
  lines.push('## Zwei Vorhersagen, die die Messung widerlegt hat');
  lines.push('');
  lines.push(
    '**„Beim symmetrischen Ring ist `c₁ = 0`."** Falsch — gemessen ' +
      `\`${ringRun.cValues[0].toExponential(3)}\`. Der Wert von \`c₁\` ist gar keine`,
  );
  lines.push(
    'physikalische Größe: er steht relativ zum willkürlichen Startknoten (siehe',
  );
  lines.push(
    'oben). Was die Symmetrie tötet, ist sein **m-Anteil**: Spannweite über alle ν',
  );
  lines.push(
    `\`${ringRun.spanC.toExponential(1)}\` beim Ring und \`${boxRun.spanC.toExponential(1)}\` beim mittigen Kasten, gegen ` +
      `\`${skewedRun.spanC.toExponential(1)}\``,
  );
  lines.push('beim außermittigen. Nur der m-Anteil geht in `d₁` ein.');
  lines.push('');
  lines.push(
    '**„Mit Loch darf `d₁` auftauchen."** Falsch — es bleibt null, und zwar',
  );
  lines.push('beweisbar, siehe oben.');
  lines.push('');

  const here = dirname(fileURLToPath(import.meta.url));
  const folder = `${here}/../docs/messungen`;
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true });
  const target = `${folder}/loch-zusatzbedingung.md`;
  writeFileSync(target, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\nBericht geschrieben: docs/messungen/loch-zusatzbedingung.md`);
}

await main();
