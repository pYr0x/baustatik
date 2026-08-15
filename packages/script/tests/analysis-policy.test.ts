/**
 * Die `AnalysisPolicy` als Pflichtfeld des Snapshots (v13, ADR 0049).
 *
 * Die Fragen dieser Datei sind die der `sectionPolicy` seit v7, nur fuer die
 * zweite Policy desselben Dokuments: steht sie im Satz, steht sie VOLLSTAENDIG
 * darin, und prueft sie ihr Eigentuemer statt dieses Parsers?
 */

import {
  DEFAULT_ANALYSIS_POLICY,
  InvalidAnalysisPolicyError,
} from '@baustatik/fem-solver';
import { describe, expect, it } from 'vitest';
import {
  createFEMModelBuilder,
  parseFEMModelSnapshot,
  SnapshotValidationError,
} from '../src';
import { SNAPSHOT_ANALYSIS_POLICY, snapshot } from './helpers';

describe('Snapshot v13 — die analysisPolicy ist Pflicht', () => {
  it('nimmt einen runden Satz an und gibt die Policy unveraendert zurueck', () => {
    const parsed = parseFEMModelSnapshot(snapshot());

    expect(parsed.analysisPolicy).toEqual(DEFAULT_ANALYSIS_POLICY);
  });

  it('lehnt einen Satz OHNE analysisPolicy ab, statt den Default einzusetzen', () => {
    // Der Kern von ADR 0049: `shearDeformation` und `linearSystem` sind
    // RECHENWEISUNGEN. Sie stillschweigend zu ergaenzen hiesse zu behaupten,
    // jemand habe so gerechnet — dieselbe stille Aufloesung, die ADR 0027
    // abschafft.
    const { analysisPolicy: _fehlt, ...ohne } = snapshot();

    expect(() => parseFEMModelSnapshot(ohne)).toThrow(SnapshotValidationError);
    expect(() => parseFEMModelSnapshot(ohne)).toThrow(
      'Snapshot.analysisPolicy fehlt.',
    );
  });

  it('lehnt einen v12-Satz an der VERSION ab, nicht am fehlenden Feld', () => {
    // Die Reihenfolge ist die Aussage: ein aelteres Dokument bekommt die
    // Auskunft „diese Datei passt nicht zu diesem Programm" und nicht die
    // Feldmeldung, die nach einem Tippfehler aussaehe.
    const { analysisPolicy: _fehlt, ...v12 } = snapshot({ schemaVersion: 12 });

    expect(() => parseFEMModelSnapshot(v12)).toThrow(
      'Snapshot.schemaVersion muss 13 sein.',
    );
  });

  it('laesst den Fehler ihres Eigentuemers unveraendert nach aussen reisen', () => {
    // ARBEITSTEILUNG (ADR 0011/0033): was eine gueltige Analyse-Einstellung
    // ist, entscheidet `@baustatik/fem-solver`. Eine zweite Formpruefung hier
    // waeren zwei Wahrheiten ueber dieselbe Form — und der Fehler traegt
    // deshalb den Namen des Eigentuemers, nicht `SnapshotValidationError`.
    const kaputt = snapshot({
      analysisPolicy: {
        ...structuredClone(SNAPSHOT_ANALYSIS_POLICY),
        linearSystem: 'iterativ',
      },
    });

    expect(() => parseFEMModelSnapshot(kaputt)).toThrow(
      InvalidAnalysisPolicyError,
    );
  });

  it('verlangt die VOLLSTAENDIGE Policy und nicht die Abweichungen', () => {
    // Ein Teilsatz ist kein gueltiger Satz: im Dokument stehen die EFFEKTIVEN
    // Werte, sonst rechnete dasselbe Projekt nach einer Aenderung der
    // Software-Defaults still anders.
    const { linearSystem: _weg, ...unvollstaendig } = structuredClone(
      SNAPSHOT_ANALYSIS_POLICY,
    );

    expect(() =>
      parseFEMModelSnapshot(snapshot({ analysisPolicy: unvollstaendig })),
    ).toThrow(InvalidAnalysisPolicyError);
  });

  it('kennt die eigene schemaVersion der Policy nicht mehr', () => {
    // Ein v12-Satz trug sie im Teilsatz (`ANALYSIS_POLICY_SCHEMA_VERSION: 3`).
    // Jetzt ist sie dort ein unbekanntes Feld — genau das ist der Bruch.
    expect(() =>
      parseFEMModelSnapshot(
        snapshot({
          analysisPolicy: {
            ...structuredClone(SNAPSHOT_ANALYSIS_POLICY),
            schemaVersion: 3,
          },
        }),
      ),
    ).toThrow(InvalidAnalysisPolicyError);
  });
});

describe('createFEMModelBuilder — die pruefende Tuer der analysisPolicy', () => {
  it('schreibt ohne Konfiguration die vollstaendige Voreinstellung in den Satz', () => {
    const built = createFEMModelBuilder().finish();

    expect(built.analysisPolicy).toEqual(DEFAULT_ANALYSIS_POLICY);
    // Der Satz muss durch den eigenen Parser gehen — der Bauer darf nichts
    // ausgeben, was `parseFEMModelSnapshot` zurueckwiese.
    expect(parseFEMModelSnapshot(structuredClone(built)).analysisPolicy).toEqual(
      DEFAULT_ANALYSIS_POLICY,
    );
  });

  it('uebernimmt eine uebergebene Policy in den Satz', () => {
    const built = createFEMModelBuilder({
      analysisPolicy: {
        ...DEFAULT_ANALYSIS_POLICY,
        shearDeformation: false,
        linearSystem: 'dense',
      },
    }).finish();

    expect(built.analysisPolicy.shearDeformation).toBe(false);
    expect(built.analysisPolicy.linearSystem).toBe('dense');
  });

  it('weist eine kaputte Policy schon BEIM BAUEN zurueck', () => {
    // Der Typ haelt einen Aufrufer aus reinem JavaScript nicht auf; ohne diese
    // Tuer faende der Fehler erst am fertigen Satz statt, weit weg von der
    // Stelle, die ihn gesetzt hat.
    expect(() =>
      createFEMModelBuilder({
        analysisPolicy: {
          ...DEFAULT_ANALYSIS_POLICY,
          linearSystem: 'iterativ' as 'dense',
        },
      }),
    ).toThrow(InvalidAnalysisPolicyError);
  });
});
