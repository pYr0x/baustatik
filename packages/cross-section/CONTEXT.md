# `@baustatik/cross-section`

## Zweck

Der **Rechenkern der Querschnittswerte**. Aus einem Querschnitt — parametrische
Form oder Katalogprofil — werden `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` und κ.
Spaeter kommt der duennwandige Zweig als dritte Quelle dazu; das ist keine dritte
Frage, sondern dieselbe Frage aus einer dritten Quelle.

Das Package besitzt ausserdem den **Modellsatz `CrossSection`**: den Record, der
neben `Node`, `Beam` und `NodeSupport` im Modell liegt und mit ihm gespeichert
wird ([ADR 0023](../../docs/adr/0023-cross-sections-belong-to-the-model.md)).
Die Profil-Variante traegt seit
[ADR 0027](../../docs/adr/0027-catalogues-are-import-sources.md) die
**Tabellenzeile als Kopie** (`data`); `profile` ist nur noch die Herkunft.
Damit schlaegt dieses Package **nichts mehr nach** — `sectionProperties` und
`stressPoints` sind im Profilzweig total, und `undefined` heisst nur noch
„unsinnige Abmessungen" bzw. „fuer diese Form gibt es keine Vorlage".

Zwei Abhaengigkeiten: `@baustatik/steel-profiles` (nur noch der **Typ**
`SteelProfileData`, kein `lookupProfile` mehr im `src`) und `@baustatik/units`
(die Umrechnungsfaktoren und die Quantity-Typen).

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
| `SectionProperties` (hier) | `A` [m²], `Iy`, `Iz`, `Iyz` [m⁴], `ys`, `zs` [m], `kappaY`, `kappaZ` [–] | **nein** |
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

**Bekannte Luecke:** die Idealisierung wirkt heute auf **genau eine** Groesse, κ.
`A`, `Iy`, `Iz`, `Iyz`, `ys` und `zs` werden in beiden Faellen exakt aus der
Umrissfigur gerechnet — die klassische duennwandige Naeherung (Mittellinie,
`t³`-Anteil entfaellt) brauchen wir nicht, weil geschlossene Formeln vorliegen.
Mit `It` kommt sie wieder, und dort liegen zwischen `⅓Σl·t³` und Bredt drei
Zehnerpotenzen.

Ein Sonderfall, der beim Lesen der Formeln auffaellt: beim **unsymmetrischen**
Plattenbalken rechnet der duennwandige Weg `S` um den Schwerpunkt des
**Wandmodells**, nicht um den der Umrissfigur. Sonst schloesse der Weg am freien
Stegende nicht auf null, und `S` waere zweideutig — je nachdem, von welcher Seite
man schneidet. Bei den doppeltsymmetrischen Formen fallen beide Schwerpunkte
zusammen, dort faellt es nicht auf.

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
| `t-beam` | **9** | 8 Ecken + Schwerpunkt |
| `i-symmetric` (geschweisst) | **15** | 12 Ecken + Schwerpunkt + 2 auf der Stegachse `(0, ±h/2)` |
| Walzprofil (IPE/HEA) | **13** | RSTAB: 5 + 5 Gurt, 2 Steganfang, 1 Schwerpunkt |

Was die Regel erledigt: beim **Plattenbalken mit breitem Gurt** kann die
Nulllinie *im Gurt* liegen (`bf=2,0 / hf=0,2 / bw=0,25 / h=0,5` → `zs = 0,1395`
bei `hf = 0,2`). „Schwerpunkt" trifft das ohne Sonderfall und liefert dort
`t = bf`; „Mitte Steg" haette den Punkt an die falsche Stelle gesetzt. Und beim
**Rechteck** haben die vier Ecken allein ueberall `S = 0`; das Maximum
`b·h²/8` sitzt auf halber Hoehe.

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
liefert `undefined`. Eine Vorlage ohne Referenzdaten waere geraten und nicht
gerechnet; er kommt mit den QRO-Daten, die ausserdem Bogentangenten mitbringen.

## Fixture aus dem Nachbarpackage

`tests/fixtures/rstab-stress-points.json` wird von
`packages/steel-profiles/scripts/extract.ts` erzeugt — einmalig, kein
Build-Schritt. Sie liegt hier, weil sie das **Orakel** fuer die Rechnung dieses
Packages ist und nicht Teil des Katalogs.

## Domaenensprache

- **`SyMax`/`SzMax`** (im Katalog) ist das statische Moment des
  **Halbquerschnitts**. **`StressPoint.Sy`/`Sz`** (hier) gilt **am Ort**. Die
  Namen sind bewusst verschieden.
- **`Az`** (schubweiche Theorie) ≠ **`Av,z`** (EN 1993-1-1 §6.2.6) ≠
  **`Apl,z`** (plastisch). Siehe `steel-profiles/CONTEXT.md`.
- **`kappaY` gehoert zu `Iz`**, nicht zu `Iy`: die Querkraft in y biegt um z.
  Die Vertauschung waere unauffaellig — beide Zahlen blieben plausibel.
