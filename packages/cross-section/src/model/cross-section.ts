import type { SteelProfileData } from '@baustatik/steel-profiles';
import type { FESectionState } from './fe-section-values';
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
  | {
      kind: 'shape';
      id: string;
      shape: ShapeSpec;
      /**
       * Die FE-Werte des Vollquerschnitts — SEIT
       * [ADR 0062](../../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
       * auch hier.
       *
       * ABWESEND heisst „der Aufloesungsschritt lief noch nicht", wie in beiden
       * `SectionGeometry`-Varianten — der dritte Zustand neben `computed` und
       * `unsupported`. Ohne ihn bleiben `It`, `yM`/`zM` und κ des soliden
       * Vollquerschnitts `undefined`; die Werte der Umrissfigur (`A`, `Iy`,
       * `Iz`, `ys`, `zs`, …) stehen ohne jeden FE-Lauf da, sie sind
       * geschlossene Formel.
       *
       * DER `unsupported`-ZWEIG IST FUER FORMEN UNERREICHBAR. Er kennt genau
       * einen Grund, `disconnected-areas`, und `meshPlan` verweigert allein bei
       * mehreren getrennten Materialflaechen — jede der vier Formen ist
       * zusammenhaengend. Der Typ wird trotzdem NICHT eingeengt: `FESectionState`
       * ist EIN Typ mit EINER Bedeutung, und ihn hier zu beschneiden hiesse,
       * zwei Sorten FE-Block zu fuehren, die sich beim Zurueckschreiben nur
       * durch den Zweig unterscheiden, den keiner von beiden erreicht.
       *
       * Beim `thin-walled`-Zweig hat er nichts zu suchen und schadet auch
       * nichts: dort kommt alles aus dem Wandweg, der Block bliebe abwesend.
       */
      feValues?: FESectionState;
    }
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
