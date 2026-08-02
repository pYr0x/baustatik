---
'@baustatik/steel-profiles': minor
---

Zwei additive Exporte fuer die Zeile, die jetzt im Modell mitreist.

- **`profileData(p)`** streift `id` und `series` von einem `SteelProfile` ab.
  Beides ist Herkunft: die Bezeichnung fuehrt der Modellsatz ohnehin als eigenes
  Feld, und `series` ist eine Aussage ueber den Katalog, nicht ueber den
  Querschnitt.
- **`PROFILE_DATA_KEYS`** sagt zur Laufzeit, woraus eine Zeile besteht — damit
  der Snapshot-Parser in `@baustatik/script` ihre Gestalt pruefen kann, ohne
  eine zweite Spaltenliste zu fuehren. Beide Richtungen sind zur
  Uebersetzungszeit belegt: `satisfies` verbietet einen Namen, den es nicht
  gibt, `NoColumnMissing` eine Spalte, die fehlt.

Der Katalog ist damit ausdruecklich eine **Importquelle und keine
Live-Referenz** ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)).
Nichts Bestehendes aendert sich; das Package bleibt ohne jede Abhaengigkeit.
