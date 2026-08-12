/**
 * Die SZENE als Ganzes: was nur entsteht, wenn Geometrie, Netz und Ergebnisse
 * zusammenkommen. Was eine einzelne Lage zeichnet, steht in ihrer eigenen
 * Testdatei.
 */

import { DEFAULT_SECTION_POLICY } from '@baustatik/cross-section';
import { gridSpecs } from '@baustatik/grid-2d';
import type { GroupSpec } from '@baustatik/render-core';
import { validateSpecs } from '@baustatik/render-core';
import { pan, screenPoint, size, viewport } from '@baustatik/viewport-2d';
import { describe, expect, it } from 'vitest';

import type { CrossSectionFEMesh } from '../../src/fe';
import { CROSS_SECTION_LAYERS } from '../../src/layers';
import { DEFAULT_STYLE } from '../../src/style';
import {
  OUTLINE,
  PROPERTIES,
  specById,
  specsOf,
  vp1,
  wallGeometry,
} from '../helpers';

const MESH: CrossSectionFEMesh = {
  kind: 'tri3',
  points: new Float64Array([0, 0, 10, 0, 0, 10]),
  elements: new Uint32Array([0, 1, 2]),
};

const STRESS_POINTS = [{ nr: 1, y: -10, z: 20, t: 8, Sy: 0, Sz: 0 }];

/** Eine Szene, in der jede Lage genau einmal vorkommt. */
function fullScene(rest: Record<string, unknown> = {}) {
  return specsOf({
    properties: PROPERTIES,
    stressPoints: STRESS_POINTS,
    feMesh: MESH,
    ...rest,
  });
}

describe('IDs bleiben ueber die ganze Szene eindeutig', () => {
  it('haelt eine Wand-ID von Umriss und Symbol getrennt', () => {
    // Eine vom Editor vergebene Wand-ID darf nicht mit einem Umriss oder Symbol
    // kollidieren; `validateSpecs` verlangt Eindeutigkeit ueber alle Baender.
    const ids = fullScene().map((s) => s.id);

    expect(ids).toContain('cross-section:thin-wall:w1');
    expect(ids).toContain('cross-section:outline:0');
    expect(ids).toContain('cross-section:fe:wireframe');
    expect(ids).toContain('cross-section:symbols');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('besteht die Validierung von render-core', () => {
    expect(() => validateSpecs(fullScene())).not.toThrow();
  });

  it('haelt eine Wand namens „outline:0" von dem Umriss getrennt', () => {
    // Der Fall, den die Namensraeume tragen muessen: ohne die Praefixe waeren es
    // zweimal dieselbe ID, und validateSpecs schluege zu.
    const specs = specsOf({
      geometry: {
        kind: 'midline',
        idealisation: 'thin-walled',
        nodes: [
          { id: 'a', y: 0, z: 0 },
          { id: 'b', y: 100, z: 0 },
        ],
        walls: [
          { id: 'outline:0', startNodeId: 'a', endNodeId: 'b', t: 8 },
        ],
        outline: OUTLINE,
      },
    });

    expect(() => validateSpecs(specs)).not.toThrow();
    expect(specs.map((s) => s.id)).toContain('cross-section:thin-wall:outline:0');
  });

  it('haelt die IDs bei Pan und Zoom stabil, damit der Renderer patcht', () => {
    const before = fullScene();
    const panned = fullScene({ viewport: pan(vp1, 3, 7) });
    const zoomed = fullScene({ viewport: viewport(screenPoint(0, 0), 4) });

    expect(panned.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(zoomed.map((s) => s.id)).toEqual(before.map((s) => s.id));
  });
});

describe('Szene und Baender passen zusammen', () => {
  it('emittiert nur Baender, die CROSS_SECTION_LAYERS deklariert', () => {
    // Genau der Fall, den UnknownLayerError im Adapter abfaengt: emittiert
    // irgendeine Quelle ein Band, das der Driver nicht kennt, bricht der erste
    // Frame ab. gridSpecs stempelt 'grid' per Vorgabe — das muss im Tupel stehen.
    const specs = [
      ...gridSpecs(vp1, size(200, 200), { spacing: 10 }),
      ...fullScene(),
    ];

    expect(specs.length).toBeGreaterThan(3);
    for (const spec of specs) {
      expect(CROSS_SECTION_LAYERS).toContain(spec.layer);
    }
    expect(() => validateSpecs(specs)).not.toThrow();
  });

  it('bespielt jedes Band ausser grid', () => {
    // Die Gegenrichtung: nicht nur „kein unbekanntes Band", sondern auch „kein
    // Band im Tupel, das nie jemand bespielt".
    const used = new Set(fullScene().map((s) => s.layer));

    expect([...CROSS_SECTION_LAYERS].filter((band) => band !== 'grid').sort()).toEqual(
      [...used].sort(),
    );
  });

  it('haelt die Malreihenfolge fest: Waende, Umriss, Netz, Symbole', () => {
    // Die z-Order garantieren die Baender, nicht diese Reihenfolge — sie macht
    // die Absicht im Array trotzdem lesbar.
    expect(fullScene().map((s) => s.layer)).toEqual([
      'thin-walls',
      'outlines',
      'fe',
      'symbols',
    ]);
  });
});

describe('Ohne Ergebnis bleibt die Szene die Figur', () => {
  it('fuegt keine einzige Spec hinzu, wenn alle drei Pulls fehlen', () => {
    // Der AUS-Zustand hat keinen eigenen Schalter: es gibt ein Ergebnis oder
    // keines.
    const bare = specsOf();

    expect(bare.map((s) => s.id)).toEqual([
      'cross-section:thin-wall:w1',
      'cross-section:outline:0',
    ]);
  });

  it('unterscheidet einen weggelassenen Pull nicht von undefined', () => {
    expect(
      specsOf({
        properties: undefined,
        stressPoints: undefined,
        feMesh: undefined,
      }).map((s) => s.id),
    ).toEqual(specsOf().map((s) => s.id));
  });
});

describe('Der Stil erreicht alle vier Lagen', () => {
  it('wendet Aufrufer-Overrides aus EINEM Objekt auf alle an', () => {
    // Einmal aufgeloest und durchgereicht. Wirkte ein Override nur auf einem
    // Viertel, faende man es erst im Bild.
    const specs = fullScene({
      style: {
        thinWallColor: '#111',
        outlineColor: '#222',
        feColor: '#333',
        centroidColor: '#444',
      },
    });

    expect(specById(specs, 'cross-section:thin-wall:w1')).toMatchObject({
      strokeColor: '#111',
    });
    expect(specById(specs, 'cross-section:outline:0')).toMatchObject({
      strokeColor: '#222',
    });
    expect(specById(specs, 'cross-section:fe:wireframe')).toMatchObject({
      strokeColor: '#333',
    });
    const symbols = specById<GroupSpec>(specs, 'cross-section:symbols');
    expect(symbols.children[0]).toMatchObject({ fillColor: '#444' });
  });

  it('laesst unberuehrte Felder auf ihren Vorgaben', () => {
    const specs = fullScene({ style: { thinWallColor: '#111' } });

    expect(specById(specs, 'cross-section:outline:0')).toMatchObject({
      strokeColor: DEFAULT_STYLE.outlineColor,
    });
    expect(specById(specs, 'cross-section:fe:wireframe')).toMatchObject({
      strokeColor: DEFAULT_STYLE.feColor,
    });
  });
});

describe('Die Toleranz kommt aus der Policy der Szene', () => {
  it('reicht sectionPolicy.arcTolerance an die Waende durch', () => {
    // EIN Scene-Input, kein zweiter Pull tief in der Wandabbildung.
    const straight = specsOf({ geometry: wallGeometry(0.001) });
    const curved = specsOf({
      geometry: wallGeometry(0.001),
      sectionPolicy: { ...DEFAULT_SECTION_POLICY, arcTolerance: 0.01 },
    });

    expect(specById(straight, 'cross-section:thin-wall:w1').kind).toBe('line');
    expect(specById(curved, 'cross-section:thin-wall:w1').kind).toBe('arcPath');
  });
});
