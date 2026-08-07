# @baustatik/fem-solver

## 1.1.1

### Patch Changes

- @baustatik/fem-geometry@0.0.3
- @baustatik/fem-load-resolve@0.1.2
- @baustatik/fem-loads@0.1.1

## 1.1.0

### Minor Changes

- 3da2409: Rename `SectionProperties` to `SectionStiffness`.

  Breaking, but at 0.x: `fem-element` exports `SectionStiffness` instead of
  `SectionProperties`, `SolverConfig.getSectionProperties` is now
  `getSectionStiffness`, and `UnknownSectionPropertiesError` is now
  `UnknownSectionStiffnessError`. No behaviour changed.

  The name is handed to `@baustatik/cross-section`, where it means what every
  profile table means by it: `A`, `Iy`, `Wel` — geometry without material. What
  `fem-element` holds is geometry times material. See ADR 0020.

### Patch Changes

- Updated dependencies [3da2409]
  - @baustatik/fem-element@1.1.0
  - @baustatik/fem-load-resolve@0.1.1

## 1.0.0

### Major Changes

- abba606: Schnittgrößen: `N`, `V` und `M` an jeder Stelle, aus Gleichgewicht statt aus dem
  Stoffgesetz.

  Der Solver lieferte Verformungen, Auflagerkräfte und Stabendkräfte; zwischen den
  Knoten gab es nichts. `internalForces` war ein werfender Stub. Jetzt trägt das
  Ergebnis je Stab einen serialisierbaren Auswertungszustand, und zwei freie
  Funktionen beantworten daraus jede Stelle —
  [ADR 0018](../docs/adr/0018-section-forces-from-equilibrium.md) und
  [ADR 0019](../docs/adr/0019-result-carries-an-evaluation-state.md).

  ## `@baustatik/fem-element`

  - **Breaking: drei Bindungsstufen.** `prepare(props, L, releases?)` bindet jetzt
    auch die Freisetzungen und kondensiert dabei einmal; die Last wandert hinter
    eine eigene Stufe:

    ```ts
    prepare(props, L, releases).withLoad(load).evaluate(dLocal);
    ```

    `PreparedElement.consistentLoad(load)` heißt damit
    `withLoad(load).consistentLoad()`. Grund: `evaluate` rechnet die Endverformung
    eines freigesetzten Freiheitsgrads aus `f[i]` der **unkondensierten** Last
    zurück, also aus buchstäblich demselben Vektor, den `consistentLoad`
    produziert hat. Zwei verschiedene Lasten ergäben eine falsche Endverformung
    _und_ falsche Stabendkräfte, beide plausibel aussehend — dieselbe Begründung
    wie ADR 0003 für `prepare`, eine Ebene weiter.

  - **Breaking: `PreparedElement.internalForces` entfällt**, ebenso
    `InternalForcesNotImplementedError`. An ihrer Stelle stehen reine Funktionen
    über den Auswertungszustand: `internalForcesAt(state, x, side?)` und
    `internalForcesStations(state)`.

  - **Neu: die statische Kondensation wohnt hier** (aus `fem-solver` gezogen).
    Ihre Umkehrung braucht Zeilen und Lastwerte, wie sie unmittelbar vor der
    jeweiligen Kondensation standen, und läuft in umgekehrter Reihenfolge — das
    kennt nur, wer kondensiert hat.

  - **Neu: `UnrestrainedElementError`.** `prepare` misst jedes Pivot gegen seinen
    unkondensierten Wert und wirft, wenn es zusammengebrochen ist.

  Die Rekonstruktion ist **theoriefrei**: derselbe Fall mit `GAs: 'rigid'` und mit
  endlichem `GAs` liefert identische Schnittgrößen (die Verformungen
  unterscheiden sich). Der Stoffgesetz-Weg ist ausdrücklich verworfen — beim
  beidseitig eingespannten Träger unter Gleichlast sind alle
  Knotenfreiheitsgrade null, und er meldete `M ≡ 0` statt `−qL²/12`.

  ## `@baustatik/fem-solver`

  - **Breaking: `SolveResult.elementEndForces` entfällt**, ersetzt durch
    `beamStates: Map<string, ElementEvaluationState>`. Die Zahlen leben als
    `beamStates.get(id).endForces` weiter; zwei Kopien wären beim Serialisieren
    zwei Dinge, die auseinanderlaufen können. Der Sechser heißt jetzt
    `[Fx1, Fz1, My1, Fx2, Fz2, My2]` — der alte Kommentar `[N1, V1, M1, …]` war
    irreführend, weil die Vorzeichen nicht übereinstimmen.

  - **Neu: die Verlauf-API.** `internalForcesAt(result, beamId, x, side?)` und
    `internalForcesAlong(result, beamId, opts?)`, freie Funktionen, keine
    Methoden am Ergebnis — sonst überlebte das Ergebnis keinen `structuredClone`.
    Sie lesen **niemals** `config`: weder Geometrie noch Lasten noch
    Querschnittswerte. Deshalb braucht ein abgelegtes Ergebnis auch keinen
    `modelRevision`-Stempel. Unbekannte `beamId` wirft `UnknownBeamError`.

  - **Breaking: `condense` und `endForces` sind aus `element-matrix.ts`
    verschwunden.** `transformationMatrix`, `rotateStiffness`, `rotateVector` und
    `toLocalVector` bleiben. Die Kondensation wird hier nur noch orchestriert:
    `prepareBeam` reicht `beam.releases` durch, die sechs `condense`-Aufrufe
    schrumpfen auf ein Argument.

  ## `@baustatik/fem`

  - **Breaking: neue Modellregel M6, `UnrestrainedBeamError`.** Zu viele
    Freisetzungen an einem Stab hinterlassen ihm eine Starrkörperbewegung **in
    sich**: `u` an beiden Enden, `w` an beiden Enden, oder drei Freisetzungen aus
    `{w, theta}` — der Biegeblock hat Rang 2 und trägt nur zwei Kondensationen.
    **`theta` an beiden Enden bleibt erlaubt**: der Pendelstab, der danach die
    Normalkraft weiter überträgt.

    Die Bedingung hängt an keiner Zahl (`EA`, `EI`, `L`, `phi` kürzen sich heraus),
    deshalb ist sie hier statisch entscheidbar. Sie **muss** hier stehen, weil der
    Fall sonst nirgends auffällt: nach der Kondensation trägt das Element zu den
    betroffenen Knotenfreiheitsgraden nichts mehr bei, `assertHeld` prüft die
    globale Diagonale, an der ein anderes Element steht, und alle vier Netze aus
    ADR 0016 bleiben still. Es kämen plausible Zahlen heraus.

    Verhaltenswechsel gegenüber ADR 0017: was dort „läuft still durch" war, wirft
    jetzt. Der Satz in `validate.ts`, ein längs gleitender Stab übertrage weiter
    Querkraft und Moment, gilt nur für **ein** Ende.

- 9290f16: Kinematik zeigt sich in der Verformung, nicht nur im Pivot: `solve()` beurteilt
  das Ergebnis, bevor es es herausgibt.

  Das Pivot-Kriterium aus
  [ADR 0012](../docs/adr/0012-kinematics-is-detected-by-the-solver.md) ist
  **einseitig**. Ein schräger Stab mischt über die Transformation `EA/L` und
  `12EI/L³` in dieselbe Zeile; nach der Auslöschung steht in `K` die exakte Matrix
  eines geringfügig anderen — tragfähigen — Modells. Ein Mechanismus lässt sich
  dann sauber zerlegen und liefert große, aber endliche Zahlen. Gemessen an rund
  250 Systemen: 24 von 132 kinematischen rutschen durch, mit Verdrehungen ab
  `3.3e10 rad` ([ADR 0016](../docs/adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md),
  Beleg in `docs/messungen/kinematik-abstand.md`).

  - **Neu: das vierte Netz.** `solve()` prüft je Knoten `|φ|` und je Stabende
    `|u|/L` gegen zwei Stufen. Über `warn` sammelt es eine
    `SmallRotationAssumptionWarning` — das Ergebnis verlässt den
    Gültigkeitsbereich der Theorie I. Ordnung. Über `fail` wirft es den neuen
    `ImplausibleDisplacementError`: das ist keine Verformung mehr, sondern eine
    Bewegung. Anders als beim Pivot-Hinweis ist der Knoten dabei **exakt**
    benennbar.

    Die Prüfung läuft **vor** der Rückrechnung — aus unbrauchbaren Verschiebungen
    sollen keine unbrauchbaren Schnittgrößen entstehen.

    Ehrliche Grenze: sie sieht den Mechanismus nur, wenn die Last ihn **anregt**.
    Deshalb ein viertes Netz und kein Ersatz für das Pivot; die Schwelle `1e-12`
    bleibt unverändert.

  - **Breaking: `SolveResult` trägt `warnings: SolveWarning[]`.** Neue schmale
    Warnungswurzel neben `ModelValidationWarning` und `LoadValidationWarning` — ein
    Befund an der Rechnung betrifft weder das Modell noch die Eingabe, sondern das,
    was aus beiden geworden ist. Ein Ergebnis, das seine Vorbehalte nicht kennt,
    kann man nicht ablegen.

  - **Breaking: `ANALYSIS_POLICY_SCHEMA_VERSION` 1 → 2.** Die `AnalysisPolicy`
    bekommt `deformationLimits` (`warn`/`fail` × `rotation`/`relativeDisplacement`,
    Defaults `0.1` / `1e3 rad` und `1e4`). Kein Migrationspfad: ein v1-Dokument
    scheitert am strikten Parser. Zulässig, weil `parseAnalysisPolicy` zum
    Zeitpunkt des Sprungs keinen produktiven Aufrufer hatte.

    Die Grenzen sind keine Plausibilitätsschätzung, sondern die Gültigkeitsgrenze
    der gerechneten Theorie (`sin φ ≈ φ`, Gleichgewicht am unverformten System) —
    und einheitenfrei, weil `rad` und `u/L` dimensionslos sind.
    `relativeDisplacement` bekommt eine Dekade mehr Luft, weil sie an der Feinheit
    der Eingabe hängt: derselbe 20-m-Kragarm misst `7.9` als ein Element und
    `1.6e2` als zwanzig.

  - `check.ts`, der Port-Vertrag und Rust/WASM bleiben unberührt. `check()` kann
    Kinematik weiterhin nicht vorhersagen — dieser Teil von ADR 0012 gilt
    unverändert.

- 9290f16: Lastfälle: eine Last existiert nur noch innerhalb eines Lastfalls, und der
  Lastfall besitzt sie.

  - **Neu, `@baustatik/actions`**: `ActionCategory`, das Einwirkungs-Vokabular nach
    EN 1990 — Klassifikation × konkrete Einwirkung, für Nutzlasten zusätzlich die
    Nutzungskategorie A–E. Ein Blatt mit **null** Abhängigkeiten, nur Begriffe:
    keine ψ-Werte, keine Kombinationsregeln. Liegt in einem eigenen Package, weil
    die künftige Kombinatorik `LoadCase` aus `fem-loads` braucht und `fem-loads`
    deshalb nicht umgekehrt von ihr abhängen darf
    ([ADR 0015](../docs/adr/0015-action-categories-live-in-a-leaf-package.md)).

  - **`fem-loads`**: neu `LoadCase`, `assertValidLoadCase`, `effectiveLoads` und
    `InvalidLoadCaseError`. Der Lastfall trägt Name, Lasten, optional einen Faktor
    und optional eine Einwirkungskategorie. Der Faktor dient dem Ableiten durch
    Kopieren — Wind umkehren mit −1, Einheitslasten skalieren mit 1,75 — und ist
    **kein** Kombinationsbeiwert; er muss endlich und ungleich 0 sein
    ([ADR 0013](../docs/adr/0013-load-case-factor.md)).

    Eine Zusicherung und bewusst **keine** `createLoadCase()`-Factory: ein Lastfall
    ist ein Datensatz, und eine Factory wäre per Objektliteral umgehbar. Deshalb
    läuft die Prüfung im Tor des Solvers.

    Das ist **kein** Breaking Change: alle bisherigen Typen, Prüfungen und
    Fehlerklassen sind unverändert, `resolveLoads` und `validateLoads` nehmen
    weiterhin eine flache Lastmenge. Der Lastfall ist eine Schicht darüber. Neue
    Abhängigkeit auf `@baustatik/actions`.

  - **Breaking, `fem-solver`**: `SolverConfig.getLoads()` wird zu
    `getLoadCases(): readonly LoadCase[]`, und `check()`/`solve()` nehmen die
    `loadCaseId` als Argument. Die Daten kommen weiter per PULL, die **Auswahl**
    ist ein Parameter — sonst läse der Rechenkopf Anwendungszustand und rechnete je
    nach Bedienung etwas anderes
    ([ADR 0014](../docs/adr/0014-load-case-selection-is-a-parameter-not-a-port.md)).
    Eine unbekannte oder veraltete id wirft den neuen `UnknownLoadCaseError`.
    `SolveResult` trägt zusätzlich `loadCaseId`; `CheckReport` bleibt unverändert,
    weil er flüchtig ist und nie abgelegt wird.

    Dazu neu `solveAll(): Promise<SolveResult[]>` — damit gibt es genau **zwei**
    Rechenoperationen und keine dritte: alle Lastfälle, oder ein bestimmter. Bricht
    beim ersten Fehler ab wie `solve()`. Das Tor prüft zusätzlich den Lastfall
    selbst (`assertValidLoadCase`), sonst lief ein Faktor von `NaN` bis zur
    Verformung durch.

    Das Tor prüft die **eingegebenen** Lastwerte, gerechnet wird mit den
    gefakterten — dieselbe Funktion versorgt den Viewer, damit am Pfeil nichts
    anderes steht als in der Rechnung.

  - **`fem-viewer` bleibt unberührt.** Der Port `getLoads()` ändert sich nicht: der
    Viewer zeigt immer genau einen Lastfall, und welcher das ist, weiß die
    Anwendung. Sie verdrahtet `getLoads: () => effectiveLoads(activeLoadCase)`.

### Minor Changes

- 605e904: Gelenke heißen jetzt lokal und gibt es in allen drei Freiheitsgraden.

  `Beam.releases` trug mit `phiY` den Namen der KNOTENwelt für eine Bedingung, die
  am **lokalen** Freiheitsgrad definiert ist — der Solver kondensiert sie aus der
  lokalen 6x6 heraus, vor der Drehung. Aufgefallen ist das nie, weil eine Drehung
  in der Ebene rahmeninvariant ist: `phiY` und `theta` unterscheiden sich nur im
  Vorzeichen, und ein Freisetzungs-Flag ist ein `true` und trägt kein Vorzeichen.
  Bei einer Verschiebung hört das auf — auf einem schrägen Stab ist ein Gleiten
  längs der Stabachse etwas anderes als ein globales `ux`.

  - **Breaking**: `{ phiY?: true }` heißt jetzt `BeamEndReleases = { u?: true;
w?: true; theta?: true }`, mit den lokalen Namen aus `@baustatik/fem-element`
    (`d_e = [u1, w1, theta1, u2, w2, theta2]`) — dieselbe Reihenfolge wie die
    Kondensationsindizes 0/1/2 und 3/4/5 im Solver. Migration: `phiY` → `theta`.
    Der Zeitpunkt ist bewusst gewählt: `releases` kommt außerhalb von `fem`,
    `fem-solver` und deren Tests nirgends vor, nichts speichert es, und die Demo
    kann es noch gar nicht setzen.
  - **Neu**: `u` (Normalkraftgelenk) und `w` (Querkraftgelenk). Nicht nach der
    nicht übertragenen Schnittgröße `{ N, V, M }` benannt, obwohl das näher am
    Sprachgebrauch läge: die Kondensation arbeitet an Freiheitsgraden, und ein
    zweites Vokabular davor wäre eine Übersetzung ohne Gegenwert
    ([ADR 0017](../docs/adr/0017-releases-are-named-in-the-local-frame.md)).
  - Eine freigesetzte VERSCHIEBUNG nimmt dem Stab die betreffende Steifigkeit
    ganz, nicht nur am freigesetzten Ende: nach der Kondensation von `u1` ist
    `K[u2][u2] = EA/L - (EA/L)^2/(EA/L)` exakt 0. Fachlich richtig — ein Stab, der
    an einer Stelle gleitet, trägt nirgends Normalkraft. Folge davon ist, dass ein
    zweites `u`-Gelenk am anderen Ende einen Pivot von exakt 0 trifft;
    `condense` kehrt dort still zurück. Dieser Zweig galt bisher als Schutz gegen
    „widersprüchliche Eingaben" und wurde von nichts erreicht — er hat jetzt einen
    ehrlichen Kommentar und einen Test.
  - Verboten wird nichts. Aus demselben Grund, mit dem der Pendelstab ausdrücklich
    erlaubt ist: ein längs gleitender Stab überträgt weiterhin Querkraft und
    Moment und ist für sich kein Mechanismus. Ob das System kinematisch wird,
    entscheidet das Gleichungssystem.

### Patch Changes

- Updated dependencies [605e904]
- Updated dependencies [8a2beb1]
- Updated dependencies [abba606]
- Updated dependencies [1bb918d]
- Updated dependencies [9290f16]
  - @baustatik/fem@1.0.0
  - @baustatik/errors@0.1.0
  - @baustatik/fem-element@1.0.0
  - @baustatik/fem-load-resolve@0.1.0
  - @baustatik/fem-loads@0.1.0
  - @baustatik/fem-geometry@0.0.2
