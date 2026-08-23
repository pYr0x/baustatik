# Handoff: FE-Spannungen im gezeichneten Vollquerschnitt

**Stand:** 2026-08-19 · Branch `main` · Package ist **fertig und im Einsatz**;
was fehlt, ist eine zweite Tür. `computeFESectionValues` liefert heute `It`, den
Schubmittelpunkt und κ als ν-freies Koeffizientenpaar. Die Felder, aus denen das
fällt, werden nach `evaluateShear` **verworfen**.

**Zweck der nächsten Session:** σ und τ im gezeichneten Vollquerschnitt
auswerten, in demselben Vokabular, in dem `@baustatik/cross-section-stress` die
dünnwandigen Punkte beantwortet.

## Vorgelagerte Dokumente — zuerst lesen, hier nicht wiederholt

| Dokument | Was drinsteht |
| --- | --- |
| [`docs/adr/0054-…`](../../docs/adr/0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md) | warum die Recovery **hier** bleibt und nicht in ein drittes Package geht |
| [`docs/adr/0048-…`](../../docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md) | die Verwölbungsformulierung, fünf rechte Seiten auf einer Faktorisierung |
| [`docs/adr/0045-…`](../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md) | `m = ν/(1+ν)`, und der Satz über ν, den diese Arbeit bricht (siehe unten) |
| [`docs/adr/0039-…`](../../docs/adr/0039-meshing-is-a-transient-worker-capability.md) | das Netz ist transient und geht nicht in den Satz |
| `packages/cross-section-fe/CONTEXT.md` | Quadraturen, Hauptachsen, Selbstprüfungen |
| `docs/messungen/t-querschnitt-grashof-gegen-fe.md` | die gemessene Lücke zwischen Wandmodell und FE |

## Die Lage in einem Bild

```
computeFESectionValues(geometry, policy)
   │
   ├─ mesh (Tri6)              ← kommt heraus, transient (ADR 0039)
   ├─ prepareSection → FESection
   ├─ assembleNeumannStiffness → EINE Faktorisierung
   ├─ solve(…, k = 5, …)  →  ω, ψ0z, ψ1z, ψ0y, ψ1y
   │                           └──────┬──────┘
   │                                  │  heute: evaluateShear → Zahlen, Felder weg
   │                                  └─ MORGEN: heraus, transient, neben dem Netz
   └─ FEComputation { state, mesh, diagnostics }
                                  + fields?          ⬅ AUFGABE 1
```

Die fünf Felder stehen in `compute.ts:132` als Spalten einer `Float64Array`
bereit. Nach `evaluateShear` fallen sie aus dem Geltungsbereich.

## Warum die Felder heraus müssen und nicht die Spannung

Eine Spannung braucht eine **Schnittgröße**, und die steht zum Zeitpunkt des
FE-Laufs nicht fest: sie kommt später, je Lastkombination und je
Bemessungsstelle. Die Spannung kann also weder in den Satz noch in das Ergebnis
des Laufs.

Die drei Alternativen und warum sie ausscheiden:

- **Zweimal lösen**, einmal für κ und einmal für die Spannung. Dieselbe
  Faktorisierung zweimal, und Bild und Zahl bekommen zwei Chancen, sich zu
  widersprechen. Das ist genau das Argument, mit dem ADR 0047 das Netz
  herausgibt statt es wegzuwerfen.
- **Die Felder in den Satz schreiben.** Ein Feld hat die Größe des Netzes. Der
  Satz ist serialisierbar und versioniert (ADR 0049); ein Netz gehört nicht
  hinein, und ADR 0039 sagt das bereits.
- **Ein drittes Package**, das Netz und Lösung hereinbekommt. Das macht ein
  transientes Objekt zu öffentlicher API (ADR 0054).

Bleibt: die Felder kommen transient heraus, neben dem Netz, und eine **reine,
synchrone** Funktion rechnet daraus die Spannung.

## Die Aufgaben

### 1. Die Felder überleben lassen

`FEComputation` bekommt ein optionales `fields`, mit derselben Begründung und
demselben Vorbehalt wie `mesh`: transient, nicht im Satz, nicht serialisiert.
Der Bund trägt ω und die vier Schubfelder, dazu `theta` und den Frame, ohne den
die Felder nicht interpretierbar sind (`createFrame` in `assemble.ts:172`).

`prepareSection` und `FESection` sind bereits exportiert — die reine Tür braucht
also keine neuen internen Typen nach außen.

### 2. σ, geschlossen

σ braucht kein Feld. Der Stab ist prismatisch und elastisch, also gilt an jedem
Netzknoten dieselbe Formel wie am Spannungspunkt, ausgewertet in den Hauptachsen
des Netzes:

```
σ = N/A + Biegeanteil(My, Mz, y, z)
```

`A`, `Iy`, `Iz`, `Iyz` liegen in `FESection`, und sie stammen **aus dem Netz**,
nicht aus Green — dieselbe Fläche, über die integriert wurde, wie beim
Fingerabdruck. Nicht die Green-Werte einsetzen und nicht mischen.

### 3. τ aus den Gradienten

Aus ψ0/ψ1 je Richtung fällt τ linear in `m = ν/(1+ν)`, genau wie die Energie in
`evaluate.ts`. Aus ω fällt die Torsionsschubspannung, drehinvariant und
ν-unabhängig.

Die Gradienten sind **elementweise** und über Elementgrenzen unstetig, weil die
Ansatzfunktionen C0 sind. Damit stellt sich die Frage aus Punkt 1 der offenen
Fragen unten.

### 4. Das Ergebnis im gemeinsamen Vokabular

`@baustatik/cross-section-stress` besitzt `StressAtPoint` und σv (ADR 0054).
Dieses Package bekommt die Dependency und antwortet in denselben Worten, damit
ein Nachweis nicht wissen muss, welche Theorie geantwortet hat. Kein Zyklus:
`cross-section-stress` hängt an `cross-section`, dieses Package auch.

**Der Typ wird geliehen, die Rechnung nicht.** Es gibt zwei Erzeuger
nebeneinander, und sie teilen nur den Ergebnistyp:

```
parametrisch / Katalog / dünnwandig
  CrossSection ──→ sectionProperties + stressPoints (y, z, t, Sy, Sz)
                        └──→ cross-section-stress ───→ StressAtPoint[]

gezeichneter Vollquerschnitt
  SectionGeometry ──→ DIESES PACKAGE: vernetzen, lösen, Felder
                        └──→ + SectionForces + ν ────→ StressAtPoint[]
```

Dieses Package ruft in `cross-section-stress` **keine Funktion** auf, und
`cross-section` reicht nichts zwischen den beiden durch: `stressPoints()` gibt
für `kind === 'section-geometry'` weiterhin `undefined` zurück, und das bleibt
so.

**Und die FE erzeugt keine `StressPoint`.** Der naheliegende Fehlentwurf ist,
hier Spannungspunkte zu produzieren und sie an `cross-section-stress` zu
übergeben. Ein `StressPoint` ist `y`, `z`, `t`, `Sy`, `Sz`, also der Nenner der
Schnittformel `τ = V·S/(I·t)`. Im Feld gibt es weder eine Schnittbreite `t`
noch ein abgeschnittenes `S`; τ fällt direkt aus den Gradienten. `S` und `t`
wären hier erfunden, nur um eine Zeile später wieder wegzukürzen. Dazu käme,
dass τ aus der FE über `m = ν/(1+ν)` von der Querdehnzahl abhängt und
`V·S/(I·t)` nicht: ein `StressPoint` kann diese Abhängigkeit nicht tragen.

Die Auswahl weniger benannter Nachweispunkte aus dem Feld ist eine andere Frage
und steht als Frage 3 unten. Solche Punkte tragen fertige σ- und τ-Werte.

## Der Satz über ν, den diese Arbeit bricht

`AGENTS.md` sagt über `fem-section-resolve`, es sei „the only place in the repo
where geometry is multiplied by material, and therefore **the only place ν
enters**". ADR 0045 begründet das: der gezeichnete Vollquerschnitt speichert κ
als Formel, und erst `sectionStiffness` setzt ν des Stabmaterials ein.

**Eine Spannungsrecovery macht diesen Satz falsch.** τ hängt über `m` von ν ab,
und anders als κ wird die Spannung nicht gespeichert, sondern für ein bekanntes
Material ausgewertet. Die Alternative, auch die Spannung als Koeffizientenpaar je
Knoten zurückzugeben und ν anderswo einsetzen zu lassen, verdoppelt jedes Feld
und hilft niemandem, der ein Bild zeichnen will.

Das ist **in der Session zu entscheiden, nicht nebenbei**: ADR 0045 bekommt
einen Banner, `AGENTS.md` den korrigierten Satz. Der wahrscheinliche Wortlaut:
ν betritt das Repo, wo Geometrie auf Material trifft, und das ist bei der
Steifigkeit `fem-section-resolve` und bei der Spannung diese Tür. Was bleibt,
ist die Aussage von ADR 0045, die wirklich trägt: **im Satz steht kein ν**.

## Orakel — was die Tests prüfen

Die Suite dieses Packages vernetzt und löst echt und überspringt sich nicht
(`AGENTS.md`). Diese Orakel passen dazu:

| Fall | Erwartung |
| --- | --- |
| Gleichgewicht σ | `∫σ dA = N` und `∫σ·z dA = My` über das Netz, auf Maschinengenauigkeit |
| Gleichgewicht τ | `∫τ_z dA = Vz`. Die Diagnose `equilibriumZ` prüft das bereits für `Vz = 1` — dieselbe Größe, ein Aufruf weiter |
| Rechteck unter `Vz` | τ auf der Mittellinie gegen die Grashof-Parabel, Scheitel `1,5·V/A` |
| Kreis unter `Mt` | `τ = Mt·r/Ip`, geschlossen |
| reines `N` | σ konstant über den ganzen Querschnitt, τ identisch null |
| T-Querschnitt | gegen `docs/messungen/t-querschnitt-grashof-gegen-fe.md`; die Lücke ist gemessen und soll sich nicht ändern |

Der Kreis unter `Mt` ist das schärfste davon: er prüft ω, die Drehinvarianz und
die Einheiten in einem Zug, und die Referenz ist eine Zeile Handrechnung.

## Offene Fragen für die Session

1. **Knotenmittelung oder elementweise Ausgabe.** Die Gradienten springen an
   Elementgrenzen. Elementweise ist ehrlich und für den Nachweis unbrauchbar
   (welcher der sechs Werte am Knoten gilt?); gemittelt ist glatt und
   verschleiert den Netzfehler. Empfehlung: flächengewichtet auf die Knoten
   mitteln **und** den größten Sprung als Diagnose mitgeben, auf dem Muster von
   `FEDiagnostics` — dann ist die Glättung sichtbar statt still.
2. **Alle Knoten oder nur der Rand.** τ ist im Vollquerschnitt am Rand am
   größten, σ ohnehin. Ein Nachweis braucht wenige Punkte, ein Bild braucht das
   ganze Feld. Empfehlung: das ganze Feld zurückgeben, weil es transient ist
   und ohnehin für die Zeichnung entsteht; die Auswahl trifft `design-solver`.
3. **Wer bestimmt die Randfaser.** Beim dünnwandigen Querschnitt macht das die
   Vorlage (ADR 0052). Hier gibt es keine Vorlage, nur Knoten. Empfehlung:
   diese Session entscheidet es **nicht** und gibt das Feld heraus; die Regel
   „welcher Knoten ist ein Nachweispunkt" gehört zur Bemessungsstelle
   (ADR 0056).

## Abgrenzung — was in dieser Session ausdrücklich nicht entsteht

- Kein Konvergenzlauf und keine Verfeinerung. ADR 0047 hat das entschieden, und
  eine Spannung ist kein Grund, es aufzumachen.
- Keine Wölbkrafttorsion. `Mt` wird als Saint-Venant-Torsion ausgewertet, mehr
  gibt die Formulierung nicht her.
- Keine Festigkeit und kein Vergleich. Dieselbe Grep-Regel wie nebenan.
- Kein Viewer. Das Feld zu zeichnen ist ein eigener Schritt am
  `cross-section-viewer`.
