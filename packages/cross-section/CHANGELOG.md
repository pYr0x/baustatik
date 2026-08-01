# @baustatik/cross-section

## 0.2.0

### Minor Changes

- fe49281: **Breaking im 0.x: `ShapeSpec` nimmt Abmessungen in MILLIMETERN statt in
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

- d66e29b: Der Rechenkern der Querschnittswerte.

  `sectionProperties(cs)` liefert `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` und κ in
  SI-Metern — aus einer parametrischen Form (`rectangle`, `hollow-rectangle`,
  `i-symmetric`, `t-beam`) oder aus einem Katalogprofil. Dazu der Modellsatz
  `CrossSection`, der neben `Node`, `Beam` und `NodeSupport` im Modell liegt.

  κ hat eine Definition, die Schubenergie `A_s = I² / ∫(S/t)² dA`; fürs Rechteck
  fällt daraus exakt 5/6. `idealisation` ist ein Pflichtfeld ohne Default:
  dieselben vier Zahlen ergeben als kompakt 0,401 und als dünnwandig 0,340.

  Neue Dependency: `@baustatik/steel-profiles`.

- e9b652b: Spannungspunkte: `stressPoints(cs)` liefert Ort, Dicke und die statischen
  Momente `Sy`/`Sz` je Punkt.

  Vier Vorlagen nach einer Regel — alle Ecken der Umrissfigur plus der
  Schwerpunkt: Rechteck 5, Plattenbalken 9, geschweißtes I 15, Walzprofil 13.
  Beim Walzprofil ist RSTABs gedruckte Nummerierung übernommen und durch einen
  Test festgehalten; die Ausrundung wird integriert und reproduziert `A`, `Iy`
  und `Sy,max` des ganzen Katalogs auf 0,05 %.

  Für den geschlossenen Kasten gibt es noch keine Vorlage — `undefined`.

- fe49281: **Breaking im 0.x.** `CrossSection` heisst das Katalogprofil jetzt `profile`
  statt `profileId`: `{ kind: 'profile'; id: string; profile: string }`.

  Der Name trug ein `Id`, das keines war. `crossSectionId`, `materialId` und
  `startNodeId` zeigen auf einen Satz IM MODELL; `profile` nennt eine Reihe im
  Walzprofil-Katalog, den das Modell nicht besitzt und dessen Namen es nicht
  vergibt. Ein Feld, das wie ein Verweis aussieht, aber keiner ist, laesst genau
  die Frage offen, die `Beam.crossSectionId` beantwortet — worauf zeigt das hier.

  Die Snapshot-Grenze zieht mit: `parseFEMModelSnapshot` verlangt bei
  `kind: 'profile'` den Schluessel `profile`. **Kein `schemaVersion: 3`** —
  Version 2 ist mit demselben Stapel Changesets unterwegs und war nie
  veroeffentlicht, es gibt also keinen v2-Snapshot, der zu wandern haette.

### Patch Changes

- Updated dependencies [4003920]
- Updated dependencies [fe49281]
  - @baustatik/steel-profiles@0.1.0
  - @baustatik/units@0.3.0

## 0.1.0

### Minor Changes

- 8a2beb1: domain driven refactor
