/**
 * MESSGERAET, kein Regressionstest.
 *
 * DIE FRAGE: Wie weit liegt Grashof beim T-QUERSCHNITT neben der FE?
 *
 * WARUM SIE GESTELLT WIRD. Der Vollquerschnitt hat seit ADR 0045/0047 ZWEI
 * MASCHINEN, und das ist eine bekannte, offene Luecke (`packages/TODO.md`):
 *
 *   `kind: 'shape'` + `idealisation: 'solid'`  →  Grashof, aus `shear.ts`
 *   `kind: 'section-geometry'` (gezeichnet)    →  die FE
 *
 * Beide beantworten dieselbe Frage und geben verschiedene Zahlen. Fuer das
 * RECHTECK ist der Abstand gemessen und klein — 0,08 % (ADR 0045). Fuer die
 * T-Figur hat ihn niemand gemessen, und genau dort traegt Grashof ZWEI
 * Naeherungen statt einer:
 *
 *   1. ν-BLIND. `shear.ts` kennt keine Querdehnzahl; die FE liefert
 *      `1/κ = d0 + d2·m²` mit `m = ν/(1+ν)`.
 *   2. SCHUBSPANNUNG UEBER DIE SCHNITTBREITE KONSTANT. `τ = Q·S/(I·t)` mittelt
 *      ueber die Breite. Beim Rechteck ist das fast wahr; am Uebergang Gurt/Steg
 *      eines T springt `t` um den Faktor `bf/bw`, und die Spannung ist dort
 *      alles andere als konstant.
 *
 * DIE ZAHL, DIE HIER HERAUSKOMMT, ENTSCHEIDET UEBER DIE LUECKE. Ist sie klein,
 * darf die parametrische Form ihr Grashof-κ behalten. Ist sie gross, ist das
 * Argument fuer den Umbau gemessen statt vermutet.
 *
 * WAS DIESES SKRIPT NICHT TUT: es urteilt nicht. Es gibt keine Schranke,
 * unterhalb derer etwas „in Ordnung" waere — welche Abweichung tragbar ist,
 * entscheidet ein ADR und nicht ein Messgeraet.
 *
 * Lauf:  pnpm --filter @baustatik/cross-section build
 *        pnpm --filter @baustatik/cross-section-fe build
 *        node verifaction/t-querschnitt-grashof-gegen-fe.mjs
 *
 * Ausgabe: `docs/messungen/t-querschnitt-grashof-gegen-fe.md`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// `@baustatik/mesh-2d-wasm` wird mit endungslosen relativen Importen gebaut;
// das blanke Node loest die nicht auf.
register('./extensionless-hook.mjs', import.meta.url);

const CROSS_SECTION = new URL(
  '../packages/cross-section/dist/index.js',
  import.meta.url,
);
const CROSS_SECTION_FE = new URL(
  '../packages/cross-section-fe/dist/index.js',
  import.meta.url,
);
const REPORT_URL = new URL(
  '../docs/messungen/t-querschnitt-grashof-gegen-fe.md',
  import.meta.url,
);

/** Die Netzdichte der Messung — deutlich feiner als die Voreinstellung. */
const FE_ELEMENTS = 20000;

/**
 * Die Figuren. Vier T-Querschnitte mit stark verschiedenem `bf/bw`, weil genau
 * dieses Verhaeltnis die zweite Naeherung von Grashof belastet.
 */
const FIGURES = [
  {
    name: 'Plattenbalken 2000/200/250/500',
    note: 'bf/bw = 8 — der Fall aus den Vorgaben, Schwerpunkt im Gurt.',
    bf: 2000,
    hf: 200,
    bw: 250,
    h: 500,
  },
  {
    name: 'Plattenbalken 1000/150/300/600',
    note: 'bf/bw = 3,3 — gedrungener Steg.',
    bf: 1000,
    hf: 150,
    bw: 300,
    h: 600,
  },
  {
    name: 'Stahl-T 200/15/10/200',
    note: 'bf/bw = 20 — duennwandige Abmessungen, solid gerechnet.',
    bf: 200,
    hf: 15,
    bw: 10,
    h: 200,
  },
  {
    name: 'Quadrat-T 300/150/150/300',
    note: 'bf/bw = 2 — die Figur, bei der Grashof am wenigsten zu verlieren hat.',
    bf: 300,
    hf: 150,
    bw: 150,
    h: 300,
  },
];

/** Die Querdehnzahlen, fuer die die FE-Formel ausgewertet wird. */
const POISSON_VALUES = [0, 0.2, 0.3];

/**
 * Die T-Figur als EIN Ring aus acht Punkten — dieselbe Wicklung wie
 * `plattenbalken()` in `apps/demo/cross-section/outline-presets.ts`:
 * `signedArea > 0`, also Material (ADR 0034).
 */
function tRing(bf, hf, bw, h) {
  const yFlange = bf / 2;
  const yWeb = bw / 2;
  return {
    vertices: [
      { y: -yFlange, z: 0 },
      { y: yFlange, z: 0 },
      { y: yFlange, z: hf },
      { y: yWeb, z: hf },
      { y: yWeb, z: h },
      { y: -yWeb, z: h },
      { y: -yWeb, z: hf },
      { y: -yFlange, z: hf },
    ],
  };
}

async function main() {
  const cs = await import(CROSS_SECTION.href);
  const fe = await import(CROSS_SECTION_FE.href);

  const policy = cs.createSectionPolicy({ FEElements: FE_ELEMENTS });
  const rows = [];

  for (const figure of FIGURES) {
    const { bf, hf, bw, h } = figure;

    // 1. GRASHOF, aus der parametrischen Form. Sie kennt kein ν.
    const grashof = cs.sectionProperties({
      kind: 'shape',
      id: 'grashof',
      shape: { kind: 't-section', bf, hf, bw, h, idealisation: 'solid' },
    });

    // 2. DIE FE, auf DERSELBEN Figur als gezeichnetem Umriss.
    const geometry = cs.createSectionGeometry(
      { kind: 'outline', rings: [tRing(bf, hf, bw, h)] },
      policy,
    );
    const { state, mesh } = await fe.computeFESectionValues(geometry, policy);
    if (state.status !== 'computed') {
      throw new Error(`${figure.name}: die FE hat verweigert (${state.reason}).`);
    }

    // Die Flaechen muessen uebereinstimmen — sonst vergleicht die Messung zwei
    // verschiedene Figuren, und alles Weitere ist wertlos.
    const outline = cs.sectionProperties(
      { kind: 'section-geometry', id: 'fe', geometry },
      policy,
    );

    const kappa = POISSON_VALUES.map((nu) => ({
      nu,
      fe: cs.kappaFromCoefficients(state.values.inverseKappaZ, nu),
    }));

    rows.push({
      ...figure,
      ratio: bf / bw,
      elements: mesh === undefined ? 0 : mesh.elements.length / 6,
      A: grashof.A,
      Aoutline: outline.A,
      Iy: grashof.Iy,
      IyOutline: outline.Iy,
      grashofKappaZ: grashof.kappaZ,
      grashofKappaY: grashof.kappaY,
      feKappaY: POISSON_VALUES.map((nu) => ({
        nu,
        value: cs.kappaFromCoefficients(state.values.inverseKappaY, nu),
      })),
      feKappaZ: kappa,
      d0: state.values.inverseKappaZ[0],
      d2: state.values.inverseKappaZ[1],
      It: state.values.It,
      zM: state.values.zM,
      zs: outline.zs,
    });

    console.log(`${figure.name}`);
    console.log(`  bf/bw               ${(bf / bw).toFixed(2)}`);
    console.log(`  A  (Form / Umriss)  ${grashof.A.toExponential(9)} / ${outline.A.toExponential(9)}`);
    console.log(`  Iy (Form / Umriss)  ${grashof.Iy.toExponential(9)} / ${outline.Iy.toExponential(9)}`);
    console.log(`  Grashof kappaZ      ${grashof.kappaZ.toFixed(6)}   (ν-blind)`);
    for (const { nu, fe: value } of kappa) {
      const delta = ((grashof.kappaZ - value) / value) * 100;
      console.log(
        `  FE kappaZ (ν=${nu.toFixed(2)})  ${value.toFixed(6)}   Grashof liegt ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} % daneben`,
      );
    }
    console.log('');
  }

  writeReport(rows);
  console.log(`Bericht: ${fileURLToPath(REPORT_URL)}`);
}

function writeReport(rows) {
  const lines = [];
  lines.push('# T-Querschnitt: Grashof gegen FE');
  lines.push('');
  lines.push(
    'Erzeugt von [`verifaction/t-querschnitt-grashof-gegen-fe.mjs`](../../verifaction/t-querschnitt-grashof-gegen-fe.mjs).',
  );
  lines.push(
    'Beleg zur offenen Lücke aus [ADR 0045](../adr/0045-solid-section-values-are-nu-free-coefficients.md)',
  );
  lines.push('und [ADR 0047](../adr/0047-the-solid-section-fe-lives-in-its-own-package.md).');
  lines.push('');
  lines.push('## Die Frage');
  lines.push('');
  lines.push(
    'Der Vollquerschnitt hat zwei Maschinen: die parametrische Form rechnet κ nach',
  );
  lines.push(
    'Grashof (`shear.ts`), die gezeichnete Figur über die FE. Für das Rechteck liegen',
  );
  lines.push(
    'sie 0,08 % auseinander. Für die T-Figur war es nie gemessen — und dort trägt',
  );
  lines.push('Grashof zwei Näherungen statt einer:');
  lines.push('');
  lines.push('- **ν-blind.** `shear.ts` kennt keine Querdehnzahl.');
  lines.push(
    '- **Schubspannung über die Schnittbreite konstant.** `τ = Q·S/(I·t)` mittelt über',
  );
  lines.push(
    '  die Breite; am Übergang Gurt/Steg springt `t` um den Faktor `bf/bw`.',
  );
  lines.push('');
  lines.push(
    `Gemessen mit ${FE_ELEMENTS} Tri6-Elementen je Figur (\`@baustatik/mesh-2d-wasm\`,`,
  );
  lines.push('`@baustatik/sparse-solver-wasm`).');
  lines.push('');
  lines.push('## Erst die Gegenprobe: dieselbe Figur');
  lines.push('');
  lines.push(
    'Bevor κ verglichen wird, muss belegt sein, dass beide Wege über DIESELBE Figur',
  );
  lines.push(
    'rechnen. `A` und `Iy` fallen bei der Form aus der Formel und beim Umriss aus Green —',
  );
  lines.push('zwei Wege, eine Zahl.');
  lines.push('');
  lines.push('| Figur | `A` Form [m²] | `A` Umriss [m²] | Δ | `Iy` Form [m⁴] | `Iy` Umriss [m⁴] | Δ |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.name} | ${row.A.toExponential(6)} | ${row.Aoutline.toExponential(6)} | ` +
        `${percent(row.Aoutline, row.A)} | ${row.Iy.toExponential(6)} | ` +
        `${row.IyOutline.toExponential(6)} | ${percent(row.IyOutline, row.Iy)} |`,
    );
  }
  lines.push('');
  lines.push('## Die Zahl');
  lines.push('');
  lines.push(
    '`Δ` ist, um wieviel Grashof über der FE liegt — positiv heißt: Grashof rechnet',
  );
  lines.push('den Querschnitt **schubsteifer**, als er ist.');
  lines.push('');
  lines.push(
    '| Figur | `bf/bw` | Grashof κ_z | ' +
      POISSON_VALUES.map((nu) => `FE κ_z (ν=${format(nu)})`).join(' | ') +
      ' | ' +
      POISSON_VALUES.map((nu) => `Δ (ν=${format(nu)})`).join(' | ') +
      ' |',
  );
  lines.push(`| --- | --- | --- |${' --- |'.repeat(POISSON_VALUES.length * 2)}`);
  for (const row of rows) {
    const values = row.feKappaZ.map((entry) => entry.fe.toFixed(6));
    const deltas = row.feKappaZ.map((entry) =>
      `${((row.grashofKappaZ - entry.fe) / entry.fe) * 100 >= 0 ? '+' : ''}` +
      `${(((row.grashofKappaZ - entry.fe) / entry.fe) * 100).toFixed(2)} %`,
    );
    lines.push(
      `| ${row.name} | ${row.ratio.toFixed(2)} | ${row.grashofKappaZ.toFixed(6)} | ` +
        `${values.join(' | ')} | ${deltas.join(' | ')} |`,
    );
  }
  lines.push('');
  lines.push('## Was die FE zusätzlich liefert');
  lines.push('');
  lines.push(
    'Die parametrische Form gibt für `t-section` + `solid` weder `It` noch `zM` —',
  );
  lines.push(
    'dauerhaft, weil die FE einen Polygonzug braucht und `ShapeSpec` keinen trägt.',
  );
  lines.push('Die gezeichnete Figur gibt beides.');
  lines.push('');
  lines.push('| Figur | `d0` | `d2` | `It` [m⁴] | `zs` [m] | `zM` [m] |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.name} | ${row.d0.toFixed(6)} | ${row.d2.toFixed(6)} | ` +
        `${row.It.toExponential(6)} | ${row.zs.toFixed(6)} | ${row.zM.toFixed(6)} |`,
    );
  }
  lines.push('');
  lines.push('## Was hier NICHT steht');
  lines.push('');
  lines.push(
    'Keine Schranke. Welche Abweichung tragbar ist, entscheidet ein ADR und nicht',
  );
  lines.push(
    'dieses Messgerät — und der Ausweg steht ohnehin fest und ist nicht gebaut: wer',
  );
  lines.push(
    'FE-Werte für eine parametrische Form will, zeichnet die Figur. Genau das tun die',
  );
  lines.push('Vorgaben auf `outline-sections.html`.');
  lines.push('');

  mkdirSync(dirname(fileURLToPath(REPORT_URL)), { recursive: true });
  writeFileSync(REPORT_URL, `${lines.join('\n')}\n`, 'utf8');
}

function percent(computed, expected) {
  const delta = ((computed - expected) / expected) * 100;
  if (delta === 0) return 'exakt';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toExponential(2)} %`;
}

function format(value) {
  return String(value).replace('.', ',');
}

await main();
