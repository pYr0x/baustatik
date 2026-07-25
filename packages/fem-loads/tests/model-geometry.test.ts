import type { Beam, Node } from '@baustatik/fem';
import { Line, Point } from '@baustatik/fem-geometry';
import { describe, expect, it } from 'vitest';
import { modelGeometry } from '../src/model-geometry';

// Dasselbe Modell wie in apps/demo/fem-viewer.ts: ein waagrechter Stab der
// Laenge 100 und ein schraeger Stab daran.
function makeModel() {
  const nodes: Node[] = [
    { id: 'n1', position: { x: 0, z: 0 } },
    { id: 'n2', position: { x: 100, z: 0 } },
    { id: 'n3', position: { x: 160, z: 40 } },
  ];
  const beams: Beam[] = [
    {
      id: 'b1',
      startNodeId: 'n1',
      endNodeId: 'n2',
      crossSectionId: 'default',
      materialId: 'default',
    },
    {
      id: 'b2',
      startNodeId: 'n2',
      endNodeId: 'n3',
      crossSectionId: 'default',
      materialId: 'default',
    },
  ];
  return { nodes, beams };
}

describe('modelGeometry — hasNode', () => {
  it('kennt die Knoten des Modells', () => {
    const { nodes, beams } = makeModel();
    const model = modelGeometry(nodes, beams);

    expect(model.hasNode('n1')).toBe(true);
    expect(model.hasNode('n3')).toBe(true);
  });

  it('meldet unbekannte Knoten als nicht vorhanden', () => {
    const { nodes, beams } = makeModel();
    const model = modelGeometry(nodes, beams);

    expect(model.hasNode('gibt-es-nicht')).toBe(false);
  });
});

describe('modelGeometry — beamAxis', () => {
  it('liefert die Achse mit p1 am Anfangs- und p2 am Endknoten', () => {
    // Die Reihenfolge traegt die Bedeutung: `distanceFromStart`, `from` und
    // `to` werden ab p1 gemessen. Vertauscht misst die Validierung vom
    // falschen Ende, ohne dass ein Test das sonst bemerkt.
    const { nodes, beams } = makeModel();
    const model = modelGeometry(nodes, beams);

    expect(model.beamAxis('b1')).toEqual(
      Line.make(Point.make(0, 0), Point.make(100, 0)),
    );
    expect(model.beamAxis('b2')).toEqual(
      Line.make(Point.make(100, 0), Point.make(160, 40)),
    );
  });

  it('liefert undefined fuer einen unbekannten Stab', () => {
    const { nodes, beams } = makeModel();
    const model = modelGeometry(nodes, beams);

    expect(model.beamAxis('gibt-es-nicht')).toBeUndefined();
  });

  it('liefert undefined, wenn ein Knoten des Stabes fehlt', () => {
    // Ein haengender Verweis im Modell. Fuer die Lastpruefung ist das
    // dasselbe wie ein unbekannter Stab: es gibt keine Achse, auf der eine
    // Last liegen koennte.
    const { nodes, beams } = makeModel();
    const model = modelGeometry(
      nodes.filter((node) => node.id !== 'n2'),
      beams,
    );

    expect(model.beamAxis('b1')).toBeUndefined();
    expect(model.beamAxis('b2')).toBeUndefined();
  });
});

describe('modelGeometry — Zustand', () => {
  it('gibt Auskunft ueber genau die Listen, mit denen es gebaut wurde', () => {
    // Zwei Modelle nebeneinander duerfen sich nicht ins Gehege kommen.
    const { nodes, beams } = makeModel();
    const full = modelGeometry(nodes, beams);
    const empty = modelGeometry([], []);

    expect(full.hasNode('n1')).toBe(true);
    expect(empty.hasNode('n1')).toBe(false);
    expect(empty.beamAxis('b1')).toBeUndefined();
  });

  it('degenerierten Stab gibt es weiter, die Laengenpruefung liegt woanders', () => {
    // Beide Knoten an derselben Stelle. Hier entsteht trotzdem eine Linie —
    // `validateBeamLoad` meldet dafuer `DegenerateBeamError`. Diese Funktion
    // urteilt nicht, sie gibt Auskunft.
    const nodes: Node[] = [
      { id: 'n1', position: { x: 5, z: 5 } },
      { id: 'n2', position: { x: 5, z: 5 } },
    ];
    const beams: Beam[] = [
      {
        id: 'b1',
        startNodeId: 'n1',
        endNodeId: 'n2',
        crossSectionId: 'default',
        materialId: 'default',
      },
    ];

    expect(modelGeometry(nodes, beams).beamAxis('b1')).toEqual(
      Line.make(Point.make(5, 5), Point.make(5, 5)),
    );
  });
});
