# Handoff: Elementformulierung (ebenes Stabwerk)

**Stand:** 2026-07-23 · Branch `main` · noch nichts davon existiert als Code.
Dieses Dokument hält die Architektur- und Theorie-Entscheidungen fest, bevor
`@baustatik/fem-element`, `@baustatik/fem-solver` und `@baustatik/fem-load-resolve`
angelegt werden. Es baut auf `packages/fem-loads/HANDOFF.md` (Lastmodell) auf und
setzt dessen Grenzen fort.

## Ziel

Ebene FEM für Stabwerke: aus äußeren Lasten (Knoten- und Stablasten) die
globalen Ersatzknotenlasten bilden, das System `K d = F` lösen, Reaktionen und
Schnittgrößen bestimmen. Zwei Balkentheorien:

- **Euler–Bernoulli** — einfacher Fall, ohne Schubverformung. **Kein eigenes
  Produktivelement:** EB ist der Grenzfall φ=0 des Timoshenko-Elements (siehe
  „Solver- und Theorie-Grenzen"). Die geschlossene EB-K wird nur als
  Test-Referenz hergeleitet, nicht als zweiter Dauer-Codepfad.
- **Timoshenko** — Standardfall mit Schubverformung, aber locking-frei über
  einen höherwertigen, gekoppelten Ansatz (nicht das naive linear/lineare
  Element). Das **einzige** produktive Element; akzeptiert φ=0 für den
  schubstarren (EB-)Fall.

Beide Elemente teilen dieselben sechs lokalen Freiheitsgrade
`d_e = [u₁, w₁, θ₁, u₂, w₂, θ₂]ᵀ`, damit Transformation, Assemblierung,
Randbedingungen und Solver gemeinsam bleiben.

**DOF-Benennung (lokal ↔ Knotenwelt):** `u` = axial, `w` = quer, `θ` = Drehung
sind die lokale Element-Notation. Am Knoten/Auflager heißen dieselben Größen
`ux` / `uz` / `phiY` (`fem`-Modell, `NodeSupport` in `fem-loads`). Also
`w ≙ uz`, `θ ≙ phiY`; nur die lokale Achse ist um den Stabwinkel gedreht.

## Die Erkenntnis, die alles andere trägt

**Eine Elementformulierung ist ein untrennbares Paket** aus Kinematik,
Ansatzfunktionen, Steifigkeitsmatrix, konsistentem Lastvektor und
Schnittgrößen-Rekonstruktion. Einzelne Formeln aus verschiedenen Elementen
dürfen **nie** gemischt werden (z. B. Timoshenko-K mit Euler–Bernoulli-Lastvektor).

Daraus folgt die zweite, ebenso wichtige Erkenntnis:

> **Die Ersatzknotenlast ist kein Ort, sondern eine Pipeline.** Der Schritt, der
> die Ansatzfunktionen braucht, gehört zum **Element**, nicht zu den Lasten.

```
BeamLoad (abstrakt)          qx/qz/my(x), px/pz/my@a in LOKALEN Koords    f_e (6-Vektor)      global K d = F
  frame/axis/refLength   ──►  entlang der Stabachse                  ──►  über N_w,N_θ,N_u  ──►  assemblieren
  @baustatik/fem-loads        @baustatik/fem-load-resolve (Geometrie)      @baustatik/fem-element   @baustatik/fem-solver
  (Eingabe, EXISTIERT)        (Projektion, global↔lokal, Teilsplit)        (das Element-Paket)      (kennt keine Theorie)
```

`fem-loads` bleibt reines Eingabemodell und leistet **keine** Ersatzknotenlasten
(so bereits im `fem-loads`-HANDOFF entschieden — diese Grenze bleibt). Die
Umrechnung `lokale Last → f_e` ist eine **Methode der Elementformulierung**.

## Package-Aufteilung (Ergänzung zu `AGENTS.md`)

| Package                                                               | Rolle                                                                                                                                                                                                                                                                     | hängt an                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `@baustatik/fem`                                                      | Modell-Typen (Node, Beam, Support) — **existiert**                                                                                                                                                                                                                        | —                                                   |
| `@baustatik/fem-loads`                                                | Last-Eingabemodell + validate — **existiert**, bleibt theorie- und f_e-frei                                                                                                                                                                                               | (später `fem-geometry`)                             |
| `@baustatik/fem-geometry`                                             | x/z-Geometrie (z abwärts) — **existiert**                                                                                                                                                                                                                                 | core, errors, geometry-2d                           |
| **`@baustatik/fem-load-resolve`** _(neu)_                             | Schritt A: `BeamLoad` → lokale Streckenlast `{qx(x), qz(x), my(x)}` + Einzellasten `{px, pz, my}@a` je Element; frame-Drehung, Projektion (`referenceLength`), Teillast-Split                                                                                             | `fem-loads`, `fem-geometry`, `fem`                  |
| **`@baustatik/fem-element`** _(neu — „das Paket aus allem")_          | `FrameElement2DFormulation`-Interface; `EulerBernoulli2D`, `Timoshenko2D`: Kinematik, N_u/N_w/N_θ, lokale K, konsistenter f_e, Schnittgrößen; Gauß-Integration                                                                                                            | nur `SectionStiffness` + interner 6×6-Matrixcode   |
| **`@baustatik/fem-solver`** _(neu — ersetzt Platzhalter `solver-2d`)_ | Schritt C: Transformation, Assemblierung, BC, `K d = F` **aufbauen**, Reaktionen `R = Kd − F`, statische Kondensation für Releases (K **und** f gemeinsam). **Struktur-Löser** (direkte Steifigkeitsmethode); die reine Lineare Algebra `K d = F` liegt in `linalg-wasm`. | `fem`, `fem-element` (nur Interface), `linalg-wasm` |
| **`@baustatik/linalg-wasm`** _(neu)_                                  | Nur `solve(n, K, F) → d`: dichter/dünnbesetzter Linear-Solver in **Rust (faer)**, zu **WASM** kompiliert. Kennt keine FEM-Begriffe, nur Zahlen (`Float64Array`).                                                                                                          | — (isolierter Rust/WASM-Build)                      |

**Abhängigkeitsrichtung, die eingehalten werden muss:** `fem-solver` kennt nur
das Interface `FrameElement2DFormulation` und **nie** die Balkentheorie. Wenn
Timoshenko neben Euler–Bernoulli tritt, darf der Solver unberührt bleiben — das
ist der Lackmustest, ob die Grenze hält.

## Solver- und Theorie-Grenzen

Zwei bewusst gezogene Grenzen, die den Zuschnitt der Packages bestimmen:

**1. Euler–Bernoulli ist der Grenzfall φ=0, kein zweites Element.** Mathematisch
ist EB der Grenzübergang φ→0 des locking-freien Timoshenko-IIE-Elements: die
IIE-Ansatzfunktionen gehen exakt in die Hermite-Polynome über, `1+φ=1` (keine
Division durch null). Produktiv gibt es daher **nur** `Timoshenko2D`. „EB" als
Modellierungswunsch heißt „Schub vernachlässigen" = φ=0 erzwingen; dafür genügt
ein schubstarres Flag / schubstarre `SectionStiffness` (κGA=∞), **kein** eigenes
Element. Optional darf ein dünner `EulerBernoulli2D`-Wrapper das Interface
erfüllen, indem er die Timoshenko-Mathematik mit φ=0 aufruft — nie mit kopierten
Formeln. Die geschlossene EB-K (Hermite) wird trotzdem hergeleitet, aber
**ausschließlich als Test-Referenz**: der φ=0-Fall des IIE muss exakt auf sie
fallen (stärkster Validierungsanker).

**2. Nur der Solve läuft in Rust/faer/WASM.** Die Aufteilung von `K d = F`:

- **TypeScript (`fem-solver`):** Transformation, Assemblierung von K, BC,
  statische Kondensation (Releases, K+f gemeinsam), Reaktionen `R = Kd − F`.
  Alles Domänenlogik, in Node ohne WASM testbar (Mock-Solver).
- **Rust/faer → WASM (`linalg-wasm`):** ausschließlich `solve(n, K, F) → d`.
  Kein FEM-Wissen, nur Zahlen über die WASM-Grenze (`Float64Array`,
  dense column-major oder sparse/CSR; Start dense LU/Cholesky).

`fem-solver` hängt über das schmale Interface `solve(n, K, F): d` an
`linalg-wasm`. So bleibt der Rust/WASM-Build isoliert und die Assemblierung/BC/
Kondensation ohne WASM testbar.

## Das Element-Interface

```ts
interface FrameElement2DFormulation {
  localStiffness(props: SectionStiffness, L: number): Matrix6;
  consistentLoad(
    load: LocalElementLoad,
    props: SectionStiffness,
    L: number,
  ): Vector6; // = Ersatzknotenlast
  internalForces(
    x: number,
    dLocal: Vector6,
    load: LocalElementLoad,
    props: SectionStiffness,
    L: number,
  ): { N: number; V: number; M: number };
  shapeFunctions(
    x: number,
    props: SectionStiffness,
    L: number,
  ): { Nu: number[]; Nw: number[]; Ntheta: number[] };
}
```

`consistentLoad` und `internalForces` liegen **hier**, weil beide die
element-eigenen Ansatzfunktionen brauchen (Regel: gleiche N für Verschiebung
und Last). Der Solver ruft nur `localStiffness` + `consistentLoad` ab,
transformiert und assembliert.

## Entschieden (nicht neu aufrollen)

| Thema                         | Entscheidung                                                                                                                                                                                           | Grund                                                                                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOF                           | `[u₁, w₁, θ₁, u₂, w₂, θ₂]` lokal, identisch für beide Theorien                                                                                                                                         | gemeinsame Transformation/Assemblierung/Solver                                                                                                                                                                                                            |
| Lastnamen (lokal, aufgelöst)  | Stab-Strecke `qx/qz/my(x)`, Stab-Einzel `px/pz/my@a`, Knoten `fx/fz/my`; Achsindex `x`=axial, `z`=quer, **ohne Unterstrich** wie `fx/fz/my` in `fem-loads`                                             | `q`/`p` = Stab, `f` = Knoten (deckt sich mit `fem-loads`). `my` ist über Strecke (kNm/m) und Punkt (kNm) hinweg **bewusst** derselbe Buchstabe — die bekannte `fem-loads`-Warze; Trennung über Container-Feld + Einheiten-Kommentar, **nicht** Groß/klein |
| Vorzeichen                    | z abwärts (wie `fem-geometry`, `fem-loads`); lokales x vom Anfangs- zum Endknoten                                                                                                                      | eine Konvention für Ansatz, K, f, Transformation, Schnittgrößen, Reaktionen                                                                                                                                                                               |
| Transformation                | `K_glob = Tᵀ K_lok T`, `f_glob = Tᵀ f_lok` — für EB und Timoshenko identisch                                                                                                                           | liegt im Solver, nicht im Element                                                                                                                                                                                                                         |
| Euler–Bernoulli               | **kein eigenes Produktivelement**; = Timoshenko mit φ=0. Geschlossene 6×6-K (Hermite) nur als Test-Referenz                                                                                            | Doppel-Codepfad vermeiden; EB ist exakter φ=0-Grenzfall des IIE                                                                                                                                                                                           |
| Timoshenko                    | locking-freies IIE: `u` linear, `w` kubisch, `θ` quadratisch, φ-gekoppelt; **nicht** das naive linear/lineare Element                                                                                  | für den geraden, prismatischen, linear-elastischen Fall wirklich locking-frei                                                                                                                                                                             |
| K-Quelle                      | **beide produktiv**: `Timoshenko2D` (geschlossene Formel, Default) und `Timoshenko2DIntegrated` (∫BᵀDB per Gauß). Gemeinsamer Kern, nur `stiffness()` injiziert; kein Options-Parameter an `prepare()` | der Integrationscode existiert für den K↔N-Check ohnehin; als zweite Formulierung kostet er fast nichts und prüft sich gegen die geschlossene. Siehe ADR-0004                                                                                             |
| Verteiltes/punktuelles Moment | koppelt über `N_θ`, **nie** über `N_w'`                                                                                                                                                                | ein Moment leistet Arbeit an der Verdrehung; bei Timoshenko ist `θ ≠ w'`. Mit `N_w'` liegt ein Kragarm unter konstantem `m` um ~13 % daneben. Bei φ=0 fallen beide zusammen                                                                               |
| Schubparameter                | `φ = 12EI / (κGA·L²)`; `S = κGA` als **eine** effektive Schubsteifigkeit                                                                                                                               | verhindert doppeltes Anwenden von κ                                                                                                                                                                                                                       |
| Grenzübergang                 | `φ → 0`: Timoshenko-K → EB-K, N_IIE → Hermite, **exakt**                                                                                                                                               | einziger korrekter Grenzfall                                                                                                                                                                                                                              |
| Schnittgrößen                 | `s_e = K_e d_e − f_e^Stablast`; Originallast zusätzlich speichern                                                                                                                                      | Ersatzknotenvektor allein rekonstruiert den Verlauf zwischen den Knoten nicht                                                                                                                                                                             |
| Releases                      | K **und** f gemeinsam statisch kondensieren                                                                                                                                                            | nur K zu ändern wäre falsch; liegt im Element (f-Anteil)                                                                                                                                                                                                  |
| Gauß                          | 3 Punkte pro stetigem Lastabschnitt (exakt bis Grad 5); an Lastsprüngen splitten; Punktlasten durch Auswertung N(a), nicht integrieren                                                                 | reicht für konstante + linear veränderliche Lasten                                                                                                                                                                                                        |
| `SectionStiffness`           | Typ in `fem-element`; Builder `resolveSectionStiffness(...)` in **separatem Adapter**                                                                                                          | Element-Mathematik importiert nie `material`/`cross-section`; κGA wird einmal berechnet                                                                                                                                                                   |
| Matrix/Solver                 | Element: hand-gerollte 6×6, keine externe Dep. Globaler Linear-Solver: **Rust (faer) → WASM** in `linalg-wasm`, nur der reine Solve; Assemblierung bleibt in TS (`fem-solver`)                         | einzige Stelle, die eine LA-Abhängigkeit rechtfertigt; Domänenlogik ohne WASM testbar                                                                                                                                                                     |
| `fem-1d`/`fem-2d`             | **kein** 1D/2D-Element-Split wiederbeleben                                                                                                                                                             | ein 2D-Rahmenelement mit 6 DOF; der 1D-Durchlaufträger ist die Teilmenge ohne Neigung                                                                                                                                                                     |
| `solver-2d`                   | Platzhalter mit `fem-solver` befüllen oder umbenennen                                                                                                                                                  | war ohne `package.json`                                                                                                                                                                                                                                   |

## Kritik am Ausgangsplan — was übernommen, was geändert wurde

Der von der anderen KI gelieferte Plan ist fachlich solide und wird als Grundlage
übernommen. Bewusst geändert bzw. ergänzt:

1. **EB als φ=0-Grenzfall behandeln, nicht dauerhaft doppelter Codepfad.** Die
   IIE-Ansatzfunktionen gehen für φ→0 exakt in Hermite über. Die geschlossene EB-K
   zuerst herleiten und gegen Handrechnung validieren, dann als φ=0-Fall des
   Timoshenko-Elements gegenprüfen — die EB-K bleibt danach **nur Test-Referenz**,
   produktiv gibt es ein Element (Timoshenko, φ=0 für schubstarr). Details unter
   „Solver- und Theorie-Grenzen".
2. **`internalForces` gehört ins Interface.** Der Ausgangsplan hatte es im
   Prinzip-Satz, aber nicht im Interface — sonst landet die Verlaufsrekonstruktion
   doch wieder im Kern und mischt die Theorien.
3. ~~**Ansatzfunktionen ZUERST herleiten, geschlossene K nur als Test.**~~
   **ÜBERHOLT — siehe [ADR-0004](docs/adr/0004-timoshenko-closed-and-integrated-stiffness.md).**
   Die ursprüngliche Forderung („K aus den N integrieren, geschlossene Formel nur
   als Test") und die Gegenempfehlung im Folge-Handoff („geschlossen produktiv,
   Integration nur als Test") gehen beide von _einem_ Produktivpfad aus. Der
   Integrationscode muss aber ohnehin existieren, denn der K↔N-Cross-Check _ist_
   die Integration. Umgesetzt sind daher **beide** als exportierte
   Formulierungen: `Timoshenko2D` (geschlossen, Default) und
   `Timoshenko2DIntegrated` (Gauß). Sie teilen einen Kern und prüfen sich
   gegenseitig.
4. **N_θ bei EB ist kein unabhängiges Feld:** `θ = w'`, also `N_θ = d/dx(Hermite)`.
   Bei Timoshenko ist θ echt unabhängig. Im Code klar trennen, sonst wird das
   verteilte Moment im EB-Element subtil falsch.
5. **Fixed-End-Forces beim Timoshenko-Element sind exakt**, weil die
   IIE-N die exakten homogenen Lösungen sind → starker Validierungsanker: ein Element
   unter q muss dieselben Einspannmomente liefern wie die feine Diskretisierung
   (bis auf Rundung, nicht „ungefähr").
6. **Zwei zusätzliche Tests:** Rang-/Eigenwerttest der lokalen K (genau 3
   Nulleigenwerte = 3 Starrkörpermoden in 2D) und Patch-Test (konstanter
   Krümmungs-/Dehnungszustand über mehrere Elemente).
7. **Reaktionen `R = Kd − F`** mit **ungekürzter** K und **vollem** F (inkl.
   Stablastanteil), ausgewertet an den gebundenen DOF.

## Kernformeln (zum Nachschlagen)

Timoshenko-Biege-K für `[w₁, θ₁, w₂, θ₂]`:

```
K_b = EI / (L³(1+φ)) ·
  [ 12      6L        -12     6L
    6L    (4+φ)L²     -6L   (2-φ)L²
   -12     -6L         12    -6L
    6L    (2-φ)L²     -6L   (4+φ)L² ]        mit  φ = 12EI/(κGA·L²)
```

Axialanteil: `K_a = EA/L · [[1,-1],[-1,1]]`. Grenzfall `φ→0` ⇒ EB-K.

Konsistenter Lastvektor bei konstanter **Querlast** `qz` (bei **beiden**
Theorien identisch, aber nur in diesem Sonderfall):
`f_e = [0, qz·L/2, qz·L²/12, 0, qz·L/2, −qz·L²/12]ᵀ`.

Kragarm-Referenz Timoshenko: `w(L) = PL³/(3EI) + PL/S` (2. Term = Schubanteil).

## Implementierungsreihenfolge

1. `fem-element`: Interface + Achsen-/Vorzeichenkonvention dokumentieren.
2. **EB-K als Test-Referenz** herleiten: Hermite-N, geschlossene K, konsistenter
   f_e; Tests (Symmetrie, Starrkörpermoden, konstante Dehnung/Krümmung, Kragarm
   `PL³/3EI` und `qL⁴/8EI`, Lastgleichgewicht, Knotenvertauschung). Kein
   produktives `EulerBernoulli2D` — dient als Validierungsanker für den φ=0-Fall in Schritt 6.
3. `fem-solver`: Transformation, Assemblierung, BC, Reaktionen — gegen das
   Interface, theoriefrei. Der reine Solve `K d = F` wird an `linalg-wasm`
   (Rust/faer→WASM) delegiert; in Node zunächst mit Mock-Solver testbar.
4. `SectionStiffness`-Adapter (`material` × `cross-section`), κGA einmal.
5. `fem-load-resolve`: Schritt A mit `fem-geometry` (frame, Projektion, Split).
6. `Timoshenko2D` als **einziges Produktivelement**: φ, locking-freie K,
   gekoppelte N_w(x,φ)/N_θ(x,φ), konsistenter f_e ausschließlich mit diesen N.
   φ=0 (schubstarr) deckt den EB-Fall ab. Tests: EB-Grenzfall (exakt gegen die
   Referenz-K aus Schritt 2), Kragarmformel, Locking-Sweep `L/h = 5,10,20,100,1000`.
   Solver bleibt unberührt.
7. Releases: gemeinsame Kondensation von K_e und f_e im Element.
8. Erst danach: Schnittgrößenverläufe innerhalb der Elemente.

## Nächste Schritte (konkret)

1. `packages/fem-element/` anlegen nach dem Muster von `packages/fem-loads/`
   (`package.json`, `tsconfig.json`, `vite.config.ts`, `.oxlintrc.json`,
   `.oxfmtrc.json`, `src/index.ts`, `CONTEXT.md`).
2. `src/types.ts`: `SectionStiffness`, `LocalElementLoad`, `Vector6`, `Matrix6`,
   `FrameElement2DFormulation`.
3. Zeilen in der Tabelle in `AGENTS.md` ergänzen (vier neue Packages:
   `fem-load-resolve`, `fem-element`, `fem-solver`, `linalg-wasm`), Platzhalter
   `solver-2d`/`fem-1d`/`fem-2d`-Absatz aktualisieren.
4. `CONTEXT.md` je Package nach dem `packages/fem-viewer/CONTEXT.md`-Muster
   (Purpose / Boundaries / Dependencies / Navigation / Invariants / Validation /
   Known constraints).

## Validierung

```text
pnpm --filter @baustatik/fem-element typecheck
pnpm --filter @baustatik/fem-element test
pnpm --filter @baustatik/fem-solver test
```

Element-Mathematik ist reine Funktion ohne Konva/DOM und in Node testbar.

## Konventionen des Repos

- Verbindliche Anweisungen in `AGENTS.md`; `CLAUDE.md` verweist dorthin.
- pnpm 9 + Turborepo, Vitest, Biome; packageweise zusätzlich Oxlint/Oxfmt.
- Kommentare im Bestandscode sind **deutsch** und erklären das _Warum_.
- Releases über Changesets, Versionen nicht von Hand editieren.
- `packages/konva-adapter-BAK/`, `fem-1d/`, `fem-2d/`, `solver-2d/` sind Altlasten
  bzw. Platzhalter ohne `package.json`.
- `cross-section-viewer` ist ein Gerüst und **kein** Referenzmuster; `grid-2d`
  ist das Vorbild.
