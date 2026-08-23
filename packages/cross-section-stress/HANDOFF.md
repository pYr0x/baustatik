# Handoff: `@baustatik/cross-section-stress`

**Stand:** 2026-08-19 · Branch `main` · Package **existiert noch nicht** — kein
Verzeichnis, kein Gerüst, nur dieser Handoff. Ebenfalls neu anzulegen ist das
Blatt `@baustatik/section-forces`.

**Zweck der nächsten Session:** die elastische Spannungsauswertung bauen. Sie ist
der Zähler zu dem Nenner, den `@baustatik/cross-section` seit ADR 0022/0029/0052
liefert, und sie ist der erste Baustein der Bemessungskette.

## Vorgelagerte Dokumente — zuerst lesen, hier nicht wiederholt

| Dokument | Was drinsteht |
| --- | --- |
| [`docs/adr/0054-…`](../../docs/adr/0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md) | die Entscheidung selbst: warum eigenes Package, warum die Idealisierung keine Grenze ist, der Einheiten-Schnitt, das Blatt `section-forces` |
| [`docs/adr/0055-…`](../../docs/adr/0055-the-cross-section-response-is-the-shared-machine.md) | warum dieses Package **nicht** die allgemeine Schicht ist. Wer hier Beton oder plastischen Stahl unterbringen will, hat die Grenze verletzt |
| `packages/cross-section/CONTEXT.md`, Abschnitt „Die Grenze zur Bemessung, mechanisch pruefbar" | die Regel, die dieses Package erst nötig macht |
| `packages/cross-section/src/stress-points/types.ts` | `StressPoint`: `y`, `z`, `t` in mm, `Sy`, `Sz` in cm³, Koordinaten **relativ zum Schwerpunkt** |
| [`docs/adr/0024-…`](../../docs/adr/0024-units-at-the-package-boundary.md) | Umrechnung an einer Stelle je Quelle |
| `packages/actions/` | das Vorbild für ein Blatt ohne Abhängigkeiten („Terms only") |

## Die Lage in einem Bild

```
CrossSection ──sectionProperties()──→ SectionProperties   (m², m⁴, m)   ┐
             └─stressPoints()───────→ StressPoint[]       (mm, cm³)     ├─→ σ, τ, σv  [MPa]
                                      SectionForces       (kN, kNm)     ┘
   @baustatik/cross-section              @baustatik/section-forces         DIESES PACKAGE
        ✅ fertig                            ⬜ anzulegen                     ⬜ anzulegen
```

`stressPoints()` gibt für `kind === 'section-geometry'` **`undefined`** zurück
(`stress-points/index.ts:74`). Das ist kein Loch, das dieses Package stopft.

## Zwei Erzeuger, ein Vokabular

Der häufigste Denkfehler an dieser Stelle, deshalb ausgeschrieben: die
gezeichnete Vollgeometrie läuft **nicht** durch dieses Package. Es gibt zwei
Erzeuger nebeneinander, und sie teilen nur den Ergebnistyp.

```
parametrisch / Katalog / dünnwandig
  CrossSection ──→ sectionProperties + stressPoints (y, z, t, Sy, Sz)
                        └──→ DIESES PACKAGE ──────────→ StressAtPoint[]

gezeichneter Vollquerschnitt
  SectionGeometry ──→ cross-section-fe: vernetzen, lösen, Felder
                        └──→ + SectionForces + ν ─────→ StressAtPoint[]
```

Dieses Package besitzt `StressAtPoint` und σv, `cross-section-fe` importiert
beides und antwortet in denselben Worten. Das ist die ganze Verbindung. Die FE
ruft hier keine Funktion auf, und `cross-section` reicht nichts durch.

**Insbesondere liefert die FE keine `StressPoint`.** Ein `StressPoint` ist
`y`, `z`, `t`, `Sy`, `Sz`, also der **Nenner der Schnittformel**
`τ = V·S/(I·t)`. Diese Größen gibt es nur in einem Schnittmodell. Im FE-Feld
existiert weder eine Schnittbreite `t` noch ein abgeschnittenes `S`: der
Schubfluss ist ein Feld, und τ fällt direkt aus den Gradienten der
Verwölbungsfelder. Wer die FE Spannungspunkte erzeugen lässt, um sie hier
einzusetzen, erfindet `S` und `t`, nur um sie eine Zeile später wieder
wegzukürzen.

Dazu kommt eine Größe, die ein `StressPoint` gar nicht tragen kann: τ aus der
FE hängt über `m = ν/(1+ν)` von der Querdehnzahl ab (ADR 0045),
`V·S/(I·t)` tut das nicht.

Was es dagegen wirklich gibt: ein Nachweis braucht am Ende wenige benannte
Punkte und kein Feld mit zehntausend Knoten. Diese Auswahl ist offen, sie steht
als Frage 3 in `packages/cross-section-fe/HANDOFF.md` und gehört zur
Bemessungsstelle (ADR 0056). Die Punkte, die dabei herauskommen, tragen fertige
σ- und τ-Werte, nicht `S` und `t`.

## Die Aufgaben

### 1. Blatt `@baustatik/section-forces`

Ein Record, eine Vorzeichenkonvention im JSDoc, sonst nichts. Keine
Abhängigkeit, keine Funktion.

```ts
type SectionForces = {
  readonly N?: number;   // [kN], positiv = Zug
  readonly Vy?: number;  // [kN]
  readonly Vz?: number;  // [kN]
  readonly My?: number;  // [kNm]
  readonly Mz?: number;  // [kNm]
  readonly Mt?: number;  // [kNm]
};
```

Alle Felder optional, weil der ebene Rahmen drei davon füllt und ein späterer
räumlicher sechs. **Nicht** `SectionForces` aus `@baustatik/fem-element`
verwenden — das ist das Tripel des ebenen Rahmens, und es hier zu nehmen macht
den Schritt auf 3D zu einem Breaking Change an genau der Stelle, durch die jede
Spannung des Programms läuft (ADR 0054).

Die Namensgleichheit mit `fem-element` ist bekannt und in ADR 0054 ausdrücklich
**nicht** aufgelöst. Nicht in dieser Session umbenennen.

### 2. Gerüst des Packages

`package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`,
`CONTEXT.md`. Vorlage: ein kleines bestehendes Package mit Tests, etwa
`@baustatik/round` oder `@baustatik/section-geometry`. Dependencies:
`cross-section`, `errors`, `section-forces`, `units`. Version `0.0.0`, Changeset
`patch` (ADR 0036).

### 3. Die Einheitenschleuse

Genau eine Eingangsumrechnung je Quelle, ein Ausgang.

| Quelle | Einheit | |
| --- | --- | --- |
| `SectionProperties` | m², m⁴, m | `fem-section-resolve` braucht sie so |
| `StressPoint` | mm, `S` in cm³ | so steht es im Ausdruck und in der Fixture |
| `SectionForces` | kN, kNm | wie überall im Rahmen |
| **Ausgang** | **MPa** | die Einheit, in der eine Festigkeit verglichen wird |

`S` [cm³] · `V` [kN] / `Iy` [m⁴] ergibt eine völlig plausibel aussehende Zahl,
die um eine Zehnerpotenz falsch ist. Faktoren kommen aus `@baustatik/units`, an
**einer** Stelle im Package, nie als Literal (CODING_STANDARDS, ADR 0024).

### 4. σ, mit `Iyz`

```
σ(y, z) = N/A + Biegeanteil(My, Mz, y, z)
```

Der Biegeanteil muss die allgemeine Form mit `Iyz` tragen, nicht `My·z/Iy`. Ob
in den Hauptachsen (`alpha`, `Iu`, `Iv` liegen bereit) oder mit dem vollen
Nenner `Iy·Iz − Iyz²`, ist Sache des Packages. **Die Vorzeichenkonvention wird
in `CONTEXT.md` festgeschrieben**, nicht pro Datei entschieden.

**Achtung, das ist heute nicht über den öffentlichen Weg testbar.** Jede Form,
die Spannungspunkte liefert, ist mindestens einfach symmetrisch, also `Iyz = 0`.
Der Zweig braucht deshalb einen Test mit einem **synthetischen**
`SectionProperties` plus handgemachten Punkten. Das gedrehte Rechteck ist das
saubere Orakel: `Iy`, `Iz`, `Iyz` eines um 30° gedrehten Rechtecks sind
geschlossen bekannt, und σ muss dasselbe liefern wie die Hauptachsenrechnung am
ungedrehten.

### 5. τ und σv

`τ = V·S/(I·t)`, getrennt für `Vz` über `Sy` und `Vy` über `Sz`, und
`σv = sqrt(σ² + 3τ²)`.

Die Schubspannung ist damit **über die Schnittbreite konstant**. Das ist die
Annahme, auf der die Spannungspunkte gebaut sind, `cross-section/CONTEXT.md`
schreibt sie aus, und dieses Package erbt sie, statt sie zu reparieren. Wer sie
reparieren will, meint die FE.

`Mt` bleibt in dieser Session **ohne Wirkung**: der ebene Rahmen liefert kein
Torsionsmoment, und die Torsionsschubspannung des dünnwandigen Querschnitts ist
eine eigene Vorlage. Das Feld existiert im Record, wird hier aber nicht
ausgewertet. Im `CONTEXT.md` benennen, nicht stillschweigend ignorieren.

### 6. Die Tür

```ts
stressesAtPoints(
  properties: SectionProperties,
  points: readonly StressPoint[],
  forces: SectionForces,
): readonly StressAtPoint[]
```

plus eine Bequemlichkeit, die den Umweg über beide Aufrufe spart und das
`undefined` von `stressPoints` erbt:

```ts
sectionStresses(cs: CrossSection, forces: SectionForces):
  readonly StressAtPoint[] | undefined
```

`StressAtPoint` trägt `nr`, `y`, `z`, `sigma`, `tau`, `sigmaV`. **Kein Maximum
und kein „maßgebender Punkt"** — welcher Punkt maßgebend ist, hängt vom Nachweis
ab und gehört nach `steel-design` (ADR 0056).

## Orakel — was die Tests prüfen

Alle von Hand nachrechenbar, keines braucht eine Norm:

| Fall | Erwartung |
| --- | --- |
| Rechteck `b×h`, nur `My` | σ am Rand = `My/W`, `W = b·h²/6` |
| Rechteck, nur `Vz` | τ im Schwerpunkt = `1,5·V/A` (Scheitel der Grashof-Parabel) |
| nur `N` | σ = `N/A` an **jedem** Punkt, τ überall 0 |
| IPE 80, `Vz` | τ im Schwerpunkt gegen `Sy = 11,61 cm³` der Tabelle; der Katalogzweig ist der an 546 Punkten validierte |
| τ = 0 | `σv = |σ|` |
| σ = 0 | `σv = √3·|τ|` |
| gedrehtes Rechteck, synthetisch | σ gleich der Hauptachsenrechnung (siehe Aufgabe 4) |

Der Vorzeichentest gehört dazu und wird gern vergessen: `My > 0` erzeugt nach
`fem-element/src/types.ts:182` Zug auf der lokalen `+z`-Seite. Ein Test, der das
festnagelt, ist mehr wert als drei Betragstests.

## Offene Fragen für die Session

1. **Hauptachsen oder voller Nenner.** Beides ist richtig. Die Hauptachsenform
   braucht eine Drehung der Punktkoordinaten und liefert `alpha` frei Haus, die
   `Iyz`-Form spart die Drehung. Empfehlung: voller Nenner, weil die Punkte dann
   in dem System bleiben, in dem sie gedruckt werden.
2. **Wohin mit σv.** Die Vergleichsspannung ist werkstofffrei und gehört
   deshalb hierher, nicht nach `steel-design`. Gegenposition: `σv` mit dem
   Faktor 3 ist bereits ein Versagenskriterium. Empfehlung: hier, mit einem
   Satz im `CONTEXT.md`, dass der Faktor aus der Gestaltänderungsenergie kommt
   und nicht aus EN 1993.
3. **Ein Aufruf je Bemessungsstelle oder ein Batch.** Empfehlung: einer, und die
   Schleife in `design-solver` (ADR 0056). Ein Batch hier ist ein zweiter
   Rechenweg mit denselben Formeln.

## Abgrenzung — was in dieser Session ausdrücklich nicht entsteht

- Keine Festigkeit, kein `fyd`, kein γM, keine Querschnittsklasse. Die Regel
  „grep nach `fy` findet nichts" ist die Abnahmebedingung, genau wie beim
  Nachbarpackage.
- Keine plastischen Widerstände. Die fallen aus `cross-section-response`
  (ADR 0055).
- Keine FE-Spannungen. Siehe `packages/cross-section-fe/HANDOFF.md`.
- Kein Viewer. Ein vierter Pull am `cross-section-viewer` ist in ADR 0054
  vorgesehen und nicht Teil dieses Schritts.
