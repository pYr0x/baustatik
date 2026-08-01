---
'@baustatik/material': patch
---

`Quantity<U>` und die Einheiten-Aliase (`MPa`, `KNm3`, `Kgm3`, `PerK`,
`PerMille`, `Percent`) leben jetzt in `@baustatik/units` und werden von hier
nur noch re-exportiert. **Keine Verhaltensaenderung und kein Bruch**: die Namen,
die Typen und die oeffentliche Oberflaeche dieses Packages sind unveraendert.

Grund: der Typ stand an zwei Stellen, seit `cross-section` sich eine eigene
Kopie angelegt hatte. `units` besitzt das Einheiten-Vokabular ohnehin
(`UNITS`, `UnitCategory`, `convert`)
([ADR 0024](../docs/adr/0024-units-at-the-package-boundary.md)).

Die neue Dependency auf `@baustatik/units` ist **rein typseitig** — zur Laufzeit
entsteht nichts, im Bundle steht nichts.
