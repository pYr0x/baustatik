# Stufe 2 — Schnittgrößen rechnerisch

## Kontext

`packages/TODO.md` Punkt 2: `internalForces` in `fem-element` und eine
Verlauf-API im Solver. Der Solver liefert heute Verformungen, Auflagerkräfte und
Stabendkräfte; zwischen den Knoten gibt es nichts.
`PreparedElement.internalForces` existiert als Vertrag
(`fem-element/src/types.ts:171`) und wirft
`InternalForcesNotImplementedError` (`timoshenko.ts:202`).

Ziel: der Anwender gibt Modell und Lastfälle ein, rechnet einen oder alle Fälle,
und die Ergebnisse werden abgelegt. Aus einem abgelegten Ergebnis müssen Viewer
(Diagramm), Bemessung (Einzelwert) und Bericht (Tabelle) `N`, `V` und `M` an
jeder Stelle `x` beantworten können. Sobald sich Modell oder Lasten ändern,
werden alle Ergebnisse verworfen und neu gerechnet.

Stufe 1a (Gelenke lokal benannt, `{ u, w, theta }`, ADR 0017) ist seit dem
2026-07-27 fertig und ist die Grundlage für Schritt 0 unten.

Nicht in diesem Schritt: Zeichnen (Stufe 5), Kombinationen und min/max
(Stufe 6), Biegelinie, Gelenksymbol (Stufe 3a).

---

## Die Vorzeichenkonvention

**Eine Regel:** ein positiver Wert wird auf der lokalen **+z**-Seite des Stabs
aufgetragen. Mechanisch:

- `M(x) = ∫σ·z dA` — positives Moment heißt **Zug auf der +z-Seite**.
- `V` positiv auf dem positiven Schnittufer in **+z**-Richtung.
- `N` positiv = **Zug**, negativ = Druck.

Lokale Achsen unverändert: `ex` vom Anfangs- zum Endknoten, `ez` daraus durch
dieselbe Drehung (`fem-geometry/src/line.ts:66`), `z` abwärts.

### Stabendkraft ≠ Schnittgröße

`elementEndForces` enthält heute **Stabendkräfte** — die Kräfte, die die Knoten
auf das Element ausüben, `K·d − f` in DOF-Richtung `[u1, w1, θ1, u2, w2, θ2]`.
Der Kommentar `[N1, V1, M1, N2, V2, M2]` (`solve.ts:110`) ist irreführend, weil
die Vorzeichen nicht übereinstimmen. Künftig heißt der Sechser
`[Fx1, Fz1, My1, Fx2, Fz2, My2]`; `N`/`V`/`M` sind für die Schnittgröße
reserviert.

Die Umrechnung (`e` = Stabendkräfte):

| | linksseitig bei x = 0 | rechtsseitig bei x = L |
| --- | --- | --- |
| `N` | `−e[0]` | `+e[3]` |
| `V` | `−e[1]` | `+e[4]` |
| `M` | `+e[2]` | `−e[5]` |

Das Moment tanzt aus der Reihe, weil `theta` (Element, +x→+z) gegen `phiY`
(Knoten) läuft — dasselbe Minus wie ADR 0005.

### Die Rekonstruktion: Gleichgewicht, nicht Stoffgesetz

```
N(x) = −e[0] − ∫₀ˣ qx dξ − Σ_{a<x} px
V(x) = −e[1] − ∫₀ˣ qz dξ − Σ_{a<x} pz
M(x) = +e[2] + ∫₀ˣ (V + my_e) dξ + Σ_{a<x} p.my
```

Exakt für den geraden, prismatischen Stab nach Theorie I. Ordnung — die
Stabendkräfte sind knotenexakt, Gleichgewicht kennt keinen
Diskretisierungsfehler. Timoshenko und Euler-Bernoulli haben dieselbe Formel:
der Schub steckt vollständig in den Stabendkräften. **Kein `EA`, `EI`, `phi`,
keine Ansatzfunktion.**

Zwei Fallen, die festgehalten gehören:

- `dM/dx = V + my_e`, nicht `dM/dx = V`. `my_e` trägt bereits das Minus aus
  `fem-load-resolve/src/resolve.ts:218`.
- `Σ_{a<x}` ist **strikt** kleiner und liefert damit überall den linksseitigen
  Grenzwert; die rechtsseitige Variante summiert `a ≤ x`.

Der Stoffgesetz-Weg (`M = EI·θ′` aus den Ansatzfunktionen) ist ausgeschlossen:
beim beidseitig eingespannten Träger unter Gleichlast sind alle
Knotenfreiheitsgrade null, er liefert `M ≡ 0` statt `−qL²/12` und `+qL²/24`.

Damit sind beide Auswege aus `TODO.md:375-379` genommen, aber aus verschiedenen
Gründen: **Weg 2** (aus Endkräften integrieren) trägt die Schnittgrößen,
**Weg 1** (den kondensierten Freiheitsgrad rekonstruieren) wird für die spätere
Biegelinie gebraucht.

---

## Schritt 0 — Vorbedingung: der elementinterne Mechanismus

**Neue Modellregel:** dieselbe Richtung an **beiden** Stabenden freigesetzt —
`u`/`u` oder `w`/`w` — ist ein Fehler.

Ein solcher Stab hat eine Starrkörperbewegung in sich, die von nichts gehalten
wird. Sie ist elementintern: nach der Kondensation stehen in den betroffenen
Zeilen Nullen, das Element trägt zu diesen Knotenfreiheitsgraden nichts mehr
bei, und `assertHeld` prüft die *globale* Diagonale. Der Solver rechnet also
durch, alle vier Netze aus ADR 0016 bleiben still, und es kommen Zahlen heraus.

**`theta`/`theta` ist ausdrücklich weiter erlaubt** — der Pendelstab. Nach dem
ersten Schritt steht `K[θ₂][θ₂] = 3EI/L ≠ 0`, kein Pivot 0, der Stab überträgt
weiter Normal- und Querkraft. Das muss in Meldung und Test stehen, sonst
verbietet jemand später den Pendelstab mit.

Die Regel deckt sich exakt mit dem Pivot-0-Zweig: die Diagonalglieder `EA/L`,
`12EI/L³/(1+φ)` und `4EI/L·…` sind strikt positiv, weil `prepare()` `L`, `EA`,
`EI` als endlich und `> 0` erzwingt. Null wird ein Pivot nur durch eine
vorangegangene Kondensation derselben Richtung am anderen Ende.

**Zwei Tore, wie bei `check()`/`solve()`:**

- `@baustatik/fem`, `validateModel` — eine eigene Unterklasse von
  `ModelValidationError` (Vorschlag: `UnrestrainedBeamError`, benennt Stab und
  Richtung). Präzedenz: `UnsupportedComponentError` steht schon dort und ist
  laut `validate.ts:20-24` „die eine statisch entscheidbare Hälfte" der
  Kinematik. `check()` meldet den Befund damit **vor** jeder Rechnung.
- `@baustatik/fem-element`, `prepare()` — eigenes Tor (Vorschlag:
  `UnrestrainedElementError`), weil das Package öffentlich ist und `condense`
  nicht auf einen fremden Prüfer vertrauen darf.

**Doku-Korrektur, ohne die die Regel der Beschreibung widerspricht:**
`fem/src/validate.ts:28-30` sagt heute *„Dasselbe gilt fuer die freigesetzten
VERSCHIEBUNGEN `u` und `w`: ein Stab, der laengs gleitet, uebertraegt immer noch
Querkraft und Moment"* — richtig für **ein** Ende, und der Satz ist ausdrücklich
als „damit ihn niemand versehentlich verbietet" gemeint. Er bekommt die
Einschränkung auf ein Ende.

**Verhaltenswechsel:** die Tests, die Stufe 1a für den Pivot-0-Zweig geschrieben
hat, kehren sich um — von „kehrt still zurück" zu „wirft". Der Zweig in
`condense` bleibt als unerreichbare Zusicherung stehen, jetzt aber mit
dokumentiertem Grund.

**Warum das eine Vorbedingung von Stufe 2 ist:** danach hat jeder freigesetzte
Freiheitsgrad einen Pivot `> 0` und ist exakt rückrechenbar. Ohne die Regel
müsste `endDisplacements` einen unbestimmten Wert tragen und jeder spätere
Verformungsrechner eine Fallunterscheidung.

---

## Änderungen in `@baustatik/fem-element`

### Dritte Bindungsstufe

```ts
type PreparedElement = {
  withLoad(load: LocalElementLoad): LoadedElement;
  stiffness(): Matrix6;                    // kondensiert, lastunabhängig
  shapeFunctions(x: number): { Nu; Nw; Ntheta };
};

type LoadedElement = {
  consistentLoad(): Vector6;               // kondensiert
  evaluate(dLocal: Vector6): ElementEvaluationState;
};
```

`prepare(props, L, releases?)` bindet `phi` **und** die Releases;
`withLoad(load)` bindet die Last. Grund: die Rückrechnung des freigesetzten
Freiheitsgrads `d_i = (f[i] − Σ_{j≠i} K[i,j]·d_j) / K[i,i]` greift auf `f[i]`
der unkondensierten Last zu — `evaluate` rechnet buchstäblich mit demselben
Vektor weiter wie `consistentLoad`. Zwei verschiedene Lasten ergäben eine
falsche Endverformung *und* falsche Stabendkräfte, beide plausibel aussehend.
Dieselbe Begründung wie ADR 0003 für `prepare`, eine Ebene weiter.

`stiffness()` und `shapeFunctions(x)` bleiben oben, weil sie nicht von der Last
abhängen: sonst müsste jeder Steifigkeitstest (Quervergleich geschlossen ↔
integriert, Locking-Sweep, Rangtest) eine leere Last erfinden, ebenso jede
spätere Eigenwert- oder Knicklastrechnung.

### Kondensation zieht hierher um

`condense` aus `fem-solver/src/element-matrix.ts:54` wandert nach `fem-element`,
samt dem Doku-Block zum Pivot-0-Zweig (`element-matrix.ts:44-60`). Die
**Mechanik** gehört zur Formulierung, die **Orchestrierung** (welche
Freiheitsgrade freigesetzt sind) bleibt beim Solver und kommt als Argument.

`fem-element` ist abhängigkeitsfrei und darf `@baustatik/fem` nicht importieren,
spiegelt die Form also strukturell:

```ts
type ElementEndReleases = { u?: true; w?: true; theta?: true };
type ElementReleases = { start?: ElementEndReleases; end?: ElementEndReleases };
```

Das ist bewusst formgleich mit `Beam['releases']` — ADR 0017 hat die Namen
gerade deshalb auf `{ u, w, theta }` gelegt, weil es *fem-elements* Vokabular
ist. Die „Übersetzung" im Solver ist damit ein Durchreichen, und die sechs
Zeilen `solve.ts:330-335` schrumpfen auf eine.

`prepare` merkt sich je freigesetztem Freiheitsgrad die Zeile `K[i,:]` und `f[i]`
**wie sie unmittelbar vor seiner eigenen Kondensation standen**. Die
Rückrechnung läuft dann in **umgekehrter Kondensationsreihenfolge**: bei `u1` und
`theta1` erst `θ₁` aus der schon um `u1` kondensierten Zeile 2, dann `u₁` aus der
Originalzeile 0, die `θ₁` bereits braucht. Das ist mehr als „die Pivotzeile
aufheben".

Reihenfolge in `evaluate`: Endverformungen aus den **unkondensierten** Zeilen,
Stabendkräfte aus der **kondensierten** Matrix. Genau diese Falle verschwindet
aus dem Solver, weil sie in einem Aufruf liegt.

### Der Auswertungszustand

```ts
type ElementEvaluationState = {
  /** m */
  L: number;
  /** [Fx1, Fz1, My1, Fx2, Fz2, My2], lokal, in DOF-Richtung */
  endForces: Vector6;
  /** [u1, w1, θ1, u2, w2, θ2], lokal, freigesetzte Freiheitsgrade zurückgerechnet */
  endDisplacements: Vector6;
  load: LocalElementLoad;
  deformation: {
    kind: 'timoshenko-2d-iie';
    phi: number;
    EI: number;
    EA: number;
  };
};
```

Reine Daten, unveränderlich, serialisierbar. Keine Closure, keine
Klasseninstanz. `deformation` ist Proviant für die spätere Biegelinie: aus
`M/EI` (Krümmung), `V/GAs` (Schub, `GAs = 12·EI/(phi·L²)`, `phi === 0` heißt
schubstarr) und `N/EA`. `phi` ist heute von außen unsichtbar — deshalb muss der
Datensatz vom Element kommen, nicht vom Solver. `kind` ist der Diskriminator und
damit zugleich der Versionsmechanismus (Muster wie `ActionCategory`,
`BeamLoad`); kein `schemaVersion`.

`Timoshenko2D` und `Timoshenko2DIntegrated` liefern **dasselbe** `kind` — sie
unterscheiden sich nur im Bau von `K`, nicht in der Kinematik.

### Die Auswertung als reine Funktionen

```ts
type SectionForces = { N: number; V: number; M: number };
type Side = 'left' | 'right';

function internalForcesAt(
  state: ElementEvaluationState,
  x: number,
  side: Side = 'left',
): SectionForces;

function internalForcesStations(state: ElementEvaluationState): number[];
```

`internalForces` verschwindet als Methode aus `PreparedElement`;
`InternalForcesNotImplementedError` entfällt aus `errors.ts` und `index.ts`.

`x` ist **absolut in Metern**, `0 … L`, gemessen ab dem Anfangsknoten entlang der
Stabachse. Kein relativer Modus — das ist eine Abfrage, keine abgelegte Eingabe.
Außerhalb `[0, L]` wird geworfen, mit derselben relativen Schranke wie
`requireOnElement` (`timoshenko.ts:109`): `1e-9 · max(1, L)`.

`internalForcesStations` liefert die Pflichtstützstellen:

1. `0` und `L`
2. jede Segmentgrenze (`seg.from`, `seg.to`) — Knick, eine Stelle genügt
3. jede Einzellastposition (`p.a`) — Sprung, **zwei** Werte (links/rechts)
4. die Wurzeln von `V + my_e = 0` und `qz = 0` je Intervall

Punkt 4 ist der Grund, warum das gemeldete Maximum exakt ist und nicht von der
Rasterweite abhängt: zwischen zwei Stützstellen ist `q` linear, also `V`
quadratisch und `M` kubisch — die Extremstellen sind ausrechenbar. Der Fall
„Maximum liegt auf der Einzellast, `V` geht nur durch den Sprung durch null" ist
über Punkt 3 abgedeckt.

> **Abweichung von `TODO.md:364`**, das `fem-load-resolve` als „richtigen
> Lieferanten" der Unstetigkeitsstellen nennt: sie kommen aus dem `load` im
> Auswertungszustand, also aus `fem-element`. Die Auswertung darf nichts
> nachlesen — das ist die Eigenschaft, die das abgelegte Ergebnis trägt.

---

## Änderungen in `@baustatik/fem-solver`

### `solve.ts`

- `prepareBeam` ruft `formulation.prepare(props, L, beam.releases)` und danach
  `.withLoad(beamLoads.get(beam.id) ?? { segments: [], points: [] })`.
- Die sechs eigenen `condense`-Aufrufe (`solve.ts:330-335`) entfallen.
- Nach dem Lösen je Stab `loaded.evaluate(dLocalOfBeam)`; die Zustände wandern
  ins Ergebnis.
- `condense` und `endForces` verschwinden aus `element-matrix.ts`;
  `transformationMatrix`, `rotateStiffness`, `rotateVector`, `toLocalVector`
  bleiben. Der Dateikopf (`element-matrix.ts:1-15`) spricht heute von
  Kondensation und Gelenken und wird auf „Transformation" zugeschnitten.

### `SolveResult`

```ts
type SolveResult = {
  loadCaseId: string;
  displacements: Map<string, NodeDisplacement>;
  reactions: Map<string, SupportReaction>;
  beamStates: Map<string, ElementEvaluationState>;   // NEU
  warnings: SolveWarning[];
};
```

`elementEndForces` **entfällt** — die Zahlen stehen im Zustand, und beim
Serialisieren wären sie sonst zwei Kopien. Betroffen außerhalb der Tests: nur
`apps/demo/fem-cantilever.ts:144`.

Kein `modelRevision`-Stempel nötig: ein Ergebnis, das nur aus Zahlen besteht und
nichts nachliest, kann nicht veralten. Die Löschregel der Anwendung dient dem
Speicher und der Anzeige, nicht der Korrektheit.

### Die Verlauf-API

```ts
function internalForcesAt(
  result: SolveResult,
  beamId: string,
  x: number,
  side?: Side,
): SectionForces;

function internalForcesAlong(
  result: SolveResult,
  beamId: string,
  opts?: { subdivisions?: number },
): (SectionForces & { x: number })[];
```

Freie reine Funktionen, keine Methoden am Ergebnis. Sie schlagen `beamId` in
`beamStates` nach und delegieren an `fem-element`; unbekannte `beamId` wirft
einen benannten Fehler. `internalForcesAlong` mischt die Pflichtstützstellen mit
einem groben Raster und liefert an Sprungstellen zwei Einträge mit gleichem `x`
(erst links, dann rechts).

Sie lesen **niemals** `config` — weder Geometrie noch Lasten noch
Querschnittswerte.

---

## Testanker

Geschlossene Lösungen in `fem-element`:

| Fall | Prüfwert |
| --- | --- |
| Kragarm, Endlast `P` | `M(0) = −P·L`, `V ≡ P`, `M(L) = 0` |
| Einfeldträger, Gleichlast `q` | `M(L/2) = +qL²/8`, `V(0) = +qL/2`, `V(L) = −qL/2` |
| Beidseitig eingespannt, Gleichlast | `M(0) = M(L) = −qL²/12`, `M(L/2) = +qL²/24` |
| Zug-/Druckstab | `N ≡ +P` / `N ≡ −P` |
| Kragarm, Streckenmoment `m` | `V ≡ 0`, `M(x) = m·(L−x)` — prüft `dM/dx = V + my_e` |

Strukturelle Anker:

- **Randidentitäten** an jedem Fall: `links(0)` trifft `[−e[0], −e[1], +e[2]]`,
  `rechts(L)` trifft `[+e[3], +e[4], −e[5]]`. Ein Vorzeichendreher schlägt hier
  sofort durch.
- **Gelenke, je Richtung.** Die selbstprüfende Eigenschaft, die heute an
  `elementEndForces` hängt, wandert auf die Schnittgröße und wird dort erst
  aussagekräftig: `releases.start.u` ⇒ `N(0) = 0` exakt, `.w` ⇒ `V(0) = 0`,
  `.theta` ⇒ `M(0) = 0`. Dazu der Pendelstab (`theta` an beiden Enden), der
  weiter durchgeht und `N`/`V` überträgt.
- **Schritt 0**: `u` bzw. `w` an beiden Enden wirft in `validateModel` **und** in
  `prepare`; `theta` an beiden Enden nicht. Die umgekehrten Pivot-0-Tests aus
  Stufe 1a.
- **Stabrichtung**: derselbe Stab mit vertauschten Knoten — `M` und `V` kippen
  wie die lokale z-Achse. Analog zu `fem-load-resolve/tests/resolve.test.ts`.
- **Sprungstelle**: Einfeldträger mit Einzellast in Feldmitte — `left ≠ right`
  bei `V`, `M` stetig, `M`-Maximum exakt auf der Laststelle und in
  `internalForcesStations`.
- **Randlast**: `BeamForcePointLoad` mit `distanceFromStart = 0` bzw. `= L` —
  `links(0)` und `rechts(0)` unterscheiden sich, das Diagramm zeigt keinen
  Phantomsprung.
- **Rückrechnung mehrerer Gelenke**: `u` und `theta` am selben Stabende — prüft
  die umgekehrte Reihenfolge der Rücksubstitution.
- **Extremstelle**: Trapezlast mit Nulldurchgang von `V` an krummer Stelle — die
  Wurzel steht in der Stützstellenliste, das Maximum über die Liste trifft den
  analytischen Wert.
- **Schubunabhängigkeit**: derselbe Fall mit `GAs: 'rigid'` und mit endlichem
  `GAs` liefert **identische** Schnittgrößen (die Verformungen unterscheiden
  sich). Beweist, dass die Rekonstruktion theoriefrei ist.

In `fem-solver`: schräger Stab (Transformation), Zweifeldträger gegen
Handrechnung, `solveAll` über mehrere Lastfälle.

---

## Dokumentation

**ADR 0018 — Schnittgrößen entstehen aus Gleichgewicht, nicht aus dem
Stoffgesetz.** Verworfene Alternative mit Gegenbeispiel (eingespannter Träger,
`M ≡ 0`). Enthält als Konsequenz den Umzug der Kondensationsmechanik nach
`fem-element` samt `withLoad`-Bindungsstufe, mit Verweis auf ADR 0003.

**ADR 0019 — Das Ergebnis trägt einen serialisierbaren Auswertungszustand.**
Verworfen: Closures am Ergebnis (nicht klonbar) und Config-Rückgriff mit
`modelRevision`-Stempel (mischt alten Zustand mit neuem). Nennt ausdrücklich,
dass `LocalElementLoad` damit auf dem Rückweg sichtbar wird, obwohl ADR 0007 ihn
auf dem Hinweg versteckt.

Schritt 0 braucht **keinen** eigenen ADR: er präzisiert ADR 0017 an einer
Stelle, die dort nicht zu Ende gedacht war, und die Begründung passt in den
Kommentar von `validate.ts`.

**CONTEXT-Änderungen:**

- `fem/CONTEXT.md`: die neue Modellregel bei den Invarianten, mit der Abgrenzung
  zum Pendelstab.
- `fem-element/CONTEXT.md`: Purpose („Schnittgrößen … spätere Inkremente"),
  Known Constraints Zeile 155 (Stub) und 160 (Releases) streichen; die drei
  Bindungsstufen, `ElementEvaluationState`, die Vorzeichentabelle und die
  Gleichgewichtsformeln aufnehmen.
- `fem-solver/CONTEXT.md`: Boundaries Zeile 22 — Kondensation ist nicht mehr
  Besitz, sondern Orchestrierung, mit Zeiger auf ADR 0018. Known Constraints
  Zeile 349 (keine Verläufe) und 352 (verlorene Verdrehung) streichen. Bei den
  vier Netzen der Hinweis, dass der elementinterne Mechanismus davor in `fem`
  abgefangen wird.
- `AGENTS.md`: Zeilen zu `fem`, `fem-element` und `fem-solver` nachziehen.
- `packages/TODO.md`: Stufe 2 als erledigt markieren, mit den Abweichungen vom
  Entwurf (Punktabfrage mit `side`, exakte Extremstellen, `x` nur absolut,
  Auswertungszustand statt Verlauf-API am Ergebnis, Stützstellen aus
  `fem-element` statt `fem-load-resolve`).

**Code-Kommentare, die zurückgenommen werden:**

- `fem/src/validate.ts:28-30` — der Satz zu `u`/`w` gilt nur für **ein** Ende.
- `fem-element/src/types.ts:169` — die Begründung „braucht die element-eigenen
  Ansatzfunktionen" stimmt für den Gleichgewichtsweg nicht.
- `fem-element/src/shape-functions.ts:8` — die Ableitungen braucht nicht
  `internalForces`, sondern die spätere Biegelinie.
- `fem-solver/src/solve.ts:110` — der Kommentar zu `[N1, V1, M1, …]`.
- `fem-solver/src/element-matrix.ts:1-15` — der Dateikopf ohne Kondensation.

**Changeset** für `@baustatik/fem` (neue Regel), `@baustatik/fem-element`
(`PreparedElement`) und `@baustatik/fem-solver` (`SolveResult`) — alle drei mit
Breaking Change.

---

## Verifikation

```text
pnpm --filter @baustatik/fem test
pnpm --filter @baustatik/fem-element typecheck
pnpm --filter @baustatik/fem-element test
pnpm --filter @baustatik/fem-solver typecheck
pnpm --filter @baustatik/fem-solver test
pnpm test
pnpm build
pnpm lint
```

Von Hand in der Demo (`apps/demo`, `pnpm dev`), Konsole:

```ts
const r = await solver.solve(store.activeLoadCaseId);
internalForcesAt(r, 'b1', 0);   // trifft die Stabendkraft-Identität
internalForcesAlong(r, 'b1');   // Stützstellen enthalten Lastgrenzen
```

Der Kragarm in `apps/demo/fem-cantilever.ts` ist der beste Handprüfstein: `M`
läuft linear von `−P·L` auf `0`, `V` ist konstant `P`.

---

## Bewusst nicht in diesem Schritt

- **Zeichnen.** Stufe 5, braucht die ViewPolicy (Stufe 4). Die Auftragsregel
  steht fest und gehört dann in `fem-viewer/CONTEXT.md`: positiver Wert auf der
  lokalen +z-Seite, `M` damit auf der Zugseite.
- **Biegelinie.** `deformation` hält den Platz frei; die Auswertung ist eine
  eigene reine Funktion über denselben Zustand und braucht denselben
  Gleichgewichtsweg (Interpolation über `Nw` allein wäre wieder `≡ 0` beim
  eingespannten Träger).
- **Kombinationen und min/max.** Stufe 6. Sie werden Summen über
  `ElementEvaluationState`-Datensätze und benutzen dieselbe Stützstellenliste.
- **Gelenksymbol und `releases` in der Demo.** Stufe 3a, unabhängig.
- **Der Ergebnisspeicher selbst.** Die `Map<loadCaseId, SolveResult>` und die
  Regel „jede Änderung löscht alles" sind Anwendungszustand und gehören zum
  Store, nicht in ein Package. Größenordnung: 1,5–3 MB je Lastfall bei 2000
  Knoten und 2500 Stäben.
