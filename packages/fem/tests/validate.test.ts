import { describe, expect, it } from 'vitest';
import {
  DuplicateSupportError,
  IsolatedNodeWarning,
  UnknownNodeReferenceError,
  UnrestrainedBeamError,
  UnsupportedComponentError,
  ZeroLengthBeamError,
} from '../src/errors';
import { components, isolatedNodeIds } from '../src/graph';
import type { Beam, Node, NodeSupport } from '../src/types';
import { assertValidModel, validateModel } from '../src/validate';

function node(id: string, x: number, z: number): Node {
  return { id, position: { x, z } };
}

function beam(id: string, startNodeId: string, endNodeId: string): Beam {
  return {
    id,
    startNodeId,
    endNodeId,
    crossSectionId: 'default',
    materialId: 'default',
  };
}

function support(id: string, nodeId: string): NodeSupport {
  return { id, nodeId, ux: 'fixed', uz: 'fixed', phiY: 'free' };
}

/** Ein waagrechter Stab, am Anfang gelagert. Das kleinste tragende Modell. */
function healthy() {
  return {
    nodes: [node('n1', 0, 0), node('n2', 2, 0)],
    beams: [beam('b1', 'n1', 'n2')],
    supports: [support('s1', 'n1')],
  };
}

describe('validateModel', () => {
  it('beanstandet ein tragendes Modell nicht', () => {
    const { nodes, beams, supports } = healthy();

    expect(validateModel(nodes, beams, supports)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  describe('M1 — haengende Referenzen', () => {
    it('meldet den unbekannten Knoten eines Stabs', () => {
      const { nodes, supports } = healthy();

      const { errors } = validateModel(nodes, [beam('b1', 'n1', 'weg')], supports);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(UnknownNodeReferenceError);
      expect(errors[0]).toMatchObject({
        ownerKind: 'beam',
        ownerId: 'b1',
        nodeId: 'weg',
      });
    });

    it('meldet den unbekannten Knoten eines Auflagers', () => {
      const { nodes, beams } = healthy();

      const { errors } = validateModel(nodes, beams, [support('s1', 'weg')]);

      expect(errors[0]).toMatchObject({ ownerKind: 'support', ownerId: 's1' });
    });

    it('unterdrueckt M3, solange eine Referenz haengt', () => {
      // Ohne die Unterdrueckung faellt `b1` aus dem Graphen, und n1/n2 saehen
      // aus wie eine Teilstruktur ohne Auflager — ein reiner Folgefehler.
      const nodes = [node('n1', 0, 0), node('n2', 2, 0)];

      const { errors } = validateModel(nodes, [beam('b1', 'n1', 'weg')], []);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(UnknownNodeReferenceError);
    });
  });

  describe('M2 — entarteter Stab', () => {
    it('meldet den Stab der Laenge 0', () => {
      const nodes = [node('n1', 3, 4), node('n2', 3, 4)];

      const { errors } = validateModel(nodes, [beam('b1', 'n1', 'n2')], [
        support('s1', 'n1'),
      ]);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(ZeroLengthBeamError);
      expect(errors[0]).toMatchObject({ beamId: 'b1' });
    });
  });

  describe('M3 — Teilstruktur ohne Auflager', () => {
    it('meldet ein Modell ganz ohne Auflager', () => {
      const { nodes, beams } = healthy();

      const { errors } = validateModel(nodes, beams, []);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(UnsupportedComponentError);
      expect(errors[0]).toMatchObject({
        nodeIds: ['n1', 'n2'],
        beamIds: ['b1'],
      });
    });

    it('laesst zwei getrennte, je gelagerte Traeger durch', () => {
      // Die Regel heisst „keine Komponente ohne Halt", NICHT „alles muss
      // zusammenhaengen". Beim Durchlauftraeger-Vergleich ist das der Regelfall.
      const nodes = [
        node('a1', 0, 0),
        node('a2', 2, 0),
        node('b1', 0, 5),
        node('b2', 2, 5),
      ];
      const beams = [beam('ba', 'a1', 'a2'), beam('bb', 'b1', 'b2')];
      const supports = [support('sa', 'a1'), support('sb', 'b1')];

      expect(validateModel(nodes, beams, supports).errors).toEqual([]);
    });

    it('meldet die ungelagerte Komponente neben der gelagerten', () => {
      const nodes = [
        node('a1', 0, 0),
        node('a2', 2, 0),
        node('b1', 0, 5),
        node('b2', 2, 5),
      ];
      const beams = [beam('ba', 'a1', 'a2'), beam('bb', 'b1', 'b2')];

      const { errors } = validateModel(nodes, beams, [support('sa', 'a1')]);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ nodeIds: ['b1', 'b2'], beamIds: ['bb'] });
    });

    it('haelt eine Kette ueber mehrere Staebe zusammen', () => {
      // Union-Find: das Auflager haengt am ANDEREN Ende der Kette.
      const nodes = [node('n1', 0, 0), node('n2', 2, 0), node('n3', 4, 0)];
      const beams = [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3')];

      expect(
        validateModel(nodes, beams, [support('s1', 'n3')]).errors,
      ).toEqual([]);
    });
  });

  describe('M4 — zwei Auflager auf einem Knoten', () => {
    it('meldet sie mit beiden ids', () => {
      const { nodes, beams } = healthy();

      const { errors } = validateModel(nodes, beams, [
        support('s1', 'n1'),
        support('s2', 'n1'),
      ]);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(DuplicateSupportError);
      expect(errors[0]).toMatchObject({
        nodeId: 'n1',
        supportIds: ['s1', 's2'],
      });
    });
  });

  describe('M5 — Knoten ohne Stab', () => {
    it('warnt, ohne zu beanstanden', () => {
      const { nodes, beams, supports } = healthy();

      const result = validateModel([...nodes, node('frei', 9, 9)], beams, supports);

      expect(result.errors).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toBeInstanceOf(IsolatedNodeWarning);
      expect(result.warnings[0]).toMatchObject({ nodeId: 'frei' });
    });

    it('meldet den einzelnen Knoten NICHT als Teilstruktur ohne Auflager', () => {
      const { nodes, beams, supports } = healthy();

      const result = validateModel([...nodes, node('frei', 9, 9)], beams, supports);

      expect(result.errors).toEqual([]);
    });
  });

  describe('M6 — elementinterner Mechanismus', () => {
    it('meldet `u` an beiden Stabenden', () => {
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { u: true }, end: { u: true } };

      const { errors } = validateModel(nodes, [b], supports);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(UnrestrainedBeamError);
      expect(errors[0]).toMatchObject({ beamId: 'b1', direction: 'u' });
    });

    it('meldet `w` an beiden Stabenden', () => {
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { w: true }, end: { w: true } };

      const { errors } = validateModel(nodes, [b], supports);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ beamId: 'b1', direction: 'w' });
    });

    it('meldet BEIDE Richtungen, wenn beide doppelt freigesetzt sind', () => {
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { u: true, w: true }, end: { u: true, w: true } };

      const { errors } = validateModel(nodes, [b], supports);

      expect(errors.map((error) => (error as UnrestrainedBeamError).direction))
        .toEqual(['u', 'w']);
    });

    it('meldet drei Freisetzungen aus dem Biegeblock ohne `w`-Paar', () => {
      // Der Block [w1, theta1, w2, theta2] hat Rang 2: zwei Kondensationen
      // traegt er, die dritte laeuft auf Pivot 0 — auch wenn `w` nur an EINEM
      // Ende freigesetzt ist. Eine Regel, die bloss „dieselbe Richtung an
      // beiden Enden" verbietet, laesst genau diesen Stab durch, und
      // `evaluate` teilt danach durch null.
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { w: true, theta: true }, end: { theta: true } };

      const { errors } = validateModel(nodes, [b], supports);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBeInstanceOf(UnrestrainedBeamError);
      expect(errors[0]).toMatchObject({
        beamId: 'b1',
        direction: 'w',
        released: ['start.w', 'start.theta', 'end.theta'],
      });
    });

    it('meldet dasselbe spiegelbildlich am anderen Stabende', () => {
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { theta: true }, end: { w: true, theta: true } };

      const { errors } = validateModel(nodes, [b], supports);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ direction: 'w' });
    });

    it('zaehlt `u` nicht in den Biegeblock', () => {
      // Axial und Biegung sind entkoppelt. `u` an einem Ende plus zwei
      // Momentengelenke ist der voellig gewoehnliche Pendelstab mit
      // Laengsgleiten — zwei Freisetzungen im Biegeblock, nicht drei.
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { u: true, theta: true }, end: { theta: true } };

      expect(validateModel(nodes, [b], supports).errors).toEqual([]);
    });

    it('laesst den Pendelstab (`theta` an beiden Enden) durch', () => {
      // Nach der Kondensation von theta1 steht K[theta2][theta2] = 3EI/L != 0:
      // kein Pivot 0, der Stab traegt weiter die Normalkraft. Wer die Regel auf
      // `theta` ausdehnt, verbietet den Pendelstab mit.
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { theta: true }, end: { theta: true } };

      expect(validateModel(nodes, [b], supports).errors).toEqual([]);
    });

    it('laesst `u` und `w` an EINEM Ende durch', () => {
      // Ein Stab, der an einer Stelle laengs gleitet, uebertraegt immer noch
      // Querkraft und Moment — das ist ein gewoehnliches Normalkraftgelenk.
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { u: true, w: true } };

      expect(validateModel(nodes, [b], supports).errors).toEqual([]);
    });

    it('laesst verschiedene Richtungen an den beiden Enden durch', () => {
      const { nodes, supports } = healthy();
      const b = beam('b1', 'n1', 'n2');
      b.releases = { start: { u: true }, end: { w: true } };

      expect(validateModel(nodes, [b], supports).errors).toEqual([]);
    });
  });
});

describe('assertValidModel', () => {
  it('laesst ein tragendes Modell durch', () => {
    const { nodes, beams, supports } = healthy();

    expect(() => assertValidModel(nodes, beams, supports)).not.toThrow();
  });

  it('wirft den ersten Fehler', () => {
    const { nodes, supports } = healthy();

    expect(() => assertValidModel(nodes, [beam('b1', 'n1', 'weg')], supports))
      .toThrow(UnknownNodeReferenceError);
  });

  it('ignoriert Warnungen', () => {
    const { nodes, beams, supports } = healthy();

    expect(() =>
      assertValidModel([...nodes, node('frei', 9, 9)], beams, supports),
    ).not.toThrow();
  });
});

describe('components', () => {
  it('verbindet nichts ueber einen Stab mit haengender Referenz', () => {
    // `validateModel` ruft das nie mit haengenden Referenzen auf. Die Klausel
    // schuetzt trotzdem: ohne sie liefe `find` auf einer unbekannten id endlos.
    const nodes = [node('n1', 0, 0), node('n2', 2, 0)];

    expect(components(nodes, [beam('b1', 'n1', 'weg')])).toEqual([
      { nodeIds: ['n1'], beamIds: [] },
      { nodeIds: ['n2'], beamIds: [] },
    ]);
  });
});

describe('isolatedNodeIds', () => {
  it('zaehlt einen Knoten mit Stab nicht als isoliert', () => {
    const { nodes, beams } = healthy();

    expect(isolatedNodeIds(nodes, beams)).toEqual(new Set());
  });

  it('zaehlt den Knoten eines Stabs mit haengender Gegenreferenz nicht als isoliert', () => {
    const nodes = [node('n1', 0, 0)];

    expect(isolatedNodeIds(nodes, [beam('b1', 'n1', 'weg')])).toEqual(new Set());
  });

  it('findet den Knoten ohne jeden Stab', () => {
    const { nodes, beams } = healthy();

    expect(isolatedNodeIds([...nodes, node('frei', 9, 9)], beams)).toEqual(
      new Set(['frei']),
    );
  });
});
