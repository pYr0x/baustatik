# 0024 — Katalogeinheiten innen, SI an der Paketgrenze

Status: akzeptiert

## Kontext

`@baustatik/cross-section` rechnete durchgehend in SI-Metern: `ShapeSpec` nahm
Meter entgegen, `ShapeResult` lieferte m² und m⁴, `StressPoint` gab Koordinaten
in Metern und `S` in m³. Seine beiden Quellen sprechen aber beide etwas
anderes:

- der Katalog (`SteelProfileData`) fuehrt **mm, cm², cm⁴** — die Einheiten der
  Norm, bewusst so, damit man eine Zeile gegen die gedruckte Tabelle diffen
  kann ([ADR 0021](0021-section-values-separate-from-tabulated-profiles.md));
- die Handeingabe einer parametrischen Form ist eine **Bemassung**, und die
  steht in Millimetern.

Damit gab es zwei Umrechnungswege statt einem: `profileProperties` rechnete
cm → m, und die parametrischen Formen rechneten gar nicht um, weil ihre
Eingabe schon SI war. Dass `ShapeResult` und `SteelProfileData` dieselbe Frage
in verschiedenen Einheiten beantworteten, war der eigentliche Bruch.

Gleichzeitig lagen die Umrechnungsfaktoren als nackte Literale im Code
(`CM2 = 1e-4`, `CM4 = 1e-8`, `MM = 1e-3`, dazu `1e-4`/`1e-8` in Tests), obwohl
`@baustatik/units` genau dafuer da ist. Und die phantom-branded Quantities
(`Quantity<U>`) existierten zweimal: in `material/src/quantity.ts` und, halb
angefangen, in `cross-section/src/section.ts`.

## Entscheidung

### 1. Katalogeinheiten innen, SI an der Grenze

```
ShapeSpec [mm] ──┐                                  ┌── StressPoint [mm], [cm³]
                 ├─→ ShapeResult      [cm², cm⁴, cm]┤
SteelProfileData ┘   SteelProfileData [cm², cm⁴, mm]│
     [mm, cm², cm⁴]                                 │
                              toSI()  ← die EINE Umrechnung nach SI
                                 ↓
                     SectionProperties [m², m⁴, m]
```

`SectionProperties` bleibt SI, weil dahinter `fem-section-resolve` mit `E` in
kN/m² multipliziert und `EA` in kN, `EI` in kNm² herauskommen sollen. Innen
gilt der Katalog, weil dort gelesen und geprueft wird.

`StressPoint` fuehrt mm und cm³ — die Form des gedruckten Ausdrucks und der
Referenz-Fixture. Der Vergleich mit der Quelle braucht damit gar keinen
Umrechnungsfaktor mehr, in dem sich ein Fehler verstecken koennte.

### 2. `convert().toExact()` — ohne Rundung

`@baustatik/units` bekommt neben `to(target)` ein `toExact(target)`.

**Der Grund ist gemessen, nicht vermutet:**

```
convert(139.5).from('mm').to('m')  →  0.14     ← nicht 0,1395
convert(6.9).from('mm').to('m')    →  0.007    ← nicht 0,0069
```

`to()` rundet **atomar** — auf ganze mm, mm², mm³, mm⁴. Fuer einen Bericht ist
das richtig und ausdruecklich gewollt. Fuer einen Rechenkern zerstoert es genau
die Zahlen, um die es geht: `139,5 mm` ist die Schwerpunktlage des
Plattenbalkens mit breitem Gurt, `6,9 mm` ist der IPE-80-Spannungspunkt am
Ausrundungsende. Beide sind Prueffsteine dieses Strangs.

Verworfen: den Rechenkern bei eigenen Literalen zu belassen. Dann steht die
Umrechnung an zwei Orten mit zwei Wahrheiten, und `1e-8` allein sagt nicht, ob
es cm⁴ oder cm³ war.

Verworfen: `to()` rundungsfrei zu machen. Die atomare Rundung ist der Zweck des
Packages („Atomic Rounding" steht in seiner README als Alleinstellungsmerkmal)
und die Vorgabe fuer jeden, der eine Zahl anzeigt. Ein Test haelt die beiden
Wege deshalb ausdruecklich auseinander.

### 3. `Quantity<U>` gehoert nach `@baustatik/units`

`units` besitzt das Einheiten-Vokabular ohnehin (`UNITS`, `UnitCategory`,
`convert`). Die Brands dorthin zu ziehen, ist keine neue Abhaengigkeit, sondern
das Ende einer Doppelung. `material/src/quantity.ts` bleibt als **reiner
Re-Export** stehen: die Importe innerhalb von `material` und seine oeffentliche
Oberflaeche aendern sich nicht.

Der Import ist rein typseitig — zur Laufzeit entsteht nichts, im Bundle steht
nichts.

Verworfen: ein eigenes Blatt-Package `@baustatik/quantity` fuer sechs
Typaliase. Der Schnitt waere sauberer, der Preis ein weiteres Package in einem
Repo, das ohnehin schon 25 hat.

## Konsequenzen

- **Das Brand dokumentiert, es erzwingt nicht.** `Quantity<U>` ist optional
  gebrandet, damit ein blankes `number` frei zuweisbar bleibt und Arithmetik
  ohne Auspacken funktioniert. Ein `mm` laesst sich weiterhin dort uebergeben,
  wo `cm` erwartet wird — der Typecheck faengt einen Einheitenfehler NICHT.
  Was ihn faengt, sind die Tests.
- **Die Formfunktionen sind massstabsfrei** und tragen deshalb ihre Einheit nur
  im Typ, nicht in einer Formel. `tBeamCentroid` wird bewusst aus beiden
  Einheiten gerufen (cm aus `tBeam`, mm aus `stressPoints`) und darf deshalb
  gar nicht gebrandet werden; ein Kommentar sagt das.
- **κ ist unberuehrt.** Es ist dimensionslos, und `tests/kappa.test.ts` ging
  ohne eine einzige geaenderte Erwartung durch den Umbau — der schaerfste
  Beleg, dass er sauber ist. Umgekehrt heisst das: kappa-Tests koennen einen
  Einheitenfehler nur dann sehen, wenn beide Seiten verschieden skaliert sind.
  Der Orakel-Weg wird deshalb ausdruecklich in derselben Einheit gebaut wie
  `p.Iy` und `p.A`.
- **`fem-section-resolve` blieb unangetastet**, Tests inklusive. Das war das
  Abnahmekriterium fuer „die SI-Grenze haelt".
