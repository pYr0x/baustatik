# @baustatik/cross-section

## 1.0.1

### Patch Changes

- 8646b0b: Aus dem `ShearSegment` wird das **`ShearFlowInterval`**. Nur Namen und
  Kommentare — keine Zahl bewegt sich, und die öffentliche API ist nicht
  betroffen (`shear.ts` ist package-intern, `src/index.ts` exportiert daraus
  nichts).

  - **`Segment` versprach eine Lage, die der Typ nicht hat.** Er ist ein Stück
    der Laufkoordinate `s`, kein Stück Querschnitt: `pathZ` des I-Profils benutzt
    dasselbe Gurtobjekt viermal, ein Ort ließe sich daraus nicht ablesen.
    `Interval` sagt genau das, und die Funktionsfamilie zieht mit —
    `partSegments` → `partIntervals`, `crossWallSegment` → `crossWallInterval`,
    das Rückgabefeld `.segments` → `.intervals`.
  - **Damit ist `Segment` frei**, und es bleibt reserviert für das
    **positionierte** Wegstück mit Startpunkt und Richtung, aus dem κ und die
    Spannungspunkte einmal gemeinsam fallen sollen (`packages/TODO.md`). Das war
    der eigentliche Grund für den Rename; `Wall` (ADR 0030) ist unabhängig davon
    begründet und bleibt.
  - **Nicht `ShearEnergyInterval`**, obwohl `shear.ts` mit der Schubenergie
    aufmacht: `∫ S²/t ds` ist mit `L⁶` eine rein geometrische Größe — deshalb
    fällt `A_s = I²/∫` als Fläche heraus. Die Schubenergie ist das Prinzip hinter
    der Formel und gehört in die Begründung, nicht in einen Typnamen, der sonst
    eine Einheit behauptet, die er nicht trägt.
  - **Die Literatur gibt kein Wort her.** Sie führt das Stück nicht als Objekt,
    sondern integriert abschnittsweise über `s` und beschriftet „Bereich I, II,
    III". Dlubal (SHAPE-THIN/RSECTION) sagt _Element_ — im Monorepo vom
    FE-Element belegt; _Branch_ und _Zelle_ sind in der Theorie dünnwandiger
    Profile anders vergeben.

## 1.0.0

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

## 0.4.0

### Minor Changes

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

- 3f2b5fb: Ein `examples/`-Ordner zeigt jede Querschnittsart einmal — zum Ansehen, nicht
  zum Pruefen.

  `pnpm --filter @baustatik/cross-section example` baut das Package und druckt fuer
  Rechteck, geschweisstes I (beide Idealisierungen), T-Querschnitt (Plattenbalken
  und Stahl-T), Kasten und Walzprofil die Querschnittswerte, kappa und die
  Spannungspunkte. Es behauptet nichts und faellt nicht um: die Zusicherungen
  stehen weiter in `tests/`. Was hier dazukommt, ist die AUFRUFSEITE — wie ein
  `CrossSection` entsteht und was `sectionProperties` und `stressPoints` darauf
  zurueckgeben, einschliesslich der beiden Faelle, in denen das `undefined` ist.

  Der Ordner wird von `typecheck` mitgeprueft (`examples/tsconfig.json`), damit
  ein Beispiel nicht unbemerkt veralten kann.

- 3f2b5fb: Aus dem „Band" wird die **Teilfläche**, aus der „Bandmaschine" das
  **Umrissmodell**. Nur Namen und Kommentare — keine Zahl bewegt sich, und die
  öffentliche API ist nicht betroffen (`Part`, `OutlinePart` und `partSegments`
  sind package-intern, `src/index.ts` exportiert sie nicht).

  - **„Band" war erfundenes Vokabular.** Es steht in keinem Lehrbuch und in keinem
    Programm. Die Literatur nennt das Stück, aus dem ein zusammengesetzter
    Querschnitt gerechnet wird, **Teilfläche** — „das statische Moment der
    Teilfläche mal Abstand Teilschwerpunkt bis Gesamtschwerpunkt" ist genau das,
    was `momentBefore` tut. Dlubal nennt dasselbe in RSECTION/SHAPE-THIN
    _Element_; der Name ist hier vergeben, im Monorepo ist ein Element ein
    FE-Element.
  - **`Segment` war schon zweimal vergeben** und schied deshalb als Ersatz aus:
    `ShearSegment` (`shear.ts`) ist der Abschnitt des Schubflusswegs, `Segment`
    (`types.ts`, exportiert) das Wandsegment eines dünnwandigen Querschnitts.
    Englisch heißt die Teilfläche jetzt `Part` — bewusst formneutral, siehe unten.
  - **„Bandmaschine" war ein Gerät, wo ein Modell hingehört.** Der Begriff stand
    als Gegenstück zu **Wandmodell** in zwei Tabellen (`CONTEXT.md`,
    `stress-points/index.ts`). Beide Seiten heißen jetzt gleichrangig:
    **Umrissmodell** (Grashof, Schnitte durch die volle Umrissfigur) gegen
    **Wandmodell** (Schubfluss längs der Wandmittellinien).

  **Zwei Kommentare waren sachlich falsch und sind mitkorrigiert:**

  - `OutlinePart.from`/`to` laufen **längs** der Schnittkoordinate, `width` misst
    quer dazu — `shear.ts` behauptete beim Typ das Gegenteil („ein Band quer zur
    Schubrichtung"), während die Funktion darunter richtig „längs" schrieb. Die
    Teilflächen haben **keine gemeinsame Gestalt**: beim I ist der Gurt 8,5 mm
    hoch und 100 mm breit, der Steg 183 von 200 mm hoch und 5,6 mm breit. Es wird
    nicht in dünne Scheiben zerlegt und summiert, sondern über zwei bis drei
    Teilflächen geschlossen integriert.
  - **`width` kann eine Summe über getrennte Bereiche sein**, und das stand
    nirgends. Beim I in y-Richtung liefert `widthAt` außerhalb des Stegs `2*tf` —
    der senkrechte Schnitt trifft Ober- **und** Untergurt, zwei Flächen, die sich
    nicht berühren. Für `S` und für den Nenner von Grashof ist das richtig, beim
    Lesen aber überraschend; jetzt steht es bei `OutlinePart`, bei `widthAt` und
    an der Stelle in `compact.ts`, wo die `2*tf` hingeschrieben werden.

  `Teilfläche` und `Umrissmodell`/`Wandmodell` stehen ab jetzt unter
  **Domänensprache** in `packages/cross-section/CONTEXT.md`, mitsamt den
  Begriffen, die ausdrücklich _nicht_ gemeint sind: „Streifen" ist Hillerborgs
  Plattenverfahren, und eine „Lamelle" ist im Stahl- und Betonbau das
  aufgeschweißte bzw. aufgeklebte Blech.

## 0.3.0

### Minor Changes

- 5f543a4: Die Profil-Variante traegt die Tabellenzeile.

  - **`{ kind: 'profile'; id; profile; data: SteelProfileData }`** — `data` ist neu
    und pflicht, `profile` ist nur noch die HERKUNFT
    ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)).
  - **Dieses Package schlaegt nichts mehr nach.** `sectionProperties` und
    `stressPoints` lesen `cs.data`; der Profilzweig ist damit TOTAL. `undefined`
    heisst nur noch „unsinnige Abmessungen" bzw. „fuer diese Form gibt es keine
    Vorlage" — der Fall „unbekanntes Profil" ist hier verschwunden und wird beim
    ANLEGEN gemeldet, wo der Tippfehler steht (`@baustatik/script`).
  - **DIE GANZE ZEILE, nicht die fuenf Zahlen der Steifigkeit.** Zwei Verbraucher
    lesen heute schon disjunkte Teilmengen — `profileProperties` liest
    `A`/`Ay`/`Az`/`Iy`/`Iz`, die Spannungspunkte lesen `h`/`b`/`tw`/`tf`/`r` — und
    die Bemessung liest spaeter `Wply` und `It`. Jede Teilmenge waere eine weitere
    Meinung darueber, was ein Profil ist.
  - **`ShapeSpec` bleibt unveraendert und wird NICHT kopiert.** Dort sind `b`/`h`
    die Eingabe, `A`/`Iy` eine reine Funktion davon, und die Funktion liegt in
    git. Kopieren hiesse zwei Wahrheiten ueber eine Zahl.
  - Die Abhaengigkeit auf `@baustatik/steel-profiles` ist im `src` nur noch ein
    Typimport.

### Patch Changes

- Updated dependencies [5f543a4]
  - @baustatik/steel-profiles@0.2.0

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
