# @baustatik/actions

## 0.1.0

### Minor Changes

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
