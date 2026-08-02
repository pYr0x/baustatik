---
'@baustatik/material': minor
---

Das Material wird ein Modellsatz — plus drei Folgen an der Paketgrenze.

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
