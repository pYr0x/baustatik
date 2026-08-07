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
      "| { kind: 'profile'; profile: string }",
    );
    expect(femScriptDeclarations).toContain("{ kind: 'steel'; grade: string }");
  });

  it('kennt ALLE DREI Querschnittsquellen', () => {
    // DER DRIFT, DEN DIESE DATEI EINLAEDT: sie ist von Hand gepflegt, und ein
    // neuer Zweig an `CrossSectionInput` faellt hier nicht durch den Typecheck
    // — er ist ein String. Ein Autor bekaeme dann im Editor einen Fehler auf
    // Code, der zur Laufzeit einwandfrei laeuft. Die Liste steht deshalb hier
    // als Zusicherung und nicht als Kommentar.
    for (const kind of ['shape', 'profile', 'section-geometry'] as const) {
      expect(femScriptDeclarations).toContain(`{ kind: '${kind}';`);
    }
    // Die Geometrie braucht ihre eigenen Typen, sonst ist die Variante zwar
    // genannt, aber nicht hinschreibbar.
    expect(femScriptDeclarations).toContain('export type SectionGeometry =');
    expect(femScriptDeclarations).toContain('export type Wall =');
  });

  it('zeigt weder `data` noch `moduli` in der Eingabe', () => {
    // Beides beschafft das Modell (ADR 0027). Taucht es hier auf, ist die
    // Auflösung wieder beim Schreibenden gelandet.
    expect(femScriptDeclarations).not.toContain('data:');
    expect(femScriptDeclarations).not.toContain('moduli');
  });
});
