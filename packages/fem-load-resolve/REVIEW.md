# Code Review: `@baustatik/fem-load-resolve`

Review-Basis: Diff zwischen `HEAD~2` (`9626793`) und `HEAD`.

## Standards

1. **Niedrig — dokumentierte Standardverletzung** — `src/resolve.ts:41`, `src/resolve.ts:227`  
   `AGENTS.md` verlangt, dass Kommentare das **Warum** erklären, statt das **Was** zu wiederholen. Diese Kommentare paraphrasieren lediglich die Deklarationen:
   > `/** Die Lastarten mit Ausdehnung. Die Einzellast hat keine. */`  
   > `/** Anfang und Ende eines Lastabschnitts entlang der lokalen x-Achse. */`

   Sie sollten entfernt oder durch nicht offensichtliche Begründungen ersetzt werden.

2. **Niedrig — dokumentierte Standardverletzung** — `tests/resolve.test.ts:49`  
   Auch der Kommentar des Test-Helpers wiederholt nur dessen Verhalten und widerspricht damit derselben Konvention aus `AGENTS.md`:
   > `/** Die lokalen Streckenlast-Komponenten des einzigen Segments eines Stabes. */`

3. **Niedrig — Ermessensfrage: Repeated Switches** — `src/resolve.ts:150`, `src/resolve.ts:201`  
   Der Dispatch über `distribution` wird unabhängig für Kräfte und Momente wiederholt:
   > `if (load.distribution === 'point')`  
   > `load.distribution === 'constant' ? [load.q, load.q] : ...`  
   > `if (load.distribution === 'point')`  
   > `load.distribution === 'constant' ? [load.m, load.m] : ...`

   Eine weitere Verteilungsart würde parallele Änderungen an beiden Stellen erfordern. Ein gemeinsamer Distribution-Dispatcher oder ein kleiner Helper könnte die Fallunterscheidung bündeln.

4. **Niedrig — Ermessensfrage: Mysterious Name** — `tests/resolve.test.ts:35`  
   > `const S = Math.SQRT1_2;`

   `S` erklärt seine geometrische Rolle nicht. Ein Name wie `SIN_45` oder `FORTY_FIVE_DEGREE_COMPONENT_FACTOR` würde die Assertions verständlicher machen.

## Spec

1. **Mittel — die veröffentlichte TypeScript-API ist für NodeNext-Consumer nicht verwendbar** — `src/index.ts:1`, `package.json:5`  
   `CONTEXT.md` verlangt:
   > „`LocalElementLoad` steht in der oeffentlichen Signatur und damit im publizierten `.d.ts`“  
   > „`src/index.ts`: `resolveLoads` und die zwei Typen, sonst nichts“

   `src/index.ts` verwendet jedoch relative Exporte ohne Dateiendung, während das Package ESM deklariert und auf die erzeugten Deklarationen verweist. Nach dem Build enthält `dist/index.d.ts` weiterhin Importe wie `./resolve` und `./types`.

   Ein Consumer mit `moduleResolution: "NodeNext"` und `skipLibCheck: false` erhält deshalb **TS2834**:
   > Relative import paths need explicit file extensions

   Dadurch können solche Consumer `resolveLoads`, `GlobalNodeLoad` und `ResolvedLoads` nicht über die veröffentlichte API verwenden.

## Zusammenfassung

- **Standards**: 4 Befunde (schwerwiegendste: 2 Dokumentations-/Kommentar-Konventionsverletzungen)
- **Spec**: 1 Befund (schwerwiegendste: unvollständige ESM/NodeNext-Declaration-Exportstruktur)
