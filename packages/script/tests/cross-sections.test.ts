import { lookupProfile, profileData } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import {
  createFEMModelBuilder,
  FEMScriptError,
  parseFEMModelSnapshot,
  SnapshotValidationError,
} from '../src';

/** Ein vollstaendiger, gueltiger v5-Rumpf zum Ueberschreiben einzelner Felder. */
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 5,
    nodes: [],
    beams: [],
    crossSections: [],
    materials: [],
    supports: [],
    loadCases: [],
    ...overrides,
  };
}

/** Die Tabellenzeile eines Profils, ohne seine Herkunft. */
function row(name: string) {
  const found = lookupProfile(name);
  if (found === undefined) throw new Error(`${name} fehlt im Katalog`);
  return profileData(found);
}

/** Ein Profilsatz, wie der Builder ihn anlegt: Bezeichnung PLUS Zeile. */
function profileRecord(name: string, id: string) {
  const found = lookupProfile(name);
  if (found === undefined) throw new Error(`${name} fehlt im Katalog`);
  return { kind: 'profile', id, profile: found.id, data: profileData(found) };
}

describe('Der Snapshot traegt die Querschnitte mit', () => {
  it('nimmt Katalogprofil und parametrische Form an', () => {
    const ipe300 = profileRecord('IPE 300', 'cs-1');
    const parsed = parseFEMModelSnapshot(
      snapshot({
        crossSections: [
          ipe300,
          {
            kind: 'shape',
            id: 'cs-2',
            shape: { kind: 'rectangle', b: 200, h: 500 },
          },
          {
            kind: 'shape',
            id: 'cs-3',
            shape: {
              kind: 't-section',
              bf: 2000,
              hf: 200,
              bw: 250,
              h: 500,
              idealisation: 'solid',
            },
          },
        ],
      }),
    );
    expect(parsed.crossSections).toHaveLength(3);
    expect(parsed.crossSections[0]).toEqual(ipe300);
  });

  it('lehnt schemaVersion 1 ab, statt crossSections zu ergaenzen', () => {
    // Ein v1-Snapshot beschreibt ein Modell, dessen `crossSectionId` ins Leere
    // zeigt. Stillschweigend ein leeres `crossSections` zu ergaenzen taeuschte
    // vor, es liesse sich rechnen.
    const v1 = snapshot();
    // biome-ignore lint/performance/noDelete: der Test baut genau einen v1-Satz.
    delete (v1 as Record<string, unknown>).crossSections;
    // biome-ignore lint/performance/noDelete: v1 kannte `materials` nicht.
    delete (v1 as Record<string, unknown>).materials;
    expect(() => parseFEMModelSnapshot({ ...v1, schemaVersion: 1 })).toThrow(
      'Snapshot.schemaVersion muss 5 sein.',
    );
  });

  it('lehnt v3 AB, statt die Zeile nachzuschlagen', () => {
    // Der verfuehrerischste Fall: v3 traegt die Bezeichnung, ein Lookup laege
    // nahe. Genau das ist die stille Aufloesung, die ADR 0027 abschafft — hier
    // einmal ausgefuehrt und danach nicht mehr von einer bewussten Wahl zu
    // unterscheiden. Eine Migration ist ein Werkzeug, das jemand AUFRUFT.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          schemaVersion: 3,
          crossSections: [{ kind: 'profile', id: 'cs-1', profile: 'IPE 300' }],
        }),
      ),
    ).toThrow('Snapshot.schemaVersion muss 5 sein.');
  });

  it('lehnt v4 AB, statt `t-beam` in `t-section` umzuschreiben', () => {
    // DER GRUND FUER v5. Ein v4 ist bis auf EIN Literal ein gueltiger v5-Satz,
    // und genau das macht ihn gefaehrlich: die Umschreibung waere zwei Zeilen
    // und danach nicht mehr von einer bewussten Wahl zu unterscheiden. v4 wird
    // abgewiesen wie v3 — aus demselben Grund, nur billiger zu uebersehen.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          schemaVersion: 4,
          crossSections: [
            {
              kind: 'shape',
              id: 'cs-1',
              shape: {
                kind: 't-beam',
                bf: 2000,
                hf: 200,
                bw: 250,
                h: 500,
                idealisation: 'solid',
              },
            },
          ],
        }),
      ),
    ).toThrow('Snapshot.schemaVersion muss 5 sein.');
  });

  it('kennt `t-beam` auch in einem v5-Satz nicht mehr', () => {
    // Die Version allein reicht nicht: das alte Literal ist auch dann kein
    // gueltiger Formname, wenn jemand die Zahl von Hand auf 5 setzt.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              kind: 'shape',
              id: 'cs-1',
              shape: {
                kind: 't-beam',
                bf: 2000,
                hf: 200,
                bw: 250,
                h: 500,
                idealisation: 'solid',
              },
            },
          ],
        }),
      ),
    ).toThrow(SnapshotValidationError);
  });

  it('verlangt crossSections auch dann, wenn es leer bleibt', () => {
    const withoutKey = snapshot();
    // biome-ignore lint/performance/noDelete: fehlendes Pflichtfeld ist der Punkt.
    delete (withoutKey as Record<string, unknown>).crossSections;
    expect(() => parseFEMModelSnapshot(withoutKey)).toThrow(
      SnapshotValidationError,
    );
  });

  it('besteht auf `idealisation`, wo die Form es verlangt', () => {
    // Ein fehlendes Feld hier auf 'solid' zu setzen waere genau der Default,
    // den `cross-section` bewusst nicht anbietet — 18 % Unterschied im kappa,
    // dem Ergebnis nicht anzusehen.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              kind: 'shape',
              id: 'cs-1',
              shape: { kind: 'i-symmetric', h: 300, b: 150, tw: 7, tf: 10 },
            },
          ],
        }),
      ),
    ).toThrow(SnapshotValidationError);
  });

  it('laesst das Vollrechteck ohne `idealisation` — und nur das', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              kind: 'shape',
              id: 'cs-1',
              shape: {
                kind: 'rectangle',
                b: 200,
                h: 500,
                idealisation: 'solid',
              },
            },
          ],
        }),
      ),
    ).toThrow('ist kein erlaubtes Feld');
  });

  it('lehnt unsinnige Abmessungen an der Grenze ab', () => {
    for (const shape of [
      { kind: 'rectangle', b: 0, h: 500 },
      { kind: 'rectangle', b: -200, h: 500 },
      { kind: 'rectangle', b: 'breit', h: 500 },
    ]) {
      expect(() =>
        parseFEMModelSnapshot(
          snapshot({ crossSections: [{ kind: 'shape', id: 'cs-1', shape }] }),
        ),
      ).toThrow(SnapshotValidationError);
    }
  });

  it('lehnt doppelte Querschnitts-IDs ab', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            profileRecord('IPE 300', 'cs-1'),
            profileRecord('IPE 200', 'cs-1'),
          ],
        }),
      ),
    ).toThrow('Querschnitt-ID "cs-1" kommt mehrfach vor.');
  });
});

describe('Die kopierte Tabellenzeile an der Snapshot-Grenze', () => {
  const ipe300 = row('IPE 300');

  it('prueft die GESTALT, nicht den Katalog', () => {
    // Der Kern von ADR 0027: eine Bezeichnung, die es nirgends gibt, mit
    // Zahlen, die es gibt — das ist ein gueltiges Modell. Genau so sieht ein
    // Projekt aus, dessen Profilreihe der Katalog inzwischen anders fuehrt,
    // oder eines mit einem Sonderprofil. Hier nachzuschlagen und zu
    // vergleichen waere die stille Aufloesung durch die Hintertuer.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            { kind: 'profile', id: 'cs-1', profile: 'gibt-es-nicht', data: ipe300 },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('verlangt `data` — ein Profilsatz ohne Zeile ist kein Satz mehr', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [{ kind: 'profile', id: 'cs-1', profile: 'IPE 300' }],
        }),
      ),
    ).toThrow(SnapshotValidationError);
  });

  it('lehnt eine fehlende oder unsinnige Spalte ab', () => {
    for (const broken of [
      { ...ipe300, Iy: 0 },
      { ...ipe300, A: -1 },
      { ...ipe300, h: 'dreihundert' },
      (({ Iy: _drop, ...rest }) => rest)(ipe300),
    ]) {
      expect(() =>
        parseFEMModelSnapshot(
          snapshot({
            crossSections: [
              { kind: 'profile', id: 'cs-1', profile: 'IPE 300', data: broken },
            ],
          }),
        ),
      ).toThrow(SnapshotValidationError);
    }
  });

  it('laesst Ay/Az weg — eine Reihe ohne Schubflaeche rechnet schubstarr', () => {
    const { Ay: _ay, Az: _az, ...withoutShearAreas } = ipe300;
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              kind: 'profile',
              id: 'cs-1',
              profile: 'IPE 300',
              data: withoutShearAreas,
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('laesst r = 0 zu — ein geschweisstes Profil hat keine Ausrundung', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              kind: 'profile',
              id: 'cs-1',
              profile: 'Sonderprofil',
              data: { ...ipe300, r: 0 },
            },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('lehnt eine erfundene Spalte ab', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              kind: 'profile',
              id: 'cs-1',
              profile: 'IPE 300',
              data: { ...ipe300, Wpl: 628 },
            },
          ],
        }),
      ),
    ).toThrow('ist kein erlaubtes Feld');
  });
});

describe('Der Builder befragt den Katalog — und nur er', () => {
  it('gibt die ID heraus, die der Stab eintraegt', () => {
    const model = createFEMModelBuilder();
    const ipe300 = model.crossSection({
      kind: 'profile',
      profile: 'IPE 300',
    });
    const left = model
      .node({ x: 0, z: 0 })
      .support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
    const right = model.node({ x: 5, z: 0 });
    model.beam(left, right, {
      crossSectionId: ipe300.id,
      materialId: model.material({ kind: 'steel', grade: 'S235' }).id,
    });

    const parsed = parseFEMModelSnapshot(structuredClone(model.finish()));
    expect(parsed.crossSections).toHaveLength(1);
    expect(parsed.crossSections[0].id).toBe(ipe300.id);
    expect(parsed.beams[0].crossSectionId).toBe(ipe300.id);
  });

  it('legt die Tabellenzeile in den Satz', () => {
    const model = createFEMModelBuilder();
    model.crossSection({ kind: 'profile', profile: 'IPE 300' });
    const [section] = model.finish().crossSections;
    expect(section.kind).toBe('profile');
    if (section.kind !== 'profile') return;
    // Katalog: Iy = 8356 cm4, A = 53,81 cm2 — verbatim in Tabelleneinheiten.
    expect(section.data.Iy).toBe(8356);
    expect(section.data.A).toBe(53.81);
  });

  it('speichert die KANONISCHE Bezeichnung', () => {
    // Die Faltung (`'ipe300'` -> `'IPE 300'`) findet genau einmal statt, beim
    // Anlegen. Danach steht im Modell, was gedruckt wird.
    const model = createFEMModelBuilder();
    model.crossSection({ kind: 'profile', profile: 'ipe  300' });
    const [section] = model.finish().crossSections;
    if (section.kind !== 'profile') throw new Error('kein Profilsatz');
    expect(section.profile).toBe('IPE 300');
  });

  it('meldet einen Tippfehler AN DER ZEILE, nicht im Solver-Bericht', () => {
    // Der Gewinn von ADR 0027 im Fehlerfall: frueher wanderte `'IPE 301'` als
    // `undefined` bis in den Bericht und stand dort neben echten
    // Modellfehlern. Jetzt faellt es dort auf, wo es steht.
    const model = createFEMModelBuilder();
    expect(() =>
      model.crossSection({ kind: 'profile', profile: 'IPE 301' }),
    ).toThrow(FEMScriptError);
    expect(() =>
      model.crossSection({ kind: 'profile', profile: 'IPE 301' }),
    ).toThrow('Das Profil "IPE 301" steht nicht im Katalog.');
  });

  it('ueberlebt den Umweg ueber JSON', () => {
    const model = createFEMModelBuilder();
    const section = model.crossSection({
      kind: 'shape',
      shape: {
        kind: 'i-symmetric',
        h: 300,
        b: 150,
        tw: 7.1,
        tf: 10.7,
        idealisation: 'thin-walled',
      },
    });
    const left = model
      .node({ x: 0, z: 0 })
      .support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
    const right = model.node({ x: 4, z: 0 });
    model.beam(left, right, {
      crossSectionId: section.id,
      materialId: model.material({ kind: 'steel', grade: 'S235' }).id,
    });

    const once = model.finish();
    const twice = parseFEMModelSnapshot(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});
