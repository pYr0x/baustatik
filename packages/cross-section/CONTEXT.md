# `@baustatik/cross-section`

## Zweck

Der **Rechenkern der Querschnittswerte**. Aus einem Querschnitt — parametrische
Form, Katalogprofil oder die frei gezeichnete Geometrie des Editors — werden
`A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs`, die Hauptachsen `alpha`/`Iu`/`Iv`, der
Schubmittelpunkt `yM`/`zM` und κ.

**Drei Quellen, eine Frage.** Die dritte, `SectionGeometry`, kam mit
[ADR 0030](../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md) dazu:
ein Wandgraph (`kind: 'midline'` — Knoten, Waende mit Dicke) oder freie
Umrissringe (`kind: 'outline'`), in beiden Faellen samt **mitgefuehrtem,
diskretisiertem Umriss**. Beide Marken benennen eine LINIE, nicht ihren Inhalt:
die Mittellinie gegen den Umriss. Seit
[ADR 0035](../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md)
traegt sie auch **Werte**: `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` fallen nach Green
aus dem mitgefuehrten Umriss (`src/green.ts`), `alpha`/`Iu`/`Iv` als Algebra
mit. **Ohne κ und ohne Schubmittelpunkt** — beide brauchen den Wandweg
beziehungsweise Grashof, also P4/P5; fuer den Loeser heisst das `GAs: 'rigid'`,
und `check()` in `@baustatik/fem-solver` sagt es, wenn jemand Schubverformung
verlangt hat. `stressPoints` bleibt fuer sie `undefined` (P4).

**Beide Zweige sind seit P3 ableitbar**, und zwar hinter EINER Tuer:
`deriveOutline(geometry, policy)` verzweigt ueber `kind`
([ADR 0037](../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
Dahinter liegen `deriveOutlineFromRings` — nur `Bulge.toPolyline` je Kante,
keine Bibliothek — und `deriveOutlineFromWalls`: Zerlegung des Graphen in
Laeufe, Aufweitung um `t/2`, Vereinigung ueber `Polygon.inflate`. Eine Tuer und
nicht zwei, weil das Gate den Umriss fuer die Drift-Pruefung neu ableitet und
die Fallunterscheidung sonst zweimal im Repo staende.

`createSectionGeometry(input, policy)` (`src/create-section-geometry.ts`) ist
die **Fabrik**: Eingabe plus Policy ergeben den vollstaendigen Satz. Der Record
bleibt daneben **frei konstruierbar** — er ist reine, JSON-serialisierbare
Daten und muss aus einer geladenen Datei rekonstruierbar sein, ohne durch eine
Fabrik zu laufen.

### Die Zugregel

> **Geradeste Fortsetzung.** An jedem Knoten wird das Wandpaar mit der
> kleinsten Richtungsaenderung durchverbunden. Gleichstand entscheidet die
> Wand-Id.

Sie ist Teil des Vertrags und nicht Implementierungslaune: `JoinType` wirkt
INNERHALB eines Pfades, also schliesst Clipper2 die Ecke zwischen zwei Waenden
nur, wenn beide als EIN Pfad hineingehen. Welches Paar das ist, aendert den
Umriss. Daran haengt die Zusage: **zwei Wandgraphen gleicher Gestalt mit
anderen Ids liefern denselben Umriss.**

`Branch` (`src/branch.ts`) ist der Lauf zwischen VERZWEIGUNGSKNOTEN (Grad ≠ 2),
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
warnen, wenn |A_neu − A| > policy.arcTolerance · U      U aus dem Umriss
```

`arcTolerance · U` ist genau die Flaeche, die entsteht, wenn der Rand ueberall
um die Diskretisierungstoleranz wandert — die groesste Abweichung, die ein
zulaessiger Bibliothekswechsel erklaeren kann. **Kein viertes Policy-Feld**: eine
gesetzte Schranke waere eine zweite Zahl fuer dieselbe Frage. Verglichen wird
`A` und nicht Punkt fuer Punkt, sonst waere jede `arcTolerance`-Aenderung ein
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
„unsinnige Abmessungen" bzw. „fuer diese Form gibt es keine Vorlage".

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
| `SectionProperties` (hier) | `A` [m²], `Iy`, `Iz`, `Iyz`, `Iu`, `Iv` [m⁴], `ys`, `zs`, `yM`, `zM` [m], `alpha` [rad], `kappaY`, `kappaZ` [–] | **nein** |
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

- `shapeResult` in `src/section.ts` — mm → cm, fuer die parametrische Form.
- `geometryResult` daneben — mm → cm, fuer den gezeichneten Umriss. Es skaliert
  die **Punkte**, nicht das Ergebnis: dieselbe Figur wie bei `shapeResult`, und
  ein Faktor an einer Stelle statt dreier (cm², cm⁴, cm) am Ausgang.
- Die Katalogzeile braucht keine: sie fuehrt bereits cm.
- **`toSI` in `src/to-si.ts` — cm → SI, fuer ALLE Quellen.** Dass es nur eine
  ist, ist der eigentliche Gewinn: `ShapeResult`, `SteelProfileData` und die
  Green-Werte fuehren dieselben Einheiten, und keine Quelle braucht einen
  eigenen Rechenweg.

(Hier stand frueher „genau zwei Stellen". Das war schon damals die falsche Zahl
fuer die richtige Aussage.)

Die Faktoren stehen nicht als Literal im Code, sondern kommen aus
`@baustatik/units` (`src/units.ts`) — und zwar aus **`toExact`**, nicht aus
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
angebbar. Es gibt **keine Quadratur in `src/`**. Die numerische Integration lebt
im Test (`tests/oracle.ts`) als unabhaengiges Orakel fuer die Herleitungen.

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

**Bekannte Luecke:** `A`, `Iy`, `Iz`, `Iyz`, `ys` und `zs` werden weiterhin in
beiden Faellen exakt aus der Umrissfigur gerechnet — die klassische duennwandige
Naeherung (Mittellinie, `t³`-Anteil entfaellt) brauchen wir nicht, weil
geschlossene Formeln vorliegen. Mit `It` kommt sie wieder, und dort liegen
zwischen `⅓Σl·t³` und Bredt drei Zehnerpotenzen.

Ein Sonderfall, der beim Lesen der Formeln auffaellt: beim **unsymmetrischen**
T-Querschnitt rechnet der duennwandige Weg `S` um den Schwerpunkt des
**Wandmodells**, nicht um den der Umrissfigur. Sonst schloesse der Weg am freien
Stegende nicht auf null, und `S` waere zweideutig — je nachdem, von welcher Seite
man schneidet. Bei den doppeltsymmetrischen Formen fallen beide Schwerpunkte
zusammen, dort faellt es nicht auf.

Der **Versatz `zs − zsWall`** ist damit die Naeherung dieser Form: die
Koordinaten liegen um `zs` (σ braucht dieselbe Achse wie `A` und `Iy`), `S` um
`zsWall`. Er ist klein — 0,30 mm bei einem 200 mm hohen geschweissten T — und
kostet, weil `S` an seinem Maximum flach ist, 3·10⁻⁶ von `S`. Er kann das
Vorzeichen wechseln (beim breiten Gurt liegt der Umrissschwerpunkt *ueber* dem
Wandschwerpunkt); deshalb bekommt die Vorlage `zs` und `zsWall` **getrennt** und
nicht eine Differenz mit angenommenem Vorzeichen. Ein Charakterisierungstest
haelt ihn mit Zahl fest.

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

## Der Schubmittelpunkt, und warum er beim T fehlt

`yM = ys` bei jeder Quelle: alle haben eine Symmetrieachse in y. `zM = zs` bei
`rectangle`, `i-symmetric`, `hollow-rectangle`, IPE und HEA — sie sind
doppeltsymmetrisch.

**Beim `t-section` bleibt `zM` `undefined`.** Die Form ist nur EINFACH
symmetrisch: `yM = ys = 0` steht, aber `zM != zs`, und die Zahl faellt erst aus
dem Wandweg. `undefined` heisst **nicht ermittelt**, nach dem Muster von
`kappaY?` — `zs` hinzuschreiben waere eine Unwahrheit.

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
| 2 | `yM ≠ ys` | Querkraft durch den Schwerpunkt tordiert (`T = Vz·e`) |
| 3 | Knick am Bogen | Tangentialitaet gebrochen |
| 4 | `yM === undefined` | Schubmittelpunkt **nicht ermittelt** — Satz 2 ist ungeprueft |

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
`notch = (t/2)·tan(theta/2)`, gewarnt wird bei `notch > arcTolerance`. Bei
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
`NaN > arcTolerance` ist `false`, also schwieg sie. Fuer `t` prueft G4
ausdruecklich `Number.isFinite`; fuer `bulge` gab es die Entsprechung nicht.

P3 hat die Entscheidung erzwungen, weil es als erstes darueber stolpert: der
Wert laeuft ab jetzt in eine **fremde Bibliothek**, deren Ergebnis danach
*plausibel aussieht*. Das Gate meldet ihn als `NonFiniteBulgeError`, die
Ableitung liest ihn als Gerade und filtert ihn weg (ADR 0037).

**`Number.isFinite` ist dabei nur die halbe Frage**, und die zweite Hälfte hat
P3 zunächst offen gelassen: `bulge = 10^14` ist endlich und beschreibt trotzdem
einen fast vollen Kreis mit `2,5·10^15 mm` Radius durch zwei Punkte, die
`100 mm` auseinanderliegen. Seine Zerlegung unter `arcTolerance` verlangte
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
aendern**"* — `arcTolerance` aendert es: der abgeleitete Umriss reist nach ADR
0030 im Satz mit, und seine Punktzahl haengt an der Toleranz. Der Loeser truege
eine Zahl mit, die er nie liest.

Die volle Scheibenform nach dem Vorbild von `fem-loads/src/policy.ts`:
`SectionPolicy` · `SectionPolicyOverrides` · `DEFAULT_SECTION_POLICY` ·
`createSectionPolicy` · `parseSectionPolicy`. **Keine eigene `schemaVersion`** —
eine Version je Datensatz, und der Datensatz ist der Snapshot (`v7`, wo
`sectionPolicy` als **Pflichtfeld** auf Projektebene steht).

`DEFAULT_ARC_TOLERANCE` **zieht nicht um**: die Policy liest es aus
`@baustatik/section-geometry`. Es neu zu setzen brachte den Zustand zurueck, den
ADR 0032 beseitigt hat — zwei Zahlen fuer eine Modellannahme.

**Drei Felder heute, ein datierter Kandidat:**

| Feld / Kandidat | Stand |
| --- | --- |
| `arcTolerance` — die Sehnenabweichung [mm] | seit P1 |
| `principalAxisTolerance` — dimensionslos, `\|Iyz\| <= tol · max(\|Iy\|, \|Iz\|)`, Default `1e-9` | seit P2 |
| `miterLimit` — dimensionslos, gekappt ab `1/sin(α/2) > miterLimit`, Default `2` | seit P3 |
| Schwelle „dicke Wand" (`t/h`) | P5 |

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
nicht die Groesse — dieselbe Figur wie `arcTolerance`. **Gelesen wird sie allein
vom Gate:** `principalAxes` bleibt total, rein und ohne Policy und liefert
`alpha ≈ 1e-17`, was die richtige Antwort auf die gestellte Frage ist; ein
Schnappen dort waere eine *Analyse*-Einstellung auf der Rechenstrecke (ADR
0011). `0` ist ein zulaessiger Wert und stellt den exakten Vergleich wieder her.

**Ausdruecklich kein Kandidat: die Gauss-Punkte fuer Grashof.** Sie werden von
`sectionProperties` gelesen, und das liegt auf der Rechenstrecke
(`getSectionStiffness`, je Stab in `solve()`/`check()`) — eine Einstellung dort
waere nach ADR 0011 eine *Analyse*-Einstellung. Sie werden ausserdem gar keine
Einstellung, sondern eine Konstante: bei senkrechten Kanten ist der Integrand
ein Polynom 6. Grades und 4-Punkt-Gauss exakt. Das ist Konvergenz, keine Wahl.
**Die Knickschranke ist ebenfalls kein Feld** — sie wird aus `arcTolerance`
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

**Beim Editor-Querschnitt heisst `undefined` an `kappaY`/`kappaZ` und
`yM`/`zM` dagegen „nicht ermittelt"** und nicht „nicht rechenbar": die Werte
stehen, die Schubgroessen fehlen. Der Loeser rechnet dann `GAs: 'rigid'`, also
ohne Schubverformung — die steifere und damit unauffaelligere Richtung —, und
`check()` in `@baustatik/fem-solver` meldet es, wenn `shearDeformation: true`
eingestellt war (ADR 0035).

## Spannungspunkte: Regel statt Liste

> **Jede Vorlage enthaelt mindestens alle Ecken der Umrissfigur und den
> Schwerpunkt.**

| Form | Punkte | |
| --- | --- | --- |
| `rectangle` | **5** | 4 Ecken + Schwerpunkt |
| `t-section` | **9** | 8 Ecken + Schwerpunkt |
| `i-symmetric` (geschweisst) | **15** | 12 Ecken + Schwerpunkt + 2 auf der Stegachse `(0, ±h/2)` |
| Walzprofil (IPE/HEA) | **13** | RSTAB: 5 + 5 Gurt, 2 Steganfang, 1 Schwerpunkt |

Die Punkte **liegen**, wo die Regel sie hinsetzt; **welche Werte** sie tragen,
entscheidet die Idealisierung — dieselbe Angabe, die auch κ steuert:

| Form | `solid` | `thin-walled` |
| --- | --- | --- |
| `rectangle` | Umrissmodell | — (traegt kein `idealisation`) |
| `i-symmetric` | Umrissmodell | **Wandmodell** |
| `t-section` | Umrissmodell | **Wandmodell** |
| `hollow-rectangle` | `undefined` | `undefined` |

`solid` behaelt das Umrissmodell, und das ist keine Uebergangsloesung: Grashof
**ist** fuer Vollquerschnitte richtig, die Rechteckparabel faellt genau daraus.
Im Wandmodell wechseln nur `t` und `S` — die Koordinaten und die Nummern bleiben
Ziffer fuer Ziffer dieselben. Am Gurt heisst das `t = tf` statt `t = b`: der
Schubfluss laeuft **laengs** der Wand, die senkrechte Komponente durch den ganzen
Gurt bedeutet dort nichts.

Was die Regel erledigt: beim **T-Querschnitt mit breitem Gurt** kann die
Nulllinie *im Gurt* liegen (`bf=2,0 / hf=0,2 / bw=0,25 / h=0,5` → `zs = 0,1395`
bei `hf = 0,2`). „Schwerpunkt" trifft das ohne Sonderfall und liefert dort
kompakt `t = bf`; „Mitte Steg" haette den Punkt an die falsche Stelle gesetzt.
(Im Wandmodell ist der Gurt eine Linie, es gibt dort also keinen waagerechten
Schnitt durch ihn: der Punkt sitzt am Steg und traegt `t = bw`. `zs > hf/2` gilt
immer, solange es unter dem Gurt einen Steg gibt — der Fall braucht auch dort
keinen Sonderfall.) Und beim **Rechteck** haben die vier Ecken allein ueberall
`S = 0`; das Maximum `b·h²/8` sitzt auf halber Hoehe.

Dass das Walzprofil bei RSTABs 13 bleibt und die Gurtunterseiten-Ecken auslaesst,
ist eine **begruendete Ausnahme**: bei homogenem Querschnitt koennen sie nie
massgebend werden (gleiches `y`, kleineres `|z|` als die Gurtspitze darueber),
und die Nummerierung ist gedruckt. Geschweisstes I (15) und gewalztes IPE (13)
lesen sich damit bewusst verschieden — es sind zwei Formen.

**Die Nummerierung ist ein veroeffentlichter Vertrag.** RSTAB druckt „S-Punkt
Nr. 1…13" (1–5 oberer Gurt von links, 6–10 unterer, 11/12 Steganfang, 13
Schwerpunkt). Wir uebernehmen sie; ein Test haelt fest, welche Nummer wo sitzt,
bevor der erste Bericht sie druckt.

`t` ist die **massgebende** Breite: an einer Sprungstelle (Gurtunterkante) gilt
die **kleinere** der beiden, weil die Schubspannung dort nach oben springt. Die
groessere zu nehmen hiesse, die Spitze wegzurechnen, um die es an diesem Punkt
geht.

Zwei Vorzeichenkonventionen, und das ist Absicht: bei den parametrischen Formen
sind `Sy`/`Sz` das erste Flaechenmoment des Teils **oberhalb** bzw. **links**
vom Punkt, also durchweg ≤ 0. Beim Walzprofil uebernehmen wir RSTABs Zaehlweise,
in der das Vorzeichen die **Umlaufrichtung** des Schubflusses kodiert. Fuer
`|tau|` ist die Richtung gleichgueltig.

### Was geprueft ist, und eine bekannte Abweichung

Der Walzprofil-Zweig integriert die **Ausrundung** — die fummeligste Rechnung
des Packages. Belege:

- `A` und `Iy` aus `h, b, tw, tf, r` treffen die Tabelle jedes der 42 Profile
  auf **0,05 %**.
- `Sy` im Schwerpunkt trifft den Tabellenwert `SyMax` auf **0,05 %**, und
  `2·SyMax = Wpl,y` (in `steel-profiles` geprueft) belegt unabhaengig, dass die
  Tabelle sich selbst treu ist.
- Alle 546 Referenzpunkte stimmen auf **0,7 %** — bis auf zwei.

**Punkt 3 und 8** (Gurtmitte) weichen um bis zu **2,8 %** ab, und der Grund ist
nicht gefunden. Unser Wert ist das erste Flaechenmoment des halben Gurts,
`b/2 · tf · (h−tf)/2`; dieselbe Formel stimmt an Punkt 2 und 4 auf 0,45 %. Der
Unterschied ist weder ein fester Anteil der Ausrundung noch eine Funktion von
`r/tf`. Ein Test haelt die Spanne als **Charakterisierung** fest, damit ein
spaeterer Erklaerungsversuch merkt, wenn er sie aendert.

Dass die Toleranz gegen die Fixture bei 0,7 % und nicht bei 0,3 % liegt, ist
kein Zugestaendnis an unsere Rechnung: RSTAB widerspricht **sich selbst** um bis
zu 0,56 % (Spannungspunkt 13 gegen das eigene `Sy,max`, HEA 260) und druckt
spiegelbildliche Punkte verschieden (IPE 220: 119,44 gegen 119,73).

Fuer den **geschlossenen Kasten** gibt es noch keine Vorlage: `stressPoints`
liefert `undefined`. Ihm fehlen die **Referenzdaten, nicht die Theorie** — den
umlaufenden Weg hat `closedBoxPath` in `shapes/hollow-rectangle.ts` bereits, und
κ faellt daraus. Eine Vorlage ohne Referenz, gegen die sie zu pruefen waere, ist
geraten und nicht gerechnet; er kommt mit den QRO-Daten, die ausserdem
Bogentangenten mitbringen.

### Das Orakel der duennwandigen Vorlagen: `r = 0`

Ein geschweisstes I ohne Ausrundung **ist** das gewalzte Profil mit `r = 0`. Die
duennwandige I-Vorlage erbt damit die Gueltigkeit der 546 validierten Punkte,
ohne eine neue Fixture zu kosten — an den **14 Gurtstationen**, und dort auf
Gleitkommarauschen genau.

Am **Steg** gilt das Orakel nicht, und diese Grenze ist die Aussage: `rolled-i.ts`
fuehrt den Gurt bereits als Wand (`t = tf`, Hebelarm auf der Mittellinie), den
Steg aber als Umrissfigur ueber die **lichte** Hoehe `h/2 − tf`, waehrend das
Wandmodell von Gurtmitte zu Gurtmitte laeuft (`±zf`). Bei IPE-80-Massen sind das
11,25 gegen 11,60 cm³. Keine der beiden Zahlen ist falsch; sie gehoeren zwei
Idealisierungen. Der Schwerpunkt hat deshalb seine **eigene** Referenz, `Sy,max`
des Katalogs: 11,60 gegen 11,61. Ueber den ganzen Katalog liegt das Wandmodell
**immer** unter der Tabelle, um 0,05 % (IPE 80) bis 4,6 % (HEA 260) — dieselbe
Signatur wie bei κ, wo `Az` ebenfalls immer zu klein ist.

## Fixture aus dem Nachbarpackage

`tests/fixtures/rstab-stress-points.json` wird von
`packages/steel-profiles/scripts/extract.ts` erzeugt — einmalig, kein
Build-Schritt. Sie liegt hier, weil sie das **Orakel** fuer die Rechnung dieses
Packages ist und nicht Teil des Katalogs.

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
  Schubwege und die kompakten Spannungspunkt-Vorlagen zusammengesetzt sind — im
  Code `OutlinePart` (`from`/`to`) und `Part` (`extent`). Der Begriff steht so in
  der Literatur: „das statische Moment der Teilflaeche mal Abstand
  Teilschwerpunkt bis Gesamtschwerpunkt". Er behauptet **keine Gestalt**, und das
  ist der Punkt — der Gurt eines I ist flach und breit, der Steg hoch und schmal
  (183 von 200 mm in EINEM Eintrag), und die Breite darf eine **Summe ueber
  getrennte Bereiche** sein (`2*tf`, wenn ein senkrechter Schnitt beide Gurte
  trifft). Nicht „Band" (kein Fachbegriff), nicht „Streifen" (das ist Hillerborgs
  Plattenverfahren) und nicht „Lamelle": die Lamelle ist im Stahl- und Betonbau
  das aufgeschweisste bzw. aufgeklebte Blech.
- **`ShearFlowInterval`** (`shear.ts`) ist ein Stueck des Schubflusswegs: ein
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
- **Umrissmodell** und **Wandmodell** sind die beiden Antworten auf „wie fliesst
  der Schub", und `idealisation` waehlt zwischen ihnen. Das **Umrissmodell**
  (`stress-points/outline.ts`) schneidet quer durch die volle Umrissfigur —
  Grashof, und fuer Vollquerschnitte richtig. Das **Wandmodell**
  (`stress-points/thin.ts`) laesst den Schubfluss laengs der Wandmittellinien
  laufen. Beide sind **Modelle**, keine Verfahrensnamen und keine Maschinen.
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
