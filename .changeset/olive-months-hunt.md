---
'@baustatik/cross-section': minor
---

Spannungspunkte: `stressPoints(cs)` liefert Ort, Dicke und die statischen
Momente `Sy`/`Sz` je Punkt.

Vier Vorlagen nach einer Regel — alle Ecken der Umrissfigur plus der
Schwerpunkt: Rechteck 5, Plattenbalken 9, geschweißtes I 15, Walzprofil 13.
Beim Walzprofil ist RSTABs gedruckte Nummerierung übernommen und durch einen
Test festgehalten; die Ausrundung wird integriert und reproduziert `A`, `Iy`
und `Sy,max` des ganzen Katalogs auf 0,05 %.

Für den geschlossenen Kasten gibt es noch keine Vorlage — `undefined`.
