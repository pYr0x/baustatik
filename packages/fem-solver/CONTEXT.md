# `@baustatik/fem-solver`

## Purpose

Der Einstiegspunkt der Berechnung. `createFEMSolver(config)` ist das
Gegenstueck zu `createFEMViewer`: Rohdaten per PULL herein, ein kleines Objekt
mit `check()` und `solve()` heraus, alles dazwischen verborgen.

```
Store                     createFEMViewer  ->  zeichnen
nodes/beams/supports/  <
loads                     createFEMSolver  ->  pruefen und rechnen
```

**Stand:** beides laeuft. `check()` liefert einen Zustand, `solve()` liefert
Verformungen, Auflagerkraefte und Stabendkraefte. Schnittgroessenverlaeufe
fehlen — siehe _Known constraints_.

## Boundaries

- Owns: den Einstiegspunkt und die Reihenfolge der Rechenkette; den
  Pruefbericht; die Freiheitsgrad-Nummerierung; die statische Kondensation der
  Gelenke; die 6x6-Transformation lokal -> global; die Assemblierung; die
  Randbedingungen per Elimination; die Rueckrechnung der Auflager- und
  Stabendkraefte. Dazu die **Composition-Root-Rolle fuer die
  `AnalysisPolicy`**: die versionierte Gesamtform, ihren Parser und die eigenen
  Analyse-Entscheidungen (heute `shearDeformation`).
- Does not own: die Modellregeln (`@baustatik/fem`), die Lastregeln
  (`@baustatik/fem-loads`) **samt deren Stellschrauben** — die
  `LoadValidationPolicy` gehoert ihrem Regel-Eigentuemer, dieses Package setzt
  sie nur zusammen —, die Aufloesung in lokale Elementlasten
  (`@baustatik/fem-load-resolve`), die Elementformulierung samt
  Ersatzknotenvektor (`@baustatik/fem-element`), den eigentlichen linearen
  Loeser `K d = F` (`@baustatik/linear-solver-wasm`, per PORT) und jede
  Darstellung.
- Haelt **keinen** Zustand ueber das Modell — und auch keinen ueber das
  Ergebnis. Die Config traegt Getter, keine Arrays; es gibt keinen zweiten
  Datenbestand neben dem Store und keinen aufgehobenen Bericht.

## Dependencies

- `@baustatik/errors` — `BaustatikError`.
- `@baustatik/fem` — `Node`, `Beam`, `NodeSupport`, `validateModel`,
  `assertValidModel`, `isolatedNodeIds` und `ModelValidationError` als
  Erweiterungsstelle.
- `@baustatik/fem-loads` — `FEMLoad`, `modelGeometry`, `validateLoads`,
  `assertValidLoads`, `LoadValidationWarning` als Erweiterungsstelle, und die
  Fehlerklassen, die unveraendert durchgereicht werden.
- `@baustatik/fem-load-resolve` — `resolveLoads`.
- `@baustatik/fem-element` — `Timoshenko2D`, `SectionProperties`, `Vector6`.
- `@baustatik/fem-geometry` — `Line`, `Vector` fuer Stablaenge und Richtung.

**Nicht dabei:** `@baustatik/linear-solver-wasm`, `@baustatik/cross-section`,
`@baustatik/material`. Alle drei kaemen ueber Ports herein
([ADR 0009](../../docs/adr/0009-fem-solver-ports-and-async-solve.md)).

## Navigation

- [`src/config.ts`](src/config.ts): `SolverConfig` — vier Getter, drei Ports,
  eine Policy.
- [`src/policy.ts`](src/policy.ts): `AnalysisPolicy` — die versionierte,
  persistierbare Analyse-Einstellung samt Factory und striktem Parser.
- [`src/analysis.ts`](src/analysis.ts): `ResolvedAnalysis` — die Config einmal
  zu Ende gedacht: effektive Policy, gebundener Lastvalidator, Formulierung.
- [`src/check.ts`](src/check.ts): `CheckReport`, die fuenf Zustaende, die
  Reihenfolge und der Kurzschluss.
- [`src/solve.ts`](src/solve.ts): die Rechenkette von den Rohdaten bis zu den
  Stabendkraeften.
- [`src/element-matrix.ts`](src/element-matrix.ts): Kondensation und
  Transformation auf der lokalen 6x6 — theoriefrei.
- [`src/errors.ts`](src/errors.ts): zwei Erweiterungen fremder Hierarchien und
  zwei eigene Rechenfehler.
- [`src/solver.ts`](src/solver.ts): `createFEMSolver`.

## Domain language

- **Rechenkopf** — das von `createFEMSolver` zurueckgegebene Objekt. Kein
  Speicher, sondern ein Blick auf den Store durch die Getter der Config.
- **PULL** — die Config nennt Funktionen (`getNodes: () => store.nodes`), nicht
  Werte. Jeder Aufruf sieht den aktuellen Stand. Dasselbe Muster wie im
  `fem-viewer`.
- **Port** — eine Faehigkeit, die dieses Package bewusst nicht besitzt:
  `getSectionProperties`, `solveLinearSystem`, `formulation`. Alle drei
  existieren aus EINEM Grund — Isolierbarkeit. Ohne sie waere ausgerechnet das
  Package, das die ganze Kette verdrahtet, nicht allein pruefbar.
- **Analyse-Einstellung** — alles, was die Rechnung steuert, ohne das Modell zu
  aendern. Der Querschnitt einer Stuetze gehoert zum Modell; ob ihre
  Schubverformung beruecksichtigt wird, ist eine Einstellung.
- **`AnalysisPolicy`** — die Analyse-Einstellungen der Sorte DATEN: vollstaendig,
  unveraenderlich, versioniert, als JSON schreibbar. Siehe den Abschnitt unten.
- **Composition Root** — dieses Package setzt die Policy-Scheiben der anderen
  Packages mit seinen eigenen Entscheidungen zusammen. Es besitzt die
  Gesamtform, nicht die fremden Regeln.
- **Effektive Policy** — `config.analysisPolicy ?? DEFAULT_ANALYSIS_POLICY`.
  Immer vollstaendig; „nicht gesetzt" gibt es innerhalb der Policy nicht.
- **Bericht** (`CheckReport`) — die eine Auskunft vor dem Rechnen. Traegt einen
  ZUSTAND, keine Fehlerliste.
- **Tor** — `assertValidModel`, dann `assertValidLoads`, vor jeder Rechnung. Der
  Bericht ist eine Auskunft, kein Schluessel.
- **Kondensation** — das Herausrechnen eines freigesetzten Freiheitsgrads aus
  der lokalen 6x6. Reine Matrixalgebra, ohne Balkentheorie.

## Der Bericht: fuenf Zustaende

```text
empty                kein Stab                      nichts zu pruefen
invalid              Modell- ODER Lastfehler        hartes Tor
unloaded             Modell traegt, keine Last      pruefbar, nicht rechenbar
ready-with-warnings  nur Hinweise                   Rechnen erlaubt
ready                sauber                         Rechnen
```

Rangfolge, erster Treffer gewinnt. `empty` heisst **kein Stab** — der Stab ist
das, woran gerechnet wird. `canSolve` ist aus `state` ABGELEITET, nicht daneben
gespeichert.

`unloaded` gegen `invalid` ist der Grund, aus dem es den Bericht ueberhaupt
gibt: ein Modell ohne Lasten ist nicht falsch, es ist nur nicht rechenbar. Eine
Fehlerliste kann das nicht sagen. Ausfuehrlich in
[ADR 0010](../../docs/adr/0010-check-report-is-a-state-machine.md).

## Die Analyse-Einstellung: zwei Sorten, eine davon persistiert

Analyse-Einstellungen zerfallen in zwei Sorten, und die Trennlinie ist der ganze
Entwurf:

| Sorte | Beispiele | Wohnt in | Persistiert |
| --- | --- | --- | --- |
| **Daten** — schreibbar als JSON | Toleranzen, Warnschwellen, `shearDeformation` | `AnalysisPolicy` | ja, versioniert |
| **Faehigkeit** — ist Code | `formulation`, `solveLinearSystem`, `getSectionProperties` | Ports in `SolverConfig` | nein |

`formulation` ist begrifflich sehr wohl eine Analyse-Einstellung — sie laesst
sich nur nicht schreiben. Ein Funktionsobjekt hat keine JSON-Form. Dieselbe
Regel erklaert `solveLinearSystem`: „direkt oder iterativ" waere eine
persistierbare Einstellung, „diese Solver-Implementierung" ist ein Port.

```text
AnalysisPolicy = {
  schemaVersion:     1                       Eigentuemer: fem-solver
  loads:             LoadValidationPolicy    Eigentuemer: fem-loads
  shearDeformation:  boolean (Default true)  Eigentuemer: fem-solver
}
```

**Jedes Package bringt seine eigene Scheibe mit** — samt Default und
Werteprueferei. Dieses Package setzt sie zusammen: `createAnalysisPolicy`
delegiert jede fremde Scheibe an die Factory ihres Regel-Eigentuemers und
reicht deren Fehler unveraendert durch. Dafuer kommt keine Package-Grenze hinzu.

**Die persistierte Form ist die vollstaendige effektive Policy**, nicht die
Abweichungen: sonst rechnete dasselbe Projekt nach einer Aenderung der
Software-Defaults still anders. `parseAnalysisPolicy` prueft deshalb erst die
VERSION und dann die Form — ein Dokument aus einer neueren Fassung traegt
legitim unbekannte Felder, und `UnsupportedAnalysisPolicySchemaVersionError` ist
darauf die richtige Auskunft, nicht „unbekanntes Feld".

**App-weite Weitergabe.** Die Anwendung ruft EINMAL
`createAnalysisPolicy(overrides)` und reicht exakt dasselbe unveraenderliche
Objekt weiter:

```typescript
const analysis = createAnalysisPolicy({ shearDeformation: false });

createFEMSolver({ ...ports, analysisPolicy: analysis });   // rechnet
createLoadValidator(analysis.loads);                        // Eingabedialog
```

Der Eingabedialog geht nicht ueber dieses Package (ADR 0007) — genau deshalb
muss er dieselbe Policy binden koennen. Sonst akzeptierte er, was der
Rechnen-Knopf ablehnt. `SolverConfig` nimmt darum auch keine Overrides entgegen:
es gaebe sonst zwei Orte, an denen dieselbe Rechnung unterschiedlich
zusammengesetzt werden koennte.

UI, Store-Wiring und Projektmigrationen sind noch nicht gebaut; das Datenmodell
und der strikte Parser sind die Naht dafuer. Ausfuehrlich in
[ADR 0011](../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md).

## Invariants and conventions

- **Der Eingabedialog geht NICHT ueber dieses Package.** Er prueft Entwuerfe
  direkt gegen `@baustatik/fem-loads`, weil `getLoads()` eine noch nicht
  gespeicherte Last nicht sieht. Siehe
  [ADR 0007](../../docs/adr/0007-fem-solver-as-calculation-entry-point.md).
- **Modell zuerst, Lasten nur wenn es traegt.** Reihenfolge und Kurzschluss
  gehoeren ins Package: die Lastpruefung fragt das Modell, also erzeugt ein
  Modellfehler sonst zwanzig Folgefehler. Bei Modellfehlern steht im Bericht
  `loads: { assessed: false }` — nicht eine leere Liste.
- **Keine eigenen Last- oder Modellfehler**, ausser wo das Wissen wirklich nur
  hier liegt. Die Beanstandungen aus `fem` und `fem-loads` werden unveraendert
  weitergereicht.
- **Kein Cache.** Bericht und Geometrie werden je Aufruf neu gebaut. Der Bericht
  veraltet, sobald der Store sich aendert — das zu bemerken ist Sache der
  Anwendung (`store.$subscribe`), nicht des Packages.
- **`solve()` prueft trotz `check()` selbst nach.** Wer den Bericht ueberspringt,
  darf nicht am Tor vorbei (`error-handling-in-libraries.md`). Warnungen halten
  nichts auf.
- **Erst kondensieren, dann drehen.** Das Gelenk ist am LOKALEN Freiheitsgrad
  definiert; nach der Drehung gibt es ihn als eigene Zeile nicht mehr.
- **`consistentLoad` wird MITkondensiert.** Wer nur `K` kondensiert, bekommt fuer
  eine Gleichlast auf einem Gelenkstab falsche Ersatzknotenlasten — plausible,
  falsche Zahlen. Der Beleg dafuer ist der Kragtraeger mit Endstuetze: ohne
  Gelenk 5qL/8 und 3qL/8, mit Gelenk qL/2 und qL/2.
- **Das `-1` in der phiY-Zeile der Transformation** ist die eine Haelfte von
  `phiY = -theta` (ADR 0005). Die andere sitzt in `fem-load-resolve`
  (`my_e = -m`); beide heben sich auf. Der 3x3-Block hat `det = -1`, ist aber
  orthogonal, sodass `T^T K T` gueltig bleibt.
- **Knotenlasten bekommen KEINEN Vorzeichenwechsel** — sie laufen nie durch ein
  Element.
- **Auflagerkraefte sind die Kraft, die das Auflager auf das TRAGWERK ausuebt.**
  Damit gilt `Summe Lasten + Summe Auflagerkraefte = 0`, und die
  Gleichgewichtsprobe faellt direkt als Test an. Freigegebene Richtungen tragen
  exakt 0.
- **Der Schub-Schalter ersetzt `GAs`, er befragt nicht den Querschnitt.** Jeder
  Querschnitt HAT eine Schubsteifigkeit; sie zu vernachlaessigen ist eine
  Entscheidung ueber die Analyse und lebt deshalb in der `AnalysisPolicy` — als
  Daten, nicht als Port, und genau EINMAL (nicht zusaetzlich auf
  `SolverConfig`).
- **Die Konfiguration wird EINMAL aufgeloest.** `createFEMSolver` baut
  `ResolvedAnalysis` beim Erzeugen; `check()` und `solve()` benutzen denselben
  Kontext, statt ihre Defaults unabhaengig voneinander zu waehlen. Kein
  Widerspruch zum PULL: die Getter liefern MODELLDATEN, die sich aendern
  duerfen; eine Einstellung, die sich unter der Hand aendert, waere keine.
- **Eine gesetzte Custom-Formulierung gewinnt vollstaendig.** Kein Wrapper,
  keine Kompatibilitaetspruefung, keine Erweiterung des generischen
  Formulierungsinterfaces.
- **Randbedingungen per Elimination**, nicht per Strafverfahren: ein grosser
  Diagonalwert verschmutzt die Kondition und liefert die Auflagerkraft nur als
  Produkt aus erfundener Steifigkeit und Restverschiebung.

## Validation

```text
pnpm --filter @baustatik/fem-solver typecheck
pnpm --filter @baustatik/fem-solver test
```

Die Tests decken die fuenf Zustaende einzeln ab, den Kurzschluss, das
PULL-Verhalten, und fuer `solve()` in dieser Reihenfolge:

1. **Triviale Formulierung** (Einheitssteifigkeit, fester Lastvektor) fuer
   Nummerierung, Assemblierung, Transformation und Elimination mit Zahlen, die
   im Kopf nachzurechnen sind. Genau dafuer ist `formulation` ein Port.
2. **Kragarm** ohne Schub gegen `w = PL^3/3EI` und `phi = -PL^2/2EI`.
3. **Kragarm mit Schub** gegen `w = PL^3/3EI + PL/GAs`.
4. **Einfeldtraeger mit Gleichlast** gegen `5qL^4/384EI` und `qL/2`.
5. **Schraeger Stab**: derselbe Kragarm um 30 Grad gedreht muss das gedrehte
   Ergebnis liefern, `phiY` unveraendert. Der einzige Test, der die
   Transformation wirklich prueft.
6. **Gelenke**: `12EI/L^3` wird zu `3EI/L^3`, die Stabendkraft am freigesetzten
   Freiheitsgrad ist exakt 0, und der Kragtraeger mit Endstuetze belegt die
   MITkondensierte Last.
7. **Gleichgewichtsprobe** ueber alle Modelle — der einzige Test, der die ganze
   Kette auf einmal prueft.
8. **Kinematik**: Pendelstab ohne Verspannung, und der Starrkoerpermodus mit
   besetzter Diagonale.

Die Handrechnung gegen den ECHTEN Rust-Loeser steht in
`apps/demo/fem-cantilever.ts`.

## Known constraints

- **Keine Schnittgroessenverlaeufe.** `solve()` liefert Stabendkraefte, aber
  keine Verlaeufe zwischen den Knoten: `internalForces` in `@baustatik/fem-element`
  ist selbst noch ein Stub.
- **Die Verdrehung am freigesetzten Stabende geht verloren.** Fuer Verformungen,
  Auflager- und Stabendkraefte folgenlos; fuer spaetere Verlaeufe muss sie
  zurueckgerechnet werden.
- **Fast singulaere Systeme werden NICHT erkannt.** `SingularStiffnessMatrixError`
  faellt erst bei `NaN`/`Infinity`; eine fast singulaere Matrix liefert grosse,
  aber endliche Zahlen. Eine Residuenprobe hilft dagegen ausdruecklich NICHT: LU
  mit Spaltenpivotierung hat auch dort einen winzigen Rueckwaertsfehler. Noetig
  waere eine Konditionsschaetzung aus `faer`, also die Rust-Seite von
  `@baustatik/linear-solver-wasm`.
- **Der Port wird nicht auf Vertragstreue geprueft.** Eine Fassung, die `K`
  spaltenweise statt zeilenweise liest, liefert still falsche Verformungen.
- **Keine Lastfaelle und Kombinationen.** Der Bericht kennt genau EINEN Satz
  Lasten; mit Lastfaellen wuerde aus `canSolve` ein `canSolve(caseId)`.
- **Ein Stab = ein Element.** Kein Meshing; das Element ist fuer den geraden,
  prismatischen Stab exakt.
- **Kein Querschnitts- und Materialkatalog.** `getSectionProperties` ist die
  Naht dafuer; heute liefert die Anwendung feste Zahlen.
