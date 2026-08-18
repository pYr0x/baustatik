---
'@baustatik/cross-section': patch
---

Die Spannungspunkte der parametrischen Formen liegen neu, und ihr `S` ist neu
gerechnet. `A`, `Iy`, `Iz`, `zs`, `It`, `zM` und **κ** sind unveraendert.

**Der geschlossene Kasten hat Spannungspunkte** — 16 Stueck, und `S` ist an den
zwoelf Wandpunkten EXAKT statt genaehert: die Waende parkettieren die
Umrissfigur, statt auf der Mittellinie zu liegen, und die vier Aussenecken
tragen den Gehrungswert
([ADR 0051](https://github.com/pYr0x/baustatik/blob/main/docs/adr/0051-the-closed-box-tiles-the-outline-figure.md)).
Das reine Mittellinienmodell lag je passierter Ecke um `t³/8` daneben.

**Das geschweisste I und das T sind neu gelegt**
([ADR 0052](https://github.com/pYr0x/baustatik/blob/main/docs/adr/0052-stress-points-sit-on-the-extreme-fibre.md)).
`S` und `t` gehoeren zum SCHNITT, die Koordinate gehoert zu sigma — also wird
ein Schnitt an der Faser mit dem groessten `|z|` benannt. Die
Verschneidungsschnitte sitzen damit auf der AUSSENfaser des Gurts (gleiches `S`,
gleiches `t`, 19 % mehr sigma), und beide Formen haben endlich einen Punkt IM
STEG unter dem Gurt, wo `tau` um `tf/tw` springt. Das I hat dadurch **13 statt
15 Punkte, mit der Nummerierung des gewalzten Profils**; das T bleibt bei 9.

**`S` kachelt jetzt auch bei I und T die Umrissfigur**
([ADR 0053](https://github.com/pYr0x/baustatik/blob/main/docs/adr/0053-the-stress-point-walls-tile-the-outline.md)).
Der Steg beginnt an der Gurtunterkante statt an der Gurtmittellinie, und `S`
laeuft um den Schwerpunkt der Umrissfigur — dieselbe Achse, um die sigma
rechnet. Beim unsymmetrischen T verschwindet damit der Versatz `zs − zsWall`
von 0,88 mm, der an jedem Punkt 1,2 % gekostet hat; fuer ein T 200/15/10/300
steht an der Stegoberkante jetzt 219,231 statt 216,598 cm³ und am Schwerpunkt
240,732 statt 242,658. Beim I aendert sich nur der Schwerpunktpunkt, 11,60 →
11,25 cm³ bei IPE-80-Massen — die Naehe der alten Zahl zum Katalogwert 11,61
war Zufall, denn der gehoert zum GEWALZTEN Profil und enthaelt dessen
Ausrundungen.

Das geschweisste I trifft das gewalzte Profil bei `r = 0` damit an **allen 13
Punkten** auf das letzte Bit.

**κ behaelt die Mittellinienabwicklung**, und das ist gemessen und nicht
gesetzt: gekachelt laege `Az` ueber alle 42 IPE- und HEA-Profile UEBER dem
Katalog, was fuer ein Profil ohne Ausrundung nicht sein kann.
