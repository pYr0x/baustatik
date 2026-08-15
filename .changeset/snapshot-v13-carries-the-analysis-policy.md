---
'@baustatik/script': patch
---

Snapshot v13: die `analysisPolicy` steht im Satz.

Das Tool-Dokument ist die **Datensatz-Einheit**, und es trägt jetzt beide
Policies des Projekts: `sectionPolicy` seit v7, `analysisPolicy` seit v13. Damit
ist die Frage beantwortet, wie viele `schemaVersion` eine Projektdatei trägt —
genau eine pro Tool-Dokument (ADR 0049).

Geprüft wird die neue Policy von **ihrem Eigentümer**: der Parser ruft
`parseAnalysisPolicy` aus `@baustatik/fem-solver` und lässt
`InvalidAnalysisPolicyError` unverändert nach außen reisen — dieselbe
Arbeitsteilung wie bei `sectionPolicy`/`InvalidSectionPolicyError`. Genau dafür
hängt dieses Package jetzt an `@baustatik/fem-solver`; gerechnet wird hier
nichts.

`createFEMModelBuilder({ analysisPolicy })` nimmt — wie bei `sectionPolicy` —
eine **vollständige** Policy und keine Overrides, und `createAnalysisPolicy` ist
dabei die prüfende Tür: der Bauer darf keinen Satz ausgeben, den sein eigener
Parser ablehnt. Ausgelassen heißt `DEFAULT_ANALYSIS_POLICY`, und im Satz stehen
danach trotzdem die vollständigen effektiven Werte.

**BREAKING CHANGES:**

- **`schemaVersion` 12 → 13.** Jeder v12-Snapshot wird **abgelehnt** und nicht
  ergänzt. `DEFAULT_ANALYSIS_POLICY` läge bereit — aber `shearDeformation` und
  `linearSystem` sind Rechenweisungen, und sie einzusetzen hieße zu behaupten,
  jemand habe so gerechnet. Kein Migrationswerkzeug; es gibt keine
  gespeicherten Dateien.
- **`FEMModelSnapshot.analysisPolicy` ist Pflichtfeld.** Die Policy führt die
  **effektiven** Werte, damit dasselbe Projekt nach einer Änderung der
  Software-Defaults nicht still anders rechnet.
- Die mitgeführte `AnalysisPolicy` trägt **kein eigenes `schemaVersion`** mehr
  (siehe `@baustatik/fem-solver`).
