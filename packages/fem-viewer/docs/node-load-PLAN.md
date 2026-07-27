# Context

Im Demo-Store liegen bereits Knotenlasten, punktuelle Stabkräfte und Streckenlasten, aber `@baustatik/fem-viewer` zieht bislang nur Knoten, Stäbe und Auflager. Der erste Ausbauschritt soll konzentrierte **Kräfte** darstellen: `NodeLoad.fx/fz` sowie `BeamForcePointLoad`. Jede Kraft erhält einen schematischen, zoomfesten Pfeil in Wirkrichtung, dessen Spitze am Angriffspunkt liegt, und am äußeren Pfeilende ein waagerechtes Label mit dem Betrag in `kN`. Punktmomente und Streckenlasten bleiben für spätere Schritte unsichtbar.

Die Paketgrenze bleibt erhalten: `fem-viewer` erzeugt neutrale Specs; nur `konva-adapter` kennt Konva. Laut Konva-Dokumentation verläuft `Arrow.points` vom Pfeilanfang zur Spitze, und eine Box aus `Label` + `Tag` + `Text` ist für das gewünschte Label geeigneter als Textmessung im Viewer:

- https://konvajs.org/api/Konva.Arrow.html
- https://konvajs.org/api/Konva.Label.html
- https://konvajs.org/api/Konva.Tag.html
- https://konvajs.org/api/Konva.Text.html

## Wiederverwendung statt Neubau

Die Lage und die Richtung einer Stablast sind **keine** Viewer-Fragen — sie sind bereits beantwortet, und zwar dort, wo der Solver sie liest. Der Viewer nimmt sie von dort, statt sie ein zweites Mal herzuleiten. Sonst driften Bild und Rechnung genau in dem Paar auseinander, für das man das Bild überhaupt anschaut.

- `modelGeometry(nodes, beams).beamAxis(beamId)` (`fem-loads/src/model-geometry.ts`) liefert die Stabachse als `Line` — mit der fachlich festgelegten Reihenfolge `p1` am Anfangs-, `p2` am Endknoten, an der `distanceFromStart` hängt.
- `station()` (`fem-load-resolve/src/resolve.ts`, heute privat) rechnet Prozent → Weltlänge (`value * L / 100`) **und** klemmt auf `[0, L]`.
- `toLocalComponents()` (ebenda, privat) hält die `frame`/`axis`-Konvention über `Line.toLocal` an einer Stelle — ausdrücklich so begründet.
- `UnknownLoadTargetError(loadId, 'node' | 'beam', targetId)` (`fem-loads/src/errors.ts`) ist der bestehende Fehler für ein Lastziel, das es nicht gibt. `model-geometry.ts` legt die Arbeitsteilung fest: `UnknownNodeReferenceError` ist der **Modell**fehler (ein Stab zeigt ins Leere), `UnknownLoadTargetError` der **Last**fehler. Der Viewer bekommt für Lastziele deshalb keinen dritten Fehlertyp.

## Festgelegtes Verhalten

- Knotenkräfte und punktuelle Stabkräfte werden dargestellt; Knoten-/Stabmomente und verteilte Lasten noch nicht.
- Bei einer Knotenlast mit `fx` und `fz` entsteht je Komponente ein eigener Pfeil.
- Die Pfeilspitze liegt exakt am Knoten beziehungsweise am interpolierten Lastpunkt auf dem Stab.
- Alle Pfeile haben dieselbe Standardlänge `DEFAULT_POINT_FORCE_ARROW_LENGTH_PX = 48` und skalieren beim Zoomen nicht mit.
- Negative Werte drehen die Pfeilrichtung um; das Label zeigt den unsignierten Eingabebetrag.
- **Zahlformat des Labels**: `` `${roundSmart(Math.abs(value))} kN` `` mit den Defaults aus `@baustatik/round` (`sigDigits: 4`, `minDecimals: 2`) und blanker `String`-Umwandlung, ohne Locale. Das trifft die gewünschten Beispiele exakt: `10 kN` (Ganzzahl fällt unverändert durch) und `0.85 kN`. Ohne feste Regel wäre der Test an die Fließkommadarstellung gebunden.
- Das Label bleibt immer waagerecht, hat eine helle blaue Box ohne Tag-Zeiger und liegt mit 6 px Abstand zentriert in Verlängerung hinter dem Pfeilende.
- **Platzierungsregel des Labels** (Strahl-Rechteck-Schnitt, siehe Schritt 2): eindeutig auch für schräge Richtungen.
- Lasten erhalten das oberste Paint-Band `loads`.
- Mehrere deckungsgleiche Lasten werden zunächst weder summiert noch aufgefächert. Bei `fx` **und** `fz` am selben Knoten können sich die beiden Labels überlappen — bekannte Einschränkung, gehört in `CONTEXT.md`.

# Implementation

## 1. Lastgeometrie in `fem-load-resolve` öffnen

**Dateien:**

- `packages/fem-load-resolve/src/load-geometry.ts` (neu)
- `packages/fem-load-resolve/src/resolve.ts`
- `packages/fem-load-resolve/src/index.ts`
- `packages/fem-load-resolve/tests/load-geometry.test.ts` (neu)
- `packages/fem-load-resolve/CONTEXT.md`

- `station()` unverändert nach `load-geometry.ts` verschieben, als `loadStation(value, relative, L)` exportieren und in `resolve.ts` von dort importieren. Das Klemmen auf `[0, L]` und die Prozentregel bleiben wörtlich, was sie sind — verschoben wird nur die Sichtbarkeit.
- `loadDirection(frame, axis, line): Vector` neu ergänzen: der **globale** Einheitsvektor einer Kraftrichtung. `frame: 'global'` liefert `(1,0)` bzw. `(0,1)`, `frame: 'local'` liefert `Line.toGlobal(line, e)`.
- `toLocalComponents()` bleibt bewusst wie es ist und wird **nicht** über `loadDirection` umgebaut: im lokalen Fall entstünde ein `toGlobal ∘ toLocal`-Rundlauf, der dem Solverpfad Fließkommarauschen zufügt. Die Kopplung sichert stattdessen ein Test, der für alle vier `frame`/`axis`-Kombinationen an einem schrägen Stab prüft, dass `Line.toLocal(line, loadDirection(f, a, line))` mit `toLocalComponents(f, a, 1, line)` übereinstimmt.
- Tests für `loadStation`: absolut, relativ (Prozent!), Klemmen an beiden Enden.
- `CONTEXT.md` um den neuen, absichtlich schmalen Export-Kopf ergänzen: das Package beantwortet die Lage- und Richtungsfrage jetzt auch für Nicht-Solver-Aufrufer.

## 2. Render-neutrales Vokabular erweitern

**Dateien:**

- `packages/render-core/src/specs.ts`
- `packages/render-core/src/validation.ts`
- `packages/render-core/src/index.ts`
- `packages/render-core/tests/errors.test.ts`
- `packages/render-core/docs/usage.md`

- `ArrowSpec` als echtes Primitive ergänzen: Anfang, Spitze, Pfeilspitzenlänge/-breite sowie bestehende Stroke-/Fill-Felder. In `PrimitiveSpec` aufnehmen.
- `LabelSpec` als render-neutrales Leaf-Primitive ergänzen. Es trägt Text, Ankerpunkt, Platzierungsrichtung, Abstand sowie Font-, Padding-, Hintergrund-, Rand- und Eckenstil. Die Platzierungsrichtung erlaubt dem Adapter, die gemessene Box mit echtem Randabstand hinter dem Pfeilende zu zentrieren, ohne Textmessung in den Viewer zu ziehen.
- `fontFamily` gehört **in die Spec** (mit Default), nicht an Konvas Voreinstellung: sonst hängen Aussehen und Screenshot-Baseline an der Fontliste der Maschine.
- Beide Typen exportieren und vollständig validieren: endliche Punkte/Richtung, nichtverschwindende Platzierungsrichtung, positive Pfeilspitzen- und Schriftmaße, nichtnegative Abstände/Ränder, nichtleerer Text und gültige Farben.
- **`LabelSpec` als Gruppenkind verbieten.** `Konva.Label` ist eine `Konva.Group`; als Kind eines `GroupSpec` entstünde im Konva-Baum eine verschachtelte Gruppe, während `konva-adapter/CONTEXT.md` „Nested groups are not supported" zusagt. Die Kinderprüfung in `validateSpec` lehnt `kind: 'label'` deshalb mit derselben Begründung ab wie eine verschachtelte Gruppe; die Zusage im Adapter-`CONTEXT.md` wird zugleich auf „keine verschachtelten `GroupSpec`" präzisiert (Schritt 3).
- Validierungs- und Eindeutigkeitstests um gültige und ungültige Arrow-/Label-Specs erweitern, inklusive des abgelehnten Labels in einer Gruppe.
- `docs/usage.md` erweitern: zwei neue Spec-Typen, davon `label` das **erste** mit Text und das erste, dessen endgültige Geometrie erst der Adapter kennt (Textmessung). Diese Ausnahme gehört dokumentiert, nicht nur implementiert.
- Zur Kenntnis für die Erwartungshaltung: `validateSpecs` wird heute nirgends im Produktionscode aufgerufen, nur exportiert. Die neue Validierung greift damit ausschließlich in Tests.

## 3. Konva-Abbildung für Arrow und Label bauen

**Dateien:**

- `packages/konva-adapter/src/primitives/arrow.ts` (neu)
- `packages/konva-adapter/src/primitives/label.ts` (neu)
- `packages/konva-adapter/src/primitives/index.ts`
- `packages/konva-adapter/src/reconcile.ts`
- `packages/konva-adapter/tests/node/primitives.test.ts`
- `packages/konva-adapter/tests/browser/reconcile.browser.test.ts`
- `packages/konva-adapter/tests/screenshot/primitives.screenshot.test.ts`
- `packages/konva-adapter/CONTEXT.md`

- `ArrowSpec` auf `Konva.Arrow` abbilden: Punkte strikt `tail -> tip`, gefüllte Pfeilspitze, vorhandene `strokeConfig()`-Semantik und `strokeScaleEnabled:false` wiederverwenden.
- `LabelSpec` als gekapseltes `Konva.Label` mit genau einem `Konva.Tag` und `Konva.Text` bauen. `pointerDirection` bleibt `none`.
- Build und Patch aus denselben reinen Konfigurationen speisen. Beim Patch Text und Tag aktualisieren, anschließend die aktuelle Text-/Padding-Größe verwenden, um die axis-aligned Label-Box entlang der normierten Platzierungsrichtung zu versetzen. Das Label selbst erhält keine Rotation.
- **Platzierungsregel, verbindlich:** Anker `A`, normierte Richtung `d`, Spec-Abstand `g`, Box mit Halbmaßen `hw`/`hh`. Der Boxmittelpunkt liegt bei `A + d * (g + t)` mit `t = min(hw / |d.u|, hh / |d.v|)`, gebildet nur über die Komponenten mit `|d_i| > 0`. Damit schneidet der Strahl von `A` in Richtung `d` den Boxrand genau im Abstand `g`; für achsparallele Richtungen ist `t` exakt die halbe Breite bzw. Höhe. Ohne diese Festlegung ist „nächster Rand" bei schräger Richtung mehrdeutig (Projektion des Halbmaßes vs. Strahlschnitt liefern verschiedene Ergebnisse) und der 6-px-Test aus Schritt 5 nicht schreibbar. In der Demo fällt der Unterschied nicht auf — alle Richtungen dort sind achsparallel; am schrägen Stab mit `frame: 'local'` schon.
- Den Leaf-Reconciler typgerecht von ausschließlich `Konva.Shape` auf die unterstützten leaf nodes (`Shape | Label`) erweitern. Das betrifft **beide** Stellen, die auf `LivePrimitive.shape` zugreifen: den Top-Level-Reconciler *und* `reconcileGroupChildren` — derselbe Code, dieselbe Änderung. Stabile IDs, Kindwechsel, Bandwechsel und Gruppen-Kinder bleiben nach demselben Verfahren erhalten. (Labels erreichen den Gruppenpfad nach Schritt 2 nicht mehr; der Typ deckt ihn trotzdem konsistent ab.)
- Unit-Tests prüfen exakte Arrow-, Text- und Tag-Konfigurationen sowie Build/Patch-Parität. Browser-Tests prüfen echte Knotentypen, In-place-Patches, aktualisierte Labeltexte und — als eigentlicher Test der Platzierungsregel — die **gemessenen Boxmaße und -positionen** für eine achsparallele und eine schräge Richtung.
- **Screenshots:** Baseline für `arrow` aufnehmen. Für `label` **keine** Pixel-Baseline: Text ist deutlich stärker maschinenabhängig als das bereits plattformabhängige Antialiasing (Fontverfügbarkeit, Hinting), und die Zusage über die Boxgeometrie liegt schon im Browser-Test. Diese Entscheidung unter „Known constraints" im `CONTEXT.md` festhalten.
- `CONTEXT.md` außerdem: Label-Sonderpfad im Patch (Tag + Text + Offset statt einem `setAttrs`), `fontFamily` als Spec-Feld, und die Präzisierung „keine verschachtelten `GroupSpec`".

## 4. Konzentrierte Kräfte in `fem-viewer` in Specs übersetzen

**Dateien:**

- `packages/fem-viewer/package.json`
- `packages/fem-viewer/src/loads.ts` (neu)
- `packages/fem-viewer/src/scene.ts`
- `packages/fem-viewer/src/index.ts`
- `packages/fem-viewer/src/layers.ts`
- `packages/fem-viewer/src/viewer.ts`

- Direkte Abhängigkeiten ergänzen: `@baustatik/fem-loads` (Lasttypen, `modelGeometry`, `UnknownLoadTargetError`), `@baustatik/fem-load-resolve` (`loadStation`, `loadDirection` aus Schritt 1), `@baustatik/fem-geometry` (`Line`, `Vector`, `Point` für die reine Punktarithmetik `p1 + ex * a`) und `@baustatik/round` (`roundSmart` für den Labeltext). Die Konventionen kommen aus `fem-load-resolve`; `fem-geometry` liefert nur Vektorrechnung ohne eigene Winkelkonvention.
- `src/errors.ts` bleibt **unverändert**: für unbekannte Lastziele — Knoten **wie** Stab — wirft `loads.ts` den bestehenden `UnknownLoadTargetError` aus `fem-loads`. `UnknownNodeReferenceError` bleibt dem Modellfehler vorbehalten (Stab zeigt auf fehlenden Knoten).
- In `loads.ts` eine reine Last-zu-Spec-Abbildung kapseln:
  - `NodeLoad`: pro Zielknoten und pro wirksamer `fx`-/`fz`-Komponente ein Arrow-/Label-Paar; `my` bleibt unberücksichtigt.
  - `BeamForcePointLoad`: Stabachse über `modelGeometry(nodes, beams).beamAxis(beamId)` holen, Station über `loadStation(load.distanceFromStart, load.relativeDistances === true, Line.length(axis))`, Angriffspunkt als `axis.p1 + Line.frame(axis).ex * a`, Richtung über `loadDirection(load.frame, load.axis, axis)` mal `Math.sign(load.p)`.
  - Unsupported Varianten (`moment`, `constant`, `trapezoidal`) bewusst ohne Specs lassen, damit die bereits vorhandene Streckenlast das Rendern nicht verhindert.
  - Stabile, global eindeutige IDs aus Last-ID, Ziel-ID und bei Knotenlasten Komponente bilden, jeweils mit `:arrow`/`:label`-Suffix.
- Pfeil- und Labelgeometrie vollständig screen-konstant berechnen: Länge, Pfeilspitze, Labelabstand, Font, Padding und Corner-Radius durch `vp.scale` teilen; Stroke-/Border-Breiten unverändert lassen, da der Adapter sie in Screen-Pixeln zeichnet.
- `FEMStyle` um überschreibbare Point-Force-/Label-Stile erweitern. Vorgaben: 48 px Pfeillänge, 6 px Labelabstand, blaue Pfeile/Ränder/Texte und heller blauer Hintergrund; Pfeilspitzen-, Font-, Padding- und Eckenmaße sowie `fontFamily` erhalten kleine benannte Defaults.
- **`femSpecs` auf ein Options-Objekt umstellen**: `femSpecs({ nodes, beams, supports, loads, viewport, style })`. Sonst stünden vier positionale Sammelparameter nebeneinander, davon drei `readonly X[]` in Folge. Es gibt genau zwei Aufrufer (`viewer.ts` und die Tests) — jetzt kostet der Wechsel fast nichts, später wird er teuer.
- `createFEMViewer()` erhält den zum bestehenden Pull-Muster passenden Pflicht-Port `getLoads()` und zieht ihn bei jedem Render erneut. Das ist ein Breaking Change der öffentlichen API (siehe Schritt 6, Changeset).
- `FEM_LAYERS` zu `['grid', 'supports', 'beams', 'nodes', 'loads']` erweitern.

## 5. Tests in `fem-viewer`

**Dateien:**

- `packages/fem-viewer/tests/load-specs.test.ts` (neu)
- `packages/fem-viewer/tests/scene.test.ts`
- `packages/fem-viewer/tests/viewer.test.ts`

- `load-specs.test.ts` deckt ab:
  - positive/negative globale `fx`/`fz`-Knotenkräfte und zwei Komponenten derselben Last,
  - globale und lokale x-/z-Richtungen an waagrechten und schrägen Stäben,
  - absolute und relative Stationen (relativ misst in **Prozent**) sowie mehrere Ziele pro Last,
  - Pfeilspitze am Angriffspunkt, 48-px-Länge, 6-px-Labelabstand, waagerechtes Label, Betrag plus `kN` in der festgelegten Formatierung (`10 kN`, `0.85 kN`),
  - screen-konstante Geometrie und stabile IDs über Zoom/Pan,
  - bewusst ignorierte Moment-/Streckenlasten,
  - `UnknownLoadTargetError` bei unbekannten Knoten- **und** Stab-Zielen und gültige Gesamt-Specs über `validateSpecs`.
- Scene-/Viewer-Tests auf die neue Options-Signatur, das oberste `loads`-Band und den Pull von `getLoads()` bei jedem Render aktualisieren.

## 6. Demo, Dokumentation und Release

**Dateien:**

- `apps/demo/fem-viewer.ts`
- `packages/fem-viewer/CONTEXT.md`
- `packages/fem-viewer/docs/usage.md`
- `AGENTS.md`
- `.changeset/<neu>.md`

- Im Demo `getLoads: () => store.loads` an `createFEMViewer()` übergeben. Die bestehenden Fixtures reichen als Sichttest: Knotenlast und Stab-Punktlast werden sichtbar, die konstante Stablast bleibt bis Schritt zwei unsichtbar.
- `fem-viewer/CONTEXT.md`: Lastdarstellung, neue direkte Abhängigkeiten, die Fehler-Arbeitsteilung (`UnknownLoadTargetError` vs. `UnknownNodeReferenceError`), die überlappenden Labels bei `fx`+`fz` am selben Knoten unter „Known constraints", und die Streichung des Satzes, Lasten würden noch nicht gezeichnet.
- `fem-viewer/docs/usage.md`: neuer Pflicht-Port `getLoads()` und die geänderte `femSpecs`-Signatur.
- `AGENTS.md`, Zeile 33 (`@baustatik/fem-viewer`): Deps-Spalte um `fem-loads`, `fem-load-resolve`, `fem-geometry` und `round` ergänzen; Purpose-Text um die Lastdarstellung erweitern.
- **Changeset anlegen** (`AGENTS.md` verlangt Changesets für Releases). Betroffen sind vier publizierte Pakete: `fem-load-resolve` (neue Exports, minor), `render-core` (neue Spec-Typen, minor), `konva-adapter` (neue Primitives, minor) und `fem-viewer` (**breaking**: `getLoads()` ist Pflicht, `femSpecs` hat eine neue Signatur).

# Verification

1. Engste Pakete prüfen:
   - `pnpm --filter @baustatik/fem-load-resolve test && pnpm --filter @baustatik/fem-load-resolve typecheck`
   - `pnpm --filter @baustatik/render-core test && pnpm --filter @baustatik/render-core typecheck`
   - `pnpm --filter @baustatik/konva-adapter test && pnpm --filter @baustatik/konva-adapter typecheck`
   - `pnpm --filter @baustatik/konva-adapter test:screenshot`
   - `pnpm --filter @baustatik/fem-viewer test && pnpm --filter @baustatik/fem-viewer typecheck`
2. Betroffene Pakete bauen:
   - `pnpm --filter @baustatik/fem-load-resolve build`
   - `pnpm --filter @baustatik/render-core build`
   - `pnpm --filter @baustatik/konva-adapter build`
   - `pnpm --filter @baustatik/fem-viewer build`
   - `pnpm --filter demo build`
3. Demo mit der Projekt-Run-Funktion starten und im Browser prüfen:
   - Pfeilspitzen sitzen am Knoten bzw. bei 50 Einheiten auf dem ersten Stab.
   - Beide sichtbaren Kräfte zeigen in globale +z-Richtung nach unten.
   - Labels zeigen `10 kN`, sind waagerecht, hellblau und liegen hinter den Pfeilenden.
   - Beim starken Rein-/Rauszoomen bleiben Pfeillänge, Pfeilspitze, Labelgröße und 6-px-Abstand visuell konstant.
   - Die vorhandene konstante Last auf dem schrägen Stab wird noch nicht gezeichnet.
4. Wegen Änderungen am gemeinsam genutzten Render-Vokabular **und** am Solver-nahen `fem-load-resolve` abschließend mindestens `pnpm build` und `pnpm test` im Repository-Root ausführen; Fehlschläge vollständig berichten.
5. Changeset vorhanden und mit den vier betroffenen Paketen sowie dem `major`-Eintrag für `fem-viewer` versehen.
