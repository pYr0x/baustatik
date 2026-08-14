import { describe, expect, it } from 'vitest';
import { createMaterials, lookupMaterial } from '../src/index';

describe('lookupMaterial', () => {
  it('resolves all three families', () => {
    expect(lookupMaterial('steel', 'S235')?.moduli).toEqual({
      E: 210000,
      G: 80769,
      nu: 0.3,
    });
    // Ecm = 33000, ν = 0,2 → G = 33000 / 2,4 = 13750
    expect(lookupMaterial('concrete', 'C30/37')?.moduli).toEqual({
      E: 33000,
      G: 13750,
      nu: 0.2,
    });
    // OHNE ν, und das ist die Aussage: Holz ist orthotrop, es gibt kein
    // isotropes ν, und die FE des Vollquerschnitts liefert dort kein κ
    // (ADR 0045).
    expect(lookupMaterial('timber', 'C24')?.moduli).toEqual({
      E: 11000,
      G: 690,
    });
  });

  it('hands back the canonical grade, folded like lookupProfile', () => {
    expect(lookupMaterial('steel', 's 235')?.grade).toBe('S235');
    expect(lookupMaterial('concrete', 'c 30/37')?.grade).toBe('C30/37');
    expect(lookupMaterial('timber', ' c24 ')?.grade).toBe('C24');
  });

  it('answers `undefined` for an unknown grade instead of throwing', () => {
    expect(lookupMaterial('steel', 'S234')).toBeUndefined();
    expect(lookupMaterial('concrete', 'C30')).toBeUndefined();
    expect(lookupMaterial('timber', '')).toBeUndefined();
  });

  it('does not confuse the families: C24 is timber, C30/37 is concrete', () => {
    expect(lookupMaterial('concrete', 'C24')).toBeUndefined();
    expect(lookupMaterial('timber', 'C30/37')).toBeUndefined();
  });
});

/**
 * Der Ersatz fuer den frueheren DE/EN-Test in `fem-section-resolve`.
 *
 * Er haelt ZWEI Dinge fest, die zusammen die Grundlage von ADR 0027 sind:
 * die Moduln der Kopie sind dieselben wie die des Katalogs (EINE Wahrheit ueber
 * zwei Wege), und sie sind unter beiden Anhaengen identisch — deshalb braucht
 * das Bauen eines Modells gar keinen Anhang.
 */
describe('the copy and the catalogue agree, under either Annex', () => {
  const de = createMaterials({ na: 'DE' });
  const en = createMaterials({ na: 'EN' });

  it('steel', () => {
    const copy = lookupMaterial('steel', 'S355');
    const s = de.steel('S355');
    expect(copy?.moduli).toEqual({ E: s.Es, G: s.G, nu: s.nu });
    expect(copy?.moduli).toEqual({
      E: en.steel('S355').Es,
      G: en.steel('S355').G,
      nu: en.steel('S355').nu,
    });
  });

  it('concrete', () => {
    const copy = lookupMaterial('concrete', 'C30/37');
    const c = de.concrete('C30/37');
    expect(copy?.moduli).toEqual({ E: c.Ecm, G: c.G, nu: c.nu });
    expect(copy?.moduli.G).toBe(en.concrete('C30/37').G);
    // Gegenprobe, dass die beiden Kataloge nicht dasselbe Objekt sind.
    expect(c.fcd).not.toBe(en.concrete('C30/37').fcd);
  });

  it('timber', () => {
    const copy = lookupMaterial('timber', 'C24');
    const t = de.timber('C24');
    expect(copy?.moduli).toEqual({ E: t.E0mean, G: t.Gmean });
    expect(copy?.moduli.E).toBe(en.timber('C24').E0mean);
  });
});
