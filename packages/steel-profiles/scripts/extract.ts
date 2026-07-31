/**
 * EINMALIGES Extraktionsskript: `data-source/*.md` -> `src/data/*.ts` plus die
 * Referenz-Fixture der Spannungspunkte.
 *
 *     node scripts/extract.ts        (Node >= 22.6 strippt Typen selbst)
 *
 * KEIN BUILD-SCHRITT. Die erzeugten Dateien werden EINGECHECKT — der Sinn des
 * Katalogs ist, dass man die Zahlen im Diff sieht. Wer die Quelldateien
 * austauscht, laesst das Skript einmal laufen und prueft den Diff.
 *
 * DREI NACHGEWIESENE PARSER-FALLEN in der PDF->Markdown-Konvertierung:
 *
 *  1. NICHT NAIV NACH LABEL GREPPEN. Die Zellen enthalten `<br>` und
 *     uneinheitliche Leerzeichen; `Schubflaeche<br>Az` trifft nur einen Teil
 *     der Zeilen. Nach Normalisierung (`<br>` -> Leerzeichen, Whitespace
 *     kollabieren) ist es eine saubere `| Label | Symbol | Wert | Einheit |`.
 *
 *  2. NICHT AUF DAS ROHE SYMBOL SCHLUESSELN. Die griechischen Buchstaben sind
 *     in den Symbolfont-Bereich der Private Use Area gerutscht: omega ist
 *     U+F077, alpha ist U+F061. `I omega` liest sich sonst als `I` und
 *     kollidiert mit nichts — bis jemand `It` und `Iy` danebenlegt. Wir bilden
 *     die beiden PUA-Zeichen zurueck ab; danach ist das Symbol EINDEUTIG und
 *     taugt als Schluessel.
 *
 *  3. ZELLEN KOENNEN UEBER ZEILENGRENZEN VERSCHMELZEN. Bei IPE 80 steht
 *     `Iw = 120.00` und `Wel,y = 20.03` in EINER Wertzelle, die naechste ist
 *     leer, und die Einheiten sind mitverrutscht. Das Skript repariert diesen
 *     Fall generisch (zwei Zahlen + leere Folgezeile) und PROTOKOLLIERT jede
 *     Reparatur, damit sie nicht unbemerkt bleibt.
 *
 * VIER ABBRUCHBEDINGUNGEN — ein stillschweigend uebersprungenes oder falsch
 * zugeordnetes Profil ist der wahrscheinlichste Fehler dieser Extraktion:
 *
 *  a) Zeilenzahl je Reihe (IPE 18, HEA 24).
 *  b) Kein Profilname doppelt — faengt zwei Bloecke, die denselben Seitenkopf
 *     erwischt haben.
 *  c) `h` muss ueber die Reihe STRENG WACHSEN — faengt eine Verschiebung der
 *     Bloecke gegen die Namen.
 *  d) `A` aus `h, b, tw, tf, r` nachgerechnet muss den Tabellenwert auf 1 %
 *     treffen — faengt eine Verschiebung der ZEILEN innerhalb eines Blocks.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const repoRoot = resolve(pkgRoot, '..', '..');

const SOURCE_NOTE =
  'RSTAB 8.29.01 Querschnittsdatenbank (Dlubal), Ausdruck vom 29.07.2026';

type Series = 'IPE' | 'HEA';

const EXPECTED_COUNT: Record<Series, number> = { IPE: 18, HEA: 24 };

/** Erwartete Anzahl Spannungspunkte je gewalztem I-Profil (RSTAB-Vertrag). */
const STRESS_POINTS_PER_PROFILE = 13;

// ---------------------------------------------------------------------------
// Normalisierung
// ---------------------------------------------------------------------------

/** Falle 2: die Symbolfont-Reste der PUA zurueck auf Griechisch. */
function unmangle(text: string): string {
  return text.replaceAll('\uF077', '\u03C9').replaceAll('\uF061', '\u03B1');
}

/** Falle 1: `<br>` und wilder Whitespace weg. */
function normalizeCell(text: string): string {
  return unmangle(text)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Im Symbol ist Whitespace bedeutungslos: `t s` ist `ts`, `S y,max` ist `Sy,max`. */
function normalizeSymbol(text: string): string {
  return normalizeCell(text).replace(/\s+/g, '');
}

function splitRow(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return undefined;
  const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|');
  if (cells.some((cell) => /^\s*:?-{3,}:?\s*$/.test(cell))) return undefined;
  return cells;
}

const NUMBER = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function numbersIn(text: string): number[] {
  return [...text.matchAll(NUMBER)].map((m) => Number(m[0]));
}

function isPureNumber(text: string): boolean {
  return /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text.trim());
}

// ---------------------------------------------------------------------------
// Bloecke lesen
// ---------------------------------------------------------------------------

type ValueRow = {
  label: string;
  symbol: string;
  value: string;
  unit: string;
  repaired: boolean;
};

type Block = {
  id: string;
  rows: ValueRow[];
  stressPoints: number[][];
};

/**
 * Der Profilname steht vor dem Block — aber in DREI Gestalten, je nachdem, wo
 * der Seitenumbruch fiel:
 *
 *     IPE 80                          eigene Zeile
 *     ## IPE 550 IPE 550              Seitenkopf, Bezeichnung doppelt
 *     |    |   |   | HEA 120 |        in die Kopfzeile der Tabelle gerutscht
 *
 * Gemeinsam ist ihnen: nimmt man Rauten und Tabellenstriche weg, bleibt NUR
 * die Bezeichnung uebrig, ein- oder mehrfach. Genau das ist die Bedingung —
 * eine Zeile mit weiterem Inhalt (etwa die Uebersichtstabelle `| 1 | IPE 80 1 |
 * 7.64 | ...`) faellt damit durch.
 */
function profileNameAbove(lines: string[], index: number): string | undefined {
  for (let i = index - 1; i >= 0 && i > index - 80; i--) {
    const bare = lines[i]
      .replace(/^#+/, '')
      .replaceAll('|', ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const match = bare.match(/^((IPE|HEA|HEB)\s*(\d+))(?:\s+\1)*$/);
    if (match) return `${match[2]} ${match[3]}`;
  }
  return undefined;
}

function readBlocks(markdown: string, series: Series): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  let current: Block | undefined;

  for (let i = 0; i < lines.length; i++) {
    const cells = splitRow(lines[i]);
    if (cells === undefined) continue;

    // Die Wertetabelle: | Label | Symbol | Wert | Einheit |
    if (cells.length === 4) {
      const label = normalizeCell(cells[0]);
      const symbol = normalizeSymbol(cells[1]);
      const value = normalizeCell(cells[2]);
      const unit = normalizeCell(cells[3]);

      // Ein neuer Block beginnt mit der Profilhoehe.
      if (label.startsWith('Profilh') && symbol === 'h' && unit === 'mm') {
        const id = profileNameAbove(lines, i);
        if (id === undefined) {
          throw new Error(
            `${series}: Block in Zeile ${i + 1} ohne erkennbaren Profilnamen.`,
          );
        }
        current = { id, rows: [], stressPoints: [] };
        blocks.push(current);
      }
      if (current !== undefined) {
        current.rows.push({ label, symbol, value, unit, repaired: false });
      }
      continue;
    }

    // Die Spannungspunkte: 8 rein numerische Zellen.
    if (cells.length === 8 && current !== undefined) {
      const values = cells.map(normalizeCell);
      if (values.every(isPureNumber)) {
        current.stressPoints.push(values.map(Number));
      }
    }
  }

  return blocks;
}

/**
 * Falle 3: zwei Zahlen in einer Wertzelle, naechste Zelle leer. Die zweite
 * Zahl gehoert der Folgezeile. Die Einheit ist dabei mitverrutscht und wird
 * deshalb fuer beide Zeilen als unzuverlaessig markiert.
 */
function repairMergedCells(block: Block, log: string[]): void {
  for (let i = 0; i < block.rows.length - 1; i++) {
    const row = block.rows[i];
    const next = block.rows[i + 1];
    if (next.value !== '') continue;
    const parts = numbersIn(row.value);
    if (parts.length !== 2) continue;
    log.push(
      `  ${block.id}: Wertzelle "${row.symbol}" = "${row.value}" aufgeteilt ` +
        `-> ${row.symbol}=${parts[0]}, ${next.symbol}=${parts[1]}`,
    );
    row.value = String(parts[0]);
    next.value = String(parts[1]);
    row.repaired = true;
    next.repaired = true;
  }
}

// ---------------------------------------------------------------------------
// Felder
// ---------------------------------------------------------------------------

type FieldSpec = {
  symbol: string;
  unit: string;
  /** Faktor auf den Tabellenwert, wenn die Quelle in anderer Einheit druckt. */
  factor?: number;
  optional?: boolean;
};

/**
 * Schluessel ist das (entmangelte, whitespace-freie) SYMBOL — nach Falle 2 ist
 * es innerhalb eines Blocks eindeutig, das Label ist es nicht („Statisches
 * Moment" steht zweimal da). Die Einheit reist als PRUEFUNG mit, nicht als
 * Schluessel.
 */
const FIELDS = {
  h: { symbol: 'h', unit: 'mm' },
  b: { symbol: 'b', unit: 'mm' },
  tw: { symbol: 'ts', unit: 'mm' },
  tf: { symbol: 'tg', unit: 'mm' },
  r: { symbol: 'r', unit: 'mm' },
  A: { symbol: 'A', unit: 'cm 2' },
  Ay: { symbol: 'Ay', unit: 'cm 2', optional: true },
  Az: { symbol: 'Az', unit: 'cm 2', optional: true },
  Iy: { symbol: 'Iy', unit: 'cm 4' },
  Iz: { symbol: 'Iz', unit: 'cm 4' },
  // Die Quelle druckt die Traegheitsradien in mm, der Datensatz fuehrt cm.
  iy: { symbol: 'iy', unit: 'mm', factor: 0.1 },
  iz: { symbol: 'iz', unit: 'mm', factor: 0.1 },
  Wely: { symbol: 'Wy', unit: 'cm 3' },
  Welz: { symbol: 'Wz', unit: 'cm 3' },
  Wply: { symbol: 'Wpl,y', unit: 'cm 3' },
  Wplz: { symbol: 'Wpl,z', unit: 'cm 3' },
  It: { symbol: 'It', unit: 'cm 4' },
  Iw: { symbol: 'Iω', unit: 'cm 6' },
  SyMax: { symbol: 'Sy,max', unit: 'cm 3' },
  SzMax: { symbol: 'Sz,max', unit: 'cm 3' },
  mass: { symbol: 'G', unit: 'kg/m' },
} satisfies Record<string, FieldSpec>;

type FieldName = keyof typeof FIELDS;

/** Reihenfolge im erzeugten Objektliteral — dieselbe wie in `SteelProfileData`. */
const FIELD_ORDER: FieldName[] = [
  'h',
  'b',
  'tw',
  'tf',
  'r',
  'A',
  'Ay',
  'Az',
  'Iy',
  'Iz',
  'iy',
  'iz',
  'Wely',
  'Welz',
  'Wply',
  'Wplz',
  'It',
  'Iw',
  'SyMax',
  'SzMax',
  'mass',
];

function readFields(block: Block): Record<string, number> {
  const bySymbol = new Map<string, ValueRow>();
  for (const row of block.rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, row);
  }

  const out: Record<string, number> = {};
  for (const name of FIELD_ORDER) {
    const spec: FieldSpec = FIELDS[name];
    const row = bySymbol.get(spec.symbol);
    if (row === undefined || row.value === '') {
      if (spec.optional) continue;
      throw new Error(`${block.id}: Feld "${name}" (${spec.symbol}) fehlt.`);
    }
    if (!row.repaired && row.unit !== spec.unit) {
      throw new Error(
        `${block.id}: Feld "${name}" hat Einheit "${row.unit}", erwartet "${spec.unit}".`,
      );
    }
    const parsed = Number(row.value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${block.id}: Feld "${name}" ist keine Zahl: "${row.value}".`);
    }
    out[name] = round(parsed * (spec.factor ?? 1));
  }
  return out;
}

/** Gleitkomma-Muell aus `* 0.1` wegschneiden, ohne echte Stellen zu verlieren. */
function round(value: number): number {
  return Number(value.toPrecision(12));
}

// ---------------------------------------------------------------------------
// Abbruchbedingungen
// ---------------------------------------------------------------------------

/**
 * `A` aus den Abmessungen: zwei Flansche, der Steg zwischen ihnen, dazu die
 * vier Ausrundungen. Eine Ausrundung fuellt `(1 - pi/4) r^2` der Ecke, vier
 * davon ergeben `(4 - pi) r^2`.
 *
 * Das ist hier KEIN Rechenkern, sondern eine Abbruchbedingung: sie faengt eine
 * Verschiebung der Zeilen innerhalb eines Blocks. Der Rechenkern lebt in
 * `@baustatik/cross-section` und hat dort seine eigenen Tests.
 */
function areaFromDimensions(f: Record<string, number>): number {
  const { h, b, tw, tf, r } = f;
  const mm2 = 2 * b * tf + (h - 2 * tf) * tw + (4 - Math.PI) * r * r;
  return mm2 / 100; // mm^2 -> cm^2
}

function assertPlausible(series: Series, rows: { id: string; f: Record<string, number> }[]): void {
  if (rows.length !== EXPECTED_COUNT[series]) {
    throw new Error(
      `${series}: ${rows.length} Profile gelesen, erwartet ${EXPECTED_COUNT[series]}.`,
    );
  }

  const ids = rows.map((r) => r.id);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate !== undefined) {
    throw new Error(`${series}: Profil "${duplicate}" doppelt gelesen.`);
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].f.h <= rows[i - 1].f.h) {
      throw new Error(
        `${series}: h waechst nicht — ${rows[i - 1].id} (${rows[i - 1].f.h}) ` +
          `vor ${rows[i].id} (${rows[i].f.h}). Bloecke gegen Namen verschoben?`,
      );
    }
  }

  for (const { id, f } of rows) {
    const computed = areaFromDimensions(f);
    const deviation = Math.abs(computed - f.A) / f.A;
    if (deviation > 0.01) {
      throw new Error(
        `${id}: A = ${f.A} cm2, aus h/b/tw/tf/r gerechnet ${computed.toFixed(3)} cm2 ` +
          `(${(deviation * 100).toFixed(1)} %). Zeilen im Block verschoben?`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------

function renderDataFile(
  series: Series,
  rows: { id: string; f: Record<string, number> }[],
): string {
  const entries = rows
    .map(({ id, f }) => {
      const fields = FIELD_ORDER.filter((name) => f[name] !== undefined)
        .map((name) => `${name}: ${f[name]}`)
        .join(', ');
      return `  '${id}': { ${fields} },`;
    })
    .join('\n');

  return `// Quelle: ${SOURCE_NOTE},
//         extrahiert mit scripts/extract.ts.
// Tabellenwerte — NICHT nachgerechnet. Abweichungen gegen einen
// Integrator sind erwartet (Ausrundungsradien, Rundung der Norm).
//
// ERZEUGT UND EINGECHECKT. Nicht von Hand pflegen: \`pnpm --filter
// @baustatik/steel-profiles extract\` neu laufen lassen und den Diff pruefen.
//
// Einheiten: h/b/tw/tf/r [mm], A/Ay/Az [cm2], Iy/Iz/It [cm4], iy/iz [cm],
// Wel/Wpl/SyMax/SzMax [cm3], Iw [cm6], mass [kg/m].

import type { SteelProfileData } from '../types';

export const ${series} = {
${entries}
} as const satisfies Record<string, SteelProfileData>;
`;
}

// ---------------------------------------------------------------------------
// Lauf
// ---------------------------------------------------------------------------

const log: string[] = [];
const fixture: Record<string, { nr: number; y: number; z: number; Sy: number; Sz: number; t: number }[]> = {};

for (const series of ['IPE', 'HEA'] as const) {
  const markdown = readFileSync(
    resolve(pkgRoot, 'data-source', `${series}.md`),
    'utf8',
  );
  const blocks = readBlocks(markdown, series);

  const rows = blocks.map((block) => {
    repairMergedCells(block, log);
    return { id: block.id, f: readFields(block), block };
  });

  assertPlausible(series, rows);

  for (const { id, block } of rows) {
    if (block.stressPoints.length !== STRESS_POINTS_PER_PROFILE) {
      throw new Error(
        `${id}: ${block.stressPoints.length} Spannungspunkte gelesen, ` +
          `erwartet ${STRESS_POINTS_PER_PROFILE}.`,
      );
    }
    // Spalten der Quelle: Nr | y [mm] | z [mm] | Sy [cm3] | Sz [cm3] | t [mm] | omega | Aomega
    fixture[id] = block.stressPoints.map((p) => ({
      nr: p[0],
      y: p[1],
      z: p[2],
      Sy: p[3],
      Sz: p[4],
      t: p[5],
    }));
  }

  writeFileSync(
    resolve(pkgRoot, 'src', 'data', `${series.toLowerCase()}.ts`),
    renderDataFile(series, rows),
    'utf8',
  );
  console.log(`${series}: ${rows.length} Profile geschrieben.`);
}

/**
 * Die Fixture landet in `cross-section` und nicht hier: sie ist das ORAKEL fuer
 * die dortige Spannungspunkt-Rechnung, nicht der Katalog. Dass ein Skript ueber
 * die Paketgrenze schreibt, ist vertretbar, weil es einmalig laeuft und kein
 * Build-Schritt ist; beide CONTEXT.md nennen es.
 */
writeFileSync(
  resolve(repoRoot, 'packages', 'cross-section', 'tests', 'fixtures', 'rstab-stress-points.json'),
  `${JSON.stringify(
    {
      _source: `${SOURCE_NOTE}; erzeugt von packages/steel-profiles/scripts/extract.ts.`,
      _units: 'y, z, t in mm; Sy, Sz in cm3. Koordinaten relativ zum Schwerpunkt.',
      profiles: fixture,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(
  `Fixture: ${Object.keys(fixture).length} Profile x ${STRESS_POINTS_PER_PROFILE} Punkte.`,
);

if (log.length > 0) {
  console.log('\nReparierte Zellen (Falle 3):');
  for (const line of log) console.log(line);
}
