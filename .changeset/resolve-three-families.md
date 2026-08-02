---
'@baustatik/fem-section-resolve': minor
---

Der Resolver liest Modellsaetze und kennt alle drei Familien.

- **Der Defekt, der hier stirbt:** `materials.steel(materialId as SteelGrade)`
  erklaerte **jeden Stab zu Baustahl**. Ein Holzstab rechnete klaglos mit
  E = 210 000 MPa, ein Betonstab ebenso. Jetzt waehlt `Material.kind` erst den
  Katalog, und der Cast danach wird im selben Atemzug validiert — eine Frage mit
  Antwort statt einer Behauptung.
- **Neue Signatur:** `resolveSectionStiffness(beam, model, catalog)`. `model`
  (`SectionModel`: `crossSections` + `materials`) ist das, was gespeichert wird;
  `catalog` ist das, was am Nationalen Anhang haengt. Ein Store, der beide Listen
  fuehrt, erfuellt die Form strukturell und reist als ein Stueck hinein.
- **Alle drei Familien** liefern Steifigkeiten: Stahl `Es`/`G`, Beton
  `Ecm`/`G` (ungerissen), Holz `E0,mean`/`G,mean`. Ein Rahmen aus gemischten
  Materialien ist damit erstmals rechenbar.
- **`ElasticModuli.Es` → `ElasticModuli.E`.** Mit drei Familien war das
  Stahlzeichen bei zweien schlicht falsch. Nebenbei faellt eine strukturelle
  Zufaelligkeit weg: ein ganzes `Steel`-Objekt passt nicht mehr versehentlich
  hinein, jede Familie benennt ihre Abbildung selbst.
- Neu getestet und festgehalten: `EA`, `EI` und `GAs` sind unter `na: 'DE'` und
  `na: 'EN'` **identisch**, fuer alle drei Familien — die Moduln sind
  charakteristische Werte, der Anhang steuert nur die Bemessungswerte.
