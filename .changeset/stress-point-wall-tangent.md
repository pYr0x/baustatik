---
'@baustatik/cross-section': patch
---

Spannungspunkte tragen eine Wandtangente, und `Sy`/`Sz` haben echte Vorzeichen.

`StressPoint` bekommt `ty`, `tz` (Einheitstangente der Wand).
`Sy` und `Sz` sind jetzt das erste Flächenmoment des in `+s` **bereits
durchlaufenen** Teils; das Vorzeichen ist gerechnet statt gesetzt. Damit zeigen
die Anteile aus `Vz` und `Vy` in dieselbe Richtung und addieren sich
vorzeichenrichtig — vorher liefen `Sy` und `Sz` an demselben Punkt in
verschiedene Bezugsrichtungen und trugen ein pauschales Minus, was jede
Überlagerung zweier Querkräfte unmöglich machte (und `Mt` erst recht).

**Breaking für Leser, die auf das Vorzeichen bauen** (die Beträge sind
unverändert, die Nummerierung ebenfalls):

- offenes I/T und gewalztes Profil: die Vorzeichen folgen der Wandtangente. Wie
  sie im Einzelnen fallen, steht im Changeset zu ADR 0059 daneben — es setzt
  hier auf und macht die Tangente je Wandelement fest.
- Kasten: die Vorzeichen folgen jetzt dem Umlauf und stimmen dadurch Zeichen für
  Zeichen mit dem gedruckten Ausdruck überein.

Neu: Gleichgewichtsproben (Integration des Schubflusses gegen die eingesetzte
Querkraft) und Vorzeichentests. Siehe ADR 0058.
