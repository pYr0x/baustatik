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
die Mittellinie gegen den Umriss. Sie traegt heute nur
ihren Vertrag — `sectionProperties` gibt fuer sie `undefined` zurueck, bis die
Green-Rechnung steht.

Dazu gehoert seit
[ADR 0032](../../docs/adr/0032-the-cross-section-gate-warns.md) das
**Prüfgatter**: `validateSectionGeometry` und `validateSectionProperties`, beide
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

Vier Abhaengigkeiten: `@baustatik/steel-profiles` (nur noch der **Typ**
`SteelProfileData`, kein `lookupProfile` mehr im `src`), `@baustatik/units`
(die Umrechnungsfaktoren und die Quantity-Typen), `@baustatik/errors` (die
Wurzel der Gatterklassen, ADR 0030) und seit ADR 0033
`@baustatik/section-geometry`.

**Die Geometriekante ist neu und war vorher ausdruecklich verboten.** ADR 0032
schrieb „keine neue Abhaengigkeit ausser `@baustatik/errors`", damit die
Knickwarnung ihre Endtangente aus `2·atan(bulge)` von Hand rechnete und
`@baustatik/script` keine Geometriebibliothek in den Snapshot-Builder zog. Mit
`Bulge` (P1) gibt es die Umrechnung an einer Stelle; `outgoingTangent` liest
`Bulge.sweep`, und die Doppelung ist aufgeloest statt nur getestet. **Der Preis
ist ausgesprochen:** sobald `geometry-2d` in P3 `clipper2-ts` einzieht, traegt
`@baustatik/script` es transitiv mit. Den mitgefuehrten Umriss LIEST das Gatter
weiterhin, es leitet ihn nicht ab.

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

Umgerechnet wird an **genau zwei** Stellen, und beide heissen so:

- `shapeResult` in `src/section.ts` — mm → cm, einmal je Form.
- **`toSI` in `src/to-si.ts` — cm → SI, fuer BEIDE Quellen.** Dass es nur eine
  ist, ist der eigentliche Gewinn: `ShapeResult` und `SteelProfileData` fuehren
  jetzt dieselben Einheiten, und der Katalog braucht keinen eigenen Rechenweg
  mehr.

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
das Deviationsmoment, SIND `y` und `z` die Hauptachsen. Alle heutigen Quellen
laufen durch diesen Zweig, und nur deshalb gilt `Iu === Iy` auf die letzte
Stelle.

## Der Schubmittelpunkt, und warum er beim T fehlt

`yM = ys` bei jeder Quelle: alle haben eine Symmetrieachse in y. `zM = zs` bei
`rectangle`, `i-symmetric`, `hollow-rectangle`, IPE und HEA — sie sind
doppeltsymmetrisch.

**Beim `t-section` bleibt `zM` `undefined`.** Die Form ist nur EINFACH
symmetrisch: `yM = ys = 0` steht, aber `zM != zs`, und die Zahl faellt erst aus
dem Wandweg. `undefined` heisst **nicht ermittelt**, nach dem Muster von
`kappaY?` — `zs` hinzuschreiben waere eine Unwahrheit.

## Das Prüfgatter: es warnt, es verweigert nicht

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
| 1 | `Iyz ≠ 0` | keine Hauptachsenlage — gilt nur, solange der Stab aus der Ebene gehalten wird |
| 2 | `yM ≠ ys` | Querkraft durch den Schwerpunkt tordiert (`T = Vz·e`) |
| 3 | Knick am Bogen | Tangentialitaet gebrochen |
| 4 | `yM === undefined` | Schubmittelpunkt **nicht ermittelt** — Satz 2 ist ungeprueft |

**Satz 2 keyt allein auf `yM`**, nicht auf `(yM, zM)`: das ebene Stabwerk kennt
nur `Vz`, ein z-Versatz erzeugt darin keine Torsion. Andernfalls feuerte jeder
Plattenbalken.

**Die Knickschranke wird abgeleitet, nicht gesetzt:**
`notch = (t/2)·tan(theta/2)`, gewarnt wird bei `notch > arcTolerance`. Bei
`0,05 mm` heisst das `t = 6 → ≈1,9°`, `t = 20 → ≈0,57°`. Dass dicke Waende
weniger Knick vertragen, ist richtig — ihre Kerbe wird tiefer. Die Toleranz ist
ein **Parameter** und keine Konstante im Gatter (ADR 0011); sie steht in der
`SectionPolicy`, die beide Tueren nehmen.

**`validateSectionProperties` nimmt die Policy heute, ohne ein Feld daraus zu
lesen.** Das ist Absicht und kein Versehen: die Schwelle „`Iyz` ist null" landet
mit P2 dort, und ein Bruch jetzt ist billiger als zwei ueber zwei Teilprojekte.

### Offene Luecke: `bulge` wird vom Gatter NICHT geprueft

G1 bis G6 sehen den Umriss, doppelte Ids, haengende Verweise, `t > 0`, die
Nulllaengenwand und den Knick — **nie die Woelbung selbst**. Ein `bulge` von
`NaN` laeuft still durch: die Knickpruefung rechnet `notch = NaN`, und
`NaN > arcTolerance` ist `false`, also schweigt sie. Fuer `t` prueft G4
ausdruecklich `Number.isFinite`; fuer `bulge` gibt es die Entsprechung nicht.

Solange das so ist, faengt der Zeichenweg es ab: `cross-section-viewer` faellt
bei einem nicht endlichen `bulge` — und bei einem am Vollkreis-Pol, wo
`4·atan(bulge)` auf `2π` rundet — auf die Sehne zurueck, statt zu werfen. Das
ist die Notbremse und nicht die Loesung: ein solcher Satz wird dann falsch
GEZEICHNET, ohne dass irgendwer ihn gemeldet haette. Ein eigener Befund gehoert
ins Gatter, ist aber eine Erweiterung seiner Befundmenge und damit eine
Entscheidung, die P1 nicht getroffen hat.

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

**Ein Feld heute, drei datierte Kandidaten:**

| Kandidat | faellig |
| --- | --- |
| Miter-Limit + `JoinType` (die Umrissecke bei schraegen Stoessen) | P3 |
| Schwelle „`Iyz` ist null" | P2 |
| Schwelle „dicke Wand" (`t/h`) | P5 |

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
Wandstaerke groesser als die halbe Hoehe, Steg breiter als der Gurt). Der Wert
laeuft im FEM-Strang durch den Port `getSectionStiffness`, und dort ist
`undefined` bereits der Vertrag fuer „Querschnitt unbekannt" — daraus wird ein
Modellfehler **im Bericht** statt einer Ausnahme mitten in `solve()`.

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
