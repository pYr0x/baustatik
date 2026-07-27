---
"@baustatik/fem": major
"@baustatik/fem-solver": minor
---

Gelenke heißen jetzt lokal und gibt es in allen drei Freiheitsgraden.

`Beam.releases` trug mit `phiY` den Namen der KNOTENwelt für eine Bedingung, die
am **lokalen** Freiheitsgrad definiert ist — der Solver kondensiert sie aus der
lokalen 6x6 heraus, vor der Drehung. Aufgefallen ist das nie, weil eine Drehung
in der Ebene rahmeninvariant ist: `phiY` und `theta` unterscheiden sich nur im
Vorzeichen, und ein Freisetzungs-Flag ist ein `true` und trägt kein Vorzeichen.
Bei einer Verschiebung hört das auf — auf einem schrägen Stab ist ein Gleiten
längs der Stabachse etwas anderes als ein globales `ux`.

- **Breaking**: `{ phiY?: true }` heißt jetzt `BeamEndReleases = { u?: true;
  w?: true; theta?: true }`, mit den lokalen Namen aus `@baustatik/fem-element`
  (`d_e = [u1, w1, theta1, u2, w2, theta2]`) — dieselbe Reihenfolge wie die
  Kondensationsindizes 0/1/2 und 3/4/5 im Solver. Migration: `phiY` → `theta`.
  Der Zeitpunkt ist bewusst gewählt: `releases` kommt außerhalb von `fem`,
  `fem-solver` und deren Tests nirgends vor, nichts speichert es, und die Demo
  kann es noch gar nicht setzen.
- **Neu**: `u` (Normalkraftgelenk) und `w` (Querkraftgelenk). Nicht nach der
  nicht übertragenen Schnittgröße `{ N, V, M }` benannt, obwohl das näher am
  Sprachgebrauch läge: die Kondensation arbeitet an Freiheitsgraden, und ein
  zweites Vokabular davor wäre eine Übersetzung ohne Gegenwert
  ([ADR 0017](../docs/adr/0017-releases-are-named-in-the-local-frame.md)).
- Eine freigesetzte VERSCHIEBUNG nimmt dem Stab die betreffende Steifigkeit
  ganz, nicht nur am freigesetzten Ende: nach der Kondensation von `u1` ist
  `K[u2][u2] = EA/L - (EA/L)^2/(EA/L)` exakt 0. Fachlich richtig — ein Stab, der
  an einer Stelle gleitet, trägt nirgends Normalkraft. Folge davon ist, dass ein
  zweites `u`-Gelenk am anderen Ende einen Pivot von exakt 0 trifft;
  `condense` kehrt dort still zurück. Dieser Zweig galt bisher als Schutz gegen
  „widersprüchliche Eingaben" und wurde von nichts erreicht — er hat jetzt einen
  ehrlichen Kommentar und einen Test.
- Verboten wird nichts. Aus demselben Grund, mit dem der Pendelstab ausdrücklich
  erlaubt ist: ein längs gleitender Stab überträgt weiterhin Querkraft und
  Moment und ist für sich kein Mechanismus. Ob das System kinematisch wird,
  entscheidet das Gleichungssystem.
