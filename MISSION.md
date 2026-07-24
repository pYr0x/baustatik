# Mission: Konsistente Lastabbildung für 2D-Stab-FEM

## Why
Im baustatik-Monorepo soll ein eigener, mathematisch nachvollziehbarer 2D-Rahmenstab-Solver entstehen. Manuelle und später automatisch erzeugte Stablasten müssen deshalb zuverlässig in Element- und globale Knotenlastvektoren überführt werden.

## Success looks like
- Punkt-, Gleich-, Teil- und linear veränderliche Stablasten als konsistente Elementlastvektoren formulieren.
- Lokale Lastvektoren korrekt in globale Freiheitsgrade transformieren und assemblieren.
- Ergebnisse über Gleichgewicht, Grenzfälle und Referenzlösungen automatisiert prüfen.

## Constraints
- Umsetzung in TypeScript innerhalb des bestehenden pnpm-Monorepos.
- Das Strukturmodell verwendet die x/z-Ebene mit positiver z-Richtung nach unten.
- Zunächst lineare, ebene Rahmenstäbe; die konkrete Balkentheorie muss je Element festgelegt werden.

## Out of scope
- Geometrisch nichtlineare Folgelasten, Dynamik sowie Flächen- und Volumenelemente.
