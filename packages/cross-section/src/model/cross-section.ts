import type { SteelProfileData } from '@baustatik/steel-profiles';
import type { SectionGeometry } from './section-geometry';
import type { ShapeSpec } from './shape-spec';

/**
 * Der Querschnitt als Modellsatz.
 *
 * Drei Quellen, eine Frage: parametrische Form, kopierte Katalogzeile oder die
 * freie Geometrie des Editors. Der Record ist reine, serialisierbare Modelldaten
 * ([ADR 0023](../../../../docs/adr/0023-cross-sections-belong-to-the-model.md)).
 */
export type CrossSection =
  | { kind: 'shape'; id: string; shape: ShapeSpec }
  | {
      kind: 'section-geometry';
      id: string;
      geometry: SectionGeometry;
    }
  | {
      kind: 'profile';
      id: string;
      /** Die Herkunft, z. B. `'IPE 300'`; gerechnet wird mit `data`. */
      profile: string;
      /** Kopie der Tabellenzeile beim Anlegen des Querschnitts. */
      data: SteelProfileData;
    };
