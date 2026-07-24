# Handoff: `@baustatik/fem-load-resolve`

**Stand:** 2026-07-24 · Branch `main` · Package ist **gerüstet, aber leer**:
`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts` existieren,
`src/` und `CONTEXT.md` fehlen. Nichts davon ist committet
(`git status`: `?? packages/fem-load-resolve/`).

**Zweck der nächsten Session:** die Design-Entscheidungen dieses Packages in
einer Grilling-Session festklopfen und danach implementieren.

> **Nachtrag 2026-07-24 (Geometrie-Durchsicht).** Zwei Dinge haben sich seit der
> ersten Fassung geändert: `packages/fem-loads/src/validate.ts` **existiert
> inzwischen** samt `tests/validate.test.ts` — Frage 7 ist damit erledigt und
> Frage 3 präjudiziert. Und die Rolle von `fem-geometry` ist geklärt: die
> Dependency kommt, aber sie trägt weniger als gedacht, und `Line.normalVector`
> war damals eine Vorzeichenfalle (inzwischen behoben, siehe Frage 8).
> Betroffen sind Aufgabe 2/3 unten sowie die Fragen 3, 7 und 8.

## Vorgelagerte Dokumente — zuerst lesen, hier nicht wiederholt

| Dokument                                           | Was drinsteht                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/fem-loads/HANDOFF.md`                    | das Last-Eingabemodell und **warum** es so aussieht (Knotenlast = Vektor, Stablast = Betrag + Richtung); Bezugslängen-Falle; die `m`-Warze |
| `packages/fem-element/docs/Elementformulierung.md` | die Pipeline-Architektur, Package-Aufteilung, Abhängigkeitsrichtung; dieses Package ist dort „Schritt A"                                   |
| `packages/fem-element/CONTEXT.md`                  | DOF-Reihenfolge, Vorzeichen, `prepare()`-Fabrik, Toleranz `1e-9` für Rundungsreste **aus diesem Package**                                  |
| `packages/fem-loads/src/types.ts`                  | die Eingabe-Typen (`FEMLoad`, `BeamLoad`, `NodeLoad`)                                                                                      |
| `packages/fem-element/src/types.ts`                | die Ausgabe-Typen (`LocalElementLoad`, `LineLoadSegment`, `PointElementLoad`)                                                              |
| `docs/adr/0003-…`, `docs/adr/0004-…`               | Element-Fabrik und die zwei Steifigkeits-Bauer                                                                                             |

## Die Lage in einem Bild

```
BeamLoad (abstrakt)      →   LocalElementLoad        →   f_e (Vector6)        →   globales F
frame/axis/refLength         qx/qz/my(x) lokal           konsistenter Vektor      assemblieren
@baustatik/fem-loads         @baustatik/fem-load-resolve @baustatik/fem-element   @baustatik/fem-solver
   ✅ types.ts                    ← DIESES PACKAGE           ✅ FERTIG                ⬜ nur gerüstet
   ✅ validate.ts                    (leeres Gerüst)         consistentLoad()
```

**Wichtig für die Erwartungshaltung:** die Ersatzknotenlast selbst ist bereits
fertig. `Timoshenko2D.prepare(props, L).consistentLoad(load)`
(`packages/fem-element/src/timoshenko.ts:111`) integriert Gauß-exakt, gewichtet
`my` über `Ntheta` und wertet Einzellasten per `N(a)` aus. Dieses Package rechnet
**keine** Ersatzknotenlast — es übersetzt nur Eingabe → lokale Elementlast. Wer
hier anfängt, Ansatzfunktionen zu brauchen, hat die Grenze verletzt.

## Was das Package leisten muss (die sechs Aufgaben)

Alles rein geometrisch, keine Balkentheorie:

1. **Fan-out** `beamIds: string[]` → je Stab eine eigene Auflösung (L und Winkel
   sind pro Stab verschieden).
2. **Frame-Drehung** `global → lokal`, mit `cosα = Δx/L`, `sinα = Δz/L`
   (z abwärts, lokales x vom Anfangs- zum Endknoten):
   - `local`/`x` → `qx = q`; `local`/`z` → `qz = q`
   - `global`/`x` → `qx = q·cosα`, `qz = −q·sinα`
   - `global`/`z` → `qx = q·sinα`, `qz = q·cosα`

   **Nicht über Winkel rechnen.** Die Tabelle oben ist äquivalent zu `qx = v · e_x`, `qz = v · e_z` mit
   `e_x = (cosα, sinα)` und `e_z = (−sinα, cosα)`. Zwei Skalarprodukte, kein
   `atan2`, kein `rotate` — damit ist die Drehung vorzeichenfrei ohne Herleitung.
   **Genau das steht inzwischen fertig in `fem-geometry`:**
   `Line.toLocal(axis, Vector.make(qx, qz))`. Nicht neu bauen.

3. **Projektion** (`referenceLength`): `q_lokal = q · L_proj / L`, mit
   `L_proj = |Δx|` bei `'horizontalProjection'` (Schnee) und `|Δz|` bei
   `'verticalProjection'`. Der Faktor ist über den Stab konstant, deshalb bleibt
   eine lineare Last linear — `LineLoadSegment` reicht aus, es braucht keinen
   reicheren Ausgabetyp.
   **Nicht neu schreiben:** dieselbe Funktion steht schon in
   `fem-loads/src/validate.ts:344` (`projectedLength`), heute privat. Aus
   `fem-loads` exportieren statt hier zu duplizieren — die Bezugslänge ist
   Lastdomäne, nicht Geometrie, und die Definition „welche Achse wird gemessen"
   darf nicht zweimal existieren.
4. **Positionen** `relativeDistances` → `x = pct·L/100`. `distanceFromStart`,
   `from`, `to` sind laut `fem-loads/src/types.ts:106` **immer** entlang der
   Stabachse gemessen, unabhängig von `referenceLength` — die skaliert nur den
   Wert, nie die Lage.
5. **Distribution → Container**: `'constant'` und `'trapezoidal'` mit
   `fullLength` → ein Segment `{from: 0, to: L}`; `'trapezoidal'` mit Extent →
   `{from, to}`; `'point'` → `PointElementLoad`. Momentlasten tragen kein
   `frame`/`axis`/`referenceLength` und gehen direkt nach `my1/my2` bzw. `my`.
6. **Merge pro Stab** — alle Lasten eines Stabs in **ein** `LocalElementLoad`.

**Verifiziert, spart eine Diskussion:** überlappende Segmente sind unkritisch.
`consistentLoad` summiert jedes Segment unabhängig
(`packages/fem-element/src/timoshenko.ts:118`). Es braucht also **kein**
Zerschneiden an Sprungstellen, kein Sortieren, keine Normalisierung — solange
niemand einen zweiten Konsumenten baut, der das anders sieht (siehe offene
Frage 5).

## Entschieden (nicht neu aufrollen)

| Thema                                                       | Entscheidung                                                                                                                                                                                          | Quelle                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Package-Name                                                | `@baustatik/fem-load-resolve` (Singular „load")                                                                                                                                                       | `Elementformulierung.md:63`, `package.json` existiert bereits                            |
| Ersatzknotenlast liegt **nicht** hier                       | `consistentLoad` ist Methode der Elementformulierung, weil sie die Ansatzfunktionen braucht                                                                                                           | `Elementformulierung.md:42`                                                              |
| Ausgabetyp                                                  | `LocalElementLoad` aus `fem-element`, nicht ein eigener                                                                                                                                               | Element bündelt bewusst zu einem Objekt, damit `consistentLoad` alle Sprungstellen sieht |
| Namensschema                                                | `qx/qz/my(x)` verteilt, `px/pz/my@a` punktuell, Achsindex ohne Unterstrich                                                                                                                            | `fem-loads/HANDOFF.md`, `Elementformulierung.md`                                         |
| Vorzeichen                                                  | z abwärts, Last nach unten positiv                                                                                                                                                                    | durchgängig in fem-geometry / fem-loads / fem-element                                    |
| `fem-geometry` als Dependency                               | ja, nicht verhandelbar — die x/z-Konvention lebt an einer Stelle                                                                                                                                      | `fem-loads/package.json` hat sie aus demselben Grund; Details in Frage 8                 |
| Frame-Drehung über Skalarprodukte                           | `Line.toLocal(axis, v)` statt `atan2`/`rotate` — nicht wegen Vorzeichen (die stimmen seit der orientierungstreuen `convert.ts`), sondern weil die Definition der Stabachse an einer Stelle leben soll | `fem-geometry/CONTEXT.md`, ausgeführt in Frage 8                                         |
| 6×6-DOF-Transformation gehört **nicht** nach `fem-geometry` | Geometrie kennt Vektoren, keine Freiheitsgrade; der `phiY`-Drehsinn ist Frage 1                                                                                                                       | Frage 8                                                                                  |
| Eingangsvalidierung liegt in `fem-loads`                    | `validate.ts` ist ausdrücklich „das Tor vor `fem-load-resolve`"                                                                                                                                       | `fem-loads/src/validate.ts:5-8`                                                          |
| Dangling references                                         | werfen, nicht still überspringen                                                                                                                                                                      | Prinzip aus `fem-viewer/src/errors.ts`                                                   |
| Fehlerklassen                                               | benannte Klassen, abgeleitet von `BaustatikError`; Aufrufer unterscheiden per `instanceof`, nicht per Meldungstext                                                                                    | `.agents/rules/error-hierarchy-policy.md`, umgesetzt in `fem-element/src/errors.ts`      |

## Offene Fragen — das Material für die Grilling-Session

Reihenfolge ist bewusst: 1 blockiert die Tests, 2–3 formen die Signatur, 4–8
sind Detailfragen, die sich danach schnell entscheiden. **Frage 7 ist inzwischen
erledigt**, Frage 3 und 8 sind seit der Geometrie-Durchsicht deutlich enger — die
Nummerierung bleibt trotzdem stehen, weil `fem-loads/src/validate.ts:324` auf
„offene Frage 6" verweist.

### 1. Vorzeichen/Drehsinn von `my` — die einzige echte Falle

`fem-loads` sagt zu `my` nur „Drehung um die y-Achse"
(`fem-loads/src/types.ts:81`). `fem-element` definiert `theta = dw/dx`,
positiver Drehsinn **von +x nach +z** (`fem-element/CONTEXT.md:65`). Beide sind
für sich sauber dokumentiert, aber **nie gegeneinander abgeglichen**.

Bei rechtshändigem (x, y, z) mit z abwärts zeigt y in die Zeichenebene, und eine
positive Drehung um +y führt +z nach +x — also **entgegengesetzt** zu `theta`.
Wenn das stimmt, gilt `phiY = −theta` und `my` braucht beim Durchreichen ein
Minus. Das ist eine Herleitung, keine verifizierte Tatsache: es hängt daran, was
`fem-loads` mit „um y" tatsächlich meint (rechtshändig, oder „im Bild
rechtsdrehend"). **Das ist eine Entscheidung, keine Recherche.**

Empfehlung: Konvention explizit in `fem-loads/src/types.ts` an `my` schreiben,
dann in `fem-load-resolve` einen Test, der ohne Rechnung diskriminiert — ein
Stab-Einzelmoment an `a = 0` muss ein **reines** Knotenmoment am Anfangsknoten
ergeben (`f_e = [0,0,±m,0,0,0]`), und das Vorzeichen dieses Eintrags ist die
Antwort. Solange das offen ist, ist jeder schräge Rahmen ein potenzieller
Vorzeichenfehler, der erst bei der Kontrollrechnung auffällt.

### 2. Gehören Knotenlasten in dieses Package?

`Elementformulierung.md:63` nennt nur `BeamLoad → LocalElementLoad`. `NodeLoad`
ist bereits global und komponentenweise; sie braucht nur Fan-out über
`nodeIds[]` und Summierung je Knoten.

Empfehlung: **ja, mit aufnehmen.** Dann sieht `fem-solver` genau eine
Eingabeform und muss nicht selbst zwischen zwei Lastwelten unterscheiden. Der
Gegenpunkt: das Package heißt „resolve" und für Knotenlasten gibt es nichts
aufzulösen. Wenn nein, muss entschieden werden, wo der Fan-out sonst lebt.

### 3. Signatur: pro Last oder über das ganze Array?

Der Merge pro Stab (Aufgabe 6) ist ohnehin eine Aggregation über alle Lasten,
genau wie die `qRef`-Normierung in der Darstellung.

Empfehlung: ein Aufruf über die ganze Lastmenge.

**Die Unterfrage „Arrays oder Lookup-Interface" ist entschieden** — von
`fem-loads`, nicht von uns. `validate.ts:52` definiert bereits

```ts
export type LoadModelGeometry = {
  hasNode(nodeId: string): boolean;
  beamAxis(beamId: string): Line | undefined; // p1 = Anfangs-, p2 = Endknoten
};
```

mit ausdrücklicher Begründung (`validate.ts:21-27`), warum **nicht**
`@baustatik/fem` importiert wird: gebraucht werden nur zwei Auskünfte, und die
Abbildung `Beam → Line` leistet der Aufrufer, der `fem` ohnehin kennt. Wenn
`resolve` jetzt `Node[]`/`Beam[]` nimmt, hat dieselbe Kette zwei verschiedene
Modell-Zugänge und der Aufrufer baut beide. Also **dieselbe Form übernehmen**;
die frühere Empfehlung „Arrays, Maps intern" ist damit überholt, und `fem` fällt
aus der Dependency-Liste (siehe Implementierungsschritt 3).

```ts
resolveLoads(model: LoadModelGeometry, loads: FEMLoad[]): {
  beams: Map<string, LocalElementLoad>;
  nodes: Map<string, { fx: number; fz: number; my: number }>;
};
```

Offen bleibt nur, ob `LoadModelGeometry` in `fem-loads` bleibt und von hier
importiert wird (Kopplung an `fem-loads`, die ohnehin besteht) oder ob der Typ
strukturell dupliziert wird. Empfehlung: importieren.

### 4. Ein Stab = ein Element, oder spricht die API in Elementen?

Heute bildet die Signatur `beamId → LocalElementLoad` ab. Wird ein Stab später
in mehrere finite Elemente unterteilt, müssen die Lasten an den Elementgrenzen
geteilt werden — und die Signatur bricht.

Empfehlung: **bei 1 Stab = 1 Element bleiben**, aber die Entscheidung bewusst
notieren. Das Timoshenko-IIE ist für den geraden, prismatischen Fall exakt; in
der linearen Statik gibt es keinen Konvergenzgrund zu verfeinern. Wenn Meshing
dennoch kommt (z. B. für Verlaufsdarstellung), ist der Split an Elementgrenzen
eine reine Erweiterung derselben Segmentlogik. Gegenposition: jetzt schon in
Elementen sprechen kostet wenig und spart einen Bruch.

### 5. Muss die Ausgabe normalisiert sein (sortiert, überlappungsfrei)?

Für `consistentLoad` **nein** (verifiziert, s. o.). Aber `internalForces` ist ein
werfender Stub (`fem-element/CONTEXT.md:146`) und wird den Lastverlauf an einer
Stelle `x` auswerten müssen — eine überlappungsfreie, sortierte Segmentliste
wäre dort bequemer.

Empfehlung: **nicht normalisieren** (YAGNI), aber als bekannte Einschränkung in
`CONTEXT.md` festhalten, damit `internalForces` später bewusst entscheidet, ob
es selbst zusammenfasst oder hier eine Normalform anfordert.

### 6. `referenceLength` an der Einzellast — ignorieren oder aus dem Typ werfen?

`BeamForcePointLoad` erbt `BeamForceDirection` inklusive `referenceLength`
(`fem-loads/src/types.ts:138`). Eine Einzellast in kN hat keine Bezugslänge; das
Feld hat dort keine Wirkung.

Empfehlung: aus dem Typ entfernen (`BeamForceDirection` in Richtung + Bezugslänge
aufspalten) — nach derselben Begründung, mit der die Momentlast `frame`/`axis`
verloren hat: ein Feld ohne Wirkung ist Zustand, den alle mitschleppen und
ignorieren müssen. Das ist eine Änderung an `fem-loads` und braucht die
Zustimmung des Nutzers, weil es ein RFEM-Abgleich sein könnte, den ich nicht
kenne. Fallback: hier stillschweigend ignorieren und den Grund kommentieren.

### 7. Wie viel Validierung liegt hier, wie viel in `fem-loads/validate.ts`? — **ERLEDIGT**

`validate.ts` existiert inzwischen (`packages/fem-loads/src/validate.ts`, mit
`tests/validate.test.ts`) und ist genau so gebaut, wie die frühere Empfehlung es
wollte — der Header sagt es wörtlich: „Das Tor vor `@baustatik/fem-load-resolve`.
Wer hier durchkommt, darf dort ohne weitere Prüfung `0 <= from <= to <= L`
annehmen, eine Stablänge `L > 0` haben und eine projizierte Bezugslänge ungleich
0" (`validate.ts:5-8`).

Damit prüft `resolve` **gar nichts** von alledem noch einmal. Es gibt zwei
Ausgänge: `validateLoads` sammelt alle Beanstandungen (für den Eingabedialog),
`assertValidLoads` wirft den ersten (für die Rechenkette). Zu entscheiden bleibt
nur: ruft `resolve` selbst `assertValidLoads` auf, oder setzt es die Validierung
als Vorbedingung des Aufrufers voraus? Empfehlung: **voraussetzen und in
`CONTEXT.md` dokumentieren** — sonst validiert eine Kette aus Dialog + Rechnung
zweimal, und die Fehlerbehandlung liegt an der falschen Stelle.

### 8. Wie viel `fem-geometry` — und was gehört dorthin? — **ENTSCHIEDEN & UMGESETZT**

> **Ergebnis (2026-07-24):** Das lokale Stab-Koordinatensystem liegt jetzt in
> `fem-geometry` — `Line.frame`, `Line.toLocal`, `Line.toGlobal` samt
> `LineFrame`-Typ (`packages/fem-geometry/src/line.ts`), gespiegelt in
> `geometry-2d` (`ey` statt `ez`). `fem-load-resolve` baut sich also **kein
> eigenes** `cosα/sinα` mehr zusammen, sondern ruft `Line.toLocal(axis, v)` —
> die Frame-Drehung aus Aufgabe 2 ist damit ein Einzeiler. Die
> 6×6-DOF-Transformation bleibt weiterhin draußen.
>
> **Die Vorzeichenfalle unten existiert nicht mehr.** Sie kam daher, dass
> `convert.ts` `z → −y` spiegelte; eine Spiegelung konjugiert jede Drehung in
> ihre Umkehrung (`M·P·M = P⁻¹`), weshalb `normalVector`, `perpendicular`,
> `rotate`, `angle` und `parallel` invertiert zurückkamen. `convert.ts` bildet
> jetzt orientierungstreu ab (`y := z`, ohne Minus), weil `geometry-2d` gar
> nicht weiß, wo „oben" ist — es kodiert nur „positive Drehung führt Achse 1
> auf Achse 2", und das ist genau unsere Konvention `+x → +z`. Seither gilt
> `Line.normalVector === ez`, und `Vector.angle` liefert direkt `α` mit
> `sinα = Δz/L`. `packages/fem-geometry/tests/` (33 Tests) hält den Drehsinn
> fest; Begründung im Kopf von `fem-geometry/src/convert.ts` und in
> `fem-geometry/CONTEXT.md`. **Der Abschnitt „Die Vorzeichenfalle" unten ist
> nur noch Historie.**

**Die Dependency ist beschlossen** (`fem-loads` hat sie bereits, aus demselben
Grund: die x/z-Konvention soll an einer Stelle definiert bleiben). Die offene
Frage ist eine andere: _Wie viel Geometrie steckt hier überhaupt, und soll etwas
davon nach `fem-geometry` wandern?_

**Befund: es ist wenig.** Von den sechs Aufgaben sind nur zwei geometrisch —
Stabachse → `L, Δx, Δz` (Aufgabe 1) und die Frame-Drehung (Aufgabe 2). Der
Projektionsfaktor ist Lastkonvention (Schnee/Wind), `pct·L/100` ist Dreisatz,
Segmente und Merge sind Container-Logik. Nichts davon gehört nach
`fem-geometry`, so geometrisch es klingt. Real benutzt werden dort nur
`Line.length`, `Vector.fromPoints` und `Vector.dot`.

**Die Vorzeichenfalle — HISTORIE, seit `convert.ts` orientierungstreu ist.**
Damals bildete `fem-geometry` intern auf `geometry-2d` ab und **spiegelte**
dabei `z → −y`. Das drehte den Drehsinn um. Für die Stabachse mit
`e_x = (cosα, sinα)` galt deshalb:

```
Line.direction(axis)     → (dx = cosα,  dz =  sinα)   ✓  ist e_x
Line.normalVector(axis)  → (dx = sinα,  dz = −cosα)   ✗  ist MINUS e_z
```

Die lokale z-Achse, die Aufgabe 2 verlangt, ist `(−sinα, cosα)` — und **das
liefert `Line.normalVector` heute auch**. Der 45°-Test unten sollte das
Vorzeichen trotzdem prüfen und nicht nur den Betrag; er ist billig und wäre der
Wächter, falls jemand die Spiegelung wieder einbaut.

Daraus die Empfehlung, **genau eine** Sache nach `fem-geometry` auszulagern: das
lokale Stab-Koordinatensystem.

```ts
// fem-geometry/src/line.ts
frame(line: Line): { ex: Vector; ez: Vector };   // ez = (−sinα, cosα), z abwärts
toLocal(line: Line, v: Vector): Vector;
toGlobal(line: Line, v: Vector): Vector;
```

Begründung ist **nicht** die Ersparnis — das sind vier Zeilen —, sondern die Zahl
der Konsumenten: `fem-solver` braucht dieselbe Drehung für K_lokal → K_global,
`internalForces` die Rückrichtung, der Viewer sie zum Zeichnen von Lastpfeilen am
schrägen Stab. Bauen sich die alle einzeln `cosα = Δx/L, sinα = Δz/L` zusammen,
steht dieselbe Herleitung an vier Stellen und muss viermal richtig sein.

**Wo der Schnitt liegt — wichtig, damit die Auslagerung nicht überschießt:** die
2×2-Vektordrehung ist Geometrie. Die **6×6-DOF-Transformation** (mit der
`phiY`-Zeile und dem Drehsinn aus Frage 1) ist FEM und gehört nach
`fem-element`/`fem-solver`. `fem-geometry` kennt Vektoren, keine Freiheitsgrade.

Kostenhinweis (erledigt): `fem-geometry` hatte **keinen einzigen Test**. Das
Verzeichnis `packages/fem-geometry/tests/` existiert jetzt mit 33 Tests, davon
`vector.test.ts` als Wächter über den Drehsinn und in `line.test.ts` der
Vergleich `frame().ez === normalVector` — er würde anschlagen, falls jemand die
Spiegelung in `convert.ts` wieder einführt.

## Danach: Implementierung

Wenn die Fragen entschieden sind, in dieser Reihenfolge:

1. ~~`packages/fem-loads/src/validate.ts`~~ — **erledigt**, siehe Frage 7.
   ~~`Line.frame`/`toLocal`/`toGlobal` in `fem-geometry`~~ — **erledigt**, siehe
   Frage 8. Offen bleibt hier nur: `projectedLength` aus `fem-loads`
   exportieren (Aufgabe 3).
2. `src/types.ts`, `src/resolve.ts`, `src/errors.ts`, `src/index.ts` nach dem
   Muster von `packages/fem-element/src/`.
3. `dependencies` in `packages/fem-load-resolve/package.json` eintragen — steht
   heute auf `{}`; erwartet werden `fem-loads`, `fem-geometry`, `fem-element`
   (nur Typen), `errors`. **`fem` gehört nicht dazu**, wenn Frage 3 wie
   empfohlen über `LoadModelGeometry` läuft. Danach `pnpm install` im Root.
4. `CONTEXT.md` nach dem `fem-element/CONTEXT.md`-Muster (Purpose / Boundaries /
   Dependencies / Navigation / Invariants / Validation / Known constraints).
5. Zeile in der Tabelle in `AGENTS.md:29` ergänzen — dort fehlen bislang
   `fem-loads`, `fem-load-resolve` und `fem-solver` komplett.

### Tests, die tatsächlich diskriminieren

Vorbild ist `packages/fem-element/tests/` — dort steht auch die Erfahrung, dass
Gleichgewicht und Partitionsinvarianz **nicht** diskriminieren
(`fem-element/CONTEXT.md:106`). Analog hier:

- **Waagrechter Stab**: `global` und `local` müssen identische Ergebnisse
  liefern — ein Test, der nichts über schräge Stäbe aussagt, aber grobe
  Vorzeichenfehler fängt.
- **45°-Stab**: `global`/`z` zerfällt in `qx = qz = q·√2/2`. Der eigentliche
  Test der Frame-Drehung — und er muss **Vorzeichen** prüfen, nicht Beträge,
  sonst geht ihm die `normalVector`-Falle aus Frage 8 durch. Ein Stab mit
  `α = −45°` daneben diskriminiert zusätzlich, weil dort `qx` und `qz`
  unterschiedliche Vorzeichen haben.
- **Schnee auf 30°-Dach**: `'horizontalProjection'`, Handrechnung
  `Σ = q·|Δx|` — die Gesamtresultierende muss stimmen, unabhängig von der
  Zerlegung. Genau der Fall, bei dem die Bezugslängen-Falle aus
  `fem-loads/HANDOFF.md` zuschlägt.
- **Einzelmoment an `a = 0`** → reines Knotenmoment: der Vorzeichentest aus
  Frage 1.
- **Stab mit vertauschten Knoten**: `global`-Lasten müssen dasselbe globale
  Ergebnis geben, `local`-Lasten das gespiegelte.
- **Dieselbe Last auf zwei Stäben mit `relativeDistances`**: unterschiedliche
  absolute Positionen, weil L unterschiedlich ist.

## Validierung

```text
pnpm --filter @baustatik/fem-load-resolve typecheck
pnpm --filter @baustatik/fem-load-resolve test
pnpm --filter @baustatik/fem-element test        # darf sich nicht ändern
```

`lint`/`format` scheitern bis `pnpm install` gelaufen ist („oxfmt konnte nicht
gefunden werden") — derselbe Effekt wie bei `fem-loads` beschrieben; `typecheck`
läuft trotzdem.

Reine Funktionen ohne Konva/DOM/WASM, in Node testbar.

## Suggested skills

- **`grilling`** — der ausdrückliche Zweck dieses Handoffs. Die verbliebenen
  sieben offenen Fragen oben sind der Fragebaum (7 ist erledigt); sie einzeln
  durchgehen, Empfehlung nennen, Antwort abwarten. Frage 1 zuerst, sie blockiert
  die Tests.
- **`codebase-design`** — für Frage 3 und 4 (Signatur, Element- vs. Stab-Ebene):
  die Vokabel für „wo liegt der Schnitt" und wie tief das Modul sein soll.
- **`domain-modeling`** — danach, für `CONTEXT.md` und den Eintrag in
  `AGENTS.md`; das Repo pflegt Package-Kontexte nach einem festen Muster.
- **`tdd`** — für die Umsetzung. Die diskriminierenden Tests oben sind bewusst
  vorformuliert, damit sie vor dem Code stehen können.

## Konventionen des Repos

- Verbindliche Anweisungen in `AGENTS.md`; `CLAUDE.md` verweist dorthin.
- pnpm 9 + Turborepo, Vitest, Biome; packageweise zusätzlich Oxlint/Oxfmt.
- Kommentare im Bestandscode sind **deutsch** und erklären das _Warum_.
- Releases über Changesets, Versionen nicht von Hand editieren.
- `packages/konva-adapter-BAK/`, `fem-1d/`, `fem-2d/`, `solver-2d/` sind
  Altlasten bzw. Platzhalter ohne `package.json` — nicht anfassen.
  `solver-2d` wird durch `fem-solver` ersetzt.
- `cross-section-viewer` ist ein Gerüst und **kein** Referenzmuster; `grid-2d`
  ist das Vorbild.
