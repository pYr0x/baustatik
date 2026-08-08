import { lookupProfile, profileData } from '@baustatik/steel-profiles';
import { describe, expect, it } from 'vitest';
import {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  DuplicateSectionIdError,
  EmptyOutlineError,
  NonPositiveWallThicknessError,
  NotPrincipalAxesWarning,
  type SectionGeometry,
  type SectionProperties,
  sectionProperties,
  ShearCentreOffsetWarning,
  ShearCentreUnknownWarning,
  TangentKinkWarning,
  UnknownSectionNodeError,
  validateSectionGeometry,
  validateSectionProperties,
  type Wall,
  ZeroLengthWallError,
} from '../src/index';

/**
 * Das Prüfgatter des Querschnitts
 * ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)).
 *
 * Die Toleranz reist in der POLICY herein und steht nicht im Gatter — deshalb
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

function midline(
  nodes: readonly { id: string; y: number; z: number }[],
  edges: readonly Wall[],
): SectionGeometry {
  return {
    kind: 'midline',
    nodes: [...nodes],
    walls: [...edges],
    idealisation: 'thin-walled',
    outline: SOME_OUTLINE,
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
    // DIE ID STEHT ALS FELD, nicht nur im Text: die Oberflaeche markiert die
    // Wand daran, und aus einer Meldung liesse sie sich nur herausparsen.
    expect((error as UnknownSectionNodeError).wallId).toBe('w1');
    expect((error as UnknownSectionNodeError).nodeId).toBe('n0');
    expect((error as UnknownSectionNodeError).end).toBe('start');
  });

  it('meldet doppelte Knoten- und Wand-Ids', () => {
    // DER PREIS DER STRING-IDS (ADR 0030). Ohne diese Pruefung behielte die
    // Nachschlagetabelle still den LETZTEN Eintrag: jede Wand haenge an der
    // falschen Lage, und alles Weitere urteilte ueber eine Figur, die niemand
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

  it('meldet eine Wandstaerke von 0', () => {
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

  it('meldet eine Wand der Laenge 0', () => {
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

  it('meldet die Laenge 0 NICHT, wenn schon der Verweis haengt', () => {
    // Sonst waere „Laenge 0" ein Folgefehler von „unbekannter Knoten" und
    // stuende als zweiter Befund neben ihm, ohne etwas Eigenes zu sagen.
    const { errors } = check(
      midline([{ id: 'n1', y: 0, z: 0 }], [
        { id: 'w1', startNodeId: 'n1', endNodeId: 'n9', t: 6 },
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(UnknownSectionNodeError);
  });

  it('meldet einen Umriss ohne Flaeche in beiden Varianten', () => {
    const empty = check({
      kind: 'outline',
      rings: [],
      outline: [{ points: [{ y: 0, z: 0 }, { y: 10, z: 0 }] }],
    });
    expect(empty.errors).toHaveLength(1);
    expect(empty.errors[0]).toBeInstanceOf(EmptyOutlineError);
  });

  it('laesst einen stimmigen Wandgraphen ohne Befund durch', () => {
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
    // Tangente gebrochen sein koennte.
    expect(warnings).toEqual([]);
  });
});

/**
 * Satz 3 — die Knickwarnung, und was sie wirklich prueft.
 *
 * Eine Hohlkasten-Ecke: waagerechte Wand, 90-Grad-Bogen, senkrechte Wand. Bei
 * exakt tangentialem Anschluss liegt die Sehne des Bogens unter 45 Grad, und
 * `bulge = tan(Δ/4) = tan(pi/8)`.
 *
 * Der Radius ist mit 2 mm klein gewaehlt, damit die im Plan genannte
 * Verschiebung von 0,2 mm einen MESSBAREN Knick erzeugt: der Winkelfehler
 * waechst mit dem Verhaeltnis Verschiebung zu Sehnenlaenge.
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

describe('Satz 3: der Knick am Bogen, an der Toleranz aufgehaengt', () => {
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
    // ~2,7 Grad — ueber der Schranke, die 6 mm Wandstaerke bei 0,05 mm
    // Toleranz zulassen (rund 1,9 Grad).
    expect(kink.theta).toBeCloseTo(0.0476, 4);
  });

  it('schweigt bei DERSELBEN Verschiebung, wenn t = 1 ist', () => {
    // DAS IST DER EIGENTLICHE TEST: nicht der Schwellwert, sondern seine
    // KOPPLUNG an die Wandstaerke. Eine duenne Wand vertraegt mehr Knick, weil
    // ihre Kerbe flacher wird — `notch = (t/2)·tan(theta/2)`. Eine gesetzte
    // Winkelschranke koennte das nicht unterscheiden.
    const { warnings } = check(corner(2.2, 1));
    expect(warnings).toEqual([]);
  });

  it('urteilt unter der Voreinstellung genauso — die 0,05 mm sind dieselbe Zahl', () => {
    // Die Policy hat den Wert nicht neu gesetzt, sondern liest ihn aus
    // `@baustatik/section-geometry` (ADR 0033). Bewegt sich die Zahl dort,
    // faellt es hier auf und nicht erst im Umriss.
    expect(DEFAULT_SECTION_POLICY.arcTolerance).toBe(ARC_TOLERANCE);
    expect(
      validateSectionGeometry(corner(2.2, 6), DEFAULT_SECTION_POLICY).warnings,
    ).toHaveLength(2);
  });

  it('urteilt nicht ueber einen Bogen, dessen Knoten fehlt', () => {
    // Das Gatter SAMMELT, es wirft nicht: der haengende Verweis steht als
    // Fehler da, und die Knickpruefung uebergeht die Wand still, statt am
    // fehlenden Knoten abzustuerzen. Sonst bekaeme man je Durchlauf genau
    // einen Befund und muesste ihn einzeln abarbeiten.
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

  it('urteilt nicht ueber einen Bogen der Laenge 0', () => {
    // Eine Wand ohne Laenge hat keine Richtung und damit keine Endtangente.
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

  it('schweigt an einer Ecke aus zwei GERADEN Waenden', () => {
    // Eine Ecke ist eine Ecke und keine gebrochene Tangentialitaet — sonst
    // feuerte jedes geschweisste Profil an jedem Uebergang.
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

describe('Die Warnseite der Zahlen: Saetze 1, 2 und 4', () => {
  it('schweigt beim IPE 300 auf allen drei Saetzen', () => {
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
    // SELBSTLOESCHEND: der Satz feuert zwischen P0 und P5 fuer
    // Wandquerschnitte und verstummt mit P5. „Ungeprueft" ist etwas anderes
    // als „geprueft und in Ordnung", und ein Ersatzindikator ist nicht
    // moeglich — `Iyz = 0` schliesst Torsion nicht aus.
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
});
