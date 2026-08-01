---
'@baustatik/cross-section': minor
'@baustatik/script': patch
---

**Breaking im 0.x: `ShapeSpec` nimmt Abmessungen in MILLIMETERN statt in
Metern**, und `StressPoint` liefert mm und cm³ statt Meter und m³.

```diff
- { kind: 'rectangle', b: 0.3, h: 0.5 }
+ { kind: 'rectangle', b: 300, h: 500 }
- { kind: 'i-symmetric', h: 0.4, b: 0.2, tw: 0.01, tf: 0.01, idealisation: 'thin-walled' }
+ { kind: 'i-symmetric', h: 400, b: 200, tw: 10, tf: 10, idealisation: 'thin-walled' }
```

**`SectionProperties` bleibt unveraendert SI** (m², m⁴, m). Die Einheitenkette
zu `@baustatik/fem-section-resolve` — `EA` in kN, `EI` in kNm² — ist nicht
angefasst; dessen Tests liefen durch diesen Umbau ohne eine geaenderte Zahl.

Warum: beide Quellen dieses Packages sprechen mm/cm. Der Katalog
(`SteelProfileData`) fuehrt mm, cm², cm⁴, weil man eine Zeile gegen die
gedruckte Tabelle diffen koennen muss; eine Handeingabe ist eine Bemassung und
steht in mm. Dass die parametrische Form daneben bereits in Metern rechnete,
bedeutete zwei Umrechnungswege fuer dieselbe Frage.

Intern rechnet das Package jetzt durchgehend in Katalogeinheiten
(`ShapeResult`: cm², cm⁴, cm — dieselben wie `SteelProfileData`), und **`toSI`
ist die einzige Stelle**, die daraus SI macht — fuer beide Quellen. `StressPoint`
in mm/cm³ ist die Form des gedruckten Ausdrucks und der Referenz-Fixture; der
Vergleich mit der Quelle braucht damit gar keinen Umrechnungsfaktor mehr.

Die Faktoren kommen aus `@baustatik/units` (neue Dependency) und dort aus
`toExact`, nicht aus `to`: `convert(139.5).from('mm').to('m')` liefert `0.14`
([ADR 0024](../docs/adr/0024-units-at-the-package-boundary.md)).

κ ist von alldem **unberuehrt** — dimensionslos, und die kappa-Testreihe ging
ohne eine einzige geaenderte Erwartung durch.

`@baustatik/script`: nur die Skript-Deklarationen und Fehlertexte nennen jetzt
Millimeter. Das Snapshot-Schema und die Validierung sind unveraendert — die
Einheit ist nichts, was ein Parser feststellen koennte.
