# `@baustatik/fem-element`

## Purpose

Die Elementformulierung des ebenen Stabwerks: pro Stab die lokale
6x6-Steifigkeit, den konsistenten Ersatzknotenvektor (aus aufgeloesten lokalen
Lasten), die statische Kondensation der Gelenke und die Schnittgroessen `N`, `V`,
`M` an jeder Stelle liefern. Eine Elementformulierung ist ein untrennbares Paket
aus Kinematik, Ansatzfunktionen, Steifigkeit, Lastvektor und
Schnittgroessen-Rekonstruktion — einzelne Formeln verschiedener Elemente werden
nie gemischt. Reine, in Node testbare Mathematik ohne Konva/DOM/WASM.

Aktueller Stand: das Produktivelement `Timoshenko2D` (locking-freies IIE) steht
vollstaendig — Steifigkeit, Ansatzfunktionen, konsistenter Lastvektor,
Kondensation samt Rueckrechnung und Schnittgroessen; daneben
`Timoshenko2DIntegrated` als gleichwertige, gegenpruefende Variante. Spaetere
Inkremente: die Biegelinie (der Platz dafuer ist in
`ElementEvaluationState.deformation` freigehalten) und Theorie II. Ordnung.

## Boundaries

- Owns: das Interface `FrameElement2DFormulation` / `PreparedElement` /
  `LoadedElement`, die lokalen Typen (`Vector6`, `Matrix6`,
  `SectionStiffness`, `LocalElementLoad`, `ElementReleases`,
  `ElementEvaluationState`, `SectionForces`), die element-eigene Mathematik
  (K, f_e, Ansatzfunktionen, Kondensation und ihre Umkehrung, Schnittgroessen),
  die hand-gerollte 6x6-Arithmetik.
- Does not own: Transformation lokal<->global, Assemblierung, Randbedingungen,
  Reaktionen, den Solve `K d = F` (alles `fem-solver` + `linalg-wasm`); die
  ORCHESTRIERUNG der Kondensation — welcher Stab welche Freisetzungen hat, sagt
  der Solver und reicht es als Argument durch; die Aufloesung
  `BeamLoad -> LocalElementLoad` (`fem-load-resolve`); den Bau der
  `SectionStiffness` aus material x cross-section (separater Adapter); die
  globale Analyse-Einstellung, ob Schub beruecksichtigt wird.

## Dependencies

- Nur `@baustatik/errors` fuer die Fehlerhierarchie (Policy
  `.agents/rules/error-hierarchy-policy.md`). `errors` ist selbst
  dependency-frei — ein Blatt, das an einem Blatt haengt — das Package bleibt
  also praktisch abhaengigkeitsfrei. Alle anderen FEM-Packages haengen an
  fem-element, nie umgekehrt.

## Navigation

- [`src/types.ts`](src/types.ts): das Interface und alle Typen mit Konventionen.
- [`src/timoshenko.ts`](src/timoshenko.ts): `Timoshenko2D` und
  `Timoshenko2DIntegrated`, phi-Normalisierung, `consistentLoad`.
- [`src/stiffness.ts`](src/stiffness.ts): die beiden austauschbaren
  Steifigkeits-Bauer (geschlossen / per Gauss integriert).
- [`src/condense.ts`](src/condense.ts): statische Kondensation der
  freigesetzten Freiheitsgrade, ihre Umkehrung (`recoverEndDisplacements`) und
  `endForces`. Package-intern.
- [`src/internal-forces.ts`](src/internal-forces.ts): `internalForcesAt` und
  `internalForcesStations` als reine Funktionen ueber
  `ElementEvaluationState` — der Gleichgewichtsweg, ohne Stoffgesetz.
- [`src/shape-functions.ts`](src/shape-functions.ts): IIE-Ansatzfunktionen und
  ihre Ableitungen. Package-intern.
- [`src/gauss.ts`](src/gauss.ts): 3-Punkt-Gauss-Integrator. Package-intern.
- [`src/errors.ts`](src/errors.ts): die benannten Fehlerklassen, alle von
  `BaustatikError` abgeleitet.
- [`src/index.ts`](src/index.ts): Typen, die zwei Formulierungen und die
  Fehlerklassen, sonst nichts.
- [`tests/references/euler-bernoulli.ts`](tests/references/euler-bernoulli.ts):
  geschlossene EB-Referenz (`ebStiffness`, `ebConsistentLoad`), test-only, NICHT
  aus dem Index exportiert.
- [`tests/references/chain.ts`](tests/references/chain.ts): Mini-Assembler fuer
  einen geraden Stabzug (test-only) — fuer Anker, die einen Vergleich ueber
  mehrere Elemente brauchen (nodale Exaktheit, Patch-Test).
- [`tests/helpers.ts`](tests/helpers.ts): geteilte 6x6-Arithmetik und
  Toleranz-Zusicherungen beider Testdateien — inklusive der
  Knotenvertauschung `T_REV`/`reverseNodes` und des Jacobi-Eigenwertloesers
  hinter `expectThreeRigidBodyModes` (Rangtest).

## Invariants and conventions

- **DOF-Reihenfolge & Vorzeichen**: `d_e = [u1, w1, theta1, u2, w2, theta2]`,
  identisch fuer beide Theorien. `u` axial, `w` quer, `theta` = Drehung. z zeigt
  abwaerts (wie fem-geometry/fem-loads), lokale x-Achse vom Anfangs- zum
  Endknoten. `theta = dw/dx` (Neigung), positiver Drehsinn von +x nach +z —
  diese Wahl haelt K in der klassischen Hermite-Form und deckt sich mit dem
  konsistenten Lastvektor. Die Zuordnung `w<->uz`, `theta<->phiY` zur Knotenwelt
  leistet spaeter die Transformation im Solver.
- **GAs nur im Schubparameter**: `GAs` (= kappa*G*A, eine effektive
  Schubsteifigkeit) tritt NIE als roher additiver Steifigkeitsterm auf, sondern
  ausschliesslich in `phi = 12*EI/(GAs*L^2)` an genau einer
  Normalisierungsstelle. Das haelt den schubstarren Grenzfall exakt
  (endlich/Infinity = 0 in IEEE-754) und verhindert `Infinity - Infinity = NaN`.
  Schubstarr = `'rigid'` (kanonisch, serialisierbar) oder `Infinity` (geduldet,
  ueberlebt JSON nicht); `NaN` und `<= 0` sind unzulaessig.
  **Die eine Ausnahme** ist `gaussStiffness` (`src/stiffness.ts`): dort steht
  `GAs` als roher Faktor im Schubterm `int(Bs^T * GAs * Bs)`, weil die
  Integration die Grenzwertbildung nicht selbst leisten kann. Genau deshalb —
  und nur dort — gibt es den exakten `phi === 0`-Zweig, der den Term ueberspringt
  und damit den analytischen Grenzwert setzt statt `Infinity * 0 = NaN` zu
  rechnen. Der geschlossene Bauer sieht `GAs` nie; das ist der Grund, warum er
  der Default ist. Herleitung: `docs/adr/0004-…`.
- **Schub ist global, nicht pro Stab**: ob Schubverformung beruecksichtigt wird,
  ist eine globale Analyse-Einstellung (RSTAB-Konvention) im Adapter/`fem-solver`.
  fem-element weiss davon nichts und sieht nur das fertige `GAs` je Element.
- **Drei Bindungsstufen**: `prepare(props, L, releases?)` bindet `props`, `L`
  und die Freisetzungen — `phi` wird genau einmal berechnet und genau einmal
  kondensiert; `withLoad(load)` bindet die Last; `evaluate(dLocal)` bindet das
  Ergebnis des Loesens. Alle Methoden einer Instanz teilen dasselbe `phi` und
  dieselbe kondensierte Matrix, damit K, Ansatzfunktionen und Schnittgroessen
  nicht auseinanderdriften. Warum die LAST eine eigene Stufe ist: `evaluate`
  rechnet die Endverformung eines freigesetzten Freiheitsgrads aus `f[i]` der
  UNkondensierten Last zurueck, also aus buchstaeblich demselben Vektor, den
  `consistentLoad` produziert hat — zwei verschiedene Lasten ergaeben eine
  falsche Endverformung UND falsche Stabendkraefte, beide plausibel aussehend
  (ADR 0003 eine Ebene weiter,
  [ADR 0018](../../docs/adr/0018-section-forces-from-equilibrium.md)).
  `stiffness()` und `shapeFunctions(x)` bleiben auf der oberen Stufe, weil sie
  nicht von der Last abhaengen — sonst muesste jeder Steifigkeitstest eine leere
  Last erfinden.
- **Schnittgroessen entstehen aus GLEICHGEWICHT, nicht aus dem Stoffgesetz**:

  ```text
  N(x) = -e[0] - int_0^x qx - sum_{a<x} px
  V(x) = -e[1] - int_0^x qz - sum_{a<x} pz
  M(x) = +e[2] + int_0^x (V + my_e) + sum_{a<x} p.my
  ```

  mit `e = endForces`. Exakt fuer den geraden, prismatischen Stab nach
  Theorie I. Ordnung, ohne `EA`/`EI`/`phi`/Ansatzfunktion — Timoshenko und
  Euler-Bernoulli haben dieselbe Formel. Der Stoffgesetz-Weg (`M = EI*theta'`)
  ist ausgeschlossen: beim beidseitig eingespannten Traeger unter Gleichlast
  sind alle Knotenfreiheitsgrade null und er liefert `M == 0` statt `-qL^2/12`.
  Zwei Fallen: `dM/dx = V + my_e` (nicht `= V`; `my_e` traegt schon das Minus
  aus ADR 0005), und `sum_{a<x}` ist STRIKT kleiner — das ist der linksseitige
  Grenzwert, `side: 'right'` summiert `a <= x`. Herleitung und verworfene
  Alternative: ADR 0018.
- **Stabendkraft != Schnittgroesse**: `endForces` ist `K d - f` in DOF-Richtung,
  `[Fx1, Fz1, My1, Fx2, Fz2, My2]`. Die Umrechnung:

  | | links bei x = 0 | rechts bei x = L |
  | --- | --- | --- |
  | `N` | `-e[0]` | `+e[3]` |
  | `V` | `-e[1]` | `+e[4]` |
  | `M` | `+e[2]` | `-e[5]` |

  Das Moment tanzt aus der Reihe, weil `theta` (Element, +x nach +z) gegen
  `phiY` (Knoten) laeuft — dasselbe Minus wie ADR 0005. VORZEICHENREGEL: ein
  positiver Wert wird auf der lokalen +z-Seite aufgetragen, `M` damit auf der
  Zugseite; `N` positiv = Zug.
- **Bei Knotenvertauschung kippt `M`, NICHT `V`**: `ex` dreht sich um, `ez`
  dreht mit (fem-geometry), also dreht sich die Zugseite um. `V` bleibt, weil
  `dM/dx = V` und `M` und `x` beide kippen. `N` bleibt ohnehin.
- **Der elementinterne Mechanismus ist ein Fehler**: `prepare` misst bei jeder
  Kondensation das Pivot gegen seinen unkondensierten Wert und wirft
  `UnrestrainedElementError`, wenn es zusammengebrochen ist. Betroffen sind `u`
  an beiden Enden (Block `[u1, u2]`, Rang 1) sowie `w` an beiden Enden oder drei
  Freisetzungen aus `w`/`theta` (Block `[w1, theta1, w2, theta2]`, Rang 2).
  NICHT betroffen ist `theta` an beiden Enden — der Pendelstab, der danach die
  Normalkraft weiter traegt. Querkraft traegt er OHNE Stablast nicht mehr: mit
  Momentengelenken an beiden Enden verlangt das Momentengleichgewicht dann
  `V = 0`. Mit Stablast sehr wohl — die Last geht ueber die Ersatzknotenlasten
  in die Stabendkraefte ein, und der Verlauf faellt aus dem Gleichgewicht wie
  ueberall sonst. Dasselbe faengt
  `@baustatik/fem` schon am Modell ab (`UnrestrainedBeamError`), aus der blossen
  Freisetzungskombination; zwei Tore, weil dieses Package oeffentlich ist.
- **Hand-gerollte 6x6, keine externe Matrix-Library**: auf Element-Ebene wird
  nichts invertiert/zerlegt/geloest, nur eine 6x6 per Formel gebaut und ein
  `K*d` gerechnet. Feste Laenge steckt im Typ (`Matrix6`/`Vector6` als Tupel).
  Die Umwandlung nach `Float64Array` passiert erst im Solver beim Assemblieren.
- **EB-Referenz ist test-only und unabhaengig**: die geschlossene Hermite-K wird
  eigenstaendig hergeleitet, NICHT via Timoshenko(phi=0) — sonst waere der
  spaetere Cross-Check zirkulaer. Sie bleibt der Anker fuer den phi=0-Fall, und
  `Timoshenko2D` trifft sie bei phi=0 FP-exakt (`toBe`, nicht `toBeCloseTo`).
- **Zwei Formulierungen, ein Kern**: `Timoshenko2D` (geschlossene K, Default) und
  `Timoshenko2DIntegrated` (K per Gauss aus den N) teilen phi-Normalisierung,
  Ansatzfunktionen und Lastvektor; nur `stiffness()` ist injiziert. Beide
  erfuellen das unveraenderte Interface, damit `fem-solver` und ADR-0003
  unberuehrt bleiben. Begruendung: `docs/adr/0004-…`.
- **Verteiltes und punktuelles Moment koppeln ueber `Ntheta`, nie ueber `Nw'`**:
  ein Moment leistet virtuelle Arbeit an der VERDREHUNG, und bei Timoshenko sind
  `theta` und `w'` verschiedene Felder (`w' = theta + gamma`). Bei phi=0 faellt
  `Ntheta` exakt auf `Nw'` zurueck, weshalb die EB-Referenz (die `Nw'` nutzt)
  weiter als Anker taugt. Der Unterschied ist nicht akademisch: fuer einen
  Kragarm unter konstantem Streckenmoment liefert `Nw'` eine um ~13 % zu grosse
  Endverschiebung. ACHTUNG bei Tests: Gleichgewicht, Partitionsinvarianz und
  Verfeinerungsvergleiche erfuellen BEIDE Gewichtungen — sie diskriminieren
  nicht. Nur der Vergleich gegen die geschlossene Loesung
  (`w(L) = m*L^3/(3*EI)`) und die Forderung, dass ein Knoten-Einzelmoment ein
  REINES Knotenmoment ergibt, tun es.
- **3-Punkt-Gauss ist hier exakt, nicht genaehert**: hoechster Integrandgrad ist
  `Nw` (kubisch) mal `q` (linear) = 4 <= 5. Der konsistente Lastvektor und die
  integrierte K sind deshalb exakt; Vergleiche duerfen auf Rundungsniveau
  pruefen.
- **Laenge-6-Kontrakt der Ansatzfunktionen**: `Nu`, `Nw`, `Ntheta` laufen ueber
  alle sechs DOF mit Nullen an den unbeteiligten Stellen, sodass
  `dot(Nw, d) = w(x)` gilt und kein Aufrufer die DOF-Indexabbildung kennen muss.
- **`prepare()` ist das Eingangstor**: `L`, `EA`, `EI` muessen endlich und > 0
  sein, und auch das daraus BERECHNETE `phi` muss endlich sein — ein positives,
  aber winziges `GAs` laesst `GAs*L^2` unterlaufen, und `phi = Infinity` traegt
  als `Infinity * 0` gleichzeitig `NaN` in K, in die Ansatzfunktionen und in den
  Ersatzknotenvektor. Weil `phi` nur an der einen Normalisierungsstelle
  entsteht, steht dort auch der eine Check. `consistentLoad` verlangt
  Lastabschnitte und Einzellasten in `[0, L]` (Toleranz `1e-9 * max(1, L)`,
  also RELATIV zur Stablaenge — dieselbe FORM wie das Tor davor in
  `fem-loads/src/validate.ts`, dessen Zahl dort seit der
  Lastvalidierungs-Policy einstellbar ist; absolut waere sie ab `L > 1`
  schaerfer und liesse ein Band entstehen, das die Validierung passiert und
  hier wirft. Die Reste stammen aus `fem-load-resolve`, das seine Ausgabe
  zusaetzlich auf `[0, L]` klemmt — die Toleranz ist damit Doppelsicherung,
  nicht tragend, und bleibt genau deshalb eine private Konstante ohne
  Policy-Feld, siehe
  [ADR 0011](../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md)).
  Ungeprueft landeten NaN/Infinity sonst still in der
  globalen Matrix, weit weg von der Ursache. Alle Fehler sind benannte Klassen
  aus `src/errors.ts`, abgeleitet von `BaustatikError` — Aufrufer sollen per
  `instanceof` unterscheiden statt Meldungstexte zu parsen.

## Validation

```text
pnpm --filter @baustatik/fem-element typecheck
pnpm --filter @baustatik/fem-element test
pnpm --filter @baustatik/fem-element lint
```

## Known constraints

- Die BIEGELINIE fehlt noch. `ElementEvaluationState.deformation` haelt den
  Platz frei (`phi`, `EI`, `EA`); die Auswertung wird eine eigene reine Funktion
  ueber denselben Zustand und braucht denselben Gleichgewichtsweg —
  Interpolation ueber `Nw` allein waere beim eingespannten Traeger wieder `== 0`.
- Die Extremstellen in `internalForcesStations` entstehen aus einer
  quadratischen Interpolation ueber drei Stuetzwerte je Intervall. Das ist dort
  EXAKT (`q` linear ⇒ `V` quadratisch), aber es setzt voraus, dass die
  Grundstuetzstellen jede Unstetigkeit enthalten — ein Lastabschnitt, dessen
  Grenze fehlte, bliebe unbemerkt.
- Die EB-Referenz-`ebConsistentLoad` deckt nur Volllast-Segmente (`from=0`,
  `to=L`) und Einzellasten ab; Teilsegmente wirft sie zurueck. Fuer Teilsegmente
  pruefen stattdessen Partitionsinvarianz und Arbeitsaequivalenz.
- Der Locking-Sweep prueft `L/h = 5 … 1000` mit EINEM Element und relativer
  Toleranz 1e-12 — das Element ist exakt, es konvergiert nicht, deshalb dieselbe
  scharfe Schranke bei jeder Schlankheit.
