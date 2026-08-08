---
'@baustatik/geometry-2d': patch
'@baustatik/section-geometry': patch
'@baustatik/cross-section': patch
'@baustatik/cross-section-viewer': patch
'@baustatik/script': patch
---

Der Umriss des gezeichneten Querschnitts entsteht jetzt aus dem **Wandgraphen**
— P3, [ADR 0037](../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md).
`kind: 'midline'` ist damit vollständig benutzbar: zeichnen, ableiten, rechnen,
prüfen.

**Nach ADR 0036 ist das ein `patch`; die Brüche stehen hier im Text.**

## Additiv

- **`@baustatik/geometry-2d`: `Polygon.inflate(paths, options)`** — weitet
  offene oder geschlossene **Züge** um ein `delta` je Zug auf und vereinigt sie
  zu einer **Ringmenge mit Löchern** (aussen `signedArea > 0`, Loch `< 0`,
  sortiert nach `|A|`, jedes Loch unmittelbar hinter seinem Aussenring). Neue
  Typen `InflatePath`, `InflateOptions`, `InflateEndType`, neue Konstante
  `OFFSET_PRECISION`. Neue Abhängigkeit **`clipper2-ts`, exakt gepinnt** — die
  zweite Clipping-Bibliothek des Packages; martinez bleibt für
  `union`/`intersect`/`subtract` unberührt. Das ist bewusst kein Endzustand
  (`packages/TODO.md` §5).
- **`@baustatik/section-geometry`: `Polygon.inflate`** in `y`/`z`
  durchgereicht, samt `InflatePathYZ` und den koordinatenfreien Optionstypen.
- **`@baustatik/cross-section`**: `deriveOutline(geometry, policy)` als die EINE
  Tür über beide Varianten, `deriveOutlineFromWalls` dahinter,
  `createSectionGeometry(input, policy)` als Fabrik, `branches(nodes, walls)`
  und der Typ `Branch` (die Zerlegung, die P5 für den Wandweg braucht).
- **`@baustatik/script`**: `crossSection({ kind: 'section-input', input })` —
  der Bauer leitet den Umriss unter seiner eigenen `SectionPolicy` ab, statt ihn
  entgegenzunehmen.

## Breaking

- **`@baustatik/cross-section`: `SectionPolicy` hat ein drittes Pflichtfeld**,
  `miterLimit` (dimensionslos, Default `2`, muss `> 1` sein — Clipper2 ersetzt
  jeden Wert bis `1` still durch `2`). Es verändert den GESPEICHERTEN Umriss und
  ist damit nach ADR 0033 eine Erzeugungs- und keine Analyse-Einstellung.
  `parseSectionPolicy` lehnt jeden Satz ohne das Feld ab.
- **`@baustatik/cross-section`: drei neue Befunde des Gates.**
  `OutlineDriftWarning` (der mitgeführte Umriss weicht von seiner Neuableitung
  ab, Schranke `arcTolerance · U` — für **beide** Varianten, der `outline`-Zweig
  bekommt damit erstmals eine Prüfung), `MiterLimitExceededWarning` (ein
  durchverbundener Stoss, dessen Umrissecke gekappt wird) und
  `NonFiniteBulgeError` (die offene Lücke aus P1). Wer die Befundlisten
  auszählt, zählt ab jetzt anders.
- **`@baustatik/script`: `schemaVersion` steht auf `9`.** Jede v8-Datei wird
  abgelehnt, ohne Migrationswerkzeug und aus demselben Grund wie bei v5 bis v8:
  eine eingesetzte Voreinstellung behauptete, der Umriss sei unter ihr
  entstanden.

## Sonst

- **`@baustatik/cross-section-viewer`** zeichnet den Umriss **orange**, die
  Wandmittellinien bleiben schwarz. Dass der Umriss abgeleitet und die Wände die
  Eingabe sind, ist eine Aussage des Viewers und keine Option am Aufruf.
