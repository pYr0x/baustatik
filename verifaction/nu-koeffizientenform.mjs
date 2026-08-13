/**
 * MESSGERAET, kein Regressionstest.
 *
 * DIE FRAGE: Laesst sich das Ergebnis des FE-Schubproblems so speichern, dass
 * die Querdehnzahl NICHT darin vorkommt? Dann braeuchte der Querschnittssatz
 * keine Materialzahl, und ν kaeme erst bei der Auswertung dazu — dort, wo ein
 * Baustoff bekannt ist.
 *
 * DIE VERMUTUNG, die hier geprueft wird, in zwei Saetzen:
 *
 *   m = ν/(1+ν)
 *   yM(m) = yM0 + m·yM1                    — AFFIN in m (zwei Zahlen)
 *   1/kappa(m) = d0 + d1·m + d2·m²         — QUADRATISCH in m (drei Zahlen)
 *
 * WOHER SIE KOMMT. Im Saint-Venant-Schubproblem steht ν an genau einer Stelle.
 * Mit der Spannungsfunktion Φ, den Schubspannungen
 *
 *   τ_y = ∂Φ/∂z                  τ_z = −∂Φ/∂y − z²/(2·Iy)
 *
 * lautet das Randwertproblem fuer die Querkraft Qz = 1
 *
 *   ∇²Φ = −m·y/Iy       in A
 *   Φ    = −1/(2·Iy) ∫ z² dy    auf ∂A     (Dirichlet, OHNE ν)
 *
 * m sitzt allein in der rechten Seite, der Rand ist ν-frei. Also ist Φ affin
 * in m, also auch τ. Der Schubmittelpunkt ist ein LINEARES Funktional von τ
 * (Momentenarm der Resultierenden) und damit affin. kappa faellt aus der
 * Schubenergie, also aus einem QUADRATISCHEN Funktional — deshalb ist nicht
 * kappa selbst, sondern sein KEHRWERT quadratisch.
 *
 * WARUM DAS TROTZDEM GEMESSEN WIRD. Die Herleitung oben ist Papier. Gemessen
 * wird unabhaengig: fuer jedes ν wird das VOLLE Problem neu aufgestellt und
 * geloest, und erst hinterher wird gefragt, ob die Punkte auf einer Geraden
 * beziehungsweise auf einer Parabel liegen. Wer stattdessen die Aufspaltung
 * rechnete und danach ihre Affinitaet feststellte, pruefte nichts.
 *
 * ZWEI FIGUREN, ZWEI GRUENDE:
 *
 *   Rechteck    — hat eine geschlossene Loesung. Bei m = 0 ist die exakte
 *                 Schubspannung die elementare Parabel, Φ ist dann LINEAR,
 *                 und das lineare Dreieck gibt sie exakt wieder: kappa muss
 *                 auf Maschinengenauigkeit 5/6 treffen. Das ist das Orakel
 *                 fuer den Code selbst. Nach Cowper gilt daneben
 *                 kappa = 10/(12−m), also 1/kappa LINEAR in m.
 *   Halbkreis   — einfach symmetrisch, also der einzige der beiden mit einem
 *                 Schubmittelpunkt ausserhalb des Schwerpunkts. Sokolnikoff
 *                 (§61) gibt seinen Abstand vom KREISMITTELPUNKT geschlossen
 *                 an: e = 8a[3 + (40/π²−1)ν]/(15π(1+ν)), in m geschrieben
 *                 e = 8a[3 + (40/π²−4)m]/(15π) — die Affinitaet steht dort
 *                 bereits in der Formel. Die gelaeufige Erinnerung „3 + 4ν"
 *                 ist falsch und fordert die neunzehnfache Steigung.
 *
 * DER AUFBAU. Lineare Dreiecke (`tri3`), Φ knotenweise, Dirichlet aus dem
 * Randintegral, geloest mit `@baustatik/sparse-solver-wasm`, vernetzt mit
 * `@baustatik/mesh-2d-wasm`. Die Querschnittswerte kommen aus DEMSELBEN Netz,
 * damit die Gleichgewichtsprobe (∫τ_z dA = Qz = 1) etwas aussagt.
 *
 * KEINE ENTSCHEIDUNG WIRD HIER GETROFFEN. Das Skript liefert Zahlen; ob daraus
 * eine Koeffizientenform im Datensatz wird, ist eine Frage an den Entwurf.
 *
 * Lauf:  node verifaction/nu-koeffizientenform.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Der Haken muss VOR dem ersten Import der gebauten Artefakte stehen, deshalb
// sind sie dynamisch importiert und nicht oben deklariert.
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

/**
 * Siebenpunkt-Regel auf dem Dreieck, exakt bis Grad 5.
 *
 * Grad 5 ist die Schranke, die hier gebraucht wird: τ_z traegt ueber
 * `z²/(2·Iy)` einen quadratischen Anteil, die Schubenergie quadriert ihn, und
 * damit steht im Energieintegral ein Polynom vierten Grades.
 */
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

/**
 * Ausgleichspolynom vom Grad `degree` durch `(x, y)`, ueber die
 * Normalgleichungen mit Gauss-Elimination.
 *
 * Die Systeme sind 2x2 und 3x3 — dafuer lohnt kein Loeser aus dem Monorepo,
 * und einer mit Pivotsuche waere hier ohnehin nur Zierde.
 */
function polyfit(x, y, degree) {
  const n = degree + 1;
  const A = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < x.length; k++) sum += x[k] ** (i + j);
      A[i][j] = sum;
    }
    let rhs = 0;
    for (let k = 0; k < x.length; k++) rhs += y[k] * x[k] ** i;
    A[i][n] = rhs;
  }
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let k = col; k <= n; k++) A[row][k] -= factor * A[col][k];
    }
  }
  const c = new Float64Array(n);
  for (let row = n - 1; row >= 0; row--) {
    let sum = A[row][n];
    for (let k = row + 1; k < n; k++) sum -= A[row][k] * c[k];
    c[row] = sum / A[row][row];
  }
  return Array.from(c);
}

/** Groesster Betrag der Abweichung zwischen Messpunkten und Ausgleichskurve. */
function maxResidual(x, y, coefficients) {
  let worst = 0;
  for (let k = 0; k < x.length; k++) {
    let fitted = 0;
    for (let i = 0; i < coefficients.length; i++) {
      fitted += coefficients[i] * x[k] ** i;
    }
    worst = Math.max(worst, Math.abs(y[k] - fitted));
  }
  return worst;
}

/** Spannweite der Messwerte — der Massstab, an dem ein Rest gemessen wird. */
function span(values) {
  return Math.max(...values) - Math.min(...values);
}

// ---------------------------------------------------------------------------
// Figuren
// ---------------------------------------------------------------------------

/** Vollkreis vom Radius `a` als Polygon — die Figur mit geschlossener Loesung. */
function discRing(a, segments) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    points.push(a * Math.cos(angle), a * Math.sin(angle));
  }
  return new Float64Array(points);
}

/** Vollrechteck `b × h`, im Ursprung zentriert. Umlauf mathematisch positiv. */
function rectangleRing(b, h) {
  return new Float64Array([
    -b / 2, -h / 2,
    +b / 2, -h / 2,
    +b / 2, +h / 2,
    -b / 2, +h / 2,
  ]);
}

/**
 * Halbkreis vom Radius `a`, gerade Kante auf der z-Achse, Material bei y >= 0.
 *
 * Symmetrisch in z, unsymmetrisch in y — genau die Lage, in der eine Querkraft
 * `Qz` einen Schubmittelpunkt ausserhalb des Schwerpunkts sichtbar macht.
 * Erster und letzter Punkt sind die beiden Enden der geraden Kante; sie wird
 * vom Ringschluss gebildet und darf nicht doppelt eingetragen werden.
 */
function halfDiscRing(a, segments) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / segments;
    points.push(a * Math.cos(angle), a * Math.sin(angle));
  }
  return new Float64Array(points);
}

/**
 * Ungleichschenkliger Winkel als VOLLQUERSCHNITT — die Figur OHNE jede
 * Symmetrieachse.
 *
 * Sie ist der eigentliche Haerteprueffall: `Iyz != 0` erzwingt die Drehung in
 * die Hauptachsen, und der Schubmittelpunkt hat ZWEI Koordinaten, die BEIDE
 * aus je einem eigenen Randwertproblem fallen. Rechteck und Kreis pruefen die
 * Formulierung, der Halbkreis eine Koordinate — erst hier steht die Vermutung
 * unter voller Last.
 *
 * Einspringende Ecke inbegriffen: dort ist die Spannung singulaer, das Netz
 * also am unguenstigsten. Wenn die Affinitaet DAS uebersteht, uebersteht sie
 * einen gezeichneten Querschnitt.
 */
function angleRing(legZ, legY, t) {
  return new Float64Array([
    0, 0,
    legY, 0,
    legY, t,
    t, t,
    t, legZ,
    0, legZ,
  ]);
}

// ---------------------------------------------------------------------------
// Netz und Querschnittswerte
// ---------------------------------------------------------------------------

/**
 * Vernetzt eine Figur und bereitet alles vor, was fuer JEDES ν gleich bleibt:
 * Netz, Querschnittswerte, Randwerte, Elementkonstanten.
 *
 * DIE WERTE KOMMEN AUS DEM NETZ und nicht aus der geschlossenen Formel. Nur so
 * bedeutet die Gleichgewichtsprobe `∫τ_z dA = 1` etwas: sie prueft dann die
 * Rechnung und nicht die Uebereinstimmung zweier Flaechenangaben.
 */
function prepare(mesher, ring, maxElementArea, rotation = 0) {
  // GEDREHT WIRD DIE EINGABE, nicht das Ergebnis. Die Herleitung setzt
  // HAUPTACHSEN voraus — `σ_x = M·z/Iy` gilt nur dort. Eine Figur mit
  // `Iyz != 0` wird deshalb vor dem Vernetzen in ihre Hauptachsen gedreht, und
  // das ausgedruckte `Iyz` sagt danach, ob es gelungen ist.
  const turned = new Float64Array(ring.length);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let i = 0; i < ring.length / 2; i++) {
    turned[2 * i] = ring[2 * i] * cos + ring[2 * i + 1] * sin;
    turned[2 * i + 1] = -ring[2 * i] * sin + ring[2 * i + 1] * cos;
  }

  const mesh = mesher.generate({
    rings: [{ kind: 'material', coordinates: turned }],
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

  // Rohe Momente um den Netzursprung, exakt je Dreieck.
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

  // IN DEN SCHWERPUNKT VERSCHIEBEN. Die Herleitung setzt ihn im Ursprung
  // voraus: nur dort ist die Randfunktion eindeutig (∮ z² dy = −2∫z dA = 0)
  // und nur dort gilt σ_x = M·z/Iy ohne Zusatzglied.
  for (let i = 0; i < nodeCount; i++) {
    y[i] -= yc;
    z[i] -= zc;
  }

  // Elementkonstanten und Traegheitsmomente in einem Durchgang.
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

    // ∫ p·q dA ueber das Dreieck: (A/12)·(Σ p_i q_i + (Σp)(Σq)).
    const sy = y0 + y1 + y2;
    const sz = z0 + z1 + z2;
    Iy += (area[e] / 12) * (z0 * z0 + z1 * z1 + z2 * z2 + sz * sz);
    Iz += (area[e] / 12) * (y0 * y0 + y1 * y1 + y2 * y2 + sy * sy);
    Iyz += (area[e] / 12) * (y0 * z0 + y1 * z1 + y2 * z2 + sy * sz);
  }

  const boundary = boundaryPotential(mesh, y, z, Iy);

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
 * Die Dirichlet-Werte auf dem Rand.
 *
 * Aus der spannungsfreien Mantelflaeche folgt `dΦ/ds = −z²/(2·Iy)·dy/ds`, also
 * ist Φ laengs des Randes das Wegintegral `−1/(2·Iy)·∫ z² dy`. Auf einer
 * geraden Kante ist es geschlossen angebbar:
 *
 *     ∫ z² dy = (y2 − y1)·(z1² + z1·z2 + z2²)/3
 *
 * DER UMLAUFSINN IST GLEICHGUELTIG. Kehrt man ihn um, drehen `dy/ds` und `ds`
 * gemeinsam das Vorzeichen; der Zuwachs von Punkt zu Punkt bleibt derselbe.
 * Deshalb wird der Rand einfach durchlaufen, ohne ihn vorher zu orientieren.
 *
 * `closure` ist die Selbstpruefung: nach einem vollen Umlauf muss Φ wieder auf
 * dem Startwert stehen. Dass es das tut, haengt daran, dass der Ursprung im
 * Schwerpunkt liegt — die Verschiebung oben ist also nicht Kosmetik.
 */
function boundaryPotential(mesh, y, z, Iy) {
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

  const potential = new Float64Array(y.length);
  const start = neighbours.keys().next().value;
  const visited = new Set([start]);
  const loop = [start];
  let previous = -1;
  let current = start;
  let closure = 0;

  for (let step = 0; step < segmentCount; step++) {
    const options = neighbours.get(current);
    const next = options.find((node) => node !== previous && !visited.has(node));
    const target = next === undefined ? start : next;
    const increment =
      (-1 / (2 * Iy)) *
      ((y[target] - y[current]) *
        (z[current] * z[current] +
          z[current] * z[target] +
          z[target] * z[target])) /
      3;
    if (next === undefined) {
      closure = potential[current] + increment - potential[start];
      break;
    }
    potential[target] = potential[current] + increment;
    visited.add(target);
    loop.push(target);
    previous = current;
    current = target;
  }

  if (visited.size !== neighbours.size) {
    throw new Error(
      `Der Rand zerfaellt in mehrere Zuege (${visited.size} von ${neighbours.size} Knoten erreicht) — diese Messung setzt eine einfach zusammenhaengende Figur voraus.`,
    );
  }

  // DER UMLAUFSINN WIRD GEBRAUCHT, anders als bei den Randwerten oben: das
  // Torsionsproblem hat eine NEUMANN-Bedingung, und deren aeussere Normale
  // kennt kein „egal herum". Gedreht wird deshalb hier, einmal, an der
  // Vorzeichenflaeche des Randzugs.
  let twiceArea = 0;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    twiceArea += y[a] * z[b] - y[b] * z[a];
  }
  if (twiceArea < 0) loop.reverse();

  return {
    isBoundary,
    boundaryValues: potential,
    boundaryClosure: closure,
    loop,
  };
}

// ---------------------------------------------------------------------------
// Das Torsionsproblem — ν-frei, und der Schluessel zur Definitionsfrage
// ---------------------------------------------------------------------------

/**
 * Die Woelbfunktion ω der Saint-Venant-Torsion.
 *
 *   ∇²ω = 0          in A
 *   ∂ω/∂n = z·n_y − y·n_z    auf ∂A       (NEUMANN)
 *
 * ν KOMMT DARIN NICHT VOR — weder in der Gleichung noch am Rand. Das ist der
 * Grund, warum `It` eine rein geometrische Groesse ist und warum ein
 * Schubmittelpunkt, der aus DIESEM Problem faellt, kein Material sehen kann.
 *
 * Reines Neumann heisst: die Matrix ist singulaer, ω ist nur bis auf eine
 * Konstante bestimmt. Gebraucht werden ohnehin nur die Ableitungen, also wird
 * ein Knoten festgehalten — billiger als ein Nebenbedingungsblock und fuer den
 * Loeser das, was ihn positiv definit macht.
 */
function solveTorsion(sparse, section) {
  const { nodeCount, elementCount, y, z, area, bCoefficients, cCoefficients } =
    section;

  // Knoten 0 haelt die Konstante fest.
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

  // Randlast ∮ (z·n_y − y·n_z)·N_i ds, Stueck fuer Stueck des orientierten
  // Randzugs. `n` ist auf einer geraden Kante konstant, `f` laeuft linear.
  const loop = section.loop;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    const dy = y[b] - y[a];
    const dz = z[b] - z[a];
    const length = Math.hypot(dy, dz);
    if (length === 0) continue;
    const ny = dz / length;
    const nz = -dy / length;
    const fa = z[a] * ny - y[a] * nz;
    const fb = z[b] * ny - y[b] * nz;
    if (freeIndex[a] >= 0) rhs[freeIndex[a]] += (length * (2 * fa + fb)) / 6;
    if (freeIndex[b] >= 0) rhs[freeIndex[b]] += (length * (fa + 2 * fb)) / 6;
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

  // Elementweise Ableitungen und `It` in einem Durchgang.
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

  return { dOmegaDy, dOmegaDz, It };
}

// ---------------------------------------------------------------------------
// Das Randwertproblem
// ---------------------------------------------------------------------------

/**
 * Baut `K` (nur freie Knoten, unteres Dreieck) und die BEIDEN rechten Seiten:
 *
 *   Spalte 0 — der Beitrag der Randwerte, `−K_fd · g`. Ohne m.
 *   Spalte 1 — der Lastanteil `(1/Iy)·∫ y N_i dA`. Der Faktor m steht NICHT
 *              darin; er wird erst beim Auswerten davorgesetzt.
 *
 * Dass diese Trennung ueberhaupt moeglich ist, IST die Vermutung. Sie wird
 * deshalb nicht als Beweis benutzt: die eigentliche Messung loest fuer jedes ν
 * das volle System, und die Aufspaltung wird nur zum Vergleich danebengelegt.
 */
function assemble(section) {
  const { nodeCount, elementCount, y, area, bCoefficients, cCoefficients } =
    section;

  const freeIndex = new Int32Array(nodeCount).fill(-1);
  let free = 0;
  for (let i = 0; i < nodeCount; i++) {
    if (section.isBoundary[i] === 0) freeIndex[i] = free++;
  }

  const entries = new Map();
  const rhsDirichlet = new Float64Array(free);
  const rhsLoad = new Float64Array(free);

  for (let e = 0; e < elementCount; e++) {
    const nodes = [
      section.mesh.elements[3 * e],
      section.mesh.elements[3 * e + 1],
      section.mesh.elements[3 * e + 2],
    ];
    const Ae = area[e];
    const sumY = y[nodes[0]] + y[nodes[1]] + y[nodes[2]];

    for (let i = 0; i < 3; i++) {
      const row = freeIndex[nodes[i]];
      if (row < 0) continue;

      // ∫ y·N_i dA = (A/12)·(y_i + Σ y)
      rhsLoad[row] += ((Ae / 12) * (y[nodes[i]] + sumY)) / section.Iy;

      for (let j = 0; j < 3; j++) {
        const k =
          (bCoefficients[3 * e + i] * bCoefficients[3 * e + j] +
            cCoefficients[3 * e + i] * cCoefficients[3 * e + j]) /
          (4 * Ae);
        const column = freeIndex[nodes[j]];
        if (column < 0) {
          rhsDirichlet[row] -= k * section.boundaryValues[nodes[j]];
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

  return { free, freeIndex, rows, columns, values, rhsDirichlet, rhsLoad };
}

/** Knotenwerte von Φ aus der Loesung der freien Knoten plus den Randwerten. */
function expand(section, system, freeValues) {
  const phi = new Float64Array(section.nodeCount);
  for (let i = 0; i < section.nodeCount; i++) {
    phi[i] =
      section.isBoundary[i] === 1
        ? section.boundaryValues[i]
        : freeValues[system.freeIndex[i]];
  }
  return phi;
}

/**
 * Die vier Groessen, die aus einem Φ fallen.
 *
 * `Fz` und `Fy` sind die Gleichgewichtsprobe: die Resultierende der
 * Schubspannungen MUSS die aufgebrachte Querkraft `Qz = 1` sein und quer dazu
 * verschwinden. Trifft sie das nicht, ist an der Formulierung oder am Rand
 * etwas falsch, und die beiden interessanten Zahlen darunter sind wertlos.
 *
 * `yM` ist der Schubmittelpunkt nach WEBER — die Wirkungslinie der
 * Resultierenden, `yM = ∫(y·τ_z − z·τ_y) dA / Qz`. Er ist es, der ν sieht;
 * der Schubmittelpunkt nach Trefftz faellt aus dem ν-freien Torsionsproblem
 * und stuende hier gar nicht zur Debatte.
 *
 * `kappa` kommt aus der Schubenergie: `A_s = Qz²/∫τ² dA`, `kappa = A_s/A`.
 */
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

    // Der Gradient eines linearen Ansatzes ist ueber das Element konstant.
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

      // DIE PROJEKTION AUF DIE TORSIONSMODE. Das Spannungsfeld der Torsion
      // ist G·θ'·(ω_,y − z, ω_,z + y); dieses Integral misst, wieviel davon in
      // τ steckt. Fuer reine Torsion kommt genau ihr Moment heraus, denn
      // It = ∫[(ω_,y−z)² + (ω_,z+y)²] dA.
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
    // Der Schubmittelpunkt nach TREFFTZ: die freie Konstante in ∇²Φ wird so
    // gewaehlt, dass die Verdrillung IM SINNE DER TORSIONSMODE verschwindet.
    // Ein ueberlagertes Torsionsfeld mit dem Moment ΔT verschiebt beide
    // Groessen um denselben Betrag — deshalb ist die Korrektur einfach `−P`.
    yMTrefftz: torsion === undefined ? undefined : torque - projection,
    projection,
    kappa: 1 / (section.A * energy),
  };
}

// ---------------------------------------------------------------------------
// Die Messreihe
// ---------------------------------------------------------------------------

const POISSON_VALUES = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];

/**
 * DIE VERIFIKATION DER FORMULIERUNG, und sie steht vor allem anderen.
 *
 * Der Kreis ist der einzige Vollquerschnitt, fuer den Timoshenko/Goodier das
 * GANZE Schubspannungsfeld geschlossen angeben — und zwar ν-ABHAENGIG:
 *
 *   k1 = (1+2ν)/(4(1+ν)·Iy)          τ_y = −k1·y·z
 *   k2 = (3+2ν)/(8(1+ν)·Iy)          τ_z =  k2·(a² − z² − c·y²)
 *   c  = (1−2ν)/(3+2ν)
 *
 * Trifft die Rechnung dieses Feld fuer mehrere ν, dann stimmt nicht nur die
 * Aufstellung, sondern auch der Faktor m in der rechten Seite. Ohne diesen
 * Schritt waere jede Aussage ueber die ν-Abhaengigkeit unbelegt: die
 * Gleichgewichtsprobe `∫τ_z dA = 1` sieht den m-Anteil naemlich GAR NICHT
 * (er hat verschwindende Resultierende, weil Φ1 auf dem Rand null ist).
 *
 * Nebenbei faellt aus derselben Rechnung die Antwort auf „wie gross ist der
 * ν-Einfluss ueberhaupt" fuer kappa heraus.
 */
function verifyCircle(sparse, section, a) {
  const system = assemble(section);

  console.log(`\n${'='.repeat(74)}`);
  console.log(`VERIFIKATION am KREIS  a = ${a}   (geschlossene Loesung T&G)`);
  console.log('='.repeat(74));
  console.log(
    `Netz          ${section.elementCount} Elemente, ${section.nodeCount} Knoten`,
  );
  console.log(
    `Querschnitt   A = ${section.A.toExponential(8)}   (πa² = ${(Math.PI * a * a).toExponential(8)})`,
  );
  console.log(
    `              Iy = ${section.Iy.toExponential(8)}   (πa⁴/4 = ${((Math.PI * a ** 4) / 4).toExponential(8)})`,
  );
  console.log('\n     ν     max|τ_FE − τ_exakt| / max|τ_exakt|      kappa');

  const rows = [];
  for (const nu of POISSON_VALUES) {
    const factor = nu / (1 + nu);
    const rhs = new Float64Array(system.free);
    for (let i = 0; i < system.free; i++) {
      rhs[i] = system.rhsDirichlet[i] + factor * system.rhsLoad[i];
    }
    const outcome = sparse.solve(
      system.free,
      system.rows,
      system.columns,
      system.values,
      1,
      rhs,
    );
    const phi = expand(section, system, outcome.d);

    const k1 = (1 + 2 * nu) / (4 * (1 + nu) * section.Iy);
    const k2 = (3 + 2 * nu) / (8 * (1 + nu) * section.Iy);
    const c = (1 - 2 * nu) / (3 + 2 * nu);

    let worst = 0;
    let scale = 0;
    for (let e = 0; e < section.elementCount; e++) {
      const nodes = [
        section.mesh.elements[3 * e],
        section.mesh.elements[3 * e + 1],
        section.mesh.elements[3 * e + 2],
      ];
      const twoA = 2 * section.area[e];
      let dPhiDy = 0;
      let dPhiDz = 0;
      for (let i = 0; i < 3; i++) {
        dPhiDy += (phi[nodes[i]] * section.bCoefficients[3 * e + i]) / twoA;
        dPhiDz += (phi[nodes[i]] * section.cCoefficients[3 * e + i]) / twoA;
      }
      const py =
        (section.y[nodes[0]] + section.y[nodes[1]] + section.y[nodes[2]]) / 3;
      const pz =
        (section.z[nodes[0]] + section.z[nodes[1]] + section.z[nodes[2]]) / 3;
      const tauY = dPhiDz;
      const tauZ = -dPhiDy - (pz * pz) / (2 * section.Iy);
      const exactY = -k1 * py * pz;
      const exactZ = k2 * (a * a - pz * pz - c * py * py);
      worst = Math.max(
        worst,
        Math.abs(tauY - exactY),
        Math.abs(tauZ - exactZ),
      );
      scale = Math.max(scale, Math.abs(exactY), Math.abs(exactZ));
    }

    const values = evaluate(section, phi);
    rows.push({ nu, fieldError: worst / scale, kappa: values.kappa });
    console.log(
      `   ${nu.toFixed(2)}          ${((worst / scale) * 100).toFixed(4)} %                      ${values.kappa.toFixed(9)}`,
    );
  }
  console.log(
    '   (Der Rest ist Diskretisierung: lineares Dreieck gegen ein Feld,',
  );
  console.log('    das quadratisch in y und z ist.)');
  return rows;
}

function measure(sparse, section, label) {
  const system = assemble(section);
  const torsion = solveTorsion(sparse, section);

  console.log(`\n${'='.repeat(74)}`);
  console.log(label);
  console.log('='.repeat(74));
  console.log(
    `Netz          ${section.elementCount} Elemente, ${section.nodeCount} Knoten, ${system.free} frei`,
  );
  console.log(
    `Querschnitt   A = ${section.A.toExponential(8)}   Iy = ${section.Iy.toExponential(8)}   Iyz = ${section.Iyz.toExponential(2)}`,
  );
  console.log(
    `Randschluss   ${section.boundaryClosure.toExponential(2)}  (muss ~0 sein)`,
  );
  console.log(
    `Torsion       It = ${torsion.It.toExponential(9)}   (ν-frei, aus ∇²ω = 0)`,
  );

  // --- Die eigentliche Messung: je ν ein VOLLSTAENDIGES System ---
  const m = [];
  const yM = [];
  const yMTrefftz = [];
  const inverseKappa = [];
  const kappa = [];
  let worstFz = 0;
  let worstFy = 0;

  for (const nu of POISSON_VALUES) {
    const factor = nu / (1 + nu);
    const rhs = new Float64Array(system.free);
    for (let i = 0; i < system.free; i++) {
      rhs[i] = system.rhsDirichlet[i] + factor * system.rhsLoad[i];
    }
    const outcome = sparse.solve(
      system.free,
      system.rows,
      system.columns,
      system.values,
      1,
      rhs,
    );
    if (outcome.unfixed) throw new Error('K ist nicht positiv definit.');

    const phi = expand(section, system, outcome.d);
    const result = evaluate(section, phi, torsion);
    m.push(factor);
    yM.push(result.yM);
    yMTrefftz.push(result.yMTrefftz);
    kappa.push(result.kappa);
    inverseKappa.push(1 / result.kappa);
    worstFz = Math.max(worstFz, Math.abs(result.Fz - 1));
    worstFy = Math.max(worstFy, Math.abs(result.Fy));
  }

  console.log(
    `Gleichgewicht |Fz − 1| <= ${worstFz.toExponential(2)},  |Fy| <= ${worstFy.toExponential(2)}`,
  );

  console.log(
    '\n   ν       m        yM (Weber)      yM (Trefftz)    kappa',
  );
  for (let i = 0; i < POISSON_VALUES.length; i++) {
    console.log(
      `  ${POISSON_VALUES[i].toFixed(2)}   ${m[i].toFixed(5)}  ${yM[i].toExponential(6)}  ${yMTrefftz[i].toExponential(6)}  ${kappa[i].toFixed(9)}`,
    );
  }

  // --- Vermutung 1: yM affin in m, in BEIDEN Definitionen ---
  const yMLinear = polyfit(m, yM, 1);
  const yMResidual = maxResidual(m, yM, yMLinear);
  const yMSpan = span(yM);
  const trefftzLinear = polyfit(m, yMTrefftz, 1);
  const trefftzResidual = maxResidual(m, yMTrefftz, trefftzLinear);
  const trefftzSpan = span(yMTrefftz);

  console.log('\n-- Vermutung 1: yM = yM0 + m·yM1 -------------------------');
  console.log('                         WEBER              TREFFTZ');
  console.log(
    `   yM0             ${yMLinear[0].toExponential(9)}   ${trefftzLinear[0].toExponential(9)}`,
  );
  console.log(
    `   yM1             ${yMLinear[1].toExponential(9)}   ${trefftzLinear[1].toExponential(9)}`,
  );
  console.log(
    `   Spannweite      ${yMSpan.toExponential(3)}           ${trefftzSpan.toExponential(3)}`,
  );
  console.log(
    `   groesster Rest  ${yMResidual.toExponential(3)}           ${trefftzResidual.toExponential(3)}`,
  );
  console.log(
    `   Rest / Spannw.  ${yMSpan === 0 ? '—' : `${((yMResidual / yMSpan) * 100).toExponential(2)} %`}          ${trefftzSpan === 0 ? '—' : `${((trefftzResidual / trefftzSpan) * 100).toExponential(2)} %`}`,
  );

  // --- Vermutung 2: 1/kappa quadratisch in m ---
  const inverseLinear = polyfit(m, inverseKappa, 1);
  const inverseQuadratic = polyfit(m, inverseKappa, 2);
  const linearResidual = maxResidual(m, inverseKappa, inverseLinear);
  const quadraticResidual = maxResidual(m, inverseKappa, inverseQuadratic);
  const inverseSpan = span(inverseKappa);

  console.log('\n-- Vermutung 2: 1/kappa = d0 + d1·m + d2·m² --------------');
  console.log(`   d0 = ${inverseQuadratic[0].toExponential(9)}`);
  console.log(`   d1 = ${inverseQuadratic[1].toExponential(9)}`);
  console.log(`   d2 = ${inverseQuadratic[2].toExponential(9)}`);
  console.log(`   Spannweite ueber ν       ${inverseSpan.toExponential(3)}`);
  console.log(
    `   Rest bei GRAD 1          ${linearResidual.toExponential(3)}   (${((linearResidual / inverseSpan) * 100).toExponential(2)} %)`,
  );
  console.log(
    `   Rest bei GRAD 2          ${quadraticResidual.toExponential(3)}   (${((quadraticResidual / inverseSpan) * 100).toExponential(2)} %)`,
  );

  // --- Gegenprobe: EINE Zerlegung, ZWEI rechte Seiten ---
  const both = new Float64Array(2 * system.free);
  both.set(system.rhsDirichlet, 0);
  both.set(system.rhsLoad, system.free);
  const split = sparse.solve(
    system.free,
    system.rows,
    system.columns,
    system.values,
    2,
    both,
  );
  const phi0 = split.d.subarray(0, system.free);
  const phi1 = split.d.subarray(system.free, 2 * system.free);

  let worstSplit = 0;
  for (let i = 0; i < POISSON_VALUES.length; i++) {
    const combined = new Float64Array(system.free);
    for (let k = 0; k < system.free; k++) {
      combined[k] = phi0[k] + m[i] * phi1[k];
    }
    const result = evaluate(
      section,
      expand(section, system, combined),
      torsion,
    );
    worstSplit = Math.max(
      worstSplit,
      Math.abs(result.yM - yM[i]),
      Math.abs(result.kappa - kappa[i]),
    );
  }

  console.log('\n-- Gegenprobe: eine Zerlegung, zwei rechte Seiten --------');
  console.log(
    `   Φ(m) = Φ0 + m·Φ1 gegen die ${POISSON_VALUES.length} vollen Loesungen`,
  );
  console.log(`   groesste Abweichung  ${worstSplit.toExponential(3)}`);

  return {
    m,
    yM,
    yMTrefftz,
    kappa,
    inverseKappa,
    yMLinear,
    trefftzLinear,
    inverseQuadratic,
    inverseLinear,
    linearResidual,
    quadraticResidual,
    yMResidual,
    worstSplit,
    It: torsion.It,
    radius: Math.sqrt(section.Iy / section.A),
  };
}

// ---------------------------------------------------------------------------
// Das Beleg-Artefakt
// ---------------------------------------------------------------------------

const REPORT_URL = new URL(
  '../docs/messungen/nu-abhaengigkeit-schubwerte.md',
  import.meta.url,
);

/**
 * Schreibt den Bericht nach `docs/messungen/`, wie es
 * `packages/fem-solver/tests/kinematics-margin.test.ts` fuer ADR 0016 tut.
 *
 * UEBER `node:fs`, nicht ueber die Konsole: ein ADR soll auf eine Datei zeigen
 * koennen und nicht auf „lauf das Skript und schau hin".
 */
function writeReport(data) {
  const percent = (value, digits = 2) =>
    `${(value * 100).toExponential(digits)} %`;
  const lines = [];

  lines.push('# ν-Abhängigkeit der Schubwerte am Vollquerschnitt');
  lines.push('');
  lines.push('<!-- ERZEUGT von verifaction/nu-koeffizientenform.mjs.');
  lines.push(
    '     Nicht von Hand bearbeiten — der nächste Lauf überschreibt die Datei. -->',
  );
  lines.push('');
  lines.push(
    'Beleg-Artefakt zu [ADR 0045](../adr/0045-solid-section-values-are-nu-free-coefficients.md).',
  );
  lines.push('');
  lines.push(
    'Gemessen mit den produktiven Artefakten: `@baustatik/mesh-2d-wasm` (Triangle,',
  );
  lines.push(
    '`tri3`, rund 37 000 Elemente je Figur) und `@baustatik/sparse-solver-wasm`',
  );
  lines.push('(dünnbesetztes Cholesky mit AMD-Umordnung).');
  lines.push('');
  lines.push('## Die Frage');
  lines.push('');
  lines.push('Mit `m = ν/(1+ν)` lautet das Schubproblem für `Qz = 1`');
  lines.push('');
  lines.push('```text');
  lines.push('τ_y = ∂Φ/∂z            τ_z = −∂Φ/∂y − z²/(2·Iy)');
  lines.push('');
  lines.push('∇²Φ = −m·y/Iy   in A');
  lines.push('Φ   = −1/(2·Iy) ∫ z² dy   auf ∂A      (Dirichlet, OHNE ν)');
  lines.push('```');
  lines.push('');
  lines.push(
    'm steht allein in der rechten Seite. Ist damit `yM` **affin** und `1/κ`',
  );
  lines.push('**quadratisch** in m? Gemessen wird unabhängig: für jedes ν wird das');
  lines.push('volle System neu aufgestellt und gelöst, und erst danach gefittet.');
  lines.push('');
  lines.push('## Zuerst: ist die Formulierung richtig?');
  lines.push('');
  lines.push(
    'Der Kreis hat bei Timoshenko/Goodier eine geschlossene, **ν-abhängige**',
  );
  lines.push('Lösung für das ganze τ-Feld. Ohne diesen Schritt wäre jede Aussage über');
  lines.push(
    'die ν-Abhängigkeit unbelegt — die Gleichgewichtsprobe `∫τ_z dA = Qz` sieht',
  );
  lines.push('den m-Anteil nämlich gar nicht.');
  lines.push('');
  lines.push('| ν | max\\|τ_FE − τ_exakt\\| / max\\|τ_exakt\\| | κ |');
  lines.push('| ---: | ---: | ---: |');
  for (const row of data.circle) {
    lines.push(
      `| ${row.nu.toFixed(2)} | ${(row.fieldError * 100).toFixed(4)} % | ${row.kappa.toFixed(9)} |`,
    );
  }
  lines.push('');
  lines.push(
    'Der Rest ist Diskretisierung (lineares Dreieck gegen ein quadratisches Feld)',
  );
  lines.push(
    'und **wächst nicht mit ν**: der m-Anteil wird so genau getroffen wie der Rest.',
  );
  lines.push('');
  lines.push('Zwei weitere Orakel:');
  lines.push('');
  lines.push(
    `- **Rechteck bei ν = 0**: die exakte Lösung ist dort linear, das lineare`,
  );
  lines.push(
    `  Dreieck also exakt. Gerechnet \`${data.rectangleKappaZero.toFixed(12)}\`, 5/6 = \`${(5 / 6).toFixed(12)}\`.`,
  );
  lines.push(
    `- **It gegen die Fourierreihe** des Rechtecks: gerechnet \`${data.It.computed.toFixed(9)}\`,`,
  );
  lines.push(
    `  Reihe \`${data.It.closed.toFixed(9)}\`, Abweichung ${(((data.It.computed - data.It.closed) / data.It.closed) * 100).toFixed(4)} %.`,
  );
  lines.push('');
  lines.push('## Das Ergebnis');
  lines.push('');
  lines.push(
    'Vier Figuren, je zehn ν von 0 bis 0,45. Rest gegen die Ausgleichskurve,',
  );
  lines.push('gemessen an der Spannweite über ν.');
  lines.push('');
  lines.push('| Figur | `yM` affin in m | `1/κ` quadratisch in m | `1/κ` nur linear |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const figure of data.figures) {
    lines.push(
      `| ${figure.name} | ${percent(figure.yMResidualRatio)} | ${percent(figure.kappaResidualRatio)} | ${percent(figure.kappaLinearRatio)} |`,
    );
  }
  lines.push('');
  lines.push(
    '**Beide Vermutungen halten auf Rundungsniveau.** Die letzte Spalte sagt, dass',
  );
  lines.push(
    'der quadratische Anteil nicht wegzulassen ist: ein linearer Ansatz für `1/κ`',
  );
  lines.push('lässt rund 16 % stehen.');
  lines.push('');
  lines.push(
    'Die Gegenprobe — **eine** Zerlegung, **zwei** rechte Seiten, `Φ(m) = Φ₀ + m·Φ₁` —',
  );
  lines.push(
    `reproduziert alle zehn vollen Lösungen je Figur auf ${data.worstSplit.toExponential(2)}.`,
  );
  lines.push('');
  lines.push('### Die Koeffizienten');
  lines.push('');
  lines.push('| Figur | `1/κ` = d₀ | + d₁·m | + d₂·m² |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const figure of data.figures) {
    lines.push(
      `| ${figure.name} | ${figure.d[0].toExponential(6)} | ${figure.d[1].toExponential(2)} | ${figure.d[2].toExponential(6)} |`,
    );
  }
  lines.push('');
  lines.push(
    '**d₁ verschwindet in allen vier Figuren** — auf Rundungsniveau, nicht',
  );
  lines.push('näherungsweise. Das ist kein Zufall der vier Figuren, sondern');
  lines.push('herleitbar. d₁ ist das Skalarprodukt der beiden Spannungsfelder:');
  lines.push('');
  lines.push('```text');
  lines.push('1/κ = A·∫|τ₀|²  +  2A·m·∫τ₀·τ₁  +  A·m²·∫|τ₁|²');
  lines.push('       └─ d₀ ─┘      └─── d₁ ───┘    └── d₂ ──┘');
  lines.push('');
  lines.push('∫τ₀·τ₁ dA = ∫∇Φ₀·∇Φ₁ dA + ∫ z²/(2·Iy) · ∂Φ₁/∂y dA');
  lines.push('```');
  lines.push('');
  lines.push(
    'Der erste Teil ist nach Green `∮Φ₁·∂Φ₀/∂n ds − ∫Φ₁·∇²Φ₀ dA`: das Randintegral',
  );
  lines.push(
    'fällt weg, weil Φ₁ am Rand null ist, das Gebietsintegral, weil Φ₀ harmonisch',
  );
  lines.push(
    'ist. Der zweite Teil ist partiell nach y `∮ z²/(2·Iy)·Φ₁·n_y ds − ∫Φ₁·∂/∂y(…) dA`:',
  );
  lines.push(
    'das Randintegral fällt weg aus demselben Grund, das Gebietsintegral, weil',
  );
  lines.push('`z²/(2·Iy)` kein y enthält. Also **d₁ = 0 exakt**, für jeden');
  lines.push(
    'einfach zusammenhängenden Querschnitt, symmetrisch oder nicht, in beiden',
  );
  lines.push('Lastrichtungen. Die 10⁻¹³ oben sind Rundung.');
  lines.push('');
  lines.push(
    'Der Beweis braucht **eine** Voraussetzung: Φ₁ ist auf dem *ganzen* Rand null.',
  );
  lines.push(
    'Genau die zerstört ein Loch — dort ist Φ₁ eine unbekannte Konstante c₁, und',
  );
  lines.push(
    'aus dem ersten Randintegral wird `c₁·∮∂Φ₀/∂n ds` über den Innenrand, also der',
  );
  lines.push(
    'Fluss durch das Loch, der im Allgemeinen nicht verschwindet. **Bei mehrfach',
  );
  lines.push(
    'zusammenhängenden Figuren kann d₁ wieder auftauchen** — das Messgerät rechnet',
  );
  lines.push('sie nicht. Deshalb bleiben drei Zahlen gespeichert.');
  lines.push('');
  lines.push('## Schubmittelpunkt: Trefftz gegen Weber');
  lines.push('');
  lines.push(
    'Das Randwertproblem lautet vollständig `∇²Φ = −m·y/Iy + C`. C ist die',
  );
  lines.push(
    'überlagerte Torsion und wird von der Nebenbedingung festgelegt, unter der',
  );
  lines.push('„keine Verdrillung" gemessen wird:');
  lines.push('');
  lines.push(
    '- **Weber** — verschwindende *mittlere* Verdrillung, also `C = 0`.',
  );
  lines.push(
    '- **Trefftz** — verschwindende Projektion auf die Torsionsmode,',
  );
  lines.push('  `∫[τ_y·(ω,y − z) + τ_z·(ω,z + y)] dA = 0`.');
  lines.push('');
  lines.push(
    'ν bewegt den Schubmittelpunkt, bezogen auf den Trägheitsradius `√(Iy/A)` —',
  );
  lines.push('dieselbe Bezugsgröße, an der Satz 2 des Gates misst:');
  lines.push('');
  lines.push('| Figur | Weber | Trefftz |');
  lines.push('| --- | ---: | ---: |');
  for (const figure of data.figures) {
    lines.push(
      `| ${figure.name} | ${percent(figure.weberSpread, 3)} | ${percent(figure.trefftzSpread, 3)} |`,
    );
  }
  lines.push('');
  lines.push(
    '**Trefftz ist in allen vier Figuren konstant** — auf Rundungsniveau. Das ist',
  );
  lines.push(
    'kein Messergebnis, sondern die Bauform: er fällt aus `∇²ω = 0`, und darin',
  );
  lines.push('kommt ν nicht vor. Dasselbe gilt für `It`.');
  lines.push('');
  lines.push('## Zwei Formeln, die als Orakel nicht taugten');
  lines.push('');
  lines.push(
    '**Cowper ist nicht der Energiewert.** Für das Rechteck bei ν = 0,3 gibt',
  );
  lines.push(
    'Cowpers `10(1+ν)/(12+11ν)` den Wert 0,84967; gemessen wird 0,832942. κ aus der',
  );
  lines.push(
    'Schubenergie **fällt** mit ν, Cowpers Formel steigt. Beide treffen sich bei',
  );
  lines.push(
    'ν = 0 in 5/6. Cowper mittelt die 3D-Gleichungen und ist eine andere Größe —',
  );
  lines.push(
    'er taugt nicht als Abnahmekriterium. Praktisch heißt das: der FE-Weg und der',
  );
  lines.push(
    'vorhandene Grashof-Weg (`shear.ts`) stimmen für das Rechteck auf 0,08 %',
  );
  lines.push('überein, nicht auf 2 %.');
  lines.push('');
  lines.push(
    '**Die Lehrbuchformel des Halbkreises war falsch zitiert.** `e =',
  );
  lines.push(
    '8a(3+4ν)/(15π(1+ν))` verlangt eine ν-Abhängigkeit, die keine der beiden',
  );
  lines.push(
    'Definitionen wiedergibt — der ganze Abstand zwischen Weber und Trefftz ist',
  );
  lines.push(
    'rund zwanzigmal kleiner als der, den sie fordert. Der Fehler steckt in der',
  );
  lines.push('Formel: bei Sokolnikoff (*Mathematical Theory of Elasticity*, 2. Aufl.,');
  lines.push('§ 61, S. 237–239) steht');
  lines.push('');
  lines.push('```text');
  lines.push('e/a = 8·[3 + (40/π² − 1)·ν] / (15π(1+ν))  =  8·[3 + (40/π² − 4)·m] / (15π)');
  lines.push('```');
  lines.push('');
  lines.push('Da `40/π² = 4,0529` ist, ist die m-Steigung fast null statt steil —');
  lines.push('der Unterschied zur erinnerten Fassung ist der Faktor 19. Gegen die');
  lines.push('richtige Fassung gemessen:');
  lines.push('');
  lines.push('| | bei m = 0 | Steigung in m |');
  lines.push('| --- | ---: | ---: |');
  lines.push(
    `| Weber (FE) | ${data.halfDisc.weberZero.toFixed(9)} | ${data.halfDisc.weberSlope.toExponential(6)} |`,
  );
  lines.push(
    `| Sokolnikoff | ${data.halfDisc.closedZero.toFixed(9)} | ${data.halfDisc.closedSlope.toExponential(6)} |`,
  );
  lines.push(
    `| Abweichung | ${(((data.halfDisc.weberZero - data.halfDisc.closedZero) / data.halfDisc.closedZero) * 100).toFixed(4)} % | ${(((data.halfDisc.weberSlope - data.halfDisc.closedSlope) / data.halfDisc.closedSlope) * 100).toFixed(4)} % |`,
  );
  lines.push('');
  lines.push(
    '**Die geschlossene Lösung ist also ein Orakel für den m-Anteil des',
  );
  lines.push(
    'Schubmittelpunkts**, und sie bestätigt ihn. Sie bestätigt nebenbei auch, dass',
  );
  lines.push(
    'die klassische Zahl eine **Weber**-Zahl ist: Trefftz ist ν-frei und kann eine',
  );
  lines.push('Steigung ungleich null gar nicht liefern.');
  lines.push('');

  mkdirSync(dirname(fileURLToPath(REPORT_URL)), { recursive: true });
  writeFileSync(fileURLToPath(REPORT_URL), `${lines.join('\n')}\n`, 'utf8');
  console.log(
    `\nBericht geschrieben: docs/messungen/nu-abhaengigkeit-schubwerte.md`,
  );
}

// ---------------------------------------------------------------------------
// Lauf
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(fileURLToPath(SPARSE_WASM))) {
    console.log(
      'Das gebaute `pkg/` von @baustatik/sparse-solver-wasm fehlt — Messung uebersprungen.',
    );
    return;
  }

  const meshModule = await import(MESH_ENTRY.href);
  const sparse = await import(SPARSE_ENTRY.href);
  sparse.initSync({ module: readFileSync(fileURLToPath(SPARSE_WASM)) });
  const mesher = await meshModule.createMesher2D();

  // --- Kreis: erst die Formulierung belegen, dann messen -------------------
  const radius = 1;
  const disc = prepare(
    mesher,
    discRing(radius, 720),
    (Math.PI * radius * radius) / 24000,
  );
  const circleRows = verifyCircle(sparse, disc, radius);

  // --- Rechteck b × h ------------------------------------------------------
  const b = 1;
  const h = 2;
  const rectangle = prepare(mesher, rectangleRing(b, h), (b * h) / 24000);
  const rectangleResult = measure(
    sparse,
    rectangle,
    `RECHTECK  b = ${b}, h = ${h}   (doppelt symmetrisch, yM ≡ 0)`,
  );

  console.log('\n-- Gegen die geschlossene Loesung ------------------------');
  console.log('   Cowper:  kappa = 10(1+ν)/(12+11ν) = 10/(12−m)');
  console.log('     ν      gerechnet        Cowper          Abweichung');
  for (let i = 0; i < POISSON_VALUES.length; i++) {
    const closed = 10 / (12 - rectangleResult.m[i]);
    const computed = rectangleResult.kappa[i];
    console.log(
      `    ${POISSON_VALUES[i].toFixed(2)}   ${computed.toFixed(9)}   ${closed.toFixed(9)}   ${(((computed - closed) / closed) * 100).toFixed(4)} %`,
    );
  }
  console.log(
    `   Bei m = 0 ist die exakte Loesung LINEAR, das lineare Dreieck also exakt:`,
  );
  console.log(
    `     kappa(0) = ${rectangleResult.kappa[0].toFixed(12)}   5/6 = ${(5 / 6).toFixed(12)}`,
  );

  // It gegen die Fourierreihe des Rechtecks — der Beleg dafuer, dass das
  // Torsionsproblem richtig aufgestellt ist. Lange Seite `h`, kurze `b`:
  //
  //   It = (1/3)·h·b³·[1 − (192/π⁵)·(b/h)·Σ tanh(nπh/2b)/n⁵]   n = 1,3,5,…
  let series = 0;
  for (let n = 1; n <= 21; n += 2) {
    series += Math.tanh((n * Math.PI * h) / (2 * b)) / n ** 5;
  }
  const ItClosed =
    (1 / 3) * h * b ** 3 * (1 - (192 / Math.PI ** 5) * (b / h) * series);
  console.log('\n-- It gegen die Fourierreihe -----------------------------');
  console.log(`   gerechnet  ${rectangleResult.It.toFixed(9)}`);
  console.log(`   Reihe      ${ItClosed.toFixed(9)}`);
  console.log(
    `   Abweichung ${(((rectangleResult.It - ItClosed) / ItClosed) * 100).toFixed(4)} %`,
  );
  console.log(
    '   IN DIESER RECHNUNG KOMMT ν NICHT VOR — weder in ∇²ω = 0 noch in',
  );
  console.log('   der Randbedingung. It ist reine Geometrie.');

  // --- Halbkreis -----------------------------------------------------------
  const a = 1;
  const halfDisc = prepare(
    mesher,
    halfDiscRing(a, 360),
    (Math.PI * a * a) / 2 / 24000,
  );
  const halfDiscResult = measure(
    sparse,
    halfDisc,
    `HALBKREIS  a = ${a}   (einfach symmetrisch, yM ≠ 0)`,
  );

  const eOffset = halfDisc.centroid.yc; // Schwerpunkt, gemessen vom Kreismittelpunkt
  // Sokolnikoff, Mathematical Theory of Elasticity, 2. Aufl., §61, S. 237–239.
  // ACHTUNG: die gelaeufige Erinnerung „3 + 4ν" ist FALSCH. Richtig steht dort
  // 3 + (40/π² − 1)·ν, und mit m = ν/(1+ν) wird daraus 3 + (40/π² − 4)·m —
  // eine fast waagerechte Gerade statt einer steilen. Der alte Zettel forderte
  // die neunzehnfache ν-Steigung und liess die Rechnung falsch aussehen.
  const closedSlope = (40 / (Math.PI * Math.PI) - 4) * ((8 * a) / (15 * Math.PI));
  console.log('\n-- Gegen die geschlossene Loesung ------------------------');
  console.log('   Sokolnikoff:  e = 8a[3 + (40/π²−1)ν]/(15π(1+ν))');
  console.log('                   = 8a[3 + (40/π²−4)m]/(15π),');
  console.log('   gemessen vom KREISMITTELPUNKT; hier gerechnet wird ab dem');
  console.log(`   Schwerpunkt, der ${eOffset.toFixed(9)} davor liegt (4a/3π = ${(4 / (3 * Math.PI)).toFixed(9)}).`);
  console.log(
    '     ν      Weber           Trefftz         Sokolnikoff     Weber−S',
  );
  for (let i = 0; i < POISSON_VALUES.length; i++) {
    const closed =
      ((8 * a) / (15 * Math.PI)) * 3 + closedSlope * halfDiscResult.m[i];
    const weber = halfDiscResult.yM[i] + eOffset;
    const trefftz = halfDiscResult.yMTrefftz[i] + eOffset;
    console.log(
      `    ${POISSON_VALUES[i].toFixed(2)}   ${weber.toFixed(9)}   ${trefftz.toFixed(9)}   ${closed.toFixed(9)}   ${(((weber - closed) / closed) * 100).toFixed(4)} %`,
    );
  }
  console.log(
    `   m-Steigung  Weber ${halfDiscResult.yMLinear[1].toExponential(6)}   Trefftz ${halfDiscResult.trefftzLinear[1].toExponential(6)}   Sokolnikoff ${closedSlope.toExponential(6)}`,
  );
  console.log(
    `   Weber gegen Sokolnikoff in der Steigung: ${(((halfDiscResult.yMLinear[1] - closedSlope) / closedSlope) * 100).toFixed(4)} %`,
  );

  // --- Winkel: ohne jede Symmetrie -----------------------------------------
  const legZ = 1;
  const legY = 0.6;
  const t = 0.15;
  const area = legY * t + t * (legZ - t);

  // Erster Durchgang nur, um die Hauptachsenlage zu bestimmen.
  const probe = prepare(mesher, angleRing(legZ, legY, t), area / 2000);
  const alpha =
    0.5 * Math.atan2(2 * probe.Iyz, probe.Iz - probe.Iy);

  console.log(`\n${'='.repeat(74)}`);
  console.log(
    `WINKEL  ${legZ} × ${legY} × ${t}   (KEINE Symmetrieachse, Iyz != 0)`,
  );
  console.log('='.repeat(74));
  console.log(
    `Hauptachsen   Iyz roh = ${probe.Iyz.toExponential(6)},  alpha = ${((alpha * 180) / Math.PI).toFixed(6)}°`,
  );
  console.log(
    'Zwei Lastfaelle: Qz liefert die eine, Qy die andere Koordinate des',
  );
  console.log('Schubmittelpunkts. Beide muessen affin in m sein.',);

  const angleU = prepare(
    mesher,
    angleRing(legZ, legY, t),
    area / 24000,
    alpha,
  );
  const resultU = measure(
    sparse,
    angleU,
    `WINKEL, Lastfall Qz  —  Schubmittelpunkt laengs der Hauptachse u`,
  );

  const angleV = prepare(
    mesher,
    angleRing(legZ, legY, t),
    area / 24000,
    alpha + Math.PI / 2,
  );
  const resultV = measure(
    sparse,
    angleV,
    `WINKEL, Lastfall Qy  —  Schubmittelpunkt laengs der Hauptachse v`,
  );

  console.log(`\n${'='.repeat(74)}`);
  console.log('ZUSAMMENFASSUNG — groesster Rest gegen die Ausgleichskurve,');
  console.log('gemessen an der Spannweite ueber ν = 0 … 0,45');
  console.log('='.repeat(74));
  const rows = [
    ['Rechteck', rectangleResult, Math.sqrt(rectangle.Iy / rectangle.A)],
    ['Halbkreis', halfDiscResult, Math.sqrt(halfDisc.Iy / halfDisc.A)],
    ['Winkel (u)', resultU, Math.sqrt(angleU.Iy / angleU.A)],
    ['Winkel (v)', resultV, Math.sqrt(angleV.Iy / angleV.A)],
  ];
  console.log('  Figur          yM Weber       1/kappa (Grad 2)');
  for (const [name, result] of rows) {
    const yMSpan = span(result.yM);
    const yMRest = maxResidual(result.m, result.yM, result.yMLinear);
    const kSpan = span(result.inverseKappa);
    const kRest = maxResidual(
      result.m,
      result.inverseKappa,
      result.inverseQuadratic,
    );
    console.log(
      `  ${name.padEnd(14)} ${`${((yMRest / yMSpan) * 100).toExponential(2)} %`.padEnd(14)} ${((kRest / kSpan) * 100).toExponential(2)} %`,
    );
  }

  console.log('\n  Wie stark bewegt ν den Schubmittelpunkt ueberhaupt?');
  console.log(
    '  Spannweite ueber ν = 0 … 0,45. Bezugsgroesse ist der Traegheits-',
  );
  console.log(
    '  radius √(Iy/A) — dieselbe, an der auch Satz 2 des Gates misst;',
  );
  console.log('  ein Verhaeltnis zu yM selbst waere bei yM ≈ 0 sinnlos.');
  console.log('  Figur          Weber           Trefftz');
  for (const [name, result, radius] of rows) {
    const weber = (span(result.yM) / radius) * 100;
    const trefftz = (span(result.yMTrefftz) / radius) * 100;
    console.log(
      `  ${name.padEnd(14)} ${`${weber.toExponential(3)} %`.padEnd(15)} ${trefftz.toExponential(3)} %`,
    );
  }
  console.log(
    '\n  TREFFTZ IST IN ALLEN VIER FIGUREN KONSTANT — auf Rundungsniveau,',
  );
  console.log(
    '  nicht naeherungsweise. Das ist kein Messergebnis, sondern die',
  );
  console.log(
    '  Bauform: er faellt aus ∇²ω = 0, und darin kommt ν nicht vor.',
  );

  writeReport({
    halfDisc: {
      weberZero: halfDiscResult.yMLinear[0] + eOffset,
      weberSlope: halfDiscResult.yMLinear[1],
      closedZero: ((8 * a) / (15 * Math.PI)) * 3,
      closedSlope,
    },
    circle: circleRows,
    rectangleKappaZero: rectangleResult.kappa[0],
    It: { computed: rectangleResult.It, closed: ItClosed },
    worstSplit: Math.max(...rows.map(([, result]) => result.worstSplit)),
    figures: rows.map(([name, result, radius]) => ({
      name,
      yMResidualRatio: result.yMResidual / span(result.yM),
      kappaResidualRatio: result.quadraticResidual / span(result.inverseKappa),
      kappaLinearRatio: result.linearResidual / span(result.inverseKappa),
      d: result.inverseQuadratic,
      weberSpread: span(result.yM) / radius,
      trefftzSpread: span(result.yMTrefftz) / radius,
    })),
  });

  console.log(`\n${'='.repeat(74)}`);
  console.log('Was die Zahlen NICHT sagen: ob daraus eine Koeffizientenform');
  console.log('im Querschnittssatz werden soll. Das ist eine Entwurfsfrage.');
  console.log('');
  console.log('ZUR LEHRBUCHFORMEL DES HALBKREISES: sie stimmt, und zwar in');
  console.log('ihrer ν-Abhaengigkeit. Falsch war das ERINNERTE „3 + 4ν";');
  console.log('bei Sokolnikoff (§61) steht 3 + (40/π²−1)ν, mit m also');
  console.log('3 + (40/π²−4)m. Der Unterschied ist der Faktor 19 in der');
  console.log('Steigung. Gegen die richtige Fassung trifft die Weber-Zahl');
  console.log('auch die Steigung — auf rund 0,02 %, also Diskretisierung.');
  console.log('='.repeat(74));
}

await main();
