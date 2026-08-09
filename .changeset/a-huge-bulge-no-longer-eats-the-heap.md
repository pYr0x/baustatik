---
'@baustatik/geometry-2d': patch
'@baustatik/section-geometry': patch
'@baustatik/cross-section': patch
---

Eine **endliche, aber riesige Wölbung** bringt die Umriss-Ableitung nicht mehr
zum Absturz, und die Zerlegung eines Bogens bleibt in jedem Fall endlich.

**Nach [ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md)
ist das ein `patch`; die Brüche stehen hier im Text.**

## Der Defekt

`Wall.bulge = 1e14` ist endlich, beschreibt aber einen fast vollen Kreis mit
`2,5·10^15 mm` Radius durch zwei Punkte, die `100 mm` auseinanderliegen.
`deriveOutline` filterte nur `Number.isFinite` weg und reichte den Rest an
`Bulge.toPolyline` weiter. Dahinter rechnete `Arc.toPolyline` seine Segmentzahl
aus `acos(1 − tol/R)` — bei `tol/R < 2^-53` wird das Argument zu `1`, `acos(1)`
zu `0` und die Segmentzahl zu `Infinity`. Die Schleife lief in den Heap, bis der
Prozess starb. Bei `bulge = 1e308` lief zusätzlich der Radius über: `Arc.make`
liess `NaN` durch, weil jeder Vergleich mit `NaN` falsch ist, und der `NaN`
stand danach in jedem Punkt des Umrisses.

Getroffen war auch das **Gate**: es leitet den Umriss für die Drift-Prüfung neu
ab, `validateSectionGeometry` starb also am selben Wert, statt ihn zu melden.

## Additiv

- **`Bulge.isDiscretisable(chordLength, bulge, tolerance)`** in
  `@baustatik/geometry-2d` und `@baustatik/section-geometry` — total, und die
  Frage vor dem Wurf: sie verneint die nicht endliche Wölbung UND die, deren
  Bogen sich unter der Toleranz nicht mehr in `MAX_ARC_SEGMENTS` Punkte zerlegen
  lässt.
- **`MAX_ARC_SEGMENTS = 100 000`** in `@baustatik/geometry-2d` — ein
  Speicherschutz, keine Feinheitsgrenze.
- **`UndiscretisableBulgeError`** in `@baustatik/cross-section` — der
  Gate-Befund zur zweiten Sorte, neben `NonFiniteBulgeError`.
- **`BulgeSite`** in `@baustatik/cross-section` — der Ort einer Wölbung, Wand
  oder Ring-Punkt. Das Gate prüft `Vertex.bulge` damit erstmals überhaupt:
  G6b sah bisher nur `geometry.walls`, obwohl der `outline`-Zweig dieselbe Zahl
  mit derselben Bedeutung trägt.

## Brüche

- **`Arc.toPolyline` wirft `InvalidArcError`**, wenn die verlangte Segmentzahl
  `MAX_ARC_SEGMENTS` überschreitet — auch bei einer von Hand gesetzten
  `segments`-Option. Vorher belegte derselbe Aufruf Speicher, bis der Prozess
  starb.
- **`Arc.make` wirft bei nicht endlichem `radius` oder `sweep`.** Vorher kam ein
  `NaN` durch beide Schranken.
- **`Arc.toPolyline` rechnet die Segmentzahl stabil** über
  `2·asin(√(tol/2R))` statt `acos(1 − tol/R)`. Algebraisch dieselbe Zahl; für
  jeden Radius, an dem beide auflösen, kommt dieselbe Punktzahl heraus.
- **`deriveOutline` liest eine unbrauchbare Wölbung als Gerade** — in BEIDEN
  Zweigen. Der Ringzweig warf dabei bisher sogar bei `bulge: NaN`, und weil das
  Gate für die Drift-Prüfung neu ableitet, starb `validateSectionGeometry` an
  dem Wert, statt ihn zu melden.
- **`NonFiniteBulgeError` und `UndiscretisableBulgeError` tragen `at: BulgeSite`
  statt `wallId: string`.** Wer die betroffene Wand markiert, fragt jetzt
  `error.at.kind === 'wall'` — und bekommt dafür den Ring-Punkt mit, den es
  vorher gar nicht als Befund gab.

## Nebenbei

- `@baustatik/cross-section` hängt jetzt an `@baustatik/core`, ausschliesslich
  für `atOrThrow`: die Zerlegung des Wandgraphen indizierte über Invarianten und
  machte aus deren Bruch ein stilles `continue`.
- `pairKey` trennt die beiden Wand-Ids mit einem als Escape geschriebenen
  NUL statt mit dem rohen Byte im Quelltext, das `grep` die Datei für binär
  halten liess. Dieselbe Zeichenkette, nur sichtbar.
