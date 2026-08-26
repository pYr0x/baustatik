import {
  createSectionGeometry,
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
} from '@baustatik/cross-section';
import { atOrThrow } from '@baustatik/core';
import type { FEFields } from '@baustatik/cross-section-fe';
import {
  recoverStresses,
  type FEStressField,
  type StressAtNode,
} from '@baustatik/cross-section-fe';
import type { Mesh2DResult } from '@baustatik/mesh-2d-wasm';
import type { SectionForces } from '@baustatik/section-forces';
import { convert } from '@baustatik/units';
import {
  DIVERGING_SCALE,
  SEQUENTIAL_SCALE,
  legendGradientCss,
  sampleColor,
  type ColorScale,
  type Range,
} from './stress-colormaps';
import { computeFESection } from './cross-section-fe-port';
import { OUTLINE_PRESETS, type OutlinePreset } from './outline-presets';
import { createStressFeRelief, type StressFeRelief } from './stress-fe-3d';

// ---------------------------------------------------------------------------
// Die dritte Seite derselben Figurenwelt — als FELD statt als Punkte.
//
// Der Querschnitt kommt aus den Vorgaben der Seite „Umriss-Querschnitte“ und
// ist per Dropdown wählbar; seine Abmessungen bleiben fest. Nur die
// Schnittgrößen und die Netzdichte sind sonst Eingabe. Die Schnittgrößen
// gehen NICHT in die FE-Rechnung ein — die Felder ψ/ω hängen allein an der
// Figur, der Netzdichte und an ν; sie werden deshalb EINMAL je Figur UND
// Netzdichte asynchron im Worker gerechnet (vernetzen und faktorisieren,
// ADR 0039/0047) und danach bei jeder Eingabeänderung nur noch aus den
// gelösten Feldern ausgewertet — `recoverStresses`, rein und synchron, die
// zweite Tür (ADR 0061). Ein Presetwechsel verwirft die alte Lösung nach
// demselben Muster wie der Slider: neue Version, neuer Lauf.
//
// ZWEI AUSWERTUNGEN DESSELBEN DURCHLAUFS: die gemittelte Knotenform
// (Nachweisform, trägt den Rand) und das Rohbild der Elementschwerpunkte
// (punktweise im Inneren am genauesten, erreicht den Rand nie). Beide fallen
// in recoverStresses gemeinsam an; der Umschalter wählt nur, welche von ihnen
// gezeichnet wird und aus der die Extremwertkarten lesen.
//
// NU IST FEST 0: m = ν/(1+ν) = 0, der m-Anteil der Schubfelder trägt nichts.
// ---------------------------------------------------------------------------

/** Die Poissonzahl der Seite — fest, nicht Eingabe. */
const NU = 0;

const M2_TO_CM2 = convert(1).from('m^2').toExact('cm^2');
const M4_TO_CM4 = convert(1).from('m^4').toExact('cm^4');

/**
 * Die Netzdichten des Sliders — Stufen statt freier Zahl, damit jeder Ruck
 * eine spürbar andere Verfeinerung zeigt. Voreingestellt ist Stufe 4 mit
 * 4000 Elementen, die Zahl, bei der das Rechteck seine scharfe κ-Zahl hält
 * (`DEFAULT_SECTION_POLICY.FEElements`).
 */
const FE_ELEMENT_STEPS: readonly number[] = Object.freeze([
  50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000, 40000,
]);
const DEFAULT_FE_STEP_INDEX = 6;

/**
 * Strukturgleich zwischen Knoten- und Elementform: beide exportierten Typen
 * tragen dieselben sieben Zahlen, nur `nr` bedeutet einmal einen Knoten und
 * einmal ein Element (ADR 0061).
 */
type StressSample = Pick<
  StressAtNode,
  'nr' | 'y' | 'z' | 'sigma' | 'tauY' | 'tauZ' | 'sigmaV'
>;

type EvalMode = 'nodes' | 'elements';

/**
 * Das gelöste Problem — TRANSIENT wie das Netz selbst (ADR 0039). Es wird
 * hier bewusst NICHT in den Satz zurückgeschrieben: diese Seite speichert
 * nichts, sie zeigt.
 */
let solution: {
  readonly mesh: Mesh2DResult;
  readonly fields: FEFields;
  readonly seconds: number;
} | null = null;

/** Ein Lauf nach dem anderen; während des Laufs geforderte Änderungen setzen `rerunNeeded`. */
let running = false;
let rerunNeeded = false;
/**
 * Zähler jeder Anforderung, die einen neuen Lauf nötig macht (Netzdichte,
 * Preset) — ein Ergebnis unter veralteter Version wird verworfen.
 */
let runVersion = 0;
let feStepIndex = DEFAULT_FE_STEP_INDEX;
let evalMode: EvalMode = 'nodes';
/** Die dünnen schwarzen Tri6-Kanten — standardmäßig AUS; ausgeschaltet spart sie auch ihren Aufbau. */
let showMesh = false;

// DOM
const inpN = document.getElementById('inp-n') as HTMLInputElement;
const inpVz = document.getElementById('inp-vz') as HTMLInputElement;
const inpMy = document.getElementById('inp-my') as HTMLInputElement;
const inpVy = document.getElementById('inp-vy') as HTMLInputElement;
const inpMz = document.getElementById('inp-mz') as HTMLInputElement;
const inpMt = document.getElementById('inp-mt') as HTMLInputElement;
const inpFEElements = document.getElementById(
  'inp-feelements',
) as HTMLInputElement;
const feElementsValue = document.getElementById(
  'feelements-value',
) as HTMLElement;
const evalToggle = document.getElementById('eval-toggle') as HTMLElement;
const evalInfo = document.getElementById('eval-info') as HTMLElement;
const selPreset = document.getElementById('sel-preset') as HTMLSelectElement;
const presetNote = document.getElementById('preset-note') as HTMLElement;
const chkMesh = document.getElementById('chk-mesh') as HTMLInputElement;

const calcForm = document.getElementById('calc-form') as HTMLFormElement;
const btnCalculate = document.getElementById(
  'btn-calculate',
) as HTMLButtonElement;
const sectionTitleBadge = document.getElementById(
  'section-title-badge',
) as HTMLElement;
const warningBox = document.getElementById('validation-warning') as HTMLElement;
const feStatus = document.getElementById('fe-status') as HTMLElement;
const feStatusText = document.getElementById('fe-status-text') as HTMLElement;
const statsContainer = document.getElementById(
  'stats-container',
) as HTMLElement;
const meshInfo = document.getElementById('mesh-info') as HTMLElement;

const svgSigmaHost = document.getElementById('svg-sigma') as HTMLElement;
const svgTauHost = document.getElementById('svg-tau') as HTMLElement;
const svgSigmavHost = document.getElementById('svg-sigmav') as HTMLElement;

/** Das 3D-Relief wird träge beim ersten Ergebnis erzeugt — Three.js lädt sonst leer. */
let relief: StressFeRelief | null = null;
function ensureRelief(): StressFeRelief {
  if (relief === null) {
    relief = createStressFeRelief({
      host: elementById('relief-host'),
      infoHost: elementById('relief-info'),
    });
    relief.setEdgesVisible(showMesh);
  }
  return relief;
}

function showWarning(message: string): void {
  warningBox.textContent = message;
  warningBox.style.display = 'block';
}

function hideWarning(): void {
  warningBox.style.display = 'none';
}

/** Deutsche Zahldarstellung mit Komma — Anzeige, nie Rechnung. */
function fmt(value: number, digits = 2): string {
  return value.toFixed(digits).replace('.', ',');
}

function elementById(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null)
    throw new Error(`Element ${id} fehlt in stress-fe.html.`);
  return element;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

// ---------------------------------------------------------------------------
// Die Geometrie: eine der Vorgaben aus outline-presets.ts — dort gepflegt und
// dort gegen Handrechnung, Mittellinienmodell oder Katalogzeile gehalten.
// Sie hängt NICHT vom Slider ab — FEElements ändert den Umriss nicht, es
// steuert allein die Netzdichte des Laufs (die dritte Sorte Policy-Feld,
// ADR 0045). Je gewählter Vorgabe wird sie neu gebaut; innerhalb eines Laufs
// bleibt sie unverändert.
// ---------------------------------------------------------------------------

const DEFAULT_PRESET_ID = 'i-200-geschweisst';

function presetById(id: string): OutlinePreset {
  return (
    OUTLINE_PRESETS.find((p) => p.id === id) ?? atOrThrow(OUTLINE_PRESETS, 0)
  );
}

function buildGeometry(preset: OutlinePreset) {
  // Kopiert wird bis auf den Vertex, damit die eingefrorenen Vorgaben
  // unberührt bleiben — dieselbe Haltung wie im Store der Schwesterseite.
  const rings = preset.rings.map((ring) => ({
    vertices: ring.vertices.map((vertex) => ({ ...vertex })),
  }));
  // createSectionGeometry leitet den Umriss unter DERSELBEN Toleranz ab,
  // unter der gerechnet wird — computeFESectionValues leitet ihn ohnehin neu
  // ab (die async Tür nimmt Geometrie plus Policy, nie einen fertigen Umriss).
  return createSectionGeometry(
    { kind: 'outline', rings },
    DEFAULT_SECTION_POLICY,
  );
}

let activePreset = presetById(DEFAULT_PRESET_ID);
let geometry = buildGeometry(activePreset);

/** Badge und Notiz zur gewählten Vorgabe — dieselbe Quelle wie das Dropdown. */
function updatePresetUI(): void {
  selPreset.value = activePreset.id;
  sectionTitleBadge.textContent = `${activePreset.name} \u2014 ${activePreset.dimensions} \u00b7 Tri6 \u00b7 \u03bd = 0`;
  presetNote.textContent = activePreset.note;
}

/** Die Policy des aktuellen Sliderstands — als NEUE Policy, nicht als Feldzugriff. */
function currentPolicy() {
  const FEElements = atOrThrow(FE_ELEMENT_STEPS, feStepIndex);
  return createSectionPolicy({ ...DEFAULT_SECTION_POLICY, FEElements });
}

function targetElements(): number {
  return atOrThrow(FE_ELEMENT_STEPS, feStepIndex);
}

// ---------------------------------------------------------------------------
// Der asynchrone Lauf — EINER NACH DEM ANDEREN. Der Worker serialisiert
// ohnehin; hier wird zusätzlich sichergestellt, dass ein Ergebnis, das unter
// einem älteren Sliderstand angekommen ist, nicht ein neueres überschreibt:
// es wird verworfen, und der finally-Block startet den Lauf mit dem neuesten
// Stand sofort selbst nach.
// ---------------------------------------------------------------------------

async function runFE(): Promise<void> {
  if (running) {
    rerunNeeded = true;
    return;
  }
  running = true;
  btnCalculate.disabled = true;
  feStatus.classList.add('visible');
  feStatusText.textContent = `FE-Rechnung läuft — ${activePreset.name}: vernetzen und faktorisieren (${targetElements().toLocaleString('de-DE')} Elemente angestrebt)…`;
  hideWarning();

  const versionAtStart = runVersion;
  const started = performance.now();
  try {
    const result = await computeFESection(geometry, currentPolicy());
    if (versionAtStart !== runVersion) {
      // Veraltet: Netzdicke oder Figur sind inzwischen geändert worden.
      return;
    }
    const seconds = (performance.now() - started) / 1000;
    if (result.kind === 'refused') {
      const reason =
        result.state.status === 'unsupported'
          ? result.state.reason
          : 'unbekannter Grund';
      showWarning(
        `${activePreset.name}: Die FE-Rechnung hat die Figur abgelehnt — ${reason}`,
      );
      return;
    }
    solution = { mesh: result.mesh, fields: result.fields, seconds };
    render();
  } catch (error) {
    showWarning(
      `Die FE-Rechnung ist gescheitert: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    running = false;
    btnCalculate.disabled = solution === null || running;
    if (rerunNeeded || versionAtStart !== runVersion) {
      rerunNeeded = false;
      void runFE();
    } else {
      feStatus.classList.remove('visible');
    }
  }
}

// ---------------------------------------------------------------------------
// Die zweite Tür: synchron, bei jeder Eingabeänderung neu.
// ---------------------------------------------------------------------------

function getForces(): SectionForces {
  return {
    N: Number.parseFloat(inpN.value.trim()) || 0,
    Vz: Number.parseFloat(inpVz.value.trim()) || 0,
    My: Number.parseFloat(inpMy.value.trim()) || 0,
    Vy: Number.parseFloat(inpVy.value.trim()) || 0,
    Mz: Number.parseFloat(inpMz.value.trim()) || 0,
    Mt: Number.parseFloat(inpMt.value.trim()) || 0,
  };
}

/** Die Probezeilen des gewählten Auswertungsmodus — beide Formen sind strukturgleich. */
function evalSamples(field: FEStressField): readonly StressSample[] {
  return evalMode === 'nodes' ? field.nodes : field.elements;
}

function render(): void {
  if (solution === null) return;
  const { mesh, fields } = solution;
  const field = recoverStresses(fields, getForces(), NU);

  renderStats(field);
  renderMeshInfo(mesh, field);
  renderField(svgSigmaHost, 'sigma', field, mesh, DIVERGING_SCALE);
  renderField(svgTauHost, 'tau', field, mesh, SEQUENTIAL_SCALE);
  renderField(svgSigmavHost, 'sigmav', field, mesh, SEQUENTIAL_SCALE);

  // Das Relief teilt sich dieselben Felder und dieselbe Auswertung — nur als
  // Höhe statt als Farbe. Topologiewechsel erkennt es selbst.
  const reliefView = ensureRelief();
  reliefView.setData(field, mesh);
  reliefView.refresh(evalMode);
}

function renderStats(field: FEStressField): void {
  const samples = evalSamples(field);
  const place = evalMode === 'nodes' ? 'am Knoten Nr.' : 'an Element Nr.';

  let maxSigmaV = 0;
  let maxSigmaVSample = samples[0];
  let maxTau = 0;
  let maxTauSample = samples[0];
  let sigmaPos = -Infinity;
  let sigmaNeg = Infinity;

  for (const sample of samples) {
    const tau = Math.hypot(sample.tauY, sample.tauZ);
    if (sample.sigmaV > maxSigmaV) {
      maxSigmaV = sample.sigmaV;
      maxSigmaVSample = sample;
    }
    if (tau > maxTau) {
      maxTau = tau;
      maxTauSample = sample;
    }
    if (sample.sigma > sigmaPos) sigmaPos = sample.sigma;
    if (sample.sigma < sigmaNeg) sigmaNeg = sample.sigma;
  }

  // Maxima NUR zur Anzeige: das Package liefert ein Feld und keinen
  // „maßgebenden Punkt" (ADR 0056); das Maximum zieht hier erst im Bild —
  // je Auswertungsmodus über dessen eigene Probezeilen.
  statsContainer.innerHTML = `
    <div class="stat-card primary">
      <div class="stat-label">Max. Vergleichsspannung &sigma;<sub>v</sub></div>
      <div class="stat-value">${fmt(maxSigmaV)} <span style="font-size: 0.9rem; font-weight: 500;">N/mm&sup2;</span></div>
      <div class="stat-sub">${place} ${maxSigmaVSample?.nr ?? '?'} (y = ${fmt(maxSigmaVSample?.y ?? 0, 1)}, z = ${fmt(maxSigmaVSample?.z ?? 0, 1)})</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-label">Max. Schubspannung |&tau;|</div>
      <div class="stat-value">${fmt(maxTau)} <span style="font-size: 0.9rem; font-weight: 500;">N/mm&sup2;</span></div>
      <div class="stat-sub">${place} ${maxTauSample?.nr ?? '?'} (y = ${fmt(maxTauSample?.y ?? 0, 1)}, z = ${fmt(maxTauSample?.z ?? 0, 1)})</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">Normalspannung &sigma;</div>
      <div class="stat-value">${fmt(Math.max(Math.abs(sigmaPos), Math.abs(sigmaNeg)))} <span style="font-size: 0.9rem; font-weight: 500;">N/mm&sup2;</span></div>
      <div class="stat-sub">Zug +${fmt(sigmaPos)} / Druck ${fmt(sigmaNeg)} N/mm&sup2;</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Poissonzahl &nu;</div>
      <div class="stat-value">${fmt(NU, 1)}</div>
      <div class="stat-sub">m = &nu;/(1+&nu;) = ${fmt(NU / (1 + NU))} — der m-Anteil trägt nichts</div>
    </div>
  `;
}

function renderMeshInfo(mesh: Mesh2DResult, field: FEStressField): void {
  if (solution === null) return;
  const elementCount = mesh.elements.length / 6;
  const nodeCount = mesh.points.length / 2;
  // A und Iy der GERECHNETEN Fläche — das Netz rechnet in SI, die Ausgabe
  // hier ist Anzeige.
  const feA = solution.fields.section.A;
  const feIy = solution.fields.section.Iy;
  const diag = field.diagnostics;
  const corners = diag.reentrantCorners.join(', ') || 'keine';

  meshInfo.innerHTML = `
    <table class="diag-table">
      <tbody>
        <tr><th>Netz</th><td>Tri6 · ${elementCount} Elemente · ${nodeCount} Knoten · angestrebt ${targetElements().toLocaleString('de-DE')}</td></tr>
        <tr><th>Rechenzeit (Worker)</th><td>${fmt(solution.seconds)} s</td></tr>
        <tr><th>Aus dem Netz: A / I<sub>y</sub></th><td>${fmt(feA * M2_TO_CM2)} cm&sup2; / ${fmt(feIy * M4_TO_CM4)} cm&#8308;</td></tr>
        <tr><th>Größter Elementsprung von &tau; (maxJump)</th><td>${fmt(diag.maxJump * 100, 1)} % am Knoten ${diag.maxJumpNode}</td></tr>
        <tr><th>Größte Randnormalkomponente von &tau;</th><td>${fmt(diag.maxBoundaryTraction * 100, 1)} % am Knoten ${diag.maxBoundaryTractionNode}</td></tr>
        <tr><th>Einspringende Ecken</th><td>Knoten ${corners}</td></tr>
      </tbody>
    </table>
    <div class="diag-hint">
      Die Diagnosen beziehen sich stets auf die KNOTENFORM, unabhängig vom Anzeigemodus:
      maxJump misst genau die Glättung, die der Knotenmodus anbringt. An den einspringenden
      Ecken des Stegansatzes ist &tau; in der kontinuierlichen Lösung singulär
      (<code>&tau; ~ r<sup>&minus;1/3</sup></code>) — der Knotenwert wächst mit jeder Verfeinerung,
      er wird benannt und nicht gefiltert.
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Der SVG-Zeichner.
//
// KNOTENMODUS: je Tri6 vier Subdreiecke, jedes mit dem Mittel seiner drei
//   Knotenwerte gefüllt — stückweise lineare Interpolation der geglätteten
//   Nachweisform.
// ELEMENTMODUS: je Tri6 EIN Polygon durch alle sechs Punkte, gefüllt mit dem
//   Schwerpunktwert desselben Elements — das Rohbild, ungeglättet, mit
//   sichtbaren Facetten an den Kanten.
// ---------------------------------------------------------------------------

/** Die vier Subdreiecke eines Tri6 in Knotenindizes [v0,v1,v2,m01,m12,m20]. */
const SUB_TRIANGLES: ReadonlyArray<readonly [number, number, number]> =
  Object.freeze([
    [0, 3, 5],
    [3, 1, 4],
    [5, 4, 2],
    [3, 4, 5],
  ]);

/** Die sechs Punkte eines Tri6 im Umlauf, für das Facettenpolygon des Elementmodus. */
const PERIMETER = [0, 3, 1, 4, 2, 5] as const;

type Quantity = 'sigma' | 'tau' | 'sigmav';

function valueOf(sample: StressSample, quantity: Quantity): number {
  switch (quantity) {
    case 'sigma':
      return sample.sigma;
    case 'tau':
      return Math.hypot(sample.tauY, sample.tauZ);
    case 'sigmav':
      return sample.sigmaV;
  }
}

function renderField(
  host: HTMLElement,
  quantity: Quantity,
  field: FEStressField,
  mesh: Mesh2DResult,
  scale: ColorScale,
): void {
  const nodes = field.nodes;
  const samples = evalSamples(field);

  // Spanne und Werte ÜBER DIE GEWÄHLTTE Form: im Knotenmodus knotenindiziert,
  // im Elementmodus elementindiziert — beide Arrays liegen in Netzreihenfolge.
  let min = Infinity;
  let max = -Infinity;
  const values = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = valueOf(atOrThrow(samples, i), quantity);
    values[i] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range: Range = { min, max };

  // Koordinaten: die Knotenform trägt bereits mm relativ zum Schwerpunkt —
  // dasselbe System wie die Zeichnung. `z` nach unten, wie die SVG-Achse.
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const node of nodes) {
    if (node.y < yMin) yMin = node.y;
    if (node.y > yMax) yMax = node.y;
    if (node.z < zMin) zMin = node.z;
    if (node.z > zMax) zMax = node.z;
  }
  const span = Math.max(yMax - yMin, zMax - zMin, 10);
  const pad = span * 0.18;

  const polygons: string[] = [];
  const elementCount = mesh.elements.length / 6;

  if (evalMode === 'nodes') {
    for (let element = 0; element < elementCount; element += 1) {
      const base = element * 6;
      for (const [a, b, c] of SUB_TRIANGLES) {
        const ia = atOrThrow(mesh.elements, base + a);
        const ib = atOrThrow(mesh.elements, base + b);
        const ic = atOrThrow(mesh.elements, base + c);
        const pa = atOrThrow(nodes, ia);
        const pb = atOrThrow(nodes, ib);
        const pc = atOrThrow(nodes, ic);
        const meanValue =
          (atOrThrow(values, ia) +
            atOrThrow(values, ib) +
            atOrThrow(values, ic)) /
          3;
        const color = sampleColor(
          scale.stops,
          scale.normalize(meanValue, range),
        );
        polygons.push(
          `<polygon points="${pa.y.toFixed(2)},${pa.z.toFixed(2)} ${pb.y.toFixed(2)},${pb.z.toFixed(2)} ${pc.y.toFixed(2)},${pc.z.toFixed(2)}" fill="${color}" stroke="none"/>`,
        );
      }
    }
  } else {
    for (let element = 0; element < elementCount; element += 1) {
      const base = element * 6;
      const points: string[] = [];
      for (const offset of PERIMETER) {
        const node = atOrThrow(nodes, atOrThrow(mesh.elements, base + offset));
        points.push(`${node.y.toFixed(2)},${node.z.toFixed(2)}`);
      }
      const color = sampleColor(
        scale.stops,
        scale.normalize(atOrThrow(values, element), range),
      );
      polygons.push(
        `<polygon points="${points.join(' ')}" fill="${color}" stroke="none"/>`,
      );
    }
  }

  // Das ECHTE Netz: die Umfangskanten jedes Tri6 — v0–m01, m01–v1, …,
  // m20–v0 — als dünne schwarze Linie. Innere Kanten werden über einen
  // Schlüssel entdoppelt, weil zwei Elemente sie teilen; der Randweg darüber
  // bleibt der Umriss. So ist die wahre Topologie von den Farbschritten der
  // Subdreieck-Darstellung unterscheidbar. Standardmäßig AUS — und ausgeschaltet
  // wird der Aufbau gleich mitgespart: bei 32 000 Elementen sind das zehntausende
  // Segmente.
  const seenEdges = new Set<string>();
  let meshEdgesPath = '';
  if (showMesh) {
    for (let element = 0; element < elementCount; element += 1) {
      const base = element * 6;
      for (let k = 0; k < PERIMETER.length; k += 1) {
        const ia = atOrThrow(mesh.elements, base + atOrThrow(PERIMETER, k));
        const ib = atOrThrow(
          mesh.elements,
          base + atOrThrow(PERIMETER, (k + 1) % PERIMETER.length),
        );
        const key = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
        if (seenEdges.has(key)) continue;
        seenEdges.add(key);
        const pa = atOrThrow(nodes, ia);
        const pb = atOrThrow(nodes, ib);
        meshEdgesPath += `M ${pa.y.toFixed(2)} ${pa.z.toFixed(2)} L ${pb.y.toFixed(2)} ${pb.z.toFixed(2)} `;
      }
    }
  }

  // Der Rand aus den boundarySegments — dieselben Knoten, daher schließt er
  // lückenlos über den Farbflächen.
  let boundaryPath = '';
  for (let s = 0; s < mesh.boundarySegments.length; s += 2) {
    const a = atOrThrow(nodes, atOrThrow(mesh.boundarySegments, s));
    const b = atOrThrow(nodes, atOrThrow(mesh.boundarySegments, s + 1));
    boundaryPath += `M ${a.y.toFixed(2)} ${a.z.toFixed(2)} L ${b.y.toFixed(2)} ${b.z.toFixed(2)} `;
  }

  const axisStroke = span * 0.0015;
  const fontSize = span * 0.04;

  const svg = `
    <svg viewBox="${(yMin - pad).toFixed(2)} ${(zMin - pad).toFixed(2)} ${(yMax - yMin + 2 * pad).toFixed(2)} ${(zMax - zMin + 2 * pad).toFixed(2)}" xmlns="http://www.w3.org/2000/svg">
      <g stroke="#94a3b8" stroke-width="${axisStroke}" stroke-dasharray="${span * 0.015} ${span * 0.012}">
        <line x1="${(yMin - pad * 0.6).toFixed(2)}" y1="0" x2="${(yMax + pad * 0.6).toFixed(2)}" y2="0" />
        <line x1="0" y1="${(zMin - pad * 0.6).toFixed(2)}" x2="0" y2="${(zMax + pad * 0.6).toFixed(2)}" />
      </g>
      <g>${polygons.join('')}</g>
      ${showMesh ? `<path d="${meshEdgesPath}" fill="none" stroke="#000000" stroke-width="${Math.max(span * 0.0009, 0.3).toFixed(3)}"/>` : ''}
      <path d="${boundaryPath}" fill="none" stroke="#0f172a" stroke-width="${(span * 0.0025).toFixed(3)}" stroke-linejoin="round"/>
      <circle cx="0" cy="0" r="${Math.max(span * 0.007, 1.5)}" fill="#ef4444" stroke="#ffffff" stroke-width="${Math.max(span * 0.002, 0.4)}"><title>Schwerpunkt S (0, 0)</title></circle>
      <text x="${(yMax + pad * 0.65).toFixed(2)}" y="${(fontSize * 0.35).toFixed(2)}" font-family="Inter, sans-serif" font-size="${fontSize.toFixed(2)}" fill="#64748b" font-weight="600">y</text>
      <text x="${(fontSize * 0.35).toFixed(2)}" y="${(zMax + pad * 0.65).toFixed(2)}" font-family="Inter, sans-serif" font-size="${fontSize.toFixed(2)}" fill="#64748b" font-weight="600">z</text>
    </svg>
  `;
  host.innerHTML = svg;

  // Legende und Spannen-Badge je Größe — über die gewählte Form.
  const badge = elementById(`range-${quantity}`);
  const barMin = elementById(`legend-${quantity}-min`);
  const barMax = elementById(`legend-${quantity}-max`);
  elementById(`legend-${quantity}-bar`).style.background = legendGradientCss(
    scale.stops,
  );

  if (scale === DIVERGING_SCALE) {
    const bound = Math.max(Math.abs(min), Math.abs(max));
    badge.textContent = `\u2212${fmt(bound)} \u2026 +${fmt(bound)} N/mm\u00b2`;
    barMin.textContent = `\u2212${fmt(bound)}`;
    barMax.textContent = `+${fmt(bound)}`;
  } else {
    badge.textContent = `${fmt(min)} \u2026 ${fmt(max)} N/mm\u00b2`;
    barMin.textContent = fmt(min);
    barMax.textContent = fmt(max);
  }
}

// ---------------------------------------------------------------------------
// Verdrahtung.
// ---------------------------------------------------------------------------

calcForm.addEventListener('submit', (event) => {
  event.preventDefault();
  // Vor dem ersten Lauf gibt es nichts auszuwerten — der Knopf ist dann
  // ohnehin disabled; hier nur der Guard für den Fall zwischen Ende des
  // Laufs und Freigabe.
  if (solution !== null) render();
});

const scheduleRender = debounce(() => render(), 200);
for (const input of [inpN, inpVz, inpMy, inpVy, inpMz, inpMt]) {
  input.addEventListener('input', () => {
    if (solution === null || running) return;
    scheduleRender();
  });
}

// Netzdichte: Label live, Lauf entprellt — der Worker rechnet pro Ruck EINEN
// Lauf, und ein Ergebnis unter veraltetem Sliderstand wird in runFE verworfen.
const scheduleFERun = debounce(() => {
  runVersion += 1;
  void runFE();
}, 400);

inpFEElements.addEventListener('input', () => {
  const parsed = Number.parseInt(inpFEElements.value, 10);
  if (!Number.isInteger(parsed)) return;
  feStepIndex = parsed;
  feElementsValue.textContent = targetElements().toLocaleString('de-DE');
  scheduleFERun();
});
inpFEElements.addEventListener('change', () => {
  scheduleFERun();
});

function updateEvalInfo(): void {
  const modeText =
    evalMode === 'nodes'
      ? 'Nachweisform: an jedem Netzknoten das flächengewichtete Mittel der angrenzenden Elementwerte — stetiges Bild, trägt den Rand. Wie stark dabei geglättet wird, steht in der Diagnose <code>maxJump</code>.'
      : 'Rohbild: eine ungeglättete Punktauswertung je Elementschwerpunkt — im Inneren punktweise am genauesten, erreicht den Rand aber nie und unterschätzt Extrema dort systematisch. Die Facetten an den Kanten sind der Sprung des Gradienten, keine Physik.';
  // Die schwarzen Linien sind in BEIDEN Modi das wahre Netz (schaltbar oben);
  // was ohne schwarze Linie die Farbe wechselt (Subdreiecke im Knotenmodus),
  // ist nur Darstellung.
  evalInfo.innerHTML =
    modeText +
    ' Die dünnen schwarzen Linien sind die echten Tri6-Kanten des Netzes (oben schaltbar).';
}

for (const button of evalToggle.querySelectorAll('button')) {
  button.addEventListener('click', () => {
    const mode = button.getAttribute('data-eval');
    if (mode !== 'nodes' && mode !== 'elements') return;
    if (mode === evalMode) return;
    evalMode = mode;
    for (const other of evalToggle.querySelectorAll('button')) {
      other.classList.toggle('active', other === button);
    }
    updateEvalInfo();
    // Rein synchron: dieselben Felder, andere Probezeilen — kein neuer Lauf.
    if (solution !== null && !running) render();
  });
}

chkMesh.addEventListener('change', () => {
  showMesh = chkMesh.checked;
  // Rein synchron: dieselben Felder, nur das Kantenwerkzeug ändert sich.
  if (solution !== null && !running) render();
  relief?.setEdgesVisible(showMesh);
});

// Das Dropdown aus denselben Vorgaben befüllen, die auch outline-sections.ts
// anbietet — eine zweite Liste für dieselbe Frage wäre eine zweite Quelle.
for (const preset of OUTLINE_PRESETS) {
  const option = document.createElement('option');
  option.value = preset.id;
  option.textContent = `${preset.name} \u2014 ${preset.dimensions}`;
  selPreset.append(option);
}
selPreset.addEventListener('change', () => {
  const next = presetById(selPreset.value);
  if (next.id === activePreset.id) return;
  activePreset = next;
  // Neue Figur — die alte Lösung gilt nichts mehr. Derselbe Versionsmechanismus
  // wie beim Slider; läuft gerade ein Lauf, startet finally den neuen nach.
  runVersion += 1;
  geometry = buildGeometry(activePreset);
  hideWarning();
  updatePresetUI();
  void runFE();
});

updatePresetUI();
feElementsValue.textContent = targetElements().toLocaleString('de-DE');
updateEvalInfo();

// Der erste FE-Lauf beim Laden. Danach bleibt die Seite synchron: Schnitt-
// größen werten nur neu aus, nur die Netzdichte startet einen neuen Lauf.
void runFE();
