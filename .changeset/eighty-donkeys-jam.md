---
'@baustatik/steel-profiles': minor
---

Neues Blatt-Package: der Walzprofil-Katalog.

18 IPE und 24 HEA als eingecheckte Datendateien, erzeugt aus dem
RSTAB-Ausdruck durch `scripts/extract.ts`. `lookupProfile(id)` findet
schreibweisentolerant (`'IPE200'`, `'ipe  200'`) und liefert `undefined`
statt zu werfen — null Dependencies, auch keine auf `@baustatik/errors`.

Die Zahlen sind **tabelliert, nicht nachgerechnet**, und stehen in
Norm-Einheiten (mm, cm², cm⁴). Die Schubflaechen sind `Ay`/`Az` der
schubweichen Theorie, nicht `Av` nach EC 3 und nicht `Apl`.
