---
'@baustatik/cross-section': patch
'@baustatik/cross-section-viewer': patch
'@baustatik/script': patch
---

Die Bewehrung wohnt am Vollquerschnitt (ADR 0064)

`CrossSection` bekommt an den Varianten `shape` und `section-geometry` ein
optionales Feld `reinforcement: readonly ReinforcementLayer[]`. Eine Lage ist
eine benannte Gruppe und **ist** der Bewehrungsrang; ein Element trägt `y`/`z`
in mm, `As` und ein optionales `Asmax` in cm². Kein Material, keine Güte, keine
Festigkeit erreicht den Satz.

**Die Querschnittswerte ändern sich nicht.** `sectionProperties` liest das Feld
nicht, `computeFESectionValues` kann es nicht sehen (jene Tür nimmt eine
`SectionGeometry`, eine Ebene tiefer), und `@baustatik/cross-section-fe` ist um
keine Zeile berührt. Das eingegebene `As` ist der Anfangswert einer Iteration,
keine Aussage über den fertigen Querschnitt.

Neu in `@baustatik/cross-section`: die Typen `ReinforcementElement` und
`ReinforcementLayer`, die dritte Gate-Tür `validateReinforcement(cs, policy)`
mit sechs benannten Befunden, und die Weiche `isSolid`/`isSolidGeometry` — eine
Zusammenführung von drei ausgeschriebenen Kopien, kein Zuwachs.

Neu in `@baustatik/cross-section-viewer`: die Bande `'rebar'` zwischen
`'outlines'` und `'fe'`, gespeist vom vierten Pull `getReinforcement`. Sie ist
Eingabe und kein Ergebnis; `undefined` heisst dort „keine Bewehrung".

**Bruch:** `schemaVersion` steigt in `@baustatik/script` von 14 auf 15. Eine
v14-Datei ist am Satz und an der Bedeutung unverändert — sie hat schlicht keine
Bewehrung — und wird trotzdem abgelehnt: `exactKeys` ist eine Whitelist, und
das Repo lehnt ab statt zu migrieren (ADR 0027). Ein Lauf schreibt sie neu.

`CROSS_SECTION_LAYERS` ist von fünf auf sechs Einträge gewachsen; das Tupel ist
`as const` und für Aufrufer nicht breaking.
