/**
 * DIE WEICHE ÜBER ALLE ZELLEN
 * ([ADR 0064](../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
 *
 * `isSolid` ist eine ZUSAMMENFUEHRUNG: dieselbe Fallunterscheidung stand vor
 * ADR 0064 dreimal ausgeschrieben da. Eine Tabelle mit jeder Zelle ist deshalb
 * kein Luxus, sondern der einzige Ort, an dem auffällt, wenn die
 * zusammengeführte Regel woanders anders gemeint war.
 *
 * DER DUENNWANDIGE FALL STEHT AN BEIDEN ZELLEN, `shape` und `midline`. Die
 * zweite übersieht man beim Lesen der Regel leicht — sie steht in einer
 * Variante, die auch den Vollquerschnitt trägt.
 */

import { describe, expect, it } from 'vitest';
import {
  type CrossSection,
  createSectionGeometry,
  DEFAULT_SECTION_POLICY,
  isSolid,
  isSolidGeometry,
  type SectionGeometry,
  type ShapeSpec,
} from '../src/index';
import { lookupProfile, profileData } from '@baustatik/steel-profiles';
import { node, wall } from './helpers';

const policy = DEFAULT_SECTION_POLICY;

const shapeSection = (shape: ShapeSpec): CrossSection => ({
  kind: 'shape',
  id: 's',
  shape,
});

const geometrySection = (geometry: SectionGeometry): CrossSection => ({
  kind: 'section-geometry',
  id: 'g',
  geometry,
});

/** Ein Wandgraph — ein liegendes U, mehr braucht die Frage nicht. */
const wallGraph = (idealisation: 'solid' | 'thin-walled'): SectionGeometry =>
  createSectionGeometry(
    {
      kind: 'midline',
      nodes: [node('n1', 0, 0), node('n2', 200, 0), node('n3', 200, 300)],
      walls: [wall('w1', 'n1', 'n2'), wall('w2', 'n2', 'n3')],
      idealisation,
    },
    policy,
  );

const outlineGeometry = (): SectionGeometry =>
  createSectionGeometry(
    {
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
    },
    policy,
  );

describe('isSolid an der parametrischen Form', () => {
  it('haelt das Vollrechteck fuer einen Vollquerschnitt, ohne dass es ein `idealisation` traegt', () => {
    expect(isSolid(shapeSection({ kind: 'rectangle', b: 300, h: 500 }))).toBe(
      true,
    );
  });

  const others = [
    [
      'hollow-rectangle',
      (idealisation: 'solid' | 'thin-walled'): ShapeSpec => ({
        kind: 'hollow-rectangle',
        b: 300,
        h: 500,
        t: 20,
        idealisation,
      }),
    ],
    [
      'i-symmetric',
      (idealisation: 'solid' | 'thin-walled'): ShapeSpec => ({
        kind: 'i-symmetric',
        h: 300,
        b: 150,
        tw: 7.1,
        tf: 10.7,
        idealisation,
      }),
    ],
    [
      't-section',
      (idealisation: 'solid' | 'thin-walled'): ShapeSpec => ({
        kind: 't-section',
        bf: 400,
        hf: 120,
        bw: 200,
        h: 600,
        idealisation,
      }),
    ],
  ] as const;

  for (const [name, make] of others) {
    it(`${name} mit idealisation 'solid' ist ein Vollquerschnitt`, () => {
      expect(isSolid(shapeSection(make('solid')))).toBe(true);
    });

    it(`${name} mit idealisation 'thin-walled' ist keiner`, () => {
      expect(isSolid(shapeSection(make('thin-walled')))).toBe(false);
    });
  }
});

describe('isSolid an der gezeichneten Figur', () => {
  it('haelt den freien Umriss immer fuer einen Vollquerschnitt', () => {
    expect(isSolid(geometrySection(outlineGeometry()))).toBe(true);
  });

  it("haelt den 'solid' gezeichneten Wandgraphen fuer einen Vollquerschnitt", () => {
    expect(isSolid(geometrySection(wallGraph('solid')))).toBe(true);
  });

  it("haelt den 'thin-walled' gezeichneten Wandgraphen fuer keinen", () => {
    expect(isSolid(geometrySection(wallGraph('thin-walled')))).toBe(false);
  });
});

describe('isSolid an der Katalogzeile', () => {
  it('haelt das gewalzte Profil nie fuer einen Vollquerschnitt', () => {
    const row = lookupProfile('IPE 300');
    if (row === undefined) throw new Error('IPE 300 fehlt im Katalog');
    expect(
      isSolid({
        kind: 'profile',
        id: 'p',
        profile: row.id,
        data: profileData(row),
      }),
    ).toBe(false);
  });
});

describe('isSolidGeometry', () => {
  it('antwortet an der blossen Figur dasselbe wie isSolid am Satz', () => {
    for (const geometry of [
      outlineGeometry(),
      wallGraph('solid'),
      wallGraph('thin-walled'),
    ]) {
      expect(isSolidGeometry(geometry)).toBe(isSolid(geometrySection(geometry)));
    }
  });
});
