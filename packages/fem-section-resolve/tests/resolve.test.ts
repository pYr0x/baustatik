import {
  type CrossSection,
  createSectionGeometry,
  createSectionPolicy,
  type SectionPolicy,
  type SectionProperties,
  sectionProperties,
} from '@baustatik/cross-section';
import type { Beam } from '@baustatik/fem';
import {
  lookupMaterial,
  type Material,
  type MaterialKind,
} from '@baustatik/material';
import { lookupProfile, profileData } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import {
  resolveSectionStiffness,
  type SectionModel,
  sectionStiffness,
} from '../src/index';

/**
 * Beide Fabriken tun genau das, was der Builder in `@baustatik/script` tut:
 * einmal nachschlagen, dann die Werte in den Satz legen. Danach ist kein
 * Katalog mehr im Spiel — hier so wenig wie im Solver.
 */
function material(kind: MaterialKind, grade: string, id: string): Material {
  const found = lookupMaterial(kind, grade);
  if (found === undefined) throw new Error(`${grade} fehlt im Katalog`);
  return { kind, id, grade: found.grade, moduli: found.moduli };
}

function profile(name: string, id: string): CrossSection {
  const row = lookupProfile(name);
  if (row === undefined) throw new Error(`${name} fehlt im Katalog`);
  return { kind: 'profile', id, profile: row.id, data: profileData(row) };
}

const S235 = material('steel', 'S235', 'mat-s235');
const C30 = material('concrete', 'C30/37', 'mat-c30');
const C24 = material('timber', 'C24', 'mat-c24');

const beam = (crossSectionId: string, materialId = S235.id): Beam => ({
  id: 'b1',
  startNodeId: 'n1',
  endNodeId: 'n2',
  crossSectionId,
  materialId,
});

const IPE80 = profile('IPE 80', 'cs-ipe80');

/**
 * Ein Modell aus Querschnitten; die drei Materialien sind immer dabei.
 *
 * Die Policy gehoert seit P5 dazu: `sectionProperties` liest daraus
 * `arcTolerance`, wenn ein gezeichneter Wandquerschnitt Bogenwaende hat. Die
 * Saetze hier sind Profile und parametrische Formen — sie ruehrt sie nicht an,
 * steht aber im Typ, damit niemand sie unterwegs verliert.
 */
const model = (
  crossSections: readonly CrossSection[],
  materials: readonly Material[] = [S235, C30, C24],
): SectionModel => ({
  crossSections,
  materials,
  sectionPolicy: createSectionPolicy(),
});

describe('Die Einheitenkette, ausgeschrieben', () => {
  // material liefert E in MPa (N/mm2), SectionStiffness erwartet kN und kNm2.
  //   E   = 210000 MPa * 1000        = 2,1e8 kN/m2
  //   A   = 7,64 cm2                 = 7,64e-4 m2
  //   Iy  = 80,14 cm4                = 8,014e-7 m4
  //   G   = 80769 MPa * 1000         = 8,0769e7 kN/m2
  const stiffness = resolveSectionStiffness(beam('cs-ipe80'), model([IPE80]));

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
    const s = resolveSectionStiffness(beam('cs-rect'), model([rect]));
    // A = 0,1 m2, Iy = b*h^3/12 = 0,025/12 m4
    //   EA  = 2,1e8 * 0,1        = 2,1e7 kN
    //   EI  = 2,1e8 * 0,025/12   = 437 500 kNm2  (glatt)
    //   GAs = 5/6 * 8,0769e7 * 0,1
    expect(s?.EA).toBeCloseTo(2.1e7, 0);
    expect(s?.EI).toBeCloseTo(437500, 3);
    expect(s?.GAs as number).toBeCloseTo((5 / 6) * 8.0769e7 * 0.1, 3);
  });
});

/**
 * Der gezeichnete Querschnitt bringt seit P5 eine zweite Eingabe mit: die
 * Policy, unter der er entstanden ist. Sie MUSS dieselbe sein, mit der hier
 * gerechnet wird — sonst zerlegt der Wandweg die Bogenwand feiner oder groeber
 * als der mitgefuehrte Umriss, aus dem `I` faellt
 * ([ADR 0040](../../docs/adr/0040-the-wall-path-is-positioned.md)).
 */
describe('Die Policy des Modells erreicht die Rechnung', () => {
  // Eine halbkreisfoermige Wand: die einzige Figur, an der `arcTolerance`
  // ueberhaupt etwas bewegt — eine gerade Wand liefert unter jeder Toleranz
  // dieselben zwei Punkte.
  const bogen = (policy: SectionPolicy): CrossSection => ({
    kind: 'section-geometry',
    id: 'cs-bogen',
    geometry: createSectionGeometry(
      {
        kind: 'midline',
        nodes: [
          { id: 'a', y: -100, z: 0 },
          { id: 'b', y: 100, z: 0 },
        ],
        walls: [{ id: 'w', startNodeId: 'a', endNodeId: 'b', t: 8, bulge: 1 }],
        idealisation: 'thin-walled',
      },
      policy,
    ),
  });

  // `mm` ist gebrandet und `@baustatik/units` keine Abhaengigkeit dieses
  // Packages — die Marke kommt deshalb aus dem Policy-Typ selbst.
  const tolerance = (value: number) => value as SectionPolicy['arcTolerance'];
  const grob = createSectionPolicy({ arcTolerance: tolerance(5) });
  const fein = createSectionPolicy({ arcTolerance: tolerance(0.01) });

  it('rechnet mit der mitgereisten Toleranz und nicht mit der Voreinstellung', () => {
    const section = bogen(grob);
    const stiffness = resolveSectionStiffness(beam('cs-bogen'), {
      crossSections: [section],
      materials: [S235],
      sectionPolicy: grob,
    });

    const expected = sectionStiffness(
      sectionProperties(section, grob) as SectionProperties,
      S235.moduli,
    );
    expect(stiffness?.GAs).toBe(expected.GAs);

    // Die Gegenprobe: unter der feinen Toleranz kaeme eine ANDERE Zahl heraus.
    // Genau diese Differenz stuende still im Ergebnis, wenn der Resolver die
    // Policy nicht mitbekaeme.
    const other = sectionStiffness(
      sectionProperties(section, fein) as SectionProperties,
      S235.moduli,
    );
    expect(other.GAs).not.toBe(expected.GAs);
  });
});

describe('Ein Profilwechsel schlaegt bis zur Verformung durch', () => {
  it('setzt EI im Verhaeltnis der tabellierten Iy', () => {
    // Der Sichttest in der Demo: den Kragarm von HEA 300 auf IPE 300
    // umstellen. Iy faellt von 18260 auf 8356 cm4, EI also um den Faktor
    // 2,185 — und weil die Verformung eines Kragarms mit 1/EI geht, WAECHST
    // sie um genau denselben Faktor.
    const sections = [profile('HEA 300', 'hea300'), profile('IPE 300', 'ipe300')];
    const hea = resolveSectionStiffness(beam('hea300'), model(sections));
    const ipe = resolveSectionStiffness(beam('ipe300'), model(sections));

    expect((hea?.EI as number) / (ipe?.EI as number)).toBeCloseTo(
      18260 / 8356,
      6,
    );
    expect((hea?.EI as number) / (ipe?.EI as number)).toBeCloseTo(2.185, 3);
  });
});

describe('Drei Familien, drei Moduln', () => {
  // Derselbe Querschnitt, drei Materialien. Vorher war das nicht moeglich:
  // `materialId as SteelGrade` erklaerte JEDEN Stab zu Baustahl, und ein Holz-
  // oder Betonstab rechnete stillschweigend mit E = 210 000 MPa.
  const rect: CrossSection = {
    kind: 'shape',
    id: 'cs-rect',
    shape: { kind: 'rectangle', b: 200, h: 500 },
  };
  const A = 0.1; // m2
  const stiffnessFor = (m: Material) =>
    resolveSectionStiffness(beam('cs-rect', m.id), model([rect]));

  it('nimmt fuer Stahl Es und G', () => {
    expect(stiffnessFor(S235)?.EA).toBeCloseTo(210000 * 1000 * A, 0);
  });

  it('nimmt fuer Beton Ecm und das daraus gebildete G', () => {
    // C30/37: Ecm = 33 000 MPa, G = 33 000 / 2,4 = 13 750 MPa.
    expect(stiffnessFor(C30)?.EA).toBeCloseTo(33000 * 1000 * A, 0);
    expect(stiffnessFor(C30)?.GAs as number).toBeCloseTo(
      (5 / 6) * 13750 * 1000 * A,
      3,
    );
  });

  it('nimmt fuer Holz E0,mean und G,mean', () => {
    // C24: E0,mean = 11 000 MPa, Gmean = 690 MPa.
    expect(stiffnessFor(C24)?.EA).toBeCloseTo(11000 * 1000 * A, 0);
    expect(stiffnessFor(C24)?.GAs as number).toBeCloseTo(
      (5 / 6) * 690 * 1000 * A,
      3,
    );
  });

  it('verwechselt die Familien nicht — Beton ist weicher als Stahl', () => {
    const steel = stiffnessFor(S235)?.EI as number;
    const concrete = stiffnessFor(C30)?.EI as number;
    const timber = stiffnessFor(C24)?.EI as number;
    expect(steel).toBeGreaterThan(concrete);
    expect(concrete).toBeGreaterThan(timber);
    expect(steel / concrete).toBeCloseTo(210000 / 33000, 6);
  });
});

describe('Der Resolver rechnet ohne jede aeussere Quelle', () => {
  // Frueher stand hier der DE/EN-Test: derselbe Stab unter zwei Anhaengen,
  // dieselbe Steifigkeit. Er ist ersatzlos entfallen, weil es den Parameter
  // nicht mehr gibt, an dem ein Anhang haengen koennte — die Aussage ist von
  // einer Zusicherung zu einer Bauform geworden (ADR 0027). Was von ihr zu
  // pruefen bleibt, steht in `material/tests/moduli.test.ts`: die Kopie und
  // der Katalog stimmen ueberein, unter beiden Anhaengen.
  it('nimmt die Moduln aus dem Satz und nicht aus einer Sorte', () => {
    // Eine Guete, die es nirgends gibt, mit Zahlen, die es gibt: rechnet.
    // Genau das heisst „das Modell besitzt seine Werte" — eine geaenderte
    // Sortentabelle erreicht diesen Stab nicht mehr.
    const eigenbau: Material = {
      kind: 'steel',
      id: 'mat-eigen',
      grade: 'Werksbescheinigung 2019/17',
      moduli: { E: 205000, G: 78846 },
    };
    const s = resolveSectionStiffness(
      beam('cs-ipe80', eigenbau.id),
      model([IPE80], [eigenbau]),
    );
    expect(s?.EA).toBeCloseTo(205000 * 1000 * 7.64e-4, 0);
  });
});

describe('Was undefined heisst', () => {
  it('meldet einen unbekannten crossSectionId', () => {
    expect(
      resolveSectionStiffness(beam('gibt-es-nicht'), model([IPE80])),
    ).toBeUndefined();
  });

  it('meldet einen materialId, der auf nichts zeigt', () => {
    // Der Fall, den es vor dem Modellsatz gar nicht geben konnte: `materialId`
    // WAR die Guete. Jetzt ist er ein Verweis, und ein Verweis kann ins Leere
    // gehen — wie `crossSectionId` es immer konnte.
    expect(
      resolveSectionStiffness(
        beam('cs-ipe80', 'gibt-es-nicht'),
        model([IPE80]),
      ),
    ).toBeUndefined();
  });

  it('meldet unsinnige Abmessungen', () => {
    const broken: CrossSection = {
      kind: 'shape',
      id: 'cs-x',
      shape: { kind: 'rectangle', b: -200, h: 500 },
    };
    expect(
      resolveSectionStiffness(beam('cs-x'), model([broken])),
    ).toBeUndefined();
  });

  // „Unbekanntes Profil" und „unbekannte Sorte" stehen hier NICHT mehr. Seit
  // ADR 0027 traegt der Satz seine Zahlen, also gibt es sie; der Tippfehler
  // wird beim Anlegen gemeldet, wo er steht (`script/tests/builder.test.ts`).
  // Dass ein Verweis ins Leere gehen kann, bleibt — das ist eine Aussage ueber
  // das Modell und keine ueber einen Katalog.
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
  const moduli = S235.moduli;

  it('liefert GAs = "rigid" und kein NaN', () => {
    // `'rigid'` ist der kanonische, JSON-serialisierbare Weg. Ein `NaN` fiele
    // erst im Gleichungssystem auf, und dort ist es keinem Stab mehr
    // zuzuordnen.
    const s = sectionStiffness(withoutKappa, moduli);
    expect(s.GAs).toBe('rigid');
    expect(Number.isFinite(s.EA)).toBe(true);
    expect(Number.isFinite(s.EI)).toBe(true);
  });

  it('unterscheidet schubstarr von kappa = 0', () => {
    // Ein Querschnitt mit kappa = 0 haette KEINE Schubsteifigkeit — das
    // Gegenteil von schubstarr. Dass die beiden Faelle verschieden aussehen,
    // ist der ganze Grund fuer `undefined` statt 0.
    const zero = sectionStiffness({ ...withoutKappa, kappaZ: 0 }, moduli);
    expect(zero.GAs).toBe(0);
    expect(zero.GAs).not.toBe('rigid');
  });
});
