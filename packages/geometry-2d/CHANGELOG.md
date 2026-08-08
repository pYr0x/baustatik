# @baustatik/geometry-2d

## 0.0.1

### Patch Changes

- cec4a27: `Bulge` hinzugefügt — der Umrechner zwischen der DXF-Wölbung `tan(Δ/4)` und
  einem `Arc`, als eigenes Modul `src/bulge.ts`. Sechs Funktionen: `sweep`,
  `sagitta`, `isStraight`, `toArc`, `fromArc`, `toPolyline`.

  Die tragende Identität ist die Stichhöhe `h = (Sehne/2)·|bulge|` — **exakt**,
  nicht genähert. Damit fällt „ab wann ist ein Bogen eine Gerade" mit
  `DEFAULT_ARC_TOLERANCE` zusammen, statt eine zweite Zahl zu brauchen; ein festes
  Epsilon auf `bulge` wäre längenblind.

  `toArc` und `fromArc` **werfen** statt `undefined` zu liefern: die Gerade ist
  eine bekannte Antwort und nicht „ich weiss es nicht". Neu sind dafür
  `StraightBulgeError(bulge, chordLength, tolerance)` und
  `FullCircleBulgeError(sweep)`, beide **mit Feldern** — anders als der Altbestand
  in `errors.ts`. `toPolyline` ist total und bedient die Gerade mit.

  Rein additiv; nichts Bestehendes ändert sich.

- **Breaking:** `Polygon.make` normalisiert die Windung nicht mehr, und `mirror`
  kehrt sie um (ADR 0034).

  - `Polygon.make(points)` **prüft nur** (mindestens 3 Punkte) und gibt die Punkte
    unverändert zurück. Vorher drehte es ein im Uhrzeigersinn laufendes Polygon
    still um. Damit ist ein **Lochring** erstmals überhaupt baubar — genau den
    braucht `@baustatik/cross-section`, wo die Windung „Material" gegen „Loch"
    bedeutet.
  - `Polygon.mirror` **kehrt die Windung um**, statt sie still zurückzudrehen.
    Eine Spiegelung ist orientierungsumkehrend; das zu verstecken hiesse, aus
    einem Loch beim Spiegeln stillschweigend Material zu machen.
  - `Polygon.fromLines` erbt beides (es geht durch `make`).
  - **Unverändert:** `union`/`intersect`/`subtract` liefern weiterhin CCW. Die
    Zusage ist von `make` an die martinez-Grenze gewandert (`fromMartinez`
    normalisiert jetzt ausdrücklich) — der Umlaufsinn einer fremden Bibliothek ist
    keine Aussage dieses Packages und wird deshalb an der Grenze festgelegt statt
    durchgereicht.

  **Neu:** `Polygon.moments(points)` und der Typ `PolygonMoments` — die rohen
  Flächenmomente eines Ringes um den **Ursprung**, **vorzeichenbehaftet** und
  skalenfrei: `A = ∫dA`, `Sx = ∫x dA`, `Sy = ∫y dA`, `Ixx = ∫y² dA`,
  `Iyy = ∫x² dA`, `Ixy = ∫xy dA`. Bewusst nicht schwerpunktsbezogen: roh addieren
  sich alle sechs Zahlen linear über mehrere Ringe, ein Lochring trägt sich über
  sein Vorzeichen selbst bei, und die Steiner-Verschiebung passiert einmal am
  Ende beim Aufrufer.

  `Polygon.area` gibt weiterhin den **Betrag** zurück und ist damit die falsche
  Tür für einen Lochring; `Polygon.moments(points).A` trägt das Vorzeichen.

## 0.2.0

### Minor Changes

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

## 0.1.0

### Minor Changes

- 8a2beb1: domain driven refactor

### Patch Changes

- Updated dependencies [8a2beb1]
  - @baustatik/core@0.1.0
  - @baustatik/errors@0.1.0
