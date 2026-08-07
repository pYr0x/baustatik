# @baustatik/fem-section-resolve

## 0.2.2

### Patch Changes

- Updated dependencies [ded1de8]
  - @baustatik/cross-section@1.0.0

## 0.2.1

### Patch Changes

- Updated dependencies [3f2b5fb]
- Updated dependencies [3f2b5fb]
- Updated dependencies [86c9b36]
  - @baustatik/cross-section@0.4.0

## 0.2.0

### Minor Changes

- 5f543a4: Der Katalog-Parameter entfaellt — der Schritt, der Code WEGNIMMT.

  - **Neue Signatur: `resolveSectionStiffness(beam, model)`.** Bis hierher kam ein
    dritter Parameter `catalog` herein, und die Naht zwischen „was gespeichert
    wird" und „was am Nationalen Anhang haengt" lag genau hier. Seit die Zahlen im
    Modellsatz stehen ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)),
    gibt es diese Naht nicht mehr.
  - **`resolveModuli` ist geloescht.** Mit ihm verschwinden der Familien-`switch`,
    die drei `as SteelGrade`-Casts und das `try`/`catch` um `UnknownGradeError`.
    Die Familienwahl faellt einmal beim Anlegen des Satzes, nicht bei jedem
    Aufruf.
  - **„Der Anhang bewegt die FEM nicht" ist keine Zusicherung mehr, sondern eine
    Bauform.** Es gibt keinen Parameter mehr, an dem ein Anhang haengen koennte;
    `@baustatik/material` wird nur noch fuer zwei Typen importiert. Der frueher
    hier stehende DE/EN-Test ist deshalb ersatzlos entfallen — was von ihm zu
    pruefen bleibt, steht jetzt in `material/tests/moduli.test.ts`.
  - **`undefined` heisst weniger als vorher:** unbekannter `crossSectionId`,
    unbekannter `materialId`, oder ein Querschnitt, dessen Werte sich nicht bilden
    lassen. „Unbekannte Sorte" und „unbekanntes Profil" stehen nicht mehr dabei —
    ein Tippfehler wird beim Anlegen gemeldet, ein Verweis ins Leere im Bericht.
    Zwei Fehler, die vorher als dasselbe `undefined` ankamen, sind damit getrennt.
  - `ElasticModuli` wird aus `@baustatik/material` re-exportiert;
    `sectionStiffness(props, moduli)` ist unveraendert.

- 5f543a4: Der Resolver liest Modellsaetze und kennt alle drei Familien.

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

### Patch Changes

- Updated dependencies [5f543a4]
- Updated dependencies [5f543a4]
- Updated dependencies [5f543a4]
  - @baustatik/cross-section@0.3.0
  - @baustatik/material@0.1.0

## 0.1.0

### Minor Changes

- fdfa066: Ab hier rechnet die FEM echt.

  `@baustatik/fem-section-resolve` ist neu: `resolveSectionStiffness(beam,
sections, materials)` macht aus Querschnitt × Material die `SectionStiffness`
  `{ EA, EI, GAs }` — die einzige Stelle im Repository, an der Geometrie mit
  Material multipliziert wird. `undefined` statt Wurf, passend zum Port
  `getSectionStiffness`.

  `@baustatik/script`: **Breaking im 0.x.** `FEMModelSnapshot` trägt
  `crossSections` und `schemaVersion: 2`; ein v1-Snapshot wird abgelehnt statt
  stillschweigend ergänzt. Neu ist `model.crossSection(input)`, das die vom
  Modell vergebene ID herausreicht. Damit ist ein Snapshot selbsttragend —
  bis v1 zeigte `crossSectionId` ins Leere.

### Patch Changes

- Updated dependencies [fe49281]
- Updated dependencies [fe49281]
- Updated dependencies [3da2409]
- Updated dependencies [d66e29b]
- Updated dependencies [e9b652b]
- Updated dependencies [fe49281]
- Updated dependencies [6fb26ba]
  - @baustatik/material@0.0.3
  - @baustatik/cross-section@0.2.0
  - @baustatik/fem-element@1.1.0
