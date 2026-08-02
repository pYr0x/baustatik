---
'@baustatik/material': minor
---

Das Material traegt seine Moduln selbst.

- **`Material.moduli: ElasticModuli`** ist neu und pflicht. Bis hierher stand im
  Satz nur die Guete, und die Zahlen kamen beim RECHNEN aus der Sortentabelle —
  ein gespeichertes Modell rechnete also gegen die Tabellen der gerade
  laufenden Programmversion. Eine korrigierte Zeile, und jedes alte Modell
  antwortet still anders ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)).
  `grade` bleibt als HERKUNFT stehen.
- **`lookupMaterial(kind, grade)`** ist das Gegenstueck zu `lookupProfile`:
  dieselbe Faltung (`'s 235'` findet `S235`), dasselbe `undefined` statt eines
  Wurfs, und die kanonische Sorte kommt mit heraus. Es ist die Funktion, die den
  Satz fuellt.
- **Ohne Nationalen Anhang, und zwar strukturell.** `E` und `G` sind
  charakteristische Werte; `lookupMaterial` hat gar keinen Parameter, an dem ein
  Anhang haengen koennte. Was ADR 0026 per Test zusicherte, ist jetzt die
  Bauform.
- **`ElasticModuli` ist aus `@baustatik/fem-section-resolve` hierher gezogen** —
  dorthin, wo die Werte herkommen, und weil er jetzt ein Feld des Modellsatzes
  ist und kein Rechenzwischenwert mehr.
- **Nur die Moduln, nicht die Festigkeiten.** `fyk`/`fck`/`fmk` liest heute
  niemand, und eine eingefrorene Zahl ohne Leser kann nicht auffallen, wenn sie
  falsch ist. Sie kommen additiv mit der Bemessung; `gamma` mit dem Eigengewicht.
- Intern: der Quotient `Ecm/(2(1+ν))` steht als `concreteShearModulus` an EINER
  Stelle, die `makeConcrete` und `lookupMaterial` beide rufen. Ein Test haelt
  fest, dass Kopie und Katalog uebereinstimmen — unter DE wie unter EN.
