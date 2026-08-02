---
'@baustatik/script': minor
---

Snapshot `schemaVersion: 3` — die Materialien reisen mit.

- `FEMModelSnapshot` traegt `materials: readonly Material[]` neben
  `crossSections`. Damit ist der Snapshot auch fuer die zweite Haelfte der
  Steifigkeit selbsttragend
  ([ADR 0026](../docs/adr/0026-materials-belong-to-the-model.md)).
- **Ein v2-Snapshot wird ABGELEHNT**, nicht still um ein leeres `materials`
  ergaenzt. Die Bedeutung eines vorhandenen Feldes hat sich geaendert: in v2 war
  `materialId` die Guete selbst (`'S235'`), in v3 ist er ein Verweis auf
  `Material.id`. Ein Ergaenzen naehme jedem Stab still sein Material.
- **Neu: `model.material(input)`** liefert einen `MaterialHandle` mit `.id` —
  dieselbe Mechanik wie `model.crossSection(input)`:
  `model.beam(a, b, { crossSectionId: ipe300.id, materialId: s235.id })`.
- Der Parser prueft **Form, nicht Aufloesbarkeit**: `id` und `grade` sind
  nichtleere Strings, IDs eindeutig. Ob die Sorte im Katalog steht oder ein Stab
  auf ein vorhandenes Material zeigt, meldet weiterhin der Bericht des Solvers.
  Einzige Ausnahme ist `kind` — der Diskriminator wird hart geprueft.
- Neue Abhaengigkeit: `@baustatik/material`.
