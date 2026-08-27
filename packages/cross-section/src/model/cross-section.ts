import type { SteelProfileData } from '@baustatik/steel-profiles';
import type { FESectionState } from './fe-section-values';
import type { ReinforcementLayer } from './reinforcement';
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
      /**
       * Die Bewehrungslagen — SEIT
       * [ADR 0064](../../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md).
       *
       * SIE STEHEN HIER UND NICHT AN `SectionGeometry`, und der Grund ist ein
       * Typ und keine Vorliebe: `computeFESectionValues` nimmt genau jene
       * `SectionGeometry` (`cross-section-fe/src/index.ts:139`) und leitet in
       * der zweiten Zeile den Umriss ab — eine Bewehrung darin fiele dort
       * still heraus. Eine Ebene darüber, NEBEN der Geometrie statt in ihr,
       * ist „die Querschnittswerte ändern sich nicht" kein Versprechen mehr,
       * sondern der Typ: die FE-Tür kann das Feld gar nicht gereicht bekommen.
       * Dasselbe gilt für `deriveOutline` und für jeden Leser, der eine
       * Geometrie nimmt statt eines Satzes.
       *
       * `sectionProperties` LIEST DAS FELD NICHT. `A`, `Iy`, `Iz`, `Iyz`,
       * `ys`, `zs`, `alpha`, `Iu`, `Iv` bleiben, was sie waren — nicht aus
       * Ordnungsliebe, sondern weil das eingegebene `As` der Anfangswert einer
       * Iteration ist (siehe `ReinforcementElement`).
       *
       * NUR AM VOLLQUERSCHNITT ZULAESSIG. Die Variante allein reicht nicht —
       * beide Idealisierungen laufen durch sie —, und ein optionales Feld
       * lässt sich nicht an einem Wert bedingen, der in einem Geschwisterfeld
       * verschachtelt liegt (`idealisation` sitzt in `ShapeSpec` bzw. in
       * `SectionGeometry.midline`). Es ist deshalb ein Gate-Befund und KEIN
       * Compilerfehler: `validateReinforcement` meldet ihn. ADR 0064 sagt das
       * ausdrücklich, damit der nächste Leser nicht schliesst, die Prüfung sei
       * vergessen worden.
       */
      reinforcement?: readonly ReinforcementLayer[];
    }
  | {
      kind: 'section-geometry';
      id: string;
      geometry: SectionGeometry;
      /** Die Bewehrungslagen — siehe die `shape`-Variante (ADR 0064). */
      reinforcement?: readonly ReinforcementLayer[];
    }
  | {
      kind: 'profile';
      id: string;
      /** Die Herkunft, z. B. `'IPE 300'`; gerechnet wird mit `data`. */
      profile: string;
      /** Kopie der Tabellenzeile beim Anlegen des Querschnitts. */
      data: SteelProfileData;
      // KEINE `reinforcement` AN DIESEM ZWEIG, und das ist ein Compilerfehler
      // statt einer Laufzeitprüfung (ADR 0064): die Katalogzeile trägt eine
      // Tabelle und keine Geometrie, nichts schreibt sie als Ringe aus, und
      // ADR 0063 hält sie aus der Faserliste heraus.
    };
