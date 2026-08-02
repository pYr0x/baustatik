# `@baustatik/fem-loads`

## Purpose

Das fachliche Lastmodell des ebenen Stabwerks — Knoten- und Stablasten
**eingeben** und **pruefen**. Der Zuschnitt stammt aus den RFEM-Dialogen
(`apps/demo/Knotenlast1.png`, `Stablast1..7.png`): was der Dialog anbietet, hat
einen Typ; was er sperrt, hat keinen.

```
Dialog / Store        ->  FEMLoad          ->  validate  ->  LocalElementLoad
Eingabe des Anwenders     DIESES PACKAGE       das Tor       @baustatik/fem-load-resolve
```

## Boundaries

- Owns: die Lasttypen samt ihrer Diskriminanten (`target`, `kind`,
  `distribution`), die Regeln, wann eine Last zulaessig ist, die zugehoerigen
  Fehlerklassen, den Begriff der Bezugslaenge samt Faktor `L_proj/L`
  (`referenceFactor`), die **Lastvalidierungs-Policy** — die Stellschrauben
  DIESER Regeln samt Default und Werteprueferei — die Auskunft
  `LoadModelGeometry` samt ihrer mitgelieferten Implementierung
  `modelGeometry`, und den **Lastfall** (`LoadCase`, `assertValidLoadCase`,
  `effectiveLoads`) als Schicht ueber dem Lastmodell.
- Does not own: die **Aufloesung** in lokale Elementlasten (Drehung,
  Lagerechnung, Merge je Stab — `@baustatik/fem-load-resolve`), die
  **Ersatzknotenlast** (`@baustatik/fem-element`), die **Assemblierung** und
  den Einstiegspunkt der Rechnung (`@baustatik/fem-solver`), die **Darstellung**
  (`@baustatik/fem-viewer`) und die **Speicherung**. Dieses Package haelt
  keinen Zustand: kein Array, keine Map, kein `let`. Die Lastfaelle leben im
  Store der Anwendung, neben Knoten und Staeben.

  Kein Widerspruch dazu, dass ein `LoadCase` seine Lasten in einem Array
  BESITZT: das ist ein Feld eines Datentyps, kein Speicher des Packages. Wer
  Lastfaelle haelt, anlegt, kopiert oder loescht, ist die Anwendung.

- Ebenfalls nicht hier: das ZUSAMMENSETZEN der Analyse-Einstellungen. Dieses
  Package exportiert seine eigene Scheibe; die versionierte Gesamt-Policy baut
  `@baustatik/fem-solver` als Composition Root
  ([ADR 0011](../../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md)).
- Ebenfalls nicht hier: **Kombinationen**. Teilsicherheitsbeiwerte,
  psi-Werte, Leiteinwirkung und sich ausschliessende Gruppen sind normatives
  Tabellenwissen mit NA-Varianten und werden ein eigenes Package. Der Lastfall
  traegt eine `category`, aber dieses Package **deutet** sie nie — der Typ
  dafuer kommt aus `@baustatik/actions`
  ([ADR 0015](../../docs/adr/0015-action-categories-live-in-a-leaf-package.md)).
- Ebenfalls nicht hier: die **Auswahl**, welcher Lastfall gezeichnet oder
  gerechnet wird. Das ist Zustand der Anwendung
  ([ADR 0014](../../docs/adr/0014-load-case-selection-is-a-parameter-not-a-port.md)).

## Dependencies

- `@baustatik/actions` — `ActionCategory`, das Einwirkungs-Vokabular am
  Lastfall. Ein Blatt ohne eigene Abhaengigkeiten; gespeichert, nie gedeutet.
- `@baustatik/errors` — `BaustatikError` als Wurzel der Fehlerhierarchie.
- `@baustatik/fem-geometry` — `Line`, `Vector`, `Point`. Haelt die
  x/z-Konvention (z abwaerts) an genau einer Stelle.
- `@baustatik/fem` — **nur** in `src/model-geometry.ts`, fuer `Node` und
  `Beam`. Die Regeln in `validate.ts` kennen das Modell nicht; siehe
  [ADR 0006](../../docs/adr/0006-fem-loads-depends-on-fem.md).

## Navigation

- [`src/types.ts`](src/types.ts): das Lastmodell. Sechs Stablast-Varianten
  (`kind` x `distribution`) plus die Knotenlast. Der Dateikopf traegt Vorzeichen-
  und Drehsinn-Konvention.
- [`src/load-case.ts`](src/load-case.ts): der Lastfall — `LoadCase`,
  `assertValidLoadCase` (prueft nur den Faktor, wirft) und `effectiveLoads`
  (wendet ihn an). Der Dateikopf begruendet den Faktor und die Pruefreihenfolge.
  KEINE Factory: ein Lastfall ist ein Datensatz, und eine Factory waere per
  Objektliteral umgehbar — deshalb steht die Zusicherung im Tor des Solvers.
- [`src/validate.ts`](src/validate.ts): `validateLoad`, `validateLoads`,
  `assertValidLoads`, die Fabrik `createLoadValidator` und der Typ
  `LoadModelGeometry`.
- [`src/policy.ts`](src/policy.ts): `LoadValidationPolicy` — die drei
  Stellschrauben der Pruefung samt Default, Factory und striktem Parser.
- [`src/model-geometry.ts`](src/model-geometry.ts): `modelGeometry(nodes, beams)`
  — die einzige Datei mit einem Import aus `@baustatik/fem`.
- [`src/reference-length.ts`](src/reference-length.ts): `referenceFactor`, der
  dimensionslose Faktor `L_proj/L`.
- [`src/errors.ts`](src/errors.ts): zehn benannte Beanstandungen unter der
  Gruppenklammer `LoadValidationError`, und zwei Hinweise unter
  `LoadValidationWarning`.

## Domain language

- **Lastfall** (`LoadCase`) — eine benannte Gruppe von Lasten, die gemeinsam
  wirken. Er BESITZT seine Lasten; eine Last existiert nur innerhalb eines
  Lastfalls, und es gibt kein `loadCaseId` an der Last. Der `name` ist eine
  Benennung, KEIN Schluessel: zwei Lastfaelle duerfen „Wind" heissen.
- **Faktor** (`factor`) — ein Faktor auf alle Lastwerte des Falls, Standard 1,
  endlich und ungleich 0, negativ erlaubt. Er dient der ABLEITUNG DURCH
  KOPIEREN (Wind umkehren mit -1, Einheitslasten skalieren mit 1,75) und ist
  **kein Kombinationsbeiwert**
  ([ADR 0013](../../docs/adr/0013-load-case-factor.md)).
- **Effektive Last** — `effectiveLoads(loadCase)`: die Lasten, wie sie wirken.
  Die eine Stelle, durch die Solver UND Viewer schauen — deshalb kann am Pfeil
  nichts anderes stehen als in der Rechnung.
- **Einwirkung** — die physikalische Ursache. NICHT dasselbe wie ein Lastfall:
  „Wind von links" und „Wind von rechts" sind zwei Lastfaelle EINER Einwirkung.
  Dass sie sich ausschliessen, drueckt `category` nicht aus.
- **Knotenlast** — ein Vektor ueber die Freiheitsgrade: `fx`, `fz`, `my` global
  in EINER Last. Die Richtung steckt im Vorzeichen. Kraft und Moment duerfen
  gemeinsam auftreten.
- **Stablast** — ein BETRAG mit separat gewaehlter Richtung (`frame` + `axis`).
  Zwei Richtungen sind zwei Lasten. Kraft ODER Moment, nie beides. Deshalb gibt
  es genau ein `q`/`p` und **kein** `qx`/`qz`.
- **Bezugslaenge** (`referenceLength`) — auf welche Laenge sich der Wert einer
  Streckenlast bezieht. Eigene Achse, nicht Teil der Richtung. Benannt nach der
  GEMESSENEN Ausdehnung, nicht nach dem RFEM-Dialogtext, der die BLICKRICHTUNG
  nennt: `'horizontalProjection'` = x-Ausdehnung = RFEM „Projektion in Z" = der
  Schneefall.
- **Bezugslaengen-Faktor** — `L_proj / L`, dimensionslos, hoechstens 1. Der
  eingegebene Wert wird damit multipliziert.
- **Gleichlast** — liegt IMMER auf dem ganzen Stab. Ein konstanter
  Teilabschnitt ist ein Trapez mit `q1 === q2`.
- **`LoadModelGeometry`** — die zwei Auskuenfte ueber das Modell, die die
  Pruefung braucht: `hasNode` und `beamAxis`. Kein Speicher, sondern eine
  Momentaufnahme; Aufrufer bauen sie je Vorgang neu.

## Invariants and conventions

- **z zeigt nach unten.** Eine nach unten wirkende Last ist damit POSITIV. Das
  alte Handoff schrieb `fz: -10` — falsch herum.
- **Der Lastfall besitzt seine Lasten, und zwar allein.** Kein `loadCaseId` an
  der Last: zwei Orte fuer dieselbe Zugehoerigkeit waeren zwei Wahrheiten, und
  eine id ohne Besitzer laedt zu einem Fake-Default-Lastfall ein. Dieselbe Last
  darf nicht in zwei Faellen liegen — eine Ueberlagerung wuerde sie doppelt
  zaehlen.
- **Roh pruefen, effektiv rechnen.** Das Tor (`assertValidLoads`) sieht die
  EINGEGEBENEN Lastwerte, Rechnung und Darstellung sehen die gefakterten. So
  nennt jede Meldung die Zahl, die der Anwender getippt hat, und
  `ScaledLoadValue.value` behaelt seine Bedeutung. Tragfaehig ist das nur,
  solange keine Regel den BETRAG eines Lastwerts bewertet — festgenagelt in
  `tests/load-case.test.ts`, begruendet in
  [ADR 0013](../../docs/adr/0013-load-case-factor.md).
- **Drehsinn**: das globale y zeigt aus der Zeichenebene heraus, ein positives
  `my`/`m` dreht im Bild GEGEN den Uhrzeigersinn. Das ist NICHT der Drehsinn von
  `theta` in `fem-element` (dort `theta = dw/dx`); es gilt `phiY = -theta`. Die
  Umrechnung leistet `fem-load-resolve`, nicht dieses Package.
- **Stabrichtung = Knotenreihenfolge, und die legt lokal z fest.** `ex` zeigt
  vom Anfangs- zum Endknoten (`Line.frame` in `@baustatik/fem-geometry`), `ez`
  steht senkrecht darauf: derselbe waagrechte Stab von links nach rechts hat
  lokal z ABWAERTS, von rechts nach links AUFWAERTS. Eine Last mit
  `frame: 'local'` kehrt deshalb ihre Wirkungsrichtung um, wenn jemand die
  Knotenreihenfolge des Stabes dreht — eine Last mit `frame: 'global'` nicht.
  Genauso misst `distanceFromStart` vom ANFANGSknoten und meint am umgedrehten
  Stab das andere Ende. Kein Fehler, sondern die Konvention; wer die lokale
  Querrichtung umdrehen will, dreht den Stab. Festgenagelt in
  `fem-geometry/tests/line.test.ts` und `fem-load-resolve/tests/resolve.test.ts`.
- **Momentlasten tragen weder `frame` noch `axis` noch `referenceLength`.** Ein
  ebenes Moment dreht immer um y; die Wahl im Dialog hat keine beobachtbare
  Wirkung. Ein Feld ohne Wirkung waere Zustand, den Zeichnen und Solver
  mitschleppen und ignorieren muessten. Kommt mit 3D zurueck.
- **Die Einzellast traegt keine `referenceLength`.** `p` ist in kN angegeben,
  nicht je Laenge — an einer Gesamtkraft gibt es nichts zu skalieren. Belegt
  durch `Stablast2.png` (`P` in kN) gegen `Stablast3.png` (`p` in kN/m).
- **Einheiten sind blanke `number`**, die Einheit steht im Doc-Kommentar am
  Feld. Bewusst keine gebrandeten Quantity-Typen.
- **`m` heisst bei `distribution: 'point'` kNm und bei `'constant'` kNm/m.**
  Eine stehen gelassene Warze: der Dialog unterscheidet per Gross-/Kleinschrift
  (`M` gegen `m`), was in TypeScript keine gute Idee ist. `distribution`
  narrowt korrekt. Nicht „aufraeumen", ohne den Ersatz zu Ende zu denken.
- **Ziele nur ueber ids**, als Listen: ein Lastobjekt, n Ziele. Loeschen
  loescht die Last auf allen Zielen.
- **Ein Typ fuer 1D und 2D.** Die 1D-UI bietet nur `'trueLength'` an — das
  schraenkt die Eingabe ein, nicht den Typ.

## Validation

Zwei Ausgaenge fuer zwei Aufrufer:

- `validateLoads(model, loads)` sammelt ALLE Befunde und gibt
  `{ errors, warnings }` zurueck. Fuer den Eingabedialog: eine Lasteingabe ist
  keine verletzte Precondition des Entwicklers, sondern ein Tippfehler des
  Anwenders, und der will alle Fehler auf einmal sehen. Die Klassen tragen
  `loadId`, `field` und `beamId` als FELDER, damit die Oberflaeche das richtige
  Eingabefeld markieren kann.
- `assertValidLoads(model, loads)` wirft den ERSTEN Fehler. Das Tor vor der
  Rechenkette, nach `error-handling-in-libraries.md`: laut und frueh scheitern.
  Es meldet bewusst nur den Grund, warum es zu ist — die vollstaendige Liste
  gibt es beim anderen Ausgang.

Beide sind die Ausgaenge des **Default-Validators**. Wer mit abweichenden
Schranken pruefen will, bindet sie einmal:

```typescript
const validator = createLoadValidator(policy.loads);
validator.validateLoads(geometry, loads);
```

**Die Policy wird gebunden und ist KEIN drittes Argument.** Der realistische
Fehler ist nicht, dass jemand absichtlich zwei verschiedene Policies benutzt,
sondern dass jemand das dritte Argument VERGISST: der Eingabedialog pruefte dann
gegen den Default, waehrend der Solver mit einer ueberschriebenen Policy rechnet
— der Dialog akzeptierte, was der Rechnen-Knopf ablehnt, und nichts zeigte es
an. Dasselbe Muster wie die gebundene Formulierung in ADR 0003.

Wer hier durchkommt, darf in `fem-load-resolve` ohne weitere Pruefung
`0 <= from <= to <= L` annehmen, eine Stablaenge `L > 0` haben und eine
projizierte Bezugslaenge ueber der harten Mindest-Projektionsrate.

Geprueft wird: nichtleere Ziel-Listen; unbekannte ids; `0 <= from <= to <= L`
bzw. `<= 100` bei `relativeDistances`; **jede Last braucht mindestens einen
wirkenden Wert** — die Knotenlast eine Komponente ungleich 0
(`ZeroNodeLoadError`), die Stablast einen Wert ungleich 0
(`ZeroBeamLoadError`); projizierte Laenge 0 an der Streckenlast; Endlichkeit
aller Werte (`NaN`/`Infinity`) — ungeprueft landete das still in der globalen
Steifigkeitsmatrix, weit weg von der Ursache.

Die Dreieckslast (`q1: 0, q2: 8`) bleibt dabei zulaessig: es muss IRGENDEIN
Wert wirken, nicht jeder. Beanstandet wird nur die Last, die nichts eintraegt.

```text
pnpm --filter @baustatik/fem-loads typecheck
pnpm --filter @baustatik/fem-loads test
```

## Die Bezugslaenge und die leise verschwindende Last

Der wichtigste Fallstrick dieses Packages, deshalb ausfuehrlich.

Eine Streckenlast mit Bezugslaenge wird **kleiner** gerechnet, nie groesser.
`referenceFactor` liefert `L_proj / L`, also hoechstens 1, und
`fem-load-resolve` rechnet damit `q * faktor`. Fachlich ist das richtig: wer
0,85 kN/m **je Grundrissmeter** eingibt, meint eine Gesamtkraft
`0,85 * Δx`; verteilt ueber die laengere wahre Stabachse ergibt das weniger je
laufendem Meter.

Der Faktor ist rein geometrisch — `sin α` bzw. `cos α` zum Winkel gegen die
Waagrechte:

```text
Stabneigung   'verticalProjection'   'horizontalProjection'
              (misst Δz, RFEM        (misst Δx, RFEM
               "Projektion in X")     "Projektion in Z", Schnee)
   0°  waagrecht      0.000  <- Fehler         1.000
   1°               0.017               1.000
   5°               0.087               0.996
  10°               0.174               0.985
  30°               0.500               0.866
  45°               0.707               0.707
  89°               1.000               0.017
  90°  senkrecht      1.000             0.000  <- Fehler
```

**Die Falle:** Es gibt keinen Sprung zwischen „zulaessig" und „Unsinn". Bis zur
**harten Mindest-Projektionsrate** (`minimumReferenceFactor`, Voreinstellung
`1e-9`) lehnt `ReferenceFactorBelowMinimumError` ab, weil die Last dann
praktisch verschwindet. Ein Stab von `(0,0)` nach `(100,1)` — 0,57° geneigt,
mit blossem Auge waagrecht — hat aber Faktor 0,01: aus einem eingegebenen
`q: 5` werden gerechnete `0,05`. Ein Prozent. **Ohne Meldung, ohne Warnung, und
in der Zeichnung sieht die Last aus wie eingegeben.** Dasselbe gespiegelt an
einer Stuetze, die 1° aus dem Lot steht, mit `'horizontalProjection'`.

Das ist gefaehrlicher als eine zu grosse Last: eine Ueberlast faellt im
Ergebnis auf, eine fehlende nicht. Es ist dieselbe Sorge, mit der `errors.ts`
begruendet, warum unbekannte ids werfen statt still uebersprungen zu werden —
„eine still uebersprungene Last verschwindet spurlos aus Zeichnung und
Rechnung". Hier verschwindet sie nicht ganz, sondern fast, und das faellt noch
weniger auf.

**Warum es keinen FEHLER gibt:** Der Uebergang ist stetig, und jede Grenze
waere gegriffen. Ein 5°-Flachdach mit `'verticalProjection'` gibt 0,087 und ist
voellig in Ordnung — Winddruck auf eine flach geneigte Flaeche, bezogen auf die
Ansichtsflaeche. Wer bei 0,05 einen Strich zieht und ablehnt, verbietet damit
auch reale Faelle. Kein Normtext gibt die Zahl her.

**Was es stattdessen gibt: eine WARNSCHWELLE.** Sie steht in `validateBeamLoad`
an derselben Stelle wie die harte Schranke und schlaegt an bei

```text
referenceFactor(...) < suspiciousReferenceFactor    Voreinstellung 0,05,
                                                    ~2,9° gegen die
                                                    Bezugsrichtung
```

Die Voreinstellung ist gegriffen, aber nicht willkuerlich: sie liegt in der
Mitte des Fensters, das die Faelle oben aufspannen. Sie MUSS anschlagen bei
0,010 und 0,017 (die beiden dokumentierten Vertipper) und darf NICHT anschlagen
bei 0,087 (das Flachdach).

**Beide Schranken sind eine Analyse-Einstellung** und stehen als
Lastvalidierungs-Policy in [`src/policy.ts`](src/policy.ts) — siehe den
Abschnitt unten. Frueher stand hier „feste Konstante, nicht konfigurierbar —
ein Regler, den niemand dreht, waere Zustand ohne Wirkung". Das Argument war
richtig, solange es keinen Ort gab, an dem der Regler landen kann. Den gibt es
jetzt: eine versionierte, persistierte Analyse-Einstellung, in der auch
`shearDeformation` sitzt. Ein Wert, der pro Projekt gespeichert und
reproduziert wird, ist Zustand MIT Wirkung.

**Die Meldung nennt die FOLGE, nicht die Ursache.** Das Gefaehrliche ist nicht
der kleine Faktor, sondern dass die Schrumpfung unsichtbar bleibt. Deshalb
traegt `NearlyDegenerateReferenceLengthWarning` den gerechneten Wert neben dem
eingegebenen: „gerechnet wird q: 5 -> 0.05" trifft den blinden Fleck, „Faktor
0,010" nicht.

Die zweite Gegenmassnahme bleibt redaktionell: die Werte von `ReferenceLength`
heissen nach der GEMESSENEN Achse, nicht nach dem RFEM-Dialogtext, der die
BLICKRICHTUNG nennt. Genau diese Umkehrung ist die haeufigste Ursache dafuer,
dass hier die falsche Option steht.

### Die Lastvalidierungs-Policy

Die drei Zahlen, gegen die geprueft wird, stehen in
[`src/policy.ts`](src/policy.ts) und sind eine **Analyse-Einstellung**: sie
steuern die Rechnung, ohne das Modell zu aendern.

```text
stationRelativeTolerance    1e-9   relative Toleranz beim Vergleich einer
                                   ABSOLUTEN Station gegen die Stablaenge
minimumReferenceFactor      1e-9   harte Mindest-Projektionsrate; bis hierher
                                   wird ABGELEHNT
suspiciousReferenceFactor   0.05   Warnschwelle; darunter wird gewarnt
```

Die ersten beiden waren frueher dieselbe Konstante `1e-9`. Das war ein Zufall
der Groessenordnung und keine Regel — eine Laengentoleranz und eine
Projektionsrate haben nichts miteinander zu tun, und wer die eine dreht, will
die andere nicht mitdrehen. `stationRelativeTolerance` heisst bewusst nicht
`absoluteStationRelativeTolerance`: „absolut … relativ" in einem Namen liest
sich widerspruechlich.

**Die Invariante, die keine Policy wegdrehen darf:** `minimumReferenceFactor: 0`
ist zulaessig, und weil `validate.ts` mit `factor <= minimumReferenceFactor`
prueft, bleibt der **exakte** Faktor 0 auch dann abgelehnt. Eine Last, deren
Bezugslaenge am Stab exakt 0 misst, traegt nichts ein und ist immer ein Fehler.
Die Regel haengt allein am `<=`; sie ist getestet, damit sie niemand spaeter zu
einem `<` „aufraeumt".

`createLoadValidationPolicy(overrides?)` prueft WERTE
(`0 <= minimum < suspicious <= 1`, Stationstoleranz endlich und `>= 0`),
`parseLoadValidationPolicy(unknown)` prueft zusaetzlich die FORM — er ist der
Grenzuebertritt aus JSON. Beide liefern eingefrorene Objekte; die Factory ohne
Overrides den Default SELBST. Nicht konfigurierbar bleibt `PERCENT = 100`:
„relativ" heisst definitionsgemaess „in Prozent der Stablaenge", da waere ein
Regler keine Pruefung, sondern eine geaenderte Bedeutung.

### Der Warnungsbegriff — so entschieden, und warum die Fallzahl das falsche Kriterium war

Frueher stand hier ein Ausloeser: „sobald drei Kandidaten wirklich gewuenscht
sind, wird der Begriff gebaut". Gebaut wurde er aus einem anderen Grund.

**Der ABLAUF hat ihn erzwungen, nicht die Fallzahl.** Der Pruefbericht in
`@baustatik/fem-solver` kennt drei Ausgaenge — hart (Fehler, kein Rechnen),
weich (Hinweis, Rechnen erlaubt) und frei. Drei Ausgaenge brauchen zwei Sorten
Befund, ganz unabhaengig davon, wie viele Faelle es gibt. Waere weiter nach
Faellen gezaehlt worden, haette der Begriff auf einen Ablauf gewartet, den es
ohne ihn gar nicht geben konnte.

Die Kandidatenliste hat sich dabei ebenfalls verschoben, weil es inzwischen eine
MODELLpruefung gibt (`@baustatik/fem`, ADR 0008):

1. **Fast entartete Bezugslaenge** — gebaut, siehe oben.
   `NearlyDegenerateReferenceLengthWarning`.
2. ~~**Stablast mit lauter Nullen**~~ — erledigt am 2026-07-25 als FEHLER
   (`ZeroBeamLoadError`), nicht als Warnung. Das war eine Asymmetrie und kein
   Ermessensfall: bei der Knotenlast war genau das schon immer ein Fehler. Die
   Dreieckslast (`q1: 0, q2: 8`) bleibt zulaessig, weil IRGENDEIN Wert wirken
   muss, nicht jeder.
3. **Lastabschnitt der Laenge 0** (`from === to` am Trapez) — gebaut.
   `ZeroExtentLoadSegmentWarning`. `to < from` wirft weiterhin
   (`BackwardsLoadExtentError`); `to === from` ist widerspruchsfrei und bloss
   wirkungslos. Braucht keine Schwelle, der Vergleich ist exakt.
4. **Knotenlast auf einem Knoten ohne Stab** — gebaut, aber **nicht hier**. Der
   Fall galt als teuer, weil er eine DRITTE Frage an `LoadModelGeometry`
   gewesen waere. Er entsteht jetzt im `fem-solver` als
   `LoadOnIsolatedNodeWarning`, aus `isolatedNodeIds` in `@baustatik/fem`: dort
   liegt der Graph ohnehin auf dem Tisch, und „haengt an diesem Knoten ein Stab"
   ist eine Modell-, keine Lastfrage. `LoadModelGeometry` bleibt bei zwei
   Auskuenften.

**Der bezahlte Preis:** `validateLoad` und `validateLoads` geben
`{ errors, warnings }` statt `LoadValidationError[]`. Der Schnitt war zu diesem
Zeitpunkt am billigsten — es gab noch keinen Eingabedialog, und der einzige
weitere Aufrufer (`solver.validate()`) wurde ohnehin durch `solver.check()`
ersetzt. `assertValidLoads` blieb unveraendert und ignoriert die Warnungen.

## Known constraints

- **Der Lastfall sagt nicht, WIE er gerechnet werden soll.** `LoadCase` traegt
  Name, Faktor und Einwirkungskategorie — also woraus die Last stammt und wie
  sie kombiniert wird. Er traegt **nicht**, unter welcher Annahme er gerechnet
  wird. Zwei solche Angaben fehlen, und sie sind vom selben Typ:

  | | heute fest auf | bricht bei |
  | --- | --- | --- |
  | Theorie | I. Ordnung | Stabilitaet, grosse Verformungen |
  | Zustand (Stahlbeton) | I — ungerissen | Rissbildung im Gebrauchszustand |

  Beide brechen dieselbe Annahme: die **Superposition**. Rissbildung ist
  lastabhaengig, Theorie II. Ordnung verformungsabhaengig — in beiden Faellen
  darf man Lastfaelle nicht mehr getrennt rechnen und summieren, sondern muss
  die Kombination selbst rechnen.

  Deshalb gehoert die Angabe an das, was gerechnet wird — den Lastfall bzw. die
  Kombination — und **nicht** in eine globale `AnalysisPolicy`: im selben
  Projekt wird der GZT anders gerechnet als der Verformungsnachweis im GZG, wo
  Zustand II in der Regel massgebend ist. Sie gehoert auch nicht an das
  Material: `Material` nennt eine Sorte, keinen Rechenzustand.

  Was heute daran haengt, steht in `fem-section-resolve/CONTEXT.md` unter
  „Zustand I ist die stillschweigende Annahme" — kurz: Betondurchbiegungen sind
  unbrauchbar, und eine nichtlineare Bemessung im GZT (EN 1992-1-1 §5.7) ist
  ausgeschlossen. Die beiden Schalter sollten zusammen entschieden werden.
- **Keine ABLEHNUNG fast entarteter Bezugslaengen** — abgelehnt wird nur bis zur
  harten Mindest-Projektionsrate (Voreinstellung praktisch der Faktor 0). Unter
  der Warnschwelle gibt es einen Hinweis, dazwischen und darueber geht alles
  durch; siehe den Abschnitt oben.
- **Die Validierung prueft eine Last gegen das Modell, nicht das Modell.** Ein
  Stab mit haengender Knotenreferenz erscheint hier als unbekannter Stab
  (`beamAxis` gibt `undefined`). Der Modellfehler selbst gehoert dorthin, wo
  das Modell geprueft wird: `validateModel` in `@baustatik/fem` (ADR 0008).
  Deshalb prueft `fem-solver.check()` das Modell ZUERST und beurteilt die Lasten
  bei einem Modellfehler gar nicht — sonst waeren die Lastbefunde lauter
  Folgefehler.
- **`modelGeometry` liefert eine Momentaufnahme**, keine lebende Sicht: die
  beiden `Map`s entstehen beim Bauen. Je Vorgang neu bauen, nicht aufheben.
- **Die id-Eindeutigkeit wird NICHT geprueft.** Last-ids sind global eindeutig
  und Lastfall-ids ebenso, aber durchgesetzt wird das beim ERZEUGEN
  (`crypto.randomUUID()` in der Anwendung), nicht durch einen Pruefdurchgang:
  eine Kollision ist damit nicht erreichbar. Die einzige Stelle, an der die
  Zusage kippen kann, ist eine Kopieroperation — wer einen Lastfall kopiert,
  MUSS je Last eine neue id ziehen, sonst tragen zwei Faelle dieselben Last-ids.
  Kommen je Projektdateien dazu, gehoert die Pruefung an diese Grenze, als
  strikter Parser nach dem Muster von `parseLoadValidationPolicy`.
- Noch nicht da: Kombinationen, Eigengewicht-Generator, die Lastarten
  Temperatur, Laengenaenderung, Vorkruemmung, Anfangsvorspannung, und die
  Verlaeufe Viereckfoermig, Parabolisch, Veraenderlich.
