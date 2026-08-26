/**
 * MESSGERAET, kein Regressionstest.
 *
 * DIE FRAGE, IN IHRER ZWEITEN FASSUNG: Rechnen die beiden Eingabearten
 * desselben T-Querschnitts jetzt DIESELBE Zahl?
 *
 * WAS DIESES SKRIPT FRUEHER FRAGTE. Der Vollquerschnitt hatte seit
 * ADR 0045/0047 ZWEI MASCHINEN:
 *
 *   `kind: 'shape'` + `idealisation: 'solid'`  →  Grashof, aus `shear.ts`
 *   `kind: 'section-geometry'` (gezeichnet)    →  die FE
 *
 * Gemessen lag Grashof beim T +10,71 % bis +133,62 % zu schubsteif — die Zahl,
 * die den Umbau entschieden hat. Sie steht unten in der Tabelle
 * „Was vorher war" und ist DORT EINGETRAGEN, nicht mehr gerechnet: die
 * Grashof-Pfade des Vollquerschnitts sind mit
 * [ADR 0062](../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
 * geloescht. Ein Messgeraet, das eine geloeschte Rechenstrecke aufruft, misst
 * nichts.
 *
 * WAS ES JETZT FRAGT. Die parametrische Form schreibt sich ueber
 * `shapeOutline` als `Ring[]` aus und laeuft durch dieselbe FE. Die Frage ist
 * damit nicht mehr „wie weit liegen die beiden auseinander", sondern
 * „SIND SIE DIESELBE FIGUR" — und die Antwort muss BITGENAU ja lauten, nicht
 * „auf sechs Stellen". Zwei Wege, die dieselben Punkte erzeugen, erzeugen
 * dasselbe Netz und dieselbe Faktorisierung.
 *
 *   Spalte A: `shapeOutline(spec)` → FE
 *   Spalte B: der von Hand geschriebene Ring derselben Figur → FE
 *
 * Spalte B ist die Figur, die frueher in `outline-presets.ts` und in diesem
 * Skript von Hand danebenstand — der unabhaengige Zeuge dafuer, dass der
 * Schreiber nicht seine eigene Willkuer bestaetigt.
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
 * dieses Verhaeltnis die zweite Naeherung von Grashof belastet hat.
 *
 * `grashofKappaZ` ist der HISTORISCHE Wert aus dem Lauf vom 2026-08-17, als
 * `solidPaths` in `calculation/shapes/t-section.ts` noch existierte. Er wird
 * nicht mehr gerechnet, sondern zitiert — und er steht hier, damit der Bericht
 * seine eigene Vorgeschichte traegt.
 */
const FIGURES = [
  {
    name: 'Plattenbalken 2000/200/250/500',
    note: 'bf/bw = 8 — der Fall aus den Vorgaben, Schwerpunkt im Gurt.',
    bf: 2000,
    hf: 200,
    bw: 250,
    h: 500,
    grashofKappaZ: 0.437009,
  },
  {
    name: 'Plattenbalken 1000/150/300/600',
    note: 'bf/bw = 3,3 — gedrungener Steg.',
    bf: 1000,
    hf: 150,
    bw: 300,
    h: 600,
    grashofKappaZ: 0.605606,
  },
  {
    name: 'Stahl-T 200/15/10/200',
    note: 'bf/bw = 20 — duennwandige Abmessungen, solid gerechnet.',
    bf: 200,
    hf: 15,
    bw: 10,
    h: 200,
    grashofKappaZ: 0.363692,
  },
  {
    name: 'Quadrat-T 300/150/150/300',
    note: 'bf/bw = 2 — die Figur, bei der Grashof am wenigsten zu verlieren hatte.',
    bf: 300,
    hf: 150,
    bw: 150,
    h: 300,
    grashofKappaZ: 0.781654,
  },
];

/** Die Querdehnzahlen, fuer die die FE-Formel ausgewertet wird. */
const POISSON_VALUES = [0, 0.2, 0.3];

/**
 * Die T-Figur als EIN Ring aus acht Punkten, VON HAND — der unabhaengige
 * Zeuge gegen `shapeOutline`. Dieselbe Wicklung wie `plattenbalken()` in
 * `apps/demo/cross-section/outline-presets.ts`: `signedArea > 0`, also Material
 * ([ADR 0034](../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
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
    const spec = { kind: 't-section', bf, hf, bw, h, idealisation: 'solid' };

    // 1. DIE PARAMETRISCHE FORM, ausgeschrieben. Genau der Weg, den die
    //    Anwendung geht (`apps/demo/cross-section/section-fe-geometry.ts`).
    const written = cs.shapeOutline(spec);
    if (written === undefined) {
      throw new Error(`${figure.name}: shapeOutline lieferte undefined.`);
    }
    const shapeGeometry = cs.createSectionGeometry(
      { kind: 'outline', rings: written },
      policy,
    );
    const shapeRun = await fe.computeFESectionValues(shapeGeometry, policy);
    if (shapeRun.state.status !== 'computed') {
      throw new Error(
        `${figure.name}: die FE hat die Form abgelehnt (${shapeRun.state.reason}).`,
      );
    }

    // 2. DIESELBE FIGUR, von Hand gezeichnet.
    const drawnGeometry = cs.createSectionGeometry(
      { kind: 'outline', rings: [tRing(bf, hf, bw, h)] },
      policy,
    );
    const drawnRun = await fe.computeFESectionValues(drawnGeometry, policy);
    if (drawnRun.state.status !== 'computed') {
      throw new Error(
        `${figure.name}: die FE hat die Zeichnung abgelehnt (${drawnRun.state.reason}).`,
      );
    }

    // 3. DIE WERTE, wie die Anwendung sie liest: FE-Block an den Satz, fertig.
    const resolved = cs.sectionProperties(
      { kind: 'shape', id: 'form', shape: spec, feValues: shapeRun.state },
      policy,
    );
    const unresolved = cs.sectionProperties(
      { kind: 'shape', id: 'form', shape: spec },
      policy,
    );

    const shapeValues = shapeRun.state.values;
    const drawnValues = drawnRun.state.values;

    rows.push({
      ...figure,
      ratio: bf / bw,
      elements: shapeRun.mesh === undefined ? 0 : shapeRun.mesh.elements.length / 6,
      A: unresolved.A,
      Afingerprint: shapeRun.state.fingerprint.A,
      Iy: unresolved.Iy,
      Iyfingerprint: shapeRun.state.fingerprint.Iy,
      identical:
        shapeValues.It === drawnValues.It &&
        shapeValues.yM === drawnValues.yM &&
        shapeValues.zM === drawnValues.zM &&
        shapeValues.inverseKappaZ[0] === drawnValues.inverseKappaZ[0] &&
        shapeValues.inverseKappaZ[1] === drawnValues.inverseKappaZ[1],
      kappaZ: POISSON_VALUES.map((nu) => ({
        nu,
        shape: cs.kappaFromCoefficients(shapeValues.inverseKappaZ, nu),
        drawn: cs.kappaFromCoefficients(drawnValues.inverseKappaZ, nu),
      })),
      d0: shapeValues.inverseKappaZ[0],
      d2: shapeValues.inverseKappaZ[1],
      It: resolved.It,
      zM: resolved.zM,
      zs: resolved.zs,
      unresolvedIt: unresolved.It,
      unresolvedKappaZ: unresolved.kappaZ,
    });

    console.log(`${figure.name}`);
    console.log(`  bf/bw                    ${(bf / bw).toFixed(2)}`);
    console.log(
      `  A (Formel / Netz)        ${unresolved.A.toExponential(9)} / ${shapeRun.state.fingerprint.A.toExponential(9)}`,
    );
    console.log(`  Beide Wege bitgleich     ${rows.at(-1).identical ? 'ja' : 'NEIN'}`);
    for (const { nu, shape: a, drawn: b } of rows.at(-1).kappaZ) {
      console.log(
        `  kappaZ (ν=${nu.toFixed(2)})         Form ${a.toFixed(9)} / Zeichnung ${b.toFixed(9)}`,
      );
    }
    console.log(
      `  ohne FE-Block            It ${unresolved.It === undefined ? 'undefined' : unresolved.It} · kappaZ ${unresolved.kappaZ === undefined ? 'undefined (schubstarr)' : unresolved.kappaZ}`,
    );
    console.log('');
  }

  writeReport(rows);
  console.log(`Bericht: ${fileURLToPath(REPORT_URL)}`);
}

function writeReport(rows) {
  const lines = [];
  lines.push('# T-Querschnitt: Grashof gegen FE — geschlossen');
  lines.push('');
  lines.push(
    'Erzeugt von [`verifaction/t-querschnitt-grashof-gegen-fe.mjs`](../../verifaction/t-querschnitt-grashof-gegen-fe.mjs).',
  );
  lines.push(
    'Beleg zu [ADR 0062](../adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md) —',
  );
  lines.push(
    'und, in der Tabelle „Was vorher war", zur Lücke, die [ADR 0045](../adr/0045-solid-section-values-are-nu-free-coefficients.md)',
  );
  lines.push('und [ADR 0047](../adr/0047-the-solid-section-fe-lives-in-its-own-package.md) offen ließen.');
  lines.push('');
  lines.push('## Die Frage, in ihrer zweiten Fassung');
  lines.push('');
  lines.push(
    'Der Vollquerschnitt hatte zwei Maschinen: die parametrische Form rechnete κ nach',
  );
  lines.push(
    'Grashof (`shear.ts`), die gezeichnete Figur über die FE. Seit ADR 0062 schreibt',
  );
  lines.push(
    'die Form sich über `shapeOutline` als `Ring[]` aus und läuft durch dieselbe FE.',
  );
  lines.push('');
  lines.push(
    'Gefragt ist damit nicht mehr, wie weit die beiden auseinanderliegen, sondern ob',
  );
  lines.push(
    'sie **dieselbe Figur** sind — und die Antwort muss BITGENAU ja lauten, nicht',
  );
  lines.push(
    '„auf sechs Stellen". Zwei Wege, die dieselben Punkte erzeugen, erzeugen dasselbe',
  );
  lines.push('Netz und dieselbe Faktorisierung.');
  lines.push('');
  lines.push(
    'Gemessen mit 20000 Tri6-Elementen je Figur (`@baustatik/mesh-2d-wasm`,',
  );
  lines.push('`@baustatik/sparse-solver-wasm`).');
  lines.push('');
  lines.push('## Der geschlossene Zustand');
  lines.push('');
  lines.push(
    '`shapeOutline(spec)` gegen den von Hand geschriebenen Ring derselben Figur —',
  );
  lines.push(
    'beide durch `computeFESectionValues`. Verglichen werden `It`, `yM`, `zM` und',
  );
  lines.push('beide κ-Koeffizienten, auf Gleichheit und nicht auf Nähe.');
  lines.push('');
  lines.push('| Figur | `bf/bw` | Elemente | Form κ_z (ν=0) | Zeichnung κ_z (ν=0) | bitgleich |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const first = row.kappaZ[0];
    lines.push(
      `| ${row.name} | ${row.ratio.toFixed(2)} | ${row.elements} | ${first.shape.toFixed(9)} | ${first.drawn.toFixed(9)} | ${row.identical ? 'ja' : '**NEIN**'} |`,
    );
  }
  lines.push('');
  lines.push('## Die Gegenprobe: Formel gegen Netz');
  lines.push('');
  lines.push(
    '`A` und `Iy` fallen bei der Form aus der geschlossenen Formel und beim FE-Lauf',
  );
  lines.push(
    'aus dem NETZ (`state.fingerprint`). Die Formel ist damit nicht mehr der zweite',
  );
  lines.push('Rechenweg, sondern das **Orakel** des ersten (ADR 0062).');
  lines.push('');
  lines.push('| Figur | `A` Formel [m²] | `A` Netz [m²] | Δ | `Iy` Formel [m⁴] | `Iy` Netz [m⁴] | Δ |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.name} | ${row.A.toExponential(6)} | ${row.Afingerprint.toExponential(6)} | ${deviation(row.Afingerprint, row.A)} | ${row.Iy.toExponential(6)} | ${row.Iyfingerprint.toExponential(6)} | ${deviation(row.Iyfingerprint, row.Iy)} |`,
    );
  }
  lines.push('');
  lines.push('## Was jetzt an der Form steht');
  lines.push('');
  lines.push(
    'Mit aufgelöstem FE-Block gibt `sectionProperties` für `kind: \'shape\'` dieselben',
  );
  lines.push('Werte wie für die gezeichnete Figur. `zM` ist die Zahl, die vorher fehlte.');
  lines.push('');
  lines.push('| Figur | `d0` | `d2` | `It` [m⁴] | `zs` [m] | `zM` [m] |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.name} | ${row.d0.toFixed(6)} | ${row.d2.toFixed(6)} | ${row.It.toExponential(6)} | ${row.zs.toFixed(6)} | ${row.zM.toFixed(6)} |`,
    );
  }
  lines.push('');
  lines.push('## Ohne FE-Block');
  lines.push('');
  lines.push(
    'Der dritte Zustand, und der Preis dieser Entscheidung: eine frisch eingegebene',
  );
  lines.push(
    'Form ist **schubstarr**, bis ein Lauf sie auflöst. Grashof lieferte immer eine',
  );
  lines.push('Zahl — auch dort, wo sie um 134 % danebenlag.');
  lines.push('');
  lines.push('| Figur | `It` | `kappaZ` |');
  lines.push('| --- | --- | --- |');
  for (const row of rows) {
    lines.push(
      `| ${row.name} | ${row.unresolvedIt === undefined ? '–' : row.unresolvedIt} | ${row.unresolvedKappaZ === undefined ? 'schubstarr' : row.unresolvedKappaZ} |`,
    );
  }
  lines.push('');
  lines.push('## Was vorher war');
  lines.push('');
  lines.push(
    'Die Zahlen, die den Umbau entschieden haben — Lauf vom 2026-08-17, als',
  );
  lines.push(
    '`solidPaths` in `calculation/shapes/t-section.ts` noch existierte. Sie werden',
  );
  lines.push(
    'nicht mehr gerechnet, sondern **zitiert**: die Grashof-Pfade des',
  );
  lines.push(
    'Vollquerschnitts sind gelöscht. `Δ` ist, um wieviel Grashof über der FE lag —',
  );
  lines.push('positiv heißt: Grashof rechnete den Querschnitt **schubsteifer**, als er ist.');
  lines.push('');
  lines.push(
    'Die FE-Spalte ist NEU GERECHNET, die Grashof-Spalte zitiert — deshalb weichen',
  );
  lines.push(
    'die Prozentzahlen in der zweiten Nachkommastelle von der Fassung vom 2026-08-17',
  );
  lines.push(
    'ab (anderes Netz). Die Aussage bewegt sich davon nicht: die Lücke lag zwischen',
  );
  lines.push('rund +11 % und rund +134 %.');
  lines.push('');
  lines.push('| Figur | Grashof κ_z | FE κ_z (ν=0) | Δ (ν=0) | Δ (ν=0,2) | Δ (ν=0,3) |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    const cells = row.kappaZ.map(
      ({ shape }) => `+${(((row.grashofKappaZ - shape) / shape) * 100).toFixed(2)} %`,
    );
    lines.push(
      `| ${row.name} | ${row.grashofKappaZ.toFixed(6)} | ${row.kappaZ[0].shape.toFixed(6)} | ${cells[0]} | ${cells[1]} | ${cells[2]} |`,
    );
  }
  lines.push('');
  lines.push('## Was hier NICHT steht');
  lines.push('');
  lines.push(
    'Keine Schranke. Welche Abweichung tragbar ist, entscheidet ein ADR und nicht',
  );
  lines.push(
    'dieses Messgerät. Was der Bericht belegt, ist die GLEICHHEIT der beiden',
  );
  lines.push('Eingabearten — nicht, dass die FE-Zahl richtig ist. Dafür stehen die Orakel in');
  lines.push('`packages/cross-section-fe/tests/oracles.test.ts`.');
  lines.push('');

  mkdirSync(dirname(fileURLToPath(REPORT_URL)), { recursive: true });
  writeFileSync(REPORT_URL, lines.join('\n'), 'utf8');
}

/** Relative Abweichung, oder „exakt", wenn die Bits gleich sind. */
function deviation(value, reference) {
  if (value === reference) return 'exakt';
  return `${(((value - reference) / reference) * 100).toExponential(2)} %`;
}

await main();
