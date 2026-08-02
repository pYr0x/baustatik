import { describe, expect, it } from 'vitest';
import { femScriptDeclarations } from '../src';

/**
 * Die Deklarationen sind das, was der Autor im Editor SIEHT. ADR 0027 hat die
 * Modellsaetze um `data` und `moduli` erweitert — die Eingabe aber
 * ausdruecklich NICHT. Das ist die Zusicherung, dass die Ergonomie nicht
 * gelitten hat: man nennt weiterhin `'IPE 300'` und `'S235'`.
 *
 * Der wahrscheinlichste Weg, das kaputtzumachen, ist gut gemeint — jemand
 * gleicht diese Datei „der Vollstaendigkeit halber" an die Records an und
 * zwingt damit jeden Skriptautor, die Tabellenzeile selbst hinzuschreiben.
 */
describe('femScriptDeclarations', () => {
  it('laesst den Autor die Katalogbezeichnung nennen, nicht die Zahlen', () => {
    expect(femScriptDeclarations).toContain(
      "| { kind: 'profile'; profile: string };",
    );
    expect(femScriptDeclarations).toContain("{ kind: 'steel'; grade: string }");
  });

  it('zeigt weder `data` noch `moduli` in der Eingabe', () => {
    // Beides beschafft das Modell (ADR 0027). Taucht es hier auf, ist die
    // Auflösung wieder beim Schreibenden gelandet.
    expect(femScriptDeclarations).not.toContain('data:');
    expect(femScriptDeclarations).not.toContain('moduli');
  });
});
