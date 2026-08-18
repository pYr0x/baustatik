import {
  sectionProperties,
  stressPoints,
} from '@baustatik/cross-section';
import { convert } from '@baustatik/units';

// Druckeinheiten wie im Bericht der Beispiele: das Package liefert SI, gezeigt
// werden die Katalogeinheiten, gegen die man eine Profiltabelle haelt.
const M2_TO_CM2 = convert(1).from('m^2').toExact('cm^2');
const M4_TO_CM4 = convert(1).from('m^4').toExact('cm^4');
const M_TO_MM = convert(1).from('m').toExact('mm');

// Alle Beispiele mit kind: 'shape' aus packages/cross-section/examples — als
// Daten hier eingebettet, damit die Seite ohne Nachschlagen funktioniert.
const groups = [
  {
    name: 'Gültige Formen',
    sections: [
      {
        title: 'Rechteck b = 200 mm, h = 500 mm',
        spec: 'Die einzige Form ohne idealisation — ein duennwandiges Vollrechteck gibt es nicht. kappa faellt als exakt 5/6 heraus.',
        cs: {
          kind: 'shape',
          id: 'rechteck-200x500',
          shape: { kind: 'rectangle', b: 200, h: 500 },
        },
      },
      {
        title: 'I geschweisst 400 x 200 x 10 x 10 — solid',
        spec: 'Umrissmodell (Grashof): waagerechte Schnitte durch die volle Umrissfigur. 15 Spannungspunkte.',
        cs: {
          kind: 'shape',
          id: 'i-400-solid',
          shape: {
            kind: 'i-symmetric',
            h: 400,
            b: 200,
            tw: 10,
            tf: 10,
            idealisation: 'solid',
          },
        },
      },
      {
        title: 'I geschweisst 400 x 200 x 10 x 10 — thin-walled',
        spec: 'Wandmodell: der Schubfluss laeuft laengs der Wandmittellinien. Dieselben Koordinaten und Nummern, andere t, S und kappa.',
        cs: {
          kind: 'shape',
          id: 'i-400-thin-walled',
          shape: {
            kind: 'i-symmetric',
            h: 400,
            b: 200,
            tw: 10,
            tf: 10,
            idealisation: 'thin-walled',
          },
        },
      },
      {
        title: 'I geschweisst 200 x 100 x 5,6 x 8,5 — thin-walled',
        spec: 'Wandmodell mit IPE-200-Abmessungen: 15 Spannungspunkte, Gurtpunkte auf der Außenfaser (ADR 0052), t = tf und S aus der Wandabwicklung.',
        cs: {
          kind: 'shape',
          id: 'i-200-thin-walled',
          shape: {
            kind: 'i-symmetric',
            h: 200,
            b: 100,
            tw: 5.6,
            tf: 8.5,
            idealisation: 'thin-walled',
          },
        },
      },
      {
        title: 'Plattenbalken 2000/200/250/500 — solid',
        spec: 'Stahlbeton-Plattenbalken, kompakt. Der Fall, der Steiner prueft: zs = 139,5 mm liegt IM Gurt (hf = 200 mm).',
        cs: {
          kind: 'shape',
          id: 'plattenbalken',
          shape: {
            kind: 't-section',
            bf: 2000,
            hf: 200,
            bw: 250,
            h: 500,
            idealisation: 'solid',
          },
        },
      },
      {
        title: 'Stahl-T geschweisst 200/15/10/300 — thin-walled',
        spec: 'Wandmodell nach ADR 0053: Die Wände kacheln die Umrissfigur, S und Koordinaten laufen beide um den Schwerpunkt der Umrissfigur (Hebelarm auf der Wandmittellinie). Nur kappa liest noch das reine Mittellinienmodell.',
        cs: {
          kind: 'shape',
          id: 'stahl-t',
          shape: {
            kind: 't-section',
            bf: 200,
            hf: 15,
            bw: 10,
            h: 300,
            idealisation: 'thin-walled',
          },
        },
      },
      {
        title: 'Kasten 200 x 400 x 10 — thin-walled',
        spec: 'Geschlossener Kasten mit umlaufend gleicher Wandstaerke. Die einzige Form, deren Spannungspunkte nicht auf dem Schwerpunkt liegen koennen — der liegt im Loch. An seine Stelle treten die vier Wandmitten, der Umlauf traegt 16 Punkte.',
        cs: {
          kind: 'shape',
          id: 'kasten-200x400x10',
          shape: {
            kind: 'hollow-rectangle',
            b: 200,
            h: 400,
            t: 10,
            idealisation: 'thin-walled',
          },
        },
      },
    ],
  },
];

const container = document.getElementById('sections');

for (const group of groups) {
  const heading = document.createElement('h2');
  heading.textContent = group.name;
  container.appendChild(heading);

  group.sections.forEach((section, index) => {
    const card = document.createElement('section');
    card.className = 'card';

    const title = document.createElement('h3');
    title.textContent = section.title;
    card.appendChild(title);

    const spec = document.createElement('p');
    spec.className = 'spec';
    spec.textContent = section.spec;
    card.appendChild(spec);

    const input = document.createElement('pre');
    input.className = 'input';
    input.textContent = JSON.stringify(section.cs.shape, null, 2);
    card.appendChild(input);

    const result = document.createElement('div');
    result.className = 'result';
    result.id = `result-${index}`;
    card.appendChild(result);

    container.appendChild(card);
  });
}

document.getElementById('calculate').addEventListener('click', () => {
  let i = 0;
  for (const group of groups) {
    for (const section of group.sections) {
      document.getElementById(`result-${i}`).innerHTML = render(section.cs);
      i += 1;
    }
  }
});

function render(cs) {
  const p = sectionProperties(cs);
  if (p === undefined) {
    return '<p class="error">sectionProperties &rarr; undefined — unsinnige Abmessungen</p>';
  }

  const points = stressPoints(cs);
  const svg = profileSvg(cs, points, p);

  const leftParts = [propertyTable(p)];

  if (points === undefined) {
    leftParts.push(
      '<p class="muted">stressPoints &rarr; undefined — fuer diese Form gibt es keine Vorlage</p>',
    );
  } else {
    leftParts.push(`<div class="points-wrapper">${stressTable(points)}</div>`);
  }

  const hasMidline = cs.shape && cs.shape.idealisation === 'thin-walled';

  return `
    <div class="result-grid">
      <div class="result-data">
        ${leftParts.join('\n')}
      </div>
      <div class="result-preview">
        <div class="svg-container">
          ${svg}
        </div>
        <div class="svg-legend">
          ${points ? `<span class="legend-item"><span class="legend-box blue"></span> Spannungspunkte (1–${points.length})</span>` : ''}
          <span class="legend-item"><span class="legend-box red"></span> Schwerpunkt S (0,0)</span>
          ${hasMidline ? '<span class="legend-item"><span style="color:#f97316;font-weight:bold;">---</span> Mittellinie</span>' : ''}
        </div>
      </div>
    </div>
  `;
}

function profileSvg(cs, points, p) {
  if (cs.kind !== 'shape') return '';

  let pathD = '';
  let midlineD = '';
  let yMin = 0;
  let yMax = 0;
  let zMin = 0;
  let zMax = 0;

  const shape = cs.shape;
  switch (shape.kind) {
    case 'rectangle': {
      const { b, h } = shape;
      pathD = `M ${-b / 2} ${-h / 2} h ${b} v ${h} h ${-b} Z`;
      yMin = -b / 2;
      yMax = b / 2;
      zMin = -h / 2;
      zMax = h / 2;
      break;
    }
    case 'i-symmetric': {
      const { h, b, tw, tf, idealisation } = shape;
      const top = -h / 2;
      const topInner = -h / 2 + tf;
      const bottomInner = h / 2 - tf;
      const bottom = h / 2;
      pathD = [
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

      if (idealisation === 'thin-walled') {
        midlineD = [
          `M ${-b / 2} ${top + tf / 2} L ${b / 2} ${top + tf / 2}`,
          `M 0 ${top + tf / 2} L 0 ${bottom - tf / 2}`,
          `M ${-b / 2} ${bottom - tf / 2} L ${b / 2} ${bottom - tf / 2}`,
        ].join(' ');
      }

      yMin = -b / 2;
      yMax = b / 2;
      zMin = -h / 2;
      zMax = h / 2;
      break;
    }
    case 't-section': {
      const { bf, hf, bw, h, idealisation } = shape;
      const zs = p.zs * M_TO_MM;
      const top = -zs;
      const flangeBottom = -zs + hf;
      const bottom = -zs + h;
      pathD = [
        `M ${-bf / 2} ${top}`,
        `L ${bf / 2} ${top}`,
        `L ${bf / 2} ${flangeBottom}`,
        `L ${bw / 2} ${flangeBottom}`,
        `L ${bw / 2} ${bottom}`,
        `L ${-bw / 2} ${bottom}`,
        `L ${-bw / 2} ${flangeBottom}`,
        `L ${-bf / 2} ${flangeBottom}`,
        'Z',
      ].join(' ');

      if (idealisation === 'thin-walled') {
        midlineD = [
          `M ${-bf / 2} ${top + hf / 2} L ${bf / 2} ${top + hf / 2}`,
          `M 0 ${top + hf / 2} L 0 ${bottom}`,
        ].join(' ');
      }

      yMin = -bf / 2;
      yMax = bf / 2;
      zMin = top;
      zMax = bottom;
      break;
    }
    case 'hollow-rectangle': {
      const { b, h, t, idealisation } = shape;
      pathD = [
        `M ${-b / 2} ${-h / 2} h ${b} v ${h} h ${-b} Z`,
        `M ${-b / 2 + t} ${-h / 2 + t} h ${b - 2 * t} v ${h - 2 * t} h ${-(b - 2 * t)} Z`,
      ].join(' ');

      if (idealisation === 'thin-walled') {
        midlineD = `M ${-b / 2 + t / 2} ${-h / 2 + t / 2} h ${b - t} v ${h - t} h ${-(b - t)} Z`;
      }

      yMin = -b / 2;
      yMax = b / 2;
      zMin = -h / 2;
      zMax = h / 2;
      break;
    }
  }

  if (points && points.length > 0) {
    for (const pt of points) {
      yMin = Math.min(yMin, pt.y);
      yMax = Math.max(yMax, pt.y);
      zMin = Math.min(zMin, pt.z);
      zMax = Math.max(zMax, pt.z);
    }
  }

  const width = yMax - yMin;
  const height = zMax - zMin;
  const span = Math.max(width, height, 10);
  const pad = span * 0.22;
  const vbX = yMin - pad;
  const vbY = zMin - pad;
  const vbWidth = width + 2 * pad;
  const vbHeight = height + 2 * pad;

  const strokeWidth = Math.max(span * 0.008, 0.6);
  const axisStroke = Math.max(span * 0.004, 0.4);
  const rectSize = Math.max(span * 0.035, 4);
  const fontSize = Math.max(span * 0.042, 5);

  const axisMarkup = `
    <g class="axes" stroke="#94a3b8" stroke-width="${axisStroke}" stroke-dasharray="${span * 0.015} ${span * 0.012}">
      <line x1="${yMin - pad * 0.5}" y1="0" x2="${yMax + pad * 0.5}" y2="0" />
      <line x1="0" y1="${zMin - pad * 0.5}" x2="0" y2="${zMax + pad * 0.5}" />
    </g>
    <text x="${yMax + pad * 0.55}" y="${fontSize * 0.35}" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="${fontSize * 0.8}" fill="#64748b" font-weight="600">y</text>
    <text x="${fontSize * 0.35}" y="${zMax + pad * 0.55}" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="${fontSize * 0.8}" fill="#64748b" font-weight="600">z</text>
  `;

  const centroidMarkup = `
    <circle cx="0" cy="0" r="${rectSize * 0.35}" fill="#ef4444" stroke="#ffffff" stroke-width="${rectSize * 0.12}">
      <title>Schwerpunkt S (y=0, z=0)</title>
    </circle>
  `;

  let stressPointsMarkup = '';
  if (points && points.length > 0) {
    const dist = rectSize * 1.15;
    const elements = points.map((pt) => {
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
          textY += dist + fontSize * 0.8;
          dominantBaseline = 'auto';
        } else {
          textX += dist;
          textY -= dist * 0.6;
          textAnchor = 'start';
        }
      }

      const tooltip = `Punkt ${pt.nr}: y = ${pt.y.toFixed(2)} mm, z = ${pt.z.toFixed(2)} mm, t = ${pt.t.toFixed(2)} mm, Sy = ${pt.Sy.toFixed(3)} cm³, Sz = ${pt.Sz.toFixed(3)} cm³`;

      return `
        <g class="stress-point" data-nr="${pt.nr}">
          <title>${tooltip}</title>
          <rect
            x="${pt.y - rectSize / 2}"
            y="${pt.z - rectSize / 2}"
            width="${rectSize}"
            height="${rectSize}"
            fill="#2563eb"
            stroke="#ffffff"
            stroke-width="${rectSize * 0.18}"
            rx="${rectSize * 0.15}"
          />
          <text
            x="${textX}"
            y="${textY}"
            text-anchor="${textAnchor}"
            dominant-baseline="${dominantBaseline}"
            font-family="Inter, ui-sans-serif, system-ui, sans-serif"
            font-size="${fontSize}"
            font-weight="700"
            fill="#1d4ed8"
            stroke="#ffffff"
            stroke-width="${rectSize * 0.35}"
            stroke-linejoin="round"
            paint-order="stroke fill"
          >${pt.nr}</text>
        </g>
      `;
    });
    stressPointsMarkup = `<g class="stress-points">${elements.join('')}</g>`;
  }

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

function propertyTable(p) {
  return `
<table class="values">
  <tbody>
    ${row('A', num(p.A * M2_TO_CM2, 'cm²'))}
    ${row('Iy', num(p.Iy * M4_TO_CM4, 'cm⁴'))}
    ${row('Iz', num(p.Iz * M4_TO_CM4, 'cm⁴'))}
    ${row('Iyz', num(p.Iyz * M4_TO_CM4, 'cm⁴'))}
    ${row('Iu', num(p.Iu * M4_TO_CM4, 'cm⁴'))}
    ${row('Iv', num(p.Iv * M4_TO_CM4, 'cm⁴'))}
    ${row('ys', num(p.ys * M_TO_MM, 'mm'))}
    ${row('zs', num(p.zs * M_TO_MM, 'mm'))}
    ${row('yM', maybe(p.yM === undefined ? undefined : p.yM * M_TO_MM, 'mm'))}
    ${row('zM', maybe(p.zM === undefined ? undefined : p.zM * M_TO_MM, 'mm'))}
    ${row('It', maybe(p.It === undefined ? undefined : p.It * M4_TO_CM4, 'cm⁴'))}
    ${row('alpha', `${p.alpha.toFixed(4)} rad`)}
    ${row('kappaY / kappaZ', `${kappa(p.kappaY)} / ${kappa(p.kappaZ)}`)}
  </tbody>
</table>`;
}

function stressTable(points) {
  const body = points
    .map(
      (sp) => `<tr>
        <td>${sp.nr}</td>
        <td>${sp.y.toFixed(2)}</td>
        <td>${sp.z.toFixed(2)}</td>
        <td>${sp.t.toFixed(2)}</td>
        <td>${sp.Sy.toFixed(3)}</td>
        <td>${sp.Sz.toFixed(3)}</td>
      </tr>`,
    )
    .join('');

  return `
<p class="muted">Spannungspunkte (${points.length}) — y/z/t in mm, S in cm³:</p>
<table class="points">
  <thead>
    <tr>
      <th>Nr</th>
      <th>y [mm]</th>
      <th>z [mm]</th>
      <th>t [mm]</th>
      <th>Sy [cm³]</th>
      <th>Sz [cm³]</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`;
}

function row(label, value) {
  return `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
}

function num(value, unit, digits = 2) {
  return `${value.toFixed(digits)} ${unit}`;
}

function maybe(value, unit) {
  return value === undefined ? '&ndash;' : num(value, unit);
}

function kappa(value) {
  return value === undefined ? 'schubstarr' : value.toFixed(4);
}

