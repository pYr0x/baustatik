# @baustatik/section-geometry

## 0.0.2

### Patch Changes

- fd949a4: Eine **endliche, aber riesige Wölbung** bringt die Umriss-Ableitung nicht mehr
  zum Absturz, und die Zerlegung eines Bogens bleibt in jedem Fall endlich.

  **Nach [ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md)
  ist das ein `patch`; die Brüche stehen hier im Text.**

  ## Der Defekt

  `Wall.bulge = 1e14` ist endlich, beschreibt aber einen fast vollen Kreis mit
  `2,5·10^15 mm` Radius durch zwei Punkte, die `100 mm` auseinanderliegen.
  `deriveOutline` filterte nur `Number.isFinite` weg und reichte den Rest an
  `Bulge.toPolyline` weiter. Dahinter rechnete `Arc.toPolyline` seine Segmentzahl
  aus `acos(1 − tol/R)` — bei `tol/R < 2^-53` wird das Argument zu `1`, `acos(1)`
  zu `0` und die Segmentzahl zu `Infinity`. Die Schleife lief in den Heap, bis der
  Prozess starb. Bei `bulge = 1e308` lief zusätzlich der Radius über: `Arc.make`
  liess `NaN` durch, weil jeder Vergleich mit `NaN` falsch ist, und der `NaN`
  stand danach in jedem Punkt des Umrisses.

  Getroffen war auch das **Gate**: es leitet den Umriss für die Drift-Prüfung neu
  ab, `validateSectionGeometry` starb also am selben Wert, statt ihn zu melden.

  ## Additiv

  - **`Bulge.isDiscretisable(chordLength, bulge, tolerance)`** in
    `@baustatik/geometry-2d` und `@baustatik/section-geometry` — total, und die
    Frage vor dem Wurf: sie verneint die nicht endliche Wölbung UND die, deren
    Bogen sich unter der Toleranz nicht mehr in `MAX_ARC_SEGMENTS` Punkte zerlegen
    lässt.
  - **`MAX_ARC_SEGMENTS = 100 000`** in `@baustatik/geometry-2d` — ein
    Speicherschutz, keine Feinheitsgrenze.
  - **`UndiscretisableBulgeError`** in `@baustatik/cross-section` — der
    Gate-Befund zur zweiten Sorte, neben `NonFiniteBulgeError`.
  - **`BulgeSite`** in `@baustatik/cross-section` — der Ort einer Wölbung, Wand
    oder Ring-Punkt. Das Gate prüft `Vertex.bulge` damit erstmals überhaupt:
    G6b sah bisher nur `geometry.walls`, obwohl der `outline`-Zweig dieselbe Zahl
    mit derselben Bedeutung trägt.

  ## Brüche

  - **`Arc.toPolyline` wirft `InvalidArcError`**, wenn die verlangte Segmentzahl
    `MAX_ARC_SEGMENTS` überschreitet — auch bei einer von Hand gesetzten
    `segments`-Option. Vorher belegte derselbe Aufruf Speicher, bis der Prozess
    starb.
  - **`Arc.make` wirft bei nicht endlichem `radius` oder `sweep`.** Vorher kam ein
    `NaN` durch beide Schranken.
  - **`Arc.toPolyline` rechnet die Segmentzahl stabil** über
    `2·asin(√(tol/2R))` statt `acos(1 − tol/R)`. Algebraisch dieselbe Zahl; für
    jeden Radius, an dem beide auflösen, kommt dieselbe Punktzahl heraus.
  - **`deriveOutline` liest eine unbrauchbare Wölbung als Gerade** — in BEIDEN
    Zweigen. Der Ringzweig warf dabei bisher sogar bei `bulge: NaN`, und weil das
    Gate für die Drift-Prüfung neu ableitet, starb `validateSectionGeometry` an
    dem Wert, statt ihn zu melden.
  - **`NonFiniteBulgeError` und `UndiscretisableBulgeError` tragen `at: BulgeSite`
    statt `wallId: string`.** Wer die betroffene Wand markiert, fragt jetzt
    `error.at.kind === 'wall'` — und bekommt dafür den Ring-Punkt mit, den es
    vorher gar nicht als Befund gab.

  ## Nebenbei

  - `@baustatik/cross-section` hängt jetzt an `@baustatik/core`, ausschliesslich
    für `atOrThrow`: die Zerlegung des Wandgraphen indizierte über Invarianten und
    machte aus deren Bruch ein stilles `continue`.
  - `pairKey` trennt die beiden Wand-Ids mit einem als Escape geschriebenen
    NUL statt mit dem rohen Byte im Quelltext, das `grep` die Datei für binär
    halten liess. Dieselbe Zeichenkette, nur sichtbar.

- a7a1863: Ein durchverbundener Stoss wird jetzt **gemitert, auch ueber einen
  Dickensprung** — [ADR 0038](../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md).

  **Nach ADR 0036 ist das ein `patch`; der Bruch steht hier im Text.**

  ## Der Bruch: Umrisse und Werte aendern sich

  Faellt ein Dickensprung mit einer ECKE zusammen, schnitt ADR 0037 den
  Offsetpfad dort auf, beide Stuecke endeten stumpf, und der Keil zwischen ihren
  Aussenkanten fehlte. Betroffen ist jeder gezeichnete Querschnitt mit
  `kind: 'midline'`, an dem zwei verschieden dicke Waende in einem Winkel
  durchverbunden sind — der geschweisste Kasten mit `tf ≠ tw` an allen vier Ecken.

  ```text
  Winkel Gurt 8 / Steg 6, 90°   A = 1548 mm²  ->  1560 mm²
  Kasten 400 x 200, tf 20/tw 10  A = 15000 mm² ->  15200 mm²
  ```

  Die neuen Zahlen sind die richtigen: die Aussenkontur am Stoss ist durch die
  beiden aeusseren Offsetgeraden begrenzt, und ihr Schnittpunkt ist der einzige
  Punkt, der beide Baender ausfuellt, ohne ueber eines hinauszureichen. **Wer
  gespeicherte Umrisse mitfuehrt, bekommt beim naechsten Gate-Lauf eine
  `OutlineDriftWarning`** — die Figur ist neu abzuleiten.

  Der KOLLINEARE Dickensprung bleibt unveraendert: dort ist die Stufe echt.

  ## Additiv

  - **`@baustatik/geometry-2d` / `@baustatik/section-geometry`: `delta: 0`** in
    `Polygon.inflate` ist die Identitaet — ein geschlossener Zug geht unveraendert
    in die Vereinigung, in den Umlaufsinn der Offsets gedreht. Ein offener Zug mit
    `delta: 0` traegt keine Flaeche und faellt heraus.
  - **`@baustatik/cross-section`: `ChainedJoint.overshoot`.** Der Ueberstand des
    ungekappten Spitzes wird an der GEBAUTEN Ecke gemessen statt aus `α`
    gerechnet, und das Gate liest ihn, statt eine zweite Formel zu fuehren.

  ## Geaendertes Verhalten

  - `MiterLimitExceededWarning` meldet sich jetzt auch am fast gestreckten Stoss
    MIT Dickensprung: dort laeuft der Miterpunkt laengs der Wand davon, waehrend
    `α` nahe `π` bleibt. Bei gleicher Wandstaerke ist `overshoot` unveraendert
    `1/sin(α/2)`. Der Bezug im Meldungstext ist die halbe **dickere** Wandstaerke.
  - Gekappt wird quer zur Richtung des Spitzes, an derselben Schranke wie bisher
    (`miterLimit · max(t)/2`). Der Schnitt ist eine Fase, wo Clipper2 intern ein
    Quadrat setzt — der Unterschied ist ein Splitter und tritt nur dort auf, wo
    das Gate ohnehin meldet.
  - Der Umriss traegt an der Naht eines Fuellrings kollineare Zwischenpunkte. Sie
    tragen zu `A`, `Iy` und `Iz` nichts bei.

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

- d6d245f: Die mit P2 hinzugekommenen öffentlichen Werte verlassen ihr Package jetzt
  **eingefroren und `readonly`**, wie es `CODING_STANDARDS.md` §4 verlangt.

  - `Polygon.moments` gibt in `@baustatik/geometry-2d` und
    `@baustatik/section-geometry` ein `Object.freeze`-tes Ergebnis zurück und
    nimmt seine Punkte als `readonly`.
  - `greenValues` und `deriveOutlineFromRings` in `@baustatik/cross-section`
    ebenso; `deriveOutlineFromRings` liefert jetzt `readonly Polygon[]` mit
    eingefrorenen Ringen.
  - `atOrThrow` in `@baustatik/core` nimmt `readonly T[]` statt `T[]` — reine
    Erweiterung, jeder bisherige Aufruf bleibt gültig.

  **Bruch am Typ, nicht am Verhalten:** `Polygon.points` ist in
  `@baustatik/section-geometry` und `@baustatik/cross-section` ein
  `readonly`-Array. Wer die Punktliste eines Polygons bisher an Ort und Stelle
  verändert hat, bekommt einen Compilerfehler; wer sie liest, merkt nichts. Die
  Laufzeitwerte sind unverändert.

  Dazu die Korrekturen aus dem Code-Review: die Kantenbildung in
  `deriveOutlineFromRings` und die Lochprobe in `validateSectionGeometry` kommen
  ohne direkten Index aus, `packages/section-geometry/README.md` behauptet nicht
  länger eine Normalisierung durch `Polygon.make`, und die JSDoc von
  `principalAxes` sagt jetzt, dass seit P2 **beide** Zweige in Gebrauch sind.

- Updated dependencies [fd949a4]
- Updated dependencies [a7a1863]
- Updated dependencies [90c195f]
- Updated dependencies [d6d245f]
  - @baustatik/geometry-2d@0.0.2
  - @baustatik/core@0.0.1

## 0.0.1

### Patch Changes

- cec4a27: `Bulge` als vollständige y/z-Durchreiche hinzugefügt, alle sechs Funktionen —
  auch die drei koordinatenfreien (`sweep`, `sagitta`, `isStraight`), nach dem
  Vorbild von `normalizeAngleYZ`. Ihre JSDoc sagt jeweils, _warum_ sie nichts
  umrechnen. Die Vorzeichen tragen 1:1 durch, weil `convert.ts`
  orientierungstreu ist: ein positiver `bulge` dreht von `+y` nach `+z`, wie
  `Arc.sweep`.

  `StraightBulgeError` und `FullCircleBulgeError` werden wie die acht bestehenden
  Fehlerklassen re-exportiert.

  Die `CONTEXT.md` schreibt ausserdem die Regel nieder, die der Bestand bereits
  befolgte, aber nirgends aussprach: **`@baustatik/geometry-2d` wird oberhalb
  dieses Packages nicht importiert, auch nicht in Tests.**

  Rein additiv.

- **Breaking:** `Polygon.isClockwise` kehrt seine Antwort um, `Polygon.make`
  normalisiert nicht mehr, und `mirror` kehrt die Windung um (ADR 0034).

  - `Polygon.isClockwise` ist jetzt `true` für `signedArea < 0` — **dieselbe
    Antwort wie in `@baustatik/geometry-2d`**. Vorher stand dort `> 0` mit der
    Begründung „im Bild rechtsdrehend, weil z nach unten zeigt": eine Aussage über
    die Zeichnung in einer API, die nicht zeichnet. Seit `convert.ts`
    orientierungstreu abbildet, ist `(y, z)` das mathematische System unter
    anderem Namen, und `signedArea > 0` heisst counter-clockwise. Wie es im Bild
    aussieht, ist ein Nachsatz im JSDoc und beantwortet die Viewer-Schicht.
  - `Polygon.make(points)` **prüft nur** und lässt die Windung stehen — sonst wäre
    ein Lochring (`signedArea < 0`) nicht baubar.
  - `Polygon.mirror` **kehrt die Windung um**.
  - **Unverändert:** `intersect`/`union`/`subtract` liefern weiterhin CCW; die
    Zusage sitzt jetzt an der martinez-Grenze in `geometry-2d`.

  **Neu:** `Polygon.moments(points)` und der Typ `PolygonMomentsYZ` — die rohen,
  vorzeichenbehafteten Flächenmomente eines Ringes um den Ursprung, unter den
  Symbolen der Norm: `A`, `Sy`, `Sz`, `Iy = ∫z² dA`, `Iz = ∫y² dA` und
  `Iyz = +∫y·z dA`. **Ohne Negation** — das ist die mathematische Konvention, zu
  der `tan 2α = −2·Iyz/(Iy − Iz)` aus ADR 0031 gehört.

  `Polygon.area` gibt weiterhin den Betrag zurück; `signedArea` trägt das
  Vorzeichen.

- Updated dependencies [cec4a27]
- Updated dependencies
  - @baustatik/geometry-2d@0.0.1

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

### Patch Changes

- Updated dependencies [ded1de8]
  - @baustatik/geometry-2d@0.2.0

## 0.1.0

### Minor Changes

- 8a2beb1: domain driven refactor

### Patch Changes

- Updated dependencies [8a2beb1]
  - @baustatik/core@0.1.0
  - @baustatik/errors@0.1.0
  - @baustatik/geometry-2d@0.1.0
