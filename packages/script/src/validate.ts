import type {
  CrossSection,
  Idealisation,
  SectionGeometry,
  ShapeSpec,
  Vertex,
} from '@baustatik/cross-section';
import { BaustatikError } from '@baustatik/errors';
import { assertValidModel } from '@baustatik/fem';
import {
  assertValidLoadCase,
  assertValidLoads,
  type BeamLoad,
  type FEMLoad,
  type LoadCase,
  modelGeometry,
  type NodeLoad,
} from '@baustatik/fem-loads';
import type {
  ElasticModuli,
  Material,
  MaterialKind,
} from '@baustatik/material';
import {
  OPTIONAL_PROFILE_DATA_KEYS,
  PROFILE_DATA_KEYS,
  type SteelProfileData,
} from '@baustatik/steel-profiles';
import type { FEMModelSnapshot } from './types';

export class SnapshotValidationError extends BaustatikError {}

export function parseFEMModelSnapshot(input: unknown): FEMModelSnapshot {
  const snapshot = record(input, 'Snapshot');
  exactKeys(snapshot, 'Snapshot', [
    'schemaVersion',
    'nodes',
    'beams',
    'crossSections',
    'materials',
    'supports',
    'loadCases',
  ]);
  // Ein aelterer Snapshot wird ABGELEHNT und nicht ergaenzt. Bei v1 zeigte
  // `crossSectionId` ins Leere; bei v2 BEDEUTET `materialId` etwas anderes als
  // hier — dort die Guete selbst (`'S235'`), hier ein Verweis auf
  // `Material.id`; bei v3 fehlen die kopierten Zahlen; bei v4 heisst die
  // T-Form `'t-beam'` statt `'t-section'`; bei v5 fehlt die dritte
  // Querschnittsquelle (ADR 0030).
  //
  // Verfuehrerisch zu ergaenzen waeren gleich drei: bei v3 stehen die
  // Bezeichnungen darin, ein Lookup laege nahe; bei v4 waere es ein ersetztes
  // Literal; und v5 ist am Satz sogar UNVERAENDERT — die neue Variante ist rein
  // additiv, ein v5 liesse sich schlicht durchwinken. Genau das ist die stille
  // Aufloesung, die ADR 0027 abschafft: einmal ausgefuehrt, im unguenstigsten
  // Moment, und danach nicht mehr von einer bewussten Wahl zu unterscheiden.
  // Eine Migration ist ein Werkzeug, das jemand AUFRUFT, sieht und ablehnen
  // kann — und AB HIER IST JEDE v5-DATEI VERLOREN.
  if (snapshot.schemaVersion !== 6) {
    fail('Snapshot.schemaVersion muss 6 sein.');
  }

  const nodes = array(snapshot.nodes, 'Snapshot.nodes').map((value, index) => {
    const node = record(value, `Snapshot.nodes[${index}]`);
    exactKeys(node, `Snapshot.nodes[${index}]`, ['id', 'position']);
    const position = record(node.position, `Snapshot.nodes[${index}].position`);
    exactKeys(position, `Snapshot.nodes[${index}].position`, ['x', 'z']);
    return {
      id: text(node.id, `Snapshot.nodes[${index}].id`),
      position: {
        x: finite(position.x, `Snapshot.nodes[${index}].position.x`),
        z: finite(position.z, `Snapshot.nodes[${index}].position.z`),
      },
    };
  });

  const beams = array(snapshot.beams, 'Snapshot.beams').map((value, index) => {
    const beam = record(value, `Snapshot.beams[${index}]`);
    exactKeys(beam, `Snapshot.beams[${index}]`, [
      'id',
      'startNodeId',
      'endNodeId',
      'crossSectionId',
      'materialId',
      'releases',
    ]);
    return {
      id: text(beam.id, `Snapshot.beams[${index}].id`),
      startNodeId: text(
        beam.startNodeId,
        `Snapshot.beams[${index}].startNodeId`,
      ),
      endNodeId: text(beam.endNodeId, `Snapshot.beams[${index}].endNodeId`),
      crossSectionId: text(
        beam.crossSectionId,
        `Snapshot.beams[${index}].crossSectionId`,
      ),
      materialId: text(beam.materialId, `Snapshot.beams[${index}].materialId`),
      ...(beam.releases === undefined
        ? {}
        : {
            releases: releases(
              beam.releases,
              `Snapshot.beams[${index}].releases`,
            ),
          }),
    };
  });

  const crossSections = array(
    snapshot.crossSections,
    'Snapshot.crossSections',
  ).map((value, index) =>
    parseCrossSection(value, `Snapshot.crossSections[${index}]`),
  );

  const materials = array(snapshot.materials, 'Snapshot.materials').map(
    (value, index) => parseMaterial(value, `Snapshot.materials[${index}]`),
  );

  const supports = array(snapshot.supports, 'Snapshot.supports').map(
    (value, index) => {
      const support = record(value, `Snapshot.supports[${index}]`);
      exactKeys(support, `Snapshot.supports[${index}]`, [
        'id',
        'nodeId',
        'ux',
        'uz',
        'phiY',
      ]);
      return {
        id: text(support.id, `Snapshot.supports[${index}].id`),
        nodeId: text(support.nodeId, `Snapshot.supports[${index}].nodeId`),
        ux: restraint(support.ux, `Snapshot.supports[${index}].ux`),
        uz: restraint(support.uz, `Snapshot.supports[${index}].uz`),
        phiY: restraint(support.phiY, `Snapshot.supports[${index}].phiY`),
      };
    },
  );

  const loadIds = new Set<string>();
  const loadCases = array(snapshot.loadCases, 'Snapshot.loadCases').map(
    (value, index): LoadCase => {
      const path = `Snapshot.loadCases[${index}]`;
      const loadCase = record(value, path);
      exactKeys(loadCase, path, ['id', 'name', 'loads', 'factor', 'category']);
      const loads = array(loadCase.loads, `${path}.loads`).map(
        (load, loadIndex) =>
          parseLoad(load, `${path}.loads[${loadIndex}]`, loadIds),
      );
      return {
        id: text(loadCase.id, `${path}.id`),
        name: text(loadCase.name, `${path}.name`, true),
        loads,
        ...(loadCase.factor === undefined
          ? {}
          : { factor: finite(loadCase.factor, `${path}.factor`) }),
        ...(loadCase.category === undefined
          ? {}
          : {
              category: actionCategory(loadCase.category, `${path}.category`),
            }),
      };
    },
  );

  unique(nodes, 'Knoten');
  unique(beams, 'Stab');
  unique(crossSections, 'Querschnitt');
  unique(materials, 'Material');
  unique(supports, 'Lager');
  unique(loadCases, 'Lastfall');

  assertValidModel(nodes, beams, supports);
  const geometry = modelGeometry(nodes, beams);
  for (const loadCase of loadCases) {
    assertValidLoadCase(loadCase);
    assertValidLoads(geometry, loadCase.loads);
  }

  return {
    schemaVersion: 6,
    nodes,
    beams,
    crossSections,
    materials,
    supports,
    loadCases,
  };
}

/**
 * Das Material an der Snapshot-Grenze.
 *
 * NUR DIE GESTALT, nicht die Aufloesbarkeit — dieselbe Regel wie beim
 * Querschnitt, und aus denselben zwei Gruenden: dass ein Stab auf ein
 * vorhandenes Material zeigt, meldet der Bericht des Solvers; ob die Sorte im
 * Katalog steht und ob `moduli` noch zu ihr passt, ist seit ADR 0027 keine
 * Frage dieses Parsers. Die Zahlen im Satz sind die Wahrheit.
 *
 * `kind` wird dagegen hart geprueft: er ist der Diskriminator, an dem beim
 * ANLEGEN der Katalog gewaehlt wurde. Ein unbekanntes `kind` ist keine
 * unbekannte Sorte, sondern ein kaputter Satz.
 */
function parseMaterial(input: unknown, path: string): Material {
  const value = record(input, path);
  exactKeys(value, path, ['kind', 'id', 'grade', 'moduli']);
  return {
    kind: oneOf(
      value.kind,
      [
        'steel',
        'concrete',
        'timber',
      ] as const satisfies readonly MaterialKind[],
      `${path}.kind`,
    ),
    id: text(value.id, `${path}.id`),
    grade: text(value.grade, `${path}.grade`),
    moduli: parseModuli(value.moduli, `${path}.moduli`),
  };
}

/**
 * Die kopierten Moduln — als GESTALT, nicht gegen den Katalog.
 *
 * Sie hier nachzuschlagen und zu vergleichen waere die stille Aufloesung durch
 * die Hintertuer, und zwar an der Stelle, an der ein Nutzer am wenigsten
 * Gelegenheit haette, sie zu bemerken. Ein Abgleich gehoert in ein Werkzeug,
 * das jemand aufruft und dessen Diff er sieht (ADR 0027).
 *
 * Positiv und nicht nur endlich: ein Modul von 0 oder darunter ist kein
 * Werkstoff, sondern ein Tippfehler — und `EA = 0` faende erst das
 * Gleichungssystem, wo es keinem Stab mehr zuzuordnen ist.
 */
function parseModuli(input: unknown, path: string): ElasticModuli {
  const value = record(input, path);
  exactKeys(value, path, ['E', 'G']);
  return {
    E: positive(value.E, `${path}.E`),
    G: positive(value.G, `${path}.G`),
  };
}

/**
 * Der Querschnitt an der Snapshot-Grenze.
 *
 * NUR DIE GESTALT, nicht die Aufloesbarkeit. Zwei Dinge prueft diese Stelle
 * ausdruecklich NICHT, aus zwei verschiedenen Gruenden:
 *
 * - Ob ein Stab auf einen vorhandenen Querschnitt zeigt. Das meldet der Bericht
 *   des Solvers als Modellfehler (`UnknownSectionStiffnessError`), und eine
 *   zweite Regel an einer zweiten Stelle gaebe zwei Wahrheiten darueber, was
 *   ein gueltiges Modell ist.
 * - Ob `profile` im Katalog steht und ob `data` noch zur heutigen Tabelle
 *   passt. Das ist seit ADR 0027 gar keine Frage mehr, die dieser Parser
 *   stellen darf: die Zeile IM SATZ ist die Wahrheit. Ein Vergleich hier waere
 *   die stille Aufloesung durch die Hintertuer — an der Stelle, an der ein
 *   Nutzer sie am wenigsten bemerken kann. Ein Tippfehler in der Bezeichnung
 *   ist beim Anlegen aufgefallen (`FEMScriptError`), lange vorher.
 *
 * `idealisation` ist Pflicht, wo `ShapeSpec` es verlangt — ein fehlendes Feld
 * hier stillschweigend auf `'solid'` zu setzen, waere genau der Default, den
 * `cross-section` bewusst nicht anbietet.
 */
function parseCrossSection(input: unknown, path: string): CrossSection {
  const value = record(input, path);
  const kind = oneOf(
    value.kind,
    ['shape', 'profile', 'section-geometry'] as const,
    `${path}.kind`,
  );
  const id = text(value.id, `${path}.id`);

  if (kind === 'profile') {
    exactKeys(value, path, ['kind', 'id', 'profile', 'data']);
    return {
      kind,
      id,
      profile: text(value.profile, `${path}.profile`),
      data: parseProfileData(value.data, `${path}.data`),
    };
  }

  if (kind === 'section-geometry') {
    exactKeys(value, path, ['kind', 'id', 'geometry']);
    return {
      kind,
      id,
      geometry: parseSectionGeometry(value.geometry, `${path}.geometry`),
    };
  }

  exactKeys(value, path, ['kind', 'id', 'shape']);
  return { kind, id, shape: parseShape(value.shape, `${path}.shape`) };
}

/**
 * Die freie Geometrie an der Snapshot-Grenze — wieder NUR DIE GESTALT
 * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
 *
 * WAS HIER NICHT GEPRUEFT WIRD, und der Grund ist neu: ob die Figur RECHENBAR
 * ist. Dafuer gibt es seit P0 ein benanntes Gatter,
 * `validateSectionGeometry` in `@baustatik/cross-section`, und es sagt „Wand
 * *w3* zeigt auf einen Knoten, den es nicht gibt", waehrend dieser Parser nur
 * „`walls[2].from` ist keine Zeichenkette" sagen koennte. Zwei Meinungen
 * darueber, was ein brauchbarer Querschnitt ist, waeren eine zu viel — deshalb
 * wird `t` hier auf ENDLICH geprueft und nicht auf positiv: das Vorzeichen
 * gehoert dem Gatter, das die Wand beim Namen nennt.
 *
 * Der mitgefuehrte `outline` wird ebenfalls nur auf Gestalt geprueft und NICHT
 * gegen `nodes`/`walls` nachgerechnet. Das waere die stille Aufloesung durch
 * die Hintertuer, an genau der Stelle, an der ein Nutzer sie am wenigsten
 * bemerkt — dieselbe Regel wie bei der kopierten Profilzeile (ADR 0027). Die
 * Drift meldet das Gatter, sichtbar.
 */
function parseSectionGeometry(input: unknown, path: string): SectionGeometry {
  const value = record(input, path);
  const kind = oneOf(value.kind, ['walls', 'outline'] as const, `${path}.kind`);

  const outline = array(value.outline, `${path}.outline`).map(
    (polygon, index) => {
      const polygonPath = `${path}.outline[${index}]`;
      const fields = record(polygon, polygonPath);
      exactKeys(fields, polygonPath, ['points']);
      return {
        points: array(fields.points, `${polygonPath}.points`).map(
          (point, at) => {
            const pointPath = `${polygonPath}.points[${at}]`;
            // Das ERGEBNIS traegt kein `bulge` — genau daran sind Eingabe und
            // Ergebnis am Typ zu unterscheiden, und hier wird es durchgesetzt.
            exactKeys(record(point, pointPath), pointPath, ['y', 'z']);
            return parseCoordinates(point, pointPath);
          },
        ),
      };
    },
  );

  if (kind === 'outline') {
    exactKeys(value, path, ['kind', 'rings', 'outline']);
    return {
      kind,
      rings: array(value.rings, `${path}.rings`).map((ring, index) => {
        const ringPath = `${path}.rings[${index}]`;
        const fields = record(ring, ringPath);
        exactKeys(fields, ringPath, ['vertices']);
        return {
          vertices: array(fields.vertices, `${ringPath}.vertices`).map(
            (vertex, at) =>
              parseVertex(vertex, `${ringPath}.vertices[${at}]`),
          ),
        };
      }),
      outline,
    };
  }

  exactKeys(value, path, ['kind', 'nodes', 'walls', 'idealisation', 'outline']);
  return {
    kind,
    nodes: array(value.nodes, `${path}.nodes`).map((node, index) => {
      const nodePath = `${path}.nodes[${index}]`;
      const fields = record(node, nodePath);
      exactKeys(fields, nodePath, ['id', 'y', 'z']);
      return {
        id: text(fields.id, `${nodePath}.id`),
        ...parseCoordinates(fields, nodePath),
      };
    }),
    walls: array(value.walls, `${path}.walls`).map((wall, index) => {
      const wallPath = `${path}.walls[${index}]`;
      const fields = record(wall, wallPath);
      exactKeys(fields, wallPath, ['id', 'from', 'to', 't', 'bulge']);
      return {
        id: text(fields.id, `${wallPath}.id`),
        from: text(fields.from, `${wallPath}.from`),
        to: text(fields.to, `${wallPath}.to`),
        t: finite(fields.t, `${wallPath}.t`),
        ...(fields.bulge === undefined
          ? {}
          : { bulge: finite(fields.bulge, `${wallPath}.bulge`) }),
      };
    }),
    idealisation: parseIdealisation(value.idealisation, path),
    outline,
  };
}

/** Ein Umrisspunkt der EINGABE — mit `bulge`, anders als das Ergebnis. */
function parseVertex(input: unknown, path: string): Vertex {
  const value = record(input, path);
  exactKeys(value, path, ['y', 'z', 'bulge']);
  return {
    ...parseCoordinates(value, path),
    ...(value.bulge === undefined
      ? {}
      : { bulge: finite(value.bulge, `${path}.bulge`) }),
  };
}

/**
 * `y`/`z` in MILLIMETERN — dieselbe Einheit wie `ShapeSpec`, und aus demselben
 * Grund: das ist die Einheit, in der ein Querschnitt gezeichnet wird.
 *
 * Nur endlich, nicht positiv: eine Koordinate darf negativ und darf 0 sein.
 */
function parseCoordinates(
  input: unknown,
  path: string,
): { y: number; z: number } {
  const value = record(input, path);
  return {
    y: finite(value.y, `${path}.y`),
    z: finite(value.z, `${path}.z`),
  };
}

/**
 * WELCHE Spalten fehlen duerfen, sagt `@baustatik/steel-profiles` — nicht diese
 * Datei. Eine eigene Liste hier waere eine zweite Wahrheit ueber das `?` an
 * `SteelProfileData`, und eine dritte optionale Spalte drueben liesse diesen
 * Parser Snapshots ablehnen, die sie voellig zu Recht weglassen.
 */
const OPTIONAL_PROFILE_KEYS: ReadonlySet<string> = new Set(
  OPTIONAL_PROFILE_DATA_KEYS,
);

/**
 * Die kopierte Tabellenzeile — wieder als GESTALT, nicht gegen den Katalog.
 *
 * Der Spaltensatz kommt aus `PROFILE_DATA_KEYS` und nicht aus einer Liste
 * hier: `@baustatik/steel-profiles` besitzt die Zeile und sagt deshalb auch,
 * woraus sie besteht. Wer eine Spalte ergaenzt, tut es dort, und dieser Parser
 * laesst sie ohne weiteres Zutun durch.
 *
 * `Ay`/`Az` duerfen fehlen — eine Reihe ohne tabellierte Schubflaeche rechnet
 * schubstarr, statt dass ein Naeherungswert erfunden wird. `r` darf 0 sein:
 * ein geschweisstes Profil hat keine Ausrundung. Alles Uebrige ist echt
 * positiv, denn eine Flaeche oder ein Traegheitsmoment von 0 ist kein Profil.
 */
function parseProfileData(input: unknown, path: string): SteelProfileData {
  const value = record(input, path);
  exactKeys(value, path, [...PROFILE_DATA_KEYS]);

  const parsed: Partial<Record<(typeof PROFILE_DATA_KEYS)[number], number>> =
    {};
  for (const key of PROFILE_DATA_KEYS) {
    const at = `${path}.${key}`;
    if (value[key] === undefined && OPTIONAL_PROFILE_KEYS.has(key)) continue;
    // Der Ausrundungsradius ist die einzige Spalte, die 0 sein DARF.
    parsed[key] =
      key === 'r' ? nonNegative(value[key], at) : positive(value[key], at);
  }
  // Der Cast geht von `Partial` auf vollstaendig, und er ist belegt: die
  // Schleife laeuft ueber ALLE Spalten und laesst nur die aus, die
  // `SteelProfileData` selbst optional fuehrt. Ausgeschrieben stuenden hier
  // 21 Zeilen — eine zweite Liste neben `PROFILE_DATA_KEYS`, die auseinander
  // laufen kann.
  return parsed as SteelProfileData;
}

/** Eine Groesse, die verschwinden darf, aber nicht negativ werden. */
function nonNegative(value: unknown, path: string): number {
  const number = finite(value, path);
  if (number < 0) fail(`${path} darf nicht negativ sein.`);
  return number;
}

/**
 * Alle Abmessungen sind MILLIMETER (`ShapeSpec` in `@baustatik/cross-section`).
 *
 * Geprueft wird nur „endlich und echt positiv" — die Einheit selbst ist nichts,
 * was ein Parser feststellen koennte, und eine Plausibilitaetsgrenze („kein
 * Querschnitt ist 10 m hoch") waere eine zweite Meinung darueber, was ein
 * gueltiges Modell ist. Die haelt der Bericht des Solvers.
 */
function parseShape(input: unknown, path: string): ShapeSpec {
  const value = record(input, path);
  const kind = oneOf(
    value.kind,
    ['rectangle', 'hollow-rectangle', 'i-symmetric', 't-section'] as const,
    `${path}.kind`,
  );
  const size = (key: string) => positive(value[key], `${path}.${key}`);

  switch (kind) {
    case 'rectangle':
      // Das Vollrechteck traegt KEIN `idealisation`: ein duennwandiges
      // Vollrechteck gibt es nicht.
      exactKeys(value, path, ['kind', 'b', 'h']);
      return { kind, b: size('b'), h: size('h') };
    case 'hollow-rectangle':
      exactKeys(value, path, ['kind', 'b', 'h', 't', 'idealisation']);
      return {
        kind,
        b: size('b'),
        h: size('h'),
        t: size('t'),
        idealisation: parseIdealisation(value.idealisation, path),
      };
    case 'i-symmetric':
      exactKeys(value, path, ['kind', 'h', 'b', 'tw', 'tf', 'idealisation']);
      return {
        kind,
        h: size('h'),
        b: size('b'),
        tw: size('tw'),
        tf: size('tf'),
        idealisation: parseIdealisation(value.idealisation, path),
      };
    case 't-section':
      exactKeys(value, path, ['kind', 'bf', 'hf', 'bw', 'h', 'idealisation']);
      return {
        kind,
        bf: size('bf'),
        hf: size('hf'),
        bw: size('bw'),
        h: size('h'),
        idealisation: parseIdealisation(value.idealisation, path),
      };
  }
}

function parseIdealisation(value: unknown, path: string): Idealisation {
  return oneOf(
    value,
    ['solid', 'thin-walled'] as const,
    `${path}.idealisation`,
  );
}

/** Eine Abmessung. Null und negativ sind keine Masse, sondern Tippfehler. */
function positive(value: unknown, path: string): number {
  const number = finite(value, path);
  if (number <= 0) fail(`${path} muss groesser als 0 sein.`);
  return number;
}

function parseLoad(input: unknown, path: string, ids: Set<string>): FEMLoad {
  const load = record(input, path);
  const id = text(load.id, `${path}.id`);
  if (ids.has(id)) fail(`Die Last-ID "${id}" kommt mehrfach vor.`);
  ids.add(id);

  const common = {
    id,
    ...(load.comment === undefined
      ? {}
      : { comment: text(load.comment, `${path}.comment`, true) }),
    ...(load.origin === undefined
      ? {}
      : { origin: origin(load.origin, `${path}.origin`) }),
  };

  if (load.target === 'node') {
    exactKeys(load, path, [
      'id',
      'target',
      'nodeIds',
      'fx',
      'fz',
      'my',
      'origin',
      'comment',
    ]);
    const result: NodeLoad = {
      ...common,
      target: 'node',
      nodeIds: stringArray(load.nodeIds, `${path}.nodeIds`),
      ...(load.fx === undefined ? {} : { fx: finite(load.fx, `${path}.fx`) }),
      ...(load.fz === undefined ? {} : { fz: finite(load.fz, `${path}.fz`) }),
      ...(load.my === undefined ? {} : { my: finite(load.my, `${path}.my`) }),
    };
    return result;
  }

  if (load.target !== 'beam')
    fail(`${path}.target muss "node" oder "beam" sein.`);
  const beamIds = stringArray(load.beamIds, `${path}.beamIds`);

  if (load.kind === 'force') {
    const direction = {
      frame: oneOf(load.frame, ['global', 'local'] as const, `${path}.frame`),
      axis: oneOf(load.axis, ['x', 'z'] as const, `${path}.axis`),
    };
    if (load.distribution === 'point') {
      exactKeys(load, path, [
        ...beamLoadBaseKeys,
        'frame',
        'axis',
        'p',
        'distanceFromStart',
        'relativeDistances',
      ]);
      return {
        ...common,
        ...direction,
        ...placementFields(load, path),
        target: 'beam',
        beamIds,
        kind: 'force',
        distribution: 'point',
        p: finite(load.p, `${path}.p`),
      };
    }
    const referenceLength = oneOf(
      load.referenceLength,
      ['trueLength', 'horizontalProjection', 'verticalProjection'] as const,
      `${path}.referenceLength`,
    );
    if (load.distribution === 'constant') {
      exactKeys(load, path, [
        ...beamLoadBaseKeys,
        'frame',
        'axis',
        'referenceLength',
        'q',
      ]);
      return {
        ...common,
        ...direction,
        target: 'beam',
        beamIds,
        kind: 'force',
        distribution: 'constant',
        referenceLength,
        q: finite(load.q, `${path}.q`),
      };
    }
    if (load.distribution === 'trapezoidal') {
      exactKeys(load, path, [
        ...beamLoadBaseKeys,
        'frame',
        'axis',
        'referenceLength',
        'q1',
        'q2',
        ...extentKeys,
      ]);
      return {
        ...common,
        ...direction,
        ...extentFields(load, path),
        target: 'beam',
        beamIds,
        kind: 'force',
        distribution: 'trapezoidal',
        referenceLength,
        q1: finite(load.q1, `${path}.q1`),
        q2: finite(load.q2, `${path}.q2`),
      } as BeamLoad;
    }
  }

  if (load.kind === 'moment') {
    if (load.distribution === 'point') {
      exactKeys(load, path, [
        ...beamLoadBaseKeys,
        'm',
        'distanceFromStart',
        'relativeDistances',
      ]);
      return {
        ...common,
        ...placementFields(load, path),
        target: 'beam',
        beamIds,
        kind: 'moment',
        distribution: 'point',
        m: finite(load.m, `${path}.m`),
      };
    }
    if (load.distribution === 'constant') {
      exactKeys(load, path, [...beamLoadBaseKeys, 'm']);
      return {
        ...common,
        target: 'beam',
        beamIds,
        kind: 'moment',
        distribution: 'constant',
        m: finite(load.m, `${path}.m`),
      };
    }
    if (load.distribution === 'trapezoidal') {
      exactKeys(load, path, [...beamLoadBaseKeys, 'm1', 'm2', ...extentKeys]);
      return {
        ...common,
        ...extentFields(load, path),
        target: 'beam',
        beamIds,
        kind: 'moment',
        distribution: 'trapezoidal',
        m1: finite(load.m1, `${path}.m1`),
        m2: finite(load.m2, `${path}.m2`),
      } as BeamLoad;
    }
  }

  fail(`${path} enthält eine unbekannte Stablastvariante.`);
}

function placementFields(value: Record<string, unknown>, path: string) {
  return {
    distanceFromStart: finite(
      value.distanceFromStart,
      `${path}.distanceFromStart`,
    ),
    ...(value.relativeDistances === undefined
      ? {}
      : {
          relativeDistances: bool(
            value.relativeDistances,
            `${path}.relativeDistances`,
          ),
        }),
  };
}

function extentFields(value: Record<string, unknown>, path: string) {
  if (value.fullLength === true) {
    if (
      value.from !== undefined ||
      value.to !== undefined ||
      value.relativeDistances !== undefined
    ) {
      fail(`${path} darf bei fullLength: true keine Abstände enthalten.`);
    }
    return { fullLength: true as const };
  }
  return {
    ...(value.fullLength === undefined
      ? {}
      : { fullLength: literalFalse(value.fullLength, `${path}.fullLength`) }),
    from: finite(value.from, `${path}.from`),
    to: finite(value.to, `${path}.to`),
    ...(value.relativeDistances === undefined
      ? {}
      : {
          relativeDistances: bool(
            value.relativeDistances,
            `${path}.relativeDistances`,
          ),
        }),
  };
}

function releases(input: unknown, path: string) {
  const value = record(input, path);
  exactKeys(value, path, ['start', 'end']);
  const end = (input: unknown, endPath: string) => {
    const fields = record(input, endPath);
    exactKeys(fields, endPath, ['u', 'w', 'theta']);
    return {
      ...(fields.u === undefined
        ? {}
        : { u: literalTrue(fields.u, `${endPath}.u`) }),
      ...(fields.w === undefined
        ? {}
        : { w: literalTrue(fields.w, `${endPath}.w`) }),
      ...(fields.theta === undefined
        ? {}
        : { theta: literalTrue(fields.theta, `${endPath}.theta`) }),
    };
  };
  return {
    ...(value.start === undefined
      ? {}
      : { start: end(value.start, `${path}.start`) }),
    ...(value.end === undefined ? {} : { end: end(value.end, `${path}.end`) }),
  };
}

function actionCategory(input: unknown, path: string) {
  const value = record(input, path);
  const action = oneOf(
    value.action,
    ['permanent', 'variable', 'accidental'] as const,
    `${path}.action`,
  );
  if (action === 'permanent') {
    exactKeys(value, path, ['action']);
    return { action } as const;
  }
  if (action === 'accidental') {
    exactKeys(value, path, ['action']);
    return { action } as const;
  }
  const kind = oneOf(
    value.kind,
    ['imposed', 'snow', 'wind', 'temperature'] as const,
    `${path}.kind`,
  );
  if (kind === 'imposed') {
    exactKeys(value, path, ['action', 'kind', 'useCategory']);
    return {
      action,
      kind,
      useCategory: oneOf(
        value.useCategory,
        ['A', 'B', 'C', 'D', 'E'] as const,
        `${path}.useCategory`,
      ),
    };
  }
  exactKeys(value, path, ['action', 'kind']);
  return { action, kind };
}

function origin(input: unknown, path: string) {
  const value = record(input, path);
  const kind = oneOf(
    value.kind,
    ['manual', 'self-weight', 'generated'] as const,
    `${path}.kind`,
  );
  if (kind === 'generated') {
    exactKeys(value, path, ['kind', 'generatorId']);
    return {
      kind,
      generatorId: text(value.generatorId, `${path}.generatorId`),
    };
  }
  exactKeys(value, path, ['kind']);
  return { kind };
}

function unique(values: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id))
      fail(`${label}-ID "${value.id}" kommt mehrfach vor.`);
    ids.add(value.id);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${path} muss ein Objekt sein.`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} muss ein Array sein.`);
  return value;
}

function text(value: unknown, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    fail(
      `${path} muss eine ${allowEmpty ? '' : 'nicht leere '}Zeichenkette sein.`,
    );
  }
  return value;
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${path} muss eine endliche Zahl sein.`);
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(`${path} muss ein Boolean sein.`);
  return value;
}

function literalTrue(value: unknown, path: string): true {
  if (value !== true) fail(`${path} darf nur true sein.`);
  return true;
}

function literalFalse(value: unknown, path: string): false {
  if (value !== false) fail(`${path} darf nur false sein.`);
  return false;
}

function restraint(value: unknown, path: string): 'fixed' | 'free' {
  return oneOf(value, ['fixed', 'free'] as const, path);
}

function stringArray(value: unknown, path: string): string[] {
  const values = array(value, path).map((item, index) =>
    text(item, `${path}[${index}]`),
  );
  if (new Set(values).size !== values.length) {
    fail(`${path} darf keine doppelten IDs enthalten.`);
  }
  return values;
}

const beamLoadBaseKeys = [
  'id',
  'target',
  'beamIds',
  'kind',
  'distribution',
  'origin',
  'comment',
] as const;

const extentKeys = ['fullLength', 'from', 'to', 'relativeDistances'] as const;

function exactKeys(
  value: Record<string, unknown>,
  path: string,
  allowed: readonly string[],
): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected !== undefined) {
    fail(`${path}.${unexpected} ist kein erlaubtes Feld.`);
  }
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) {
    fail(
      `${path} muss ${choices.map((choice) => `"${choice}"`).join(' oder ')} sein.`,
    );
  }
  return value as T[number];
}

function fail(message: string): never {
  throw new SnapshotValidationError(message);
}
