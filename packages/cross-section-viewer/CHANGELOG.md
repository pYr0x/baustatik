# @baustatik/cross-section-viewer

## 0.0.5

### Patch Changes

- 6bde31d: Cross-section viewer restructured, plus a wireframe primitive for it.

  `@baustatik/render-core` gains `IndexedLineListSpec`, a mesh-agnostic primitive
  for a list of independent lines: flat `points` (`[u0, v0, …]`) and `indices`
  (flat index pairs) as `ArrayLike<number>`, so a `Float64Array`/`Uint32Array`
  passes through without a copy. One spec per wireframe instead of one `LineSpec`
  per edge. Validation checks that both buffers can be read; duplicate, reversed
  and degenerate segments stay allowed.

  `@baustatik/konva-adapter` maps it to exactly one `Konva.Shape` whose scene
  function begins a separate subpath per segment, so two independent edges are
  never joined.

  **Breaking for `@baustatik/cross-section-viewer`:**

  - `CROSS_SECTION_LAYERS` is now
    `['grid', 'thin-walls', 'outlines', 'fe', 'symbols']`. The former `'section'`
    band is gone. Callers that pass the tuple to the driver need no change; callers
    that hard-coded `'section'` do.
  - Spec IDs are namespaced: `cross-section:thin-wall:{wallId}` and
    `cross-section:outline:{ringIndex}` replace the bare `{wallId}` and
    `outline-{index}`.

  New in the same package:

  - `crossSectionSpecs` (`scene.ts`) is the pure scene door; `createCrossSectionViewer`
    now only pulls data, holds the viewport and drives the renderer.
  - Three optional result pulls — `getProperties`, `getStressPoints`, `getFEMesh` —
    draw the centroid (red), the shear centre (green, only when both `yM` and `zM`
    are determined) and the stress points (blue), plus an FE wireframe. An omitted
    pull and a pull returning `undefined` are the same off state.
  - `CrossSectionStyle` with `DEFAULT_STYLE`, resolved once per scene. Wall
    thickness stays out of it: `Wall.t` is physics, everything with the `Px` suffix
    is screen-constant.
  - `CrossSectionFEMesh`, structurally compatible with `Mesh2DResult` but without a
    dependency on the mesher.
  - `@baustatik/units` and `@baustatik/errors` are new direct dependencies: section
    values arrive in SI metres and are converted exactly once, with `toExact`.

- Updated dependencies [6bde31d]
  - @baustatik/render-core@0.0.3
  - @baustatik/grid-2d@0.0.3

## 0.0.4

### Patch Changes

- @baustatik/cross-section@0.0.4
- @baustatik/render-core@0.0.2
- @baustatik/section-geometry@0.0.3
- @baustatik/grid-2d@0.0.2

## 0.0.3

### Patch Changes

- Updated dependencies [39020e1]
  - @baustatik/cross-section@0.0.3

## 0.0.2

### Patch Changes

- 90c195f: Der Umriss des gezeichneten Querschnitts entsteht jetzt aus dem **Wandgraphen**
  — P3, [ADR 0037](../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md).
  `kind: 'midline'` ist damit vollständig benutzbar: zeichnen, ableiten, rechnen,
  prüfen.

  **Nach ADR 0036 ist das ein `patch`; die Brüche stehen hier im Text.**

  ## Additiv

  - **`@baustatik/geometry-2d`: `Polygon.inflate(paths, options)`** — weitet
    offene oder geschlossene **Züge** um ein `delta` je Zug auf und vereinigt sie
    zu einer **Ringmenge mit Löchern** (aussen `signedArea > 0`, Loch `< 0`,
    sortiert nach `|A|`, jedes Loch unmittelbar hinter seinem Aussenring). Neue
    Typen `InflatePath`, `InflateOptions`, `InflateEndType`, neue Konstante
    `OFFSET_PRECISION`. Neue Abhängigkeit **`clipper2-ts`, exakt gepinnt** — die
    zweite Clipping-Bibliothek des Packages; martinez bleibt für
    `union`/`intersect`/`subtract` unberührt. Das ist bewusst kein Endzustand
    (`packages/TODO.md` §5).
  - **`@baustatik/section-geometry`: `Polygon.inflate`** in `y`/`z`
    durchgereicht, samt `InflatePathYZ` und den koordinatenfreien Optionstypen.
  - **`@baustatik/cross-section`**: `deriveOutline(geometry, policy)` als die EINE
    Tür über beide Varianten, `deriveOutlineFromWalls` dahinter,
    `createSectionGeometry(input, policy)` als Fabrik, `branches(nodes, walls)`
    und der Typ `Branch` (die Zerlegung, die P5 für den Wandweg braucht).
  - **`@baustatik/script`**: `crossSection({ kind: 'section-input', input })` —
    der Bauer leitet den Umriss unter seiner eigenen `SectionPolicy` ab, statt ihn
    entgegenzunehmen.

  ## Breaking

  - **`@baustatik/cross-section`: `SectionPolicy` hat ein drittes Pflichtfeld**,
    `miterLimit` (dimensionslos, Default `2`, muss `> 1` sein — Clipper2 ersetzt
    jeden Wert bis `1` still durch `2`). Es verändert den GESPEICHERTEN Umriss und
    ist damit nach ADR 0033 eine Erzeugungs- und keine Analyse-Einstellung.
    `parseSectionPolicy` lehnt jeden Satz ohne das Feld ab.
  - **`@baustatik/cross-section`: drei neue Befunde des Gates.**
    `OutlineDriftWarning` (der mitgeführte Umriss weicht von seiner Neuableitung
    ab, Schranke `arcTolerance · U` — für **beide** Varianten, der `outline`-Zweig
    bekommt damit erstmals eine Prüfung), `MiterLimitExceededWarning` (ein
    durchverbundener Stoss, dessen Umrissecke gekappt wird) und
    `NonFiniteBulgeError` (die offene Lücke aus P1). Wer die Befundlisten
    auszählt, zählt ab jetzt anders.
  - **`@baustatik/script`: `schemaVersion` steht auf `9`.** Jede v8-Datei wird
    abgelehnt, ohne Migrationswerkzeug und aus demselben Grund wie bei v5 bis v8:
    eine eingesetzte Voreinstellung behauptete, der Umriss sei unter ihr
    entstanden.

  ## Sonst

  - **`@baustatik/cross-section-viewer`** zeichnet den Umriss **orange**, die
    Wandmittellinien bleiben schwarz. Dass der Umriss abgeleitet und die Wände die
    Eingabe sind, ist eine Aussage des Viewers und keine Option am Aufruf.

- Updated dependencies [fd949a4]
- Updated dependencies [a7a1863]
- Updated dependencies [90c195f]
- Updated dependencies [d6d245f]
  - @baustatik/section-geometry@0.0.2
  - @baustatik/cross-section@0.0.2
  - @baustatik/render-core@0.0.1
  - @baustatik/grid-2d@0.0.1

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
