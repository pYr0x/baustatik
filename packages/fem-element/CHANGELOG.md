# @baustatik/fem-element

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

### Patch Changes

- Updated dependencies [8a2beb1]
  - @baustatik/errors@0.1.0
