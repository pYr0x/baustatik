import {
  lookupProfile,
  type SteelProfileData,
} from '@baustatik/steel-profiles';
import type { SectionProperties } from './properties';
import { hollowRectangle } from './shapes/hollow-rectangle';
import { iSymmetric } from './shapes/i-symmetric';
import { toProperties } from './shapes/kernel';
import { rectangle } from './shapes/rectangle';
import { tBeam } from './shapes/t-beam';

/**
 * Wie der Querschnitt fuer den SCHUB idealisiert wird.
 *
 * EINE EIGENE ANGABE, KEINE EIGENSCHAFT DER FORM. Ein Plattenbalken ist als
 * Stahlbeton kompakt und als geschweisster Stahl-T duennwandig: dieselben vier
 * Zahlen, zwei verschiedene kappa. Bei IPE-80-Abmessungen kommen
 * `solid -> 0,401` und `thin-walled -> 0,340` heraus — 18 % Unterschied, dem
 * Ergebnis nicht anzusehen. Deshalb PFLICHTFELD OHNE DEFAULT: wer sich nicht
 * entscheidet, soll es beim Typecheck merken und nicht am Verformungsbild.
 */
export type Idealisation = 'solid' | 'thin-walled';

/**
 * Eine parametrische Form. ABMESSUNGEN IN METERN — das Modell ist SI, der
 * Katalog ist es nicht.
 *
 * Die Form liefert WERTE, KEINE GEOMETRIE. Sollen die Formen spaeter gezeichnet
 * werden, kommt je Form ein `geometry()` dazu; die Werte bleiben aus der
 * Formel, sonst gaebe es zwei Rechenwege fuer dieselbe Zahl.
 *
 * Reine Daten, JSON-serialisierbar — Voraussetzung dafuer, dass der Querschnitt
 * im Snapshot mitreisen kann.
 */
export type ShapeSpec =
  /** Vollrechteck. Immer kompakt, deshalb ohne `idealisation`. */
  | { kind: 'rectangle'; b: number; h: number }
  /** Geschlossener Kasten mit umlaufend gleicher Wandstaerke. */
  | {
      kind: 'hollow-rectangle';
      b: number;
      h: number;
      t: number;
      idealisation: Idealisation;
    }
  /** Doppeltsymmetrisches I, GESCHWEISST — ohne Ausrundung. */
  | {
      kind: 'i-symmetric';
      h: number;
      b: number;
      tw: number;
      tf: number;
      idealisation: Idealisation;
    }
  /** Plattenbalken: Gurt oben, Steg darunter, `h` ist die Gesamthoehe. */
  | {
      kind: 't-beam';
      bf: number;
      hf: number;
      bw: number;
      h: number;
      idealisation: Idealisation;
    };

/**
 * Der Querschnitt als MODELLSATZ — das, was neben `Node`, `Beam` und
 * `NodeSupport` im Modell liegt und mit ihm gespeichert wird.
 *
 * Er gehoert diesem Package und nicht `@baustatik/fem`: `fem` haengt bewusst
 * nur an `errors`, und `ShapeSpec` dort hineinzuziehen kehrte die Abhaengigkeit
 * um. `Beam.crossSectionId` bleibt ein String
 * ([ADR 0023](../../../docs/adr/0023-cross-sections-belong-to-the-model.md)).
 *
 * Teil 2 fuegt `{ kind: 'thin-walled'; segments: Segment[] }` hinzu — ADDITIV,
 * ohne dass eine der beiden bestehenden Varianten sich aendert.
 */
export type CrossSection =
  | { kind: 'shape'; id: string; shape: ShapeSpec }
  | { kind: 'profile'; id: string; profileId: string };

/**
 * Die Querschnittswerte eines Querschnitts — die EINE Tuer dieses Packages.
 *
 * `undefined` heisst „kenne ich nicht": ein unbekannter `profileId` oder
 * unsinnige Abmessungen. Kein Wurf, weil der Wert im FEM-Strang durch den Port
 * `getSectionStiffness` laeuft, und dort ist `undefined` bereits der Vertrag
 * fuer „Querschnitt unbekannt" — daraus wird ein Modellfehler IM BERICHT statt
 * einer Ausnahme mitten in `solve()`.
 */
export function sectionProperties(
  cs: CrossSection,
): SectionProperties | undefined {
  if (cs.kind === 'profile') {
    const profile = lookupProfile(cs.profileId);
    return profile === undefined ? undefined : profileProperties(profile);
  }

  const shape = shapeResult(cs.shape);
  return shape === undefined ? undefined : toProperties(shape);
}

function shapeResult(spec: ShapeSpec) {
  switch (spec.kind) {
    case 'rectangle':
      return rectangle(spec.b, spec.h);
    case 'hollow-rectangle':
      return hollowRectangle(spec.b, spec.h, spec.t, spec.idealisation);
    case 'i-symmetric':
      return iSymmetric(spec.h, spec.b, spec.tw, spec.tf, spec.idealisation);
    case 't-beam':
      return tBeam(spec.bf, spec.hf, spec.bw, spec.h, spec.idealisation);
  }
}

/** cm2 -> m2. */
const CM2 = 1e-4;
/** cm4 -> m4. */
const CM4 = 1e-8;

/**
 * Die Tabellenzeile in SI — die EINZIGE Stelle, an der aus cm2/cm4 Meter
 * werden.
 *
 * kappa faellt dimensionslos direkt aus den cm2-Werten: `Az/A` braucht keine
 * Umrechnung, und sie unterwegs zu machen hiesse, sich einen Faktor einfangen
 * zu koennen, den niemand sieht.
 *
 * `Iyz = 0` und `ys = zs = 0`: die gefuehrten Reihen sind doppeltsymmetrisch,
 * und das Eingabesystem der Tabelle IST das Schwerpunktsystem.
 */
export function profileProperties(
  profile: SteelProfileData,
): SectionProperties {
  return {
    A: profile.A * CM2,
    Iy: profile.Iy * CM4,
    Iz: profile.Iz * CM4,
    Iyz: 0,
    ys: 0,
    zs: 0,
    kappaY: profile.Ay === undefined ? undefined : profile.Ay / profile.A,
    kappaZ: profile.Az === undefined ? undefined : profile.Az / profile.A,
  };
}
