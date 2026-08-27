/**
 * Der VIEWER: Pulls, Kamera und Driver-Protokoll. Was gezeichnet wird, steht in
 * `scene.test.ts` und den Lagen darunter — hier steht nur, WANN und WORAUS.
 */

import { DEFAULT_SECTION_POLICY } from '@baustatik/cross-section';
import { screenPoint, viewport } from '@baustatik/viewport-2d';
import { describe, expect, it } from 'vitest';

import type { CrossSectionFEMesh } from '../../src/fe';
import { createCrossSectionViewer } from '../../src/viewer';
import { PROPERTIES, recordingDriver, wallGeometry } from '../helpers';

const MESH: CrossSectionFEMesh = {
  kind: 'tri3',
  points: new Float64Array([0, 0, 10, 0, 0, 10]),
  elements: new Uint32Array([0, 1, 2]),
};

function viewerWith(
  config: Partial<Parameters<typeof createCrossSectionViewer>[0]> = {},
) {
  const driver = recordingDriver();
  const viewer = createCrossSectionViewer({
    driver,
    getGeometry: () => wallGeometry(),
    getSectionPolicy: () => DEFAULT_SECTION_POLICY,
    getScreenSize: () => ({ width: 800, height: 600 }),
    initialViewport: viewport(screenPoint(0, 0), 1),
    ...config,
  });
  return { driver, viewer };
}

describe('Jeder Pull wird genau einmal je Frame gelesen', () => {
  it('zieht Geometrie, Policy, Bewehrung und die drei Ergebnisse je Zeichnung einmal', () => {
    // Ein zweiter Aufruf koennte einen anderen Wert liefern, und dann zeigte
    // ein Bild zwei Rechenstaende.
    const counts = {
      geometry: 0,
      policy: 0,
      reinforcement: 0,
      properties: 0,
      stressPoints: 0,
      mesh: 0,
    };
    const { viewer } = viewerWith({
      getGeometry: () => {
        counts.geometry++;
        return wallGeometry();
      },
      getSectionPolicy: () => {
        counts.policy++;
        return DEFAULT_SECTION_POLICY;
      },
      getReinforcement: () => {
        counts.reinforcement++;
        return undefined;
      },
      getProperties: () => {
        counts.properties++;
        return PROPERTIES;
      },
      getStressPoints: () => {
        counts.stressPoints++;
        return undefined;
      },
      getFEMesh: () => {
        counts.mesh++;
        return MESH;
      },
    });

    viewer.requestRender();
    expect(counts).toEqual({
      geometry: 1,
      policy: 1,
      reinforcement: 1,
      properties: 1,
      stressPoints: 1,
      mesh: 1,
    });

    viewer.requestRender();
    expect(counts.geometry).toBe(2);
  });

  it('folgt dem naechsten Ergebnis, ohne einen zweiten Zustand zu fuehren', () => {
    // Der Aufrufer verwirft sein Ergebnis; das Bild folgt ihm.
    let mesh: CrossSectionFEMesh | undefined;
    const { driver, viewer } = viewerWith({ getFEMesh: () => mesh });

    viewer.requestRender();
    expect(driver.specs.some((s) => s.layer === 'fe')).toBe(false);

    mesh = MESH;
    viewer.requestRender();
    expect(driver.specs.some((s) => s.layer === 'fe')).toBe(true);

    mesh = undefined;
    viewer.requestRender();
    expect(driver.specs.some((s) => s.layer === 'fe')).toBe(false);
  });

  it('behandelt einen weggelassenen Pull wie undefined', () => {
    const { driver, viewer } = viewerWith();
    viewer.requestRender();

    expect(driver.specs.some((s) => s.layer === 'symbols')).toBe(false);
    expect(driver.specs.some((s) => s.layer === 'fe')).toBe(false);
  });
});

describe('Das Driver-Protokoll steht fest', () => {
  it('setzt den Viewport, reconciled und flusht — in dieser Reihenfolge', () => {
    const { driver, viewer } = viewerWith();
    viewer.requestRender();

    expect(driver.calls).toEqual(['applyViewport', 'reconcile', 'flush']);
  });

  it('stellt das Grid voran, wenn eines konfiguriert ist', () => {
    const { driver, viewer } = viewerWith({ grid: { spacing: 10 } });
    viewer.requestRender();

    expect(driver.specs[0]?.layer).toBe('grid');
    expect(driver.specs.some((s) => s.layer === 'grid')).toBe(true);
  });

  it('zeichnet ohne grid-Option kein Grid', () => {
    const { driver, viewer } = viewerWith();
    viewer.requestRender();

    expect(driver.specs.some((s) => s.layer === 'grid')).toBe(false);
  });

  it('reicht destroy an den Driver durch', () => {
    const { driver, viewer } = viewerWith();
    viewer.destroy();

    expect(driver.calls).toContain('destroy');
  });
});

describe('Der Viewer haelt nur den Viewport', () => {
  it('zeichnet nach jedem Intent neu', () => {
    const { driver, viewer } = viewerWith();
    viewer.requestRender();
    const before = driver.calls.length;

    driver.emit({ type: 'pan', dx: 10, dy: 5 });

    expect(driver.calls.slice(before)).toEqual([
      'applyViewport',
      'reconcile',
      'flush',
    ]);
  });

  it('skaliert die Wandstaerke mit dem Zoom', () => {
    // Die Kamera lebt hier, und die physische Wandstaerke haengt an ihr.
    const { driver, viewer } = viewerWith();
    viewer.requestRender();
    const before = driver.specs.find(
      (s) => s.id === 'cross-section:thin-wall:w1',
    );

    driver.emit({
      type: 'zoom',
      pointer: screenPoint(0, 0),
      factor: 2,
    });
    const after = driver.specs.find(
      (s) => s.id === 'cross-section:thin-wall:w1',
    );

    expect(before).toMatchObject({ strokeWidth: 8 });
    expect(after).toMatchObject({ strokeWidth: 16 });
  });

  it('setzt reset auf den initialen Viewport zurueck', () => {
    const { driver, viewer } = viewerWith();
    driver.emit({ type: 'zoom', pointer: screenPoint(0, 0), factor: 4 });
    expect(
      driver.specs.find((s) => s.id === 'cross-section:thin-wall:w1'),
    ).toMatchObject({ strokeWidth: 32 });

    driver.emit({ type: 'reset' });

    expect(
      driver.specs.find((s) => s.id === 'cross-section:thin-wall:w1'),
    ).toMatchObject({ strokeWidth: 8 });
  });
});

/**
 * DER VIERTE PULL, und er ist KEIN Ergebnis-Pull
 * ([ADR 0064](../../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)):
 * `undefined` heisst hier „keine Bewehrung", nicht „noch nicht gerechnet".
 */
describe('Der Bewehrungs-Pull', () => {
  it('bringt die Bande ins Bild, wenn er Lagen liefert', () => {
    const { driver, viewer } = viewerWith({
      getReinforcement: () => [
        { id: 'unten', elements: [{ id: 'u1', y: 20, z: 80, As: 4.52 }] },
      ],
    });
    viewer.requestRender();

    expect(driver.specs.map((spec) => spec.id)).toContain(
      'cross-section:rebar',
    );
  });

  it('erzeugt bei weggelassenem Pull nichts im Band', () => {
    const { driver, viewer } = viewerWith();
    viewer.requestRender();

    expect(driver.specs.some((spec) => spec.layer === 'rebar')).toBe(false);
  });
});
