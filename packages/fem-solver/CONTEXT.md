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
Verformungen, Auflagerkraefte und je Stab einen Auswertungszustand, aus dem
`internalForcesAt`/`internalForcesAlong` die Schnittgroessen `N`, `V` und `M` an
jeder Stelle beantworten. Die Biegelinie fehlt — siehe _Known constraints_.

## Boundaries

- Owns: den Einstiegspunkt und die Reihenfolge der Rechenkette; den
  Pruefbericht; die Freiheitsgrad-Nummerierung; die ORCHESTRIERUNG der
  Kondensation — welcher Stab welche Freisetzungen hat, nicht mehr die
  Mechanik; die 6x6-Transformation lokal -> global; die Assemblierung; die
  Randbedingungen per Elimination; die Rueckrechnung der Auflagerkraefte; die
  Verlauf-API `internalForcesAt`/`internalForcesAlong` als freie Funktionen ueber
  das Ergebnis. Dazu die **Composition-Root-Rolle fuer die
  `AnalysisPolicy`**: die versionierte Gesamtform, ihren Parser und die eigenen
  Analyse-Entscheidungen (heute `shearDeformation`).

  DIE KONDENSATION SELBST liegt seit
  [ADR 0018](../../docs/adr/0018-section-forces-from-equilibrium.md) in
  `@baustatik/fem-element`: ihre Umkehrung — die Endverformung eines
  freigesetzten Freiheitsgrads zurueckrechnen — braucht die Zeilen und
  Lastwerte, wie sie unmittelbar VOR der jeweiligen Kondensation standen, und
  die kennt nur, wer kondensiert hat. Dieses Package reicht `beam.releases`
  durch und bekommt K und f fertig kondensiert zurueck.
- Does not own: die Modellregeln (`@baustatik/fem`), die Lastregeln
  (`@baustatik/fem-loads`) **samt deren Stellschrauben** — die
  `LoadValidationPolicy` gehoert ihrem Regel-Eigentuemer, dieses Package setzt
  sie nur zusammen —, die Aufloesung in lokale Elementlasten
  (`@baustatik/fem-load-resolve`), die Elementformulierung samt
  Ersatzknotenvektor (`@baustatik/fem-element`), den eigentlichen linearen
  Loeser `K d = F` **samt der Erkennung, dass es keine Loesung gibt**
  (`@baustatik/linear-solver-wasm`, per PORT) und jede Darstellung. Von der
  Kinematik gehoert diesem Package die DEUTUNG — aus einer Zeilennummer Knoten
  und Richtung zu machen, weil nur hier die Abbildung `free[i]` liegt — und die
  Beurteilung des ERGEBNISSES: ob das, was herauskam, eine Verformung ist oder
  eine Bewegung. Der Loeser kann das nicht wissen; er sieht nur Zahlen.
- Haelt **keinen** Zustand ueber das Modell — und auch keinen ueber das
  Ergebnis. Die Config traegt Getter, keine Arrays; es gibt keinen zweiten
  Datenbestand neben dem Store und keinen aufgehobenen Bericht.

## Dependencies

- `@baustatik/errors` — `BaustatikError`.
- `@baustatik/fem` — `Node`, `Beam`, `NodeSupport`, `validateModel`,
  `assertValidModel`, `isolatedNodeIds` und `ModelValidationError` als
  Erweiterungsstelle.
- `@baustatik/fem-loads` — `LoadCase`, `effectiveLoads` und
  `assertValidLoadCase`, dazu `modelGeometry`, `validateLoads`,
  `assertValidLoads`, `LoadValidationWarning` als Erweiterungsstelle, und die
  Fehlerklassen, die unveraendert durchgereicht werden.
- `@baustatik/fem-load-resolve` — `resolveLoads`.
- `@baustatik/fem-element` — `Timoshenko2D`, `SectionStiffness`, `Vector6`.
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
- [`src/resolve-load-case.ts`](src/resolve-load-case.ts): von der id zum
  Lastfall. Package-intern und von `check()` und `solve()` geteilt, damit der
  Bericht nie einen anderen Fall beurteilt als die Rechnung nimmt.
- [`src/check.ts`](src/check.ts): `CheckReport`, die fuenf Zustaende, die
  Reihenfolge und der Kurzschluss.
- [`src/solve.ts`](src/solve.ts): die Rechenkette von den Rohdaten bis zu den
  Auswertungszustaenden der Staebe.
- [`src/internal-forces.ts`](src/internal-forces.ts): die Verlauf-API
  `internalForcesAt`/`internalForcesAlong` als FREIE Funktionen ueber das
  Ergebnis — keine Methoden, weil `SolveResult` klonbar bleiben muss (ADR 0019).
- [`src/element-matrix.ts`](src/element-matrix.ts): die Transformation auf der
  lokalen 6x6 — theoriefrei. Die Kondensation stand hier und liegt seit
  ADR 0018 in `@baustatik/fem-element`.
- [`src/errors.ts`](src/errors.ts): zwei Erweiterungen fremder Hierarchien, die
  eigenen Rechenfehler, `UnknownLoadCaseError` fuer eine Lastfall-id und
  `UnknownBeamError` fuer eine Stab-id, die es nicht gibt, und `SolveWarning`
  als eigene schmale Wurzel fuer Befunde am ERGEBNIS.
- [`src/solver.ts`](src/solver.ts): `createFEMSolver`.

## Domain language

- **Rechenkopf** — das von `createFEMSolver` zurueckgegebene Objekt. Kein
  Speicher, sondern ein Blick auf den Store durch die Getter der Config.
- **PULL** — die Config nennt Funktionen (`getNodes: () => store.nodes`), nicht
  Werte. Jeder Aufruf sieht den aktuellen Stand. Dasselbe Muster wie im
  `fem-viewer`.
- **Port** — eine Faehigkeit, die dieses Package bewusst nicht besitzt:
  `getSectionStiffness`, `solveLinearSystem`, `formulation`. Alle drei
  existieren aus EINEM Grund — Isolierbarkeit. Ohne sie waere ausgerechnet das
  Package, das die ganze Kette verdrahtet, nicht allein pruefbar.
- **Lastfall** — die Einheit, die dieses Package rechnet: genau einer je
  `solve()`. Er kommt aus `@baustatik/fem-loads` und besitzt seine Lasten.
- **Auswahl** — welcher Lastfall gerechnet wird. Sie ist ein ARGUMENT und kein
  Getter: Daten liefert der Store per PULL, was mit ihnen geschehen soll, sagt
  der Aufrufer.
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
- **Tor** — `assertValidModel`, dann `assertValidLoadCase`, dann
  `assertValidLoads`, vor jeder Rechnung. Der Bericht ist eine Auskunft, kein
  Schluessel.
- **Kondensation** — das Herausrechnen eines freigesetzten Freiheitsgrads aus
  der lokalen 6x6. Reine Matrixalgebra, ohne Balkentheorie. Welcher Index
  gemeint ist, sagt der Name im Modell: `u`/`w`/`theta` sind die LOKALEN
  Freiheitsgrade in der Reihenfolge 0/1/2 am Anfang und 3/4/5 am Ende
  ([ADR 0017](../../docs/adr/0017-releases-are-named-in-the-local-frame.md)).

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

| Sorte                           | Beispiele                                                  | Wohnt in                | Persistiert     |
| ------------------------------- | ---------------------------------------------------------- | ----------------------- | --------------- |
| **Daten** — schreibbar als JSON | Toleranzen, Warnschwellen, `shearDeformation`              | `AnalysisPolicy`        | ja, versioniert |
| **Faehigkeit** — ist Code       | `formulation`, `solveLinearSystem`, `getSectionStiffness` | Ports in `SolverConfig` | nein            |

`formulation` ist begrifflich sehr wohl eine Analyse-Einstellung — sie laesst
sich nur nicht schreiben. Ein Funktionsobjekt hat keine JSON-Form. Dieselbe
Regel erklaert `solveLinearSystem`: „direkt oder iterativ" waere eine
persistierbare Einstellung, „diese Solver-Implementierung" ist ein Port.

```text
AnalysisPolicy = {
  schemaVersion:      2                       Eigentuemer: fem-solver
  loads:              LoadValidationPolicy    Eigentuemer: fem-loads
  shearDeformation:   boolean (Default true)  Eigentuemer: fem-solver
  deformationLimits:  warn/fail x rotation/   Eigentuemer: fem-solver
                      relativeDisplacement
}
```

**Version 2 hat keinen Migrationspfad.** Ein v1-Dokument kennt
`deformationLimits` nicht und scheitert am strikten Parser. Das ist zulaessig,
weil `parseAnalysisPolicy` zum Zeitpunkt des Sprungs keinen produktiven Aufrufer
hatte — es liegt nichts Persistiertes herum. Ein stillschweigend ergaenzter
Default waere ausserdem eine Einstellung, die der Anwender nie gewaehlt hat.

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

createFEMSolver({ ...ports, analysisPolicy: analysis }); // rechnet
createLoadValidator(analysis.loads); // Eingabedialog
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

- **Daten kommen per PULL, die AUSWAHL als Parameter.** `getLoadCases()` liefert
  alle Lastfaelle; welcher gerechnet wird, sagt das Argument von
  `check(loadCaseId)` / `solve(loadCaseId)`. „Welcher Lastfall ist aktiv" ist
  Zustand der Anwendung, und ein Rechenkopf, der ihn liest, rechnet je nach
  Bedienung etwas anderes. Unbekannte id wirft `UnknownLoadCaseError` — kein
  sechster Berichtszustand, denn das Modell ist in Ordnung, die Frage war falsch
  gestellt. Siehe
  [ADR 0014](../../docs/adr/0014-load-case-selection-is-a-parameter-not-a-port.md).
- **Das Tor sieht die EINGEGEBENEN Lastwerte, die Rechnung die gefakterten.**
  `assertValidLoads` bekommt `loadCase.loads`, `resolveLoads` bekommt
  `effectiveLoads(loadCase)`. Beide Wege gehen durch dieselbe Funktion, die auch
  der Viewer benutzt ([ADR 0013](../../docs/adr/0013-load-case-factor.md)).
- **Der Eingabedialog geht NICHT ueber dieses Package.** Er prueft Entwuerfe
  direkt gegen `@baustatik/fem-loads`, weil `getLoadCases()` eine noch nicht
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
  definiert; nach der Drehung gibt es ihn als eigene Zeile nicht mehr. Bei der
  Verdrehung faellt das nicht auf (rahmeninvariant), bei `u` auf einem schraegen
  Stab sehr wohl (ADR 0017).
- **Eine freigesetzte VERSCHIEBUNG nimmt die Steifigkeit GANZ.** Nach der
  Kondensation von `u1` ist `K[u2][u2] = EA/L - (EA/L)^2/(EA/L)` exakt 0 — ein
  Stab, der an einer Stelle gleitet, traegt nirgends Normalkraft. Deshalb
  trifft ein zweites `u`-Gelenk am anderen Ende einen Pivot von exakt 0, und
  `condense` kehrt dort still zurueck. Das ist der gerade Weg, kein Notausgang.
  Beim Momentengelenk gibt es das nicht: dort bleibt `3EI/L` stehen.
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
- **Der Schub-Schalter ersetzt `GAs`, er befragt nicht den Querschnitt.** Eine
  vorhandene Schubsteifigkeit zu vernachlaessigen ist eine Entscheidung ueber
  die Analyse und lebt deshalb in der `AnalysisPolicy` — als Daten, nicht als
  Port, und genau EINMAL (nicht zusaetzlich auf `SolverConfig`).
- **Der Schalter wirkt nur in EINE Richtung.** „Jeder Querschnitt HAT eine
  Schubsteifigkeit" stand hier bis P2 und ist seither falsch: der
  Editor-Querschnitt liefert `EA` und `EI`, aber kein κ, also `GAs: 'rigid'`.
  `shearDeformation: true` macht daraus keine Schubverformung, sondern rechnet
  still steifer als eingestellt. Deshalb meldet `check()` die
  `ShearDeformationUnavailableWarning` (M8) nach `model.warnings` — der Zustand
  bleibt `ready-with-warnings`, gerechnet wird
  ([ADR 0035](../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md)).
  Zur Check-Zeit kann `'rigid'` **nur** aus dem Querschnitt kommen, weil der
  Policy-Schalter erst in `solve()` greift.
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
- **Ein Ergebnis verlaesst dieses Package nur, wenn es eine VERFORMUNG ist und
  keine Bewegung.** `assessDisplacements` prueft `|phiY|` je Knoten und `|u|/L`
  je Stabende gegen zwei Stufen aus der `AnalysisPolicy`: ueber `warn` (0.1) eine
  `SmallRotationAssumptionWarning` in `SolveResult.warnings`, ueber `fail`
  (1e3 rad / 1e4) ein `ImplausibleDisplacementError`. Beide Groessen sind
  dimensionslos, die Grenzen deshalb einheitenfrei und modellunabhaengig. Die
  Pruefung laeuft VOR der Rueckrechnung — aus unbrauchbaren Verschiebungen sollen
  keine unbrauchbaren Schnittgroessen entstehen. Siehe
  [ADR 0016](../../docs/adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md).
- **Vier gestaffelte Netze gegen Kinematik**, in dieser Reihenfolge — und VOR
  allen vieren steht seit Stufe 2 die Modellpruefung: der ELEMENTINTERNE
  Mechanismus (`u` an beiden Enden, `w` an beiden Enden, drei Freisetzungen aus
  dem Biegeblock) wird als `UnrestrainedBeamError` in `@baustatik/fem`
  abgefangen. Er MUSS dort abgefangen werden, weil ihn keines der vier Netze
  sieht: nach der Kondensation traegt das Element zu den betroffenen
  Knotenfreiheitsgraden nichts mehr bei, und `assertHeld` prueft die GLOBALE
  Diagonale, an der ein anderer Stab oder ein Auflager steht. Der Solver rechnete
  sonst still durch und lieferte plausible Zahlen.
  1. `assertHeld` — leere Diagonale eines freien Freiheitsgrads. Billig, laeuft
     vor dem Port, und der EINZIGE Fall, der sich exakt benennen laesst
     (Pendelstab).
  2. Der Port meldet `kind: 'singular'` — der allgemeine Fall, aus der
     Cholesky-Zerlegung in `@baustatik/linear-solver-wasm`. Faengt auch die
     FAST singulaere Matrix, die frueher grosse, aber endliche Zahlen lieferte.
  3. `Number.isFinite` auf dem Ergebnis — die Absicherung gegen eine
     Port-Fassung, die den Vertrag nicht erfuellt. Sollte nie greifen.
  4. `assessDisplacements` am ERGEBNIS. Netz 2 ist EINSEITIG: ein Pivot unter der
     Schwelle ist sicher ein Mechanismus, die Gegenrichtung beweist nichts. Ein
     schraeger Stab mischt `EA/L` und `12EI/L^3` in dieselbe Zeile, und nach der
     Ausloeschung steht in `K` die exakte Matrix eines geringfuegig anderen,
     tragfaehigen Modells — ein Rueckwaertsfehler, den keine Zerlegung
     zurueckholt. Der Mechanismus zerstoert das Pivot in der zwoelften Stelle,
     blueht in der Loesung aber um zehn Groessenordnungen auf.
     EHRLICHE GRENZE: Netz 4 sieht den Mechanismus nur, wenn die Last ihn ANREGT.
     Eine Last, deren Resultierende durch den Drehpunkt zeigt, erzeugt keine
     Bewegung — deshalb ein viertes Netz und kein Ersatz fuer das dritte.
- **Kinematik ist ein ERGEBNIS des Ports, kein Wurf.** Ein Mechanismus ist eine
  Aussage ueber das Modell, kein Fehler des Ports; der Wurf bleibt dem echten
  Scheitern vorbehalten (kaputter Worker, gebrochener Vertrag). Nur so sind die
  beiden hinterher noch zu trennen. Siehe ADR 0012.
- **`check()` kann Kinematik grundsaetzlich nicht wissen.** Sie ist keine
  Eigenschaft eines einzelnen Knotens, Stabs oder Auflagers, sondern ihres
  Zusammenspiels, und wird erst in der Zerlegung sichtbar. `canSolve` heisst
  „keine Regelverletzung gefunden", NIE „wird gelingen" — der Zustandsautomat
  bekommt dafuer keinen sechsten Zustand. Ein topologischer Vorabtest
  (Abzaehlkriterium) waere notwendig, aber nicht hinreichend: er haelt einen
  verschieblichen Rahmen mit der richtigen Auflagerzahl fuer stabil.

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
   MITkondensierte Last. Dazu die beiden Verschiebungsgelenke: `u` nimmt die
   Normalkraft an BEIDEN Enden heraus, `w` macht aus `4EI/L` die `EI/L`, weil
   bei fehlender Querkraft das Moment ueber die Laenge konstant bleibt. Und der
   elementinterne Mechanismus WIRFT — `u` an beiden Enden wie drei
   Freisetzungen aus dem Biegeblock.
7. **Gleichgewichtsprobe** ueber alle Modelle — der einzige Test, der die ganze
   Kette auf einmal prueft.
8. **Kinematik**: Pendelstab ohne Verspannung (Netz 1), der Starrkoerpermodus
   mit besetzter Diagonale (Netz 2, exakter Fehlschlag), und das FAST
   kinematische System (Netz 2, Pivot unter der Schwelle) — beide letzteren
   samt Knoten und Richtung.
9. **Verformungspruefung** (Netz 4): der Mechanismus, den der Port fuer geloest
   haelt, die grosse aber legitime Verformung, die Staffelung warn/fail, die
   Bezugslaenge der Verschiebung — und die ehrliche Grenze als Test, dass eine
   Last, die den Mechanismus nicht anregt, unentdeckt bleibt.
10. **Verlauf-API** (`tests/internal-forces.test.ts`): das, was NUR dieses
    Package leisten kann. Der schraege Stab muss dieselben LOKALEN
    Schnittgroessen liefern wie der gerade (sonst dreht `toLocalVector` etwas
    falsch herum), der Zweifeldtraeger trifft `-qL^2/8` und `+9qL^2/128` gegen
    die Handrechnung, `solveAll` legt je Lastfall eigene Zustaende ab, und ein
    `structuredClone`tes Ergebnis beantwortet die Schnittgroessen weiter — der
    Beleg fuer ADR 0019. Die Zahlen selbst sind in `fem-element` verankert.

Die Handrechnung gegen den ECHTEN Rust-Loeser steht in
`apps/demo/fem-cantilever.ts`.

`tests/kinematics-margin.test.ts` ist KEIN Test, sondern ein **Messgeraet**: es
faehrt rund 250 Systeme mit echter `Timoshenko2D`-Formulierung und echten
Walzprofilen durch und schreibt `docs/messungen/kinematik-abstand.md` — das
Beleg-Artefakt zu ADR 0016. Es laeuft mit ABGESCHALTETER Verformungspruefung;
mit den Grenzen, die aus ihm hervorgegangen sind, bewiese es nur sich selbst.

## Known constraints

- **Keine Biegelinie.** `solve()` liefert Schnittgroessen an jeder Stelle, aber
  keine Verformung zwischen den Knoten. `ElementEvaluationState.deformation`
  haelt den Platz dafuer frei; die Auswertung wird eine reine Funktion ueber
  denselben Zustand und gehoert nach `@baustatik/fem-element`.
- **Kombinationen und min/max fehlen.** Sie werden Summen ueber
  `ElementEvaluationState`-Datensaetze und benutzen dieselbe Stuetzstellenliste.
- **Der Ergebnisspeicher ist Anwendungszustand.** Die `Map<loadCaseId,
  SolveResult>` und die Regel „jede Aenderung loescht alles" gehoeren zum Store,
  nicht in dieses Package. Groessenordnung: 1,5–3 MB je Lastfall bei 2000 Knoten
  und 2500 Staeben.
- **Der genannte Knoten bei `SingularStiffnessMatrixError` ist ein Hinweis, kein
  Beweis.** Genannt wird die Stelle, an der der Rangabfall in der Zerlegung
  sichtbar wird; der Mechanismus kann anderswo sitzen und mehrere Knoten
  umfassen. Ein Beweis waere der Eigenvektor zum kleinsten Eigenwert und kostet
  ein Vielfaches der Rechnung. `UnrestrainedDegreeOfFreedomError` ist dagegen
  exakt.
- **Das Ergebnis ist nicht bitgenau.** Der Port skaliert vor dem Loesen
  (`S K S`) und wieder zurueck; das kostet die letzte Stelle. Tests vergleichen
  deshalb auf 12 Stellen, nicht mit `toEqual`.
- **Der Port wird nicht auf Vertragstreue geprueft.** Eine Fassung, die `K`
  spaltenweise statt zeilenweise liest, liefert still falsche Verformungen —
  und weil `K` symmetrisch ist, faellt gerade dieser Fehler nicht auf.
- **Keine Kombinationen.** Es gibt genau zwei Rechenoperationen:
  `solve(loadCaseId)` fuer einen bestimmten Fall und `solveAll()` fuer alle. Beide
  rechnen die Faelle NEBENEINANDER. Sie zu einer Kombination zu UEBERLAGERN ist
  etwas anderes und kommt spaeter; solange die Rechnung linear ist, kann der
  Aufrufer die Ergebnisse auch selbst summieren.

  **„Solange die Rechnung linear ist" ist eine Bedingung, keine Floskel** — und
  sie faellt auf zwei Wegen:

  1. **Theorie II. Ordnung.** Die Steifigkeit haengt am Verformungszustand.
     (`fem-element/CONTEXT.md` haelt den Platz dafuer frei.)
  2. **Zustand II beim Stahlbeton.** Rissbildung ist LASTABHAENGIG. Heute
     rechnet `fem-section-resolve` Beton im Zustand I (ungerissen); sobald der
     gerissene Zustand mitgerechnet wird, haengt `EI` nicht mehr am Stab
     allein, sondern am Paar (Stab, Lastniveau).

  In beiden Faellen darf der Aufrufer NICHT mehr summieren — es muss die
  **Kombination selbst** gerechnet werden. Und in beiden Faellen ist es
  dasselbe fehlende Stueck: eine Angabe an dem, was gerechnet wird, welche
  Theorie und welcher Zustand gelten sollen. Die beiden Schalter sind vom selben
  Typ und sollten zusammen entschieden werden — nicht als globale
  `AnalysisPolicy`, denn im selben Projekt wird der GZT anders gerechnet als der
  Verformungsnachweis im GZG.

  Der Port `getSectionStiffness(beam)` bekommt heute bewusst keinen Lastfall;
  das ist die Bauform von Theorie I. Ordnung im Zustand I. Wenn einer der beiden
  Schalter kommt, aendert sich diese Signatur mit — siehe
  `fem-section-resolve/CONTEXT.md`, „Zustand I ist die stillschweigende
  Annahme".
- **Ergebnisse werden nicht aufgehoben.** `SolveResult` sagt ueber
  `loadCaseId`, WOVON es das Ergebnis ist, aber nicht, gegen welchen Stand des
  Modells oder welchen Faktor gerechnet wurde. Ein Ergebnis veraltet still,
  sobald sich irgendetwas aendert — dasselbe gilt fuer den Bericht, und es zu
  bemerken ist Sache der Anwendung.
- **Ein Stab = ein Element.** Kein Meshing; das Element ist fuer den geraden,
  prismatischen Stab exakt.
- **Kein Querschnitts- und Materialkatalog.** `getSectionStiffness` ist die
  Naht dafuer; heute liefert die Anwendung feste Zahlen.
