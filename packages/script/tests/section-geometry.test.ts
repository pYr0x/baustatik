import type { SectionGeometry } from '@baustatik/cross-section';
import { describe, expect, it } from 'vitest';
import {
  createFEMModelBuilder,
  parseFEMModelSnapshot,
  SnapshotValidationError,
} from '../src';

/**
 * Der Pruefstein von P0: der RUNDLAUF durch `@baustatik/script`
 * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
 *
 * Ein Modell mit einem `section-geometry`-Querschnitt bauen, serialisieren,
 * `validate` bestehen, zurueckparsen, Typgleichheit pruefen. Erst damit ist
 * belegt, dass der neue Satz WIRKLICH serialisierbar ist und nicht nur so
 * aussieht.
 */

/** Ein Hohlkasten als Wandgraph, mit einer Bogenwand und seinem Umriss. */
const BOX: SectionGeometry = {
  kind: 'walls',
  idealisation: 'thin-walled',
  nodes: [
    { id: 'n1', y: -50, z: -100 },
    { id: 'n2', y: 50, z: -100 },
    { id: 'n3', y: 50, z: 100 },
    { id: 'n4', y: -50, z: 100 },
  ],
  walls: [
    { id: 'oben', from: 'n1', to: 'n2', t: 8 },
    { id: 'rechts', from: 'n2', to: 'n3', t: 6, bulge: 0.1 },
    { id: 'unten', from: 'n3', to: 'n4', t: 8 },
    { id: 'links', from: 'n4', to: 'n1', t: 6 },
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

describe('Der Snapshot traegt die freie Querschnittsgeometrie mit', () => {
  it('ueberlebt Bauen, Serialisieren und Zurueckparsen unveraendert', () => {
    const built = buildSnapshot();
    // ECHT DURCH JSON, nicht nur durch `structuredClone`: der Satz muss auch
    // das ueberstehen, was beim Speichern wirklich passiert.
    const parsed = parseFEMModelSnapshot(JSON.parse(JSON.stringify(built)));

    expect(parsed.schemaVersion).toBe(6);
    expect(parsed.crossSections).toHaveLength(1);
    const [section] = parsed.crossSections;
    expect(section?.kind).toBe('section-geometry');
    // TYPGLEICHHEIT, Feld fuer Feld: `bulge` bleibt erhalten, der mitgefuehrte
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

  it('LEHNT einen v5-Satz AB, auch wenn er sonst gueltig waere', () => {
    // DIE HAUSREGEL, BELEGT STATT BEHAUPTET. v5 unterscheidet sich am Satz
    // NICHT von v6 — die dritte Variante ist rein additiv, ein v5 liesse sich
    // schlicht durchwinken. Genau deshalb steht der Test hier: die stille
    // Aufloesung waere hier billiger zu uebersehen als bei v3 oder v4.
    const v5 = { ...buildSnapshot(), schemaVersion: 5 };
    expect(() => parseFEMModelSnapshot(v5)).toThrow(SnapshotValidationError);
    expect(() => parseFEMModelSnapshot(v5)).toThrow(
      'Snapshot.schemaVersion muss 6 sein.',
    );
  });

  it('weist ein `bulge` am ERGEBNISPUNKT zurueck', () => {
    // Eingabe und Ergebnis sind am Typ unterscheidbar: `Vertex` traegt
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
