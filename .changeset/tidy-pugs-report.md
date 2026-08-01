---
'@baustatik/fem-viewer': minor
---

Auflagerreaktionen werden gezeichnet.

`femSpecs` und `createFEMViewer` nehmen das Ergebnis eines gerechneten Lastfalls
entgegen (`reactions` beziehungsweise `getReactions`) und zeichnen je Knoten und
Komponente dasselbe Symbol wie eine Last — Pfeil für `fx`/`fz`, gebogener Pfeil
für `my`, Betrag im Label —, nur grün und in einem neuen obersten Band
`'reactions'`.

Die Reaktion ist die Kraft **auf das Tragwerk**, wie `SupportReaction` sie
definiert: eine Stütze unter einer Last nach unten trägt ein negatives `fz`, ihr
Pfeil zeigt nach oben, und damit ist `Σ Lasten + Σ Reaktionen = 0` im Bild
ablesbar. Kein Ergebnis (`undefined`) ist der Aus-Zustand und erzeugt keine
einzige Spec; einen Schalter daneben gibt es nicht.

Intern sind Pfeil, Bogen und Label von `loads/` nach `symbols/` gezogen, weil
Last und Reaktion sie sich teilen. `LoadStyle` bleibt unverändert; `ResultStyle`
kommt mit eigenen Schlüsseln dazu.

Neue Dependency: `@baustatik/fem-solver` (heute nur der Typ `SupportReaction`).
`N`/`V`/`M`-Verläufe fehlen weiterhin — sie brauchen zuerst ein Bezugsmaß über
alle Stäbe.
