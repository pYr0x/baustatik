---
'@baustatik/fem-solver': patch
---

Die `AnalysisPolicy` verliert ihre eigene Schema-Version.

Sie trug eine, solange sie **allein** reiste — sie stand in keinem Dokument,
also konnte nichts anderes sagen, wie alt sie ist. Seit sie Pflichtfeld des
`FEMModelSnapshot` ist (`@baustatik/script`, v13), versioniert der Satz sie mit,
und ein eigener Zähler wäre eine zweite Wahrheit über dieselben Bytes: zwei
Zähler können einander widersprechen, und es gäbe keine Regel, welcher gilt
(ADR 0049).

`parseAnalysisPolicy` prüft deshalb nur noch die **Form** — vollständig, keine
unbekannten Felder, Werteregeln. Die Auskunft „diese Datei ist neuer als das
Programm" gibt jetzt `parseFEMModelSnapshot`, und zwar früher: ein fremder Satz
wird abgewiesen, bevor der Teilsatz hier ankommt.

**BREAKING CHANGES:**

- **`ANALYSIS_POLICY_SCHEMA_VERSION` ist entfallen** (zuletzt `3`), samt dem
  Feld `schemaVersion` auf `AnalysisPolicy`, `DEFAULT_ANALYSIS_POLICY` und dem
  Ergebnis von `createAnalysisPolicy`/`parseAnalysisPolicy`.
- **`UnsupportedAnalysisPolicySchemaVersionError` ist gelöscht.** Ein Satz, der
  noch ein `schemaVersion` trägt, ist jetzt ein `InvalidAnalysisPolicyError`
  wie jeder andere Formfehler — still zu schlucken, was einmal die Version war,
  hieße eine Auskunft zu geben, für die es keine Wahrheit mehr gibt.
- Kein Migrationspfad, wie schon bei 1 → 2 und 2 → 3: es liegt nichts
  Persistiertes herum.
