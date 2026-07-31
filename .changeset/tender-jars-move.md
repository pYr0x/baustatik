---
'@baustatik/material': patch
---

`STEEL_SHEAR_MODULUS` ist der **exakte** Quotient `E/(2(1+ν)) = 210000/2,6 =
80769,23`, auf ganze MPa gerundet — nicht die 81000, die EN 1993-1-1 §3.2.6
druckt und die die meisten Tabellen wiederholen. Der Normwert ist gerundet; wir
runden nicht, weil `G` in eine Rechnung geht (`GAs = κ·G·A`) und nicht in einen
Ausdruck.

Der Zahlenwert selbst stand schon so im Code; neu ist der Kommentar, der ihn
davor bewahrt, als Tippfehler „korrigiert" zu werden.
