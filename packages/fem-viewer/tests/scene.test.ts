/**
 * Die SZENE als Ganzes: was nur entsteht, wenn Modell, Lasten und Ergebnis
 * zusammenkommen. Was ein einzelner Stab, Knoten, Gelenk oder ein Auflager
 * zeichnet, steht in `model/`; was eine Last zeichnet, in `loads/`; was eine
 * Auflagerreaktion zeichnet, in `results/`.
 */

import { describe, expect, it } from 'vitest';

import type { Node } from '@baustatik/fem';
import { gridSpecs } from '@baustatik/grid-2d';
import { validateSpecs } from '@baustatik/render-core';
import { pan, screenPoint, size, viewport } from '@baustatik/viewport-2d';

import { FEM_LAYERS } from '../src/layers';
import type { FEMStyle } from '../src/scene';
import {
  beamAB,
  hinged,
  nodeA,
  nodeB,
  nodeC,
  simplySupported,
  solveResult,
  specById,
  specsOf,
  supportA,
  vp1,
} from './helpers';

const NODE_LOAD = { id: 'nl', target: 'node', nodeIds: ['b'], fz: 10 };

// Das Ergebnis zu `supportA`: die Stuetze haelt gegen die Last nach unten, `fz`
// ist deshalb negativ (die Kraft AUF das Tragwerk zeigt nach oben). Es traegt
// zugleich den Auswertungszustand des Stabs — EIN Pull fuer beides.
const RESULT = solveResult({
  reactions: new Map([['a', { fx: 0, fz: -10, my: 0 }]]),
  beamStates: new Map([['ab', simplySupported(100, 10)]]),
});

/** Eine Szene, in der jede Sorte Spec genau einmal vorkommt. */
function fullScene(rest: Record<string, unknown> = {}) {
  return specsOf(
    [nodeA, nodeB, nodeC],
    [hinged(beamAB, { start: { theta: true } })],
    {
      supports: [supportA],
      loads: [NODE_LOAD as never],
      result: RESULT,
      diagrams: { M: 1 },
      ...rest,
    },
  );
}

describe('IDs bleiben ueber die ganze Szene eindeutig', () => {
  it('namespaces ids so nodes and beams cannot collide', () => {
    // Ein Knoten und ein Stab duerfen dieselbe Roh-ID tragen; validateSpecs
    // verlangt aber Eindeutigkeit ueber alle Baender hinweg.
    const sameId: Node = { id: 'ab', position: { x: 0, z: 0 } };
    const specs = specsOf([nodeA, nodeB, sameId], [beamAB]);

    expect(specs.map((s) => s.id)).toContain('beam:ab');
    expect(specs.map((s) => s.id)).toContain('node:ab');
    expect(() => validateSpecs(specs)).not.toThrow();
  });

  it('produces specs that pass render-core validation', () => {
    expect(() => validateSpecs(fullScene())).not.toThrow();
  });

  it('keeps load, reaction AND the three diagrams apart at the same beam', () => {
    // Der Fall, den die Namensraeume tragen muessen: an einem Knoten haengt eine
    // Last und eine Auflagerkraft, beide mit derselben Komponente `fz`, und ueber
    // demselben Stab liegen drei Verlaeufe. Ohne die Praefixe `load:`,
    // `reaction:` und `diagram:` waeren es doppelte IDs, und validateSpecs
    // schluege zu.
    const specs = specsOf([nodeA, nodeB], [beamAB], {
      supports: [supportA],
      loads: [{ id: 'nl', target: 'node', nodeIds: ['a'], fz: 10 } as never],
      result: RESULT,
      diagrams: { N: 1, V: 1, M: 1 },
    });

    const ids = specs.map((s) => s.id);
    expect(ids).toContain('load:nl:a:fz:arrow');
    expect(ids).toContain('reaction:a:fz:arrow');
    expect(ids).toContain('diagram:ab:V:outline');
    expect(ids).toContain('diagram:ab:M:outline');
    expect(() => validateSpecs(specs)).not.toThrow();
  });

  it('keeps ids stable across pan and zoom so the renderer patches', () => {
    const before = fullScene();
    const panned = fullScene({ viewport: pan(vp1, 3, 7) });
    const zoomed = fullScene({ viewport: viewport(screenPoint(0, 0), 4) });

    expect(panned.map((s) => s.id)).toEqual(before.map((s) => s.id));
    expect(zoomed.map((s) => s.id)).toEqual(before.map((s) => s.id));
  });
});

describe('Szene und Baender passen zusammen', () => {
  it('emits only bands that FEM_LAYERS declares, grid included', () => {
    // Genau der Fall, den UnknownLayerError im Adapter abfaengt: emittiert
    // irgendeine Quelle ein Band, das der Driver nicht kennt, bricht der erste
    // Frame ab. gridSpecs stampft 'grid' per Vorgabe — das muss im Tupel stehen.
    const specs = [
      ...gridSpecs(vp1, size(200, 200), { spacing: 10 }),
      ...fullScene(),
    ];

    expect(specs.length).toBeGreaterThan(3);
    for (const spec of specs) {
      expect(FEM_LAYERS).toContain(spec.layer);
    }
    // Und die ganze Szene bleibt ueber Baender hinweg ID-eindeutig.
    expect(() => validateSpecs(specs)).not.toThrow();
  });

  it('covers every band except grid from the model, its loads and the result', () => {
    // Die Gegenrichtung: nicht nur „kein unbekanntes Band", sondern auch
    // „kein Band im Tupel, das nie jemand bespielt".
    const used = new Set(fullScene().map((s) => s.layer));

    expect([...FEM_LAYERS].filter((band) => band !== 'grid').sort()).toEqual(
      [...used].sort(),
    );
  });
});

describe('Ohne Ergebnis bleibt die Szene die alte', () => {
  it('adds not a single spec when the result is absent', () => {
    // Der AUS-Zustand hat keinen eigenen Schalter: es gibt ein Ergebnis oder
    // keines. Waere `undefined` nicht exakt neutral, haette das Bild vor dem
    // ersten Rechnen einen anderen Inhalt als danach ohne Ergebnis.
    const withResult = fullScene();
    const without = fullScene({ result: undefined });

    expect(without.map((s) => s.id)).toEqual(
      withResult
        .map((s) => s.id)
        .filter(
          (id) => !id.startsWith('reaction:') && !id.startsWith('diagram:'),
        ),
    );
    expect(without.some((s) => s.layer === 'reactions')).toBe(false);
    expect(without.some((s) => s.layer === 'diagrams')).toBe(false);
  });

  it('draws the reactions but no diagram when getDiagrams is omitted', () => {
    // Die Verlaeufe haben ihren EIGENEN Schalter, und das ist kein zweiter
    // Zustand neben dem Ergebnis: `diagrams` sagt nicht, OB gerechnet wurde,
    // sondern WELCHE der drei Schnittgroessen man sehen will.
    const specs = fullScene({ diagrams: undefined });

    expect(specs.some((s) => s.id.startsWith('reaction:'))).toBe(true);
    expect(specs.some((s) => s.id.startsWith('diagram:'))).toBe(false);
  });
});

describe('Der Stil erreicht alle drei Scheiben', () => {
  it('applies caller overrides to model, loads AND results from one object', () => {
    // Die Vorgaben werden EINMAL aufgeloest und an alle Teile durchgereicht.
    // Wirkte ein Override nur auf einem Drittel, faende man es erst im Bild.
    const style: FEMStyle = {
      nodeColor: '#00f',
      pointForceColor: '#0f0',
      reactionForceColor: '#f0f',
    };
    const specs = fullScene({ style });

    expect(specById(specs, 'node:a')).toMatchObject({ fillColor: '#00f' });
    expect(specById(specs, 'load:nl:b:fz:arrow')).toMatchObject({
      strokeColor: '#0f0',
    });
    expect(specById(specs, 'reaction:a:fz:arrow')).toMatchObject({
      strokeColor: '#f0f',
    });
  });

  it('leaves untouched fields at their defaults on all three', () => {
    const specs = fullScene({ style: { nodeColor: '#00f' } });

    expect(specById(specs, 'beam:ab')).toMatchObject({ strokeColor: '#000' });
    expect(specById(specs, 'load:nl:b:fz:arrow')).toMatchObject({
      strokeColor: '#1d4ed8',
    });
    expect(specById(specs, 'reaction:a:fz:arrow')).toMatchObject({
      strokeColor: '#15803d',
    });
  });

  it('gives load and reaction DIFFERENT colours by default', () => {
    // Die eine Eigenschaft, die die beiden im Bild trennt. Faerbte jemand sie
    // gleich ein, saehe ein Auflager unter einer Last wie eine doppelte Last aus
    // — und die Gleichgewichtsprobe waere nicht mehr abzulesen.
    const specs = fullScene();
    const load = specById(specs, 'load:nl:b:fz:arrow') as { strokeColor: string };
    const reaction = specById(specs, 'reaction:a:fz:arrow') as {
      strokeColor: string;
    };

    expect(reaction.strokeColor).not.toBe(load.strokeColor);
  });
});
