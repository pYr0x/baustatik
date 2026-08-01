import type {
  CrossSection,
  SectionProperties,
} from '@baustatik/cross-section';
import type { Beam } from '@baustatik/fem';
import { createMaterials } from '@baustatik/material';
import { describe, expect, it } from 'vitest';
import { resolveSectionStiffness, sectionStiffness } from '../src/index';

const materials = createMaterials({ na: 'DE' });

const beam = (crossSectionId: string, materialId = 'S235'): Beam => ({
  id: 'b1',
  startNodeId: 'n1',
  endNodeId: 'n2',
  crossSectionId,
  materialId,
});

const IPE80: CrossSection = {
  kind: 'profile',
  id: 'cs-ipe80',
  profile: 'IPE 80',
};

describe('Die Einheitenkette, ausgeschrieben', () => {
  // material liefert Es in MPa (N/mm2), SectionStiffness erwartet kN und kNm2.
  //   E   = 210000 MPa * 1000        = 2,1e8 kN/m2
  //   A   = 7,64 cm2                 = 7,64e-4 m2
  //   Iy  = 80,14 cm4                = 8,014e-7 m4
  //   G   = 80769 MPa * 1000         = 8,0769e7 kN/m2
  const stiffness = resolveSectionStiffness(beam('cs-ipe80'), [IPE80], materials);

  it('rechnet EA und EI aus IPE 80 in S235', () => {
    expect(stiffness?.EA).toBeCloseTo(160440, 0); // 2,1e8 * 7,64e-4
    expect(stiffness?.EI).toBeCloseTo(168.294, 3); // 2,1e8 * 8,014e-7
  });

  it('rechnet GAs mit kappaZ', () => {
    expect(stiffness?.GAs as number).toBeCloseTo(21727, 0);
  });

  it('kommt ueber G*Az auf dieselbe Zahl — kappa wird nicht doppelt angewandt', () => {
    // Mit kappa = Az/A ist kappa*G*A identisch G*Az. Die zweite Rechnung geht
    // gar nicht durch kappa und deckt damit einen vertauschten oder doppelt
    // angewandten Faktor auf, den die erste allein nicht sieht.
    const direct = 8.0769e7 * 2.69e-4;
    expect(stiffness?.GAs as number).toBeCloseTo(direct, 6);
  });
});

describe('Parametrische Form durch dieselbe Kette', () => {
  const rect: CrossSection = {
    kind: 'shape',
    id: 'cs-rect',
    shape: { kind: 'rectangle', b: 200, h: 500 },
  };

  it('nimmt kappa = 5/6 aus der Form und nicht aus einer Tabelle', () => {
    const s = resolveSectionStiffness(beam('cs-rect'), [rect], materials);
    // A = 0,1 m2, Iy = b*h^3/12 = 0,025/12 m4
    //   EA  = 2,1e8 * 0,1        = 2,1e7 kN
    //   EI  = 2,1e8 * 0,025/12   = 437 500 kNm2  (glatt)
    //   GAs = 5/6 * 8,0769e7 * 0,1
    expect(s?.EA).toBeCloseTo(2.1e7, 0);
    expect(s?.EI).toBeCloseTo(437500, 3);
    expect(s?.GAs as number).toBeCloseTo((5 / 6) * 8.0769e7 * 0.1, 3);
  });
});

describe('Ein Profilwechsel schlaegt bis zur Verformung durch', () => {
  it('setzt EI im Verhaeltnis der tabellierten Iy', () => {
    // Der Sichttest in der Demo: den Kragarm von HEA 300 auf IPE 300
    // umstellen. Iy faellt von 18260 auf 8356 cm4, EI also um den Faktor
    // 2,185 — und weil die Verformung eines Kragarms mit 1/EI geht, WAECHST
    // sie um genau denselben Faktor.
    const sections: CrossSection[] = [
      { kind: 'profile', id: 'hea300', profile: 'HEA 300' },
      { kind: 'profile', id: 'ipe300', profile: 'IPE 300' },
    ];
    const hea = resolveSectionStiffness(beam('hea300'), sections, materials);
    const ipe = resolveSectionStiffness(beam('ipe300'), sections, materials);

    expect((hea?.EI as number) / (ipe?.EI as number)).toBeCloseTo(
      18260 / 8356,
      6,
    );
    expect((hea?.EI as number) / (ipe?.EI as number)).toBeCloseTo(2.185, 3);
  });
});

describe('Was undefined heisst', () => {
  it('meldet einen unbekannten crossSectionId', () => {
    expect(
      resolveSectionStiffness(beam('gibt-es-nicht'), [IPE80], materials),
    ).toBeUndefined();
  });

  it('meldet einen unbekannten Profilnamen im Querschnitt', () => {
    const broken: CrossSection = {
      kind: 'profile',
      id: 'cs-x',
      profile: 'IPE 201',
    };
    expect(
      resolveSectionStiffness(beam('cs-x'), [broken], materials),
    ).toBeUndefined();
  });

  it('meldet eine unbekannte Materialsorte, statt zu werfen', () => {
    // `materials.steel('S234')` wirft — an dieser Grenze ist das aber eine
    // Aussage ueber das MODELL und gehoert in den Bericht, nicht in einen
    // Stacktrace.
    expect(() =>
      resolveSectionStiffness(beam('cs-ipe80', 'S234'), [IPE80], materials),
    ).not.toThrow();
    expect(
      resolveSectionStiffness(beam('cs-ipe80', 'S234'), [IPE80], materials),
    ).toBeUndefined();
  });

  it('verschluckt aber NICHT jeden Fehler des Materialkatalogs', () => {
    // Nur `UnknownGradeError` ist eine Aussage ueber das Modell. Ein kaputter
    // Katalog ist ein echter Fehler und muss durchschlagen — sonst raechte
    // sich der try/catch als stiller Ausfall.
    const broken = {
      ...materials,
      steel: () => {
        throw new TypeError('Katalog kaputt');
      },
    } as unknown as typeof materials;
    expect(() =>
      resolveSectionStiffness(beam('cs-ipe80'), [IPE80], broken),
    ).toThrow(TypeError);
  });

  it('meldet unsinnige Abmessungen', () => {
    const broken: CrossSection = {
      kind: 'shape',
      id: 'cs-x',
      shape: { kind: 'rectangle', b: -200, h: 500 },
    };
    expect(
      resolveSectionStiffness(beam('cs-x'), [broken], materials),
    ).toBeUndefined();
  });
});

describe('Schubstarr statt NaN', () => {
  // Der Fall entsteht mit einer spaeter ergaenzten Profilreihe ohne
  // tabellierte Schubflaeche — `SteelProfileData.Ay/Az` sind genau dafuer
  // optional. Heute fuehrt jedes Profil eine, deshalb wird der Vertrag an der
  // Rechnung selbst gestellt statt ueber einen erfundenen Katalogeintrag.
  const withoutKappa: SectionProperties = {
    A: 7.64e-4,
    Iy: 8.014e-7,
    Iz: 8.49e-8,
    Iyz: 0,
    ys: 0,
    zs: 0,
  };
  const steel = materials.steel('S235');

  it('liefert GAs = "rigid" und kein NaN', () => {
    // `'rigid'` ist der kanonische, JSON-serialisierbare Weg. Ein `NaN` fiele
    // erst im Gleichungssystem auf, und dort ist es keinem Stab mehr
    // zuzuordnen.
    const s = sectionStiffness(withoutKappa, steel);
    expect(s.GAs).toBe('rigid');
    expect(Number.isFinite(s.EA)).toBe(true);
    expect(Number.isFinite(s.EI)).toBe(true);
  });

  it('unterscheidet schubstarr von kappa = 0', () => {
    // Ein Querschnitt mit kappa = 0 haette KEINE Schubsteifigkeit — das
    // Gegenteil von schubstarr. Dass die beiden Faelle verschieden aussehen,
    // ist der ganze Grund fuer `undefined` statt 0.
    const zero = sectionStiffness({ ...withoutKappa, kappaZ: 0 }, steel);
    expect(zero.GAs).toBe(0);
    expect(zero.GAs).not.toBe('rigid');
  });
});
