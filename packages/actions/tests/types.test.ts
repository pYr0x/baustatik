import { describe, expect, it } from 'vitest';
import type { ActionCategory } from '../src/types';

/**
 * Der eigentliche Test dieses Packages laeuft im Typechecker, nicht zur
 * Laufzeit: `assertNever` erzwingt, dass der `switch` unten JEDE Variante des
 * Unions trifft. Kommt spaeter eine Einwirkung dazu (Verkehrslasten F bis H,
 * Setzung), schlaegt `pnpm --filter @baustatik/actions typecheck` hier fehl —
 * und das ist die Erinnerung daran, dass eine psi-Abbildung mitgezogen werden
 * muss.
 */
function assertNever(value: never): never {
  throw new Error(`unbehandelte Einwirkung: ${JSON.stringify(value)}`);
}

/** Steht fuer eine spaetere psi-Abbildung: eine Auskunft je Einwirkung. */
function label(category: ActionCategory): string {
  switch (category.action) {
    case 'permanent':
      return 'Staendige Einwirkung';
    case 'accidental':
      return 'Aussergewoehnliche Einwirkung';
    case 'variable':
      switch (category.kind) {
        case 'imposed':
          // Nur hier ist `useCategory` ueberhaupt vorhanden — das ist der
          // ganze Zweck der zwei getrennten Achsen.
          return `Nutzlast Kategorie ${category.useCategory}`;
        case 'snow':
          return 'Schneelast';
        case 'wind':
          return 'Windlast';
        case 'temperature':
          return 'Temperatureinwirkung';
        default:
          return assertNever(category);
      }
    default:
      return assertNever(category);
  }
}

describe('ActionCategory', () => {
  it('laesst sich exhaustiv abbilden, ohne Restfall', () => {
    const all: ActionCategory[] = [
      { action: 'permanent' },
      { action: 'variable', kind: 'imposed', useCategory: 'A' },
      { action: 'variable', kind: 'imposed', useCategory: 'E' },
      { action: 'variable', kind: 'snow' },
      { action: 'variable', kind: 'wind' },
      { action: 'variable', kind: 'temperature' },
      { action: 'accidental' },
    ];

    expect(all.map(label)).toEqual([
      'Staendige Einwirkung',
      'Nutzlast Kategorie A',
      'Nutzlast Kategorie E',
      'Schneelast',
      'Windlast',
      'Temperatureinwirkung',
      'Aussergewoehnliche Einwirkung',
    ]);
  });

  it('haengt die Nutzungskategorie an die Nutzlast und an nichts sonst', () => {
    // Die beiden Windrichtungen sind zwei LASTFAELLE derselben Einwirkung.
    // Dass sie sich gegenseitig ausschliessen, drueckt die Kategorie NICHT
    // aus — das ist Sache der Kombinatorik, siehe CONTEXT.md.
    const windLinks: ActionCategory = { action: 'variable', kind: 'wind' };
    const windRechts: ActionCategory = { action: 'variable', kind: 'wind' };

    expect(label(windLinks)).toBe(label(windRechts));
    expect(windLinks).not.toHaveProperty('useCategory');
  });
});
