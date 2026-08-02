import { describe, expect, it } from 'vitest';
import {
  HEA,
  IPE,
  lookupProfile,
  OPTIONAL_PROFILE_DATA_KEYS,
  PROFILE_DATA_KEYS,
  profileData,
  type ProfileSeries,
  profileSeries,
  profilesIn,
} from '../src/index';

describe('IPE 80 gegen den gedruckten Ausdruck', () => {
  // Der goldene Einzelfall: `data-source/IPE80.pdf` ist der einzige Ort, an dem
  // nicht „die Datei sagt X" geprueft ist, sondern „X ist richtig".
  const ipe80 = lookupProfile('IPE 80');

  it('liefert die Standardzeile in Tabelleneinheiten', () => {
    expect(ipe80).toBeDefined();
    expect(ipe80).toMatchObject({
      id: 'IPE 80',
      series: 'IPE',
      h: 80,
      b: 46,
      tw: 3.8,
      tf: 5.2,
      r: 5,
      A: 7.64,
      Ay: 4.03,
      Az: 2.69,
      Iy: 80.14,
      Iz: 8.49,
      iy: 3.24,
      iz: 1.05,
      Wely: 20.03,
      Welz: 3.69,
      Wply: 23.22,
      Wplz: 5.82,
      It: 0.7,
      Iw: 120,
      SyMax: 11.61,
      SzMax: 1.38,
      mass: 6,
    });
  });

  it('haelt 2*SyMax = Wply ueber den ganzen Katalog', () => {
    // Beim doppeltsymmetrischen Profil ist das plastische Widerstandsmoment
    // genau das doppelte statische Moment des Halbquerschnitts (die
    // Nulllinie liegt in der Symmetrieebene). Trifft das nicht zu, sind zwei
    // Zeilen im Block gegeneinander verrutscht.
    //
    // FUER Z GILT DAS NICHT, und das ist keine Ungenauigkeit: `Sz,max` ist der
    // Wandschubfluss durch EINE Flanschhaelfte (IPE 80: 1,38 cm3, exakt der
    // Wert an Spannungspunkt 3), `Wpl,z` summiert BEIDE Flansche. 2*1,38 = 2,76
    // gegen 5,82 — die Groessen zaehlen verschieden viel Querschnitt.
    for (const series of profileSeries()) {
      for (const p of profilesIn(series)) {
        expect(
          Math.abs(2 * p.SyMax - p.Wply) / p.Wply,
          `${p.id}: 2*SyMax=${2 * p.SyMax} vs Wply=${p.Wply}`,
        ).toBeLessThan(0.002);
      }
    }
  });
});

describe('Az ist die Schubflaeche der Theorie, nicht die des EC 3', () => {
  // Der Waechter ueber die Az-Entscheidung. RSTAB druckt fuer IPE 80 drei
  // Schubflaechen: Az = 2,69 (Schubenergie), Av,z = 3,57 (EC 3) und
  // Apl,z = 2,84 (plastisch). Traegt jemand hier den EC3-Wert ein, wird der
  // Stab um ein Drittel zu steif — und keine andere Pruefung merkt es.
  const ipe80 = lookupProfile('IPE 80');

  it('ergibt kappaZ = 0,352 und gerade NICHT 0,467', () => {
    const kappaZ = (ipe80?.Az as number) / (ipe80?.A as number);
    expect(kappaZ).toBeCloseTo(0.352, 3);

    const wrongFromEc3 = 3.57 / (ipe80?.A as number);
    expect(wrongFromEc3).toBeCloseTo(0.467, 3);
    expect(kappaZ).not.toBeCloseTo(wrongFromEc3, 2);
  });

  it('haelt kappaZ ueber die ganze IPE-Reihe unter 0,5', () => {
    // Av,z/A liegt bei jedem IPE ueber 0,45; Az/A bei keinem. Eine Reihe, die
    // versehentlich aus der EC3-Spalte gelesen wurde, faellt hier auf.
    for (const p of profilesIn('IPE')) {
      const kappaZ = (p.Az as number) / p.A;
      expect(kappaZ, `${p.id}`).toBeGreaterThan(0.3);
      expect(kappaZ, `${p.id}`).toBeLessThan(0.5);
    }
  });
});

describe('lookupProfile', () => {
  it('findet dieselbe Zeile unabhaengig von Leerzeichen und Schreibweise', () => {
    const canonical = lookupProfile('IPE 200');
    expect(canonical?.id).toBe('IPE 200');
    expect(lookupProfile('IPE200')).toBe(canonical);
    expect(lookupProfile('ipe  200')).toBe(canonical);
    expect(lookupProfile('  Ipe 200 ')).toBe(canonical);
  });

  it('liefert undefined statt zu werfen', () => {
    // `undefined` ist der Vertrag: der Solver macht daraus einen Modellfehler
    // im Bericht. Ein Wurf hier waere eine Ausnahme im falschen Moment.
    expect(lookupProfile('IPE 201')).toBeUndefined();
    expect(lookupProfile('HEM 300')).toBeUndefined();
    expect(lookupProfile('')).toBeUndefined();
  });
});

describe('profileData', () => {
  // Seit ADR 0027 reist die Zeile im Modell mit. Was dabei ZURUECKBLEIBT, ist
  // die Herkunft: `profile` steht im Modellsatz schon als eigenes Feld, und
  // `series` ist eine Aussage ueber den Katalog, nicht ueber den Querschnitt.
  it('streift id und series ab und laesst sonst nichts liegen', () => {
    const ipe200 = lookupProfile('IPE 200');
    expect(ipe200).toBeDefined();
    if (ipe200 === undefined) return;

    const data = profileData(ipe200);
    expect(Object.keys(data).sort()).toEqual([...PROFILE_DATA_KEYS].sort());
    for (const key of PROFILE_DATA_KEYS) {
      expect(data[key], key).toBe(ipe200[key]);
    }
  });

  it('sagt selbst, welche Spalten fehlen duerfen', () => {
    // Die Optionalitaet gehoert zu `SteelProfileData` und ist aus dem `?`
    // ABGELEITET — sonst fuehrte der Snapshot-Parser in `@baustatik/script`
    // eine zweite Liste, und eine dritte optionale Spalte hier liesse ihn
    // Snapshots ablehnen, die sie zu Recht weglassen.
    expect([...OPTIONAL_PROFILE_DATA_KEYS]).toEqual(['Ay', 'Az']);
    for (const key of OPTIONAL_PROFILE_DATA_KEYS) {
      expect(PROFILE_DATA_KEYS, key).toContain(key);
    }
  });
});

describe('Vollzaehligkeit', () => {
  // Das Extraktionsskript bricht bei abweichender Zeilenzahl ab; dieser Test
  // wiederholt die Zaehlung gegen die ERZEUGTEN Dateien. Ein stillschweigend
  // uebersprungenes Profil ist der wahrscheinlichste Fehler dieser Extraktion,
  // und ein Skript, das nicht mehr laeuft, prueft nichts mehr.
  const expected: Record<ProfileSeries, number> = { IPE: 18, HEA: 24 };

  it('fuehrt 18 IPE und 24 HEA', () => {
    expect(Object.keys(IPE)).toHaveLength(expected.IPE);
    expect(Object.keys(HEA)).toHaveLength(expected.HEA);
    expect(profileSeries()).toEqual(['IPE', 'HEA']);
  });

  it('hat je Profil einen vollstaendigen Datensatz', () => {
    for (const series of profileSeries()) {
      const profiles = profilesIn(series);
      expect(profiles).toHaveLength(expected[series]);
      for (const p of profiles) {
        // Aus `PROFILE_DATA_KEYS` statt aus einer zweiten Liste hier: die
        // Spalten einer Zeile sind eine Aussage, und sie steht in `types.ts`.
        for (const key of PROFILE_DATA_KEYS) {
          expect(
            Number.isFinite(p[key]),
            `${p.id}.${key} = ${String(p[key])}`,
          ).toBe(true);
          expect(p[key] as number, `${p.id}.${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('waechst innerhalb der Reihe streng in der Hoehe', () => {
    // Faengt eine Verschiebung der Bloecke gegen die Namen: dann stuende bei
    // „IPE 300" die Zeile eines anderen Profils.
    for (const series of profileSeries()) {
      const heights = profilesIn(series).map((p) => p.h);
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i], `${series} Position ${i}`).toBeGreaterThan(
          heights[i - 1],
        );
      }
    }
  });
});
