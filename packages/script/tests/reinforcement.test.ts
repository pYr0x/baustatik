/**
 * DIE BEWEHRUNG AN DER SNAPSHOT-GRENZE — `schemaVersion: 15`
 * ([ADR 0064](../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
 *
 * Der Parser prueft die GESTALT, das Gate den Sinn. Diese Datei prueft deshalb
 * genau vier Dinge: dass der Satz unveraendert durchlaeuft, dass `exactKeys`
 * auf BEIDEN Ebenen greift, dass die Katalogzeile das Feld nicht tragen darf,
 * und dass eine v14-Datei abgelehnt wird — obwohl sie am Satz UND an der
 * Bedeutung unveraendert ist.
 */

import { describe, expect, it } from 'vitest';
import {
  createFEMModelBuilder,
  parseFEMModelSnapshot,
  SnapshotValidationError,
} from '../src';
import { lookupProfile, profileData } from '@baustatik/steel-profiles';
import { SCHEMA_VERSION, snapshot } from './helpers';

/** Rechteck 300 x 500, unten drei Staebe, oben zwei eingefrorene. */
const reinforcement = [
  {
    id: 'unten',
    elements: [
      { id: 'u1', y: -100, z: 450, As: 4.52, Asmax: 8.04 },
      { id: 'u2', y: 0, z: 450, As: 4.52, Asmax: 8.04 },
      { id: 'u3', y: 100, z: 450, As: 4.52, Asmax: 8.04 },
    ],
  },
  {
    id: 'oben',
    elements: [
      { id: 'o1', y: -100, z: 50, As: 2.01, Asmax: 2.01 },
      { id: 'o2', y: 100, z: 50, As: 2.01, Asmax: 2.01 },
    ],
  },
];

const bewehrtesRechteck = {
  kind: 'shape',
  id: 'cs-1',
  shape: { kind: 'rectangle', b: 300, h: 500 },
  reinforcement,
};

describe('Der Roundtrip v15', () => {
  it('traegt die Bewehrungslagen unveraendert durch', () => {
    const parsed = parseFEMModelSnapshot(
      snapshot({ crossSections: [bewehrtesRechteck] }),
    );
    expect(parsed.crossSections).toEqual([bewehrtesRechteck]);
  });

  it('laesst ein Element ohne Asmax weg statt es zu erfinden', () => {
    const parsed = parseFEMModelSnapshot(
      snapshot({
        crossSections: [
          {
            kind: 'shape',
            id: 'cs-1',
            shape: { kind: 'rectangle', b: 300, h: 500 },
            reinforcement: [
              { id: 'l', elements: [{ id: 'e1', y: 0, z: 450, As: 4.52 }] },
            ],
          },
        ],
      }),
    );
    const [cs] = parsed.crossSections;
    if (cs?.kind !== 'shape') throw new Error('erwartet: shape');
    expect(cs.reinforcement?.[0]?.elements[0]).not.toHaveProperty('Asmax');
  });

  it('laesst einen Querschnitt ohne Bewehrung ohne das Feld', () => {
    const parsed = parseFEMModelSnapshot(
      snapshot({
        crossSections: [
          {
            kind: 'shape',
            id: 'cs-1',
            shape: { kind: 'rectangle', b: 300, h: 500 },
          },
        ],
      }),
    );
    expect(parsed.crossSections[0]).not.toHaveProperty('reinforcement');
  });

  it('traegt sie auch an der gezeichneten Figur', () => {
    const geometry = {
      kind: 'outline',
      rings: [
        {
          vertices: [
            { y: -150, z: 0 },
            { y: 150, z: 0 },
            { y: 150, z: 500 },
            { y: -150, z: 500 },
          ],
        },
      ],
      outline: [
        {
          points: [
            { y: -150, z: 0 },
            { y: 150, z: 0 },
            { y: 150, z: 500 },
            { y: -150, z: 500 },
          ],
        },
      ],
    };
    const cs = {
      kind: 'section-geometry',
      id: 'cs-1',
      geometry,
      reinforcement,
    };
    expect(
      parseFEMModelSnapshot(snapshot({ crossSections: [cs] })).crossSections,
    ).toEqual([cs]);
  });
});

describe('exactKeys greift auf BEIDEN Ebenen', () => {
  it('lehnt ein unbekanntes Feld an der Lage ab', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              ...bewehrtesRechteck,
              reinforcement: [
                { id: 'l', rank: 1, elements: [] },
              ],
            },
          ],
        }),
      ),
    ).toThrow(SnapshotValidationError);
  });

  it('lehnt ein unbekanntes Feld am Element ab — auch den Durchmesser', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              ...bewehrtesRechteck,
              reinforcement: [
                {
                  id: 'l',
                  elements: [{ id: 'e1', y: 0, z: 450, As: 4.52, ds: 24 }],
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow('ds ist kein erlaubtes Feld');
  });

  it('lehnt ein nicht endliches As ab — die Gestalt, nicht das Vorzeichen', () => {
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              ...bewehrtesRechteck,
              reinforcement: [
                { id: 'l', elements: [{ id: 'e1', y: 0, z: 450, As: '4.52' }] },
              ],
            },
          ],
        }),
      ),
    ).toThrow('muss eine endliche Zahl sein');
  });

  it('laesst ein negatives As DURCH — das Vorzeichen gehoert dem Gate', () => {
    const parsed = parseFEMModelSnapshot(
      snapshot({
        crossSections: [
          {
            ...bewehrtesRechteck,
            reinforcement: [
              { id: 'l', elements: [{ id: 'e1', y: 0, z: 450, As: -1 }] },
            ],
          },
        ],
      }),
    );
    expect(parsed.crossSections).toHaveLength(1);
  });
});

describe('Die Katalogzeile traegt keine Bewehrung', () => {
  it('lehnt `reinforcement` an kind: profile ab', () => {
    const found = lookupProfile('IPE 300');
    if (found === undefined) throw new Error('IPE 300 fehlt im Katalog');
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          crossSections: [
            {
              kind: 'profile',
              id: 'cs-1',
              profile: found.id,
              data: profileData(found),
              reinforcement,
            },
          ],
        }),
      ),
    ).toThrow('reinforcement ist kein erlaubtes Feld');
  });
});

describe('Die Version', () => {
  it('lehnt eine v14-Datei ab, obwohl sie am Satz unveraendert ist', () => {
    // Der Satz IST gueltig — nur die Zahl ist es nicht. Das Repo lehnt ab
    // statt zu migrieren (ADR 0027); ein Lauf schreibt die Datei neu.
    expect(() =>
      parseFEMModelSnapshot(snapshot({ schemaVersion: 14 })),
    ).toThrow('Snapshot.schemaVersion muss 15 sein.');
  });
});

describe('Der Builder', () => {
  it('legt die Bewehrung als KOPIE in den Satz', () => {
    const builder = createFEMModelBuilder();
    const lagen = structuredClone(reinforcement);
    builder.crossSection({
      kind: 'shape',
      shape: { kind: 'rectangle', b: 300, h: 500 },
      reinforcement: lagen,
    });

    // Nachtraeglich am Eingabeobjekt drehen darf den Satz nicht bewegen —
    // der Bauer kopiert tief, wie bei `shape` und `geometry`.
    const ersteLage = lagen[0];
    if (ersteLage === undefined) throw new Error('Fixture leer');
    const erstesElement = ersteLage.elements[0];
    if (erstesElement === undefined) throw new Error('Fixture leer');
    erstesElement.As = 99;

    const parsed = parseFEMModelSnapshot(structuredClone(builder.finish()));

    const cs = parsed.crossSections[0];
    if (cs?.kind !== 'shape') throw new Error('erwartet: shape');
    expect(cs.reinforcement?.[0]?.elements[0]?.As).toBe(4.52);
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
  });
});
