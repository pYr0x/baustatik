import { writeFileSync } from 'node:fs';
import pw from 'file:///C:/Users/pYr0x/Documents/baustatik/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.js';
const { chromium } = pw;
import { momentArcPath, momentHeadPath } from './moment-path2.mjs';

const COLOR = '#1d4ed8';
const SW = 2;
const DEG = Math.PI / 180;
const CELL = 170;

function cell(title, inner) {
  return `<figure>
    <svg width="${CELL}" height="${CELL}" viewBox="${-CELL / 2} ${-CELL / 2} ${CELL} ${CELL}">
      ${inner}
    </svg>
    <figcaption>${title}</figcaption>
  </figure>`;
}

// Ein Stueck Stab + Knoten, wie im Viewer (beamColor/nodeColor grob).
const SCENE = `<line x1="${-CELL / 2}" y1="0" x2="${CELL / 2}" y2="0" stroke="#334155" stroke-width="3"/>
               <circle cx="0" cy="0" r="4" fill="#0f172a"/>`;

function momentSvg({ r, startDeg, sweepDeg, pl, pw: pwid }) {
  const sweep = sweepDeg * DEG;
  const start = startDeg * DEG;
  return `<path d="${momentArcPath(0, 0, r, start, sweep, pl)}" fill="none" stroke="${COLOR}" stroke-width="${SW}"/>
          <path d="${momentHeadPath(0, 0, r, start + sweep, sweep, pl, pwid)}" fill="${COLOR}"/>`;
}

// Der vorhandene Kraftpfeil fz nach unten: Spitze im Knoten, Schaft nach oben.
// const fz = straightArrowPaths(0, 0, 0, 1, 48, 10, 8);
// const FZ = `<path d="${fz.shaft}" fill="none" stroke="${COLOR}" stroke-width="${SW}"/>
//             <path d="${fz.head}" fill="${COLOR}"/>`;
const FZ = '';

const gaps = [
  ['Luecke links', 135],
  ['Luecke rechts', -45],
  ['Luecke oben', -135],
  ['Luecke unten', 45],
];

const row1 = gaps.map(([name, startDeg]) =>
  cell(
    `${name}<br><small>r=22, mit fz</small>`,
    SCENE + FZ + momentSvg({ r: 22, startDeg, sweepDeg: -270, pl: 10, pw: 8 }),
  ),
);

const heads = [
  [8, 7],
  [10, 8],
  [12, 9],
  [14, 10],
];
const row2 = heads.map(([pl, pwid]) =>
  cell(
    `Kopf ${pl}x${pwid}<br><small>r=22, 270&deg;</small>`,
    SCENE + momentSvg({ r: 22, startDeg: 135, sweepDeg: -270, pl, pw: pwid }),
  ),
);

const radii = [16, 20, 24, 28];
const row3 = radii.map((r) =>
  cell(
    `r=${r}<br><small>Kopf 12x9, 270&deg;</small>`,
    SCENE + momentSvg({ r, startDeg: 135, sweepDeg: -270, pl: 12, pw: 9 }),
  ),
);

const row4 = [
  cell(
    'positives M<br><small>+z nach +x, also gegen UZS</small>',
    SCENE + momentSvg({ r: 22, startDeg: 135, sweepDeg: -270, pl: 12, pw: 9 }),
  ),
  cell(
    'negatives M<br><small>im UZS</small>',
    SCENE + momentSvg({ r: 22, startDeg: -135, sweepDeg: 270, pl: 12, pw: 9 }),
  ),
  cell(
    'Stabmoment mittig<br><small>+ Label rechts</small>',
    SCENE +
    momentSvg({ r: 22, startDeg: 135, sweepDeg: -270, pl: 12, pw: 9 }) +
    `<rect x="30" y="-9" width="52" height="18" rx="3" fill="#dbeafe" stroke="${COLOR}"/>
       <text x="56" y="4" font="12px sans-serif" font-size="12" font-family="sans-serif" fill="${COLOR}" text-anchor="middle">12 kNm</text>`,
  ),
  cell(
    'fz + M zusammen<br><small>Luecke oben frei fuer fz</small>',
    SCENE + FZ + momentSvg({ r: 22, startDeg: -135, sweepDeg: -270, pl: 12, pw: 9 }),
  ),
];

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; background:#fff; font:12px/1.4 system-ui,sans-serif; color:#374151; }
  #grid { display:grid; grid-template-columns:repeat(4, ${CELL}px); gap:6px 10px; padding:12px; width:max-content; }
  figure { margin:0; }
  figcaption { text-align:center; margin-top:2px; }
  small { color:#6b7280; }
</style><div id="grid">${[...row1, ...row2, ...row3, ...row4].join('')}</div>`;

const out = new URL('.', import.meta.url).pathname.replace(/^\//, '');
writeFileSync(`${out}preview2.html`, html);

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setContent(html);
await page.locator('#grid').screenshot({ path: `${out}moment-preview2.png` });
await browser.close();
console.log('written');
