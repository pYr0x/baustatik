// ADR 0036: bis zur ersten Freigabe ist jeder Changeset `patch`. Dieses Skript
// prüft die Frontmatter-Bump-Labels aller ausstehenden Changesets auf
// `major`/`minor` und bricht mit Exit-Code 1 ab, wenn eines sie trägt.
//
// Absichtlich ohne Abhängigkeit vom internen `@changesets/parse`: Die Regeln
// hier sind die drei, die das echte Tool akzeptiert — der Name im Key kann
// einfach, doppelt oder ungequotet stehen, die Typen heißen `major`, `minor`
// und `patch`. Alles andere ist für das Tool selbst unlesbar.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const changesetDir = join(process.cwd(), '.changeset');
const files = readdirSync(changesetDir)
  .filter((name) => name.endsWith('.md') && name !== 'README.md')
  .sort();

const bumpLine = /^["']?[^"':]+["']?\s*:\s*(major|minor|patch)\s*$/;

let violations = 0;

for (const file of files) {
  const content = readFileSync(join(changesetDir, file), 'utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatter === null) continue;

  for (const line of frontmatter[1].split('\n')) {
    const match = line.match(bumpLine);
    if (match !== null && match[1] !== 'patch') {
      console.error(`${file}: Bump-Label '${match[1]}' verletzt ADR 0036 (patch-only bis zur ersten Freigabe).`);
      violations += 1;
    }
  }
}

if (violations > 0) {
  console.error('ADR 0036: Changesets müssen bis zur ersten Freigabe "patch" sein.');
  process.exit(1);
}
