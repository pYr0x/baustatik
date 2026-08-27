import {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  InvalidSectionPolicyError,
  type SectionGeometry,
  sectionProperties,
  validateSectionGeometry,
} from '@baustatik/cross-section';
import { describe, expect, it } from 'vitest';
import {
  createFEMModelBuilder,
  parseFEMModelSnapshot,
  SnapshotValidationError,
} from '../src';
import { SCHEMA_VERSION } from './helpers';

/**
 * Der Prüfstein von P0: der RUNDLAUF durch `@baustatik/script`
 * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
 *
 * Ein Modell mit einem `section-geometry`-Querschnitt bauen, serialisieren,
 * `validate` bestehen, zurückparsen, Typgleichheit prüfen. Erst damit ist
 * belegt, dass der neue Satz WIRKLICH serialisierbar ist und nicht nur so
 * aussieht.
 */

/** Ein Hohlkasten als Wandgraph, mit einer Bogenwand und seinem Umriss. */
const BOX: SectionGeometry = {
  kind: 'midline',
  idealisation: 'thin-walled',
  nodes: [
    { id: 'n1', y: -50, z: -100 },
    { id: 'n2', y: 50, z: -100 },
    { id: 'n3', y: 50, z: 100 },
    { id: 'n4', y: -50, z: 100 },
  ],
  walls: [
    { id: 'oben', startNodeId: 'n1', endNodeId: 'n2', t: 8 },
    { id: 'rechts', startNodeId: 'n2', endNodeId: 'n3', t: 6, bulge: 0.1 },
    { id: 'unten', startNodeId: 'n3', endNodeId: 'n4', t: 8 },
    { id: 'links', startNodeId: 'n4', endNodeId: 'n1', t: 6 },
  ],
  outline: [
    {
      points: [
        { y: -54, z: -104 },
        { y: 54, z: -104 },
        { y: 54, z: 104 },
        { y: -54, z: 104 },
      ],
    },
  ],
};

function buildSnapshot() {
  const model = createFEMModelBuilder();
  const a = model.node({ x: 0, z: 0 });
  const b = model.node({ x: 5, z: 0 });
  const box = model.crossSection({ kind: 'section-geometry', geometry: BOX });
  const steel = model.material({ kind: 'steel', grade: 'S235' });
  model.beam(a, b, { crossSectionId: box.id, materialId: steel.id });
  a.support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
  b.support({ ux: 'free', uz: 'fixed', phiY: 'free' });
  return model.finish();
}

describe('Der Snapshot trägt die freie Querschnittsgeometrie mit', () => {
  it('überlebt Bauen, Serialisieren und Zurückparsen unverändert', () => {
    const built = buildSnapshot();
    // ECHT DURCH JSON, nicht nur durch `structuredClone`: der Satz muss auch
    // das überstehen, was beim Speichern wirklich passiert.
    const parsed = parseFEMModelSnapshot(JSON.parse(JSON.stringify(built)));

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.crossSections).toHaveLength(1);
    const [section] = parsed.crossSections;
    expect(section?.kind).toBe('section-geometry');
    // TYPGLEICHHEIT, Feld für Feld: `bulge` bleibt erhalten, der mitgeführte
    // Umriss ebenso — er wird NICHT nachgerechnet.
    expect(section).toEqual(built.crossSections[0]);
  });

  it('nimmt auch die Umriss-Variante an', () => {
    const model = createFEMModelBuilder();
    const ring = model.crossSection({
      kind: 'section-geometry',
      geometry: {
        kind: 'outline',
        rings: [
          {
            vertices: [
              { y: 0, z: 0 },
              { y: 300, z: 0, bulge: 0.25 },
              { y: 300, z: 500 },
              { y: 0, z: 500 },
            ],
          },
        ],
        outline: [
          {
            points: [
              { y: 0, z: 0 },
              { y: 300, z: 0 },
              { y: 300, z: 500 },
              { y: 0, z: 500 },
            ],
          },
        ],
      },
    });
    expect(ring.id).toHaveLength(36);
    const parsed = parseFEMModelSnapshot(
      JSON.parse(JSON.stringify(model.finish())),
    );
    expect(parsed.crossSections[0]).toEqual(model.finish().crossSections[0]);
  });

  it('LEHNT einen v5-Satz AB, auch wenn er sonst gültig wäre', () => {
    // DIE HAUSREGEL, BELEGT STATT BEHAUPTET. v5 unterscheidet sich am Satz
    // NICHT von v6 — die dritte Variante ist rein additiv, ein v5 ließe sich
    // schlicht durchwinken. Genau deshalb steht der Test hier: die stille
    // Auflösung wäre hier billiger zu übersehen als bei v3 oder v4.
    const v5 = { ...buildSnapshot(), schemaVersion: 5 };
    expect(() => parseFEMModelSnapshot(v5)).toThrow(SnapshotValidationError);
    expect(() => parseFEMModelSnapshot(v5)).toThrow(
      'Snapshot.schemaVersion muss 15 sein.',
    );
  });

  // v11: der FE-Block reist mit
  // ([ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)).
  it('trägt einen gerechneten FE-Block unverändert durch den Rundlauf', () => {
    const withFE = {
      ...buildSnapshot(),
      crossSections: [
        {
          kind: 'section-geometry' as const,
          id: 'cs-1',
          geometry: {
            ...BOX,
            feValues: {
              status: 'computed' as const,
              values: {
                It: 1.23e-6,
                yM: -0.001,
                zM: 0,
                inverseKappaY: [1.2, 0.31] as const,
                inverseKappaZ: [2.4, 0.09] as const,
              },
              fingerprint: { A: 2.2e-3, Iy: 8.1e-6 },
            },
          },
        },
      ],
      beams: [],
      supports: [],
      nodes: [],
    };
    const parsed = parseFEMModelSnapshot(JSON.parse(JSON.stringify(withFE)));
    expect(parsed.crossSections[0]).toEqual(withFE.crossSections[0]);
  });

  it('trägt einen verweigerten Block samt It, aber ohne Werte', () => {
    // DREI ZUSTÄNDE, NICHT ZWEI: „noch nicht gerechnet" ist die Abwesenheit,
    // „gerechnet und verweigert" steht hier. `It` bleibt unberührt.
    const refused = {
      ...buildSnapshot(),
      nodes: [],
      beams: [],
      supports: [],
      crossSections: [
        {
          kind: 'section-geometry' as const,
          id: 'cs-1',
          geometry: {
            ...BOX,
            feValues: {
              status: 'unsupported' as const,
              reason: 'disconnected-areas' as const,
              It: 4.5e-7,
            },
          },
        },
      ],
    };
    const parsed = parseFEMModelSnapshot(JSON.parse(JSON.stringify(refused)));
    expect(parsed.crossSections[0]).toEqual(refused.crossSections[0]);
  });

  it('weist ein Koeffizientenpaar zurück, das nicht genau zwei Zahlen hat', () => {
    // `d₁` ist beweisbar null und hat deshalb keinen Platz im Satz — ein
    // Tripel wäre eine dritte Zahl, die niemand liest (ADR 0045).
    const broken = {
      ...buildSnapshot(),
      nodes: [],
      beams: [],
      supports: [],
      crossSections: [
        {
          kind: 'section-geometry',
          id: 'cs-1',
          geometry: {
            ...BOX,
            feValues: {
              status: 'computed',
              values: {
                It: 1,
                yM: 0,
                zM: 0,
                inverseKappaY: [1.2, 0, 0],
                inverseKappaZ: [1.2, 0],
              },
              fingerprint: { A: 1, Iy: 1 },
            },
          },
        },
      ],
    };
    expect(() => parseFEMModelSnapshot(broken)).toThrow(SnapshotValidationError);
  });

  it('weist ein `bulge` am ERGEBNISPUNKT zurück', () => {
    // Eingabe und Ergebnis sind am Typ unterscheidbar: `Vertex` trägt
    // `bulge`, `Polygon` nicht. Der Parser setzt das durch, sonst reiste die
    // Unterscheidung nur im Typsystem und nicht im Satz.
    const broken = buildSnapshot();
    const outline = [{ points: [{ y: 0, z: 0, bulge: 0.5 }] }];
    expect(() =>
      parseFEMModelSnapshot({
        ...broken,
        crossSections: [
          { kind: 'section-geometry', id: 'cs-1', geometry: { ...BOX, outline } },
        ],
      }),
    ).toThrow(SnapshotValidationError);
  });
});

/**
 * v7: das REZEPT steht neben dem Ergebnis
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 * v8: die Policy führt ein ZWEITES Feld, `principalAxisTolerance` (ADR 0035).
 *
 * Der Gewinn, der die Denormalisierung rechtfertigt: mit der Toleranz im
 * SELBEN Satz wie dem Umriss wird die Drift-Prüfung erstmals wohldefiniert.
 */
describe('Der Snapshot trägt die Erzeugungs-Policy auf Projektebene mit', () => {
  it('legt sie neben crossSections und materials, nicht in den Querschnitt', () => {
    const parsed = parseFEMModelSnapshot(
      JSON.parse(JSON.stringify(buildSnapshot())),
    );

    expect(parsed.sectionPolicy).toEqual(DEFAULT_SECTION_POLICY);
    // NICHT je Querschnitt: zwei der drei künftigen Felder BEURTEILEN, sie
    // erzeugen nicht — derselbe Bericht dürfte sonst für zwei Querschnitte
    // unter zwei Maßstäben schweigen.
    expect(parsed.crossSections[0]).not.toHaveProperty('sectionPolicy');
  });

  it('speichert die EFFEKTIVEN Werte, nicht die Abweichungen', () => {
    // Sonst rechnete dasselbe Projekt nach einer Aenderung der
    // Software-Defaults still anders.
    const model = createFEMModelBuilder({
      sectionPolicy: createSectionPolicy({ discretisationTolerance: 0.01 }),
    });
    const snapshot = model.finish();

    const effective = {
      ...DEFAULT_SECTION_POLICY,
      discretisationTolerance: 0.01,
    };
    expect(snapshot.sectionPolicy).toEqual(effective);
    expect(
      parseFEMModelSnapshot(JSON.parse(JSON.stringify(snapshot)))
        .sectionPolicy,
    ).toEqual(effective);
  });

  it('LEHNT einen v6-Satz AB, statt die Voreinstellung einzusetzen', () => {
    // DIE VERFUEHRERISCHSTE ERGAENZUNG VON ALLEN: `DEFAULT_SECTION_POLICY`
    // liegt bereit. Genau sie wäre die schlimmste — sie BEHAUPTETE, der
    // mitgeführte Umriss sei unter 0,05 mm entstanden, und die Drift-Prüfung,
    // um derentwillen das Feld existiert, urteilte gegen eine erfundene Zahl.
    const v6: Record<string, unknown> = {
      ...buildSnapshot(),
      schemaVersion: 6,
    };
    delete v6.sectionPolicy;

    expect(() => parseFEMModelSnapshot(v6)).toThrow(SnapshotValidationError);
    expect(() => parseFEMModelSnapshot(v6)).toThrow(
      'Snapshot.schemaVersion muss 15 sein.',
    );
  });

  it('LEHNT einen v7-Satz AB — die Policy führt jetzt zwei Felder', () => {
    // v7 unterscheidet sich am Satz nur durch das FEHLENDE zweite Feld in der
    // Policy, und `DEFAULT_SECTION_POLICY` liegt weiterhin bereit. Dieselbe
    // Antwort wie bei v6, aus demselben Grund: eine eingesetzte
    // Voreinstellung behauptete, unter ihr sei beurteilt worden.
    const v7 = {
      ...buildSnapshot(),
      schemaVersion: 7,
      sectionPolicy: { discretisationTolerance: 0.05 },
    };

    expect(() => parseFEMModelSnapshot(v7)).toThrow(SnapshotValidationError);
    expect(() => parseFEMModelSnapshot(v7)).toThrow(
      'Snapshot.schemaVersion muss 15 sein.',
    );
  });

  it('lehnt eine Policy ohne principalAxisTolerance auch bei v8 ab', () => {
    // Der Gegentest: es ist nicht die Versionsnummer, die den v7-Satz
    // rettet — das Feld selbst ist Pflicht.
    expect(() =>
      parseFEMModelSnapshot({
        ...buildSnapshot(),
        sectionPolicy: { discretisationTolerance: 0.05 },
      }),
    ).toThrow(InvalidSectionPolicyError);
  });

  it('verlangt sectionPolicy auch bei richtiger Versionsnummer', () => {
    const withoutPolicy: Record<string, unknown> = { ...buildSnapshot() };
    delete withoutPolicy.sectionPolicy;

    expect(() => parseFEMModelSnapshot(withoutPolicy)).toThrow(
      'Snapshot.sectionPolicy fehlt.',
    );
  });

  it('lässt ihren Eigentümer prüfen, samt dessen Fehlerklasse', () => {
    // Eine zweite Formprüfung hier wären zwei Wahrheiten über dieselbe Form
    // — dieselbe Arbeitsteilung, mit der `fem-solver` seine Lastscheibe prüft.
    expect(() =>
      parseFEMModelSnapshot({
        ...buildSnapshot(),
        sectionPolicy: { discretisationTolerance: 0 },
      }),
    ).toThrow(InvalidSectionPolicyError);

    // BIS P2 STAND HIER `miterLimit` als das unbekannte Feld. Mit ADR 0037 ist
    // es das dritte PFLICHTFELD — der Satz geht jetzt durch, und der Gegentest
    // braucht ein Feld, das es wirklich nicht gibt.
    expect(() =>
      parseFEMModelSnapshot({
        ...buildSnapshot(),
        sectionPolicy: {
          discretisationTolerance: 0.05,
          principalAxisTolerance: 1e-9,
          miterLimit: 2,
          joinType: 'round',
        },
      }),
    ).toThrow(InvalidSectionPolicyError);
  });
});

/**
 * Der Rundlauf des WANDGRAPHEN — P3 (ADR 0037).
 *
 * Bis P2 musste der Autor den Umriss danebentippen. `'section-input'` gibt ihm
 * die Wahl, nur die Figur zu nennen; der Umriss fällt aus der Policy, die der
 * Bauer ohnehin führt.
 */
describe('Der Bauer leitet den Umriss des Wandgraphen selbst ab', () => {
  /** Ein I-Profil als Wandgraph: `A = 2·b·tf + tw·(h − 2·tf)`. */
  const H = 300;
  const B = 150;
  const TW = 7.1;
  const TF = 10.7;
  const ZF = H / 2 - TF / 2;

  const I_PROFIL = {
    kind: 'midline' as const,
    idealisation: 'thin-walled' as const,
    nodes: [
      { id: 'ol', y: -B / 2, z: -ZF },
      { id: 'om', y: 0, z: -ZF },
      { id: 'or', y: B / 2, z: -ZF },
      { id: 'ul', y: -B / 2, z: ZF },
      { id: 'um', y: 0, z: ZF },
      { id: 'ur', y: B / 2, z: ZF },
    ],
    walls: [
      { id: 'gurt-o-links', startNodeId: 'ol', endNodeId: 'om', t: TF },
      { id: 'gurt-o-rechts', startNodeId: 'om', endNodeId: 'or', t: TF },
      { id: 'steg', startNodeId: 'om', endNodeId: 'um', t: TW },
      { id: 'gurt-u-links', startNodeId: 'ul', endNodeId: 'um', t: TF },
      { id: 'gurt-u-rechts', startNodeId: 'um', endNodeId: 'ur', t: TF },
    ],
  };

  function buildFromInput() {
    const model = createFEMModelBuilder();
    const a = model.node({ x: 0, z: 0 });
    const b = model.node({ x: 5, z: 0 });
    const section = model.crossSection({
      kind: 'section-input',
      input: I_PROFIL,
    });
    const steel = model.material({ kind: 'steel', grade: 'S235' });
    model.beam(a, b, { crossSectionId: section.id, materialId: steel.id });
    a.support({ ux: 'fixed', uz: 'fixed', phiY: 'fixed' });
    b.support({ ux: 'free', uz: 'fixed', phiY: 'free' });
    return model.finish();
  }

  it('baut, serialisiert, besteht validate und parst zurück', () => {
    const built = buildFromInput();
    const parsed = parseFEMModelSnapshot(JSON.parse(JSON.stringify(built)));

    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    const [section] = parsed.crossSections;
    expect(section?.kind).toBe('section-geometry');
    // Der Satz ist am Ende derselbe wie bei `'section-geometry'`: die Variante
    // ist eine EINGABEFORM und keine zweite Sorte Querschnitt.
    expect(section).toEqual(built.crossSections[0]);
  });

  it('trifft mit A und Iy die parametrische Form', () => {
    const [section] = buildFromInput().crossSections;
    if (section === undefined) expect.unreachable();
    const values = sectionProperties(section);
    if (values === undefined) expect.unreachable();

    // `sectionProperties` rechnet in SI: mm² -> m², mm⁴ -> m⁴.
    const A = (2 * B * TF + TW * (H - 2 * TF)) * 1e-6;
    expect(values.A).toBeCloseTo(A, 9);

    // Iy des I aus drei Rechtecken, mit Steiner für die Gurte.
    const Iy =
      ((TW * (H - 2 * TF) ** 3) / 12 +
        2 * ((B * TF ** 3) / 12 + B * TF * ((H - TF) / 2) ** 2)) *
      1e-12;
    expect(values.Iy).toBeCloseTo(Iy, 9);
  });

  it('das Gate schweigt zum frisch gebauten Satz — keine Drift', () => {
    const [section] = buildFromInput().crossSections;
    if (section?.kind !== 'section-geometry') expect.unreachable();

    const { errors, warnings } = validateSectionGeometry(
      section.geometry,
      DEFAULT_SECTION_POLICY,
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('LEHNT einen v8-Satz AB — die Policy führt jetzt drei Felder', () => {
    const v8: Record<string, unknown> = {
      ...buildSnapshot(),
      schemaVersion: 8,
      sectionPolicy: { discretisationTolerance: 0.05, principalAxisTolerance: 1e-9 },
    };

    expect(() => parseFEMModelSnapshot(v8)).toThrow(SnapshotValidationError);
    expect(() => parseFEMModelSnapshot(v8)).toThrow(
      'Snapshot.schemaVersion muss 15 sein.',
    );
  });

  it('lehnt eine Policy ohne miterLimit auch bei richtiger Version ab', () => {
    // Der Gegentest: nicht die Versionsnummer rettet den v8-Satz — das Feld
    // selbst ist Pflicht.
    expect(() =>
      parseFEMModelSnapshot({
        ...buildSnapshot(),
        sectionPolicy: { discretisationTolerance: 0.05, principalAxisTolerance: 1e-9 },
      }),
    ).toThrow(InvalidSectionPolicyError);
  });

  it('LEHNT einen v9-Satz AB — die Policy führt jetzt fünf Felder', () => {
    // Die beiden neuen sind BEURTEILUNGSFELDER (ADR 0040/0041) und ändern den
    // gespeicherten Umriss nicht. Sie stehen trotzdem im Satz, aus demselben
    // Grund wie `principalAxisTolerance` seit v8: derselbe Bericht soll nach
    // einer Änderung der Software-Defaults nicht still andere Warnungen zeigen.
    const v9: Record<string, unknown> = {
      ...buildSnapshot(),
      schemaVersion: 9,
      sectionPolicy: {
        discretisationTolerance: 0.05,
        principalAxisTolerance: 1e-9,
        miterLimit: 2,
      },
    };

    expect(() => parseFEMModelSnapshot(v9)).toThrow(SnapshotValidationError);
    expect(() => parseFEMModelSnapshot(v9)).toThrow(
      'Snapshot.schemaVersion muss 15 sein.',
    );
  });

  it('lehnt eine Policy ohne die Beurteilungsfelder auch bei v10 ab', () => {
    expect(() =>
      parseFEMModelSnapshot({
        ...buildSnapshot(),
        sectionPolicy: {
          discretisationTolerance: 0.05,
          principalAxisTolerance: 1e-9,
          miterLimit: 2,
        },
      }),
    ).toThrow(InvalidSectionPolicyError);
  });
});
