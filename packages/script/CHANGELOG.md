# @baustatik/script

## 3.0.0

### Major Changes

- cec4a27: **Breaking: `schemaVersion` 6 → 7.** Jede v6-Datei wird abgelehnt.

  `sectionPolicy` steht als **Pflichtfeld** auf Projektebene im Snapshot, neben
  `crossSections` und `materials` (ADR 0033). Vollständig und nicht als
  Abweichungsliste: hier stehen die **effektiven** Werte, sonst rechnete dasselbe
  Projekt nach einer Änderung der Software-Defaults still anders.

  `createFEMModelBuilder({ sectionPolicy })` nimmt eine **vollständige** Policy
  entgegen, keine Overrides — dieselbe Regel wie `SolverConfig.analysisPolicy`.
  Ohne Argument gilt `DEFAULT_SECTION_POLICY`; im Satz steht danach trotzdem der
  effektive Wert. Der neue Typ `FEMModelBuilderConfig` ist exportiert.

  Geprüft wird das Feld von seinem Eigentümer: der Parser ruft
  `parseSectionPolicy` und lässt `InvalidSectionPolicyError` nach aussen reisen —
  dieselbe Arbeitsteilung, mit der `fem-solver` `parseLoadValidationPolicy` ruft.

  Ein v6 zu ergänzen wäre die verführerischste Migration von allen, weil
  `DEFAULT_SECTION_POLICY` bereitliegt — und die schlimmste: sie behauptete, der
  mitgeführte Umriss sei unter `0,05 mm` entstanden, und die Drift-Prüfung, um
  derentwillen das Feld existiert, urteilte gegen eine erfundene Zahl.

### Patch Changes

- Updated dependencies [cec4a27]
  - @baustatik/cross-section@2.0.0
  - @baustatik/fem-loads@0.1.2

## 2.0.1

### Patch Changes

- Updated dependencies [8646b0b]
  - @baustatik/cross-section@1.0.1

## 2.0.0

### Major Changes

- ded1de8: Der Querschnittseditor bekommt seinen Vertrag (ADR 0030–0032). **Keine
  Mathematik** — nur den gespeicherten Typ, den Werteumfang, die Vorzeichen und
  das Prüfgatter, damit die folgenden Stufen sie nicht mehr verrücken können.

  **Der Anlass:** summiert man die Querschnittswerte aus den Teilflächen eines
  Mittellinienmodells auf, weichen sie von den parametrischen Formen ab — bei
  gleichen Abmessungen und gleichen Blechdicken. Ursache ist der Doppelzähler am
  Knoten: der Steg läuft von Gurtmitte zu Gurtmitte und ragt `tf/2` in jeden Gurt
  hinein. Das ist kein Fehler in den vier Formen, sondern die Stelle, an der „die
  Form ist parametrisch" aufhört zu reichen.

  **BREAKING (`@baustatik/cross-section`)**

  - **Neu: `SectionGeometry` als dritte Quelle** (ADR 0030). Entweder ein
    Wandgraph (`nodes`, `walls` mit `t` und `bulge`, plus `idealisation`) oder
    freie Umrissringe — in beiden Fällen samt **mitgeführtem, diskretisiertem
    Umriss**. `CrossSection` bekommt die Variante
    `{ kind: 'section-geometry'; id; geometry }`; `sectionProperties` und
    `stressPoints` geben für sie noch `undefined` zurück.
    - **String-Ids, keine Indizes:** ein gelöschter Knoten verschöbe jeden
      folgenden, und ein Modell-Diff wäre unlesbar.
    - **`idealisation` sitzt IN der `midline`-Variante.** Die verbotene Zelle
      „freier Umriss, dünnwandig gerechnet" ist damit ein Compilerfehler.
    - **Beide Marken benennen eine Linie:** `midline` gegen `outline`. `midline`
      ist der Begriff der englischsprachigen Fachwelt für die Mittellinie (SCIA,
      SHAPE-THIN) und spart den Streit centre/center. Die Wandenden heißen
      `startNodeId`/`endNodeId` wie am Stab (`Beam` in `@baustatik/fem`) —
      dieselbe Systematik, dieselben Namen.
    - **Der Umriss reist mit,** und das ist eine geprüfte Denormalisierung: das
      Gatter leitet ihn ohnehin ab, der Vergleich kostet nichts, und aus stiller
      Drift wird ein Befund. Ein Bericht druckt `A = 5163,21 mm²`, eine neue
      Bibliotheksversion liefert `5163,19` — still (dieselbe Überlegung wie
      ADR 0027).
  - **`Segment` ist ersatzlos gelöscht.** Es war toter Code: nichts in `src/` hat
    je eins konstruiert, einziger Verbraucher war der Viewer, der es von außen
    hereinbekam. Es gab nichts zu migrieren.
  - **`SectionProperties` wächst um Pflichtfelder:** `alpha` [rad], `Iu`, `Iv`
    [m⁴] sowie die optionalen `yM`/`zM` [m] (ADR 0031). Pflicht, weil sie reine
    Algebra auf `Iy`/`Iz`/`Iyz` und damit für jede Quelle total sind — bei einem
    IPE 300 wäre `undefined` keine Auskunft, sondern eine Unwahrheit.
    - `alpha` zählt **positiv von `+y` nach `+z`**, derselbe Drehsinn wie
      `Arc.sweep`. Gegen Dlubal ist das Vorzeichen gespiegelt, und gespiegelt wird
      **einmal**, in der Berichtsausgabe (wie `phiY = −theta`, ADR 0005). Rider:
      `Iu ≥ Iv` und `alpha ∈ (−π/2, +π/2]`.
    - `alpha = 0` ist **nichts, was eine Form hinschreibt**, sondern das Ergebnis
      für eine aufrechte Figur. Der Plattenbalken mit 2 m breitem Gurt hat
      `Iz > Iy` und landet auf `+π/2`; ein Test hält beide Fälle.
    - **`zM` bleibt beim `t-section` `undefined`** — die Form ist nur einfach
      symmetrisch. `zs` hinzuschreiben wäre eine Unwahrheit.
    - Invariante statt dritter Konvention: **`yM`/`zM` liegen im selben System wie
      `ys`/`zs`.**
  - **Neu: das Prüfgatter** `validateSectionGeometry(g, { arcTolerance })` und
    `validateSectionProperties(p)`, beide mit `{ errors, warnings }` und benannten
    Klassen statt Strings (ADR 0032). **Es warnt, es verweigert nicht** — kein
    `assertValid…`: „aus der Ebene gehalten" ist keine Eigenschaft des
    Querschnitts, und `CrossSection` wird nach ADR 0023 geteilt.
    - **Doppelte Knoten- und Wand-Ids sind ein Fehler.** Das ist der Preis der
      String-Ids: die Nachschlagetabelle behielte sonst still den LETZTEN
      Eintrag, jede Wand hinge an der falschen Lage, und alles Weitere urteilte
      über eine Figur, die niemand gezeichnet hat.
    - Die **Knickschranke wird abgeleitet, nicht gesetzt**:
      `notch = (t/2)·tan(theta/2) > arcTolerance`. Bei `0,05 mm` heißt das
      `t = 6 → ≈1,9°`, `t = 20 → ≈0,57°`. Dass dicke Wände weniger Knick
      vertragen, ist richtig — ihre Kerbe wird tiefer.
    - Die Toleranz ist ein **Parameter**, keine Konstante im Gatter (ADR 0011):
      sonst hinge dieses Package an `geometry-2d`, nur um eine `0,05` zu lesen.
  - **Neue Abhängigkeit: `@baustatik/errors`** — die Wurzel der Gatterklassen.
    Derselbe Schritt wie ADR 0008, und er erzeugt keinen neuen Knoten im Graphen.
    **Keine** Geometriebibliothek: die Endtangente einer Bogenwand fällt aus
    `2·atan(bulge)`.
  - **κ und die 546 Spannungspunkt-Referenzen haben sich in keiner Ziffer
    bewegt.** Alle 72 Bestandstests laufen unverändert durch.

  **BREAKING (`@baustatik/script`): `schemaVersion` 5 → 6.**

  Die dritte Querschnittsvariante reist im Snapshot mit. Ein v5-Satz wird
  **abgelehnt** — und er ist der verführerischste Fall bisher, weil die Variante
  rein additiv ist und ein v5 sich schlicht durchwinken ließe. Genau deshalb steht
  ein Test dafür: eine Migration ist ein Werkzeug, das jemand AUFRUFT, sieht und
  ablehnen kann. **Ab hier ist jede v5-Datei verloren**, bewusst und ohne
  Migrationswerkzeug — gespeicherte v5-Modelle, die überleben müssten, gibt es
  nicht.

  **BREAKING (`@baustatik/cross-section-viewer`):** der Port heißt
  `getGeometry(): SectionGeometry` statt `getSegments(): readonly Segment[]`, und
  `arcSegments` entfällt. Der Viewer zeichnet den **mitgeführten** Umriss, statt
  einen eigenen abzuleiten — der erste Verbraucher, der belegt, dass die
  Denormalisierung sich lohnt. Wandmittellinien tragen ihre Dicke als
  Strichbreite; eine Bogenwand bekommt noch keine, weil `bulge` ↔ `Arc` zu P1
  gehört und nicht zweimal geschrieben werden darf.

  **`@baustatik/geometry-2d` / `@baustatik/section-geometry`:** neu
  `DEFAULT_ARC_TOLERANCE = 0,05 mm`, die **eine** Diskretisierungstoleranz des
  Repos und der Default von `Arc.toPolyline`. Sie war vorher schon eine stille
  Modellannahme, nur an zwei Stellen mit zwei Zahlen (`0,1` im Default,
  `arcSegments = 24` im Viewer) — und sie entscheidet mit, wie viele Punkte ein
  Umriss trägt und damit, welches `A`, `Iy`, `Iz` aus ihm fällt.

### Patch Changes

- Updated dependencies [ded1de8]
  - @baustatik/cross-section@1.0.0
  - @baustatik/fem-loads@0.1.1

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
