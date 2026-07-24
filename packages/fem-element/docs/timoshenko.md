# Handoff: fem-element Inkrement 2 — `Timoshenko2D` (+ Gauß, Ansatzfunktionen)

> **ABGEARBEITET.** Inkrement 2 ist umgesetzt und grün. Dieses Dokument bleibt
> als Herleitung der Validierungsanker stehen, ist aber **keine gültige
> Entscheidungsgrundlage mehr**. Verbindlich sind:
> [ADR-0004](../../../docs/adr/0004-timoshenko-closed-and-integrated-stiffness.md)
> und [`CONTEXT.md`](../CONTEXT.md).
>
> Drei Punkte weichen bewusst vom Text unten ab:
>
> 1. **K-Quelle:** nicht „Option A allein". Umgesetzt sind **beide** als
>    exportierte Formulierungen — `Timoshenko2D` (geschlossen, Default) und
>    `Timoshenko2DIntegrated` (Gauß). Das `Infinity·0`-Argument unten gegen B
>    bleibt gültig, betrifft aber nur den Schubterm der integrierten Variante und
>    wird dort mit einem exakten `phi === 0`-Zweig erledigt.
> 2. **Validierungsanker 3** ist kein Test-seitiges Integral mehr, sondern der direkte
>    Vergleich der beiden Formulierungen.
> 3. **Validierungsanker 7 diskriminiert die `Nθ`-Gewichtung NICHT.** Nachgemessen: `Nθ` und
>    `Nw'` sind beide verfeinerungsinvariant (n = 1, 2, 8, 64 liefern je denselben
>    Wert), unterscheiden sich aber um ~13 %. Der wirksame Validierungsanker ist der
>    Vergleich gegen die geschlossene Lösung `w(L) = m·L³/(3EI)` plus die
>    Forderung, dass ein Knoten-Einzelmoment ein reines Knotenmoment ergibt.

## Was dieser Handoff NICHT wiederholt (nur referenzieren)

- **Theorie/Architektur gesamt:** `Elementformulierung.md` (Repo-Wurzel) — φ,
  Kernformeln, Package-Aufteilung, Implementierungsreihenfolge (Schritt 6 = dieses
  Inkrement).
- **Konventionen & Invarianten:** `packages/fem-element/CONTEXT.md` (DOF-Ordnung,
  z abwärts, `theta = dw/dx`, GAs-nur-in-φ, Schub global, prepare-Fabrik).
- **`prepare()`-Entscheidung:** `docs/adr/0003-frame-element-prepare-factory.md`.
- **Interface & Typen (fertig):** `packages/fem-element/src/types.ts`.
- **EB-Referenz-Validierungsanker (fertig, test-only):**
  `packages/fem-element/tests/references/euler-bernoulli.ts` +
  `packages/fem-element/tests/euler-bernoulli.test.ts`.

## Stand: Inkrement 1 ist abgeschlossen und grün

Typen/Interface (`prepare()`-Fabrik, Tupel-`Matrix6`) und der **unabhängige,
geschlossene EB-Referenz-Validierungsanker** stehen; `typecheck`/`test` (8 Tests)/`lint`
grün. Wichtig für Inkrement 2: die **Vorzeichenkonvention ist fixiert und
getestet** — `theta = dw/dx`, Drehsinn +x→+z, klassische Hermite-Signaturen; sie
deckt sich exakt mit dem Handoff-Lastvektor `[0, qL/2, qL²/12, 0, qL/2,
−qL²/12]`. Die geschlossene Timoshenko-K muss bei φ=0 **exakt** auf `ebStiffness`
fallen.

## Ziel Inkrement 2

`Timoshenko2D` als **einziges Produktivelement** (locking-freies IIE), das
`FrameElement2DFormulation` erfüllt. φ=0 (schubstarr) deckt den EB-Fall ab; der
Solver bleibt unberührt.

Umfang: `stiffness()`, `shapeFunctions()`, `consistentLoad()` + allgemeiner
Gauß-Integrator, φ-Normalisierung in `prepare()`. **`internalForces()` bleibt
gestubt** (wirft „späteres Inkrement") — Schnittgrößenverläufe sind laut
`Elementformulierung.md` Schritt 8, nach den Releases.

## DIE offene Entscheidung — hier zuerst grillen: Woher kommt die produktive K?

In der Grilling-Session zu Inkrement 1 **nicht** entschieden. `Elementformulierung.md`
ist in sich gespannt: „Kernformeln" gibt die geschlossene K_b, „Kritik #3" will
„K aus den N integrieren, geschlossene Formel nur als Test".

- **Option A (Empfehlung): geschlossen produktiv + Integration als Test.** K_b
  direkt; ein Test integriert `∫BᵀDB` aus den IIE-N und prüft `≈ K_b`.
- **Option B: aus den N integriert produktiv, K_b als Test** (Kritik #3 wörtlich).

**Ausschlaggebend gegen B:** Beim Integrieren steht `GAs` als **roher Faktor** im
Schubterm `∫B_sᵀ·GAs·B_s`. Für `'rigid'`/`Infinity` ist das bei φ=0 exakt
`Infinity·0 = NaN` → man bräuchte einen φ=0-Sonderzweig, also genau den zweiten
Codepfad und die Inf-Gefahr, die **Grilling-Invariante #3** (GAs nur in φ)
vermeiden sollte. A bekommt B's einziges echtes Argument (K↔N-Konsistenz) gratis
über den Integrationstest, ohne NaN-Zweig und ohne Locking-Risiko. B lohnt nur
bei Generalisierung über den prismatischen Fall hinaus — hier außer Scope.

Die vollständige Vor-/Nachteil-Abwägung wurde in der Session bereits ausgearbeitet
(nicht erneut herleiten, nur entscheiden).

## Zu implementierende Mathematik

- **Geschlossene K_b** (aus `Elementformulierung.md`, Ordnung `[w1,θ1,w2,θ2]`):
  `EI/(L³(1+φ))·[[12,6L,−12,6L],[6L,(4+φ)L²,−6L,(2−φ)L²],[−12,−6L,12,−6L],
[6L,(2−φ)L²,−6L,(4+φ)L²]]`; Axial `EA/L·[[1,−1],[−1,1]]`; eingeordnet in die 6
  DOF `[u1,w1,θ1,u2,w2,θ2]`. Vorzeichen wie EB-Referenz (Hermite-Signaturen).
- **φ-Normalisierung in `prepare()`** (die EINE Stelle): `'rigid'`/`Infinity` → 0;
  `NaN`/`≤0` ablehnen; sonst `φ = 12·EI/(GAs·L²)`.
- **IIE-Ansatzfunktionen** `Nw(ξ,φ)`, `Nθ(ξ,φ)` (interdependent, locking-frei) +
  Ableitungen; `Nu` linear. **Exakte Formeln bei Umsetzung herleiten und gegen
  Validierungsanker prüfen** (nicht aus dem Gedächtnis festschreiben). Definierende
  Eigenschaften: Schubdehnung `γ = w'−θ` konstant über das Element; bei φ=0 gehen
  `Nw`→Hermite, `Nθ`→Hermite-Ableitung über.
- **Gauß-Integrator (shared util):** 3 Punkte pro Segment (exakt bis Grad 5);
  je `LineLoadSegment` ein stetiger Abschnitt → ein Integral; Punktlasten über
  `N(a)`, nicht integrieren. `consistentLoad = Σ_seg ∫Nᵀq + Σ_pts N(a)·P`.
- **Verteiltes Moment koppelt über `Nθ`, nicht `Nw'`** (Kritik #4: θ ist bei
  Timoshenko echt unabhängig — anders als in der EB-Referenz, die `Nw'` nutzt).
  Bei φ=0 muss `Nθ → Nw'` gehen, damit die φ=0-Konsistenz hält.

## Validierungsanker (Tests)

1. **EB-Grenzfall exakt:** `Timoshenko.prepare({...,GAs:'rigid'},L).stiffness()`
   elementweise `=== ebStiffness` (FP-exakt). Ebenso `consistentLoad` bei φ=0
   gegen `ebConsistentLoad` für dieselben Lasten.
2. **Ansatzfunktionen bei φ=0 = Hermite** (`Nw`, `Nθ`).
3. **K↔N-Konsistenz:** `∫BᵀDB` aus den IIE-N `≈` geschlossene K_b (das ist der
   Integrationstest aus Option A).
4. **Kragarm mit Schub:** `w(L) = PL³/(3EI) + PL/S` (S = κGA); der Schubterm muss
   auftauchen.
5. **Locking-Sweep** `L/h = 5,10,20,100,1000`: Verhältnis berechnet/analytisch
   bleibt ~1 auch für sehr schlank (1000) — kein künstliches Versteifen.
6. **Symmetrie, 3 Starrkörpermoden** (`K·r=0`) auch für die Timoshenko-K.
7. **Lastvektor:** Gleichgewicht (Σ = Gesamtlast) und **exakte** Einspannmomente
   für konstante q (IIE-N sind exakte homogene Lösungen → exakte Fixed-End-Forces,
   Kritik #5).

## Vorgeschlagene Dateien

- `src/timoshenko.ts` — `Timoshenko2D: FrameElement2DFormulation`; `prepare()` mit
  φ-Normalisierung; `stiffness/shapeFunctions/consistentLoad`; `internalForces`
  gestubt.
- `src/gauss.ts` — 3-Punkt-Gauß-Integrator (klein, wiederverwendbar).
- ggf. `src/shape-functions.ts` — IIE-N + Ableitungen (oder in `timoshenko.ts`).
- `src/index.ts` — zusätzlich `Timoshenko2D` exportieren.
- `tests/timoshenko.test.ts` — Validierungsanker 1–7, nutzt `tests/references/euler-bernoulli.ts`.

## Noch offene Fragen fürs Grillen (neben der K-Quelle)

- `internalForces` wirklich nur stubben, oder schon nodale Endkräfte
  (`s_e = K_e d_e − f_e`) liefern?
- Locking-Sweep: konkretes Akzeptanzkriterium (relative Toleranz je L/h).
- `consistentLoad`-φ=0-Check gegen EB-Referenz nur für Volllast-Segmente (die
  EB-Referenz kann keine Teilsegmente) — reicht das als φ=0-Validierungsanker?
- Gehört der Gauß-Integrator in `fem-element` (ja, laut Aufteilung) und bleibt er
  intern oder wird er exportiert?

## Suggested skills (nächste Session)

- **`grill-with-docs`** (→ `grilling` + `domain-modeling`): dieses Dokument
  @-referenzieren und die K-Quelle-Entscheidung + offene Fragen durchgrillen,
  **bevor** Code entsteht. Genau der Ablauf wie bei `Elementformulierung.md`.
- **`tdd`**: die Validierungsanker sind bewusst als Rot-Grün-Validierungsanker formuliert —
  EB-Grenzfall und Kragarm-mit-Schub zuerst.

## Validierung

```text
pnpm --filter @baustatik/fem-element typecheck
pnpm --filter @baustatik/fem-element test
pnpm --filter @baustatik/fem-element lint
```
