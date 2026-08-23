---
'@baustatik/cross-section': patch
'@baustatik/cross-section-viewer': patch
---

Spannungspunkte liegen auf Wandelementen; der Verzweigungsknoten trägt zwei.

Jede Wand ist ein Element, orientiert in Richtung des Schubflusses aus einem
positiven `Vz`. `Sy` und `Sz` sind das erste Flächenmoment des auf DIESEM
Element bereits durchlaufenen Teils. Am Gurtpunkt auf der Stegachse stehen
deshalb ZWEI Punkte: gleicher Ort, gleiches `t`, verschiedenes Element, gleiches
`Sy`, entgegengesetztes `Sz`. Siehe
[ADR 0059](../docs/adr/0059-the-stress-point-lies-on-a-wall-element.md).

**Breaking:**

- `StressPoint.branched` **entfällt**. Es war exakt nur bei Spiegelsymmetrie zur
  `z`-Achse — bei ungleichen Ästen konnte `|Vz*Sy/Iy| + |Vy*Sz/Iz|` den anderen
  Ast unterschätzen. Statt des Flags nimmt ein Nachweis jetzt das Maximum über
  die beiden Punkte des Knotens. `WallDirection.branched` und `BRANCH_ALONG_Y`
  gehen mit; neu sind `AGAINST_Y` und `AGAINST_Z`.
- `StressPoint.wall: string` ist **neu** und pflicht: die Id des Elements
  (`flange-top-left`, `web`, `corner-top-right`, …). Zwei Punkte am selben Ort
  unterscheiden sich genau hierin.
- **Punktzahl:** geschweisstes I und Walzprofil 13 → **15**, T 9 → **10**.
  Kasten unverändert 16 — er hat keinen Verzweigungsknoten.
- **Nummerierung:** fällt aus der Laufreihenfolge und ist kein Vertrag mehr
  gegenüber dem gedruckten Katalogblatt. `nr` bleibt eindeutig je Liste und
  bleibt die Identität eines Punktes.
- **Vorzeichen:** `Sy` ist an allen Gurtpunkten negativ und kippt nicht mehr an
  der Stegachse; `Sz` kippt jetzt dort. Beim Walzprofil kippen die gedruckten
  Punkte 4, 7 und 8 damit auf die Werte des Ausdrucks zurück — er stimmt jetzt
  an allen 13 Werten Zeichen für Zeichen. Die BETRÄGE sind unverändert, alle 546
  Referenzwerte ebenso.

`@baustatik/cross-section-viewer` zeichnet je Ort einen Marker statt zweier
deckungsgleicher.
