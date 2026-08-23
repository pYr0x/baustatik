import {
  type CrossSection,
  type Idealisation,
  type SectionProperties,
  type StressPoint,
  sectionProperties,
  stressPoints,
} from '@baustatik/cross-section';
import { convert } from '@baustatik/units';

// Einheitenumrechnungsfaktoren
const M2_TO_CM2 = convert(1).from('m^2').toExact('cm^2');
const M4_TO_CM4 = convert(1).from('m^4').toExact('cm^4');
const M_TO_MM = convert(1).from('m').toExact('mm');

type PointStressResult = {
  readonly point: StressPoint;
  readonly sigmaN: number;
  readonly sigmaMy: number;
  readonly sigmaMz: number;
  readonly sigma: number;
  readonly tauZ: number;
  readonly tauY: number;
  readonly tau: number;
  readonly sigmaV: number;
};

type StressCalculationResult = {
  readonly cs: CrossSection;
  readonly props: SectionProperties;
  readonly points: readonly PointStressResult[];
  readonly maxSigmaV: number;
  readonly maxSigmaPoint: PointStressResult;
  readonly maxTau: number;
  readonly maxTauPoint: PointStressResult;
  readonly maxSigmaPos: number;
  readonly maxSigmaNeg: number;
};

// DOM-Elemente
const inpH = document.getElementById('inp-h') as HTMLInputElement;
const inpB = document.getElementById('inp-b') as HTMLInputElement;
const inpTw = document.getElementById('inp-tw') as HTMLInputElement;
const inpTf = document.getElementById('inp-tf') as HTMLInputElement;

const inpN = document.getElementById('inp-n') as HTMLInputElement;
const inpVz = document.getElementById('inp-vz') as HTMLInputElement;
const inpMy = document.getElementById('inp-my') as HTMLInputElement;
const inpVy = document.getElementById('inp-vy') as HTMLInputElement;
const inpMz = document.getElementById('inp-mz') as HTMLInputElement;

const calcForm = document.getElementById('calc-form') as HTMLFormElement;
const sectionTitleBadge = document.getElementById(
  'section-title-badge',
) as HTMLElement;
const statsContainer = document.getElementById(
  'stats-container',
) as HTMLElement;
const tableBody = document.getElementById(
  'stress-table-body',
) as HTMLTableSectionElement;
const pointsCountBadge = document.getElementById(
  'points-count-badge',
) as HTMLElement;
const svgHost = document.getElementById('svg-host') as HTMLElement;
const sectionPropsContainer = document.getElementById(
  'section-props-container',
) as HTMLElement;
const inspectorDetails = document.getElementById(
  'selected-point-details',
) as HTMLElement;
const validationWarning = document.getElementById(
  'validation-warning',
) as HTMLElement;

let currentResult: StressCalculationResult | null = null;
let activePointNr: number | null = null;

function showWarning(msg: string): void {
  if (validationWarning) {
    validationWarning.textContent = msg;
    validationWarning.style.display = 'block';
  }
}

function hideWarning(): void {
  if (validationWarning) {
    validationWarning.textContent = '';
    validationWarning.style.display = 'none';
  }
}

function getFormValues() {
  const hRaw = inpH.value.trim();
  const bRaw = inpB.value.trim();
  const twRaw = inpTw.value.trim();
  const tfRaw = inpTf.value.trim();

  const h = Number.parseFloat(hRaw);
  const b = Number.parseFloat(bRaw);
  const tw = Number.parseFloat(twRaw);
  const tf = Number.parseFloat(tfRaw);
  const idealisation: Idealisation = 'thin-walled';

  const N = Number.parseFloat(inpN.value.trim()) || 0; // [kN]
  const Vz = Number.parseFloat(inpVz.value.trim()) || 0; // [kN]
  const My = Number.parseFloat(inpMy.value.trim()) || 0; // [kNm]
  const Vy = Number.parseFloat(inpVy.value.trim()) || 0; // [kN]
  const Mz = Number.parseFloat(inpMz.value.trim()) || 0; // [kNm]

  return { h, b, tw, tf, idealisation, N, Vz, My, Vy, Mz };
}

function calculate(): void {
  const { h, b, tw, tf, idealisation, N, Vz, My, Vy, Mz } = getFormValues();

  // Validierung der Eingabewerte ohne blockierende alerts
  if (
    Number.isNaN(h) ||
    Number.isNaN(b) ||
    Number.isNaN(tw) ||
    Number.isNaN(tf) ||
    h <= 0 ||
    b <= 0 ||
    tw <= 0 ||
    tf <= 0
  ) {
    showWarning(
      'Bitte alle Querschnittsabmessungen als positive Zahlen eingeben.',
    );
    return;
  }

  if (h <= 2 * tf) {
    showWarning(
      `Querschnittshöhe h (${h} mm) muss größer als 2 · tf (${(2 * tf).toFixed(1)} mm) sein.`,
    );
    return;
  }

  if (b <= tw) {
    showWarning(
      `Gurtbreite b (${b} mm) muss größer als Stegdicke tw (${tw} mm) sein.`,
    );
    return;
  }

  const cs: CrossSection = {
    kind: 'shape',
    id: `i-welded-${h}x${b}-${idealisation}`,
    shape: {
      kind: 'i-symmetric',
      h,
      b,
      tw,
      tf,
      idealisation,
    },
  };

  const props = sectionProperties(cs);
  if (!props) {
    showWarning('Querschnittswerte konnten nicht ermittelt werden.');
    return;
  }

  const rawPoints = stressPoints(cs);
  if (!rawPoints || rawPoints.length === 0) {
    showWarning('Keine Spannungspunkte für diesen Querschnitt ermittelbar.');
    return;
  }

  hideWarning();
  sectionTitleBadge.textContent = `I geschweisst ${h} x ${b} x ${tw} x ${tf} — ${idealisation}`;

  // Schnittgrößen in N, Nmm
  const N_N = N * 1_000;
  const Vz_N = Vz * 1_000;
  const Vy_N = Vy * 1_000;
  const My_Nmm = My * 1_000_000;
  const Mz_Nmm = Mz * 1_000_000;

  // Querschnittswerte in mm², mm⁴
  const A_mm2 = props.A * 1_000_000;
  const Iy_mm4 = props.Iy * 1_000_000_000_000;
  const Iz_mm4 = props.Iz * 1_000_000_000_000;

  const results: PointStressResult[] = rawPoints.map((pt) => {
    // Normalspannung sigma = N/A + (My * z) / Iy - (Mz * y) / Iz
    const sigmaN = A_mm2 > 0 ? N_N / A_mm2 : 0;
    const sigmaMy = Iy_mm4 > 0 ? (My_Nmm * pt.z) / Iy_mm4 : 0;
    const sigmaMz = Iz_mm4 > 0 ? (-Mz_Nmm * pt.y) / Iz_mm4 : 0;
    const sigma = sigmaN + sigmaMy + sigmaMz;

    // Statische Momente in mm³ (pt.Sy und pt.Sz sind in cm³)
    const Sy_mm3 = Math.abs(pt.Sy) * 1_000;
    const Sz_mm3 = Math.abs(pt.Sz) * 1_000;

    // Schubspannung tau = (V * S) / (I * t)
    const tauZ =
      Iy_mm4 > 0 && pt.t > 0 ? (Math.abs(Vz_N) * Sy_mm3) / (Iy_mm4 * pt.t) : 0;
    const tauY =
      Iz_mm4 > 0 && pt.t > 0 ? (Math.abs(Vy_N) * Sz_mm3) / (Iz_mm4 * pt.t) : 0;
    const tau = Math.sqrt(tauZ * tauZ + tauY * tauY);

    // Vergleichsspannung nach von Mises: sigmaV = sqrt(sigma² + 3 * tau²)
    const sigmaV = Math.sqrt(sigma * sigma + 3 * tau * tau);

    return {
      point: pt,
      sigmaN,
      sigmaMy,
      sigmaMz,
      sigma,
      tauZ,
      tauY,
      tau,
      sigmaV,
    };
  });

  let maxSigmaV = 0;
  let maxSigmaPoint = results[0];
  let maxTau = 0;
  let maxTauPoint = results[0];
  let maxSigmaPos = -Infinity;
  let maxSigmaNeg = Infinity;

  for (const r of results) {
    if (r.sigmaV > maxSigmaV) {
      maxSigmaV = r.sigmaV;
      maxSigmaPoint = r;
    }
    if (r.tau > maxTau) {
      maxTau = r.tau;
      maxTauPoint = r;
    }
    if (r.sigma > maxSigmaPos) {
      maxSigmaPos = r.sigma;
    }
    if (r.sigma < maxSigmaNeg) {
      maxSigmaNeg = r.sigma;
    }
  }

  currentResult = {
    cs,
    props,
    points: results,
    maxSigmaV,
    maxSigmaPoint,
    maxTau,
    maxTauPoint,
    maxSigmaPos,
    maxSigmaNeg,
  };

  renderUI();
}

function renderUI(): void {
  if (!currentResult) return;

  const {
    cs,
    props,
    points,
    maxSigmaV,
    maxSigmaPoint,
    maxTau,
    maxTauPoint,
    maxSigmaPos,
    maxSigmaNeg,
  } = currentResult;

  pointsCountBadge.textContent = `${points.length} Punkte`;

  // 1. Stat Cards rendern
  statsContainer.innerHTML = `
    <div class="stat-card primary">
      <div class="stat-label">Max. Vergleichsspannung &sigma;<sub>v</sub></div>
      <div class="stat-value">${maxSigmaV.toFixed(2)} <span style="font-size: 0.9rem; font-weight: 500;">N/mm²</span></div>
      <div class="stat-sub">an Punkt Nr. ${maxSigmaPoint.point.nr} (z = ${maxSigmaPoint.point.z.toFixed(1)} mm)</div>
    </div>
    <div class="stat-card warning">
      <div class="stat-label">Max. Normalspannung &sigma;</div>
      <div class="stat-value">${Math.max(Math.abs(maxSigmaPos), Math.abs(maxSigmaNeg)).toFixed(2)} <span style="font-size: 0.9rem; font-weight: 500;">N/mm²</span></div>
      <div class="stat-sub">Zug: +${maxSigmaPos.toFixed(2)} / Druck: ${maxSigmaNeg.toFixed(2)} N/mm²</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">Max. Schubspannung &tau;</div>
      <div class="stat-value">${maxTau.toFixed(2)} <span style="font-size: 0.9rem; font-weight: 500;">N/mm²</span></div>
      <div class="stat-sub">an Punkt Nr. ${maxTauPoint.point.nr} (z = ${maxTauPoint.point.z.toFixed(1)} mm)</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Fläche A & Trägheitsmoment I<sub>y</sub></div>
      <div class="stat-value">${(props.A * M2_TO_CM2).toFixed(2)} <span style="font-size: 0.9rem; font-weight: 500;">cm²</span></div>
      <div class="stat-sub">I<sub>y</sub> = ${(props.Iy * M4_TO_CM4).toFixed(1)} cm⁴ &middot; I<sub>z</sub> = ${(props.Iz * M4_TO_CM4).toFixed(1)} cm⁴</div>
    </div>
  `;

  // 2. Tabellenzeilen rendern
  tableBody.innerHTML = points
    .map((r) => {
      const isMaxSigmaV = r.point.nr === maxSigmaPoint.point.nr;
      const isMaxTau = r.point.nr === maxTauPoint.point.nr;
      const isActive = r.point.nr === activePointNr;

      return `
      <tr class="${isActive ? 'active-row' : ''}" data-nr="${r.point.nr}">
        <td class="text-center font-bold"><strong>${r.point.nr}</strong></td>
        <td>${r.point.wall}</td>
        <td>${r.point.y.toFixed(1)}</td>
        <td>${r.point.z.toFixed(1)}</td>
        <td>${r.point.t.toFixed(1)}</td>
        <td>${r.point.Sy.toFixed(2)}</td>
        <td>${r.point.Sz.toFixed(2)}</td>
        <td class="col-stress">${r.sigma >= 0 ? '+' : ''}${r.sigma.toFixed(2)}</td>
        <td class="col-stress ${isMaxTau ? 'col-max-stress' : ''}">${r.tau.toFixed(2)}</td>
        <td class="col-stress col-sigmav ${isMaxSigmaV ? 'col-max-stress' : ''}">${r.sigmaV.toFixed(2)}</td>
      </tr>
    `;
    })
    .join('');

  // 3. SVG rendern
  svgHost.innerHTML = renderProfileSvg(cs, points, props, activePointNr);

  let welYStr = '&ndash;';
  let welZStr = '&ndash;';
  if (cs.kind === 'shape' && cs.shape.kind === 'i-symmetric') {
    const welY = (props.Iy * M4_TO_CM4) / (cs.shape.h / 20);
    const welZ = (props.Iz * M4_TO_CM4) / (cs.shape.b / 20);
    welYStr = `${welY.toFixed(2)} cm³`;
    welZStr = `${welZ.toFixed(2)} cm³`;
  }

  // 4. Querschnittswerte rendern
  sectionPropsContainer.innerHTML = `
    <table class="prop-table">
      <tbody>
        <tr><th>Fläche A</th><td>${(props.A * M2_TO_CM2).toFixed(2)} cm²</td></tr>
        <tr><th>Flächenträgheitsmoment I<sub>y</sub></th><td>${(props.Iy * M4_TO_CM4).toFixed(2)} cm⁴</td></tr>
        <tr><th>Flächenträgheitsmoment I<sub>z</sub></th><td>${(props.Iz * M4_TO_CM4).toFixed(2)} cm⁴</td></tr>
        <tr><th>Widerstandsmoment W<sub>el,y</sub></th><td>${welYStr}</td></tr>
        <tr><th>Widerstandsmoment W<sub>el,z</sub></th><td>${welZStr}</td></tr>
        <tr><th>Torsionsträgheitsmoment I<sub>t</sub></th><td>${props.It !== undefined ? (props.It * M4_TO_CM4).toFixed(2) + ' cm⁴' : '&ndash;'}</td></tr>
        <tr><th>Schubkorrekturfaktor &kappa;<sub>y</sub> / &kappa;<sub>z</sub></th><td>${props.kappaY !== undefined ? props.kappaY.toFixed(4) : 'schubstarr'} / ${props.kappaZ !== undefined ? props.kappaZ.toFixed(4) : 'schubstarr'}</td></tr>
      </tbody>
    </table>
  `;

  attachEventHandlers();
  updateInspector(activePointNr);
}

function updateInspector(pointNr: number | null): void {
  if (!currentResult) return;

  if (pointNr === null) {
    const maxPt = currentResult.maxSigmaPoint;
    inspectorDetails.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 0.35rem; color: #0f172a;">
        Massgebender Punkt: Nr. ${maxPt.point.nr} (Max. &sigma;<sub>v</sub> = ${maxPt.sigmaV.toFixed(2)} N/mm²)
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; font-size: 0.78rem;">
        <div>Ort: y = ${maxPt.point.y.toFixed(1)} mm, z = ${maxPt.point.z.toFixed(1)} mm</div>
        <div>Wanddicke: t = ${maxPt.point.t.toFixed(1)} mm</div>
        <div>&sigma;<sub>N</sub> = ${maxPt.sigmaN.toFixed(2)} N/mm²</div>
        <div>&sigma;<sub>My</sub> = ${maxPt.sigmaMy.toFixed(2)} N/mm²</div>
        <div>&sigma;<sub>ges</sub> = ${maxPt.sigma.toFixed(2)} N/mm²</div>
        <div>&tau; = ${maxPt.tau.toFixed(2)} N/mm²</div>
      </div>
    `;
    return;
  }

  const res = currentResult.points.find((p) => p.point.nr === pointNr);
  if (!res) return;

  inspectorDetails.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 0.35rem; color: #1e40af;">
      Spannungspunkt Nr. ${res.point.nr} (y = ${res.point.y.toFixed(1)} mm, z = ${res.point.z.toFixed(1)} mm, t = ${res.point.t.toFixed(1)} mm)
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; font-size: 0.78rem;">
      <div>&sigma;<sub>N</sub> (aus N): <strong>${res.sigmaN.toFixed(2)} N/mm²</strong></div>
      <div>&sigma;<sub>My</sub> (aus M<sub>y</sub>): <strong>${res.sigmaMy.toFixed(2)} N/mm²</strong></div>
      <div>&sigma;<sub>Mz</sub> (aus M<sub>z</sub>): <strong>${res.sigmaMz.toFixed(2)} N/mm²</strong></div>
      <div>&sigma;<sub>ges</sub>: <strong style="color:${res.sigma >= 0 ? '#16a34a' : '#dc2626'}">${res.sigma.toFixed(2)} N/mm²</strong></div>
      <div>S<sub>y</sub>: <strong>${res.point.Sy.toFixed(2)} cm³</strong></div>
      <div>&tau;<sub>z</sub> (aus V<sub>z</sub>): <strong>${res.tauZ.toFixed(2)} N/mm²</strong></div>
      <div>S<sub>z</sub>: <strong>${res.point.Sz.toFixed(2)} cm³</strong></div>
      <div>&tau;<sub>ges</sub>: <strong>${res.tau.toFixed(2)} N/mm²</strong></div>
      <div style="grid-column: span 2; background: #dbeafe; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 700; color: #1e3a8a;">
        Vergleichsspannung &sigma;<sub>v</sub> = &radic;(${res.sigma.toFixed(2)}&sup2; + 3&middot;${res.tau.toFixed(2)}&sup2;) = ${res.sigmaV.toFixed(2)} N/mm²
      </div>
    </div>
  `;
}

function attachEventHandlers(): void {
  // Zeilenhover & Klick in Tabelle
  const rows = tableBody.querySelectorAll('tr');
  rows.forEach((row) => {
    const nr = Number.parseInt(row.getAttribute('data-nr') || '0', 10);

    row.addEventListener('mouseenter', () => {
      setActivePoint(nr);
    });

    row.addEventListener('click', () => {
      setActivePoint(nr);
    });
  });

  // SVG Punkte Hover & Klick
  const svgPoints = svgHost.querySelectorAll('.stress-point');
  svgPoints.forEach((elem) => {
    const nr = Number.parseInt(elem.getAttribute('data-nr') || '0', 10);

    elem.addEventListener('mouseenter', () => {
      setActivePoint(nr);
    });

    elem.addEventListener('click', () => {
      setActivePoint(nr);
    });
  });
}

function setActivePoint(nr: number): void {
  if (activePointNr === nr) return;
  activePointNr = nr;

  // Tabelle updaten
  const rows = tableBody.querySelectorAll('tr');
  rows.forEach((row) => {
    const rowNr = Number.parseInt(row.getAttribute('data-nr') || '0', 10);
    if (rowNr === nr) {
      row.classList.add('active-row');
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      row.classList.remove('active-row');
    }
  });

  // SVG updaten
  const svgPoints = svgHost.querySelectorAll('.stress-point');
  svgPoints.forEach((elem) => {
    const elemNr = Number.parseInt(elem.getAttribute('data-nr') || '0', 10);
    if (elemNr === nr) {
      elem.classList.add('active');
    } else {
      elem.classList.remove('active');
    }
  });

  updateInspector(nr);
}

function renderProfileSvg(
  cs: CrossSection,
  pointResults: readonly PointStressResult[],
  _p: SectionProperties,
  activeNr: number | null,
): string {
  if (cs.kind !== 'shape') return '';
  const shape = cs.shape;
  if (shape.kind !== 'i-symmetric') return '';

  const { h, b, tw, tf, idealisation } = shape;
  const top = -h / 2;
  const topInner = -h / 2 + tf;
  const bottomInner = h / 2 - tf;
  const bottom = h / 2;

  const pathD = [
    `M ${-b / 2} ${top}`,
    `L ${b / 2} ${top}`,
    `L ${b / 2} ${topInner}`,
    `L ${tw / 2} ${topInner}`,
    `L ${tw / 2} ${bottomInner}`,
    `L ${b / 2} ${bottomInner}`,
    `L ${b / 2} ${bottom}`,
    `L ${-b / 2} ${bottom}`,
    `L ${-b / 2} ${bottomInner}`,
    `L ${-tw / 2} ${bottomInner}`,
    `L ${-tw / 2} ${topInner}`,
    `L ${-b / 2} ${topInner}`,
    'Z',
  ].join(' ');

  let midlineD = '';
  if (idealisation === 'thin-walled') {
    midlineD = [
      `M ${-b / 2} ${top + tf / 2} L ${b / 2} ${top + tf / 2}`,
      `M 0 ${top + tf / 2} L 0 ${bottom - tf / 2}`,
      `M ${-b / 2} ${bottom - tf / 2} L ${b / 2} ${bottom - tf / 2}`,
    ].join(' ');
  }

  let yMin = -b / 2;
  let yMax = b / 2;
  let zMin = -h / 2;
  let zMax = h / 2;

  for (const r of pointResults) {
    yMin = Math.min(yMin, r.point.y);
    yMax = Math.max(yMax, r.point.y);
    zMin = Math.min(zMin, r.point.z);
    zMax = Math.max(zMax, r.point.z);
  }

  const width = yMax - yMin;
  const height = zMax - zMin;
  const span = Math.max(width, height, 10);
  const pad = span * 0.24;
  const vbX = yMin - pad;
  const vbY = zMin - pad;
  const vbWidth = width + 2 * pad;
  const vbHeight = height + 2 * pad;

  const strokeWidth = Math.max(span * 0.008, 0.6);
  const axisStroke = Math.max(span * 0.004, 0.4);
  const rectSize = Math.max(span * 0.04, 4.5);
  const fontSize = Math.max(span * 0.045, 5.5);

  const axisMarkup = `
    <g class="axes" stroke="#94a3b8" stroke-width="${axisStroke}" stroke-dasharray="${span * 0.015} ${span * 0.012}">
      <line x1="${yMin - pad * 0.6}" y1="0" x2="${yMax + pad * 0.6}" y2="0" />
      <line x1="0" y1="${zMin - pad * 0.6}" x2="0" y2="${zMax + pad * 0.6}" />
    </g>
    <text x="${yMax + pad * 0.65}" y="${fontSize * 0.35}" font-family="Inter, sans-serif" font-size="${fontSize * 0.85}" fill="#64748b" font-weight="600">y</text>
    <text x="${fontSize * 0.35}" y="${zMax + pad * 0.65}" font-family="Inter, sans-serif" font-size="${fontSize * 0.85}" fill="#64748b" font-weight="600">z</text>
  `;

  const centroidMarkup = `
    <circle cx="0" cy="0" r="${rectSize * 0.35}" fill="#ef4444" stroke="#ffffff" stroke-width="${rectSize * 0.12}">
      <title>Schwerpunkt S (0, 0)</title>
    </circle>
  `;

  const dist = rectSize * 1.25;

  // EIN MARKER JE ORT. Seit ADR 0059 traegt der Verzweigungsknoten zwei Punkte
  // — je einen fuer das linke und das rechte Wandelement, mit derselben
  // Koordinate. Zwei deckungsgleiche Rechtecke und zwei uebereinander
  // gedruckte Nummern waeren nur unleserlich; gezeichnet wird die Stelle
  // einmal, beschriftet mit beiden Nummern. Die Tabelle daneben fuehrt die
  // Zeilen weiter einzeln.
  const atLocation = new Map<string, PointStressResult[]>();
  for (const r of pointResults) {
    const key = `${r.point.y.toFixed(6)}/${r.point.z.toFixed(6)}`;
    const bucket = atLocation.get(key);
    if (bucket === undefined) atLocation.set(key, [r]);
    else bucket.push(r);
  }

  const elements = [...atLocation.values()].map((group) => {
    const r = group[0];
    const pt = r.point;
    const label = group.map((g) => g.point.nr).join('/');
    let textX = pt.y;
    let textY = pt.z;
    let textAnchor = 'middle';
    let dominantBaseline = 'central';

    if (pt.y < -0.01) {
      textX -= dist;
      textAnchor = 'end';
    } else if (pt.y > 0.01) {
      textX += dist;
      textAnchor = 'start';
    } else {
      if (pt.z < -0.01) {
        textY -= dist;
        dominantBaseline = 'auto';
      } else if (pt.z > 0.01) {
        textY += dist + fontSize * 0.85;
        dominantBaseline = 'auto';
      } else {
        textX += dist;
        textY -= dist * 0.6;
        textAnchor = 'start';
      }
    }

    const isActive = group.some((g) => g.point.nr === activeNr);
    const tooltip = `Punkt ${label}: \nσ = ${r.sigma.toFixed(2)} N/mm²\nτ = ${r.tau.toFixed(2)} N/mm²\nσ_v = ${r.sigmaV.toFixed(2)} N/mm²\n(y = ${pt.y.toFixed(1)} mm, z = ${pt.z.toFixed(1)} mm, t = ${pt.t.toFixed(1)} mm)`;

    return `
      <g class="stress-point ${isActive ? 'active' : ''}" data-nr="${pt.nr}">
        <title>${tooltip}</title>
        <rect
          x="${pt.y - rectSize / 2}"
          y="${pt.z - rectSize / 2}"
          width="${rectSize}"
          height="${rectSize}"
          fill="${isActive ? '#ea580c' : '#2563eb'}"
          stroke="#ffffff"
          stroke-width="${rectSize * 0.18}"
          rx="${rectSize * 0.2}"
        />
        <text
          x="${textX}"
          y="${textY}"
          text-anchor="${textAnchor}"
          dominant-baseline="${dominantBaseline}"
          font-family="Inter, sans-serif"
          font-size="${fontSize}"
          font-weight="700"
          fill="${isActive ? '#c2410c' : '#1d4ed8'}"
          stroke="#ffffff"
          stroke-width="${rectSize * 0.35}"
          stroke-linejoin="round"
          paint-order="stroke fill"
        >${label}</text>
      </g>
    `;
  });

  const stressPointsMarkup = `<g class="stress-points">${elements.join('')}</g>`;

  return `
    <svg viewBox="${vbX} ${vbY} ${vbWidth} ${vbHeight}" xmlns="http://www.w3.org/2000/svg">
      ${axisMarkup}
      <path
        d="${pathD}"
        fill="#e2e8f0"
        fill-rule="evenodd"
        stroke="#334155"
        stroke-width="${strokeWidth}"
        stroke-linejoin="round"
      />
      ${midlineD ? `<path d="${midlineD}" fill="none" stroke="#f97316" stroke-width="${strokeWidth * 0.9}" stroke-dasharray="${span * 0.02} ${span * 0.015}" />` : ''}
      ${centroidMarkup}
      ${stressPointsMarkup}
    </svg>
  `;
}

// Event Listeners
calcForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  calculate();
});

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleCalculation(delayMs = 250): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    calculate();
  }, delayMs);
}

// Live recalculate on input change with debounce
const allInputs = [inpH, inpB, inpTw, inpTf, inpN, inpVz, inpMy, inpVy, inpMz];
for (const input of allInputs) {
  input.addEventListener('input', () => {
    scheduleCalculation(250);
  });
  input.addEventListener('change', () => {
    scheduleCalculation(50);
  });
}

// Initial calculation on load
calculate();
