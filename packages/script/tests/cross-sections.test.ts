import { describe, expect, it } from 'vitest';
import {
  createFEMModelBuilder,
  parseFEMModelSnapshot,
  SnapshotValidationError,
} from '../src';

/** Ein vollstaendiger, gueltiger v2-Rumpf zum Ueberschreiben einzelner Felder. */
function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    nodes: [],
    beams: [],
    crossSections: [],
    supports: [],
    loadCases: [],
    ...overrides,
  };
}

describe('Der Snapshot traegt die Querschnitte mit', () => {
  it('nimmt Katalogprofil und parametrische Form an', () => {
    const parsed = parseFEMModelSnapshot(
      snapshot({
        crossSections: [
          { kind: 'profile', id: 'cs-1', profileId: 'IPE 300' },
          {
            kind: 'shape',
            id: 'cs-2',
            shape: { kind: 'rectangle', b: 0.2, h: 0.5 },
          },
          {
            kind: 'shape',
            id: 'cs-3',
            shape: {
              kind: 't-beam',
              bf: 2,
              hf: 0.2,
              bw: 0.25,
              h: 0.5,
              idealisation: 'solid',
            },
          },
        ],
      }),
    );
    expect(parsed.crossSections).toHaveLength(3);
    expect(parsed.crossSections[0]).toEqual({
      kind: 'profile',
      id: 'cs-1',
      profileId: 'IPE 300',
    });
  });

  it('lehnt schemaVersion 1 ab, statt crossSections zu ergaenzen', () => {
    // Ein v1-Snapshot beschreibt ein Modell, dessen `crossSectionId` ins Leere
    // zeigt. Stillschweigend ein leeres `crossSections` zu ergaenzen taeuschte
    // vor, es liesse sich rechnen.
    const v1 = snapshot();
    // biome-ignore lint/performance/noDelete: der Test baut genau einen v1-Satz.
    delete (v1 as Record<string, unknown>).crossSections;
    expect(() => parseFEMModelSnapshot({ ...v1, schemaVersion: 1 })).toThrow(
      'Snapshot.schemaVersion muss 2 sein.',
    );
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
              shape: { kind: 'i-symmetric', h: 0.3, b: 0.15, tw: 0.007, tf: 0.01 },
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
                b: 0.2,
                h: 0.5,
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
      { kind: 'rectangle', b: 0, h: 0.5 },
      { kind: 'rectangle', b: -0.2, h: 0.5 },
      { kind: 'rectangle', b: 'breit', h: 0.5 },
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
            { kind: 'profile', id: 'cs-1', profileId: 'IPE 300' },
            { kind: 'profile', id: 'cs-1', profileId: 'IPE 200' },
          ],
        }),
      ),
    ).toThrow('Querschnitt-ID "cs-1" kommt mehrfach vor.');
  });

  it('prueft NICHT, ob ein profileId im Katalog steht', () => {
    // Die Aufloesbarkeit meldet der Bericht des Solvers als Modellfehler. Eine
    // zweite Regel an dieser Stelle gaebe zwei Wahrheiten darueber, was ein
    // gueltiges Modell ist.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            { kind: 'profile', id: 'cs-1', profileId: 'gibt-es-nicht' },
          ],
        }),
      ),
    ).not.toThrow();
  });
});

describe('Der Builder vergibt die Querschnitts-ID', () => {
  it('gibt die ID heraus, die der Stab eintraegt', () => {
    const model = createFEMModelBuilder();
    const ipe300 = model.crossSection({
      kind: 'profile',
      profileId: 'IPE 300',
    });
    const left = model
      .node({ x: 0, z: 0 })
      .support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
    const right = model.node({ x: 5, z: 0 });
    model.beam(left, right, {
      crossSectionId: ipe300.id,
      materialId: 'S235',
    });

    const parsed = parseFEMModelSnapshot(structuredClone(model.finish()));
    expect(parsed.crossSections).toHaveLength(1);
    expect(parsed.crossSections[0].id).toBe(ipe300.id);
    expect(parsed.beams[0].crossSectionId).toBe(ipe300.id);
  });

  it('ueberlebt den Umweg ueber JSON', () => {
    const model = createFEMModelBuilder();
    const section = model.crossSection({
      kind: 'shape',
      shape: {
        kind: 'i-symmetric',
        h: 0.3,
        b: 0.15,
        tw: 0.0071,
        tf: 0.0107,
        idealisation: 'thin-walled',
      },
    });
    const left = model
      .node({ x: 0, z: 0 })
      .support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
    const right = model.node({ x: 4, z: 0 });
    model.beam(left, right, {
      crossSectionId: section.id,
      materialId: 'S235',
    });

    const once = model.finish();
    const twice = parseFEMModelSnapshot(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});
