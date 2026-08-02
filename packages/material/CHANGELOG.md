# @baustatik/material

## 0.1.0

### Minor Changes

- 5f543a4: Das Material traegt seine Moduln selbst.

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

- 5f543a4: Das Material wird ein Modellsatz — plus drei Folgen an der Paketgrenze.

  - **Neu: `Material`** (`{ kind, id, grade }`) und `MaterialKind`. Der Record,
    auf den `Beam.materialId` zeigt und der mit dem Modell gespeichert wird
    ([ADR 0026](../docs/adr/0026-materials-belong-to-the-model.md)). `grade` ist
    ein schlichter String wie `CrossSection.profile`; die engen Sortentypen
    bleiben an der Katalogsignatur, wo sie beim Schreiben helfen. `reinforcement`
    ist bewusst **keine** Familie: Betonstahl ist die Einlage eines
    Stahlbetonquerschnitts, nie das Material eines Stabs.
  - **Umbenannt: `Materials` → `MaterialCatalog`.** Der schlichte Name gehoert dem
    Modellsatz; `model.materials` (Records) neben `materials: Materials`
    (Fabriken) waeren zwei fast gleiche Namen fuer zwei Schichten gewesen.
    `createMaterials` heisst unveraendert weiter so.
  - **Neu: `Concrete.G`** = `Ecm/(2(1+ν))` mit ν = 0,2 (C30/37: 13 750 MPa). Der
    Katalog fuehrt den Quotienten selbst, aus demselben Grund wie bei
    `STEEL_SHEAR_MODULUS`. ν = 0,2 gilt fuer **ungerissenen** Beton
    (EN 1992-1-1 §3.1.3(4)); das steht am Wert und nicht zwischen den Zeilen.
  - **Sortensuche faltet wie `lookupProfile`**: alle Leerzeichen weg, dann
    Grossschreibung. `steel('S 235')` und `concrete('C 30/37')` loesen jetzt auf,
    wo sie vorher warfen.

## 0.0.3

### Patch Changes

- fe49281: `Quantity<U>` und die Einheiten-Aliase (`MPa`, `KNm3`, `Kgm3`, `PerK`,
  `PerMille`, `Percent`) leben jetzt in `@baustatik/units` und werden von hier
  nur noch re-exportiert. **Keine Verhaltensaenderung und kein Bruch**: die Namen,
  die Typen und die oeffentliche Oberflaeche dieses Packages sind unveraendert.

  Grund: der Typ stand an zwei Stellen, seit `cross-section` sich eine eigene
  Kopie angelegt hatte. `units` besitzt das Einheiten-Vokabular ohnehin
  (`UNITS`, `UnitCategory`, `convert`)
  ([ADR 0024](../docs/adr/0024-units-at-the-package-boundary.md)).

  Die neue Dependency auf `@baustatik/units` ist **rein typseitig** — zur Laufzeit
  entsteht nichts, im Bundle steht nichts.

- 6fb26ba: `STEEL_SHEAR_MODULUS` ist der **exakte** Quotient `E/(2(1+ν)) = 210000/2,6 =
80769,23`, auf ganze MPa gerundet — nicht die 81000, die EN 1993-1-1 §3.2.6
  druckt und die die meisten Tabellen wiederholen. Der Normwert ist gerundet; wir
  runden nicht, weil `G` in eine Rechnung geht (`GAs = κ·G·A`) und nicht in einen
  Ausdruck.

  Der Zahlenwert selbst stand schon so im Code; neu ist der Kommentar, der ihn
  davor bewahrt, als Tippfehler „korrigiert" zu werden.

- Updated dependencies [fe49281]
  - @baustatik/units@0.3.0

## 0.0.2

### Patch Changes

- Updated dependencies [8a2beb1]
  - @baustatik/errors@0.1.0
