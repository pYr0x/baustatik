import { createSectionPolicy } from '@baustatik/cross-section';
import { lookupMaterial, type MaterialKind } from '@baustatik/material';
import { describe, expect, it } from 'vitest';
import {
  createFEMModelBuilder,
  FEMScriptError,
  parseFEMModelSnapshot,
  SnapshotValidationError,
} from '../src';
import { SCHEMA_VERSION, snapshot } from './helpers';

/** Ein Materialsatz, wie der Builder ihn anlegt: Herkunft PLUS Moduln. */
function materialRecord(kind: MaterialKind, grade: string, id: string) {
  const found = lookupMaterial(kind, grade);
  if (found === undefined) throw new Error(`${grade} fehlt im Katalog`);
  return { kind, id, grade: found.grade, moduli: found.moduli };
}

describe('Der Snapshot traegt die Materialien mit', () => {
  it('nimmt alle drei Familien an', () => {
    const steel = materialRecord('steel', 'S235', 'm-1');
    const parsed = parseFEMModelSnapshot(
      snapshot({
        materials: [
          steel,
          materialRecord('concrete', 'C30/37', 'm-2'),
          materialRecord('timber', 'C24', 'm-3'),
        ],
      }),
    );
    expect(parsed.materials).toHaveLength(3);
    expect(parsed.materials[0]).toEqual(steel);
  });

  it('lehnt schemaVersion 2 AB, statt materials zu ergaenzen', () => {
    // Der Kern der Versionsgrenze: in v2 WAR `materialId` die Guete selbst
    // (`'S235'`), ab v3 ist er ein Verweis auf `Material.id`. Ein leeres
    // `materials` zu ergaenzen taeuschte vor, beides sei dasselbe — und jeder
    // Stab verloere still sein Material.
    const v2 = snapshot();
    delete (v2 as Record<string, unknown>).materials;
    expect(() => parseFEMModelSnapshot({ ...v2, schemaVersion: 2 })).toThrow(
      'Snapshot.schemaVersion muss 12 sein.',
    );
  });

  it('lehnt v3 AB, statt die Moduln nachzuschlagen', () => {
    // v3 traegt die Guete, ein Lookup laege nahe — und waere genau die stille
    // Aufloesung, die ADR 0027 abschafft.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          schemaVersion: 3,
          materials: [{ kind: 'steel', id: 'm-1', grade: 'S235' }],
        }),
      ),
    ).toThrow('Snapshot.schemaVersion muss 12 sein.');
  });

  it('verlangt materials auch dann, wenn es leer bleibt', () => {
    const withoutKey = snapshot();
    delete (withoutKey as Record<string, unknown>).materials;
    expect(() => parseFEMModelSnapshot(withoutKey)).toThrow(
      SnapshotValidationError,
    );
  });

  it('lehnt ein unbekanntes kind ab', () => {
    // `kind` ist der Diskriminator, an dem beim Anlegen der Katalog gewaehlt
    // wird — ein unbekanntes `kind` ist kein unbekanntes Material, sondern ein
    // kaputter Satz. Deshalb HIER und nicht erst im Bericht.
    const b500 = { ...materialRecord('steel', 'S235', 'm-1') };
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          materials: [{ ...b500, kind: 'reinforcement', grade: 'B500B' }],
        }),
      ),
    ).toThrow(SnapshotValidationError);
  });

  it('lehnt eine leere Guete ab', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          materials: [{ ...materialRecord('steel', 'S235', 'm-1'), grade: '' }],
        }),
      ),
    ).toThrow(SnapshotValidationError);
  });

  it('lehnt Felder ab, die es nicht gibt', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          materials: [
            { ...materialRecord('steel', 'S235', 'm-1'), thickness: 50 },
          ],
        }),
      ),
    ).toThrow('ist kein erlaubtes Feld');
  });

  it('lehnt doppelte Material-IDs ab', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          materials: [
            materialRecord('steel', 'S235', 'm-1'),
            materialRecord('timber', 'C24', 'm-1'),
          ],
        }),
      ),
    ).toThrow('Material-ID "m-1" kommt mehrfach vor.');
  });
});

describe('Die kopierten Moduln an der Snapshot-Grenze', () => {
  const s235 = materialRecord('steel', 'S235', 'm-1');

  it('prueft die GESTALT, nicht den Katalog', () => {
    // Dieselbe Regel wie bei der Profilzeile: eine Guete, die der Katalog
    // nicht (mehr) kennt, mit Zahlen, die dastehen, ist ein gueltiges Modell.
    // Genau so sieht ein Stab nach einer Werksbescheinigung aus.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          materials: [{ ...s235, grade: 'Werksbescheinigung 2019/17' }],
        }),
      ),
    ).not.toThrow();
  });

  it('verlangt `moduli` — ein Material ohne Zahlen ist keins mehr', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          materials: [{ kind: 'steel', id: 'm-1', grade: 'S235' }],
        }),
      ),
    ).toThrow(SnapshotValidationError);
  });

  it('lehnt Moduln ab, die keine sind', () => {
    // Positiv und nicht nur endlich: `E = 0` faende erst das
    // Gleichungssystem, wo es keinem Stab mehr zuzuordnen waere.
    for (const moduli of [
      { E: 0, G: 80769 },
      { E: 210000, G: -1 },
      { E: 210000 },
      { E: 210000, G: 80769, poisson: 0.3 },
      { E: 210000, G: 80769, nu: 'viel' },
    ]) {
      expect(() =>
        parseFEMModelSnapshot(snapshot({ materials: [{ ...s235, moduli }] })),
      ).toThrow(SnapshotValidationError);
    }
  });

  // `nu` ist seit v11 ein erlaubtes, OPTIONALES Feld: ohne es wird aus den
  // FE-Koeffizienten kein kappa, und beim Holz ist genau das die richtige
  // Antwort (ADR 0045).
  it('nimmt `nu` an und laesst es weg, wenn es fehlt', () => {
    const withNu = parseFEMModelSnapshot(
      snapshot({
        materials: [{ ...s235, moduli: { E: 210000, G: 80769, nu: 0.3 } }],
      }),
    );
    expect(withNu.materials[0]?.moduli.nu).toBe(0.3);

    const withoutNu = parseFEMModelSnapshot(
      snapshot({ materials: [{ ...s235, moduli: { E: 210000, G: 80769 } }] }),
    );
    expect(withoutNu.materials[0]?.moduli.nu).toBeUndefined();
  });

  it('prueft NICHT, ob ein Stab auf ein vorhandenes Material zeigt', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          nodes: [
            { id: 'n1', position: { x: 0, z: 0 } },
            { id: 'n2', position: { x: 5, z: 0 } },
          ],
          beams: [
            {
              id: 'b1',
              startNodeId: 'n1',
              endNodeId: 'n2',
              crossSectionId: 'cs-1',
              materialId: 'gibt-es-nicht',
            },
          ],
          supports: [
            { id: 's1', nodeId: 'n1', ux: 'fixed', uz: 'fixed', phiY: 'fixed' },
          ],
        }),
      ),
    ).not.toThrow();
  });
});

describe('Der Builder befragt den Sortenkatalog — und nur er', () => {
  it('legt die Moduln in den Satz', () => {
    const model = createFEMModelBuilder();
    model.material({ kind: 'concrete', grade: 'C30/37' });
    // C30/37: Ecm = 33 000 MPa, G = 33 000 / 2,4 = 13 750 MPa, ν = 0,2.
    expect(model.finish().materials[0].moduli).toEqual({
      E: 33000,
      G: 13750,
      nu: 0.2,
    });
  });

  // Holz ist ORTHOTROP: `E0,mean` und `G,mean` stehen unabhaengig in der
  // Tabelle, ein isotropes ν gibt es nicht — und aus `E`/`G` zurueckgerechnet
  // ergaebe es 6,97 (ADR 0045).
  it('legt fuer Holz KEIN nu in den Satz', () => {
    const model = createFEMModelBuilder();
    model.material({ kind: 'timber', grade: 'C24' });
    expect(model.finish().materials[0]?.moduli.nu).toBeUndefined();
  });

  it('speichert die KANONISCHE Sorte', () => {
    const model = createFEMModelBuilder();
    model.material({ kind: 'steel', grade: 's 235' });
    expect(model.finish().materials[0].grade).toBe('S235');
  });

  it('meldet einen Tippfehler AN DER ZEILE', () => {
    const model = createFEMModelBuilder();
    expect(() => model.material({ kind: 'steel', grade: 'S234' })).toThrow(
      FEMScriptError,
    );
    expect(() => model.material({ kind: 'steel', grade: 'S234' })).toThrow(
      'Die Sorte "S234" steht nicht im Stahl-Katalog.',
    );
  });

  it('meldet ein kind/grade-Paar ueber Kreuz — DER DEFEKT, DER HIER STIRBT', () => {
    // `{ kind: 'timber', grade: 'S235' }` ist Unsinn, und vor ADR 0026 WAR es
    // rechenbar: jeder `materialId` wurde als Stahlsorte gelesen, ein Holzstab
    // rechnete klaglos mit E = 210 000 MPa. Seit ADR 0027 faellt es nicht mehr
    // erst im Bericht auf, sondern hier.
    const model = createFEMModelBuilder();
    expect(() => model.material({ kind: 'timber', grade: 'S235' })).toThrow(
      'Die Sorte "S235" steht nicht im Holz-Katalog.',
    );
  });

  it('braucht dafuer KEINEN Nationalen Anhang', () => {
    // `E` und `G` sind charakteristische Werte (ADR 0026), also kommt der
    // Builder ohne Annex aus. Seit ADR 0033 hat er einen Parameter — die
    // Erzeugungs-Policy —, und deshalb prueft der Test nicht mehr die blosse
    // Stelligkeit, sondern die AUSSAGE: OHNE Argument gebaut, liefert er
    // dieselben Moduln wie der Katalog, ohne dass irgendwo ein Annex
    // hineingereicht worden waere.
    const found = lookupMaterial('steel', 'S235');
    if (found === undefined) throw new Error('S235 fehlt im Katalog');

    const model = createFEMModelBuilder();
    model.material({ kind: 'steel', grade: 'S235' });

    expect(model.finish().materials[0].moduli).toEqual(found.moduli);
  });

  it('nimmt genau eine Einstellung an, und die ist die Erzeugungs-Policy', () => {
    // Der Gegentest zum vorigen: das eine Argument, das es gibt, betrifft die
    // Querschnitts-ERZEUGUNG und nicht den Werkstoff (ADR 0033).
    const model = createFEMModelBuilder({
      sectionPolicy: createSectionPolicy({ discretisationTolerance: 0.01 }),
    });
    model.material({ kind: 'steel', grade: 'S235' });
    const snapshot = model.finish();

    expect(snapshot.sectionPolicy).toEqual(
      createSectionPolicy({ discretisationTolerance: 0.01 }),
    );
    expect(snapshot.sectionPolicy.discretisationTolerance).toBe(0.01);
    expect(snapshot.materials[0].moduli).toEqual(
      lookupMaterial('steel', 'S235')?.moduli,
    );
  });
});

describe('Der Builder vergibt die Material-ID', () => {
  it('gibt die ID heraus, die der Stab eintraegt', () => {
    const model = createFEMModelBuilder();
    const ipe300 = model.crossSection({ kind: 'profile', profile: 'IPE 300' });
    const s235 = model.material({ kind: 'steel', grade: 'S235' });
    const left = model
      .node({ x: 0, z: 0 })
      .support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
    const right = model.node({ x: 5, z: 0 });
    model.beam(left, right, {
      crossSectionId: ipe300.id,
      materialId: s235.id,
    });

    const parsed = parseFEMModelSnapshot(structuredClone(model.finish()));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.materials).toHaveLength(1);
    expect(parsed.materials[0].id).toBe(s235.id);
    expect(parsed.beams[0].materialId).toBe(s235.id);
    // Die ID ist NICHT die Guete — das war der ganze Punkt.
    expect(parsed.beams[0].materialId).not.toBe('S235');
  });

  it('ueberlebt den Umweg ueber JSON verlustfrei', () => {
    const model = createFEMModelBuilder();
    const section = model.crossSection({
      kind: 'shape',
      shape: { kind: 'rectangle', b: 200, h: 500 },
    });
    const c30 = model.material({ kind: 'concrete', grade: 'C30/37' });
    const left = model
      .node({ x: 0, z: 0 })
      .support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
    const right = model.node({ x: 4, z: 0 });
    model.beam(left, right, {
      crossSectionId: section.id,
      materialId: c30.id,
    });

    const once = model.finish();
    const twice = parseFEMModelSnapshot(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  it('haelt zwei Materialien am selben Modell auseinander', () => {
    // Der Fall, den es vor dem Modellsatz nicht gab: ein Rahmen aus Stahl und
    // Holz. Frueher stand in beiden Staeben eine Guete, und der Resolver las
    // beide als Stahl.
    const model = createFEMModelBuilder();
    const cs = model.crossSection({
      kind: 'shape',
      shape: { kind: 'rectangle', b: 200, h: 500 },
    });
    const steel = model.material({ kind: 'steel', grade: 'S235' });
    const timber = model.material({ kind: 'timber', grade: 'C24' });
    const a = model
      .node({ x: 0, z: 0 })
      .support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
    const b = model.node({ x: 4, z: 0 });
    const c = model.node({ x: 8, z: 0 });
    model.beam(a, b, { crossSectionId: cs.id, materialId: steel.id });
    model.beam(b, c, { crossSectionId: cs.id, materialId: timber.id });

    const parsed = parseFEMModelSnapshot(structuredClone(model.finish()));
    expect(parsed.materials.map((m) => m.kind)).toEqual(['steel', 'timber']);
    expect(parsed.beams[0].materialId).not.toBe(parsed.beams[1].materialId);
  });
});
