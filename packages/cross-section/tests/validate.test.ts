import { lookupProfile, profileData } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  createSectionGeometry,
  DegenerateOutlineRingError,
  deriveOutlineFromWalls,
  DuplicateSectionIdError,
  EmptyOutlineError,
  MiterLimitExceededWarning,
  NegativeOutlineAreaError,
  NonFiniteBulgeError,
  NonPositiveWallThicknessError,
  NotPrincipalAxesWarning,
  OutlineDriftWarning,
  type SectionGeometry,
  type SectionProperties,
  sectionProperties,
  ShearCentreOffsetWarning,
  ShearCentreUnknownWarning,
  TangentKinkWarning,
  UndiscretisableBulgeError,
  UnknownSectionNodeError,
  UnnestedHoleWarning,
  validateSectionGeometry,
  validateSectionProperties,
  type Wall,
  ZeroLengthWallError,
} from '../src/index';

/**
 * Das Gate des Querschnitts
 * ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)).
 *
 * Die Toleranz reist in der POLICY herein und steht nicht im Gate — deshalb
 * kann dieser Test sie festhalten, ohne eine Konstante zu importieren
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 */
const ARC_TOLERANCE = 0.05; // mm, wie `DEFAULT_ARC_TOLERANCE`
const POLICY = createSectionPolicy({ arcTolerance: ARC_TOLERANCE });

/** Ein tragender Umriss, damit `EmptyOutlineError` nicht dazwischenfunkt. */
const SOME_OUTLINE = [
  {
    points: [
      { y: 0, z: 0 },
      { y: 100, z: 0 },
      { y: 100, z: 100 },
    ],
  },
];

/**
 * Ein Wandgraph samt dem Umriss, den ER ergibt — seit das Gate beide
 * vergleicht (ADR 0037).
 *
 * FÄLLT AUF `SOME_OUTLINE` ZURÜCK, wenn der Graph so kaputt ist, dass gar kein
 * Umriss entsteht: sonst schlüge bei jedem Fehlerfall zusätzlich
 * `EmptyOutlineError` zu, und die Tests unten prüften Folgefehler statt des
 * Befunds, um den es ihnen geht. Die Drift-Prüfung läuft ohnehin nur bei sonst
 * fehlerfreier Figur.
 */
function midline(
  nodes: readonly { id: string; y: number; z: number }[],
  edges: readonly Wall[],
): SectionGeometry {
  const derived = deriveOutlineFromWalls([...nodes], [...edges], POLICY);
  return {
    kind: 'midline',
    nodes: [...nodes],
    walls: [...edges],
    idealisation: 'thin-walled',
    outline: derived.length > 0 ? [...derived] : SOME_OUTLINE,
  };
}

function check(geometry: SectionGeometry) {
  return validateSectionGeometry(geometry, POLICY);
}

describe('Die Fehlerseite: dieser Satz ist nicht rechenbar', () => {
  it('meldet eine Wand, die auf einen unbekannten Knoten zeigt', () => {
    const { errors } = check(
      midline(
        [
          { id: 'n1', y: 0, z: 0 },
          { id: 'n2', y: 0, z: 100 },
        ],
        [{ id: 'w1', startNodeId: 'n0', endNodeId: 'n2', t: 6 }],
      ),
    );
    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(error).toBeInstanceOf(UnknownSectionNodeError);
    // DIE ID STEHT ALS FELD, nicht nur im Text: die Oberfläche markiert die
    // Wand daran, und aus einer Meldung ließe sie sich nur herausparsen.
    expect((error as UnknownSectionNodeError).wallId).toBe('w1');
    expect((error as UnknownSectionNodeError).nodeId).toBe('n0');
    expect((error as UnknownSectionNodeError).end).toBe('start');
  });

  it('meldet doppelte Knoten- und Wand-Ids', () => {
    // DER PREIS DER STRING-IDS (ADR 0030). Ohne diese Prüfung behielte die
    // Nachschlagetabelle still den LETZTEN Eintrag: jede Wand hänge an der
    // falschen Lage, und alles Weitere urteilte über eine Figur, die niemand
    // gezeichnet hat. Bei Index-Verweisen kann der Fall nicht auftreten — die
    // Ids sind trotzdem die bessere Wahl, sie kosten eben diesen Test.
    const { errors } = check(
      midline(
        [
          { id: 'n1', y: 0, z: 0 },
          { id: 'n1', y: 99, z: 99 },
          { id: 'n2', y: 0, z: 100 },
        ],
        [
          { id: 'w1', startNodeId: 'n1', endNodeId: 'n2', t: 6 },
          { id: 'w1', startNodeId: 'n2', endNodeId: 'n1', t: 6 },
        ],
      ),
    );
    const duplicates = errors.filter(
      (error) => error instanceof DuplicateSectionIdError,
    );
    expect(duplicates).toHaveLength(2);
    // EIN Befund je Id, nicht einer je Duplikat — die Anzahl steht im Feld.
    expect(duplicates.map((error) => error.element).sort()).toEqual([
      'node',
      'wall',
    ]);
    expect(duplicates.every((error) => error.count === 2)).toBe(true);
  });

  it('meldet eine Wandstärke von 0', () => {
    const { errors } = check(
      midline(
        [
          { id: 'n1', y: 0, z: 0 },
          { id: 'n2', y: 0, z: 100 },
        ],
        [{ id: 'w1', startNodeId: 'n1', endNodeId: 'n2', t: 0 }],
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(NonPositiveWallThicknessError);
    expect((errors[0] as NonPositiveWallThicknessError).wallId).toBe('w1');
  });

  it('meldet eine Wand der Länge 0', () => {
    const { errors } = check(
      midline(
        [
          { id: 'n1', y: 40, z: 40 },
          { id: 'n2', y: 40, z: 40 },
        ],
        [{ id: 'w1', startNodeId: 'n1', endNodeId: 'n2', t: 6 }],
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ZeroLengthWallError);
  });

  it('meldet die Länge 0 NICHT, wenn schon der Verweis hängt', () => {
    // Sonst wäre „Länge 0" ein Folgefehler von „unbekannter Knoten" und
    // stünde als zweiter Befund neben ihm, ohne etwas Eigenes zu sagen.
    const { errors } = check(
      midline([{ id: 'n1', y: 0, z: 0 }], [
        { id: 'w1', startNodeId: 'n1', endNodeId: 'n9', t: 6 },
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(UnknownSectionNodeError);
  });

  it('meldet einen Umriss ohne Fläche in beiden Varianten', () => {
    const empty = check({
      kind: 'outline',
      rings: [],
      outline: [{ points: [{ y: 0, z: 0 }, { y: 10, z: 0 }] }],
    });
    expect(empty.errors).toHaveLength(1);
    expect(empty.errors[0]).toBeInstanceOf(EmptyOutlineError);
  });

  it('lässt einen stimmigen Wandgraphen ohne Befund durch', () => {
    const { errors, warnings } = check(
      midline(
        [
          { id: 'n1', y: -50, z: 0 },
          { id: 'n2', y: 50, z: 0 },
          { id: 'n3', y: 0, z: 0 },
          { id: 'n4', y: 0, z: 200 },
        ],
        [
          { id: 'gurt-links', startNodeId: 'n1', endNodeId: 'n3', t: 10 },
          { id: 'gurt-rechts', startNodeId: 'n3', endNodeId: 'n2', t: 10 },
          { id: 'steg', startNodeId: 'n3', endNodeId: 'n4', t: 6 },
        ],
      ),
    );
    expect(errors).toEqual([]);
    // Der Steg-Gurt-Knoten hat GRAD 3: dort gibt es keine Fortsetzung, deren
    // Tangente gebrochen sein könnte.
    expect(warnings).toEqual([]);
  });
});

/**
 * Satz 3 — die Knickwarnung, und was sie wirklich prüft.
 *
 * Eine Hohlkasten-Ecke: waagerechte Wand, 90-Grad-Bogen, senkrechte Wand. Bei
 * exakt tangentialem Anschluss liegt die Sehne des Bogens unter 45 Grad, und
 * `bulge = tan(Δ/4) = tan(pi/8)`.
 *
 * Der Radius ist mit 2 mm klein gewählt, damit die im Plan genannte
 * Verschiebung von 0,2 mm einen MESSBAREN Knick erzeugt: der Winkelfehler
 * wächst mit dem Verhältnis Verschiebung zu Sehnenlänge.
 */
const CORNER_BULGE = Math.tan(Math.PI / 8);

function corner(z3: number, t: number): SectionGeometry {
  return midline(
    [
      { id: 'n1', y: 0, z: 0 },
      { id: 'n2', y: 100, z: 0 },
      { id: 'n3', y: 102, z: z3 },
      { id: 'n4', y: 102, z: 102 },
    ],
    [
      { id: 'oben', startNodeId: 'n1', endNodeId: 'n2', t },
      { id: 'ecke', startNodeId: 'n2', endNodeId: 'n3', t, bulge: CORNER_BULGE },
      { id: 'rechts', startNodeId: 'n3', endNodeId: 'n4', t },
    ],
  );
}

describe('Satz 3: der Knick am Bogen, an der Toleranz aufgehängt', () => {
  it('schweigt bei exakt tangentialem Anschluss', () => {
    const { warnings } = check(corner(2, 6));
    expect(warnings).toEqual([]);
  });

  it('feuert, wenn ein Knoten um 0,2 mm verrutscht und t = 6 ist', () => {
    const { warnings } = check(corner(2.2, 6));
    expect(warnings).toHaveLength(2); // beide Bogenenden
    const [first] = warnings;
    expect(first).toBeInstanceOf(TangentKinkWarning);
    const kink = first as TangentKinkWarning;
    expect(kink.notch).toBeGreaterThan(ARC_TOLERANCE);
    expect(kink.arcTolerance).toBe(ARC_TOLERANCE);
    // ~2,7 Grad — über der Schranke, die 6 mm Wandstärke bei 0,05 mm
    // Toleranz zulassen (rund 1,9 Grad).
    expect(kink.theta).toBeCloseTo(0.0476, 4);
  });

  it('schweigt bei DERSELBEN Verschiebung, wenn t = 1 ist', () => {
    // DAS IST DER EIGENTLICHE TEST: nicht der Schwellwert, sondern seine
    // KOPPLUNG an die Wandstärke. Eine dünne Wand verträgt mehr Knick, weil
    // ihre Kerbe flacher wird — `notch = (t/2)·tan(theta/2)`. Eine gesetzte
    // Winkelschranke könnte das nicht unterscheiden.
    const { warnings } = check(corner(2.2, 1));
    expect(warnings).toEqual([]);
  });

  it('urteilt unter der Voreinstellung genauso — die 0,05 mm sind dieselbe Zahl', () => {
    // Die Policy hat den Wert nicht neu gesetzt, sondern liest ihn aus
    // `@baustatik/section-geometry` (ADR 0033). Bewegt sich die Zahl dort,
    // fällt es hier auf und nicht erst im Umriss.
    expect(DEFAULT_SECTION_POLICY.arcTolerance).toBe(ARC_TOLERANCE);
    expect(
      validateSectionGeometry(corner(2.2, 6), DEFAULT_SECTION_POLICY).warnings,
    ).toHaveLength(2);
  });

  it('urteilt nicht über einen Bogen, dessen Knoten fehlt', () => {
    // Das Gate SAMMELT, es wirft nicht: der hängende Verweis steht als
    // Fehler da, und die Knickprüfung übergeht die Wand still, statt am
    // fehlenden Knoten abzustürzen. Sonst bekäme man je Durchlauf genau
    // einen Befund und müsste ihn einzeln abarbeiten.
    const { errors, warnings } = check(
      midline(
        [
          { id: 'n1', y: 0, z: 0 },
          { id: 'n2', y: 100, z: 0 },
        ],
        [
          { id: 'oben', startNodeId: 'n1', endNodeId: 'n2', t: 6 },
          { id: 'ecke', startNodeId: 'n2', endNodeId: 'n9', t: 6, bulge: CORNER_BULGE },
        ],
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(UnknownSectionNodeError);
    expect(warnings).toEqual([]);
  });

  it('urteilt nicht über einen Bogen der Länge 0', () => {
    // Eine Wand ohne Länge hat keine Richtung und damit keine Endtangente.
    const { errors, warnings } = check(
      midline(
        [
          { id: 'n1', y: 0, z: 0 },
          { id: 'n2', y: 100, z: 0 },
        ],
        [
          { id: 'oben', startNodeId: 'n1', endNodeId: 'n2', t: 6 },
          { id: 'ecke', startNodeId: 'n2', endNodeId: 'n2', t: 6, bulge: CORNER_BULGE },
        ],
      ),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ZeroLengthWallError);
    expect(warnings).toEqual([]);
  });

  it('schweigt an einer Ecke aus zwei GERADEN Wänden', () => {
    // Eine Ecke ist eine Ecke und keine gebrochene Tangentialität — sonst
    // feuerte jedes geschweißte Profil an jedem Uebergang.
    const { warnings } = check(
      midline(
        [
          { id: 'n1', y: 0, z: 0 },
          { id: 'n2', y: 100, z: 0 },
          { id: 'n3', y: 100, z: 100 },
        ],
        [
          { id: 'w1', startNodeId: 'n1', endNodeId: 'n2', t: 20 },
          { id: 'w2', startNodeId: 'n2', endNodeId: 'n3', t: 20 },
        ],
      ),
    );
    expect(warnings).toEqual([]);
  });
});

function properties(name: string): SectionProperties {
  const row = lookupProfile(name);
  if (row === undefined) throw new Error(`${name} fehlt im Katalog`);
  const value = sectionProperties({
    kind: 'profile',
    id: 'cs',
    profile: row.id,
    data: profileData(row),
  });
  if (value === undefined) throw new Error('kein Profilsatz');
  return value;
}

describe('Die Warnseite der Zahlen: Sätze 1, 2 und 4', () => {
  it('schweigt beim IPE 300 auf allen drei Sätzen', () => {
    const { errors, warnings } = validateSectionProperties(properties('IPE 300'), POLICY);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('schweigt beim Plattenbalken auf Satz 2 und 4', () => {
    // DER GEGENBELEG ZU B6: der Plattenbalken ist einfach symmetrisch, hat
    // `yM = ys = 0` und tordiert unter Vz nicht. Keyte Satz 2 auf das PAAR
    // `(yM, zM)`, feuerte er hier — bei jedem Plattenbalken, ohne dass etwas
    // tordiert. `zM` ist beim T `undefined`, und Satz 4 keyt trotzdem allein
    // auf `yM`.
    const plate = sectionProperties({
      kind: 'shape',
      id: 'cs',
      shape: {
        kind: 't-section',
        bf: 2000,
        hf: 200,
        bw: 250,
        h: 500,
        idealisation: 'solid',
      },
    });
    expect(plate?.zM).toBeUndefined();
    expect(validateSectionProperties(plate as SectionProperties, POLICY).warnings).toEqual(
      [],
    );
  });

  it('meldet Satz 4, wenn der Schubmittelpunkt nicht ermittelt ist', () => {
    // SELBSTLOESCHEND: der Satz feuert zwischen P0 und P5 für
    // Wandquerschnitte und verstummt mit P5. „Ungeprüft" ist etwas anderes
    // als „geprüft und in Ordnung", und ein Ersatzindikator ist nicht
    // möglich — `Iyz = 0` schließt Torsion nicht aus.
    const unknown: SectionProperties = {
      ...properties('IPE 300'),
      yM: undefined,
      zM: undefined,
    };
    const { warnings } = validateSectionProperties(unknown, POLICY);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBeInstanceOf(ShearCentreUnknownWarning);
  });

  it('meldet Satz 2, wenn der Schubmittelpunkt neben dem Schwerpunkt liegt', () => {
    const offset: SectionProperties = {
      ...properties('IPE 300'),
      ys: 0,
      yM: 0.021,
    };
    const { warnings } = validateSectionProperties(offset, POLICY);
    expect(warnings).toHaveLength(1);
    const [warning] = warnings;
    expect(warning).toBeInstanceOf(ShearCentreOffsetWarning);
    // Der Hebelarm `e = yM − ys` steht als Feld: `T = Vz·e` rechnet die
    // Aufrufseite damit, ohne die Meldung zu lesen.
    expect((warning as ShearCentreOffsetWarning).e).toBeCloseTo(0.021, 12);
  });

  it('meldet Satz 1, wenn Iyz nicht verschwindet', () => {
    const skew: SectionProperties = { ...properties('IPE 300'), Iyz: 1e-6 };
    const { warnings } = validateSectionProperties(skew, POLICY);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBeInstanceOf(NotPrincipalAxesWarning);
  });

  /**
   * Satz 1 vergleicht RELATIV — der eigentliche Grund für
   * `principalAxisTolerance` (P2).
   */
  describe('Satz 1: die Schranke, nicht der exakte Vergleich', () => {
    const ipe = properties('IPE 300');

    it('schweigt bei Gleitkommarauschen aus einem gezeichneten Rechteck', () => {
      // Ein achsparallel gezeichnetes Rechteck liefert `Iyz` nie exakt 0. Ohne
      // die Schranke feuerte Satz 1 bei JEDEM symmetrisch gezeichneten
      // Querschnitt.
      const noise: SectionProperties = {
        ...ipe,
        Iyz: 1e-12 * Math.max(ipe.Iy, ipe.Iz),
      };
      expect(validateSectionProperties(noise, POLICY).warnings).toEqual([]);
    });

    it('feuert beim echt unsymmetrischen Querschnitt', () => {
      const skew: SectionProperties = { ...ipe, Iyz: 0.01 * ipe.Iy };
      const { warnings } = validateSectionProperties(skew, POLICY);
      expect(warnings).toHaveLength(1);
      const warning = warnings[0] as NotPrincipalAxesWarning;
      // Die Schranke steht als FELD, damit eine Oberfläche sie nennen kann,
      // ohne sie aus der Meldung zu parsen.
      expect(warning.limit).toBeCloseTo(
        DEFAULT_SECTION_POLICY.principalAxisTolerance * ipe.Iy,
        20,
      );
    });

    it('bezieht sich auf max(|Iy|, |Iz|), nicht auf Iy allein', () => {
      // Sonst schwiege die Frage ausgerechnet dort, wo `Iy` klein und `Iz`
      // groß ist.
      const flat: SectionProperties = { ...ipe, Iy: 1e-9, Iz: 1, Iyz: 1e-11 };
      expect(validateSectionProperties(flat, POLICY).warnings).toEqual([]);
    });

    it('mit Toleranz 0 ist es wieder der exakte Vergleich', () => {
      // Die richtige Schärfe für wen, der nur Formen und Katalogzeilen
      // führt — deshalb ist die 0 ein zulässiger Wert.
      const exact = createSectionPolicy({ principalAxisTolerance: 0 });
      const noise: SectionProperties = { ...ipe, Iyz: Number.MIN_VALUE };
      expect(validateSectionProperties(noise, exact).warnings).toHaveLength(1);
      expect(validateSectionProperties(ipe, exact).warnings).toEqual([]);
    });
  });

  /**
   * Satz 2 vergleicht seit P5 ebenfalls RELATIV — dieselbe Bewegung, und aus
   * demselben Grund: `yM` fällt beim gezeichneten Querschnitt aus zwei
   * numerischen Integrationen über zwei verschiedene Figuren (ADR 0041).
   */
  describe('Satz 2: die Schranke am Trägheitsradius', () => {
    const ipe = properties('IPE 300');
    const radius = Math.sqrt(Math.max(ipe.Iy, ipe.Iz) / ipe.A);

    it('schweigt bei Gleitkommarauschen aus dem Wandweg', () => {
      const noise: SectionProperties = {
        ...ipe,
        ys: 0,
        yM: 1e-9 * radius,
      };
      expect(validateSectionProperties(noise, POLICY).warnings).toEqual([]);
    });

    it('feuert beim echten Versatz und nennt die Schranke als Feld', () => {
      const offset: SectionProperties = { ...ipe, ys: 0, yM: 1e-3 * radius };
      const { warnings } = validateSectionProperties(offset, POLICY);
      expect(warnings).toHaveLength(1);
      expect(
        (warnings[0] as ShearCentreOffsetWarning).limit,
      ).toBeCloseTo(DEFAULT_SECTION_POLICY.shearCentreTolerance * radius, 20);
    });

    it('mit Toleranz 0 ist es wieder der exakte Vergleich', () => {
      const exact = createSectionPolicy({ shearCentreTolerance: 0 });
      const noise: SectionProperties = { ...ipe, ys: 0, yM: Number.MIN_VALUE };
      expect(validateSectionProperties(noise, exact).warnings).toHaveLength(1);
    });

    it('`zM` bekommt keinen eigenen Satz — im ebenen Rahmen gibt es nur Vz', () => {
      // Ein z-Versatz erzeugt in der ebenen Rechnung keine Torsion; ein Satz
      // darüber feuerte bei jedem Plattenbalken und meinte dabei ein
      // räumliches Modell, das es nicht gibt.
      const offset: SectionProperties = { ...ipe, zs: 0, zM: 10 * radius };
      expect(validateSectionProperties(offset, POLICY).warnings).toEqual([]);
    });
  });
});

/**
 * Die Befunde am UMLAUFSINN des mitgeführten Umrisses (P2, ADR 0034).
 *
 * Material läuft mit `signedArea > 0`, ein Loch mit `< 0`.
 */
describe('Der Umriss: Material gegen Loch', () => {
  const SQUARE = [
    { y: 0, z: 0 },
    { y: 100, z: 0 },
    { y: 100, z: 100 },
    { y: 0, z: 100 },
  ];

  // DIE RINGE STEHEN NEBEN DEM UMRISS, seit das Gate ihn NEU ABLEITET und
  // vergleicht (ADR 0037). Ohne `bulge` ist die Ableitung eine Durchreichung,
  // also ist der Satz per Konstruktion driftfrei — und genau das soll er sein:
  // geprüft wird hier der Umlaufsinn und nicht die Drift.
  function outline(...polygons: { y: number; z: number }[][]) {
    return check({
      kind: 'outline',
      rings: polygons.map((points) => ({ vertices: [...points] })),
      outline: polygons.map((points) => ({ points })),
    });
  }

  it('lässt einen positiv gewickelten Umriss ohne Befund durch', () => {
    const { errors, warnings } = outline(SQUARE);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('meldet den verkehrt herum gewickelten Umriss als FEHLER', () => {
    // Ohne ihn gibt Green ein negatives `A` zurück und
    // `fem-section-resolve` daraus eine negative Steifigkeit — der einzige
    // Fehler dieser Ecke, der den Löser STILL kaputtmacht.
    const { errors } = outline([...SQUARE].reverse());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(NegativeOutlineAreaError);
    expect((errors[0] as NegativeOutlineAreaError).signedArea).toBeLessThan(0);
  });

  it('meldet denselben Fehler, wenn das Loch größer ist als das Material', () => {
    const small = SQUARE.map((p) => ({ y: p.y / 2, z: p.z / 2 }));
    const { errors } = outline(small, [...SQUARE].reverse());
    expect(errors.some((e) => e instanceof NegativeOutlineAreaError)).toBe(true);
  });

  it('meldet den entarteten Ring — er trägt zur Rechnung exakt nichts bei', () => {
    const collapsed = [
      { y: 0, z: 0 },
      { y: 10, z: 0 },
      { y: 20, z: 0 },
    ];
    const { errors } = outline(SQUARE, collapsed);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(DegenerateOutlineRingError);
    expect((errors[0] as DegenerateOutlineRingError).index).toBe(1);
  });

  it('nimmt ein sauber verschachteltes Loch ohne Befund', () => {
    const hole = [
      { y: 25, z: 25 },
      { y: 25, z: 75 },
      { y: 75, z: 75 },
      { y: 75, z: 25 },
    ];
    const { errors, warnings } = outline(SQUARE, hole);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('WARNT beim freistehenden Loch, statt zu verweigern', () => {
    // Rechenbar (es zieht dann eben Fläche ab, die es nicht gibt) und bei
    // zwei getrennten Vollflächen legitim aussehend — genau die Lage, für
    // die ADR 0032 warnt.
    const far = [
      { y: 500, z: 500 },
      { y: 500, z: 510 },
      { y: 510, z: 510 },
      { y: 510, z: 500 },
    ];
    const { errors, warnings } = outline(SQUARE, far);
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBeInstanceOf(UnnestedHoleWarning);
    expect((warnings[0] as UnnestedHoleWarning).index).toBe(1);
  });

  it('nimmt doppelte aufeinanderfolgende Punkte hin — sie tragen null bei', () => {
    // AUSDRÜCKLICH KEIN BEFUND: ein doppelter Punkt trägt zur
    // Shoelace-Summe exakt null bei.
    const doubled = [SQUARE[0]!, SQUARE[0]!, ...SQUARE.slice(1)];
    const { errors, warnings } = outline(doubled);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('schweigt zum Umlaufsinn, solange gar kein Umriss da ist', () => {
    // Sonst wäre jeder Windungsbefund ein Folgefehler von G1.
    const { errors } = outline([
      { y: 0, z: 0 },
      { y: 10, z: 0 },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(EmptyOutlineError);
  });
});

/**
 * Die drei Befunde, die P3 dazustellt (ADR 0037).
 *
 * Sie hängen alle daran, dass das Gate den Umriss ab jetzt NEU ABLEITET statt
 * ihn nur gegen sich selbst zu prüfen — das Versprechen aus ADR 0030, das seit
 * P0 uneingelöst war.
 */
describe('Die Drift: der mitgeführte Umriss gegen seine Neuableitung', () => {
  const NODES = [
    { id: 'n1', y: 0, z: 0 },
    { id: 'n2', y: 100, z: 0 },
  ];
  const WALLS: Wall[] = [
    { id: 'w1', startNodeId: 'n1', endNodeId: 'n2', t: 10 },
  ];

  it('schweigt beim frisch abgeleiteten Satz — der Test, der die Schranke rechtfertigt', () => {
    const { errors, warnings } = check(
      createSectionGeometry(
        { kind: 'midline', nodes: NODES, walls: WALLS, idealisation: 'thin-walled' },
        POLICY,
      ),
    );
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('WARNT beim verstellten Umriss neben unverändertem Graphen', () => {
    const { errors, warnings } = check({
      kind: 'midline',
      nodes: NODES,
      walls: WALLS,
      idealisation: 'thin-walled',
      // Doppelt so hoch wie die Aufweitung ergibt: 100 x 20 statt 100 x 10.
      outline: [
        {
          points: [
            { y: 0, z: -10 },
            { y: 100, z: -10 },
            { y: 100, z: 10 },
            { y: 0, z: 10 },
          ],
        },
      ],
    });

    // WARNUNG UND KEIN FEHLER: der Satz ist rechenbar, er ist nur nicht mehr
    // der, der gespeichert wurde.
    expect(errors).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBeInstanceOf(OutlineDriftWarning);
    const drift = warnings[0] as OutlineDriftWarning;
    expect(drift.carried).toBeCloseTo(2000, 6);
    expect(drift.derived).toBeCloseTo(1000, 6);
  });

  it('schweigt bei einem Umriss aus ANDERER arcTolerance, solange er unter der Schranke bleibt', () => {
    // Die Toleranz reist seit ADR 0033 im Satz mit und ist damit erklärbar:
    // eine feinere Zerlegung ändert die Punktzahl, nicht die Fläche.
    const grob = createSectionPolicy({ arcTolerance: 0.4 });
    const bogen: Wall[] = [
      { id: 'w1', startNodeId: 'n1', endNodeId: 'n2', t: 10, bulge: 0.5 },
    ];
    const geometry = createSectionGeometry(
      { kind: 'midline', nodes: NODES, walls: bogen, idealisation: 'thin-walled' },
      grob,
    );

    // Geprüft unter der FEINEN Toleranz — der Umriss stammt aus der groben.
    const { errors, warnings } = check(geometry);
    expect(errors).toEqual([]);
    expect(warnings.filter((w) => w instanceof OutlineDriftWarning)).toEqual([]);
  });

  it('prüft AUCH den outline-Zweig — der Zweig, der sie seit P2 nicht hatte', () => {
    const { warnings } = check({
      kind: 'outline',
      rings: [
        {
          vertices: [
            { y: 0, z: 0 },
            { y: 100, z: 0 },
            { y: 100, z: 100 },
            { y: 0, z: 100 },
          ],
        },
      ],
      // Der Umriss zum halb so großen Ring — die Ringe sagen etwas anderes.
      outline: [
        {
          points: [
            { y: 0, z: 0 },
            { y: 50, z: 0 },
            { y: 50, z: 50 },
            { y: 0, z: 50 },
          ],
        },
      ],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBeInstanceOf(OutlineDriftWarning);
  });
});

describe('Der gekappte Miter-Spitz und die nicht endliche Wölbung', () => {
  it('WARNT beim Zug mit 30 Grad Innenwinkel', () => {
    // Zwei Wände unter 30 Grad über einen Grad-2-Knoten: der ungekappte
    // Spitz stünde um 1/sin(15 Grad) = 3,86 heraus, gekappt wird ab 2.
    const alpha = Math.PI / 6;
    const nodes = [
      { id: 'ecke', y: 0, z: 0 },
      { id: 'a', y: 100, z: 0 },
      { id: 'b', y: 100 * Math.cos(alpha), z: 100 * Math.sin(alpha) },
    ];
    const walls: Wall[] = [
      { id: 'w1', startNodeId: 'ecke', endNodeId: 'a', t: 8 },
      { id: 'w2', startNodeId: 'ecke', endNodeId: 'b', t: 8 },
    ];

    const { errors, warnings } = check(
      createSectionGeometry(
        { kind: 'midline', nodes, walls, idealisation: 'thin-walled' },
        POLICY,
      ),
    );

    expect(errors).toEqual([]);
    const capped = warnings.filter(
      (w) => w instanceof MiterLimitExceededWarning,
    );
    expect(capped).toHaveLength(1);
    expect((capped[0] as MiterLimitExceededWarning).alpha).toBeCloseTo(alpha, 9);
    expect((capped[0] as MiterLimitExceededWarning).overshoot).toBeCloseTo(
      1 / Math.sin(alpha / 2),
      9,
    );
  });

  it('schweigt am rechtwinkligen Stoß — 1/sin(45 Grad) = 1,41 liegt unter 2', () => {
    const { warnings } = check(
      createSectionGeometry(
        {
          kind: 'midline',
          nodes: [
            { id: 'ecke', y: 0, z: 0 },
            { id: 'a', y: 100, z: 0 },
            { id: 'b', y: 0, z: 100 },
          ],
          walls: [
            { id: 'w1', startNodeId: 'ecke', endNodeId: 'a', t: 8 },
            { id: 'w2', startNodeId: 'ecke', endNodeId: 'b', t: 8 },
          ],
          idealisation: 'thin-walled',
        },
        POLICY,
      ),
    );
    expect(warnings).toEqual([]);
  });

  it('meldet `bulge = NaN` statt es still durchlaufen zu lassen', () => {
    // Bis P2 lief der Wert durch: die Knickprüfung rechnet `notch = NaN`, und
    // `NaN > arcTolerance` ist `false`. Für `t` prüft G4 längst
    // `Number.isFinite`.
    const { errors } = check(
      midline(
        [
          { id: 'n1', y: 0, z: 0 },
          { id: 'n2', y: 100, z: 0 },
        ],
        [
          {
            id: 'w1',
            startNodeId: 'n1',
            endNodeId: 'n2',
            t: 10,
            bulge: Number.NaN,
          },
        ],
      ),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(NonFiniteBulgeError);
    expect((errors[0] as NonFiniteBulgeError).at).toEqual({
      kind: 'wall',
      wallId: 'w1',
    });
  });

  it('meldet die ENDLICHE Wölbung, die keinen zerlegbaren Bogen mehr ergibt', () => {
    // `Number.isFinite` ist nur die halbe Frage: `1e14` beschreibt einen fast
    // vollen Kreis von `2,5·10^15 mm` Radius durch zwei Punkte, die `100 mm`
    // auseinanderliegen. Die Ableitung liest die Kante als Gerade — und weil
    // sie das still täte, sagt es das Gate.
    const { errors } = check(
      midline(
        [
          { id: 'n1', y: 0, z: 0 },
          { id: 'n2', y: 100, z: 0 },
        ],
        [{ id: 'w1', startNodeId: 'n1', endNodeId: 'n2', t: 10, bulge: 1e14 }],
      ),
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(UndiscretisableBulgeError);
    expect((errors[0] as UndiscretisableBulgeError).at).toEqual({
      kind: 'wall',
      wallId: 'w1',
    });
    expect((errors[0] as UndiscretisableBulgeError).arcTolerance).toBe(
      POLICY.arcTolerance,
    );
  });

  it('schweigt zu jeder Wölbung, die ein Querschnitt wirklich zeichnet', () => {
    for (const bulge of [0, 0.1, 1, -1, 5, 1000]) {
      const { errors } = check(
        midline(
          [
            { id: 'n1', y: 0, z: 0 },
            { id: 'n2', y: 100, z: 0 },
          ],
          [{ id: 'w1', startNodeId: 'n1', endNodeId: 'n2', t: 10, bulge }],
        ),
      );

      expect(errors).toEqual([]);
    }
  });

  it('meldet dieselben zwei Sorten am RING-PUNKT — der `outline`-Zweig', () => {
    // BIS HIERHER SCHWIEG DAS GATE NICHT NUR, ES STARB: die Drift-Prüfung
    // leitet den Umriss neu ab, und `deriveOutlineFromRings` reichte den Wert
    // ungefiltert an `Bulge.toPolyline` weiter. Aus dem Sammelbefund wurde ein
    // Wurf — ausgerechnet an der Tür, die sagen soll, was falsch ist.
    const ringMit = (bulge: number): SectionGeometry => ({
      kind: 'outline',
      rings: [
        {
          vertices: [
            { y: 0, z: 0, bulge },
            { y: 100, z: 0 },
            { y: 100, z: 50 },
          ],
        },
      ],
      outline: SOME_OUTLINE,
    });

    const nichtEndlich = check(ringMit(Number.NaN));
    expect(nichtEndlich.errors).toHaveLength(1);
    expect(nichtEndlich.errors[0]).toBeInstanceOf(NonFiniteBulgeError);
    // Der Ringpunkt hat keine Id, sondern zwei Zahlen.
    expect((nichtEndlich.errors[0] as NonFiniteBulgeError).at).toEqual({
      kind: 'vertex',
      ringIndex: 0,
      vertexIndex: 0,
    });

    const zuGross = check(ringMit(1e14));
    expect(zuGross.errors).toHaveLength(1);
    expect(zuGross.errors[0]).toBeInstanceOf(UndiscretisableBulgeError);
    expect((zuGross.errors[0] as UndiscretisableBulgeError).at).toEqual({
      kind: 'vertex',
      ringIndex: 0,
      vertexIndex: 0,
    });

    // Und die Wölbung, die ein Querschnitt wirklich zeichnet, bleibt still.
    expect(check(ringMit(1)).errors).toEqual([]);
  });

  it('misst die Sehne des Ringpunktes zum NÄCHSTEN Punkt', () => {
    // `bulge` gehört der ABGEHENDEN Kante (ADR 0030), und die Zerlegbarkeit
    // hängt an deren Länge: dieselbe Zahl ist auf der kurzen Kante noch
    // zerlegbar und auf der langen nicht mehr. Der letzte Punkt wölbt dabei
    // die Schlusskante zurück zum ersten — deshalb steht der Befund hier an
    // Punkt 2 und nicht an Punkt 0.
    const { errors } = check({
      kind: 'outline',
      rings: [
        {
          vertices: [
            { y: 0, z: 0 },
            { y: 100, z: 0 },
            { y: 100, z: 50, bulge: 1e14 },
          ],
        },
      ],
      outline: SOME_OUTLINE,
    });

    expect(errors).toHaveLength(1);
    expect((errors[0] as UndiscretisableBulgeError).at).toEqual({
      kind: 'vertex',
      ringIndex: 0,
      vertexIndex: 2,
    });
  });
});
