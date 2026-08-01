import { lookupProfile } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import { profileProperties, sectionProperties } from '../src/index';

describe('Walzprofil -> SectionProperties', () => {
  const ipe80 = sectionProperties({
    kind: 'profile',
    id: 'cs-1',
    profile: 'IPE 80',
  });

  it('rechnet cm2/cm4 an genau EINER Stelle nach SI um', () => {
    // Katalog: A = 7,64 cm2, Iy = 80,14 cm4, Iz = 8,49 cm4.
    expect(ipe80?.A).toBeCloseTo(7.64e-4, 12);
    expect(ipe80?.Iy).toBeCloseTo(8.014e-7, 15);
    expect(ipe80?.Iz).toBeCloseTo(8.49e-8, 16);
  });

  it('setzt das Tabellensystem als Schwerpunktsystem an', () => {
    // Die gefuehrten Reihen sind doppeltsymmetrisch, und die Tabelle ist
    // bereits schwerpunktsbezogen — anders als bei den parametrischen Formen,
    // deren Eingabesystem an der Oberkante liegt.
    expect(ipe80?.ys).toBe(0);
    expect(ipe80?.zs).toBe(0);
    expect(ipe80?.Iyz).toBe(0);
  });

  it('nimmt kappa dimensionslos direkt aus den cm2-Werten', () => {
    // kappaZ = Az/A = 2,69/7,64 = 0,352.
    expect(ipe80?.kappaZ).toBeCloseTo(0.352, 3);
    expect(ipe80?.kappaY).toBeCloseTo(4.03 / 7.64, 12);
  });

  it('liefert NICHT Av,z/A = 0,467 — der Waechter ueber die Az-Entscheidung', () => {
    expect(ipe80?.kappaZ).not.toBeCloseTo(3.57 / 7.64, 2);
  });

  it('meldet einen unbekannten Profilnamen als undefined', () => {
    expect(
      sectionProperties({ kind: 'profile', id: 'x', profile: 'IPE 201' }),
    ).toBeUndefined();
  });

  it('findet das Profil schreibweisentolerant', () => {
    expect(
      sectionProperties({ kind: 'profile', id: 'x', profile: 'ipe80' }),
    ).toEqual(ipe80);
  });
});

describe('Fehlende Schubflaeche heisst schubstarr, nicht null', () => {
  it('laesst kappa undefined, wenn die Tabelle keine Schubflaeche fuehrt', () => {
    // Kein gefuehrtes Profil ist heute ohne Ay/Az; der Fall entsteht mit einer
    // spaeter ergaenzten Reihe. Der Vertrag wird trotzdem jetzt festgehalten,
    // weil ein `undefined` weiter unten zu `GAs: 'rigid'` wird und ein
    // versehentliches `NaN` erst dort auffiele.
    const base = lookupProfile('IPE 80');
    if (base === undefined) throw new Error('IPE 80 fehlt im Katalog');
    const { Ay: _ay, Az: _az, ...withoutShearAreas } = base;

    const props = profileProperties(withoutShearAreas);
    expect(props.kappaY).toBeUndefined();
    expect(props.kappaZ).toBeUndefined();
    expect(props.A).toBeCloseTo(7.64e-4, 12);
  });
});
