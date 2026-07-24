# Handoff: `@baustatik/fem-loads`

**Stand:** 2026-07-24 · Branch `main` · alles unter `packages/fem-loads/` ist
neu und noch nicht committet (`git status`: `?? packages/fem-loads/`).

## Wo wir stehen

Ziel unverändert: Punkt- und Linienlasten **eingeben und darstellen**. Keine
Ersatzknotenlasten, kein Solver, keine Lastfälle.

Fertig:

- `src/types.ts` — das vollständige Lastmodell. `tsc --noEmit` läuft sauber.
- `src/index.ts` — Re-Export von Typen, Fehlern und Validierung (Schritt 1).
- `src/validate.ts` + `src/errors.ts` + `tests/validate.test.ts` — Schritt 3,
  28 Tests, 100 % Coverage. Zwei Ausgänge: `validateLoads` sammelt alle
  Beanstandungen (für den Dialog), `assertValidLoads` wirft die erste (für die
  Rechenkette). Das Modell kommt über das schmale `LoadModelGeometry`
  (`hasNode`, `beamAxis`) herein — dadurch bleibt `@baustatik/fem` draußen und
  es gibt genau zwei Dependencies: `errors` und `fem-geometry`.
- `apps/demo/fem-viewer.ts:41` — Pseudocode v4 aller Eingabefälle als
  auskommentierte Store-Aufrufe. Das ist die Quelle, aus der `types.ts`
  abgeleitet wurde; beide zusammen lesen.
- `apps/demo/Knotenlast1.png`, `Stablast1..7.png` — die RFEM-Dialoge, aus denen
  das Modell stammt. Nicht wegwerfen, sie beantworten die meisten Rückfragen
  schneller als jede Diskussion.

Noch nicht da: `CONTEXT.md`, Zeile in `AGENTS.md`, alles im Viewer.

## Die Erkenntnis, die alles andere trägt

Knotenlast und Stablast sind **nicht dieselbe Sache mit anderem Ziel**:

- **Knotenlast** ist ein Vektor über die Freiheitsgrade: `fx`, `fz`, `my` global
  in _einer_ Last. Richtung steckt im Vorzeichen.
- **Stablast** ist ein Betrag mit _separat gewählter_ Richtung (`frame` +
  `axis`) und einer separaten Bezugslänge. Zwei Richtungen = zwei Lasten.
  Kraft ODER Moment, nie beides.

Das Handoff der Vorsession hatte beide über ein gemeinsames `{fx, fz}` +
`frame: 'global'|'local'|'projected'` modelliert. Das ist widerlegt.

## Entschieden (nicht neu aufrollen)

| Thema                  | Entscheidung                                              | Grund                                                                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vorzeichen             | z zeigt nach unten, Last nach unten ist **positiv**       | `scene.ts:44`, Achsenkreuz in den Dialogen. Das alte Handoff schrieb `fz: -10` — falsch herum                                                                                                                                                                                                            |
| Ziel einer Last        | `nodeIds: string[]` / `beamIds: string[]`                 | Der Dialog nimmt Listen; ein Lastobjekt, n Ziele                                                                                                                                                                                                                                                         |
| Knotenlast-Komponenten | alle in einer Last                                        | Löschen löscht die ganze Last                                                                                                                                                                                                                                                                            |
| Gleichlast             | liegt **immer** auf dem ganzen Stab                       | Im Dialog sind A/B gesperrt. Konstanter Teilabschnitt = Trapez mit `q1 === q2`                                                                                                                                                                                                                           |
| relativ/absolut        | ein Flag `relativeDistances` pro Last                     | Gilt im Dialog für A und B gemeinsam                                                                                                                                                                                                                                                                     |
| Bezugslänge            | eigene Achse, nicht Teil der Richtung                     | Im Dialog zwei getrennte Gruppen                                                                                                                                                                                                                                                                         |
| Momentlast             | ohne `frame`, `axis`, `referenceLength`                   | siehe unten                                                                                                                                                                                                                                                                                              |
| Benennung              | `fx/fz/my` am Knoten, `p`/`q`/`q1,q2`/`m`/`m1,m2` am Stab | siehe unten                                                                                                                                                                                                                                                                                              |
| Nummerierung           | keine nutzersichtbare Nr., `crypto.randomUUID()` reicht   | —                                                                                                                                                                                                                                                                                                        |
| `comment?: string`     | wird mitgeführt                                           | —                                                                                                                                                                                                                                                                                                        |
| 1D und 2D              | ein Typ; die 1D-UI bietet nur `'trueLength'` an           | Getrennte Typen kosten doppelte Validierung und doppelte Darstellung                                                                                                                                                                                                                                     |
| Union-Breite           | sechs Varianten (`kind` × `distribution`)                 | Einheit steht im Feldnamen                                                                                                                                                                                                                                                                               |
| Dependencies           | keine; Ziele nur über ids                                 | `fem-geometry` kommt erst mit `validate.ts` (Längenprüfung, projizierte Länge 0). `resolve` ist **kein** Teil dieses Packages, sondern ausgelagert nach `@baustatik/fem-load-resolve` (siehe `Elementformulierung.md`) — Grund: sonst zöge das reine Eingabemodell `fem-geometry` **und** `fem` mit rein |
| Einheiten              | blanke `number`, Einheit im Doc-Kommentar                 | Package bleibt abhängigkeitsfrei wie `@baustatik/fem`                                                                                                                                                                                                                                                    |

### Bezugslänge — die Falle, auf die ich einmal reingefallen bin

Der RFEM-Text nennt die **Blickrichtung**, nicht die gemessene Achse:

- „Projektion in X" → Blick entlang X, Bemaßung im Bild **senkrecht** →
  gemessen wird die z-Ausdehnung → `'verticalProjection'`
- „Projektion in Z" → Blick von oben, Bemaßung **waagrecht** → x-Ausdehnung →
  `'horizontalProjection'` → **das ist der Schneefall**

Belege: `Stablast4.png`, `Stablast5.png`. Die Werte im Typ heißen deshalb nach
dem, was gemessen wird, nicht nach dem Dialogtext.

### Warum Momentlasten keine Richtung tragen

Ein ebenes Moment dreht immer um y. Der Dialog lässt „Lokal y" und „Global Y"
wählen (`Stablast6.png`, `Stablast7.png`) — für einen Stab in der x-z-Ebene
sind das dieselbe Achse, die Wahl hat keine beobachtbare Wirkung. Ein Feld ohne
Wirkung wäre Zustand, den Zeichnen und Solver mitschleppen und ignorieren
müssten. Kommt mit 3D zurück. **Diese Entscheidung ist die einzige, bei der der
Nutzer sich ausdrücklich das Widerspruchsrecht vorbehalten hat.**

### Warum `p` und nicht `f` auf dem Stab

`p` und `q` sind ein Paar aus der Elementlast-Konvention (Einzellast /
Streckenlast). `f` gehört zur Knotenvektor-Welt und paart sich mit `ux/uz/phiY`
in `NodeSupport` — Kraft und Verschiebung sind pro Freiheitsgrad dual. `f`
neben `q` wäre die eigentliche Inkonsistenz.

**Kein Achs-Split in diesem Modell.** Hier ist die Stablast ein _Betrag_ mit
separat gewählter Richtung (`axis`) — deshalb gibt es genau ein `q`/`p`, **kein**
`qx`/`qz`. Die Zerlegung in axial/quer (`qx/qz/my(x)` verteilt, `px/pz/my`
je Punkt, Achsindex ohne Unterstrich wie `fx/fz/my`) entsteht **erst** in
`@baustatik/fem-load-resolve` beim Projizieren in lokale Stabkoordinaten; das
dortige Namensschema (`q`/`p` = Stab, `f` = Knoten) setzt diese Benennung
konsistent fort (siehe `Elementformulierung.md`).

### Eine bewusst stehen gelassene Warze

`m` heißt bei `distribution: 'point'` **kNm** und bei `'constant'` **kNm/m**.
Der Dialog unterscheidet per Groß-/Kleinschreibung (`M` vs. `m`), was in
TypeScript keine gute Idee ist. `distribution` narrowt korrekt, die Einheit
steht als Kommentar am Feld. Nicht „aufräumen", ohne den Ersatz zu Ende zu
denken.

## Nächste Schritte

1. ~~**`src/index.ts`**~~ — erledigt.
2. ~~**`pnpm install` im Root**~~ — erledigt; `lint`, `format`, `build`, `test`
   und `typecheck` laufen alle sauber.
3. ~~**`src/validate.ts`**~~ — erledigt, siehe „Wo wir stehen". Drei
   Entscheidungen, die dort getroffen wurden und Widerspruch vertragen —
   ausführlich mit Alternativen und Umkehraufwand in
   [`TODO-check.md`](TODO-check.md), hier nur der Kern:
   - **Fehler werden gesammelt UND geworfen.** `validateLoads` gibt eine Liste
     benannter `LoadValidationError`-Instanzen zurück (Dialog: alle Fehler auf
     einmal, `loadId`/`field` als Felder, damit die UI das richtige
     Eingabefeld markieren kann); `assertValidLoads` wirft die erste. Ohne die
     Liste hätte der Dialog nur „ein Fehler nach dem anderen".
   - **Kein Import aus `@baustatik/fem`.** Gebraucht werden nur `hasNode` und
     `beamAxis` — das ist `LoadModelGeometry`. Die Abbildung `Beam → Line`
     leistet der Aufrufer, der `fem` ohnehin kennt.
   - **Die wirkungslose `referenceLength` der Einzellast wird nicht
     beanstandet** (`p` ist kN, nicht kN/m). Ändert sich, sobald offene Frage 6
     aus `fem-load-resolve/HANDOFF.md` das Feld aus dem Typ wirft.
4. **`CONTEXT.md`** nach dem Muster von `packages/fem-viewer/CONTEXT.md`
   (Purpose / Boundaries / Dependencies / Navigation / Invariants / Validation /
   Known constraints), Zeile in der Tabelle in `AGENTS.md:29` ergänzen.
5. **Darstellung** im `fem-viewer`, in dieser Reihenfolge:
   - `src/load-geometry.ts` — reine Weltgeometrie (Ankerpunkt, Richtungsvektor,
     Basislinie). Importiert **weder** `render-core` **noch** `viewport-2d`,
     damit die Datei später nach `fem-loads` verschiebbar bleibt.
   - `src/loads.ts` — `loadSpecs({loads, nodes, beams, viewport, style})` über
     das **ganze** Array, nötig wegen der `qRef`-Normierung.
   - `'loads'` in `FEM_LAYERS` einfügen; Vorschlag
     `['grid', 'supports', 'beams', 'loads', 'nodes']` — Knoten bleiben oben.
   - `fem-geometry` und `fem-loads` als Dependencies in
     `fem-viewer/package.json`; `fem-viewer` hängt heute **nicht** an
     `fem-geometry`.
   - Fehlertypen in `fem-viewer/src/errors.ts` analog zu
     `UnknownNodeReferenceError`: `UnknownBeamReferenceError`,
     `LoadOutOfBeamRangeError`. Prinzip: „Dangling references throw".
   - Spec-IDs: `load:{id}`, Kinder `load:{id}:arrow:{i}`; bei der Knotenlast
     `load:{id}:fx` / `:fz` / `:my`, weil eine Last bis zu drei Symbole hat.
6. **Demo** — `addNodeLoad` / `addBeamLoad` im Store, den auskommentierten
   Pseudocode fallweise aktivieren. Der schräge Stab steht bereits
   (`apps/demo/fem-viewer.ts:38`, Knoten bei `(160, -40)`, also nach _oben_, da
   z abwärts zeigt).

## Der eigentliche technische Knackpunkt

Nicht die Lastposition — die ist eine Zeile. Sondern das Layout bei **schrägen
Stäben**. `frame`, `axis` und `referenceLength` ergeben drei verschiedene
Layout-Funktionen, nicht drei Parameter derselben Funktion:

- `frame: 'global'` — Pfeile parallel zur globalen Achse; die Basislinie der
  Streckenlast ist ein Parallelversatz **in Lastrichtung**
- `frame: 'local'` — Versatz entlang der Stabnormalen
- `referenceLength` ≠ `'trueLength'` — die Pfeildichte ist in der _projizierten_
  Länge konstant, nicht entlang des Stabs

Screen-konstante Symbole wie bei den Auflagern (`fem-viewer/src/supports.ts`
ist das Referenzmuster: `/ scale` bei Geometrie **und** Translation):

```ts
const arrowLengthWorld = style.arrowLengthPx / vp.scale;
const arrowSpacingWorld = style.arrowSpacingPx / vp.scale;
```

Die fachliche Lastposition bleibt in Weltkoordinaten; nur Symbolgröße und
Pfeildichte hängen am Viewport.

## Offene Fragen

1. **`qRef`-Normierung.** Wenn die Pfeillänge proportional zur Lastgröße ist,
   braucht es eine Referenzgröße über alle sichtbaren Lasten. Pro Lastfall, pro
   Modell oder fix? Empfehlung: pro `loadSpecs`-Aufruf normieren, Override im
   Style.
2. **Beschriftung.** `packages/render-core/src/specs.ts` kennt `line, circle,
polygon, rectangle, triangle, group` — **kein `TextSpec`**. Sobald Lastwerte
   angeschrieben werden, müssen `render-core` **und** `konva-adapter` angefasst
   werden. Das ist die einzige Stelle, an der das nötig ist.
3. **Eingabe von `distanceFromStart` per Maus.** `Line.closestPoint` gibt es in
   `fem-geometry`, aber `createFEMViewer` kennt kein Hit-Testing, nur Pan/Zoom.
   Zwischenschritt: Distanz numerisch im Store setzen.
4. **Lastfälle.** Kommen „irgendwann zwingend", aber nicht in den nächsten
   Wochen. Bewusst **kein** `loadCaseId` im Typ — eine ID ohne Besitzer lädt zu
   einem Fake-Default-Lastfall ein, Nachrüsten ist ein Einzeiler.
   `@baustatik/actions` (Eurocode-Einwirkungen, ψ-Werte) erst anlegen, wenn die
   normative Logik wirklich kommt; dann `packages/material/src/national-annex.ts`
   als Muster wiederverwenden, nicht neu erfinden.

## Nebenbefund, unabhängig von den Lasten

`packages/fem-viewer/CONTEXT.md:49` behauptet die Bandreihenfolge
`['grid','beams','nodes','supports']`. Real ist
`['grid','supports','beams','nodes']` (`layers.ts:11`, verifiziert). Bei
Gelegenheit korrigieren — am besten zusammen mit dem Einfügen von `'loads'`.

## Validierung

```text
pnpm --filter @baustatik/fem-loads typecheck
pnpm --filter @baustatik/fem-loads test        # 28 Tests, 100 % Coverage
pnpm --filter @baustatik/fem-viewer test
```

`loadSpecs` und `load-geometry` sind reine Funktionen ohne Konva und lassen
sich in Node testen, genau wie `femSpecs` — siehe
`packages/fem-viewer/tests/scene.test.ts`.

## Konventionen des Repos

- Verbindliche Anweisungen stehen in `AGENTS.md`; `CLAUDE.md` verweist dorthin
- pnpm 9 + Turborepo, Vitest, Biome; packageweise zusätzlich Oxlint/Oxfmt
- Kommentare im Bestandscode sind **deutsch** und erklären das _Warum_
- Releases über Changesets, Versionen nicht von Hand editieren
- `packages/konva-adapter-BAK/`, `fem-1d/`, `fem-2d/`, `solver-2d/` sind
  Altlasten bzw. Platzhalter ohne `package.json` — nicht anfassen
- `cross-section-viewer` ist ein Gerüst und **kein** Referenzmuster; `grid-2d`
  ist das Vorbild
