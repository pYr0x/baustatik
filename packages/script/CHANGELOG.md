# @baustatik/script

## 1.0.0

### Major Changes

- 86c9b36: Die Spannungspunkte folgen der Idealisierung (ADR 0029), und `t-beam` heißt
  `t-section`.

  - **Der behobene Widerspruch:** das Package führte ZWEI unabhängige
    Schubmodelle, und `idealisation` steuerte nur eines. Ein `i-symmetric` mit
    `thin-walled` und IPE-80-Massen bekam sein κ aus dem Wandweg (`Sy,max`
    11,60 cm³, Katalog 11,61) und seinen Schwerpunkt-Spannungspunkt aus der
    Umrissmodell (11,25 cm³) — zwei Antworten auf EINE Zahl, in einem Querschnitt.
    Dazu stand am Gurtpunkt `t = b` statt `t = tf`, also die senkrechte
    Schubkomponente, die an einer dünnwandigen Wand nichts bedeutet.
  - **`stressPoints` verzweigt jetzt über Form UND Idealisierung.** Neu ist
    `src/stress-points/thin.ts` mit den dünnwandigen Vorlagen für `i-symmetric`
    (15 Punkte) und `t-section` (9 Punkte). `solid` behält das Umrissmodell, und
    das ist keine Übergangslösung: Grashof IST für Vollquerschnitte richtig.
  - **Koordinaten und Nummern bewegen sich nicht**, nur `t` und `S`. Die
    Nummerierung ist ein veröffentlichter Vertrag.
  - **Das Orakel kostete keine neue Fixture:** ein geschweißtes I ohne Ausrundung
    IST das gewalzte Profil mit `r = 0`. An den 14 Gurtstationen stimmen die neue
    Vorlage und die gegen 546 RSTAB-Punkte validierte `rolled-i.ts` auf
    Gleitkommarauschen überein. Am STEG gilt das Orakel nicht — `rolled-i.ts`
    führt dort die lichte Höhe, das Wandmodell Gurtmitte zu Gurtmitte —, und der
    Schwerpunkt hat deshalb seine eigene Referenz: `Sy,max` des Katalogs, über die
    ganze Reihe immer um 0,05 % bis 4,6 % unterschritten (die fehlende Ausrundung,
    dieselbe Signatur wie bei κ).
  - **κ hat sich in keiner Ziffer bewegt.** `shear.ts`, die Wege und κ wurden nicht
    angefasst; `tests/kappa.test.ts` ist der Beleg.
  - **Der Kasten bleibt `undefined`, mit präziserem Grund:** ihm fehlen die
    REFERENZDATEN, nicht die Theorie — `closedBoxPath` hat den umlaufenden Weg
    längst, und κ fällt daraus.

  **BREAKING (`@baustatik/script`): `schemaVersion` 4 → 5.**

  - `ShapeSpec.kind` heißt `'t-section'` statt `'t-beam'`. Der alte Name trug
    einen BAUSTOFF: dieselbe Form heißt im Betonbau Plattenbalken und im Stahlbau
    T-Profil, und getrennt werden die beiden von `idealisation`, nicht vom
    Formnamen.
  - Ein v4-Snapshot wird **abgelehnt**, nicht umgeschrieben — wie v3 heute. Hier
    wäre es eine zweizeilige Ersetzung, und genau das ist das Argument dagegen,
    sie still zu tun: eine Migration ist ein Werkzeug, das jemand AUFRUFT, sieht
    und ablehnen kann.

### Patch Changes

- Updated dependencies [3f2b5fb]
- Updated dependencies [3f2b5fb]
- Updated dependencies [86c9b36]
  - @baustatik/cross-section@0.4.0

## 0.2.0

### Minor Changes

- 5f543a4: `schemaVersion: 4` — der Snapshot ist jetzt auch in seinen ZAHLEN selbsttragend.

  - **Was der Schreibende tippt, aendert sich NICHT.** `model.crossSection({ kind:
'profile', profile: 'IPE 300' })` und `model.material({ kind: 'steel', grade:
'S235' })` bleiben Wort fuer Wort dieselben, und `femScriptDeclarations` musste
    nicht angefasst werden. Ein Test haelt das fest — der wahrscheinlichste Weg,
    die Ergonomie kaputtzumachen, ist gut gemeint.
  - **Der Builder befragt den Katalog, und nur er**
    ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)). Die
    Tabellenzeile (`data`) und die Moduln (`moduli`) gehen als Kopie in den Satz;
    gespeichert wird die kanonische Bezeichnung, `'ipe 300'` also als `'IPE 300'`.
    Bis v3 rechnete ein gespeichertes Modell gegen die Tabellen der gerade
    laufenden Programmversion.
  - **Ein Tippfehler faellt an SEINER ZEILE auf.** `profile: 'IPE 301'` und
    `grade: 'S234'` werfen jetzt `FEMScriptError` beim Anlegen, statt als
    `undefined` bis in den Solver-Bericht zu wandern und dort neben echten
    Modellfehlern zu stehen. Was Modellfehler BLEIBT: ein `crossSectionId`, der
    auf nichts zeigt.
  - **v3 wird abgelehnt, nicht per Lookup ergaenzt.** Es waere der verfuehrerische
    Fall — die Bezeichnungen stehen ja darin — und genau die stille Aufloesung,
    die v4 abschafft, einmal ausgefuehrt im unguenstigsten Moment. Eine Migration
    ist ein Werkzeug, das jemand aufruft und ablehnen kann. Nichts liegt auf
    Platte.
  - **Der Parser prueft die Gestalt, NICHT den Katalog** — und ausdruecklich auch
    nicht, ob die kopierten Zahlen noch zur heutigen Tabelle passen. Ein Abgleich
    dort waere die stille Aufloesung durch die Hintertuer, an der Stelle, an der
    ein Nutzer sie am wenigsten bemerken kann.
  - `CrossSectionInput` und `MaterialInput` sind jetzt eigene Typen statt
    `Without<Record, 'id'>`: die Eingabe ist echt kleiner als der Satz geworden.
    Neue Abhaengigkeit auf `@baustatik/steel-profiles`.

- 5f543a4: Snapshot `schemaVersion: 3` — die Materialien reisen mit.

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

### Patch Changes

- Updated dependencies [5f543a4]
- Updated dependencies [5f543a4]
- Updated dependencies [5f543a4]
- Updated dependencies [5f543a4]
  - @baustatik/cross-section@0.3.0
  - @baustatik/material@0.1.0
  - @baustatik/steel-profiles@0.2.0

## 0.1.0

### Minor Changes

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

- Updated dependencies [fe49281]
- Updated dependencies [d66e29b]
- Updated dependencies [e9b652b]
- Updated dependencies [fe49281]
  - @baustatik/cross-section@0.2.0

## 0.0.2

### Patch Changes

- Updated dependencies [605e904]
- Updated dependencies [8a2beb1]
- Updated dependencies [abba606]
- Updated dependencies [9290f16]
  - @baustatik/fem@1.0.0
  - @baustatik/errors@0.1.0
  - @baustatik/fem-loads@0.1.0
