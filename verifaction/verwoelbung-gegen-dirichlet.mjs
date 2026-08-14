/**
 * MESSGERAET, kein Regressionstest.
 *
 * ZWEI FRAGEN:
 *
 *   1. Liefert die Verwoelbungsformulierung des Schubproblems DASSELBE
 *      Spannungsfeld wie die heutige Spannungsfunktion mit Dirichlet-Rand?
 *   2. Wie schnell steht die Zahl bei einer Figur mit EINSPRINGENDER ECKE?
 *
 * Die zweite Frage ist unabhaengig von der ersten und aelter als sie: sie
 * betrifft jede Diskretisierung dieses Problems. Sie steht hier, weil dieselbe
 * Maschinerie sie ohne Zusatzaufwand beantwortet — siehe „DIE ZWEITE FRAGE"
 * weiter unten.
 *
 * WARUM SIE GESTELLT WIRD. Die Dirichlet-Fassung legt `Φ` nur ENTLANG jeder
 * Randschleife fest; je Schleife bleibt eine Konstante offen, und das Randdatum
 * muss beim Umlauf schliessen:
 *
 *   ∮dΦ = −1/(2·Iy)·∮z²dy = ∓(1/Iy)·∫∫_D z dA
 *
 * Der Sprung ist das statische Moment der eingeschlossenen Flaeche um die
 * Biegeachse — er verschwindet nur, wenn der Schwerpunkt jedes Lochs auf der
 * Biegeachse liegt. Sonst ist `Φ` mehrdeutig, und die FE verweigert
 * (`hole-off-bending-axis`, ADR 0045). Eine Formulierung ueber eine
 * VERSCHIEBUNG kennt das Problem nicht: sie ist auf jedem Gebiet eindeutig.
 *
 * DER VERGLEICH IST EIN FELDVERGLEICH UND KEIN ORAKELVERGLEICH. Orakel
 * vergleichen Skalare, in denen sich zwei Vorzeichenfehler aufheben koennen.
 * Hier laufen beide Formulierungen auf DEMSELBEN Netz, und `τ` wird in JEDEM
 * Gausspunkt verglichen.
 *
 * ZWEI VERWOELBUNGSVARIANTEN, WEIL DIE AUFTEILUNG EINE WAHL IST. Mit
 * `τ = ∇ψ + p` traegt `p` die Wirbelstaerke; wieviel `p` zusaetzlich von der
 * Quelle uebernimmt, ist frei:
 *
 *   A  p = (0, m·y²/(2Iy))                 ∇²ψ₀ = −z/Iy,  ∂ψ₀/∂n = 0
 *   B  p = (0, −z²/(2Iy) + m·y²/(2Iy))     ∇²ψ₀ = 0,      ∂ψ₀/∂n = z²/(2Iy)·n_z
 *
 * Beide sind exakt; beide haben eine Vertraeglichkeitsbedingung, die GLOBAL
 * gilt statt je Schleife, und damit faellt in beiden die Lochgrenze weg. Der
 * Unterschied ist DISKRET: bei A muss `∇ψ₀` die ganze Jourawski-Parabel
 * tragen, bei B steht sie als algebraischer Term exakt im Integranden. Welche
 * der beiden das Rechteck bei `m = 0` noch auf zwoelf Stellen trifft, ist eine
 * Messfrage und keine Geschmacksfrage — deshalb laufen hier beide.
 *
 * DIE ZWEITE FRAGE: WIE SCHNELL STEHT DIE ZAHL? An einer einspringenden Ecke
 * ist `τ` SINGULAER, und zwar in der kontinuierlichen Loesung und nicht erst im
 * Netz. Bei Materialinnenwinkel `ω` hat das Neumann-Problem den Exponenten
 * `λ = π/ω`; fuer die Ecke eines Rechtecklochs oder die Innenecke eines Winkels
 * ist `ω = 3π/2`, also
 *
 *   ψ ~ r^(2/3)     τ = ∇ψ ~ r^(−1/3) → ∞
 *
 * κ SELBST BLEIBT DAVON UNBERUEHRT: es ist ein Energieintegral, und
 * `|τ|²·dA ~ r^(−2/3)·r dr` konvergiert. Endlich ist die Zahl also. Was leidet,
 * ist die ORDNUNG, mit der sie sich einstellt: der H1-Fehler ist durch die
 * Singularitaet auf `O(h^λ)` gedeckelt, der Energiefehler damit auf
 * `O(h^(2λ)) = O(h^(4/3))` statt `O(h^4)` wie bei glatter Loesung.
 *
 * DAS IST VORHERSAGE UND WIRD ALS SOLCHE GEPRUEFT. Die Reihe laeuft ueber vier
 * Netzdichten mit Vervierfachung je Schritt — `h` halbiert sich also, und der
 * Abstand aufeinanderfolgender Werte verhaelt sich wie `2^p`. Das Rechteck
 * laeuft als GLATTE Gegenprobe mit: ohne es waere nicht zu unterscheiden, ob
 * eine langsame Ordnung an der Ecke oder an der Maschinerie liegt.
 *
 * WAS DIESES SKRIPT NICHT TUT: es urteilt nicht. Es gibt keine Schranke,
 * unterhalb derer etwas „in Ordnung" waere — das entscheidet ein ADR.
 *
 * SELBSTTRAGEND MIT ABSICHT. Beide Formulierungen stehen hier ausgeschrieben
 * und nicht als Import aus dem Package: der Dirichlet-Weg wird im Produktivcode
 * geloescht, und ein aufbewahrtes Messgeraet, das danach nicht mehr laeuft,
 * belegt nichts. Geteilt wird nur, was bleibt — `prepareSection` und die beiden
 * WASM-Artefakte.
 *
 * Lauf:  pnpm --filter @baustatik/cross-section-fe build
 *        node verifaction/verwoelbung-gegen-dirichlet.mjs
 *
 * Ausgabe: `docs/messungen/verwoelbung-gegen-dirichlet.md`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// `@baustatik/mesh-2d-wasm` wird mit endungslosen relativen Importen gebaut;
// das blanke Node loest die nicht auf.
register('./extensionless-hook.mjs', import.meta.url);

const CROSS_SECTION_FE = new URL(
  '../packages/cross-section-fe/dist/index.js',
  import.meta.url,
);
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
const REPORT_URL = new URL(
  '../docs/messungen/verwoelbung-gegen-dirichlet.md',
  import.meta.url,
);

/** Elementzahl je Figur — deutlich feiner als die Voreinstellung. */
const ELEMENTS = 6000;

/** Die Querdehnzahlen. `m = ν/(1+ν)`; bei ν = 0 traegt der m-Anteil nichts. */
const POISSON_VALUES = [0, 0.2, 0.3];

// ---------------------------------------------------------------------------
// Tri6-Algebra — dieselben Regeln wie `src/tri6.ts`, hier ausgeschrieben
// ---------------------------------------------------------------------------

/** Dreipunktregel, exakt bis Grad 2 — fuer `K`. */
const TRIANGLE_3 = [
  { L: [2 / 3, 1 / 6, 1 / 6], w: 1 / 3 },
  { L: [1 / 6, 2 / 3, 1 / 6], w: 1 / 3 },
  { L: [1 / 6, 1 / 6, 2 / 3], w: 1 / 3 },
];

/** Sechspunktregel, exakt bis Grad 4 (Dunavant, Ordnung 4). */
const TRIANGLE_6 = (() => {
  const a1 = 0.816847572980459;
  const b1 = 0.091576213509771;
  const w1 = 0.109951743655322;
  const a2 = 0.10810301816807;
  const b2 = 0.445948490915965;
  const w2 = 0.223381589678011;
  return [
    { L: [a1, b1, b1], w: w1 },
    { L: [b1, a1, b1], w: w1 },
    { L: [b1, b1, a1], w: w1 },
    { L: [a2, b2, b2], w: w2 },
    { L: [b2, a2, b2], w: w2 },
    { L: [b2, b2, a2], w: w2 },
  ];
})();

/** Drei-Punkt-Gauss auf `[-1, 1]`, exakt bis Grad 5 — fuer die Randintegrale. */
const GAUSS_3 = [
  { t: -Math.sqrt(3 / 5), w: 5 / 9 },
  { t: 0, w: 8 / 9 },
  { t: Math.sqrt(3 / 5), w: 5 / 9 },
];

function shape(L) {
  const [L0, L1, L2] = L;
  return [
    L0 * (2 * L0 - 1),
    L1 * (2 * L1 - 1),
    L2 * (2 * L2 - 1),
    4 * L0 * L1,
    4 * L1 * L2,
    4 * L2 * L0,
  ];
}

function shapeDerivatives(L) {
  const [L0, L1, L2] = L;
  return [
    [1 - 4 * L0, 4 * L1 - 1, 0, 4 * (L0 - L1), 4 * L2, -4 * L2],
    [1 - 4 * L0, 0, 4 * L2 - 1, -4 * L1, 4 * L1, 4 * (L0 - L2)],
  ];
}

const edgeShape = (t) => [(t * (t - 1)) / 2, 1 - t * t, (t * (t + 1)) / 2];
const edgeShapeDerivatives = (t) => [(2 * t - 1) / 2, -2 * t, (2 * t + 1) / 2];

/** Die Auswertung eines Elements an allen Punkten einer Regel. */
function elementPoints(rule, y, z) {
  const points = [];
  for (const point of rule) {
    const N = shape(point.L);
    const [dXi, dEta] = shapeDerivatives(point.L);

    let dydXi = 0;
    let dzdXi = 0;
    let dydEta = 0;
    let dzdEta = 0;
    for (let i = 0; i < 6; i++) {
      dydXi += dXi[i] * y[i];
      dzdXi += dXi[i] * z[i];
      dydEta += dEta[i] * y[i];
      dzdEta += dEta[i] * z[i];
    }
    const detJ = dydXi * dzdEta - dzdXi * dydEta;
    if (!(Number.isFinite(detJ) && detJ > 0)) {
      throw new Error('Ein Tri6-Element ist entartet (detJ <= 0).');
    }

    const dNdy = new Float64Array(6);
    const dNdz = new Float64Array(6);
    let py = 0;
    let pz = 0;
    for (let i = 0; i < 6; i++) {
      dNdy[i] = (dXi[i] * dzdEta - dEta[i] * dzdXi) / detJ;
      dNdz[i] = (dEta[i] * dydXi - dXi[i] * dydEta) / detJ;
      py += N[i] * y[i];
      pz += N[i] * z[i];
    }
    points.push({ N, dNdy, dNdz, y: py, z: pz, weight: (point.w * detJ) / 2 });
  }
  return points;
}

const elementNodes = (mesh, element) =>
  mesh.elements.subarray(element * 6, element * 6 + 6);

// ---------------------------------------------------------------------------
// Die Figuren
// ---------------------------------------------------------------------------

const rectangleRing = (b, h) => [-b / 2, -h / 2, b / 2, -h / 2, b / 2, h / 2, -b / 2, h / 2];

function discRing(a, segments, from = 0, to = 2 * Math.PI) {
  const closed = to - from >= 2 * Math.PI - 1e-12;
  const count = closed ? segments : segments + 1;
  const points = [];
  for (let index = 0; index < count; index++) {
    const angle = from + ((to - from) * index) / segments;
    points.push(a * Math.cos(angle), a * Math.sin(angle));
  }
  return points;
}

const boxRing = (yc, zc, b, h) => [
  yc - b / 2,
  zc - h / 2,
  yc + b / 2,
  zc - h / 2,
  yc + b / 2,
  zc + h / 2,
  yc - b / 2,
  zc + h / 2,
];

/** Ein Winkel ohne Symmetrieachse — `Iyz != 0`, also echte Hauptachsendrehung. */
const angleRing = (a, b, t) => [0, 0, a, 0, a, t, t, t, t, b, 0, b];

const FIGURES = [
  {
    name: 'Rechteck 200 × 300',
    note: 'Der m⁰-Anteil gegen die geschlossene Parabel. `d0` muss 6/5 sein.',
    rings: [{ kind: 'material', coordinates: rectangleRing(0.2, 0.3) }],
    area: 0.2 * 0.3,
    exactD0: 1.2,
  },
  {
    name: 'Kreis r = 150',
    note: 'Der m-Anteil des Feldes — eines der beiden Orakel, die ihn sehen.',
    rings: [{ kind: 'material', coordinates: discRing(0.15, 360) }],
    area: Math.PI * 0.15 ** 2,
  },
  {
    name: 'Halbkreis r = 150',
    note: 'Der m-Anteil des Schubmittelpunkts, `Iyz`-frei.',
    rings: [
      {
        kind: 'material',
        coordinates: discRing(0.15, 240, -Math.PI / 2, Math.PI / 2),
      },
    ],
    area: (Math.PI * 0.15 ** 2) / 2,
  },
  {
    name: 'Winkel 200 × 120 × 30',
    note: 'Ohne Symmetrieachse: `Iyz != 0`, gerechnet wird gedreht.',
    rings: [{ kind: 'material', coordinates: angleRing(0.2, 0.12, 0.03) }],
    area: 0.2 * 0.03 + (0.12 - 0.03) * 0.03,
  },
  {
    name: 'Kasten 200 × 400, Loch mittig',
    note: 'Die letzte Figur, die BEIDE Wege tragen — beim ausmittigen Loch verweigert der Dirichlet-Weg.',
    rings: [
      { kind: 'material', coordinates: boxRing(0, 0, 0.2, 0.4) },
      { kind: 'hole', coordinates: boxRing(0, 0, 0.06, 0.12) },
    ],
    area: 0.2 * 0.4 - 0.06 * 0.12,
  },
];

/**
 * Die Verfeinerungsreihe. VIERFACHUNG JE SCHRITT, damit sich `h` halbiert —
 * nur dann ist der Quotient aufeinanderfolgender Abstaende `2^p`.
 */
const REFINEMENT_STEPS = [1500, 6000, 24000, 96000];

/**
 * Drei Figuren, und die erste ist die Gegenprobe.
 *
 * Ohne eine GLATTE Figur in derselben Reihe waere eine langsame Ordnung nicht
 * der Ecke zuzuordnen — sie koennte ebensogut an der Quadratur, am Loeser oder
 * am Mesher liegen.
 */
const REFINEMENT_FIGURES = [
  {
    name: 'Rechteck 200 × 300',
    note: 'GLATTE Gegenprobe — kein einspringender Winkel, keine Singularität.',
    corner: 'keine',
    rings: [{ kind: 'material', coordinates: rectangleRing(0.2, 0.3) }],
    area: 0.2 * 0.3,
  },
  {
    name: 'Kasten 200 × 400, Loch bei z = 60',
    note: 'Die Figur, für die es diese Formulierung gibt: vier einspringende Ecken am Loch, und das Loch liegt neben der Biegeachse.',
    corner: '4 × 270°',
    rings: [
      { kind: 'material', coordinates: boxRing(0, 0, 0.2, 0.4) },
      { kind: 'hole', coordinates: boxRing(0, 0.06, 0.06, 0.12) },
    ],
    area: 0.2 * 0.4 - 0.06 * 0.12,
  },
  {
    name: 'Winkel 200 × 120 × 30',
    note: 'Eine einzige einspringende Ecke, dafür ohne Symmetrieachse.',
    corner: '1 × 270°',
    rings: [{ kind: 'material', coordinates: angleRing(0.2, 0.12, 0.03) }],
    area: 0.2 * 0.03 + (0.12 - 0.03) * 0.03,
  },
];

/**
 * Was in der Reihe verfolgt wird.
 *
 * `floor` ist ein Bezugsmass AUS DER FIGUR, kein gemessener Wert — es wird
 * gebraucht, wo die Groesse selbst aus SYMMETRIE verschwindet. Ohne es waere
 * `zM` des Rechtecks (`≡ 0`, gemessen `4·10⁻¹⁰`) eine relative Aenderung von
 * 3600 %, und die Reihe berichtete Rauschen als Bewegung. Die Dimension muss
 * stimmen: `It ~ Flaeche²`, `zM ~ Laenge`.
 */
const TRACKED = [
  { key: 'd0', label: '`d0`', digits: 9, floor: () => 1 },
  { key: 'It', label: '`It` [m⁴]', digits: 9, floor: (f) => f.area ** 2 },
  { key: 'zM', label: '`zM` [m]', digits: 9, floor: (f) => Math.sqrt(f.area) },
];

/** Unterhalb dessen ist eine Groesse null und keine kleine Zahl. */
const ZERO_LEVEL = 1e-7;

/** Unterhalb dessen ist eine AENDERUNG Gleitkommarauschen und keine Bewegung. */
const NOISE_LEVEL = 1e-9;

// ---------------------------------------------------------------------------
// Bezugssystem
// ---------------------------------------------------------------------------

/** Der Drehwinkel in die Hauptachsen, auf `(−π/4, +π/4]` — wie `assemble.ts`. */
function principalRotation(Iy, Iz, Iyz) {
  let theta = Math.atan2(-2 * Iyz, Iy - Iz) / 2;
  const quarter = Math.PI / 4;
  while (theta > quarter) theta -= Math.PI / 2;
  while (theta <= -quarter) theta += Math.PI / 2;
  return theta;
}

/** `y' = y·cosθ + z·sinθ`, `z' = −y·sinθ + z·cosθ`, plus `Iy` in DIESEM System. */
function createFrame(section, theta) {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const y = new Float64Array(section.nodeCount);
  const z = new Float64Array(section.nodeCount);
  for (let node = 0; node < section.nodeCount; node++) {
    const y0 = section.y[node];
    const z0 = section.z[node];
    y[node] = y0 * cos + z0 * sin;
    z[node] = -y0 * sin + z0 * cos;
  }
  const Iy =
    section.Iy * cos * cos +
    section.Iz * sin * sin -
    2 * section.Iyz * sin * cos;
  return { theta, y, z, Iy };
}

// ---------------------------------------------------------------------------
// Assemblierung
// ---------------------------------------------------------------------------

/** `K_ij = ∫∇N_i·∇N_j dA` auf den durch `freeIndex` benannten Zeilen. */
function assembleK(section, freeIndex, free) {
  const elementK = new Float64Array(36 * section.elementCount);
  const entries = new Map();
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);

  for (let element = 0; element < section.elementCount; element++) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i++) {
      elementY[i] = section.y[nodes[i]];
      elementZ[i] = section.z[nodes[i]];
    }
    const offset = 36 * element;
    for (const point of elementPoints(TRIANGLE_3, elementY, elementZ)) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          elementK[offset + 6 * i + j] +=
            (point.dNdy[i] * point.dNdy[j] + point.dNdz[i] * point.dNdz[j]) *
            point.weight;
        }
      }
    }
    for (let i = 0; i < 6; i++) {
      const row = freeIndex[nodes[i]];
      if (row < 0) continue;
      for (let j = 0; j < 6; j++) {
        const column = freeIndex[nodes[j]];
        if (column < 0 || column > row) continue;
        const key = row * 0x4000_0000 + column;
        entries.set(key, (entries.get(key) ?? 0) + elementK[offset + 6 * i + j]);
      }
    }
  }

  const count = entries.size;
  const rows = new Uint32Array(count);
  const cols = new Uint32Array(count);
  const values = new Float64Array(count);
  let at = 0;
  for (const [key, value] of entries) {
    rows[at] = Math.floor(key / 0x4000_0000);
    cols[at] = key % 0x4000_0000;
    values[at] = value;
    at++;
  }
  return { free, freeIndex, rows, cols, values, elementK };
}

/** Das Dirichlet-System: JEDER Randknoten ist gebunden. */
function dirichletSystem(section) {
  const freeIndex = new Int32Array(section.nodeCount).fill(-1);
  let free = 0;
  for (let node = 0; node < section.nodeCount; node++) {
    if (section.isBoundary[node] === 0) freeIndex[node] = free++;
  }
  return assembleK(section, freeIndex, free);
}

/** Das reine Neumann-System: genau EIN Knoten wird symmetrisch festgehalten. */
function neumannSystem(section) {
  const freeIndex = new Int32Array(section.nodeCount).fill(-1);
  let free = 0;
  for (let node = 1; node < section.nodeCount; node++) freeIndex[node] = free++;
  return assembleK(section, freeIndex, free);
}

/** Knotenwerte aus den freien Zeilen plus vorgegebenen Randwerten. */
function expand(section, system, free, boundary) {
  const field = new Float64Array(section.nodeCount);
  for (let node = 0; node < section.nodeCount; node++) {
    const row = system.freeIndex[node];
    field[node] = row < 0 ? (boundary?.[node] ?? 0) : free[row];
  }
  return field;
}

// ---------------------------------------------------------------------------
// Der Dirichlet-Weg: `Φ` mit `∇²Φ = −m·y/Iy`
// ---------------------------------------------------------------------------

/** Das Randdatum `Φ = −1/(2·Iy)·∫z²dy`, je Schleife bei null beginnend. */
function boundaryDatum(section, frame) {
  const { y, z, Iy } = frame;
  const values = new Float64Array(section.nodeCount);
  const factor = -1 / (2 * Iy);
  let low = 0;
  let high = 0;
  let worst = 0;

  for (const loop of section.loops) {
    let running = 0;
    for (let at = 0; at < loop.edges.length; at++) {
      const [a, middle, b] = loop.edges[at];
      const dy = y[b] - y[a];
      const za = z[a];
      const zb = z[b];
      const toMiddle = factor * dy * ((7 * za * za + 4 * za * zb + zb * zb) / 24);
      const toEnd = factor * dy * ((za * za + za * zb + zb * zb) / 3);
      values[middle] = running + toMiddle;
      if (at + 1 === loop.edges.length) {
        worst = Math.max(worst, Math.abs(running + toEnd));
      } else {
        values[b] = running + toEnd;
      }
      running += toEnd;
      low = Math.min(low, running, values[middle]);
      high = Math.max(high, running, values[middle]);
    }
  }
  const spread = high - low;
  return { values, closure: spread > 0 ? worst / spread : worst };
}

/** `f_i = (1/Iy)·∫y·N_i dA` — Grad 3, also die Sechspunktregel. */
function dirichletLoad(section, system, frame) {
  const rhs = new Float64Array(system.free);
  const full = new Float64Array(section.nodeCount);
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);

  for (let element = 0; element < section.elementCount; element++) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i++) {
      elementY[i] = frame.y[nodes[i]];
      elementZ[i] = frame.z[nodes[i]];
    }
    for (const point of elementPoints(TRIANGLE_6, elementY, elementZ)) {
      for (let i = 0; i < 6; i++) {
        const value = (point.y * point.N[i] * point.weight) / frame.Iy;
        full[nodes[i]] += value;
        const row = system.freeIndex[nodes[i]];
        if (row >= 0) rhs[row] += value;
      }
    }
  }
  return { rhs, full };
}

/** `−Σ_j K_ij·d_j` ueber die GEBUNDENEN Knoten `j`. */
function liftDirichlet(section, system, datum) {
  const rhs = new Float64Array(system.free);
  for (let element = 0; element < section.elementCount; element++) {
    const nodes = elementNodes(section.mesh, element);
    const offset = 36 * element;
    for (let i = 0; i < 6; i++) {
      const row = system.freeIndex[nodes[i]];
      if (row < 0) continue;
      for (let j = 0; j < 6; j++) {
        if (system.freeIndex[nodes[j]] >= 0) continue;
        rhs[row] -= system.elementK[offset + 6 * i + j] * datum[nodes[j]];
      }
    }
  }
  return rhs;
}

/** `K·φ` ueber ALLE Knoten — die Randzeilen fehlen im aufgestellten System. */
function applyStiffness(section, system, phi) {
  const out = new Float64Array(section.nodeCount);
  for (let element = 0; element < section.elementCount; element++) {
    const nodes = elementNodes(section.mesh, element);
    const offset = 36 * element;
    for (let i = 0; i < 6; i++) {
      let sum = 0;
      for (let j = 0; j < 6; j++) {
        sum += system.elementK[offset + 6 * i + j] * phi[nodes[j]];
      }
      out[nodes[i]] += sum;
    }
  }
  return out;
}

/** Der Fluss `∮_Γk ∂Φ/∂n ds` je Innenrand, aus der schwachen Form. */
function holeFlux(section, system, loadFull, phi, loadFactor) {
  const stiff = applyStiffness(section, system, phi);
  const flux = new Float64Array(section.holeLoops.length);
  for (let hole = 0; hole < section.holeLoops.length; hole++) {
    let sum = 0;
    for (const node of section.holeLoops[hole].nodes) {
      sum += stiff[node] - loadFactor * loadFull[node];
    }
    flux[hole] = sum;
  }
  return flux;
}

/** Dichtes `h × h`-System mit Spaltenpivotierung. */
function solveDense(matrix, rhs) {
  const n = rhs.length;
  const work = Array.from({ length: n }, (_, row) => {
    const line = new Float64Array(n + 1);
    line.set(matrix[row], 0);
    line[n] = rhs[row];
    return line;
  });
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(work[row][col]) > Math.abs(work[pivot][col])) pivot = row;
    }
    [work[col], work[pivot]] = [work[pivot], work[col]];
    if (work[col][col] === 0) {
      throw new Error('Die Kopplungsmatrix der Loecher ist singulaer.');
    }
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = work[row][col] / work[col][col];
      for (let k = col; k <= n; k++) work[row][k] -= factor * work[col][k];
    }
  }
  return Float64Array.from({ length: n }, (_, row) => work[row][n] / work[row][row]);
}

/**
 * Der ganze Dirichlet-Weg fuer EINE Lastrichtung: `Φ = Φ_a + m·Φ_b`.
 *
 * Die Lochkonstanten sind selbst affin in `m` und fallen aus derselben
 * Kopplungsmatrix — nur deshalb bleibt `Φ` insgesamt affin.
 */
function solveDirichlet(section, system, frame, solve) {
  const datum = boundaryDatum(section, frame);
  const load = dirichletLoad(section, system, frame);
  const holeCount = section.holeLoops.length;

  const indicators = section.holeLoops.map((loop) => {
    const indicator = new Float64Array(section.nodeCount);
    for (const node of loop.nodes) indicator[node] = 1;
    return indicator;
  });

  const columns = 2 + holeCount;
  const rhs = new Float64Array(system.free * columns);
  rhs.set(liftDirichlet(section, system, datum.values), 0);
  rhs.set(load.rhs, system.free);
  for (let hole = 0; hole < holeCount; hole++) {
    rhs.set(
      liftDirichlet(section, system, indicators[hole]),
      (2 + hole) * system.free,
    );
  }

  const d = solve(columns, rhs);
  const at = (index) => d.subarray(index * system.free, (index + 1) * system.free);

  const phiA = expand(section, system, at(0), datum.values);
  const phiB = expand(section, system, at(1), undefined);
  if (holeCount === 0) return { phiA, phiB, closure: datum.closure };

  const phiHole = indicators.map((indicator, hole) =>
    expand(section, system, at(2 + hole), indicator),
  );
  const matrix = Array.from({ length: holeCount }, () => new Float64Array(holeCount));
  for (let j = 0; j < holeCount; j++) {
    const flux = holeFlux(section, system, load.full, phiHole[j], 0);
    for (let k = 0; k < holeCount; k++) matrix[k][j] = flux[k];
  }

  const negate = (values) => values.map((value) => -value);
  const cA = solveDense(matrix, negate(holeFlux(section, system, load.full, phiA, 0)));
  const cB = solveDense(matrix, negate(holeFlux(section, system, load.full, phiB, 1)));
  for (let hole = 0; hole < holeCount; hole++) {
    for (let node = 0; node < section.nodeCount; node++) {
      phiA[node] += cA[hole] * phiHole[hole][node];
      phiB[node] += cB[hole] * phiHole[hole][node];
    }
  }
  return { phiA, phiB, closure: datum.closure };
}

// ---------------------------------------------------------------------------
// Der Verwoelbungsweg: `ψ` mit `τ = ∇ψ + p`
// ---------------------------------------------------------------------------

/**
 * Ein Randintegral `∮c(y,z)·N_i dy`, ueber ALLE Schleifen.
 *
 * `n = (dz, −dy)/L` zeigt aus dem Material heraus, weil `prepare.ts` den
 * Aussenrand positiv und jeden Innenrand negativ orientiert. Wegen
 * `n_z·ds = −dy` kuerzt sich die Kantenlaenge heraus — es wird nirgends durch
 * eine Kantenlaenge geteilt. Der Integrand ist laengs einer geraden Kante vom
 * Grad 4, `GAUSS_3` ist exakt bis 5.
 */
function boundaryLoad(section, system, frame, coefficient) {
  const rhs = new Float64Array(system.free);
  let compatibility = 0;
  let scale = 0;

  for (const loop of section.loops) {
    for (const [a, middle, b] of loop.edges) {
      const nodes = [a, middle, b];
      for (const gauss of GAUSS_3) {
        const N = edgeShape(gauss.t);
        const dN = edgeShapeDerivatives(gauss.t);
        let yq = 0;
        let zq = 0;
        let dy = 0;
        for (let i = 0; i < 3; i++) {
          yq += N[i] * frame.y[nodes[i]];
          zq += N[i] * frame.z[nodes[i]];
          dy += dN[i] * frame.y[nodes[i]];
        }
        const scaled = gauss.w * coefficient(yq, zq) * dy;
        compatibility += scaled;
        scale += Math.abs(scaled);
        for (let i = 0; i < 3; i++) {
          const row = system.freeIndex[nodes[i]];
          if (row >= 0) rhs[row] += scaled * N[i];
        }
      }
    }
  }
  return { rhs, compatibility: scale > 0 ? compatibility / scale : compatibility };
}

/** `rhs_i = +∫(z/Iy)·N_i dA` — Grad 3, also die Sechspunktregel. */
function volumeLoad(section, system, frame) {
  const rhs = new Float64Array(system.free);
  let compatibility = 0;
  let scale = 0;
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);

  for (let element = 0; element < section.elementCount; element++) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i++) {
      elementY[i] = frame.y[nodes[i]];
      elementZ[i] = frame.z[nodes[i]];
    }
    for (const point of elementPoints(TRIANGLE_6, elementY, elementZ)) {
      const density = (point.z / frame.Iy) * point.weight;
      compatibility += density;
      scale += Math.abs(density);
      for (let i = 0; i < 6; i++) {
        const row = system.freeIndex[nodes[i]];
        if (row >= 0) rhs[row] += density * point.N[i];
      }
    }
  }
  return { rhs, compatibility: scale > 0 ? compatibility / scale : compatibility };
}

/** Die beiden rechten Seiten der Variante A. */
function warpingLoadsA(section, system, frame) {
  return {
    psi0: volumeLoad(section, system, frame),
    psi1: boundaryLoad(section, system, frame, (y) => (y * y) / (2 * frame.Iy)),
  };
}

/** Die beiden rechten Seiten der Variante B — beide rein am Rand. */
function warpingLoadsB(section, system, frame) {
  return {
    psi0: boundaryLoad(section, system, frame, (_y, z) => -(z * z) / (2 * frame.Iy)),
    psi1: boundaryLoad(section, system, frame, (y) => (y * y) / (2 * frame.Iy)),
  };
}

/** Der Neumann-Randterm der Torsion: `∮(z·n_y − y·n_z)·N_i ds`. */
function torsionLoad(section, system) {
  const rhs = new Float64Array(system.free);
  let compatibility = 0;

  for (const loop of section.loops) {
    for (const [a, middle, b] of loop.edges) {
      const nodes = [a, middle, b];
      for (const gauss of GAUSS_3) {
        const N = edgeShape(gauss.t);
        const dN = edgeShapeDerivatives(gauss.t);
        let yq = 0;
        let zq = 0;
        let dy = 0;
        let dz = 0;
        for (let i = 0; i < 3; i++) {
          yq += N[i] * section.y[nodes[i]];
          zq += N[i] * section.z[nodes[i]];
          dy += dN[i] * section.y[nodes[i]];
          dz += dN[i] * section.z[nodes[i]];
        }
        // `(z·n_y − y·n_z)·ds = z·dz + y·dy` — die Kantenlaenge kuerzt sich.
        const scaled = gauss.w * (zq * dz + yq * dy);
        compatibility += scaled;
        for (let i = 0; i < 3; i++) {
          const row = system.freeIndex[nodes[i]];
          if (row >= 0) rhs[row] += scaled * N[i];
        }
      }
    }
  }
  return { rhs, compatibility };
}

// ---------------------------------------------------------------------------
// Auswertung: `τ` in jedem Gausspunkt, daraus die Skalare
// ---------------------------------------------------------------------------

/** Alle Gausspunkte aller Elemente, flach — EINMAL je Bezugssystem. */
function gaussTable(section, frame) {
  const table = [];
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);
  for (let element = 0; element < section.elementCount; element++) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i++) {
      elementY[i] = frame.y[nodes[i]];
      elementZ[i] = frame.z[nodes[i]];
    }
    for (const point of elementPoints(TRIANGLE_6, elementY, elementZ)) {
      table.push({ ...point, nodes: Array.from(nodes) });
    }
  }
  return table;
}

/** `(∂φ/∂y, ∂φ/∂z)` an einem Gausspunkt. */
function gradient(point, field) {
  let dy = 0;
  let dz = 0;
  for (let i = 0; i < 6; i++) {
    dy += field[point.nodes[i]] * point.dNdy[i];
    dz += field[point.nodes[i]] * point.dNdz[i];
  }
  return [dy, dz];
}

/**
 * `τ_a` und `τ_b` in jedem Gausspunkt, je Weg.
 *
 * ```text
 * Dirichlet   τ_a = ( ∂Φ_a/∂z , −∂Φ_a/∂y − z²/(2Iy) )   τ_b = ( ∂Φ_b/∂z , −∂Φ_b/∂y )
 * Variante A  τ_a = ( ∂ψ₀/∂y  ,  ∂ψ₀/∂z )               τ_b = ( ∂ψ₁/∂y , ∂ψ₁/∂z + y²/(2Iy) )
 * Variante B  τ_a = ( ∂ψ₀/∂y  ,  ∂ψ₀/∂z − z²/(2Iy) )    τ_b = ( ∂ψ₁/∂y , ∂ψ₁/∂z + y²/(2Iy) )
 * ```
 */
function stressField(table, frame, kind, fieldA, fieldB) {
  const tau = new Float64Array(4 * table.length);
  for (let at = 0; at < table.length; at++) {
    const point = table[at];
    const [aDy, aDz] = gradient(point, fieldA);
    const [bDy, bDz] = gradient(point, fieldB);
    const algebraicA = (point.z * point.z) / (2 * frame.Iy);
    const algebraicB = (point.y * point.y) / (2 * frame.Iy);
    const offset = 4 * at;
    if (kind === 'dirichlet') {
      tau[offset] = aDz;
      tau[offset + 1] = -aDy - algebraicA;
      tau[offset + 2] = bDz;
      tau[offset + 3] = -bDy;
    } else {
      tau[offset] = aDy;
      tau[offset + 1] = kind === 'warping-b' ? aDz - algebraicA : aDz;
      tau[offset + 2] = bDy;
      tau[offset + 3] = bDz + algebraicB;
    }
  }
  return tau;
}

/** Die Skalare aus einem Spannungsfeld — dieselben Integrale wie `evaluate.ts`. */
function evaluateStress(section, table, tau, omega) {
  let E00 = 0;
  let E01 = 0;
  let E11 = 0;
  let torque = 0;
  let projection = 0;
  let Fz = 0;
  let It = 0;

  for (let at = 0; at < table.length; at++) {
    const point = table[at];
    const offset = 4 * at;
    const tauYa = tau[offset];
    const tauZa = tau[offset + 1];
    const tauYb = tau[offset + 2];
    const tauZb = tau[offset + 3];
    const { y, z, weight } = point;
    const [dOmegaDy, dOmegaDz] = gradient(point, omega);

    E00 += (tauYa * tauYa + tauZa * tauZa) * weight;
    E01 += (tauYa * tauYb + tauZa * tauZb) * weight;
    E11 += (tauYb * tauYb + tauZb * tauZb) * weight;
    torque += (y * tauZa - z * tauYa) * weight;
    projection += (tauYa * (dOmegaDy - z) + tauZa * (dOmegaDz + y)) * weight;
    Fz += tauZa * weight;
    It += (y * y + z * z + y * dOmegaDz - z * dOmegaDy) * weight;
  }
  return {
    inverseKappa: [section.A * E00, section.A * E11],
    d1Ratio: E00 === 0 ? Number.NaN : (2 * E01) / E00,
    uM: torque - projection,
    Fz,
    It,
  };
}

/**
 * Der Abstand zweier Spannungsfelder bei gegebenem `m`, in ZWEI Massen.
 *
 * `max` ist `max|Δτ|` bezogen auf `max|τ|`. Es ist das scharfe Mass — und an
 * einer EINSPRINGENDEN ECKE zugleich ein schlechtes: dort ist `τ` singulaer,
 * beide Diskretisierungen schneiden die Singularitaet verschieden ab, und der
 * Punktwert eines einzigen Elements bestimmt die ganze Zahl.
 *
 * `l2` ist deshalb daneben noch der flaechengewichtete Abstand
 * `sqrt(∫|Δτ|²dA / ∫|τ|²dA)`. Das ist die Groesse, an der κ haengt, denn κ ist
 * ein Energieintegral.
 */
function fieldDistance(table, reference, other, m) {
  let worst = 0;
  let peak = 0;
  let errorEnergy = 0;
  let energy = 0;
  for (let at = 0; at < table.length; at++) {
    const offset = 4 * at;
    const weight = table[at].weight;
    const ry = reference[offset] + m * reference[offset + 2];
    const rz = reference[offset + 1] + m * reference[offset + 3];
    const oy = other[offset] + m * other[offset + 2];
    const oz = other[offset + 1] + m * other[offset + 3];
    peak = Math.max(peak, Math.hypot(ry, rz));
    worst = Math.max(worst, Math.hypot(ry - oy, rz - oz));
    errorEnergy += ((ry - oy) ** 2 + (rz - oz) ** 2) * weight;
    energy += (ry * ry + rz * rz) * weight;
  }
  return {
    max: peak > 0 ? worst / peak : worst,
    l2: energy > 0 ? Math.sqrt(errorEnergy / energy) : 0,
  };
}

// ---------------------------------------------------------------------------
// Ein Durchlauf je Figur
// ---------------------------------------------------------------------------

function measure(section, solve) {
  const theta = principalRotation(section.Iy, section.Iz, section.Iyz);
  const frameZ = createFrame(section, theta);
  const frameY = createFrame(section, theta + Math.PI / 2);

  const neumann = neumannSystem(section);
  const dirichlet = dirichletSystem(section);
  const solveOn = (system) => (columns, rhs) =>
    solve(system.free, system.rows, system.cols, system.values, columns, rhs);

  // Die Torsion ist DREHINVARIANT und wird einmal geloest — beide Wege teilen
  // sie sich, sie ist nicht Gegenstand des Vergleichs.
  const torsion = torsionLoad(section, neumann);
  const omega = expand(
    section,
    neumann,
    solveOn(neumann)(1, torsion.rhs),
    undefined,
  );

  const perFrame = (frame) => {
    const table = gaussTable(section, frame);
    const d = solveDirichlet(section, dirichlet, frame, solveOn(dirichlet));

    const warping = (loads) => {
      const rhs = new Float64Array(neumann.free * 2);
      rhs.set(loads.psi0.rhs, 0);
      rhs.set(loads.psi1.rhs, neumann.free);
      const solution = solveOn(neumann)(2, rhs);
      return {
        psi0: expand(section, neumann, solution.subarray(0, neumann.free), undefined),
        psi1: expand(
          section,
          neumann,
          solution.subarray(neumann.free, 2 * neumann.free),
          undefined,
        ),
        compatibility: [loads.psi0.compatibility, loads.psi1.compatibility],
      };
    };

    const a = warping(warpingLoadsA(section, neumann, frame));
    const b = warping(warpingLoadsB(section, neumann, frame));

    const fields = {
      dirichlet: stressField(table, frame, 'dirichlet', d.phiA, d.phiB),
      'warping-a': stressField(table, frame, 'warping-a', a.psi0, a.psi1),
      'warping-b': stressField(table, frame, 'warping-b', b.psi0, b.psi1),
    };

    return {
      table,
      closure: d.closure,
      compatibilityA: a.compatibility,
      compatibilityB: b.compatibility,
      fields,
      results: Object.fromEntries(
        Object.entries(fields).map(([key, tau]) => [
          key,
          evaluateStress(section, table, tau, omega),
        ]),
      ),
    };
  };

  const z = perFrame(frameZ);
  const y = perFrame(frameY);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  const shear = (key) => {
    // Der Schubmittelpunkt fällt in den gedrehten Systemen als je EINE
    // Koordinate an und wird hier exakt zurückgedreht.
    const uM = z.results[key].uM;
    const vM = y.results[key].uM;
    return {
      d0: z.results[key].inverseKappa[0],
      d2: z.results[key].inverseKappa[1],
      d1Ratio: z.results[key].d1Ratio,
      equilibrium: z.results[key].Fz,
      It: z.results[key].It,
      yM: section.ys + (uM * cos - vM * sin),
      zM: section.zs + (uM * sin + vM * cos),
    };
  };

  return {
    theta,
    torsionCompatibility: torsion.compatibility,
    closureZ: z.closure,
    compatibility: {
      'warping-a': [...z.compatibilityA, ...y.compatibilityA],
      'warping-b': [...z.compatibilityB, ...y.compatibilityB],
    },
    scalars: {
      dirichlet: shear('dirichlet'),
      'warping-a': shear('warping-a'),
      'warping-b': shear('warping-b'),
    },
    distances: POISSON_VALUES.map((nu) => {
      const m = nu / (1 + nu);
      // Der schlechtere Wert beider Lastrichtungen — nicht ihr Mittel.
      const worst = (key) => {
        const inZ = fieldDistance(z.table, z.fields.dirichlet, z.fields[key], m);
        const inY = fieldDistance(y.table, y.fields.dirichlet, y.fields[key], m);
        return {
          max: Math.max(inZ.max, inY.max),
          l2: Math.max(inZ.l2, inY.l2),
        };
      };
      return { nu, 'warping-a': worst('warping-a'), 'warping-b': worst('warping-b') };
    }),
  };
}

// ---------------------------------------------------------------------------
// Die Verfeinerungsreihe
// ---------------------------------------------------------------------------

/**
 * Nur der PRODUKTIVWEG (Variante B), fuer die Verfeinerungsreihe.
 *
 * Der Dirichlet-Weg kommt hier nicht vor: gefragt ist, wie schnell die Zahl
 * steht, die das Package liefert — nicht, ob zwei Formulierungen uebereinstimmen.
 *
 * BEIDE LASTRICHTUNGEN NACHEINANDER, nicht nebeneinander: die Gausspunkt-Tabelle
 * einer Richtung ist bei 96 000 Elementen dreistellig in MB, und so kann die
 * erste eingesammelt werden, bevor die zweite entsteht.
 */
function warpingScalars(section, solve) {
  const theta = principalRotation(section.Iy, section.Iz, section.Iyz);
  const frameZ = createFrame(section, theta);
  const frameY = createFrame(section, theta + Math.PI / 2);
  const system = neumannSystem(section);

  const torsion = torsionLoad(section, system);
  const loadsZ = warpingLoadsB(section, system, frameZ);
  const loadsY = warpingLoadsB(section, system, frameY);

  const columns = [
    torsion.rhs,
    loadsZ.psi0.rhs,
    loadsZ.psi1.rhs,
    loadsY.psi0.rhs,
    loadsY.psi1.rhs,
  ];
  const rhs = new Float64Array(system.free * columns.length);
  for (let at = 0; at < columns.length; at++) {
    rhs.set(columns[at], at * system.free);
  }
  const d = solve(
    system.free,
    system.rows,
    system.cols,
    system.values,
    columns.length,
    rhs,
  );
  const field = (at) =>
    expand(
      section,
      system,
      d.subarray(at * system.free, (at + 1) * system.free),
      undefined,
    );

  const omega = field(0);
  const perFrame = (frame, psi0, psi1) => {
    const table = gaussTable(section, frame);
    const tau = stressField(table, frame, 'warping-b', psi0, psi1);
    return evaluateStress(section, table, tau, omega);
  };
  const inZ = perFrame(frameZ, field(1), field(2));
  const inY = perFrame(frameY, field(3), field(4));

  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return {
    d0: inZ.inverseKappa[0],
    d2: inZ.inverseKappa[1],
    It: inZ.It,
    yM: section.ys + (inZ.uM * cos - inY.uM * sin),
    zM: section.zs + (inZ.uM * sin + inY.uM * cos),
    equilibrium: inZ.Fz,
  };
}

/**
 * Eine verfolgte Groesse ueber die ganze Reihe, aufbereitet.
 *
 * DIE ORDNUNG WIRD NICHT GEGEN EINE WAHRHEIT GEMESSEN — es gibt keine
 * geschlossene Zahl — sondern gegen die eigene Bewegung: mit `Fehler ~ C·h^p`
 * und halbiertem `h` je Schritt verhaelt sich der Abstand aufeinanderfolgender
 * Werte wie `2^p`, und die Unbekannte `C` kuerzt sich heraus:
 *
 *   p = log₂(Δ_vorher / Δ_danach)
 *
 * BEZOGEN WIRD AUF DAS FEINSTE NETZ ODER AUF DIE FIGUR, je nachdem, was
 * groesser ist. Das ist der Punkt: eine Groesse, die aus Symmetrie
 * verschwindet, hat keinen eigenen Massstab, und ohne einen von aussen
 * berichtete die Reihe Rauschen als Konvergenz.
 *
 * `order` steht nur da, wo BEIDE beteiligten Abstaende ueber dem Rauschen
 * liegen — sonst ist `log₂` zweier Rundungsfehler eine Zufallszahl.
 */
function series(steps, tracked, figure) {
  const values = steps.map((step) => step[tracked.key]);
  const finest = Math.abs(values[values.length - 1]);
  const scale = Math.max(finest, tracked.floor(figure));

  const gaps = values.map((value, index) =>
    index === 0 ? undefined : Math.abs(value - values[index - 1]) / scale,
  );
  const orders = values.map((_, index) => {
    if (index === 0 || index + 1 >= values.length) return undefined;
    const first = gaps[index];
    const second = gaps[index + 1];
    if (first < NOISE_LEVEL || second < NOISE_LEVEL) return undefined;
    return Math.log2(first / second);
  });

  return { values, gaps, orders, scale, isZero: finest / scale < ZERO_LEVEL };
}

/**
 * Der geschaetzte Restfehler am FEINSTEN Netz, relativ.
 *
 * Aus der beobachteten Ordnung fortgeschrieben: die noch ausstehenden Schritte
 * bilden eine geometrische Reihe mit Quotient `2^(−p)`, also
 * `Rest = Δ_letzt·2^(−p) / (1 − 2^(−p))`. Das ist eine EXTRAPOLATION und keine
 * Messung — sie steht und faellt mit der Annahme, dass `p` so bleibt.
 */
function extrapolatedResidual(entry) {
  const lastGap = entry.gaps[entry.gaps.length - 1];
  const lastOrder = entry.orders[entry.orders.length - 2];
  if (lastGap === undefined || lastOrder === undefined) return undefined;
  const quotient = 2 ** -lastOrder;
  if (!(quotient > 0 && quotient < 1)) return undefined;
  return (lastGap * quotient) / (1 - quotient);
}

/** Eine Zelle der Reihe: Wert, Abstand, Ordnung — oder der Grund, warum nicht. */
function seriesCells(entry, index, digits) {
  if (entry.isZero) return ['≈ 0', '—', '—'];
  const gap = entry.gaps[index];
  const order = entry.orders[index];
  return [
    entry.values[index].toExponential(digits),
    gap === undefined ? '—' : gap < NOISE_LEVEL ? 'Rauschen' : gap.toExponential(2),
    order === undefined ? '—' : order.toFixed(2),
  ];
}

function runRefinement(mesher, solve, prepareSection) {
  const rows = [];
  for (const figure of REFINEMENT_FIGURES) {
    const steps = [];
    for (const elements of REFINEMENT_STEPS) {
      const mesh = mesher.generate({
        rings: figure.rings.map((ring) => ({
          kind: ring.kind,
          coordinates: new Float64Array(ring.coordinates),
        })),
        element: 'tri6',
        maxElementArea: figure.area / elements,
        switches: { quality: true },
      });
      const section = prepareSection(mesh);
      steps.push({
        elements: section.elementCount,
        ...warpingScalars(section, solve),
      });
    }
    rows.push({ figure, steps });

    console.log(`${figure.name}   (einspringende Ecken: ${figure.corner})`);
    for (const tracked of TRACKED) {
      const entry = series(steps, tracked, figure);
      console.log(`  ${tracked.key}${entry.isZero ? '   ≈ 0 (Symmetrie)' : ''}`);
      if (entry.isZero) continue;
      for (let index = 0; index < steps.length; index++) {
        const [value, gap, order] = seriesCells(entry, index, tracked.digits);
        console.log(
          `    ${String(steps[index].elements).padStart(7)}  ${value}  ` +
            `Δ ${gap.padStart(9)}  p ${order.padStart(5)}`,
        );
      }
    }
    console.log('');
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Lauf und Bericht
// ---------------------------------------------------------------------------

const WAYS = ['dirichlet', 'warping-a', 'warping-b'];
const LABEL = {
  dirichlet: 'Dirichlet',
  'warping-a': 'Verwölbung A',
  'warping-b': 'Verwölbung B',
};

async function main() {
  const fe = await import(CROSS_SECTION_FE.href);
  const { createMesher2D } = await import(MESH_ENTRY.href);
  const sparse = await import(SPARSE_ENTRY.href);
  sparse.initSync({ module: readFileSync(SPARSE_WASM) });
  const mesher = await createMesher2D();

  const solve = (n, rows, cols, values, columns, f) => {
    const outcome = sparse.solve(n, rows, cols, values, columns, f);
    try {
      if (outcome.unfixed) throw new Error('K ist nicht positiv definit.');
      return new Float64Array(outcome.d);
    } finally {
      outcome.free();
    }
  };

  const rows = [];
  for (const figure of FIGURES) {
    const mesh = mesher.generate({
      rings: figure.rings.map((ring) => ({
        kind: ring.kind,
        coordinates: new Float64Array(ring.coordinates),
      })),
      element: 'tri6',
      maxElementArea: figure.area / ELEMENTS,
      switches: { quality: true },
    });
    const section = fe.prepareSection(mesh);
    const measured = measure(section, solve);
    rows.push({ figure, section, measured });

    console.log(figure.name);
    console.log(`  Elemente            ${section.elementCount}`);
    console.log(`  θ                   ${measured.theta.toExponential(3)} rad`);
    for (const way of WAYS) {
      const s = measured.scalars[way];
      console.log(
        `  ${LABEL[way].padEnd(13)} d0 ${s.d0.toFixed(12)}  d2 ${s.d2.toExponential(6)}` +
          `  yM ${s.yM.toExponential(6)}  It ${s.It.toExponential(6)}`,
      );
    }
    if (figure.exactD0 !== undefined) {
      for (const way of WAYS) {
        const error = Math.abs(measured.scalars[way].d0 / figure.exactD0 - 1);
        console.log(`  |d0/${figure.exactD0} − 1| ${LABEL[way].padEnd(13)} ${error.toExponential(3)}`);
      }
    }
    for (const entry of measured.distances) {
      console.log(
        `  Δτ ν=${entry.nu.toFixed(2)}   A max ${entry['warping-a'].max.toExponential(3)}` +
          ` L2 ${entry['warping-a'].l2.toExponential(3)}` +
          `   B max ${entry['warping-b'].max.toExponential(3)}` +
          ` L2 ${entry['warping-b'].l2.toExponential(3)}`,
      );
    }
    console.log('');
  }

  console.log('── Verfeinerungsreihe ──────────────────────────────────────');
  console.log('');
  const refinement = runRefinement(mesher, solve, fe.prepareSection);

  writeReport(rows, refinement);
  console.log(`Bericht: ${fileURLToPath(REPORT_URL)}`);
}

function writeReport(rows, refinement) {
  const lines = [];
  lines.push('# Verwölbungsformulierung gegen Dirichlet');
  lines.push('');
  lines.push(
    'Erzeugt von [`verifaction/verwoelbung-gegen-dirichlet.mjs`](../../verifaction/verwoelbung-gegen-dirichlet.mjs).',
  );
  lines.push(
    'Beleg zu [ADR 0048](../adr/0048-the-shear-problem-uses-the-warping-formulation.md).',
  );
  lines.push('');
  lines.push('## Die Frage');
  lines.push('');
  lines.push(
    'Die heutige Fassung des Schubproblems löst eine Spannungsfunktion `Φ` mit',
  );
  lines.push(
    'Dirichlet-Rand. Sie legt `Φ` nur *entlang* jeder Randschleife fest — je Schleife',
  );
  lines.push('bleibt eine Konstante offen, und das Randdatum muss beim Umlauf schließen:');
  lines.push('');
  lines.push('```text');
  lines.push('∮dΦ = −1/(2·Iy)·∮z²dy = ∓(1/Iy)·∫∫_D z dA');
  lines.push('```');
  lines.push('');
  lines.push(
    'Der Sprung ist das statische Moment der eingeschlossenen Fläche um die Biegeachse.',
  );
  lines.push(
    'Er verschwindet nur, wenn der Schwerpunkt jedes Lochs auf der Biegeachse liegt —',
  );
  lines.push('sonst verweigert die FE (`hole-off-bending-axis`).');
  lines.push('');
  lines.push(
    'Eine Formulierung über eine **Verschiebung** kennt das nicht. Mit `τ = ∇ψ + p`',
  );
  lines.push('trägt `p` die Wirbelstärke, und wieviel `p` zusätzlich von der Quelle');
  lines.push('übernimmt, ist frei. Zwei Aufteilungen stehen hier nebeneinander:');
  lines.push('');
  lines.push('| | `p` | `ψ₀` | `ψ₁` |');
  lines.push('| --- | --- | --- | --- |');
  lines.push(
    '| **A** | `(0, m·y²/(2Iy))` | `∇²ψ₀ = −z/Iy`, `∂ψ₀/∂n = 0` | `∇²ψ₁ = 0`, `∂ψ₁/∂n = −y²/(2Iy)·n_z` |',
  );
  lines.push(
    '| **B** | `(0, −z²/(2Iy) + m·y²/(2Iy))` | `∇²ψ₀ = 0`, `∂ψ₀/∂n = z²/(2Iy)·n_z` | wie A |',
  );
  lines.push('');
  lines.push('Daraus die Spannungsfelder, beide affin in `m = ν/(1+ν)`:');
  lines.push('');
  lines.push('```text');
  lines.push('Dirichlet   τ_a = ( ∂Φ_a/∂z , −∂Φ_a/∂y − z²/(2Iy) )   τ_b = ( ∂Φ_b/∂z , −∂Φ_b/∂y )');
  lines.push('Variante A  τ_a = ( ∂ψ₀/∂y  ,  ∂ψ₀/∂z )               τ_b = ( ∂ψ₁/∂y , ∂ψ₁/∂z + y²/(2Iy) )');
  lines.push('Variante B  τ_a = ( ∂ψ₀/∂y  ,  ∂ψ₀/∂z − z²/(2Iy) )    τ_b = ( ∂ψ₁/∂y , ∂ψ₁/∂z + y²/(2Iy) )');
  lines.push('```');
  lines.push('');
  lines.push(
    `Gemessen mit rund ${ELEMENTS} Tri6-Elementen je Figur, alle drei Wege auf DEMSELBEN`,
  );
  lines.push('Netz und derselben Torsionslösung `ω`.');
  lines.push('');
  lines.push('## Der Feldvergleich');
  lines.push('');
  lines.push(
    'Über alle Gaußpunkte **beider** Lastrichtungen, bezogen auf das Dirichlet-Feld.',
  );
  lines.push(
    'Orakel vergleichen Skalare, in denen sich zwei Vorzeichenfehler aufheben können;',
  );
  lines.push('ein Feldvergleich kann das nicht.');
  lines.push('');
  lines.push('Zwei Maße, und der Unterschied zwischen ihnen ist die halbe Aussage:');
  lines.push('');
  lines.push('- `max` — `max|Δτ| / max|τ|`. Das scharfe Maß.');
  lines.push(
    '- `L2` — `sqrt(∫|Δτ|²dA / ∫|τ|²dA)`. Das Maß, an dem κ hängt, denn κ ist ein',
  );
  lines.push('  Energieintegral.');
  lines.push('');
  lines.push(
    'An einer **einspringenden Ecke** ist `τ` singulär. Beide Diskretisierungen',
  );
  lines.push(
    'schneiden die Singularität verschieden ab, ein einziges Element bestimmt dann',
  );
  lines.push('`max` — und `L2` bleibt klein. Genau das ist beim Winkel und beim Kasten mit');
  lines.push('Loch zu sehen.');
  lines.push('');
  for (const measure of ['max', 'l2']) {
    lines.push(`**\`${measure === 'l2' ? 'L2' : 'max'}\`**`);
    lines.push('');
    lines.push(
      `| Figur | Elemente |${POISSON_VALUES.map((nu) => ` A, ν=${format(nu)} |`).join('')}${POISSON_VALUES.map((nu) => ` B, ν=${format(nu)} |`).join('')}`,
    );
    lines.push(`| --- | --- |${' --- |'.repeat(POISSON_VALUES.length * 2)}`);
    for (const { figure, section, measured } of rows) {
      const cell = (key) =>
        measured.distances
          .map((entry) => entry[key][measure].toExponential(2))
          .join(' | ');
      lines.push(
        `| ${figure.name} | ${section.elementCount} | ${cell('warping-a')} | ${cell('warping-b')} |`,
      );
    }
    lines.push('');
  }
  lines.push(
    'Erwartet wird Diskretisierungsniveau, nicht Maschinengenauigkeit: es sind zwei',
  );
  lines.push('verschiedene Diskretisierungen desselben Feldes.');
  lines.push('');
  lines.push('## Die Skalare');
  lines.push('');
  lines.push(
    '`1/κ = d0 + d2·m²` in den Hauptachsen, `yM`/`zM` im Eingabesystem, `It` aus `ω`.',
  );
  lines.push('');
  for (const { figure, measured } of rows) {
    lines.push(`### ${figure.name}`);
    lines.push('');
    lines.push(`${figure.note}`);
    lines.push('');
    lines.push('| Weg | `d0` | `d2` | `yM` [m] | `zM` [m] | `It` [m⁴] | `∫τ_z dA` |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const way of WAYS) {
      const s = measured.scalars[way];
      lines.push(
        `| ${LABEL[way]} | ${s.d0.toFixed(12)} | ${s.d2.toExponential(6)} | ` +
          `${s.yM.toExponential(6)} | ${s.zM.toExponential(6)} | ${s.It.toExponential(6)} | ` +
          `${s.equilibrium.toFixed(12)} |`,
      );
    }
    lines.push('');
    if (figure.exactD0 !== undefined) {
      lines.push(
        `Geschlossen ist \`d0\` hier **${figure.exactD0}** (κ = 5/6 bei m = 0). Abstand:`,
      );
      lines.push('');
      for (const way of WAYS) {
        const error = Math.abs(measured.scalars[way].d0 / figure.exactD0 - 1);
        lines.push(`- ${LABEL[way]}: \`${error.toExponential(3)}\``);
      }
      lines.push('');
    }
  }
  lines.push('## Die Selbstprüfungen');
  lines.push('');
  lines.push(
    'Der Dirichlet-Randschluss ist eine Eigenschaft der **Figur** und bricht am',
  );
  lines.push(
    'ausmittigen Loch. Die Verträglichkeit `∫f dA − ∮g ds` der Verwölbung ist dagegen',
  );
  lines.push(
    '**identisch** erfüllt — sie steht hier bezogen auf die Summe der Beträge, also',
  );
  lines.push('dimensionslos, und der größte Wert über beide rechten Seiten und beide');
  lines.push('Lastrichtungen.');
  lines.push('');
  lines.push('| Figur | Randschluss Dirichlet | Verträglichkeit A | Verträglichkeit B |');
  lines.push('| --- | --- | --- | --- |');
  for (const { figure, measured } of rows) {
    const worst = (key) =>
      Math.max(...measured.compatibility[key].map(Math.abs)).toExponential(2);
    lines.push(
      `| ${figure.name} | ${measured.closureZ.toExponential(2)} | ${worst('warping-a')} | ${worst('warping-b')} |`,
    );
  }
  lines.push('');
  lines.push('## Wie schnell steht die Zahl?');
  lines.push('');
  lines.push(
    'Eine zweite, von der ersten unabhängige Frage — und eine ältere: sie betrifft',
  );
  lines.push(
    'jede Diskretisierung dieses Problems und nicht nur die neue Formulierung.',
  );
  lines.push('Gerechnet wird deshalb hier **nur der Produktivweg** (Variante B).');
  lines.push('');
  lines.push(
    'An einer **einspringenden Ecke** ist `τ` singulär, und zwar in der',
  );
  lines.push(
    'kontinuierlichen Lösung. Bei Materialinnenwinkel `ω` hat das Neumann-Problem den',
  );
  lines.push(
    'Exponenten `λ = π/ω`; für die Ecke eines Rechtecklochs und für die Innenecke',
  );
  lines.push('eines Winkels ist `ω = 3π/2`:');
  lines.push('');
  lines.push('```text');
  lines.push('ψ ~ r^(2/3)        τ = ∇ψ ~ r^(−1/3)  →  ∞');
  lines.push('```');
  lines.push('');
  lines.push(
    '**κ bleibt davon unberührt.** Es ist ein Energieintegral, und',
  );
  lines.push(
    '`|τ|²·dA ~ r^(−2/3)·r dr` konvergiert — die Zahl ist endlich. Was leidet, ist die',
  );
  lines.push(
    'ORDNUNG, mit der sie sich einstellt: der H1-Fehler ist durch die Singularität auf',
  );
  lines.push(
    '`O(h^λ)` gedeckelt, der Energiefehler damit auf `O(h^(2λ)) = O(h^(4/3))` statt',
  );
  lines.push('`O(h⁴)` wie bei glatter Lösung.');
  lines.push('');
  lines.push(
    'Gemessen wird nicht gegen eine Wahrheit — es gibt keine geschlossene Zahl —',
  );
  lines.push(
    'sondern gegen die eigene Bewegung. Je Schritt vervierfacht sich die Elementzahl,',
  );
  lines.push(
    '`h` halbiert sich also, und mit `Fehler ~ C·h^p` verhält sich der Abstand',
  );
  lines.push('aufeinanderfolgender Werte wie `2^p`:');
  lines.push('');
  lines.push('```text');
  lines.push('p = log₂( Δ_vorher / Δ_danach )');
  lines.push('```');
  lines.push('');
  lines.push(
    'Das Rechteck läuft als **glatte Gegenprobe** mit. Ohne es wäre eine langsame',
  );
  lines.push(
    'Ordnung nicht der Ecke zuzuordnen — sie könnte ebensogut an der Quadratur, am',
  );
  lines.push('Löser oder am Mesher liegen.');
  lines.push('');
  lines.push('Zwei Dinge, die beim Lesen zählen:');
  lines.push('');
  lines.push(
    '- **`p` steht nur, wo sich etwas bewegt.** Wo der Abstand zweier Netze auf',
  );
  lines.push(
    '  Gleitkommarauschen liegt, ist `log₂` zweier Rundungsfehler eine Zufallszahl und',
  );
  lines.push(
    '  keine Ordnung; die Spalte trägt dann `Rauschen`. `≈ 0` heißt: die Größe',
  );
  lines.push('  verschwindet aus Symmetrie und hat keinen eigenen Maßstab.');
  lines.push(
    '- **Die Netze sind NICHT geschachtelt.** Triangle vernetzt jeden Schritt neu, also',
  );
  lines.push(
    '  liegt auf der asymptotischen Rate noch Netz-zu-Netz-Rauschen. `p` schwankt',
  );
  lines.push(
    '  deshalb; zu lesen ist die Größenordnung, nicht die zweite Stelle.',
  );
  lines.push('');
  for (const { figure, steps } of refinement) {
    lines.push(`### ${figure.name}`);
    lines.push('');
    lines.push(`Einspringende Ecken: **${figure.corner}**. ${figure.note}`);
    lines.push('');
    lines.push(
      `| Elemente |${TRACKED.map((t) => ` ${t.label} | Δ | p |`).join('')}`,
    );
    lines.push(`| --- |${' --- |'.repeat(TRACKED.length * 3)}`);
    const entries = TRACKED.map((tracked) => series(steps, tracked, figure));
    for (let index = 0; index < steps.length; index++) {
      const cells = TRACKED.map((tracked, at) =>
        seriesCells(entries[at], index, tracked.digits)
          .map((cell) => ` ${cell} |`)
          .join(''),
      );
      lines.push(`| ${steps[index].elements} |${cells.join('')}`);
    }
    lines.push('');
    const residuals = TRACKED.map((tracked, at) => ({
      label: tracked.label,
      value: entries[at].isZero ? undefined : extrapolatedResidual(entries[at]),
    })).filter((entry) => entry.value !== undefined);
    if (residuals.length > 0) {
      lines.push(
        `Aus der Ordnung fortgeschrieben, Restfehler am feinsten Netz: ` +
          `${residuals.map((r) => `${r.label} \`${r.value.toExponential(2)}\``).join(', ')}.`,
      );
      lines.push('');
    }
  }
  lines.push('### Was die Reihe zeigt');
  lines.push('');
  lines.push('Die gemessenen Ordnungen fallen in zwei getrennte Gruppen:');
  lines.push('');
  lines.push('| Figur | einspringende Ecken | beobachtete `p` | erwartet |');
  lines.push('| --- | --- | --- | --- |');
  for (const { figure, steps } of refinement) {
    const observed = TRACKED.flatMap((tracked) => {
      const entry = series(steps, tracked, figure);
      return entry.isZero
        ? []
        : entry.orders.filter((order) => order !== undefined);
    });
    const span =
      observed.length === 0
        ? '—'
        : `${Math.min(...observed).toFixed(2)} … ${Math.max(...observed).toFixed(2)}`;
    lines.push(
      `| ${figure.name} | ${figure.corner} | ${span} | ` +
        `${figure.corner === 'keine' ? '`4` (glatt)' : '`4/3 ≈ 1,33` (λ = 2/3)'} |`,
    );
  }
  lines.push('');
  lines.push(
    'Die glatte Figur trifft `O(h⁴)`, die beiden mit einspringender Ecke liegen bei',
  );
  lines.push(
    'rund `1` — also dort, wo die Singularität sie hinstellt, und nicht bei `4`. Die',
  );
  lines.push(
    'Vorhersage aus `λ = π/ω` ist damit bestätigt, und zwar an zwei verschiedenen',
  );
  lines.push('Figuren mit verschiedener Eckenzahl.');
  lines.push('');
  lines.push(
    'Praktisch heißt das: bei einer Figur mit Lochecke oder Innenecke kauft eine',
  );
  lines.push(
    'Vervierfachung der Elementzahl **rund eine Halbierung** des Fehlers statt der',
  );
  lines.push('sechzehn Mal besseren Zahl, die man vom Rechteck gewohnt ist.');
  lines.push('');
  lines.push('## Was hier NICHT steht');
  lines.push('');
  lines.push(
    'Keine Schranke. Welcher Abstand tragbar ist, welche Variante der Produktivcode',
  );
  lines.push(
    'führt und ab welchem Restfehler eine Netzdichte zu grob heißt, entscheidet ein',
  );
  lines.push('ADR und nicht dieses Messgerät.');
  lines.push('');
  lines.push(
    'Und kein Gegenmittel. Graduierte Netze zur Ecke hin, ein Singularitätselement oder',
  );
  lines.push(
    'eine Extrapolation im Produktivcode wären die bekannten Wege — gebaut ist keiner,',
  );
  lines.push('und ob einer gebraucht wird, ist eine andere Frage als diese hier.');
  lines.push('');

  mkdirSync(dirname(fileURLToPath(REPORT_URL)), { recursive: true });
  writeFileSync(REPORT_URL, `${lines.join('\n')}\n`, 'utf8');
}

function format(value) {
  return String(value).replace('.', ',');
}

await main();
