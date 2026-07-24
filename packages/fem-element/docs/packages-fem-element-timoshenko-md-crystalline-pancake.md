# Inkrement 2: `Timoshenko2D` — locking-freies IIE-Element

> **ABGELÖST.** Inkrement 2 ist umgesetzt. Dieses Dokument bleibt als
> Herleitung der Entwurfsentscheidungen stehen, ist aber **keine gültige
> Entscheidungsgrundlage mehr**. Verbindlich sind
> [ADR-0004](../../../docs/adr/0004-timoshenko-closed-and-integrated-stiffness.md)
> und [`CONTEXT.md`](../CONTEXT.md). Bei Widerspruch gilt der Code.

## Context

`@baustatik/fem-element` hat nach Inkrement 1 nur Typen, das `prepare()`-Interface
(ADR-0003) und den test-only Euler-Bernoulli-Referenzanker. **Es gibt noch kein
Produktivelement** — `fem-solver` kann also nichts assemblieren, und Ersatzknoten-
lasten für `K d = F` sind nicht berechenbar.

Dieses Inkrement liefert das einzige Produktivelement: `Timoshenko2D`, das
locking-freie IIE (Interdependent Interpolation Element). φ=0 deckt den
schubstarren Euler-Bernoulli-Fall ab, ohne zweiten Codepfad. Ziel des Nutzers ist
explizit die **Ersatzknotenlast** für die Lösung des FEM-Modells; Schnittgrößen-
verläufe und Bemessung sind ausdrücklich später.

**Zentrale Entscheidung dieser Grilling-Session** (weicht von `Elementformulierung.md`
Kritik #3 und der Empfehlung in `packages/fem-element/timoshenko.md` ab): Es
entstehen **zwei exportierte Formulierungen** — die geschlossene K als Default und
die per Gauß integrierte als gleichwertige Alternative. Sie prüfen sich gegenseitig.

## Entscheidungen (in der Session gegrillt)

| Thema             | Entscheidung                                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K-Quelle          | **beide**: `Timoshenko2D` (geschlossene K_b, Default) + `Timoshenko2DIntegrated` (∫BᵀDB, Gauß)                                                                              |
| Auswahl           | zwei Formulierungsobjekte, **kein** Options-Parameter — `prepare(props, L)` und ADR-0003 bleiben unangetastet, `fem-solver` merkt keinen Unterschied                        |
| Gemeinsamer Kern  | identische φ-Normalisierung, N, `consistentLoad`, `shapeFunctions`; **nur `stiffness()` ist injiziert**                                                                     |
| B bei φ=0         | Schubterm überspringen (`if (phi !== 0)`), weil K_s ∝ φ → analytisch exakt 0. `phi === 0` ist exakt testbar, da `prepare()` `'rigid'`/`Infinity` auf genau `0` normalisiert |
| N-Kontrakt        | `Nu`, `Nw`, `Ntheta` je **Länge 6** über `[u1,w1,θ1,u2,w2,θ2]` mit Nullen → `dot(Nw, d) = w(x)`, kein Indexwissen beim Aufrufer                                             |
| Ableitungen       | src-intern in `shape-functions.ts`, **nicht** im Index, `PreparedElement`-Vertrag unverändert                                                                               |
| `my`-Gewichtung   | **`Nθ`**, nicht `Nw'` (virtuelle Arbeit über die Verdrehung). Bei φ=0 fällt `Nθ ≡ Nw'` → EB-Anker hält                                                                      |
| `internalForces`  | werfender Stub, kein `endForces()`, kein Interpolations-Placeholder                                                                                                         |
| Externe Wahrheit  | Mini-Assembler `tests/references/chain.ts` (gerader Stabzug, ~50 Zeilen)                                                                                                    |
| Locking-Kriterium | **ein** Element, `                                                                                                                                                          | berechnet/analytisch − 1 | ≤ 1e-12` für **jedes** L/h |
| Export            | `Timoshenko2D`, `Timoshenko2DIntegrated`; Gauß + Ansatzfunktionen intern                                                                                                    |
| Validierung       | `prepare()`: L/EA/EI endlich > 0; `consistentLoad()`: Lastgeometrie in [0,L] (±1e-9)                                                                                        |

### Zwei Befunde, die die Testliste tragen

1. **`Nθ` vs `Nw'` wird von keinem naheliegenden Test gefangen.** φ=0-Vergleich
   (identisch), Gleichgewicht (**beide** erfüllen es exakt — nachgerechnet) und
   Partitionsinvarianz (Integrale sind additiv) diskriminieren **nicht**. Nur ein
   Vergleich gegen eine externe Wahrheit tut es → daher der Chain-Assembler.
2. **3-Punkt-Gauß ist für alles hier exakt.** Höchster Integrandgrad:
   `Nw` (kubisch) × `q` (linear) = 4 ≤ 5. `consistentLoad` ist also **exakt**,
   nicht genähert — Vergleichstests dürfen auf Rundungsniveau prüfen.

## Mathematik

Mit `ξ = x/L`, `φ = 12·EI/(GAs·L²)`, Block über `[w1, θ1, w2, θ2]`:

```
Nw1 = (1/(1+φ))·(2ξ³ − 3ξ² − φξ + 1 + φ)
Nw2 = (L/(1+φ))·(ξ³ − (2 + φ/2)ξ² + (1 + φ/2)ξ)      ← zu θ1
Nw3 = (1/(1+φ))·(−2ξ³ + 3ξ² + φξ)
Nw4 = (L/(1+φ))·(ξ³ − (1 − φ/2)ξ² − (φ/2)ξ)          ← zu θ2

Nθ1 = (6/(L(1+φ)))·(ξ² − ξ)
Nθ2 = (1/(1+φ))·(3ξ² − (4+φ)ξ + 1 + φ)
Nθ3 = (6/(L(1+φ)))·(−ξ² + ξ)
Nθ4 = (1/(1+φ))·(3ξ² − (2−φ)ξ)

Nu  = [1−ξ, ξ]   (axial, entkoppelt)
```

Bei der Umsetzung gegen diese vier Eigenschaften verifizieren (nicht blind
übernehmen — sie sind in der Session bereits nachgerechnet und stimmen):

- **φ=0 ⇒ Hermite** und `Nθ ≡ Nw'`
- **γ = w' − θ konstant** über das Element (definierende IIE-Eigenschaft):
  aus w1 folgt `γ = −φ/(L(1+φ))`, aus θ1 `γ = −φ/(2(1+φ))` — beide x-frei
- **Einheitstranslation**: `Nw1 + Nw3 = 1`, `Nθ1 + Nθ3 = 0`
- **Starre Drehung** `d = [0,0,1,0,L,1]`: `w(x) = x`, `θ(x) = 1` für **jedes** φ

Geschlossene K (`Timoshenko2D`), eingeordnet in die 6 DOF:

```
K_b = EI/(L³(1+φ)) · [[12, 6L, −12, 6L],
                      [6L, (4+φ)L², −6L, (2−φ)L²],
                      [−12, −6L, 12, −6L],
                      [6L, (2−φ)L², −6L, (4+φ)L²]]
K_a = EA/L · [[1,−1],[−1,1]]
```

Integrierte K (`Timoshenko2DIntegrated`), mit `B_a = dNu`, `B_b = Nθ`,
`B_s = dNw − Nθ` (alle Länge 6):

```
K = ∫ EA·B_aᵀB_a dx  +  ∫ EI·B_bᵀB_b dx  +  (φ ≠ 0 ? ∫ GAs·B_sᵀB_s dx : 0)
```

Höchster Integrandgrad 2 → 3-Punkt-Gauß exakt. `φ ≠ 0` garantiert endliches `GAs`.

## Dateien

**Neu in `packages/fem-element/src/`:**

- `gauss.ts` — 3-Punkt-Gauß-Legendre (`ξ = 0, ±√(3/5)`, Gewichte `8/9, 5/9, 5/9`),
  Abbildung auf ein beliebiges Intervall `[from, to]`. Klein, intern.
- `shape-functions.ts` — `shapeFunctionsAt(x, L, phi)` → `{ Nu, Nw, Ntheta, dNu, dNw, dNtheta }`,
  alle Länge 6. Intern, **nicht** im Index.
- `stiffness.ts` — `closedStiffness(EA, EI, L, phi)` und `gaussStiffness(props, L, phi)`.
  Zwei Builder mit identischer Signaturform, damit `timoshenko.ts` sie injizieren kann.
- `timoshenko.ts` — φ-Normalisierung + Eingabevalidierung, `consistentLoad`,
  `shapeFunctions`, `internalForces`-Stub; exportiert `Timoshenko2D` und
  `Timoshenko2DIntegrated`, die sich nur im injizierten Steifigkeits-Builder unterscheiden.

**Geändert:**

- `src/index.ts` — zusätzlich `Timoshenko2D`, `Timoshenko2DIntegrated`.
- `packages/fem-element/CONTEXT.md` — Stand, Navigation, neue Invarianten
  (`my` über `Nθ`; zwei Formulierungen; N-Länge-6-Kontrakt; 3-Punkt-Gauß exakt;
  Validierungsumfang). „Known constraints" entsprechend kürzen.
- `Elementformulierung.md` — Kritik #3 korrigieren, Zeile in der
  „Entschieden"-Tabelle ergänzen, beides mit Verweis auf ADR-0004.
- `packages/fem-element/timoshenko.md` — Kopfnotiz „abgearbeitet, siehe ADR-0004".

**Neu in `docs/adr/`:**

- `0004-timoshenko-closed-and-integrated-stiffness.md` — **auf Englisch**, wie
  ADR-0001…0003. Inhalt: warum beide Formulierungen produktiv, warum zwei Objekte
  statt Options-Parameter (ADR-0003 bleibt gültig), warum B den φ=0-Zweig braucht
  (`Infinity·0` ist eine analytisch hebbare, in IEEE-754 nicht hebbare Singularität),
  und dass Kritik #3 damit überholt ist.

**Neu/geändert in `packages/fem-element/tests/`:**

- `helpers.ts` _(neu)_ — `matVec`, `matMul`, `transpose`, `toDense`, `solve2`,
  `expectClose` aus `euler-bernoulli.test.ts:9-36` **hierher extrahieren** statt
  neu zu schreiben.
- `euler-bernoulli.test.ts` _(geändert)_ — importiert die Helfer aus `helpers.ts`.
- `references/chain.ts` _(neu)_ — Mini-Assembler nach dem Muster von
  `references/euler-bernoulli.ts` (test-only, nicht im Index): `n` Elemente auf
  gerader Achse, Knoten `i` belegt DOF `[3i, 3i+1, 3i+2]`, Überlappung 3, **keine**
  Transformation. Plus dichte Gauß-Elimination mit Teilpivotisierung und
  DOF-Sperrung. Nimmt `fem-solver` nichts vorweg (keine globale Welt, keine Drehung).
- `timoshenko.test.ts` _(neu)_ — Anker unten.

## Testanker

**φ und Validierung**

1. `'rigid'` → φ=0; `Infinity` → φ=0; endliches `GAs` → `φ = 12EI/(GAs·L²)`.
2. Ablehnung: `GAs` NaN/≤0; `L`, `EA`, `EI` je NaN/≤0/`Infinity`.
3. Lastgeometrie außerhalb `[0,L]` (Segment und Punktlast) wirft; `±1e-9` toleriert.

**Geschlossene K (A)**

4. **φ=0 FP-exakt**: `Timoshenko2D.prepare({...,GAs:'rigid'}, L).stiffness()`
   elementweise `===` `ebStiffness` (`toBe`, nicht `toBeCloseTo`).
5. Symmetrie bei φ>0.
6. Genau 3 Starrkörpermoden, `K·r ≈ 0` bei φ>0 (Moden wie `euler-bernoulli.test.ts:51-55`).
7. Knotenvertauschungsinvarianz `T K Tᵀ = K` bei φ>0 (T aus `euler-bernoulli.test.ts:65-72`).

**Integrierte K (B)**

8. `B(φ>0) ≈ A(φ>0)`, relativ 1e-12 — der K↔N-Cross-Check, symmetrisch in beide Richtungen.
9. `B(φ=0) ≈ ebStiffness`, relativ 1e-12 — prüft den übersprungenen Grenzwert.
   _(Nur `≈`, nicht `===`: Gauß über Hermite ist mathematisch exakt, aber nicht bitweise identisch.)_

**Ansatzfunktionen**

10. φ=0: `Nw` = Hermite, `Ntheta` = Hermite-Ableitung (geschlossene Ausdrücke, mehrere x).
11. Starrkörper für **jedes** φ: `dot(Nw, [0,1,0,0,1,0]) = 1`;
    `dot(Nw, [0,0,1,0,L,1]) = x` und `dot(Ntheta, [0,0,1,0,L,1]) = 1`.
12. `γ = dot(dNw,d) − dot(Ntheta,d)` ist über x **konstant** bei φ>0 (IIE-Eigenschaft).

**`consistentLoad`**

13. φ=0, Volllast-Segmente + Punktlasten `≈ ebConsistentLoad`: konstantes und
    lineares `qz`, `qx`, `my`; Punktlasten `px`/`pz`/`my`.
14. **Partitionsinvarianz** bei φ>0: `f([0,L]) ≈ f([0,a]) + f([a,L])` für dieselbe
    lineare Last — prüft Teilsegmente ohne externe Referenz.
15. Gleichgewicht bei φ>0 mit Teilsegment + Punktlasten: Σ Querkräfte = Gesamtlast,
    Σ Momente um Knoten 1 = Gesamtmoment.
16. Konstantes `qz` ist **φ-unabhängig**: `f = [0, qL/2, qL²/12, 0, qL/2, −qL²/12]`
    für φ=0 **und** φ>0 (in der Session nachgerechnet: `∫Nw1 dx = L/2`,
    `∫Nw2 dx = L²/12`, beide φ-frei). Deckt zugleich die exakten Einspannmomente ab.

**Kragarm & Locking (ein Element)**

17. Punktlast am Ende: `w(L) = PL³/(3EI) + PL/S`, relativ 1e-12 — der Schubterm
    muss auftauchen.
18. Locking-Sweep `L/h ∈ {5,10,20,100,1000}`: Rechteck b×h, festes h, `L = (L/h)·h`,
    κ=5/6, ν=0,3 ⇒ `φ = 3,12·(h/L)²`. `|w/w_exakt − 1| ≤ 1e-12` bei **jedem** L/h,
    gleiche Toleranz überall (das Element ist exakt, es konvergiert nicht).

**Chain-Anker (externe Wahrheit)**

19. **Diskriminator für `Nθ`** — KORRIGIERT gegenüber dem ursprünglichen Entwurf:
    der Verfeinerungsvergleich (1 Element vs. 8 Elemente) diskriminiert **nicht**.
    Nachgemessen sind `Nθ` und `Nw'` beide verfeinerungsinvariant und
    unterscheiden sich trotzdem um ~13 %. Wirksam sind nur: Kragarm unter
    konstantem `my`, φ>0, gegen die **geschlossene Lösung**
    `w(L) = m·L³/(3EI)` und `θ(L) = m·L²/(2EI)` (relativ 1e-12), plus die
    Forderung, dass ein Knoten-Einzelmoment einen **reinen** Momenten-DOF
    belastet. Der Verfeinerungsvergleich bleibt als Test für nodale Exaktheit
    nützlich, taugt aber nicht als Gewichtungs-Nachweis. Siehe `CONTEXT.md`,
    Invariante „Verteiltes und punktuelles Moment koppeln über `Ntheta`".
20. Nodale Exaktheit: Einfeldträger unter konstantem `q`, 1 Element vs. 8 Elemente
    → gleiche Endverdrehungen (relativ 1e-10).
21. Patch-Test: konstante Krümmung bzw. konstante Dehnung über 3 **ungleich lange**
    Elemente wird exakt wiedergegeben.

**Stub**

22. `internalForces(...)` wirft mit Hinweis auf das spätere Inkrement.

## Reihenfolge (TDD, rot → grün)

1. `gauss.ts` + Miniaturtest (∫ξ⁵ auf [0,1] exakt).
2. φ-Normalisierung und Validierung → Anker 1–3.
3. `closedStiffness` → **Anker 4 zuerst** (`=== ebStiffness`), dann 5–7.
4. `shape-functions.ts` → Anker 10–12.
5. `gaussStiffness` → Anker 8, 9.
6. `consistentLoad` → Anker 13–16.
7. `tests/helpers.ts` extrahieren, `euler-bernoulli.test.ts` umstellen.
8. Kragarm/Locking → Anker 17, 18.
9. `references/chain.ts` → Anker 19–21.
10. Stub + Anker 22.
11. Doku: `CONTEXT.md`, ADR-0004, `Elementformulierung.md`, `timoshenko.md`.

## Verification

```text
pnpm --filter @baustatik/fem-element typecheck
pnpm --filter @baustatik/fem-element test
pnpm --filter @baustatik/fem-element lint
```

Zusätzlich manuell prüfen:

- `src/index.ts` exportiert **nur** Typen + die zwei Formulierungen — weder
  `gauss` noch `shape-functions` noch irgendetwas aus `tests/`.
- `packages/fem-element/package.json` bleibt bei `"dependencies": {}`.
- `git grep -n "GAs" packages/fem-element/src` zeigt `GAs` ausschließlich in der
  φ-Normalisierung und im φ≠0-Zweig von `gaussStiffness` — nirgends als roher
  additiver Steifigkeitsterm.
- Anker 4 nutzt `toBe`/`Object.is`, nicht `toBeCloseTo` — die FP-Exaktheit des
  φ=0-Grenzfalls ist der stärkste Anker und darf nicht zu `≈` aufweichen.
