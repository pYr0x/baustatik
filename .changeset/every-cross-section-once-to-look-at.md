---
'@baustatik/cross-section': patch
---

Ein `examples/`-Ordner zeigt jede Querschnittsart einmal — zum Ansehen, nicht
zum Pruefen.

`pnpm --filter @baustatik/cross-section example` baut das Package und druckt fuer
Rechteck, geschweisstes I (beide Idealisierungen), T-Querschnitt (Plattenbalken
und Stahl-T), Kasten und Walzprofil die Querschnittswerte, kappa und die
Spannungspunkte. Es behauptet nichts und faellt nicht um: die Zusicherungen
stehen weiter in `tests/`. Was hier dazukommt, ist die AUFRUFSEITE — wie ein
`CrossSection` entsteht und was `sectionProperties` und `stressPoints` darauf
zurueckgeben, einschliesslich der beiden Faelle, in denen das `undefined` ist.

Der Ordner wird von `typecheck` mitgeprueft (`examples/tsconfig.json`), damit
ein Beispiel nicht unbemerkt veralten kann.
