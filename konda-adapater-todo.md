# Review & Verbesserungsplan: `@baustatik/konva-adapter`

Stand: 2026-07-12 — Review von `packages/konva-adapter/src/index.ts` (130 Zeilen, keine Tests).
Verwendung: `apps/demo/renderer.ts`. Vertrag: `RenderDriver`, `Spec`, `ViewIntent` aus `@baustatik/render-core`.
Leitplanken: gute DX, modernes TypeScript, **Verhalten strikt beibehalten**, Naming-Änderungen erst besprechen.

## A. Latente Verhaltensfragen (heute teils unerreichbar, aber tickende Bomben)

1. **`build()` gibt für `circle`/`polygon`/`triangle` implizit `undefined` zurück** (Fall-through auf `break`, `src/index.ts:22-43`). Der Rückgabetyp `Konva.Shape` lügt; `layer.add(undefined)` würde zur Laufzeit crashen. Heute unerreichbar, weil der Viewer nur `line`-Specs baut. `noImplicitReturns` ist nicht aktiv, daher schweigt TypeScript.
2. **`patch()` aktualisiert die Linien-Geometrie nicht** (Punkte auskommentiert, `src/index.ts:52`). Ändert sich `from`/`to` bei gleicher id, bleibt die gezeichnete Linie am alten Ort — nur Farbe/Breite werden gepatcht.
3. **Falsy-Checks in `patch()`**: `if (spec.strokeWidth)` ignoriert `strokeWidth: 0`; einmal gesetzte Werte werden nie zurückgesetzt, wenn die Spec sie weglässt.
4. **`reconcile()` erkennt `kind`-Wechsel bei gleicher id nicht** — die alte Shape wird gepatcht statt neu gebaut → stillschweigend falsches Ergebnis.
5. **Pan-Drag bleibt hängen**: kein Maustasten-Check (auch Rechtsklick pannt), `mouseup` wird nur auf der Stage gehört — loslassen außerhalb lässt `dragging = true` zurück. Klassische Lösung: `window`-Listener oder `mouseleave`.

→ Für jeden Punkt einzeln entscheiden: Bug (fixen erlaubt) oder Verhalten (unantastbar)?

## B. DX

6. **`KonvaDriverConfig` ist nicht exportiert** — Konsumenten können den Config-Typ nicht benennen.
7. **Keine Tests**, obwohl `vitest.config.ts` bereits Unit- (`test/node/**`) und Browser-Projekte (`test/browser/**`) fertig konfiguriert hat — exakt das Layout der alten `konva-adapter-BAK`-Testsuite. Außerdem: `headless: false` im Browser-Projekt blockiert CI.
8. **Drei Verantwortlichkeiten in einer Datei**: Spec→Konva-Übersetzung (`build`/`patch`), Pointer-Interaktion (mousedown/-move/-up/wheel), Stage-Lifecycle/`reconcile`. Die BAK-Struktur (`konva/`, `mapping/`, `viewport/controls`) zeigt die Repo-Konvention für den Schnitt.
9. **Kein JSDoc** auf der Public API; toter auskommentierter Code und Arbeitsnotiz-Kommentare ("1. DEKLARIEREN", "2. MERKEN"); Zoomfaktor `1.1` hartkodiert ohne Konfigurationsmöglichkeit.

## C. Naming (nur besprechen — nichts umbenennen, bevor es entschieden ist)

10. **Adapter vs. Driver gemischt**: `createKonvaAdapter` liefert einen `RenderDriver`, die Config heißt `KonvaDriverConfig`, und die Demo aliased sofort um (`createKonvaAdapter as createKonvaDriver`, `apps/demo/renderer.ts:3`) — der Name sitzt nicht. Ein konsistentes Vokabular festlegen (betrifft Funktions-, Typ- und ggf. Package-Namen).

## D. Packaging / 2026-TypeScript

11. **`exports`-Map-Reihenfolge**: `development` steht vor `types` — `types` muss als erste Condition stehen, sonst greifen Editor/TS u. U. daneben. `sideEffects: false` fehlt.
12. **Package-lokale Compiler-Schärfe**: `noImplicitReturns` (hätte Befund 1 gefangen), `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Monorepo-weit (`tsconfig.base.json`, `target: ES2020`) nur als Notiz — nicht Scope dieses Packages.
13. **`import Konva from 'konva'`** zieht den vollen Namespace; gezielte `konva/lib/...`-Imports wären tree-shakebar (Verhalten identisch, Bundle kleiner).

## Vorgeschlagene Tickets (Reihenfolge & Abhängigkeiten)

| # | Typ | Frage | Blockiert durch |
|---|-----|-------|-----------------|
| 1 | Besprechung | **Naming: Adapter oder Driver?** Konsistentes Vokabular für Funktion, Config-Typ, ggf. Package. | — |
| 2 | Besprechung | **Verhaltensgrenze**: Befunde A1–A5 einzeln durchgehen — was darf gefixt werden, was bleibt exakt so? Auch: unimplementierte Spec-Kinds explizit werfen, Typ verengen oder so lassen? | — |
| 3 | Recherche | **Teststrategie-Recherche**: BAK-Testsuite (`packages/konva-adapter-BAK/test/`) sichten — was ist wiederverwendbar (Harness, Node/Browser-Schnitt)? Läuft Konva für `build`/`patch`/`reconcile` headless in Node (happy-dom liegt im Workspace) oder braucht es das Browser-Projekt? | — |
| 4 | Besprechung | **Teststrategie entscheiden**: Node-vs-Browser-Schnitt, Coverage-Anspruch, `headless: true`, Übernahme aus BAK. | 3 |
| 5 | Besprechung | **Public API & Modulschnitt**: Exporte (Config-Typ, benannter Rückgabetyp?), Dateischnitt Übersetzung/Interaktion/Lifecycle, JSDoc-Umfang. | 1, 2 |
| 6 | Besprechung | **Package-Hygiene absegnen** (schnell abnickbar): `exports`-Reihenfolge, `sideEffects: false`, package-lokale Compiler-Flags, `konva/lib`-Imports, toten Code/Arbeitskommentare entfernen. | 2 |

Sofort startbar (parallel): Tickets 1, 2, 3.

## Offen / später

- Testsuite schreiben (nach Ticket 4).
- Schicksal von `konva-adapter-BAK`: löschen, oder vorher Test-Gold heben?
- Optionale Konfigurierbarkeit (Zoomfaktor, Resize-Handling).

## Bewusst außen vor

- Umsetzung der beschlossenen Refactorings (eigener Schritt nach diesem Plan).
- Neue Features: `fit`/`reset`-Intents (in `render-core` als todo markiert), `circle`/`polygon`/`triangle` fertig implementieren — sofern Ticket 2 nichts anderes entscheidet.
- Monorepo-weite tsconfig-Modernisierung.
