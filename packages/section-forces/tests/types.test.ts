import { describe, expect, it } from 'vitest';
import type { SectionForces } from '../src/index';

/**
 * Dieses Package trägt einen Typ und keine Funktion — der eigentliche Test
 * läuft im Typechecker. Was zur Laufzeit bleibt, ist die eine Aussage, die der
 * Typ macht und die ein Aufrufer sich zunutze macht: JEDES Feld darf fehlen.
 */
describe('SectionForces', () => {
  it('nimmt das Tripel des ebenen Rahmens ohne die drei räumlichen Felder', () => {
    // Der ebene Rahmen liefert `N`, `Vz`, `My`. Dass die drei übrigen Felder
    // fehlen DUERFEN, ist der Grund für dieses Blatt (ADR 0054): der Schritt
    // auf 3D fügt Werte hinzu und ändert keinen Typ.
    const eben: SectionForces = { N: -120, Vz: 50, My: 100 };

    expect(eben.Vy).toBeUndefined();
    expect(eben.Mz).toBeUndefined();
    expect(eben.Mt).toBeUndefined();
  });

  it('nimmt das Sechstupel des räumlichen Schnittufers', () => {
    const raeumlich: SectionForces = {
      N: -120,
      Vy: 10,
      Vz: 50,
      My: 100,
      Mz: 8,
      Mt: 0,
    };

    expect(Object.values(raeumlich)).toHaveLength(6);
  });

  it('nimmt den leeren Satz — die spannungsfreie Stelle', () => {
    const nichts: SectionForces = {};

    expect(nichts.N).toBeUndefined();
  });
});
