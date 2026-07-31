# `@baustatik/fem-section-resolve`

## Zweck

`CrossSection` × `Material` → `SectionStiffness`. Der Zwilling von
`@baustatik/fem-load-resolve`: Domaeneneingabe hinein, Elementzahlen heraus.

```text
cross-section  SectionProperties          material  Steel { Es, G }
                        \                    /
                         v                  v
                @baustatik/fem-section-resolve
                  resolveSectionStiffness(...) -> SectionStiffness | undefined
                                  |
                                  v
                fem-element  SectionStiffness { EA, EI, GAs }
```

Dies ist die **einzige** Stelle im Repository, an der Geometrie mit Material
multipliziert wird.

## Die Einheitenkette, ausgeschrieben

`material` liefert `Es` und `G` in **MPa** (N/mm²), `SectionStiffness` erwartet
`EA` in **kN** und `EI` in **kNm²**. Dazwischen steht **eine** Zahl:

```text
1 MPa = 1 N/mm² = 1e6 N/m² = 1e3 kN/m²
```

Also `E[kN/m²] = Es[MPa] · 1000`, und mit `A` in m² kommt `EA` in kN heraus:

| | | IPE 80 in S235 |
| --- | --- | --- |
| `EA` | `E · A` | `2,1e8 · 7,64e-4 = 160 440 kN` |
| `EI` | `E · Iy` | `2,1e8 · 8,014e-7 = 168,3 kNm²` |
| `GAs` | `kappaZ · G · A` | `0,352 · 8,0769e7 · 7,64e-4 = 21 727 kN` |

Bei einem Katalogprofil ist `kappaZ = Az/A`, also `kappaZ · G · A ≡ G · Az`.
Ein zweiter Test rechnet direkt `8,0769e7 · 2,69e-4` und muss dieselbe Zahl
treffen — das deckt einen vertauschten oder doppelt angewandten κ-Faktor auf,
den die erste Rechnung allein nicht sieht.

`κ` gehoert zu **z**, weil der ebene Rahmen um y biegt und quer in z schiebt.

## Zwei Funktionen, zwei Aufgaben

- **`resolveSectionStiffness(beam, sections, materials)`** loest die IDs auf.
- **`sectionStiffness(props, moduli)`** rechnet.

Die Naht liegt zwischen Nachschlagen und Multiplizieren. Wer schon
`SectionProperties` in der Hand hat — Bemessung, Vorbemessung, ein Diagramm
ueber eine Profilreihe — braucht die Aufloesung nicht.

## Keine Fabrik, keine Closure, keine Map

Solange der Querschnitt **Anwendungszustand** war, brauchte der Adapter eine
Sammlung und musste deshalb `createSectionAdapter(...)` heissen. Als
**Modellsatz** braucht er sie nicht: die Querschnitte reisen mit dem Modell, und
eine reine Funktion, die sie entgegennimmt, hat keinen Zustand, der veralten
koennte.

Warum der Adapter hier lebt und nicht in `cross-section`: `cross-section` bleibt
damit frei von `material` und `fem-element`. Der Wertekern beantwortet „was ist
die Flaeche", nicht „wie steif ist der Stab".

## Was `undefined` heisst

Unbekannter `crossSectionId`, unbekannter `materialId`, oder ein Querschnitt,
dessen Werte sich nicht bilden lassen. Der Solver-Port `getSectionStiffness` hat
genau dieses Vokabular; daraus wird ein Modellfehler **im Bericht**
(`UnknownSectionStiffnessError`) statt einer Ausnahme mitten in `solve()`.

`materials.steel` **wirft** bei unbekannter Sorte, und das ist dort richtig: wer
`steel('S234')` hinschreibt, hat sich vertippt. An dieser Grenze ist es aber eine
Aussage ueber das Modell. Der Adapter faengt genau `UnknownGradeError` und
**nur** den — ein kaputter Katalog schlaegt durch, sonst raechte sich der
try/catch als stiller Ausfall.

## Was hier NICHT entschieden wird

- **Der Schubschalter.** Ob Schub ueberhaupt beruecksichtigt wird, ist eine
  globale Analyse-Einstellung; `fem-solver` ersetzt `GAs` bereits durch
  `'rigid'`, wenn `policy.shearDeformation === false`. Ein zweiter Schalter
  hier waere ein zweiter Ort fuer dieselbe Entscheidung.
- **Schubstarr vs. κ = 0.** `κ === undefined` heisst schubstarr und wird zu
  `'rigid'`; `κ = 0` hiesse „keine Schubsteifigkeit" — das Gegenteil. Der
  Adapter uebersetzt, er interpretiert nicht.
- **Beton und Holz.** `materialId` wird heute als Stahlsorte gelesen. Beide
  brauchen je einen eigenen Zweig, sobald ein Querschnitt sie meint; `Ecm` und
  `E0,mean` heissen anders und haben andere Regeln.
- **Eigengewicht.** `selfWeight` aus `A × gamma` ist der naechste Schritt und
  gehoert hierher — die Zutaten stehen bereits beide auf dem Tisch.
