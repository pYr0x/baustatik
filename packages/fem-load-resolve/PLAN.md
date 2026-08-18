# `@baustatik/fem-load-resolve` — Entwurf

## Context

Das Package ist gerüstet, aber leer (`package.json`, `tsconfig.json`,
`vite.config.ts`, `vitest.config.ts` existieren; `src/` und `CONTEXT.md` fehlen,
nichts committet). Es ist „Schritt A" der Pipeline aus
`packages/fem-element/docs/Elementformulierung.md`: es übersetzt das fachliche
Lastmodell (`@baustatik/fem-loads`) in die lokalen Elementlasten, die
`consistentLoad` erwartet — **ohne** selbst Ersatzknotenlasten zu rechnen.

```
BeamLoad (abstrakt)      →   LocalElementLoad        →   f_e (Vector6)      →  globales F
frame/axis/refLength         qx/qz/my(x) lokal           konsistenter Vektor    assemblieren
@baustatik/fem-loads         @baustatik/fem-load-resolve @baustatik/fem-element @baustatik/fem-solver
   ✅ types.ts                  ← DIESES PACKAGE            ✅ FERTIG             ⬜ nur gerüstet
   ✅ validate.ts                  (leeres Gerüst)          consistentLoad()
```

Diese Datei entsteht in einer Grilling-Session aus
`packages/fem-load-resolve/HANDOFF.md`. Sie hält **nur** die Entscheidungen
fest, die dort offen waren.

---

## Entschieden in dieser Session

### Frage 1 — Drehsinn von `my` ✅

**Befund (gegen den Code geprüft, nicht aus dem Handoff übernommen):**

- Der Handoff hat sich in der Herleitung vertan: bei rechtshändigem (x, y, z)
  mit x rechts und z abwärts zeigt y **aus** der Zeichenebene, nicht hinein
  (`z × x = y`). Das Ergebnis `phiY = −theta` stimmt trotzdem.
- Es gab **keine** rechtshändige Festlegung im Code. `fem/src/types.ts:23`
  kennt `phiY` nur als `'fixed' | 'free'` — ein Sperrflag ohne Vorzeichen.
- Rechtshändige Referenz:
  globales Y zeigt aus der Ebene, positives `My` dreht im Bild **CCW**. Das ist
  rechte-Hand-konsistent (Daumen zum Betrachter → Finger CCW).

**Entscheidung:** `phiY = −theta`. `fem-element` bleibt **unverändert**
(`theta = dw/dx`, +x → +z) — das hält K in klassischer Hermite-Form, den
EB-Anker in `docs/timoshenko.md:42-44` und die 8 Tests gültig, und
`theta = w'` ist die deutsche Neigungsdefinition. Der Vorzeichenwechsel lebt
an genau zwei Stellen, wie `fem-element/src/types.ts:29` es immer schon sagte
(„Sache der Transformation"):

| Stelle                                    | Wirkung                                     |
| ----------------------------------------- | ------------------------------------------- |
| `fem-load-resolve`, Stab-Momentlasten     | `my_e = −m`, `my1/my2 = −m1/−m2`            |
| `fem-solver`, 6×6-Transformation (später) | `−1` in der Rotationszeile                  |
| `NodeLoad.my`                             | **kein** Minus — geht nie durch ein Element |

**Verifiziert:**

- Die beiden Minuszeichen komponieren zur Identität → global kommt `+m` an.
  Das ist der Selbsttest der Kette.
- Der 3×3-Block `[[cosα, sinα, 0], [−sinα, cosα, 0], [0, 0, −1]]` hat
  det = −1 (uneigentlich), ist aber **orthogonal** → `T⁻¹ = Tᵀ` gilt weiter,
  `Tᵀ K T` bleibt gültig.
- `Ntheta(0) = [0, 0, 1, 0, 0, 0]` **exakt** (`shape-functions.ts:71-74`:
  `nt2|ξ=0 = c·(1+φ) = 1`, Rest 0). Der Diskriminierungstest „Einzelmoment bei
  `a = 0` → reines Knotenmoment" trägt also ohne Rundungsrest.

**Nicht falsch, nichts zu ändern:** `fem-geometry` / `geometry-2d`. Deren
„positive Drehung führt Achse 1 auf Achse 2" ist der planare Dreh-_Operator_ in
der geordneten Basis (x, z), zwangsläufig bei `[[cos,−sin],[sin,cos]]`. Diese
Packages kennen keine Freiheitsgrade und sagen nichts über Momente.

**Nachzuziehen:** der Prosakommentar `fem-element/src/types.ts:29` bleibt
richtig, aber `fem-loads/src/types.ts:81` (`my`) und `fem/src/types.ts:23`
(`phiY`) müssen den Drehsinn explizit nennen — heute steht dort nur „Drehung um
die y-Achse".

### Frage 2 — Knotenlasten gehören hierher ✅

**Entscheidung:** ja, ein Aufruf über die ganze Lastmenge, gebündelte Rückgabe.

Der ausschlaggebende Grund liegt auf der **Eingangsseite**, nicht auf der
Ausgangsseite: der Aufrufer hält `FEMLoad[]` — die Union aus
`NodeLoad | BeamLoad`. Wer diese Union nach `target` aufteilt, tut
Lastdomänen-Arbeit. Nähme `resolveLoads` nur `BeamLoad[]`, müsste der Solver
partitionieren, dafür `fem-loads`-Typen importieren und Lastentscheidungen
treffen — genau die Kopplung, die dieses Package verhindern soll.

Bewusst in Kauf genommen: die Rückgabe bündelt zwei Pipeline-Stufen
(Stab = lokal, braucht noch Element + T; Knoten = schon global, geht direkt
in F). Der Typname `GlobalNodeLoad` macht das sichtbar.

### Frage 3 — Signatur und Dangling References ✅

**Entscheidung:** `LoadModelGeometry` wird aus `fem-loads` **importiert**
(bereits exportiert, `fem-loads/src/index.ts:17`; die Dependency besteht wegen
`FEMLoad` ohnehin), und **beide** Methoden werden benutzt.

**Der Grund ist eine Asymmetrie, die im Handoff fehlt:**

- Ein hängender `beamId` _erzwingt_ eine Reaktion — `beamAxis()` gibt
  `undefined`, ohne Stabachse geht es nicht weiter.
- Ein hängender `nodeId` ginge **still durch** — Knotenlasten werden nur nach
  `nodeId` gruppiert, nie nachgeschlagen. Es entstünde ein Map-Eintrag für einen
  Phantomknoten, und der Müll flösse in den Solver.

Ohne `hasNode` verhielten sich die zwei Dangling-Fälle also verschieden,
obwohl „Dangling references werfen" als Prinzip entschieden ist. Der Gewinn ist
Fehlerqualität an der richtigen Schicht: die Meldung nennt die kaputte **Last**,
nicht der Solver später einen unbekannten Freiheitsgrad.

### Frage 3b — keine eigene `errors.ts` ✅

**Entscheidung:** `resolve` wirft `UnknownLoadTargetError` aus `fem-loads`.
Kein `src/errors.ts` in diesem Package, keine `@baustatik/errors`-Dependency.

`fem-loads/src/errors.ts` deckt bereits jeden Fall ab, den `resolve` werfen
könnte, und nennt `fem-load-resolve` in `errors.ts:7-8` namentlich als
gedachten Konsumenten der Gruppenklammer `LoadValidationError`. Der scheinbare
Einwand „eine Klasse aus dem Validierungsmodul in einem Package, das nicht
validiert" trägt nicht: `assertValidLoads` wirft dieselben Klassen bereits in
der Rechenkette. **Damit schrumpft Implementierungsschritt 2 des Handoffs.**

### Frage 4 — ein Stab = ein Element, festgeschrieben ✅

**Entscheidung:** die Ausgabe schlüsselt auf `beamId`. Kein Meshing, keine
Vorsorge.

**Begründung (gegen den Code geprüft):**

- Die Steifigkeitsmatrix des geraden, prismatischen Stabes stammt aus der
  _exakten_ Lösung der DGL. Knotenwerte sind mit 1 wie mit 10 Elementen
  identisch — `fem-element/CONTEXT.md:155-157`: „das Element ist exakt, es
  konvergiert nicht".
- Der Schnittgrößenverlauf hängt am **Rückrechnungsweg**, nicht an der
  Elementzahl. Einfeldträger unter Gleichlast: 1 Element mit Rückrechnung nur
  aus den Ansatzfunktionen gibt `M = const = qL²/12` (falsche Form _und_ Wert);
  mit **Partikulärlösung** gibt dasselbe eine Element die exakte Parabel mit
  `qL²/8`. **1 Element mit Partikulärlösung schlägt 10 ohne.** Genau deshalb ist
  `internalForces` ein werfender Stub (`fem-element/src/errors.ts:54-56`).
- Zwischenknoten sind Sache des Anwenders — das Programm teilt Stäbe an
  Kreuzungspunkten nicht automatisch (vom Nutzer bestätigt).
- Vouten sind der einzige plausible spätere Treiber, erzwingen Meshing aber
  auch nicht (Alternative: eigenes Voutenelement).

**Konsequenz, falls Meshing doch kommt:** `fem-load-resolve` ändert sich **gar
nicht**. Nötig wäre nur eine reine Zusatzfunktion
`splitElementLoad(load: LocalElementLoad, cuts): LocalElementLoad[]` —
Segmente an den Schnittstellen teilen, `q` dort linear interpolieren (exakt,
weil Segmente linear sind), `x` umbasieren. Verlustfrei, ohne Geometrie- oder
Lastdomänenwissen. Umgekehrt spart „jetzt schon in Elementen sprechen" diese
Funktion nicht — es zieht sie nur vor und erweitert zusätzlich
`LoadModelGeometry`. Gehört mit Begründung in `CONTEXT.md`.

### Frage 5 — keine Normalform, ein Segment je Last ✅

**Entscheidung:** der Merge ist reines Aneinanderhängen. Jede Last liefert ihre
Segmente, alle wandern in eine Liste, Reihenfolge = Eingabereihenfolge (wie
`validateLoads`, `validate.ts:105`). Kein Zusammenfassen, kein Sortieren, kein
Zerschneiden an Sprungstellen.

**Der Handoff hält das für YAGNI und sieht `internalForces` als möglichen
künftigen Grund — das trägt nicht.** Die Partikulärlösung entsteht durch
Integration über die Lastfunktion; Integration ist linear, also ist der Beitrag
jedes Segments unabhängig aufsummierbar. Überlappungen sind Superposition,
Reihenfolge ist Summationsreihenfolge, Einzellasten sind aufaddierbare Sprünge
in V, und ein über `x` hinausragendes Segment wird bei `x` abgeschnitten — pro
Segment, ohne Kenntnis der anderen. **Kein Konsument braucht eine Normalform**,
auch der Viewer nicht (er zeichnet je Last eigene Symbole, `load:{id}:fx`,
`fem-viewer.ts:93`, und sieht die verschmolzene `LocalElementLoad` nie).

Nebeneffekt, der die Tests trägt: die Ausgabe ist aus der Eingabe direkt
vorhersagbar, ein Test kann die Segmentliste exakt behaupten.

### Frage 6 — `referenceLength` verlässt die Einzellast ✅

**Entscheidung:** `BeamForceDirection` wird in Richtung (`frame`, `axis`) und
Bezugslänge aufgeteilt; `referenceLength` hängt nur noch an `constant` und
`trapezoidal`.

**Beleglage — wichtig für die Begründung im Code:** der RFEM-Abgleich, den der
Handoff vermutet, existiert **nicht**. `Stablast2.png` zeigt die Projektionen
zwar ausgegraut, aber `Stablast3.png` (Gleichlast, die eine Projektion
nachweislich haben kann) ebenso — in beiden ist „An Stäben Nr." leer, die
Ausgrauung kommt also vom fehlenden Stab, nicht von der Lastart.
`Stablast4.png`/`Stablast5.png` zeigen den aktiven Zustand.

Tragend ist allein das Sachargument: **`p` ist in kN angegeben, nicht je
Länge** — eine Bezugslänge skaliert `Wert × L_proj/L`, bei einer Gesamtkraft
gibt es nichts zu skalieren (`validate.ts:317-324`). Es ist dieselbe Regel, mit
der `BeamMomentPointLoad` schon `frame`/`axis` verloren hat
(`types.ts:180-182`). **Diese Begründung, nicht der Screenshot, gehört in den
Typkommentar.**

Kosten: 1 Test-Fixture (`fem-loads/tests/validate.test.ts:72`), 3
Kommentarblöcke (`fem-viewer.ts` C1–C3). Sonst konstruiert niemand eine
`BeamForcePointLoad`.

### Frage 7 (neu) — Klemmen, und die Toleranzen angleichen ✅

**Gefundene Unstimmigkeit zwischen zwei Packages:**

| Stelle                             | Prüfung                       | Art         |
| ---------------------------------- | ----------------------------- | ----------- |
| `fem-loads/src/validate.ts:239`    | `value > length * (1 + 1e-9)` | **relativ** |
| `fem-element/src/timoshenko.ts:93` | `value <= L + 1e-9`           | **absolut** |

Ab `L > 1 m` ist die Validierung die lockerere — es gibt ein Band, das das Tor
passiert und im Element wirft. `timoshenko.ts:43-44` beschreibt die Reste selbst
als „Maschinengenauigkeit mal **Stablaenge**", prüft also relativ gedacht und
absolut geschrieben. Praktisch heute nicht erreichbar (echter Rundungsrest
~1e-16 relativ), aber latent.

**Entscheidung (zwei Teile):**

1. `resolve` klemmt seine Ausgabe auf `[0, L]`. Danach gilt die in
   `fem-element/src/types.ts:98` dokumentierte Invariante `0 <= from <= to <= L`
   **wörtlich** statt nur innerhalb einer Toleranz. Echte Bereichsfehler
   versteckt das nicht — die hat `validate.ts` schon geworfen.
2. `GEOMETRY_EPS` in `fem-element/src/timoshenko.ts` wird relativ zu `L`
   (`GEOMETRY_EPS * Math.max(1, L)`), damit beide Tore dieselbe Sprache sprechen
   und der Kommentar zum Code passt. Betrifft `requireOnElement` und die
   `LoadOutsideElementError`-Tests in `tests/timoshenko.test.ts:370 ff.`

---

## Durch Nachsehen geklärt (keine offenen Fragen mehr)

- **Bezugslänge bei `frame: 'local'` ist zulässig** und wird angewandt.
  `referenceLengthOf` (`validate.ts:326-335`) prüft `frame` nicht und validiert
  die projizierte Länge auch für lokale Lasten — die Codebasis hat das bereits
  entschieden. Fachlich sinnvoll: Wert je Grundrissfläche, Wirkung senkrecht zur
  Stabachse. Regel: der Faktor gilt unabhängig vom Bezugssystem.
- **Projektion und Frame-Drehung kommutieren.** Der Faktor `L_proj/L` ist ein
  über den Stab konstanter Skalar, die Drehung ist linear — die Reihenfolge ist
  beliebig. Sieht nach Falle aus, ist keine.
- **Der Projektionsfaktor ist auch für Teilabschnitte der ganze Stab.** `Δx/L`
  ist entlang eines geraden Stabes konstant, `|Δx_seg|/L_seg` wäre derselbe
  Wert. Trapezlasten bleiben deshalb linear.
- **`@baustatik/fem-element` muss echte `dependency` sein**, nicht
  `devDependency`: `LocalElementLoad` steht in der öffentlichen Signatur und
  damit im publizierten `.d.ts`. Workspace-Deps stehen im Repo unter
  `dependencies` (`fem-loads/package.json:27-30`).
- **Die `m`-Warze**: `BeamMomentPointLoad.m` ist kNm, `BeamMomentConstantLoad.m`
  ist kNm/m — gleicher Feldname, andere Einheit, Diskriminante ist
  `distribution`. Gehört in `CONTEXT.md`, ist aber keine Entscheidung.

### Frage 8 (neu) — geteilt wird der Faktor, nicht die Länge ✅

**Entscheidung:** `fem-loads` bekommt `src/reference-length.ts` mit

```ts
export function referenceFactor(reference: ReferenceLength, axis: Line): number;
```

— dem **dimensionslosen** Faktor `L_proj / L`, exakt `1` für `'trueLength'`.

**Warum nicht nach `fem-geometry`** (die naheliegende Idee): die Funktion hat
zwei Teile in zwei Fachsprachen. „Wie groß ist die x-Ausdehnung dieser Linie"
ist Geometrie — und **steht bereits in `fem-geometry`** (`Vector.fromPoints`
liefert `{dx, dz}`, `Math.abs` ist JavaScript). Es gibt nichts Geometrisches zu
verschieben. Übrig bliebe nur „welche Ausdehnung meint `'horizontalProjection'`"
— Lastvokabular mit der RFEM-Umkehrfalle darin (`horizontalProjection` misst
**x**, RFEM nennt es „Projektion in **Z**", `types.ts:33-38`). Das nach
`fem-geometry` zu ziehen verlangte dort den Typ `ReferenceLength` aus
`fem-loads`, das seinerseits von `fem-geometry` abhängt — **zirkulär**.

Der tragende Grund ist also nicht der des Handoffs („Bezugslänge ist
Lastdomäne"), sondern: `projectedLength` ist eine **Übersetzung zwischen zwei
Fachsprachen**, und die gehört auf die Seite mit dem reicheren Begriff.

**Warum der Faktor und nicht die Länge:** beide Konsumenten wollen ihn.
`resolve` rechnet `q · L_proj/L`; `validate.ts:251` prüft heute
`projectedLength(…) <= length * RELATIVE_TOLERANCE`, was algebraisch
`L_proj/L <= 1e-9` ist — **derselbe Faktor** gegen eine dimensionslose Schranke.
Ein Begriff, ein Ausdruck, zwei Aufrufer; die Nullprüfung in `validate` wird
dabei kürzer als heute.

---

## Umsetzung

### Schritt 1 — `@baustatik/fem-loads`

- **Neu** `src/reference-length.ts`: `referenceFactor(reference, axis)` wie
  oben; aus `validate.ts` herausgelöst. Aus `src/index.ts` exportieren.
- `src/validate.ts`: `projectedLength` entfernen, Nullprüfung auf
  `referenceFactor(ref, axis) <= RELATIVE_TOLERANCE` umstellen.
  `referenceLengthOf` bleibt als Filter (überspringt `'trueLength'`).
- `src/types.ts`:
  - `BeamForceDirection` in `{ frame, axis }` und
    `BeamForceReference = { referenceLength }` aufspalten;
    `BeamForcePointLoad` bekommt nur noch die Richtung. Begründung im Kommentar:
    **„`p` ist in kN, nicht je Länge"** — _nicht_ „RFEM graut es aus".
  - `NodeLoad.my`: Drehsinn explizit dokumentieren (**CCW im Bild, positiv um
    globales Y, das aus der Zeichenebene zeigt**; Beleg `Knotenlast1.png`,
    `stabachsen.png`). Dasselbe für `BeamMomentPointLoad.m` /
    `BeamMomentConstantLoad.m` / `BeamMomentTrapezoidalLoad.m1/m2`.
- `tests/validate.test.ts:72`: `referenceLength` aus der Punktlast-Fixture
  entfernen. Tests für `referenceFactor` ergänzen (`trueLength → 1` exakt,
  30°-Dach, senkrechter Stab).

### Schritt 2 — `@baustatik/fem`

- `src/types.ts:23`: an `phiY` den Drehsinn dokumentieren (gleicher Text wie
  `NodeLoad.my`). Heute nur `'fixed' | 'free'` — die Konvention gilt für die
  späteren Ergebnisgrößen und die Transformation.

### Schritt 3 — `@baustatik/fem-element`

- `src/timoshenko.ts`: `requireOnElement` auf relative Toleranz umstellen
  (`GEOMETRY_EPS * Math.max(1, L)`), Kommentar `:42-46` anpassen.
- `src/types.ts:29`: der Satz „Zuordnung zum rechtshaendigen phiY ist Sache der
  Transformation" bleibt — er ist die Lösung, nicht das Problem. Ergänzen, dass
  konkret `phiY = −theta` gilt und **wo** die zwei Vorzeichenwechsel sitzen.
- `tests/timoshenko.test.ts` (~370 ff.): `LoadOutsideElementError`-Fälle
  nachziehen.

### Schritt 4 — `@baustatik/fem-load-resolve`

`package.json`: `dependencies` auf `@baustatik/fem-loads`,
`@baustatik/fem-geometry`, `@baustatik/fem-element` (alle `workspace:*`).
**Kein** `@baustatik/errors` (Frage 3b), **kein** `@baustatik/fem` (Frage 3).
`fem-element` ist echte `dependency`, nicht `devDependency` — `LocalElementLoad`
steht im publizierten `.d.ts`. Danach `pnpm install` im Root.

```ts
// src/types.ts
/** Knotenlast im GLOBALEN System, alle Lasten eines Knotens summiert.
 *  `my` im phiY-Drehsinn — KEIN Vorzeichenwechsel, sie geht nie durch ein Element. */
export type GlobalNodeLoad = { fx: number; fz: number; my: number };

export type ResolvedLoads = {
  beams: Map<string, LocalElementLoad>; // LOKAL, je beamId
  nodes: Map<string, GlobalNodeLoad>; // GLOBAL, je nodeId
};

// src/resolve.ts — einziger Einstiegspunkt
export function resolveLoads(
  model: LoadModelGeometry,
  loads: readonly FEMLoad[],
): ResolvedLoads;
```

Ablauf je Stablast: Fan-out über `beamIds` → `beamAxis` (fehlt ⇒
`UnknownLoadTargetError`) → `L = Line.length(axis)` → Frame-Drehung mit
`Line.toLocal(axis, Vector.make(…))` (**nicht** selbst `cosα/sinα` bauen) →
`referenceFactor` → Positionen (`relativeDistances` ⇒ `pct·L/100`) → auf
`[0, L]` klemmen → Segment bzw. Punkt anhängen. Momentlasten überspringen
Drehung und Faktor und gehen mit **`−m`** nach `my`.

Nur Stäbe/Knoten mit tatsächlichen Lasten erscheinen in den Maps; der Solver
behandelt einen fehlenden Eintrag als lastfrei.

### Schritt 5 — Doku

- `packages/fem-load-resolve/CONTEXT.md` nach dem Muster von
  `fem-element/CONTEXT.md` (Purpose / Boundaries / Dependencies / Navigation /
  Invariants / Validation / Known constraints). Glossar mindestens:
  **Bezugslängen-Faktor**, **lokale Elementlast**, **Fan-out**, **Drehsinn
  (`phiY` vs. `theta`)**. Bekannte Grenzen: 1 Stab = 1 Element (mit Begründung
  aus Frage 4), keine Normalform der Segmente (Frage 5), Validierung ist
  Vorbedingung (Frage 7 des Handoffs), die `m`-Warze (kNm vs. kNm/m am
  gleichnamigen Feld).
- `docs/adr/0005-drehsinn-phiy-gegen-theta.md` — die Drehsinn-Entscheidung
  erfüllt alle drei ADR-Kriterien: schwer umkehrbar (berührt Element, Resolve
  und den künftigen Solver), ohne Kontext überraschend („warum das Minus?"),
  und Ergebnis eines echten Abwägens (Alternative war, `theta` zu drehen).
  Die übrigen Entscheidungen gehören in `CONTEXT.md`, nicht in ADRs.
- `AGENTS.md:29`: Zeilen für `fem-loads`, `fem-load-resolve` und `fem-solver`
  ergänzen — dort fehlen alle drei.

### Schritt 6 — Tests (`tdd`, vor dem Code)

Diskriminierend, nach dem Vorbild `fem-element/tests/`:

| Test                                                                      | Was er fängt                        |
| ------------------------------------------------------------------------- | ----------------------------------- |
| Waagrechter Stab: `global` == `local`                                     | grobe Vorzeichenfehler              |
| 45°-Stab, `global`/`z`: `qx = qz = q·√2/2` — **Vorzeichen**, nicht Betrag | die Frame-Drehung                   |
| Zusätzlich `α = −45°`: `qx`, `qz` mit **verschiedenen** Vorzeichen        | diskriminiert gegen Betragsfehler   |
| Schnee auf 30°-Dach, `horizontalProjection`: `Σ = q·                      | Δx                                  | `   | die Bezugslängen-Falle |
| Einzelmoment `m` bei `a = 0` ⇒ `f_e = [0, 0, −m, 0, 0, 0]`                | **das Minus aus Frage 1**           |
| `NodeLoad.my = +m` ⇒ `nodes.get(n).my === +m`                             | die Asymmetrie zum Stabmoment       |
| Stab mit vertauschten Knoten                                              | `global` gleich, `local` gespiegelt |
| Dieselbe Last auf zwei Stäben mit `relativeDistances`                     | verschiedene absolute Lagen         |
| Zwei Lasten auf einem Stab ⇒ **zwei** Segmente in Eingabereihenfolge      | Frage 5                             |
| `relativeDistances: 100` ⇒ `to === L` **exakt**                           | das Klemmen aus Frage 7             |
| Unbekannter `beamId` / `nodeId` ⇒ `UnknownLoadTargetError`                | Frage 3, beide Wege gleich          |

`fem-element/CONTEXT.md:106-116` warnt: Gleichgewicht und Partitionsinvarianz
diskriminieren **nicht**. Sie gehören nicht auf diese Liste.

## Verifikation

```text
pnpm install                                       # zuerst, sonst fehlt oxfmt
pnpm --filter @baustatik/fem-load-resolve typecheck
pnpm --filter @baustatik/fem-load-resolve test
pnpm --filter @baustatik/fem-loads test            # referenceFactor + Typsplit
pnpm --filter @baustatik/fem-element test          # relative Toleranz
pnpm --filter @baustatik/fem-geometry test         # muss unverändert grün sein
```

Reine Funktionen ohne Konva/DOM/WASM, in Node testbar. Die Kette schließt sich,
wenn der Einzelmoment-Test bei `a = 0` `−m` liefert **und** der spätere Solver
daraus wieder `+m` global macht — die beiden Vorzeichenwechsel komponieren zur
Identität.
