# `@baustatik/cross-section`

## Zweck

Der **Rechenkern der Querschnittswerte**. Aus einem Querschnitt — parametrische
Form, Katalogprofil oder die frei gezeichnete Geometrie des Editors — werden
`A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs`, die Hauptachsen `alpha`/`Iu`/`Iv`, der
Schubmittelpunkt `yM`/`zM`, κ und `It`.

**Drei Quellen, eine Frage.** Die dritte, `SectionGeometry`, kam mit
[ADR 0030](../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md) dazu:
ein Wandgraph (`kind: 'midline'` — Knoten, Waende mit Dicke) oder freie
Umrissringe (`kind: 'outline'`), in beiden Faellen samt **mitgefuehrtem,
diskretisiertem Umriss**. Beide Marken benennen eine LINIE, nicht ihren Inhalt:
die Mittellinie gegen den Umriss. Seit
[ADR 0035](../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md)
traegt sie auch **Werte**: `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` fallen nach Green
aus dem mitgefuehrten Umriss (`src/calculation/green.ts`), `alpha`/`Iu`/`Iv` als Algebra
mit. Seit P5 kommen **κ, der Schubmittelpunkt und `It`** dazu — aber nur fuer
das **duennwandig gerechnete Mittellinienmodell mit hoechstens einer Zelle**,
und zwar aus dem positionierten Wandweg (`src/calculation/wall-path/segments.ts`,
`src/calculation/wall-path/calculate-wall-path.ts`,
[ADR 0040](../../docs/adr/0040-the-wall-path-is-positioned.md)). Fuer
**DIE ZWEITE QUELLE IST DIE FE**, und mit ihr ist die Luecke fuer
`kind: 'outline'` und fuer `midline` + `solid` geschlossen: der VOLLQUERSCHNITT
bekommt κ, `It` und den Schubmittelpunkt aus einer 2D-FE-Rechnung, die in
`@baustatik/cross-section-fe` liegt
([ADR 0045](../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md),
[ADR 0047](../../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md)).
Dieses Package **fuehrt dafuer nur die Typen** (`FESectionValues`,
`FESectionState`, das Feld `feValues` und `kappaFromCoefficients`) und bleibt
frei von WASM. κ steht dort als ν-freie FORMEL statt als Zahl —
`1/κ = d0 + d2·m²` mit `m = ν/(1+ν)` —, und ν setzt allein
`@baustatik/fem-section-resolve` ein.

Fuer den **Mehrzeller** bleiben sie weiter `undefined`: dort braucht es ein
Gleichungssystem, und das ist offen (`packages/TODO.md`). Wo sie fehlen, heisst das fuer den Loeser `GAs: 'rigid'`,
und `check()` in `@baustatik/fem-solver` sagt es, wenn jemand Schubverformung
verlangt hat. `stressPoints` bleibt fuer **jeden Vollquerschnitt** `undefined` —
fuer die gezeichnete Geometrie und seit
[ADR 0057](../../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)
auch fuer die parametrische Form mit `idealisation: 'solid'`. Seine Spannungen
kommen aus dem FE-Feld und ausdruecklich nicht aus einer zweiten Naeherung
(`packages/TODO.md`).

**Beide Zweige sind seit P3 ableitbar**, und zwar hinter EINER Tuer:
`deriveOutline(geometry, policy)` verzweigt ueber `kind`
([ADR 0037](../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
Dahinter liegen `deriveOutlineFromRings` — nur `Bulge.toPolyline` je Kante,
keine Bibliothek — und `deriveOutlineFromWalls`: Zerlegung des Graphen in
Laeufe, Aufweitung um `t/2`, Vereinigung ueber `Polygon.inflate`. Eine Tuer und
nicht zwei, weil das Gate den Umriss fuer die Drift-Pruefung neu ableitet und
die Fallunterscheidung sonst zweimal im Repo staende.

`createSectionGeometry(input, policy)` (`src/geometry/create-section-geometry.ts`) ist
die **Fabrik**: Eingabe plus Policy ergeben den vollstaendigen Satz. Der Record
bleibt daneben **frei konstruierbar** — er ist reine, JSON-serialisierbare
Daten und muss aus einer geladenen Datei rekonstruierbar sein, ohne durch eine
Fabrik zu laufen.

### Source layout

`src/index.ts` ist die einzige oeffentliche Tuer. Dahinter ist die
Implementierung nach Verantwortung geordnet:

| Ordner | Verantwortung |
| --- | --- |
| `model/` | serialisierbare Querschnittstypen, Ergebnis- und FE-Typen |
| `geometry/` | Fabrik, Umrissableitung und gemeinsame Wandgraph-Topologie |
| `calculation/` | Querschnittswerte, Einheiten, Formeln und interner Wandweg |
| `stress-points/` | Spannungspunkt-Vorlagen und ihr Dispatch |
| `validation/` | Gate und seine Befunde |

Innerhalb von `geometry/outline/` bleiben Ringableitung, Wandableitung und
Miter-Geometrie getrennt. `calculation/wall-path/` folgt den Rechenphasen:
positionierte Segmente, Topologie, Schubfluss, Torsion und Wandmomente. Interne
Ordner haben bewusst keine eigenen Barrel-Dateien; die Importkante soll den
tatsaechlichen Besitzer zeigen.

### Die Zugregel

> **Geradeste Fortsetzung.** An jedem Knoten wird das Wandpaar mit der
> kleinsten Richtungsaenderung durchverbunden. Gleichstand entscheidet die
> Wand-Id.

Sie ist Teil des Vertrags und nicht Implementierungslaune: `JoinType` wirkt
INNERHALB eines Pfades, also schliesst Clipper2 die Ecke zwischen zwei Waenden
nur, wenn beide als EIN Pfad hineingehen. Welches Paar das ist, aendert den
Umriss. Daran haengt die Zusage: **zwei Wandgraphen gleicher Gestalt mit
anderen Ids liefern denselben Umriss.**

`Branch` (`src/geometry/wall-graph/branches.ts`) ist der Lauf zwischen VERZWEIGUNGSKNOTEN (Grad ≠ 2),
das Wort, das ADR 0030 reserviert hat, und er wird **exportiert** — P5 braucht
dieselbe Zerlegung fuer den Wandweg. Der Offsetpfad geht weiter als der Branch:
er kettet an jedem Knoten und wird zusaetzlich an jedem Dickensprung geteilt,
weil Clipper2 EIN `delta` je Aufruf nimmt. Ein geschlossener Umlauf wird
**topologisch** erkannt (erster Knoten === letzter Knoten) — zwei Knoten auf
denselben Koordinaten sind zwei Knoten.

> **Ein durchverbundener Stoss wird gemitert — auch ueber einen Dickensprung
> hinweg. Wo die Waende kollinear sind, ist die Stufe echt.**
> ([ADR 0038](../../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md))

Faellt der Dickensprung mit einer ECKE zusammen, kann Clipper2 sie nicht setzen:
der Pfad ist dort aufgeschnitten, beide Stuecke enden stumpf, und der Keil
dazwischen fehlte bis P3 (`tf/2 · tw/2` an jeder Ecke eines geschweissten
Kastens). `jointFills` legt ihn als Ring mit `delta: 0` in dieselbe Vereinigung.
Die Aussenkontur ist dabei kanonisch — Schnittpunkt der beiden aeusseren
Offsetgeraden —, deshalb wird gefuellt und nicht gewarnt.

### Die Drift-Pruefung

`validateSectionGeometry` leitet den Umriss NEU AB und vergleicht die Flaeche —
das Versprechen von ADR 0030, das von P0 bis P2 eine Absicht war. Die Schranke
wird abgeleitet, nicht gesetzt:

```text
warnen, wenn |A_neu − A| > policy.discretisationTolerance · U      U aus dem Umriss
```

`discretisationTolerance · U` ist genau die Flaeche, die entsteht, wenn der Rand ueberall
um die Diskretisierungstoleranz wandert — die groesste Abweichung, die ein
zulaessiger Bibliothekswechsel erklaeren kann. **Kein viertes Policy-Feld**: eine
gesetzte Schranke waere eine zweite Zahl fuer dieselbe Frage. Verglichen wird
`A` und nicht Punkt fuer Punkt, sonst waere jede `discretisationTolerance`-Aenderung ein
Befund. **Warnung, kein Fehler** — und sie gilt fuer BEIDE Varianten, womit der
`outline`-Zweig die Pruefung bekommt, die ihm seit P2 fehlte.

Dazu gehoert seit
[ADR 0032](../../docs/adr/0032-the-cross-section-gate-warns.md) das
**Gate**: `validateSectionGeometry` und `validateSectionProperties`, beide
mit dem Kanal `{ errors, warnings }`.

Und seit
[ADR 0033](../../docs/adr/0033-the-cross-section-has-a-creation-policy.md) die
**`SectionPolicy`** — die Erzeugungs-Einstellung, eine eigene Wurzel und keine
Scheibe von `AnalysisPolicy`. Siehe den eigenen Abschnitt weiter unten.

Das Package besitzt ausserdem den **Modellsatz `CrossSection`**: den Record, der
neben `Node`, `Beam` und `NodeSupport` im Modell liegt und mit ihm gespeichert
wird ([ADR 0023](../../docs/adr/0023-cross-sections-belong-to-the-model.md)).
Die Profil-Variante traegt seit
[ADR 0027](../../docs/adr/0027-catalogues-are-import-sources.md) die
**Tabellenzeile als Kopie** (`data`); `profile` ist nur noch die Herkunft.
Damit schlaegt dieses Package **nichts mehr nach** — `sectionProperties` und
`stressPoints` sind im Profilzweig total, und `undefined` heisst nur noch
„unsinnige Abmessungen" bzw. „fuer diesen Querschnitt gibt es kein
Schnittmodell".

Fuenf Abhaengigkeiten: `@baustatik/steel-profiles` (nur noch der **Typ**
`SteelProfileData`, kein `lookupProfile` mehr im `src`), `@baustatik/units`
(die Umrechnungsfaktoren und die Quantity-Typen), `@baustatik/errors` (die
Wurzel der Gate-Klassen, ADR 0030), seit ADR 0033
`@baustatik/section-geometry` und `@baustatik/core`.

`@baustatik/core` steht dort für **`atOrThrow` und sonst nichts**. Die
Zerlegung des Wandgraphen indiziert an mehreren Stellen über eine Invariante —
`nodeIds` hat einen Eintrag mehr als `wallIds`, ein Stück hat immer einen ersten
Schritt —, und TypeScript engt durch eine Längenprüfung nicht ein. Bis dahin
stand dort ein `if (x === undefined) continue`: es machte aus dem Bruch einer
Invariante ein stilles Überspringen. Die Kante ist die schmalste im Repo — ein
Package, das ohnehin unter `section-geometry` liegt — und sie kauft, dass ein
solcher Bruch als `AssertionError` sichtbar wird.

**Die Geometriekante ist neu und war vorher ausdruecklich verboten.** ADR 0032
schrieb „keine neue Abhaengigkeit ausser `@baustatik/errors`", damit die
Knickwarnung ihre Endtangente aus `2·atan(bulge)` von Hand rechnete und
`@baustatik/script` keine Geometriebibliothek in den Snapshot-Builder zog. Mit
`Bulge` (P1) gibt es die Umrechnung an einer Stelle; `outgoingTangent` liest
`Bulge.sweep`, und die Doppelung ist aufgeloest statt nur getestet. **Der Preis
ist ausgesprochen:** seit `geometry-2d` mit P3 `clipper2-ts` eingezogen hat,
traegt `@baustatik/script` es transitiv mit. Und das Gate LIEST den mitgefuehrten
Umriss nicht mehr nur — es leitet ihn seit P3 neu ab und vergleicht (ADR 0037).

## Die Grenze zur Bemessung, mechanisch pruefbar

> **Kein Symbol in diesem Package kennt eine Schnittgroesse oder eine
> Festigkeit.**

Kein `N`, kein `My`, kein `Vz`, kein `fy`. Damit gibt es hier auch kein
`normalStress`/`shearStress`: die nehmen Schnittgroessen entgegen und gehoeren
ins spaetere Bemessungspaket, zusammen mit Querschnittsklasse, `Npl,d`, `Vpl,d`,
`Mpl,d` und den Knicklinien.

Was das Package liefert, ist der **Nenner** solcher Formeln, nie der Zaehler.

## `SectionProperties` vs. `SectionStiffness`

| | Inhalt | vom Material abhaengig |
| --- | --- | --- |
| `SectionProperties` (hier) | `A` [m²], `Iy`, `Iz`, `Iyz`, `Iu`, `Iv`, `It` [m⁴], `ys`, `zs`, `yM`, `zM` [m], `alpha` [rad], `kappaY`, `kappaZ` [–] | **nein** |
| `SectionStiffness` (`fem-element`) | `EA` [kN], `EI` [kNm²], `GAs` [kN] | **ja** |

Der Name sass frueher auf der anderen Seite; die Umbenennung und ihr Grund
stehen in
[ADR 0020](../../docs/adr/0020-section-properties-versus-section-stiffness.md).
Die Multiplikation leistet `@baustatik/fem-section-resolve` und sonst niemand.

## Einheiten: Katalog innen, SI an der Grenze

| | Einheit | warum |
| --- | --- | --- |
| `ShapeSpec` (Eingabe) | **mm** | die Einheit, in der ein Querschnitt gezeichnet und bemasst wird — und in der `SteelProfileData` daneben `h`, `b`, `tw`, `tf`, `r` fuehrt |
| `ShapeResult` (intern) | **cm², cm⁴, cm** | dieselbe Sprache wie die Tabellenzeile: `Iy: 8356` liest man, `8.356e-5` nicht |
| `SectionProperties` (Ausgabe) | **m², m⁴, m** | dahinter multipliziert `fem-section-resolve` mit `E` in kN/m² und will kN bzw. kNm² |
| `StressPoint` | **mm**, `S` in **cm³** | genau das, was der Ausdruck druckt und was in der Referenz-Fixture steht |

Umgerechnet wird an **einer Eingangsstelle je Quelle und an einem gemeinsamen
Ausgang**:

- `shapeValues` in `src/calculation/section-properties.ts` — mm → cm, fuer die parametrische Form.
- `geometryValues` in `src/calculation/geometry-properties.ts` — mm → cm, fuer
  den gezeichneten Umriss. Es skaliert die **Punkte**, nicht das Ergebnis:
  dieselbe Figur wie bei `shapeValues`, und
  ein Faktor an einer Stelle statt dreier (cm², cm⁴, cm) am Ausgang.
- Die Katalogzeile braucht keine: sie fuehrt bereits cm.
- **`toSI` in `src/calculation/to-si.ts` — cm → SI, fuer ALLE Quellen.** Dass es nur eine
  ist, ist der eigentliche Gewinn: `ShapeResult`, `SteelProfileData` und die
  Green-Werte fuehren dieselben Einheiten, und keine Quelle braucht einen
  eigenen Rechenweg.

(Hier stand frueher „genau zwei Stellen". Das war schon damals die falsche Zahl
fuer die richtige Aussage.)

Die Faktoren stehen nicht als Literal im Code, sondern kommen aus
`@baustatik/units` (`src/calculation/units.ts`) — und zwar aus **`toExact`**, nicht aus
`to`: `convert(...).to(...)` rundet atomar auf ganze mm, aus `139,5 mm` wuerde
`0,14 m` ([ADR 0024](../../docs/adr/0024-units-at-the-package-boundary.md)).

**κ ist von alldem unberuehrt.** Es ist ein Verhaeltnis zweier Flaechen und
damit dimensionslos; skaliert man alle Laengen mit `L`, wird `I` zu `L⁴I` und
`A_s` zu `L²A_s`, der Quotient bleibt. Deshalb ging der ganze Wechsel von
Metern auf Zentimeter durch `tests/kappa.test.ts`, ohne eine einzige erwartete
Zahl zu aendern — der schaerfste Beleg, dass er sauber durchgezogen ist.

## κ hat eine Definition: die Schubenergie

> **`A_s = I² / ∫ (S/t)² dA`**, und `κ = A_s / A`.

Eine Definition fuer alle Formen, keine Ad-hoc-Naeherung. Das Integral laeuft
ueber den **Wandschubfluss-Weg** (`dA = t·ds`), nicht ueber Flaechenschnitte;
beim Rechteck fallen beide zusammen, beim I-Profil liegen sie 11 % auseinander.
Gegen die IPE- und HEA-Reihe geprueft ist die hier verwendete
([ADR 0021](../../docs/adr/0021-section-values-separate-from-tabulated-profiles.md)).

Fuers Rechteck faellt daraus **exakt 5/6** heraus. Der Wert steht nirgends im
Code; dass er herauskommt, ist der Test, der belegt, dass die Definition stimmt.

**`κ === undefined` heisst SCHUBSTARR**, nicht „null Schubflaeche". Ein Profil
ohne tabellierte Schubflaeche rechnet lieber ohne Schubverformung, als dass hier
ein Naeherungswert erfunden wird.

Im Code steht je Form die geschlossene Formel — `S` ist auf jedem Abschnitt ein
Polynom zweiten Grades, `S²` also eines vierten, und das Integral ist geschlossen
angebbar. **Wo eine geschlossene Form vorliegt, wird nicht quadriert.** Die
numerische Integration lebt dort im Test (`tests/oracle.ts`) als unabhaengiges
Orakel fuer die Herleitungen.

> **Praezisiert am 2026-08-13.** Hier stand „es gibt **keine** Quadratur in
> `src/`". Das war zu weit gefasst: die Regel richtet sich gegen die
> **ueberfluessige** Naeherung einer Groesse, die man exakt hinschreiben kann,
> nicht gegen Numerik als solche. Sie verbietet damit nichts, was `src/warping/`
> tut — dort gibt es keine geschlossene Form, gegen die eine Quadratur antreten
> koennte ([ADR 0046](../../docs/adr/0046-the-solid-section-fe-lives-in-cross-section.md)).

## `idealisation` ist eine Angabe, keine Formeigenschaft

Ein Plattenbalken ist als Stahlbeton kompakt und als geschweisster Stahl-T
duennwandig: **dieselben vier Zahlen, zwei verschiedene κ.** Mit
IPE-80-Abmessungen kommen `solid → 0,401` und `thin-walled → 0,340` heraus (der
Katalog sagt 0,352; die Differenz ist die fehlende Ausrundung). 18 % Unterschied,
dem Ergebnis nicht anzusehen — deshalb **Pflichtfeld ohne Default**.

Nur `rectangle` traegt keins: ein duennwandiges Vollrechteck gibt es nicht.

Die Idealisierung wirkt auf **zwei** Groessen: κ und die **Spannungspunkte**.
Beide beantworten dieselbe Frage — „wie fliesst der Schub" —, und dieselbe Frage
darf nicht zwei Maschinen haben
([ADR 0029](../../docs/adr/0029-stress-points-follow-the-idealisation.md)). Bis
dahin steuerte sie nur κ; die Spannungspunkte verzweigten ausschliesslich ueber
`shape.kind`, und ein `thin-walled`-I bekam sein κ aus dem Wandweg (`Sy,max`
11,60 cm³) und seinen Schwerpunktpunkt aus dem Umrissmodell (11,25 cm³) — zwei
Antworten auf eine Zahl.

**Seit [ADR 0057](../../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)
liefert `solid` keine Spannungspunkte mehr**, sondern `undefined`. Das nimmt
ADR 0029 nichts: `idealisation` ist weiter die eine Weiche, sie hat auf der
`solid`-Seite nur nichts mehr zu waehlen. κ bleibt dort Grashof, und dass die
eine Groesse eine Naeherung behaelt und die andere ganz verschwindet, ist keine
Unstimmigkeit — eine Schubsteifigkeit MUSS der Balken haben, ein
Spannungspunkt muss nicht existieren.

**Bekannte Luecke:** `A`, `Iy`, `Iz`, `Iyz`, `ys` und `zs` werden weiterhin in
beiden Faellen exakt aus der Umrissfigur gerechnet — die klassische duennwandige
Naeherung (Mittellinie, `t³`-Anteil entfaellt) brauchen wir nicht, weil
geschlossene Formeln vorliegen.

Mit P5 wirkt `idealisation` auf eine **dritte** Groesse: `It`. Und dort ist der
Unterschied nicht klein, sondern der ganze Punkt — zwischen `⅓Σl·t³` und Bredt
liegen Zehnerpotenzen (beim Kasten `100×200`, `t = 8`: Faktor 181, und er
waechst, je duenner die Wand wird). Kompakt bleibt `It` **`undefined`**: dort
ist es die Loesung eines Randwertproblems, und eine der beiden Formeln zu raten
waere schlimmer als die Auskunft „nicht ermittelt".

### Die Waende der Spannungspunkte kacheln die Umrissfigur

Die duennwandigen Vorlagen zerlegen die Form in Rechtecke, die die Umrissfigur
**lueckenlos und ueberschneidungsfrei** ueberdecken — beim T Gurt `bf × hf` und
Steg `bw × (h − hf)`, beim I Steg ueber die LICHTE Hoehe
([ADR 0053](../../docs/adr/0053-the-stress-point-walls-tile-the-outline.md)).
Der Hebelarm bleibt die Mittellinie; nur die Wandgrenze verschiebt sich um
`t/2`. Dasselbe hat ADR 0051 fuer den Kasten getan.

**Der Schwerpunkt ist dabei kein freier Parameter.** Der Schubfluss muss am
freien Rand auf null schliessen, und das heisst `∫ z t ds = 0` ueber das
integrierte Modell — die Bezugsachse ist also der Schwerpunkt GENAU DIESER
Flaechenverteilung. Man waehlt nicht den Schwerpunkt, sondern die **Flaeche**;
und die muss dieselbe sein, aus der `A`, `Iy`, `W` und σ kommen. Kachelt die
Wandfigur, ist ihr Schwerpunkt `zs` per Konstruktion, und die Frage entfaellt.
Bis ADR 0053 lief `S` um `zsWall`, den Schwerpunkt des Mittellinienmodells; der
Versatz von 0,88 mm beim T 200/15/10/300 kostete an jedem Punkt 1,2 %.

**Was es kostet:** die Resultierende der Schubspannungen ist 0,967·Vz statt Vz.
Die fehlenden 3,3 % sind `τ_xz` im Gurt, das ein Wandmodell definitionsgemaess
nicht fuehrt — 2,10 N/mm² an der Gurtunterseite gegen 13,99 N/mm² `τ_xy` an
derselben Stelle, und an der Aussenfaser exakt null, weil die freie Oberflaeche
`τ_zx` verbietet. Der alte Zustand kam auf 1,006·Vz, aber ohne Deutung: `S` um
die eine Achse, `Iy` um die andere.

**κ behaelt die Mittellinie.** Die Schubflaeche ist ein Energieintegral ueber die
ganze Wand, und die `Az` des Profilkatalogs sind auf der Mittellinienabwicklung
definiert. Gekachelt liegt `Az` ueber alle 42 IPE- und HEA-Profile um +1,0 bis
+7,0 % ueber der Tabelle — ein geschweisstes I kann keine groessere Schubflaeche
haben als das gewalzte mit denselben Aussenmassen. Mit der Mittellinie sind es
−6,2 bis −3,5 %, immer zu klein, wie die fehlende Ausrundung es verlangt.
`tSectionWall` lebt deshalb weiter, mit einem Aufrufer statt zwei; `It` und `zM`
bleiben aus demselben Grund unberuehrt.

### Welcher Wert kommt aus welcher Figur — die Uebersicht

Bei `idealisation: 'thin-walled'` sind **drei** Figuren im Spiel. Jeder Abschnitt
oben begruendet ein Stueck davon; hier stehen sie nebeneinander, damit man es
nachschlagen kann, statt es sich zusammenzusuchen.

| | was sie ist | `A` und `zs` | Hebelarm einer Wand |
| --- | --- | --- | --- |
| **① Umriss** | das echte Polygon | exakt | — |
| **② gekachelte Wandfigur** | Rechtecke, die ① lueckenlos und ueberschneidungsfrei ueberdecken | **identisch mit ①** | Mittellinie der Wand |
| **③ Mittellinien-Wandfigur** | Linien von Wandmitte zu Wandmitte | ≠ ①, Ueberlappung am Knoten | Mittellinie der Wand |

② und ③ haben **dieselben Hebelarme** und unterscheiden sich nur in der
**Wandlaenge**: beim T ist der Steg 285 mm lang (②) oder 292,5 mm (③). Daran
haengt alles Weitere. Beim geschlossenen Kasten faellt der Unterschied fast weg,
weil dort die Umlauflaenge gleich bleibt und sich nur die Trennstelle um `t/2`
verschiebt — auf κ wirkt das mit 0,07 bis 0,17 %.

**Querschnittswerte:**

| Wert | aus Figur | braucht |
| --- | --- | --- |
| `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` | **①** | nur die Abmessungen |
| `yM`, `zM` | **③** — Schnittpunkt der Mittellinien | I und Kasten `h/2` (= Schwerpunkt), T `hf/2` (Gurtmittellinie) |
| `It` offen (I, T) | **③** — `⅓·Σ l·t³` ueber die Mittellinienabwicklung | I: `2b·tf³ + (h−tf)·tw³`; T: `bf·hf³ + (h−hf/2)·bw³` |
| `It` Kasten | Bredt, `A_m` aus **③** | `4A_m²/∮(ds/t)` mit `A_m = (b−t)(h−t)` |
| `kappaY`, `kappaZ` | `I` und `A` aus **①**, Weg aus **③** (Kasten: ②) | `A_s = I²/∫(S²/t)ds`; beim T zusaetzlich `zsWall` aus `tSectionWall` |

**Spannungspunkte:**

| Groesse | aus Figur | Bezugsachse | braucht |
| --- | --- | --- | --- |
| `y`, `z` | **①** | Schwerpunkt von ① | `zs`; Aussenfaser-Regel nach ADR 0052 |
| `t` | Wanddicke (② = ③) | — | I `tf`/`tw`, T `hf`/`bw`, Kasten `t` |
| `Sy`, `Sz` | **②** | **Schwerpunkt von ①** | `zs`; Hebelarm = Mittellinie der Wand |

Und daraus:

```
sigma = N/A + My·z/Iy + Mz·y/Iz      A, Iy, Iz aus ①
tau   = V·S/(Iy·t)                   S aus ②, Iy aus ①, t die Wanddicke
```

**MERKSATZ: Hebelarm immer Mittellinie. Wandlaenge ② fuer `S`, ③ fuer κ und
`It`.** Dass κ und die Spannungspunkte verschiedene Wandlaengen lesen, ist kein
Versehen — `S` an einem Punkt ist ein SCHNITT und muss das erste Flaechenmoment
der wirklichen Flaeche um die wirkliche Achse sein, κ ist ein ENERGIEintegral
ueber die ganze Wand und gegen einen Katalog geprueft, der auf ③ beruht. Die
Zahlen dazu stehen zwei Absaetze weiter oben und in
[ADR 0053](../../docs/adr/0053-the-stress-point-walls-tile-the-outline.md).

**Abhaengigkeitskette:**

```
Abmessungen
  ├─ tSectionCentroid / h/2           → zs  ──┬─→ A, Iy, Iz, Punktkoordinaten, sigma
  │                                           └─→ S der Spannungspunkte      (Figur ②)
  ├─ tSectionWall → zsWall, webLength ───────→ thinPaths → kappaY, kappaZ    (Figur ③)
  └─ direkt                           ───────→ It, zM                        (Figur ③)
```

`zsWall` hat damit genau **einen** Verbraucher, das κ des T, und kommt in den
Spannungspunkten nicht mehr vor.

## Parametrische Formen liefern Werte, keine Geometrie

`ShapeSpec` ist eine Bemassung, kein Umriss. Sollen die Formen spaeter
gezeichnet werden, kommt je Form ein `geometry()` dazu; die **Werte** bleiben aus
der Formel, sonst gaebe es zwei Rechenwege fuer dieselbe Zahl.

## Eingabesystem

`ys`/`zs` liegen im **Eingabesystem der jeweiligen Quelle**, und die beiden
Quellen haben verschiedene:

- **Parametrische Formen:** `y = 0` auf der Symmetrieachse, `z = 0` an der
  **Oberkante**. Damit ist `zs` die Zahl, die man von Hand nachrechnet — der
  Plattenbalken `bf=2,0 / hf=0,2 / bw=0,25 / h=0,5` hat `zs = 0,1395 m`.
- **Walzprofil:** das System der Tabelle, und das ist bereits
  schwerpunktsbezogen — `ys = zs = 0`.

Verwechseln kann man sie nicht, weil niemand beide mischt: `fem-section-resolve`
liest `ys`/`zs` gar nicht, und Spannungspunkt-Koordinaten sind **immer**
schwerpunktsbezogen.

Der Editor braechte „wie gezeichnet" als **drittes** System. Statt einer weiteren
Konvention steht dafuer eine **Invariante**
([ADR 0031](../../docs/adr/0031-the-cross-section-plane.md)):

> **`yM`/`zM` liegen im selben System wie `ys`/`zs`.**

## Hauptachsen: Pflicht, weil reine Algebra

`alpha`, `Iu` und `Iv` sind **Pflichtfelder**. Sie fallen aus `Iy`, `Iz` und
`Iyz` und sind damit fuer jede Quelle total — `undefined` waere bei einem IPE 300
keine Auskunft, sondern eine Unwahrheit. `alpha` zaehlt **positiv von `+y` nach
`+z`**, derselbe Drehsinn wie `Arc.sweep`; gegen Dlubal ist das Vorzeichen
gespiegelt, und gespiegelt wird **einmal**, in der Berichtsausgabe (dieselbe
Figur wie `phiY = −theta` in ADR 0005). Rider: `Iu ≥ Iv` und
`alpha ∈ (−π/2, +π/2]`.

**`alpha = 0` ist nichts, was eine Form hinschreibt**, sondern das Ergebnis fuer
eine AUFRECHTE Figur. Der Plattenbalken mit 2 m breitem Gurt hat `Iz > Iy`, seine
starke Achse liegt auf `z`, und `alpha` faellt auf `+π/2`. Ein
Charakterisierungstest haelt beide Faelle.

`Iyz === 0` kuerzt die Rechnung ab, und die Abkuerzung ist exakt: verschwindet
das Deviationsmoment, SIND `y` und `z` die Hauptachsen. **Seit P2 sind beide
Zweige in Gebrauch:** die parametrischen Formen und die Katalogzeile schreiben
eine literale `0` hin und bekommen `Iu === Iy` auf die letzte Stelle; der
gezeichnete Umriss liefert ueber Green ein allgemeines `Iyz` und laeuft durch
die allgemeine Formel — bei einer achsparallel gezeichneten Figur mit
`alpha ≈ 1e-17` statt `0`, was die richtige Antwort auf die gestellte Frage ist.
Ob **Hauptachsenlage** vorliegt, entscheidet deshalb nicht dieser Vergleich,
sondern das Gate mit `SectionPolicy.principalAxisTolerance`.

## Der Schubmittelpunkt, und wo er fehlt

`yM = ys` bei jeder Quelle: alle haben eine Symmetrieachse in y. `zM = zs` bei
`rectangle`, `i-symmetric`, `hollow-rectangle`, IPE und HEA — sie sind
doppeltsymmetrisch.

**Beim duennwandigen `t-section` ist `zM = hf/2`** — die Gurtmittellinie, und
das ist **exakt** und keine Naeherung: im duennwandigen Modell besteht das T aus
zwei Linien, beide gehen durch den Schnittpunkt von Gurt- und Stegmittellinie,
und um diesen Punkt hat jeder Wandzug den Hebelarm 0. Bis P5 stand hier
`undefined`, und Satz 4 des Gates feuerte damit bei JEDEM T. **Kompakt
(`solid`) bleibt es `undefined`**: dort gibt es keinen Wandzug, durch den das
Argument liefe.

## Der Wandweg: `Segment`, und was er liefert

> **`Segment` ist das POSITIONIERTE Wegstueck: Startpunkt, Richtung, Laenge,
> `t`, `wallId` — und KEIN `S`.**
> ([ADR 0040](../../docs/adr/0040-the-wall-path-is-positioned.md))

Das Wort war seit ADR 0030 und [`../TODO.md`](../TODO.md) §5 reserviert und ist
mit P5 vergeben. Die Abgrenzung, um die es dabei ging:

| Typ | Datei | lagelos? | wofuer |
| --- | --- | --- | --- |
| `Segment` | `src/calculation/wall-path/segments.ts` | **nein** — Startpunkt und Richtung | der Weg entlang der Wandmittellinien |
| `ShearFlowInterval` | `src/calculation/shear.ts` | **ja** — nur ein Stueck von `s` | die abgeleitete Energieform |

**Kein `S` im `Segment`**, und das ist die tragende Entscheidung: `Sy` und `Sz`
sind zwei verschieden parametrisierte Laeufe ueber DIESELBE Geometrie. Steckte
`S` darin, braeuchte eine Figur zwei Listen, deren Stationen korreliert werden
muessten. `shearArea` bleibt die eine Stelle, an der aus einem Weg eine Zahl
wird; `src/calculation/shear.ts` ist fuer P5 **unveraendert** geblieben.

**Boegen sind vor dem Weg weg**: `Bulge.toPolyline` unter `policy.discretisationTolerance`,
dieselbe Modellannahme wie in der Umriss-Ableitung. Jedes `Segment` ist damit
gerade und `S` darauf quadratisch. Die **geschlossene Form fuer Kreisboegen
bleibt additiv nachruestbar** — sie ersetzte die Zerlegung innerhalb von
`segments`, nicht den Typ, und nichts darueber zoege mit.

### Das Wandmodell ist intern und wird nie veroeffentlicht

`wallMoments(segments)` liefert `{ A, ys, zs, Iy, Iz, Iyz }` der
**Mittellinienfigur** — Linienelemente mal `t`, **ohne `t³/12`**. `S` wird immer
um DEREN Schwerpunkt aufsummiert; um jeden anderen Punkt schloesse der Weg am
freien Ende nicht auf null, und `S` waere zweideutig. `ys`/`zs` in
`SectionProperties` bleiben die der **Umrissfigur**; das Wandmodell ist eine
Rechenfigur und kein drittes Bezugssystem.

**„Nie veroeffentlicht" heisst: nicht im Barrel.** `src/index.ts` traegt weder
`wallMoments`/`WallMoments` noch `Segment`/`segments`, `wallPath`/`WallPath`
oder `cellCount`/`componentCount` — der ganze Rechenweg von P5 bleibt innen.
Nach aussen tragen ihn `SectionProperties` (κ, `yM`/`zM`, `It`) und die Befunde
des Gates (`MultipleCellsWarning`, `DisconnectedWallGraphWarning`,
`ThickWallWarning`). `Branch`/`branches` stehen weiterhin im Barrel: sie sind
seit ADR 0030/0037 die Zerlegung selbst und aelter als P5. Die Tests des
Wandwegs importieren aus `../src/…` und nicht aus dem Barrel — genau dafuer ist
die Trennung da.

### Zwei Figuren, mit je einem Grund

> ([ADR 0041](../../docs/adr/0041-two-figures-for-the-wall-path.md))

| Groesse | `S` aus | `I` aus | warum |
| --- | --- | --- | --- |
| κ | Wandmodell | **Umrissfigur** | nach aussen gebunden: so rechnet die Referenz, daran haengt die IPE-Reihe (ADR 0021) — es ist die bestehende Mischung aus `shapes/t-section.ts` |
| `yM`/`zM` | Wandmodell | **Wandmodell** | nach innen gebunden: `∫S·u_z ds = −I` gilt nur fuer EINE Figur; gemischt waere die Resultierende `V·I_wand/I_umriss` (IPE 300: rund 2 %) |

### Eine Zelle ja, zwei nein

`Zellen = E − V + C`, gezaehlt ueber die **Laeufe** (`cellCount`,
`componentCount` in `src/geometry/wall-graph/branches.ts`) — die zyklomatische Zahl ist gegen das
Unterteilen einer Kante unempfindlich, also lesen Gate und Wandweg DIESELBE
Zerlegung.

- `0` — Baumtraversierung von den freien Enden.
- `1` — die Zelle wird aufgeschnitten (ihr Anfangsknoten verdoppelt), und EINE
  skalare Verträglichkeit gibt zurueck, was der Schnitt weggenommen hat:
  `S₀ = − ∮(S_offen/t) ds / ∮(ds/t)`. Auf den Zellsegmenten ist `S₀` ein
  **konstanter Zuschlag auf `c0`** — deshalb bleiben `ShearFlowInterval` und
  `shearArea` unveraendert.
- `≥ 2` Zellen oder mehrere Teile — κ, `yM`/`zM` und `It` bleiben `undefined`,
  und das Gate meldet `MultipleCellsWarning` beziehungsweise
  `DisconnectedWallGraphWarning`. Zwei Zellen sind kein „eine mehr", sondern
  `n` gekoppelte Unbekannte — ein Gleichungssystem, und das ist offen
  (`packages/TODO.md`).

**Vorzeichen und Reproduzierbarkeit stehen fest:** Zellumlauf im Sinn
`signedArea > 0` (ADR 0034), `r = y·dz − z·dy` im Drehsinn `+y → +z`
(ADR 0031), **aufgeschnitten wird am Lauf mit der kleinsten Wand-Id**. Vor dem
ersten Schritt hat die Zellentraversierung nichts erreicht, alle Zellkanten
stehen also gleich — und Gleichstand entscheidet die Id, nicht die Stelle im
Eingabe-Array: sonst haette dieselbe Figur mit gedrehter Wandliste einen
anderen Schnitt. Wo geschnitten wird, aendert das Ergebnis nicht; `cutWallId`
in `WallPath` nennt den Ort, und zwei Tests halten beides fest — die Wahl und
ihre Folgenlosigkeit.

### `It`

```text
It = 4·A_m²/∮(ds/t) + ⅓·Σ_offen l·t³
```

Der zweite Term laeuft **nur ueber die offenen Zweige**: die Zellwandungen
tragen ihren Anteil bereits ueber Bredt, und ihn zweimal zu zaehlen waere
zwischen den beiden Termen ein Faktor von Zehnerpotenzen. `undefined` heisst
**nicht ermittelt** — bei jedem Vollquerschnitt, wo `It` weder `⅓Σl·t³` noch
Bredt ist, sondern die Loesung eines Randwertproblems.

**Der Katalog ist als `It`-Orakel ausgeschieden:** der Wandgraph eines IPE 300
kommt auf `15,70 cm⁴` gegen tabellierte `20,12` — die Ausrundung.
`profileProperties` reicht deshalb `profile.It` aus der Tabelle DURCH, statt es
zu rechnen. Die Orakel fuer den gerechneten Weg sind die geschlossenen
Ausdruecke der parametrischen Formen und zwei Handformeln (`tests/wall-path.test.ts`).

### Die Schranke des Wandwegs

```text
offener   Lauf:  t / L        L = Laenge der Mittellinie
geschlossener:   t / √A_m     A_m = von der Mittellinie umschlossen
```

Zwei Formeln, **eine** Schranke (`SectionPolicy.thickWallRatio`, Default `1/3`):
der geschlossene Lauf hat keine Laenge, an der zu messen waere, und sein Umfang
waechst bei gleicher Flaeche mit jeder Einbuchtung. Gemeldet wird an der
**Geometrie-Tuer** als `ThickWallWarning`, weil nur sie Marke und Gestalt
zugleich sieht. Belegt an beiden Enden: QRO 60×6,3 kommt auf `0,117` und
schweigt, ein Kasten `100×100` mit `t = 30` auf `0,43` und meldet sich.

## Das Gate: es warnt, es verweigert nicht

Zwei Tueren, weil zwei verschiedene Fragen
([ADR 0032](../../docs/adr/0032-the-cross-section-gate-warns.md)):
`validateSectionGeometry(g, policy)` prueft die gezeichnete Figur,
`validateSectionProperties(p, policy)` die Zahlen. **Kein `assertValid…`** — der
Querschnitt ist kein Tor vor der Rechenkette; wer ihn nicht rechnen kann, bekommt
`undefined` und damit einen Modellfehler im Bericht.

| Kanal | Inhalt |
| --- | --- |
| `errors` | nicht rechenbar: `t ≤ 0`, Nulllaengenwand, haengende `startNodeId`/`endNodeId`, leerer Umriss |
| `warnings` | rechenbar, **unter einer Annahme** — die vier Saetze |

| # | Ausloeser | Aussage |
| --- | --- | --- |
| 1 | `\|Iyz\| > tol · max(\|Iy\|, \|Iz\|)` | keine Hauptachsenlage — gilt nur, solange der Stab aus der Ebene gehalten wird |
| 2 | `\|yM − ys\| > tol · max(√(Iy/A), √(Iz/A))` | Querkraft durch den Schwerpunkt tordiert (`T = Vz·e`) |
| 3 | Knick am Bogen | Tangentialitaet gebrochen |
| 4 | `yM === undefined` | Schubmittelpunkt **nicht ermittelt** — Satz 2 ist ungeprueft |

Dazu kommen mit P5 **drei Befunde am Wandweg**, alle an der **Geometrie**-Tuer,
weil nur sie die Topologie sieht (ADR 0040) — und alle nur bei
`kind: 'midline'` mit `idealisation: 'thin-walled'`, denn `idealisation`
schaltet den Wandweg und nicht die Topologie (ADR 0029):

| Ausloeser | Befund |
| --- | --- |
| `≥ 2` Zellen | `MultipleCellsWarning` — ab zwei Zellen begaenne ein Gleichungssystem, und das ist offen |
| mehrere unverbundene Teile | `DisconnectedWallGraphWarning` — es gibt keinen Weg, auf dem der Schubfluss sich ausgliche |
| ein Lauf ueber `thickWallRatio` | `ThickWallWarning`, mit Lauf-Index, `wallIds`, Verhaeltnis und Schranke |

**`zM` bekommt keinen eigenen Satz**, und die Asymmetrie ist gewollt: im ebenen
Rahmen gibt es nur `N`, `Vz` und `My`, die Torsion kommt aus `yM − ys` allein.
Der Grund steht im JSDoc, sonst liest sie sich als Versehen.

Dazu kommen mit P2 drei Befunde am **Umlaufsinn** des mitgefuehrten Umrisses
([ADR 0034](../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)):
Material laeuft mit `signedArea > 0`, ein Loch mit `< 0`.

| Kanal | Ausloeser | warum |
| --- | --- | --- |
| `errors` | `Σ signedArea <= 0` (`NegativeOutlineAreaError`) | sonst gibt Green ein negatives `A` und `fem-section-resolve` daraus eine negative Steifigkeit — die einzige Fehlerrichtung, die den Loeser **still** kaputtmacht |
| `errors` | ein Ring mit `signedArea === 0` (`DegenerateOutlineRingError`) | entartet; traegt nichts bei und ist nie gewollt |
| `warnings` | ein Lochring in keinem Materialring (`UnnestedHoleWarning`) | rechenbar und bei zwei getrennten Vollflaechen legitim aussehend — die Lage, fuer die ADR 0032 warnt |

**Ausdruecklich nicht geprueft:** doppelte aufeinanderfolgende Punkte (tragen
zur Shoelace-Summe exakt null bei) und die **Selbstdurchdringung** — im
`midline`-Zweig liefert Clipper2 seit P3 ueberschneidungsfreie Ringe per
Konstruktion, im `outline`-Zweig bleibt sie offen, und die Drift-Pruefung faengt
sie nicht: ein sich selbst durchdringender Ring leitet zu sich selbst ab, die
Drift ist null.

**Satz 2 keyt allein auf `yM`**, nicht auf `(yM, zM)`: das ebene Stabwerk kennt
nur `Vz`, ein z-Versatz erzeugt darin keine Torsion. Andernfalls feuerte jeder
Plattenbalken.

**Die Knickschranke wird abgeleitet, nicht gesetzt:**
`notch = (t/2)·tan(theta/2)`, gewarnt wird bei `notch > discretisationTolerance`. Bei
`0,05 mm` heisst das `t = 6 → ≈1,9°`, `t = 20 → ≈0,57°`. Dass dicke Waende
weniger Knick vertragen, ist richtig — ihre Kerbe wird tiefer. Die Toleranz ist
ein **Parameter** und keine Konstante im Gate (ADR 0011); sie steht in der
`SectionPolicy`, die beide Tueren nehmen.

**Satz 1 vergleicht RELATIV**, mit `SectionPolicy.principalAxisTolerance`:
`|Iyz| > tol · max(|Iy|, |Iz|)`. Bis P2 stand hier der exakte Vergleich gegen
`0`, und der war richtig, solange jede Quelle eine literale `0` hinschrieb. Fuer
einen **gezeichneten** Umriss ist `Iyz` nie exakt null — ein achsparallel
gezeichnetes Rechteck liefert Gleitkommarauschen, und der exakte Vergleich
feuerte damit bei jedem symmetrisch gezeichneten Querschnitt. Bezogen wird auf
`max(|Iy|, |Iz|)` und nicht auf `Iy`, sonst schwiege die Frage ausgerechnet
dort, wo `Iy` klein und `Iz` gross ist. Damit ist die in P0 vorgezogene Policy
an beiden Tueren tatsaechlich in Gebrauch.

### Die Luecke bei `bulge` ist mit P3 geschlossen

Bis P2 sahen G1 bis G6 den Umriss, doppelte Ids, haengende Verweise, `t > 0`,
die Nulllaengenwand und den Knick — **nie die Woelbung selbst**. Ein `bulge` von
`NaN` lief still durch: die Knickpruefung rechnet `notch = NaN`, und
`NaN > discretisationTolerance` ist `false`, also schwieg sie. Fuer `t` prueft G4
ausdruecklich `Number.isFinite`; fuer `bulge` gab es die Entsprechung nicht.

P3 hat die Entscheidung erzwungen, weil es als erstes darueber stolpert: der
Wert laeuft ab jetzt in eine **fremde Bibliothek**, deren Ergebnis danach
*plausibel aussieht*. Das Gate meldet ihn als `NonFiniteBulgeError`, die
Ableitung liest ihn als Gerade und filtert ihn weg (ADR 0037).

**`Number.isFinite` ist dabei nur die halbe Frage**, und die zweite Hälfte hat
P3 zunächst offen gelassen: `bulge = 10^14` ist endlich und beschreibt trotzdem
einen fast vollen Kreis mit `2,5·10^15 mm` Radius durch zwei Punkte, die
`100 mm` auseinanderliegen. Seine Zerlegung unter `discretisationTolerance` verlangte
Milliarden Punkte — die Ableitung starb am Speicher, statt einen Umriss zu
liefern. Was `Bulge.isDiscretisable` verneint, liest sie jetzt ebenfalls als
Gerade, und das Gate meldet es als `UndiscretisableBulgeError`. Beide Zweige
halten sich daran: der Ringzweig ebenso wie der Wandzweig, denn das Gate leitet
für die Drift-Prüfung neu ab — ein Wurf dort machte aus dem Sammelbefund einen
Absturz.

**Beide Befunde gelten für BEIDE Eingabearten**, und deshalb tragen sie den Ort
als Feld: `at: BulgeSite` ist entweder `{ kind: 'wall', wallId }` oder
`{ kind: 'vertex', ringIndex, vertexIndex }`. Der Ring-Zweig hatte bis dahin
überhaupt keine Wölbungsprüfung — G6b sah nur `geometry.walls`, während
`Vertex.bulge` dieselbe Zahl mit derselben Bedeutung trägt (ADR 0030). Vier
Klassen für zwei Regeln an zwei Orten wären die Doppelung, gegen die
`DuplicateSectionIdError` schon über `SectionElement` geht statt über zwei
Namen. Am Ring läuft die Sehne zum **nächsten** Punkt, weil `bulge` der
abgehenden Kante gehört — genau der Kante, die `deriveOutlineFromRings` zeichnet.

Der Zeichenweg faengt ihn weiterhin ab: `cross-section-viewer` faellt bei einem
nicht endlichen `bulge` — und bei einem am Vollkreis-Pol, wo `4·atan(bulge)` auf
`2π` rundet — auf die Sehne zurueck, statt zu werfen. Das bleibt richtig: ein
Fehler des Gates haelt den Zeichenweg nicht auf, und ein kaputtes Modell soll man
SEHEN.

### Der gekappte Miter-Spitz

`MiterLimitExceededWarning`, an **durchverbundenen** Stoessen: die Umrissecke
liegt bei gleicher Dicke und dem Innenwinkel `α` um `(t/2)/sin(α/2)` neben dem
Knoten, und gekappt wird, sobald `1/sin(α/2) > policy.miterLimit`. Bei der
Voreinstellung `2` also unter `60°`. Warnung und kein Fehler — reale Bleche
werden abgeschnitten —, aber nie stillschweigend: ein Knotenblech unter `30°`
verloere sonst Flaeche, ohne dass irgendwer es gesagt haette. Dieselbe Figur wie
die Knickwarnung: eine aus einem Policy-Feld abgeleitete Schranke und ein Satz,
der sagt, was sie bedeutet.

Nur an durchverbundenen Stoessen, weil nur dort ueberhaupt eine Miter-Ecke
entsteht; welche das sind, sagt die Ableitung (`chainedJoints`) und nicht eine
zweite Rechnung im Gate. **Der Ueberstand wird GEMESSEN und nicht aus `α`
gerechnet** (ADR 0038): treffen zwei verschiedene Wandstaerken in einem fast
gestreckten Stoss aufeinander, laeuft der Miterpunkt laengs der Wand davon,
waehrend `α` nahe `π` bleibt — die alte Formel schwieg ausgerechnet dort, wo
gekappt wird. Bezug ist die halbe **dickere** Wandstaerke; bei gleicher Dicke
kommt dieselbe Zahl heraus wie vorher.

## `SectionPolicy`: die Erzeugungs-Einstellung

**Eigene Wurzel, keine Scheibe von `AnalysisPolicy`**
([ADR 0033](../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
ADR 0011 zieht seine Trennlinie an *„steuert die Rechnung, **ohne das Modell zu
aendern**"* — `discretisationTolerance` aendert es: der abgeleitete Umriss reist nach ADR
0030 im Satz mit, und seine Punktzahl haengt an der Toleranz.

Der zweite Satz von ADR 0033 — *„der Loeser truege eine Zahl mit, die er nie
liest"* — **gilt seit P5 nicht mehr**: der Wandweg liest `discretisationTolerance`, um
seine Bogenwaende zu zerlegen, und zwar unter derselben Toleranz wie der
mitgefuehrte Umriss (ADR 0040). Deshalb ist die Policy in `SectionModel`
(`@baustatik/fem-section-resolve`) ein Pflichtfeld.

Die volle Scheibenform nach dem Vorbild von `fem-loads/src/policy.ts`:
`SectionPolicy` · `SectionPolicyOverrides` · `DEFAULT_SECTION_POLICY` ·
`createSectionPolicy` · `parseSectionPolicy`. **Keine eigene `schemaVersion`** —
eine Version je Datensatz, und der Datensatz ist der Snapshot (`v7`, wo
`sectionPolicy` als **Pflichtfeld** auf Projektebene steht).

`DEFAULT_ARC_TOLERANCE` **zieht nicht um**: die Policy liest es aus
`@baustatik/section-geometry`. Es neu zu setzen brachte den Zustand zurueck, den
ADR 0032 beseitigt hat — zwei Zahlen fuer eine Modellannahme.

**Ein Feld hat den Namen gewechselt (Amendment zu ADR 0033):** `arcTolerance`
heisst jetzt `discretisationTolerance`. Der Name nennt die **Wirkung**, nicht
die Groesse — die Zahl steuert nicht nur Boegen, sondern die gesamte
Diskretisierung der Figur (ADR 0037, 0038); die Sehnenabweichung ist ihre
Einheit, nicht ihr Gegenstand. Die KONSTANTE behaelt ihren Namen:
`DEFAULT_ARC_TOLERANCE` zieht weiterhin mit. Im Snapshot-JSON und an allen
Policies/Uebergaben heisst das Feld unter dem neuen Namen.

**Fuenf Felder, und die Liste der datierten Kandidaten ist abgearbeitet:**

| Feld | Stand | aendert den Umriss | beurteilt ihn |
| --- | --- | --- | --- |
| `discretisationTolerance` — die Sehnenabweichung [mm] | seit P1 | **ja** | — |
| `principalAxisTolerance` — dimensionslos, `\|Iyz\| <= tol · max(\|Iy\|, \|Iz\|)`, Default `1e-9` | seit P2 | — | **ja** |
| `miterLimit` — dimensionslos, gekappt ab `1/sin(α/2) > miterLimit`, Default `2` | seit P3 | **ja** | — |
| `thickWallRatio` — dimensionslos, `t/L` offen bzw. `t/√A_m` geschlossen, Default `1/3` | seit P5 | — | **ja** |
| `shearCentreTolerance` — dimensionslos, relativ zum groesseren Traegheitsradius, Default `1e-6` | seit P5 | — | **ja** |

Die Spaltentrennung ist die Leitplanke, die die Policy davor bewahrt, zur
Sammelstelle zu werden: **Beurteilungsfelder werden allein vom Gate gelesen**
und stehen trotzdem hier, weil sie ueber den QUERSCHNITT urteilen und nicht
ueber die Rechnung — ADR 0033 zieht die Linie am Gegenstand. Sie stehen
ausserdem aus demselben Grund im Snapshot wie `discretisationTolerance`: derselbe Bericht
soll nach einer Aenderung der Software-Defaults nicht still andere Warnungen
zeigen.

`shearCentreTolerance` ist **weiter** als `principalAxisTolerance` (`1e-6` gegen
`1e-9`), weil `yM` beim gezeichneten Querschnitt aus ZWEI numerischen
Integrationen ueber zwei verschiedene Figuren faellt und `Iyz` aus einer.

`JoinType` stand in derselben Zeile wie das Miter-Limit und ist **kein Feld
geworden**: er ist auf Miter festgenagelt, weil `Round` jede Ecke des I-Profils
abrundete und die Identitaet `2·b·tf + tw·(h − 2·tf)` fiele (ADR 0037). Es gibt
keine zweite zulaessige Wahl, also auch keine Einstellung. **Ebenfalls kein
Feld: `OFFSET_PRECISION`** — es rastert den Rechenweg und nicht das Modell und
wohnt deshalb als Konstante in `@baustatik/geometry-2d`.

`miterLimit` ist **nach unten bei `1` begrenzt**, und die Schranke ist abgelesen
statt gewaehlt: Clipper2 ersetzt jeden Wert `<= 1` still durch `2`. Eine
Einstellung, die nicht wirkt und darueber schweigt, ist die eine Sorte Wert, die
der Eingang nicht durchlassen darf.

`principalAxisTolerance` ist **relativ und dimensionslos**, weil eine absolute
Schranke in m⁴ bei cm-grossen und m-grossen Querschnitten zwei verschiedene
Aussagen waere. Der Name nennt die **Frage** („liegt Hauptachsenlage vor"),
nicht die Groesse — dieselbe Figur wie `discretisationTolerance`. **Gelesen wird sie allein
vom Gate:** `principalAxes` bleibt total, rein und ohne Policy und liefert
`alpha ≈ 1e-17`, was die richtige Antwort auf die gestellte Frage ist; ein
Schnappen dort waere eine *Analyse*-Einstellung auf der Rechenstrecke (ADR
0011). `0` ist ein zulaessiger Wert und stellt den exakten Vergleich wieder her.

**Das sechste Feld ist `FEElements`**, und es ist eine DRITTE Sorte: es aendert
den Umriss nicht und beurteilt ihn nicht, es *erzeugt Zahlen, die im Satz
gespeichert werden*. `maxElementArea = A / FEElements` steuert die Netzdichte der
FE-Rechnung; relativ und nicht absolut, weil Querschnitte vom cm²- bis in den
m²-Bereich reichen. Gelesen wird es beim **Erzeugen** in
`@baustatik/cross-section-fe`, nie auf der Rechenstrecke — die Linie aus
ADR 0011/0033 haelt. **Es ist die einzige Stellschraube der FE-Rechnung: es gibt
keinen Konvergenzlauf** (ADR 0045).

**Ausdruecklich kein Kandidat: eine Quadraturordnung.** Sie waere von
`sectionProperties` gelesen, und das liegt auf der Rechenstrecke
(`getSectionStiffness`, je Stab in `solve()`/`check()`) — eine Einstellung dort
waere nach ADR 0011 eine *Analyse*-Einstellung. Sie wird ausserdem gar keine
Einstellung, sondern eine Konstante: bei senkrechten Kanten ist der Integrand
ein Polynom 6. Grades und 4-Punkt-Gauss exakt, und die FE des Vollquerschnitts
waehlt ihre 3 und 6 Punkte aus demselben Grund (ADR 0046/0047). Das ist
Konvergenz, keine Wahl. `FEElements` ist davon nicht betroffen und auch keine
Gegeninstanz: eine Netzdichte konvergiert nicht in endlich vielen Punkten gegen
ein exaktes Ergebnis.
**Die Knickschranke ist ebenfalls kein Feld** — sie wird aus `discretisationTolerance`
abgeleitet.

## Was `undefined` heisst

`sectionProperties` wirft nicht. `undefined` heisst „kenne ich nicht": ein
unbekannter `profile` oder unsinnige Abmessungen (nicht-positive Masse,
Wandstaerke groesser als die halbe Hoehe, Steg breiter als der Gurt) — und beim
gezeichneten Umriss eine Gesamtflaeche, die nicht echt positiv ist: verkehrt
herum gewickelt, oder das Loch groesser als das Material. Der Wert laeuft im
FEM-Strang durch den Port `getSectionStiffness`, und dort ist `undefined`
bereits der Vertrag fuer „Querschnitt unbekannt" — daraus wird ein Modellfehler
**im Bericht** statt einer Ausnahme mitten in `solve()`. Was daran im Einzelnen
falsch ist, sagt das Gate mit Namen.

**Beim Editor-Querschnitt heisst `undefined` an `kappaY`/`kappaZ`, `yM`/`zM`
und `It` dagegen „nicht ermittelt"** und nicht „nicht rechenbar": die Werte
stehen, die Schub- und Torsionsgroessen fehlen. Seit P5 ist das nur noch bei
`kind: 'outline'`, bei `midline` + `solid`, ab zwei Zellen und beim
unverbundenen Wandgraphen der Fall. Der Loeser rechnet dann `GAs: 'rigid'`, also
ohne Schubverformung — die steifere und damit unauffaelligere Richtung —, und
`check()` in `@baustatik/fem-solver` meldet es, wenn `shearDeformation: true`
eingestellt war (ADR 0035).

**`sectionProperties(cs, policy?)` nimmt seit P5 eine optionale Policy** — die
einzige Stelle im Package, an der sie optional ist. Gelesen wird daraus GENAU
EIN Feld, `discretisationTolerance`, und auch das nur beim gezeichneten Wandgraphen: der
Wandweg zerlegt seine Bogenwaende unter derselben Toleranz, unter der der
mitgefuehrte Umriss entstanden ist. Ein Querschnitt **ohne Bogenwand** ist von
der Zahl unberuehrt. Das ist eine bewusste Abweichung von ADR 0011 und in
`calculation/section-properties.ts` als solche vermerkt.

**Optional heisst nicht „darf auf der Rechenstrecke fehlen".** `SectionModel`
in `@baustatik/fem-section-resolve` fuehrt `sectionPolicy` als **Pflichtfeld**
und reicht es herein; der Snapshot traegt es seit `v7` ohnehin mit. Die
Voreinstellung ist fuer den gelegentlichen Aufrufer da, der ein Katalogprofil
oder eine parametrische Form fragt — beide sehen die Zahl nie. Setzte der
Resolver sie selbst ein, zerlegte er den **Weg** feiner oder groeber als den
mitgefuehrten **Umriss**, aus dem `I` faellt: zwei Diskretisierungen derselben
Figur, und der Unterschied stuende still in κ.

## Spannungspunkte: Regel statt Liste

> **Jede Vorlage enthaelt jede Stelle, an der `S` oder `t` springt oder ein
> Maximum hat — und legt die Koordinate dort in die RANDFASER.**

Die aeltere Fassung lautete „alle Ecken der Umrissfigur plus Schwerpunkt". Sie
beantwortete die falsche Frage, und zwar in beide Richtungen (ADR 0052):

- **`S` und `t` gehoeren zum SCHNITT.** Ein Schnitt durch den Gurt ist die
  senkrechte Linie durch die volle Gurtdicke. Ob man den Punkt an ihrem oberen
  oder unteren Ende benennt, aendert daran nichts.
- **Die KOORDINATE gehoert zu sigma**, und sigma ist ueber die Hoehe linear.
  Von zwei Punkten auf demselben Schnitt ist der mit dem groesseren `|z|` also
  immer der massgebende.

Daraus faellt beides: die Verschneidungsschnitte gehoeren auf die AUSSENfaser
des Gurts, und die Ecken an der Gurtunterseite koennen weg — gleiches `y`,
kleineres `|z|` als die Gurtspitze darueber. Dazu kommt der Punkt im STEG
unter dem Gurt, wo `tau` um `tf/tw` springt.

| Form | Punkte | |
| --- | --- | --- |
| `rectangle` | **—** | Vollquerschnitt, kein Schnittmodell (ADR 0057) |
| `t-section` (`thin-walled`) | **10** | 3 + 3 Gurt (Aussenfaser, zwei Elemente), 1 Stegoberkante, Schwerpunkt, 2 freies Stegende |
| `i-symmetric` (geschweisst, `thin-walled`) | **15** | 3 + 3 je Gurt (Aussenfaser, zwei Elemente), 2 Steganfang, Schwerpunkt |
| `hollow-rectangle` (`thin-walled`) | **16** | 4 Aussenecken + 8 Projektionen der inneren Ecken + **4 Wandmitten** |
| Walzprofil (IPE/HEA) | **15** | dieselbe Elementliste wie das geschweisste I |
| jede Form mit `idealisation: 'solid'` | **—** | `undefined` |

**Der Verzweigungsknoten traegt ZWEI Punkte** — gleicher Ort, gleiches `t`,
verschiedenes Wandelement
([ADR 0059](../../docs/adr/0059-the-branch-node-carries-two-stress-points.md)).
Deshalb sind es beim I fuenfzehn und beim T zehn. Ein Punkt weiss, auf welchem
Element er liegt (`wall`), und traegt genau EINEN Wert je Groesse; das Flag
`branched` ist damit ersatzlos entfallen.

**Geschweisstes und gewalztes I lesen dieselbe Elementliste**, und bei `r = 0`
tragen alle fuenfzehn Punkte dieselben Zahlen bis aufs letzte Bit — seit
ADR 0053 auch der Schwerpunkt.

Wo die Stellen stehen: `stress-points/open-stations.ts` (I und T),
`stress-points/hollow-stations.ts` (Kasten). Sie standen einmal fuer **beide**
Idealisierungen; seit ADR 0057 hat die Liste nur noch einen Leser.

Die Punkte **liegen**, wo die Regel sie hinsetzt; **ob** es sie gibt,
entscheidet die Idealisierung — dieselbe Angabe, die auch κ steuert:

| Form | `solid` | `thin-walled` |
| --- | --- | --- |
| `rectangle` | `undefined` | — (traegt kein `idealisation`) |
| `i-symmetric` | `undefined` | **Wandmodell** |
| `t-section` | `undefined` | **Wandmodell** |
| `hollow-rectangle` | `undefined` | **Wandmodell** |

**`solid` hat keine Spannungspunkte, und das ist keine Luecke, sondern die
Aussage** ([ADR 0057](../../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)):
`t` und `S` sind der Nenner eines SCHNITTMODELLS, und ein Vollquerschnitt hat
keins. Bis dahin stand hier das **Umrissmodell** — waagerechte Schnitte quer
durch die volle Figur, Grashof —, und es rechnete richtig im Rahmen seiner
Annahmen. Die Annahmen sind das Problem: die parametrische Eingabe ist nur eine
bequemere Schreibweise fuer eine gezeichnete Figur, und die gezeichnete
Vollfigur antwortet mit der FE. Zwei Wege zu derselben Figur, die verschiedene
Zahlen liefern, waeren zwei Maschinen fuer eine Frage.

**Grashof traegt dabei ZWEI Naeherungen, nicht eine** (ADR 0045/0047): er ist
ν-blind, UND er setzt die Schubspannung ueber die Schnittbreite konstant
(`τ = Q·S/(I·t)`). Am Uebergang Gurt/Steg eines T springt `t` um `bf/bw`, und
dort schlaegt das durch: **κ liegt +11 % bis +134 % ueber der FE**, gemessen an
vier T-Figuren in
[`docs/messungen/t-querschnitt-grashof-gegen-fe.md`](../../docs/messungen/t-querschnitt-grashof-gegen-fe.md),
und immer auf der steifen Seite. Beim Rechteck sind es 0,08 %.

**κ bleibt trotzdem bei Grashof**, und die Luecke bleibt offen
(`packages/TODO.md`). Die beiden Groessen laufen hier auseinander, weil sie
verschieden dringend sind: eine Schubsteifigkeit MUSS der Balken haben — sie
wegzulassen hiesse schubstarr, also ein anderes Modell —, ein Spannungspunkt
muss nicht existieren, und `undefined` ist eine Antwort, die die Aufrufseite
seit jeher traegt. Dazu ist κ ein Energiemittel ueber den ganzen Querschnitt,
der Spannungspunkt dagegen eine ORTLICHE Behauptung, und zwar genau dort, wo die
Annahme „τ konstant ueber die Breite" am haertesten scheitert.

Im Wandmodell tragen die Punkte `t` und `S` aus der Wandabwicklung. Am Gurt
heisst das `t = tf` statt `t = b`: der Schubfluss laeuft **laengs** der Wand,
die senkrechte Komponente durch den ganzen Gurt bedeutet dort nichts.

Der Punkt im Steg unter dem Gurt traegt im Wandmodell **genau den Gurt** — nicht
mehr. Den Stegweg bis dorthin zu verfolgen zaehlte das Stueck zwischen
Gurtmittellinie und Gurtunterkante ein zweites Mal; das ist dieselbe Ecklücke,
die beim Kasten `t³/8` heisst (ADR 0051).

Was die Regel erledigt: beim **T-Querschnitt mit breitem Gurt** kann die
Nulllinie *im Gurt* liegen (`bf=2,0 / hf=0,2 / bw=0,25 / h=0,5` → `zs = 0,1395`
bei `hf = 0,2`). „Schwerpunkt" trifft das ohne Sonderfall; „Mitte Steg" haette
den Punkt an die falsche Stelle gesetzt. Der Punkt sitzt dort am Steg und
traegt `t = bw`, denn im Wandmodell ist der Gurt eine Linie — einen waagerechten
Schnitt durch ihn gibt es nicht. `zs > hf/2` gilt immer, solange es unter dem
Gurt ueberhaupt einen Steg gibt.

Dass beide I-Vorlagen die Gurtunterseiten-Ecken auslassen, ist eine
**begruendete Ausnahme**: bei homogenem Querschnitt koennen sie nie massgebend
werden (gleiches `y`, kleineres `|z|` als die Gurtspitze darueber).

**Die Nummerierung faellt aus der Laufreihenfolge, und sie ist kein Vertrag
mehr** (ADR 0059). Bis dahin war sie einer: der gedruckte Ausdruck fuehrt
„S-Punkt Nr. 1…13" (1–5 oberer Gurt von links, 6–10 unterer, 11/12 Steganfang,
13 Schwerpunkt), und beide I-Vorlagen uebernahmen sie unveraendert. Seit der
Knoten zwei Punkte traegt, geht das nicht mehr; die Zuordnung
`gedruckte Nr -> unsere Nr` steht als 13-zeilige Tabelle im Test.

`nr` bleibt die **Identitaet** eines Punktes — eindeutig je Liste, Grundlage
der Symbol-Id im Viewer und des `data-nr` im Demo. Was sie nicht mehr ist: eine
Absprache mit einem Dokument ausserhalb des Repositories.

`t` ist die **massgebende** Breite: an einer Sprungstelle (Gurtunterkante) gilt
die **kleinere** der beiden, weil die Schubspannung dort nach oben springt. Die
groessere zu nehmen hiesse, die Spitze wegzurechnen, um die es an diesem Punkt
geht.

### Die Vorzeichen: jede Wand ein Element

> **`Sy` und `Sz` sind das erste Flaechenmoment des in `+s` BEREITS
> DURCHLAUFENEN Teils, und `+s` ist die Tangente, die der Punkt selbst traegt
> (`ty`, `tz`). Das Vorzeichen ist gerechnet, nicht gesetzt.**
>
> **Jede Wand ist ein ELEMENT mit einer eigenen Laufrichtung, und die Richtung
> ist die des Schubflusses aus einem positiven `Vz`** (ADR 0059). Ein Punkt
> nennt sein Element (`wall`) und traegt genau einen Wert je Groesse.

Der Grund ist nicht Ordnungsliebe: die Schubspannung im duennwandigen
Querschnitt ist ein **Schubfluss `q = tau*t` LAENGS der Wand**, also ein Skalar
bezueglich einer Laufkoordinate. Beide Querkraefte erzeugen einen Fluss laengs
DERSELBEN Tangente, und deshalb ist ihre Ueberlagerung eine gewoehnliche
vorzeichenrichtige Addition:

```
q = -(Vz*Sy/Iy + Vy*Sz/Iz),   tau = q/t,   Richtung = (ty, tz)
```

Ohne Richtung gaebe es nur zwei Auswege, und beide taugen nicht:
`sqrt(tau_Vz² + tau_Vy²)` behandelt zwei Komponenten DERSELBEN Richtung als
orthogonal, `|tau_Vz| + |tau_Vy|` ist eine Schranke statt einer Spannung. Und
spaetestens mit `Mt` geht es gar nicht mehr: Bredt liefert einen UMLAUFENDEN
Fluss `q_T = Mt/(2*Am)`, und ob er sich auf einer Wand addiert oder aufhebt,
steckt ausschliesslich im relativen Vorzeichen
([ADR 0058](../../docs/adr/0058-the-stress-point-carries-a-wall-tangent.md)).

Die Laufrichtungen stehen in den **Stellenlisten**, nicht in den Vorlagen:

| Element | `+s` |
| --- | --- |
| Obergurt links / rechts | `(+1, 0)` / `(-1, 0)` — von der Spitze zum Knoten |
| Steg | `(0, +1)` |
| Untergurt links / rechts | `(-1, 0)` / `(+1, 0)` — vom Knoten zur Spitze |
| Kasten | ein Umlauf; die Reihenfolge der Liste **ist** er (Tangente entgegen der Nummerierung) |
| Kasten, Aussenecke | die **Winkelhalbierende** — der Umlauf laeuft ueber die Gehrung glatt durch |

Daraus faellt das bekannte Bild: `q = -Vz*Sy/Iy` ergibt beim I Obergurt von
beiden Spitzen zum Steg, Steg nach unten, Untergurt vom Steg zu den Spitzen;
beim Kasten Obergurtmitte nach aussen, beide Stege hinunter, Untergurt von den
Ecken zur Mitte. Zwei **Gleichgewichtsproben** halten es fest: der Steg des I
traegt 96,9 % von `Vz`, die beiden Gurte 99,9 % von `Vy`, die beiden Stege des
Kastens zusammen 97,5 % von `Vz`. Der Rest auf 100 % ist der Modellfehler des
Wandmodells (keine Schubkomponente QUER zur Wand), nicht die Vorzeichenfrage.
Ein Feld aus Betraegen besteht diese Probe nie.

**Der Verzweigungsknoten.** Am Gurtpunkt auf der Stegachse (I: 3/4 und 9/10,
T: 3/4) laufen die beiden Gurtfluesse aus `Vz` aufeinander zu. Dort stehen
deshalb **zwei Punkte**, je einer auf dem linken und dem rechten Gurtelement:
gleiches `Sy`, entgegengesetztes `Sz`, entgegengesetzte Tangenten (ADR 0059).

Bis dahin stand dort EIN Punkt mit einem Flag (`branched`) und der Anweisung,
`|q| = |Vz*Sy/Iy| + |Vy*Sz/Iz|` zu bilden. Das ist exakt, solange die beiden
Aeste `+S` und `-S` sind — also nur bei Spiegelsymmetrie zur `z`-Achse. Bei
ungleichen Aesten sind es zwei unabhaengige Zahlen mit `S1 + S2 = S_ab`, und
die Betragsformel am gespeicherten Ast kann den anderen **unterschaetzen**. Die
drei Vorlagen sind symmetrisch, das Flag war dort also nicht falsch — es trug
seine Gueltigkeit nur in einer Voraussetzung, die es nicht aussprach. Zwei
Punkte je Knoten haben dieses Problem in keiner Topologie.

Ein Nachweis nimmt jetzt das **Maximum ueber die beiden Punkte**, und das ist
ein gewoehnliches Maximum ueber eine Liste ohne Sonderfall.

**Und der gedruckte Ausdruck?** Er ist in beiden Faellen stimmig, und wir
folgen ihm in beiden. Beim **Kasten** fuehrt er einen einzigen Umlauf; unser
Feld war bis auf ein GLOBALES Vorzeichen dasselbe, und ein globales Vorzeichen
ist die Wahl der Laufrichtung. `hollowStations` legt sie so, dass die Referenz
Zeichen fuer Zeichen stimmt. Beim **gewalzten I** ist die Konvention je
ELEMENT geschrieben — und mit der Elementorientierung stimmen auch dessen
dreizehn gedruckte Werte Zeichen fuer Zeichen (ADR 0059).

ADR 0058 hatte dem Katalogblatt noch vorgeworfen, sich zu widersprechen (`Sy`
von der naechsten freien Spitze, `Sz` durchgehend von links), und wich an drei
Punkten (**4, 7, 8**) davon ab. Das waren exakt die drei Stellen, deren Element
anders orientiert ist als das globale `+y`, das die damalige Fassung fuehrte.
Die BETRAEGE stimmten immer.

### Was geprueft ist, und eine bekannte Abweichung

Der Walzprofil-Zweig integriert die **Ausrundung** — die fummeligste Rechnung
des Packages. Belege:

- `A` und `Iy` aus `h, b, tw, tf, r` treffen die Tabelle jedes der 42 Profile
  auf **0,05 %**.
- `Sy` im Schwerpunkt trifft den Tabellenwert `SyMax` auf **0,05 %**, und
  `2·SyMax = Wpl,y` (in `steel-profiles` geprueft) belegt unabhaengig, dass die
  Tabelle sich selbst treu ist.
- Alle 546 Referenzpunkte stimmen auf **0,7 %** — bis auf zwei.

**Die gedruckten Punkte 3 und 8** (Gurtmitte, bei uns 3 und 9) weichen um bis
zu **2,8 %** ab, und der Grund ist nicht gefunden. Unser Wert ist das erste
Flaechenmoment des halben Gurts, `b/2 · tf · (h−tf)/2`; dieselbe Formel stimmt
an den gedruckten Punkten 2 und 4 auf 0,45 %. Der
Unterschied ist weder ein fester Anteil der Ausrundung noch eine Funktion von
`r/tf`. Ein Test haelt die Spanne als **Charakterisierung** fest, damit ein
spaeterer Erklaerungsversuch merkt, wenn er sie aendert.

Dass die Toleranz gegen die Fixture bei 0,7 % und nicht bei 0,3 % liegt, ist
kein Zugestaendnis an unsere Rechnung: die Referenz widerspricht **sich selbst** um bis
zu 0,56 % (Spannungspunkt 13 gegen das eigene `Sy,max`, HEA 260) und druckt
spiegelbildliche Punkte verschieden (IPE 220: 119,44 gegen 119,73).

### Der geschlossene Kasten: die Ausnahme von „und der Schwerpunkt"

Er stand lange auf `undefined`, und der Grund waren die **Referenzdaten, nicht
die Theorie** — den umlaufenden Weg hat `closedBoxPath` in
`shapes/hollow-rectangle.ts` seit jeher, und κ faellt daraus. Die Referenz ist
jetzt da: die Dialoge zu **TO 300/200/10** und **TO 400/200/10**, abgeschrieben nach
`tests/fixtures/hollow-rectangle-stress-points.json`. **Zwei** Querschnitte, weil eine
Vorlage, die nur an ihrem eigenen Referenzfall stimmt, angepasst und nicht
gerechnet ist.

**Sein Schwerpunkt liegt im Loch**, dort gibt es kein Material und damit keine
Spannung. An seine Stelle treten die **vier Wandmitten** — genau die Stellen, an
denen `S` sein Maximum hat, aus demselben Grund, aus dem es beim Vollrechteck
auf halber Hoehe sitzt. Von den acht Ecken der Umrissfigur stehen die vier
**aeusseren** als Punkt; die vier inneren stehen als ihre je zwei Projektionen
auf die Aussenflaechen. Das ist keine Auslassung: die innere Ecke liegt
ueberhaupt nicht auf einer Wandflaeche, und ihre `y`- und `z`-Stelle stehen an
den Projektionen schon. Der Umlauf steht einmal, in
`stress-points/hollow-stations.ts`.

**Der Startschnitt kommt aus der Symmetrie, und er ist je Richtung ein
anderer.** Ein geschlossener Querschnitt hat keinen freien Rand, an dem `S = 0`
waere: fuer `Vz` steht der Schubfluss in **Gurtmitte** still, fuer `Vy` in
**Stegmitte**. Punkt 4 hat also `Sy = 0`, Punkt 8 `Sz = 0`, und keiner der
sechzehn hat beides — die Selbstpruefung des Weges, so wie beim T das freie
Stegende.

**Die Laufkoordinate ist die Projektion auf die Wandmittellinie, und sie endet
am Knoten.** Punkt 2 liegt bei `y = b/2`, die Gurtmittellinie endet aber bei
`(b−t)/2`; der Punkt sitzt im **Eckblock**, in dem sich die beiden Waende
ueberlagern. Genau deshalb ist die Ecke eindeutig: vom Gurt aus ist ihr Wert
`zm·t·ym`, vom Steg aus `ym·t·zm` — dieselbe Zahl.

**Die Waende parkettieren die Umrissfigur, sie liegen nicht auf der
Mittellinie** ([ADR 0051](../../docs/adr/0051-the-closed-box-tiles-the-outline-figure.md)).
Je Schubrichtung eine Zerlegung, beide lueckenlos und ueberschneidungsfrei:

| | Wand QUER zur Schubrichtung | Wand LAENGS dazu |
| --- | --- | --- |
| `Sy` | Gurt, bis zur **Aussenkante** `b/2` | Steg, **lichte** Hoehe `h/2 − t` |
| `Sz` | Steg, bis zur **Aussenkante** `h/2` | Gurt, **lichte** Breite `b/2 − t` |

Der Hebelarm bleibt die Mittellinie, und die Umlauflaenge aendert sich nicht:
`b/2 + (h/2 − t)` ist dasselbe wie `(b−t)/2 + (h−t)/2`. Es verschiebt sich nur
die Trennstelle, um `t/2`.

**Damit ist `S` an allen zwoelf Wandpunkten exakt**, nicht genaehert. Das reine
Mittellinienmodell war es nicht: es zaehlt an jeder Ecke das innere
Viertelquadrat `t/2 × t/2` doppelt und laesst das aeussere weg. Die Flaeche
geht dabei auf — deshalb stimmte `A` exakt und nichts sah falsch aus —, das
erste Flaechenmoment nicht: pro passierter Ecke fehlten `t³/8`, bei `t = 10`
also 0,125 cm³, und immer in dieselbe Richtung.

Gegen die Ausdrucke heisst das: an den Wandmitten treffen wir die Referenzzahl
(375,50 / 230,50), und an den Gurtstationen treffen wir den geschlossen
hinschreibbaren Wert. Der ist dort besonders hart: zwischen der Null bei
`y = 0` und dem Schnitt bei `y = 90` liegt **reiner Gurt**, ein Rechteck
90 × 10 mit Schwerpunkt `z = −195`. Es wird keine Ecke passiert, also kann die
einzige Modellentscheidung des Verfahrens — wo der Gurt endet, irgendwo in
`90 < y < 100` — diesen Wert gar nicht erreichen. Beide Modelle drucken hier
175,500, und taten das immer.

**Was der abweichende Referenzwert 175,54 ist, wissen wir nicht.** Seine Abweichungen spiegeln sich
sauber zwischen `Sy` und `Sz` (+0,04 / −0,013 / −0,03 / 0,00 laengs des
Umlaufs), sind also systematisch und kein Abschreibfehler; sein Eckzuwachs
P3 → P1 ist 19,43 statt der exakten `10 × 10 × 195 = 19,50`. Ob dahinter eine
andere Eckkonvention steht, eine diskretisierte Wandkette oder ein aus einer
2D-Schubloesung zurueckgerechnetes `S = τ·I·t/V` — dann waere es nicht einmal
dieselbe Groesse —, ist aus vier Zahlen nicht zu entscheiden. Behauptet wird
hier nur das Enge: **unser Wert ist fuer unsere Definition exakt.** Ein
Charakterisierungstest haelt die Groesse der Luecke fest.

**Die Aussenecke ist kein Wandschnitt**, sondern eine GEHRUNG: dort stossen zwei
freie Flaechen zusammen, und der kuerzeste Weg durchs Material geht zur
Innenecke. Der Ausdruck `S = t·(a·c − a·t/2 − c·t/2 + t²/3)` ist in `a = b/2`
und `c = h/2` symmetrisch — von der Gurt- und von der Stegseite kommt dieselbe
Zahl, und `Sy = Sz` bleibt an der Ecke erhalten. `t` bleibt dort die
Wandstaerke, obwohl der Gehrungsschnitt `t·√2` lang ist: die kleinere Breite
ist die massgebende, und an der konvexen Aussenecke ist der wahre Schubfluss
ohnehin null.

**OFFENE LUECKE: der GEZEICHNETE Kasten folgt nicht.** `calculation/wall-path/`
rechnet weiter Mittellinie, derselbe Kasten auf zwei Wegen eingegeben
unterscheidet sich deshalb:

```text
100 × 200 × 8:   kappaZ = 0,6238 (Wandgraph)  gegen  0,6226 (Form)  — 0,19 %
```

`tests/wall-path.test.ts` hat hier Gleichheit behauptet und haelt die Luecke
jetzt mit Zahl fest. Die Uebertragung scheitert nicht am Prinzip, sondern an
den beliebigen Winkeln und Dickenspruengen des Graphen: dort ist der Eckblock
kein Quadrat, und die Korrektur haengt vom Gehrungswinkel ab. Die Geometrie
dazu hat `geometry/outline/miter-joints.ts` (ADR 0038); der Schubweg liest sie
heute nicht.

**Wer die beiden Tabellen uebereinanderlegt, sieht ab Punkt 5 andere
Vorzeichen** — und das ist keine Abweichung. Das Vorzeichen eines Umlaufmodells kodiert die
**Umlaufrichtung**: `Sy` kippt zwischen linkem und rechtem Steg, `Sz` zwischen
oberem und unterem Gurt, weil der Umlauf sie in entgegengesetzter Richtung
durchlaeuft. Wir fuehren die Konvention der parametrischen Formen (Teil oberhalb
bzw. links, durchweg ≤ 0). Verglichen werden deshalb **Betraege**; ein Test
haelt fest, an welchen sieben Nummern je Richtung das Referenzmodell spiegelt.

In **Stegmitte fielen die beiden Modelle zusammen**, wo es darauf ankam: der
waagerechte Schnitt trifft beide Stege (`S` doppelt, `t = 2t`), das Wandmodell
fuehrt den Fluss durch einen (`S` einfach, `t`) — `S/t` und damit τ war
dieselbe Zahl, seit ADR 0051 sogar exakt dieselbe. Der kompakte Zweig ist mit
ADR 0057 weg; der Befund bleibt als Beleg dafuer stehen, dass die Vorlage die
Figur richtig getroffen hat.

**Was wir nicht rechnen:** Die Referenz fuehrt drei weitere Spalten —
die Woelbordinate ω, das Woelbflaechenmoment `Sω` und die **Kernflaeche `A*`**.
`A*` ist die von der Mittellinie umschlossene Flaeche `(b−t)(h−t)` (hier
551,00 cm²), der Nenner der Torsionsschubspannung `τ_t = M_t/(2·A*·t)` nach
Bredt. Wir bilden dieselbe Groesse zweimal — im `It`-Ausdruck von
`hollowRectangle` und als `Am` in `wall-path/torsion.ts` —, geben sie aber
nirgends heraus: `StressPoint` fuehrt sie nicht. Die Abschrift der Fixture
enthaelt alle drei Spalten trotzdem, damit die Referenz vollstaendig ist.

### Das Orakel der duennwandigen Vorlagen: `r = 0`

Ein geschweisstes I ohne Ausrundung **ist** das gewalzte Profil mit `r = 0`. Die
duennwandige I-Vorlage erbt damit die Gueltigkeit der 546 validierten Punkte,
ohne eine neue Fixture zu kosten — und seit ADR 0053 an **allen fuenfzehn
Punkten**, auf Gleitkommarauschen genau, ohne Umrechnungstabelle.

Bis dahin galt es nur an zwoelfen: `rolled-i.ts` fuehrt seinen Steg ueber die
**lichte** Hoehe `h/2 − tf`, das Wandmodell lief von Gurtmitte zu Gurtmitte
(`±zf`) — 11,25 gegen 11,60 cm³ bei IPE-80-Massen. Das war kein Unterschied
zweier Idealisierungen, sondern eine doppelt gezaehlte Gurthaelfte; die Naehe
der 11,60 zum Katalogwert 11,61 war Zufall (die Ausrundungen des **gewalzten**
Profils tragen 0,361 cm³, die Doppelzaehlung 0,357). Jetzt kacheln beide
Vorlagen, und der Schwerpunkt braucht keine eigene Referenz mehr.

Ueber den ganzen Katalog liegt die Vorlage **immer** unter der Tabelle, um 2,7 %
(HEA 1000) bis 5,8 % (HEA 260) — dieselbe Signatur wie bei κ, wo `Az` ebenfalls
immer zu klein ist. Das ist das fehlende Ausrundungsmaterial, und es fehlt
gleichgerichtet.

## Fixture aus dem Nachbarpackage

`tests/fixtures/rolled-i-stress-points.json` wird von
`packages/steel-profiles/scripts/extract.ts` erzeugt — einmalig, kein
Build-Schritt. Sie liegt hier, weil sie das **Orakel** fuer die Rechnung dieses
Packages ist und nicht Teil des Katalogs.

`tests/fixtures/hollow-rectangle-stress-points.json` ist der geschlossene Kasten, und sie
ist **von Hand abgeschrieben** — aus einer Querschnittsreferenz, nicht aus der
Katalogdatenbank. Der Unterschied gehoert dazu: kein Skript erzeugt sie neu,
also ist die Abschrift selbst die Fehlerquelle. Sie fuehrt deshalb alle Spalten
der Referenz, auch die drei, die dieses Package nicht rechnet.

## Beispiele statt Prosa fuer die Aufrufseite

`examples/` erzeugt jede Querschnittsart einmal und druckt Querschnittswerte,
κ und Spannungspunkte:

```text
pnpm --filter @baustatik/cross-section example
```

Es sind **keine Tests** — sie behaupten nichts. Sie zeigen die Aufrufseite,
also wie ein `CrossSection` entsteht und was die beiden Tueren darauf
zurueckgeben, einschliesslich der Faelle, in denen das `undefined` ist. Die
Zusicherungen stehen in `tests/`, und der Ordner haengt an `typecheck`, damit
ein Beispiel nicht unbemerkt veraltet. Details in
[`examples/README.md`](examples/README.md).

## Domaenensprache

- **Teilflaeche** ist das Stueck konstanter Breite, aus dem die kompakten
  Schubwege zusammengesetzt sind — im Code `Part` (`extent`). Bis ADR 0057 stand
  daneben `OutlinePart` (`from`/`to`) fuer die kompakten
  Spannungspunkt-Vorlagen; die gibt es nicht mehr. Der Begriff steht so in
  der Literatur: „das statische Moment der Teilflaeche mal Abstand
  Teilschwerpunkt bis Gesamtschwerpunkt". Er behauptet **keine Gestalt**, und das
  ist der Punkt — der Gurt eines I ist flach und breit, der Steg hoch und schmal
  (183 von 200 mm in EINEM Eintrag), und die Breite darf eine **Summe ueber
  getrennte Bereiche** sein (`2*tf`, wenn ein senkrechter Schnitt beide Gurte
  trifft). Nicht „Band" (kein Fachbegriff), nicht „Streifen" (das ist Hillerborgs
  Plattenverfahren) und nicht „Lamelle": die Lamelle ist im Stahl- und Betonbau
  das aufgeschweisste bzw. aufgeklebte Blech.
- **`ShearFlowInterval`** (`calculation/shear.ts`) ist ein Stueck des Schubflusswegs: ein
  Intervall der Laufkoordinate `s` mit konstanter Dicke `t`, auf dem `S(s)`
  quadratisch ist. **Intervall und nicht Segment**, weil der Typ LAGELOS ist —
  `pathZ` des I-Profils benutzt dasselbe Gurtobjekt viermal, ein Ort liesse sich
  daraus nicht ablesen. `Segment` ist damit frei und bleibt fuer das
  **positionierte** Wegstueck reserviert, aus dem kappa und die Spannungspunkte
  einmal gemeinsam fallen sollen ([`../TODO.md`](../TODO.md)). Auch nicht
  `ShearEnergyInterval`: `integral S²/t ds` ist mit `L⁶` eine rein geometrische
  Groesse — die Schubenergie ist das Prinzip hinter der Formel, keine Einheit,
  die der Typ traegt. Die Literatur hat fuer dieses Stueck kein eigenes Wort;
  sie integriert abschnittsweise und beschriftet „Bereich I, II, III".
- **`Segment`** (`calculation/wall-path/segments.ts`) ist das **positionierte** Gegenstueck dazu:
  Startpunkt, Richtung, Laenge, `t`, `wallId`. Seit P5 vergeben, und ohne `S` —
  `Sy` und `Sz` sind zwei Laeufe ueber dieselbe Geometrie (ADR 0040). Ein
  `SegmentRun` ist ein `Branch` samt seinen Stuecken.
- **Wandmodell** heisst im Zusammenhang mit `wallMoments` die Figur der
  **Mittellinien** (Linienelemente mal `t`, ohne `t³/12`) — dieselbe
  Gegenueberstellung wie bei den Spannungspunkten, nur mit Zahlen statt mit
  Punkten. Ihr Schwerpunkt ist **intern**: `ys`/`zs` in `SectionProperties`
  bleiben die der Umrissfigur.
- **`It`** ist das Torsionstraegheitsmoment und wird nicht uebersetzt.
  **`A_m`** ist die von der Mittellinie umschlossene Flaeche der Zelle — der
  Name ist der der Bredtschen Formel.
- **Umrissmodell** und **Wandmodell** sind die beiden Antworten auf „wie fliesst
  der Schub", und `idealisation` waehlt zwischen ihnen. Sie unterscheiden sich in
  der **Figur**, die den Schub traegt: das **Umrissmodell** schneidet quer durch
  die volle Umrissfigur, das **Wandmodell** (`stress-points/thin.ts`) laesst den
  Schubfluss laengs der Wandmittellinien laufen. Beide sind **Modelle**, keine
  Verfahrensnamen und keine Maschinen.

  **Das Umrissmodell hat ZWEI MASCHINEN**: Grashof als Naeherung
  (`calculation/shear.ts`, fuer die parametrische Form) und die FE als exakte
  Rechnung (`@baustatik/cross-section-fe`, fuer die gezeichnete Figur). Dieselbe
  Frage, zwei Antworten — eine bekannte, offene Luecke, gemessen und in
  `packages/TODO.md` verzeichnet (ADR 0045/0047). **Bei den Spannungspunkten ist
  sie seit ADR 0057 geschlossen**, indem die Naeherung dort gar nichts mehr
  liefert; fuer κ steht sie weiter offen. Ein `stress-points/outline.ts` gibt es
  deshalb nicht mehr.
- **`FESectionValues`** ist der FE-Anteil des Satzes: `It`, der Schubmittelpunkt
  und κ als Koeffizientenpaar. **KEINE Materialzahl, KEIN ν** —
  `1/κ = d0 + d2·m²` mit `m = ν/(1+ν)`, und ν setzt allein
  `@baustatik/fem-section-resolve` ein.
  **`FESectionState`** ist die Huelle darum, mit DREI unterscheidbaren
  Zustaenden: `computed` (mit Fingerabdruck `{ A, Iy }`), `unsupported` (mit
  Grund, und `It` trotzdem) und **abwesend** — „der Aufloesungsschritt lief noch
  nicht". Der dritte ist kein Versehen: ohne ihn ruft die Anwendung ewig neu auf.
- **Trefftz gegen Weber** sind die beiden Bedingungen fuer „keine Verdrillung",
  aus denen ein Schubmittelpunkt faellt. **Weber** verlangt verschwindende
  *mittlere* Verdrillung; sein Punkt ist ν-abhaengig (bis 0,55 % des
  Traegheitsradius) und ist der der klassischen Lehrbuchzahl. **Trefftz**
  verlangt eine verschwindende Projektion auf die Torsionsmode; sein Punkt ist
  ν-frei. **Gewaehlt ist Trefftz**, und nicht weil er ν-frei ist — das ist die
  Folge, nicht der Grund: der Torsionsfreiheitsgrad des Stabelements traegt
  `G·It` aus dem Woelbproblem, und der Schubmittelpunkt muss der Punkt sein, an
  dem das Biegeschubfeld genau diese Mode nicht mehr anregt (ADR 0045).
- **`t-section`** nennt die **Form**, nicht den Baustoff. Dieselben vier Zahlen
  heissen im Betonbau **Plattenbalken** und im Stahlbau **T-Profil**; getrennt
  werden die beiden von `idealisation`, nicht vom Formnamen. Der frueher
  gefuehrte `t-beam` trug den Baustoff im Schluessel und ist mit
  `schemaVersion: 5` verschwunden.
- **`SyMax`/`SzMax`** (im Katalog) ist das statische Moment des
  **Halbquerschnitts**. **`StressPoint.Sy`/`Sz`** (hier) gilt **am Ort**. Die
  Namen sind bewusst verschieden.
- **`Az`** (schubweiche Theorie) ≠ **`Av,z`** (EN 1993-1-1 §6.2.6) ≠
  **`Apl,z`** (plastisch). Siehe `steel-profiles/CONTEXT.md`.
- **`kappaY` gehoert zu `Iz`**, nicht zu `Iy`: die Querkraft in y biegt um z.
  Die Vertauschung waere unauffaellig — beide Zahlen blieben plausibel.
