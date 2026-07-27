# `@baustatik/fem-load-resolve`

## Purpose

Schritt A der Rechenkette: das fachliche Lastmodell (`@baustatik/fem-loads`) in
die lokalen Elementlasten uebersetzen, die `consistentLoad` erwartet. Alles rein
geometrisch — Fan-out ueber mehrere Ziele, Drehung global -> lokal, Bezugslaenge,
Lage auf dem Stab, Buendelung je Stab. **Keine Balkentheorie.**

```
BeamLoad (abstrakt)      ->  LocalElementLoad        ->  f_e (Vector6)      ->  globales F
frame/axis/refLength         qx/qz/my(x) lokal           konsistenter Vektor    assemblieren
@baustatik/fem-loads         DIESES PACKAGE              @baustatik/fem-element @baustatik/fem-solver
```

## Boundaries

- Owns: die Uebersetzung `FEMLoad -> LocalElementLoad` / `GlobalNodeLoad`, den
  Fan-out ueber `beamIds`/`nodeIds`, die Frame-Drehung, die Anwendung des
  Bezugslaengen-Faktors, die Umrechnung relativer Abstaende, den Merge je Stab
  bzw. Knoten.
- Does not own: die **Ersatzknotenlast** — die braucht die Ansatzfunktionen und
  ist deshalb Methode der Elementformulierung (`fem-element`). Wer hier anfaengt,
  `N` zu brauchen, hat die Grenze verletzt. Ebenso wenig: die
  **Eingangsvalidierung** (`fem-loads/src/validate.ts`), die
  **6x6-Transformation** und die Assemblierung (`fem-solver`), die Definition
  der lokalen Stabachse (`fem-geometry`) und die Definition der Bezugslaenge
  (`fem-loads/src/reference-length.ts`).

## Dependencies

- `@baustatik/fem-loads` — die Eingabetypen, `LoadModelGeometry`,
  `referenceFactor` und die Fehlerklassen.
- `@baustatik/fem-geometry` — `Line.length`, `Line.toLocal`, `Vector.make`.
- `@baustatik/fem-element` — nur die Ausgabetypen, aber als echte `dependency`:
  `LocalElementLoad` steht in der oeffentlichen Signatur und damit im
  publizierten `.d.ts`.

**Nicht** dabei: `@baustatik/fem` (das Modell kommt ueber `LoadModelGeometry`,
nicht als Objektgraph) und `@baustatik/errors` (dieses Package definiert keine
eigenen Fehler, siehe Invariants).

## Navigation

- [`src/resolve.ts`](src/resolve.ts): `resolveLoads`, der Einstiegspunkt der
  Rechenkette, samt Fan-out, Drehung, Bezugslaenge, Lage und Merge.
- [`src/load-geometry.ts`](src/load-geometry.ts): `loadStation` und
  `loadDirection` — Lage und Richtung einer Last, ohne Lastwert.
- [`src/types.ts`](src/types.ts): `GlobalNodeLoad`, `ResolvedLoads`.
- [`src/index.ts`](src/index.ts): `resolveLoads`, `loadStation`,
  `loadDirection` und die zwei Typen, sonst nichts.

## Domain language

- **Aufloesen (resolve)** — eine abstrakte Last auf einen konkreten Stab
  abbilden. Aus "10 kN/m global abwaerts, bezogen auf den Grundriss" wird
  "qx = …, qz = … von x = 0 bis x = L" fuer genau diesen Stab.
- **Fan-out** — dieselbe Last liegt auf mehreren Staeben oder Knoten und wird je
  Ziel eigenstaendig aufgeloest, weil `L` und Neigung pro Stab verschieden sind.
- **Bezugslaengen-Faktor** — die dimensionslose Zahl `L_proj / L`, mit der ein
  eingegebener Streckenlastwert multipliziert wird, damit er sich auf die wahre
  Stablaenge bezieht. Der Schneefall. Definiert in `fem-loads`, nicht hier.
- **Lokale Elementlast** — `LocalElementLoad`: alle Lasten EINES Stabes,
  gebuendelt in Segmenten und Punkten entlang der lokalen x-Achse.
- **Station** — ein Abstand entlang der Stabachse, in Metern, ab dem
  Anfangsknoten.

## Invariants and conventions

- **Vorzeichen und Drehsinn**: z zeigt abwaerts, eine Last nach unten ist
  positiv. Das globale y zeigt AUS der Zeichenebene, ein positives Moment dreht
  im Bild gegen den Uhrzeigersinn. `LocalElementLoad.my` ist dagegen
  arbeitskonjugiert zu `theta` (positiv von +x nach +z), es gilt
  `phiY = -theta`. **Stab-Momentlasten bekommen deshalb hier ein Minus,
  Knotenlasten NICHT** — eine Knotenlast laeuft nie durch ein Element. Das
  Gegenstueck sitzt in der 6x6-Transformation des Solvers; beide Vorzeichenwechsel
  heben sich auf. Herleitung: `docs/adr/0005-…`.
- **Lage und Richtung sind auch fuer Nicht-Solver-Aufrufer offen**: `loadStation`
  (Prozentregel plus Klemmen auf `[0, L]`) und `loadDirection` (globaler
  Einheitsvektor einer Kraftrichtung) sind exportiert, weil der Viewer beim
  Zeichnen eines Lastpfeils dieselben zwei Fragen stellt wie der Solver.
  Zweimal hergeleitet driften Bild und Rechnung genau in dem Paar auseinander,
  fuer das man das Bild ueberhaupt anschaut. Der Export-Kopf bleibt trotzdem
  schmal: **keine** Lastwerte, keine Bezugslaenge, keine Balkentheorie.
  `toLocalComponents` bleibt bewusst eine eigene Herleitung statt
  `Line.toLocal(loadDirection(...))` — der Rundlauf `toGlobal` nach `toLocal`
  wuerde dem Solverpfad Fließkommarauschen zufuegen. Dass beide Wege dasselbe
  sagen, sichert ein Test ueber alle vier `frame`/`axis`-Kombinationen.
- **Die Drehung laeuft ueber `Line.toLocal`, nie ueber `cosα/sinα`**: die
  Definition der lokalen Stabachse lebt an einer Stelle (`fem-geometry`), und die
  Zerlegung ist dort ein Skalarprodukt gegen eine orthonormale Basis — kein
  Winkel, keine Drehmatrix, keine Vorzeichenherleitung.
- **Validierung ist Vorbedingung, nicht Aufgabe**: `fem-loads/src/validate.ts`
  ist das Tor davor. Wer dort durchkommt, hat `0 <= from <= to <= L`, `L > 0` und
  eine projizierte Bezugslaenge ungleich 0. Diese Pruefungen stehen hier NICHT
  noch einmal — sonst validierte eine Kette aus Dialog und Rechnung zweimal.
  Ausnahme sind haengende Referenzen: beim Stab MUSS reagiert werden (ohne
  Stabachse geht es nicht weiter), und dann soll der Knotenfall sich nicht anders
  verhalten. Ohne die `hasNode`-Pruefung entstuende dort still ein Eintrag fuer
  einen Phantomknoten.
- **Keine eigenen Fehlerklassen**: geworfen wird `UnknownLoadTargetError` aus
  `fem-loads`. Die Klasse traegt genau die richtigen Felder, und
  `assertValidLoads` wirft dieselbe Familie bereits in der Rechenkette — ein
  Aufrufer faengt weiterhin EINE Gruppenklammer (`LoadValidationError`) fuer
  "irgendein Lastfehler".
- **Ein Stab = ein Element**: die Ausgabe schluesselt auf `beamId`. Es gibt
  derzeit keinen Treiber fuer Meshing: das Element ist fuer den geraden,
  prismatischen Stab exakt (es konvergiert nicht, es stimmt), `internalForces`
  parametrisiert den Verlauf ueber `x` statt ueber Elementgrenzen, und
  Zwischenknoten sind Sache des Anwenders — das Programm teilt Staebe an
  Kreuzungspunkten nicht automatisch.
- **Der Bezugslaengen-Faktor gilt unabhaengig vom Bezugssystem** und ist ueber
  den geraden Stab konstant (`Δx/L` aendert sich entlang einer Geraden nicht).
  Deshalb bleibt eine lineare Last linear, ein Teilabschnitt bekommt denselben
  Faktor wie der ganze Stab, und Projektion und Frame-Drehung kommutieren.
- **Abstaende sind immer entlang der Stabachse gemessen**, unabhaengig von
  `referenceLength` — die skaliert nur den Lastwert, nie die Lage.
- **Die Ausgabe wird auf `[0, L]` geklemmt**, damit die in
  `fem-element/src/types.ts` dokumentierte Invariante `0 <= from <= to <= L`
  woertlich gilt statt nur bis auf eine Toleranz. Das faengt reines
  Fliesskommarauschen ab (`pct * L / 100` trifft `L` nicht zwingend exakt); echte
  Bereichsfehler hat `validate.ts` schon geworfen. Die Lagetoleranz in
  `consistentLoad` ist damit Doppelsicherung, nicht tragend.
- **Reihenfolge ist Eingabereihenfolge**: der Merge haengt nur aneinander. Die
  Ausgabe ist dadurch aus der Eingabe direkt vorhersagbar, und ein Test kann die
  Segmentliste exakt behaupten — wie `validateLoads` es mit den Beanstandungen
  haelt.
- **Lastfreie Staebe und Knoten tauchen nicht auf**: ein fehlender Map-Eintrag
  heisst "lastfrei". Der Solver behandelt `undefined` wie ein leeres
  `LocalElementLoad` und braucht keine Sonderbehandlung.

## Validation

```text
pnpm --filter @baustatik/fem-load-resolve typecheck
pnpm --filter @baustatik/fem-load-resolve test
pnpm --filter @baustatik/fem-load-resolve lint
```

Reine Funktionen ohne Konva/DOM/WASM, in Node testbar.

Bei Typfehlern der Art "hat keinen exportierten Member": die Abhaengigkeiten
werden ueber ihr gebautes `dist/index.d.ts` aufgeloest, nicht ueber `src/`. Nach
einer Aenderung in `fem-loads`/`fem-geometry`/`fem-element` diese erst bauen.

## Known constraints

- **Die Ausgabe ist NICHT normalisiert**: Segmente sind weder sortiert noch
  ueberlappungsfrei, und identische Ausdehnungen werden nicht zusammengefasst.
  Fuer beide heutigen Konsumenten ist das unkritisch, weil Integration linear ist
  und Segmentbeitraege superponieren: `consistentLoad` summiert jedes Segment
  unabhaengig, und der spaetere Verlauf in `internalForces` entsteht ebenso als
  Summe (ein ueber `x` hinausragendes Segment wird pro Segment abgeschnitten).
  Baut jemand einen dritten Konsumenten, der eine Normalform braucht, ist das
  hier bewusst nicht vorgesehen und muesste entschieden werden.
- **Die `m`-Warze aus `fem-loads`**: `BeamMomentPointLoad.m` ist kNm,
  `BeamMomentConstantLoad.m` ist kNm/m — gleicher Feldname, andere Einheit. Die
  Diskriminante ist `distribution`, nicht der Name.
- **Kein Lastfall-Begriff**: `resolveLoads` nimmt eine flache Lastmenge, und das
  gilt weiter, seit es Lastfaelle GIBT. Der Aufrufer flacht vorher ab —
  `fem-solver` uebergibt `effectiveLoads(loadCase)`, also die Lasten samt
  Fallfaktor. Dieses Package bekommt davon nichts mit, und mit Kombinationen wird
  sich daran nichts aendern.
