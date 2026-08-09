// ADR 0036: bis zur ersten Freigabe ist jeder Changeset `patch`. Dieses Skript
// prüft die Frontmatter-Bump-Labels aller ausstehenden Changesets und bricht mit
// Exit-Code 1 ab, wenn eines nicht `patch` heißt.
//
// Absichtlich ohne Abhängigkeit vom internen `@changesets/parse`: die Regeln
// hier sind die des echten Tools — der Name im Key kann einfach, doppelt oder
// ungequotet stehen, und weil YAML dieselbe Freiheit dem WERT lässt, gilt sie
// hier für beide Seiten des Doppelpunkts.
//
// GEMELDET WIRD ALLES, WAS NICHT `patch` IST, und nicht nur `major`/`minor`:
// eine Liste der verbotenen Wörter ließe jeden Tippfehler durch, und das
// eigentliche Tool bräche daran später mit einer ganz anderen Meldung.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHANGESET_DIR = join(process.cwd(), '.changeset');
const FILES = readdirSync(CHANGESET_DIR)
  .filter((name) => name.endsWith('.md') && name !== 'README.md')
  .sort();

// Beide Seiten dürfen quotiert sein; die Rückverweise halten die Quotes
// paarweise. Ohne sie ging `"@baustatik/core": "major"` als gültiges YAML durch
// die Prüfung, weil nur der UNQUOTIERTE Wert erkannt wurde.
const BUMP_LINE = /^\s*(["']?)([^"':]+)\1\s*:\s*(["']?)([A-Za-z]+)\3\s*$/;

let violations = 0;

for (const file of FILES) {
  const content = readFileSync(join(CHANGESET_DIR, file), 'utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatter === null) continue;

  for (const line of frontmatter[1].split('\n')) {
    if (line.trimStart().startsWith('#')) continue;

    const match = line.match(BUMP_LINE);
    if (match !== null && match[4] !== 'patch') {
      console.error(
        `${file}: Bump-Label '${match[4]}' verletzt ADR 0036 (patch-only bis zur ersten Freigabe).`,
      );
      violations += 1;
    }
  }
}

if (violations > 0) {
  console.error(
    'ADR 0036: Changesets müssen bis zur ersten Freigabe "patch" sein.',
  );
  process.exit(1);
}
