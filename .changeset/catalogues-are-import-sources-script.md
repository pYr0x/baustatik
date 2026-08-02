---
'@baustatik/script': minor
---

`schemaVersion: 4` — der Snapshot ist jetzt auch in seinen ZAHLEN selbsttragend.

- **Was der Schreibende tippt, aendert sich NICHT.** `model.crossSection({ kind:
  'profile', profile: 'IPE 300' })` und `model.material({ kind: 'steel', grade:
  'S235' })' bleiben Wort fuer Wort dieselben, und `femScriptDeclarations` musste
  nicht angefasst werden. Ein Test haelt das fest — der wahrscheinlichste Weg,
  die Ergonomie kaputtzumachen, ist gut gemeint.
- **Der Builder befragt den Katalog, und nur er**
  ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)). Die
  Tabellenzeile (`data`) und die Moduln (`moduli`) gehen als Kopie in den Satz;
  gespeichert wird die kanonische Bezeichnung, `'ipe 300'` also als `'IPE 300'`.
  Bis v3 rechnete ein gespeichertes Modell gegen die Tabellen der gerade
  laufenden Programmversion.
- **Ein Tippfehler faellt an SEINER ZEILE auf.** `profile: 'IPE 301'` und
  `grade: 'S234'` werfen jetzt `FEMScriptError` beim Anlegen, statt als
  `undefined` bis in den Solver-Bericht zu wandern und dort neben echten
  Modellfehlern zu stehen. Was Modellfehler BLEIBT: ein `crossSectionId`, der
  auf nichts zeigt.
- **v3 wird abgelehnt, nicht per Lookup ergaenzt.** Es waere der verfuehrerische
  Fall — die Bezeichnungen stehen ja darin — und genau die stille Aufloesung,
  die v4 abschafft, einmal ausgefuehrt im unguenstigsten Moment. Eine Migration
  ist ein Werkzeug, das jemand aufruft und ablehnen kann. Nichts liegt auf
  Platte.
- **Der Parser prueft die Gestalt, NICHT den Katalog** — und ausdruecklich auch
  nicht, ob die kopierten Zahlen noch zur heutigen Tabelle passen. Ein Abgleich
  dort waere die stille Aufloesung durch die Hintertuer, an der Stelle, an der
  ein Nutzer sie am wenigsten bemerken kann.
- `CrossSectionInput` und `MaterialInput` sind jetzt eigene Typen statt
  `Without<Record, 'id'>`: die Eingabe ist echt kleiner als der Satz geworden.
  Neue Abhaengigkeit auf `@baustatik/steel-profiles`.
