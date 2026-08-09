# @baustatik/cross-section-viewer

## 0.0.1

### Patch Changes

- cec4a27: **Breaking:** `ViewerConfig` bekommt einen zweiten Pull,
  `getSectionPolicy: () => SectionPolicy`, neben `getGeometry` und
  `getScreenSize`.

  Dafür zeichnet der Viewer **Bogenwände**: eine Wand mit `bulge ≠ 0`, deren
  Stichhöhe über `arcTolerance` liegt, wird als `arcPath`-Spec ausgegeben —
  `center`/`radius`/`startAngle`/`sweepAngle` direkt aus `Bulge.toArc`,
  `strokeWidth = t · vp.scale` wie bei der geraden Wand. Ein Strich der Dicke `t`
  auf einem Bogen _ist_ die Wand. Bis P0 gab `wallSpec` für sie `undefined`
  zurück.

  Der Pull ist Pflicht und nicht optional: `arcTolerance` entscheidet mit, welche
  Kante überhaupt als Bogen gilt, und sie steht seit `schemaVersion: 7` im selben
  Satz wie der Umriss, den der Viewer daneben zeichnet (ADR 0033). Eine
  Modulkonstante zöge die Zahl aus einer anderen Quelle.

  **Der Zeichenweg wirft weiterhin nicht.** Ein nicht endlicher `bulge` und einer
  am Vollkreis-Pol (`|bulge| ≳ 1,6e16`, wo `4·atan(bulge)` genau auf `2π` rundet)
  fallen auf die Sehne zurück, statt `InvalidArcError` bzw. eine von
  `render-core` zurückgewiesene Spec zu erzeugen. Das Gate prüft `bulge` heute
  nicht, beides kann also aus einem Store kommen — und ein Wurf hier löschte
  Grid, Umriss und jede andere Wand mit.

  `@baustatik/section-geometry` ist wieder eine Abhängigkeit. Neu gepinnt: der
  Vorzeichen-Test, an dem `bulge` → `Arc.sweep` → `ArcPathSpec.sweepAngle`
  aufeinandertreffen — bislang war die Identität nur argumentiert.

- Updated dependencies [cec4a27]
- Updated dependencies
- Updated dependencies [8646b0b]
- Updated dependencies [cec4a27]
- Updated dependencies
  - @baustatik/section-geometry@0.0.1
  - @baustatik/cross-section@0.0.1

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

### Patch Changes

- Updated dependencies [ded1de8]
  - @baustatik/cross-section@1.0.0

## 0.1.4

### Patch Changes

- Updated dependencies [3f2b5fb]
- Updated dependencies [3f2b5fb]
- Updated dependencies [86c9b36]
  - @baustatik/cross-section@0.4.0

## 0.1.3

### Patch Changes

- Updated dependencies [e6a9a4e]
  - @baustatik/render-core@0.1.1
  - @baustatik/grid-2d@0.0.3

## 0.1.2

### Patch Changes

- Updated dependencies [5f543a4]
  - @baustatik/cross-section@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [fe49281]
- Updated dependencies [d66e29b]
- Updated dependencies [e9b652b]
- Updated dependencies [fe49281]
  - @baustatik/cross-section@0.2.0

## 0.1.0

### Minor Changes

- 8a2beb1: domain driven refactor

### Patch Changes

- Updated dependencies [35c566b]
- Updated dependencies [8a2beb1]
- Updated dependencies [1bb918d]
  - @baustatik/render-core@0.1.0
  - @baustatik/section-geometry@0.1.0
  - @baustatik/cross-section@0.1.0
  - @baustatik/viewport-2d@0.1.0
  - @baustatik/grid-2d@0.0.2
