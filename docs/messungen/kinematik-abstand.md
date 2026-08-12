# Kinematik: der Abstand zwischen tragfähig und Mechanismus

<!-- ERZEUGT von packages/fem-solver/tests/kinematics-margin.test.ts.
     Nicht von Hand bearbeiten — der nächste Testlauf überschreibt die Datei. -->

Beleg-Artefakt zu
[ADR 0016](../adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md).

Gemessen mit der echten `Timoshenko2D`-Formulierung, echten Walzprofilen
(IPE 80 / HEB 200 / HEB 600, S235: `E = 210e6 kN/m²`, `G = 81e6 kN/m²`) und den
**produktiven Lösern**: `@baustatik/linear-solver-wasm` (dichtes `Llt` von
`faer`) und `@baustatik/sparse-solver-wasm` (dünnbesetztes Cholesky mit
AMD-Umordnung), beide mit derselben Jacobi-Skalierung und derselben
Pivot-Schwelle `1e-12`. Der Unterschied zum Port-Vertrag ist ein Nebenkanal:
das kleinste skalierte Pivot melden beide Crates **auch im gelungenen Fall**,
und genau dieser Wert steht in den Tabellen.

**Jedes System läuft über beide Rechenwege** (`linearSystem: 'dense'` und
`'sparse'`, [ADR 0043](../adr/0043-the-solver-is-an-analysis-setting.md)), und
die Tabellen führen beide Pivot-Spalten. Verglichen werden damit die beiden
**Zerlegungen**, die die Anwendung wirklich rechnet — nicht zwei Wege durch
dieselbe nachgebaute Elimination. Was die beiden trennt, ist die
Operationsreihenfolge: AMD ordnet um, fill-in ändert, wie viele Beiträge in
einen Eintrag summiert werden, und beides verschiebt die Rundung.

**Damit ist die Schwelle `1e-12` für BEIDE Wege belegt** und nicht nur für den
dichten: das kleinste Pivot der tragfähigen Menge liegt dicht bei
2.39e-5 und dünnbesetzt bei 6.78e-6 — auf
beiden Wegen sieben Größenordnungen über der Schwelle. Die AMD-Umordnung
verschiebt die Zahl, sie verschiebt sie aber nicht in die Nähe des Abbruchs.

Beide Crates lesen dabei **nur das untere Dreieck** — das dichte über
`Llt(Side::Lower)`, das dünnbesetzte über die Triplets. Die Nicht-Symmetrie in
der letzten Stelle, die `rotateStiffness` eintragsweise erzeugt, erreicht die
Zerlegung deshalb auf keinem der beiden Wege; sie ist NICHT der Grund für die
Abweichungen weiter unten.

**Die Verformungsprüfung ist dabei abgeschaltet.** Gemessen wird der Zustand
davor — die drei Netze aus [ADR 0012](../adr/0012-kinematics-is-detected-by-the-solver.md)
allein. Mit den Grenzen, die aus dieser Messung hervorgegangen sind, bewiese sie
nur sich selbst.

117 stabile Systeme, 132 kinematische. Jedes
kinematische System ist per Konstruktion ein Mechanismus — `K_ff` ist dort exakt
rangdefizit, unabhängig von der gemessenen Zahl.

## Die Gegenüberstellung

**Durchgerutscht sind 33 von 132 kinematischen
Systemen** — die drei Netze melden dort `geloest` und liefern ein
Verformungsfeld. Gezählt wird auf dem DICHTEN Weg; welche der beiden Zerlegungen
strenger ist, steht im Abschnitt „Wo die beiden Wege sich uneins sind". Die
Zeilen unten vergleichen die stabile Menge mit genau diesen 33:
die übrigen sind bereits gefangen und sagen über die Trennschärfe nichts.

| Größe | stabil (117) | durchgerutscht kinematisch (33) | Abstand |
| --- | --- | --- | --- |
| min. Pivot (dicht) | 2.39e-5 … 7.10e-1 | 1.27e-12 … 5.42e-10 | 4.6 Dekaden |
| min. Pivot (dünn) | 6.78e-6 … 7.10e-1 | 7.37e-13 … 3.15e-10 | 4.3 Dekaden |
| max \|φ\| [rad] | 4.33e-7 … 1.19e+1 | 9.22e+9 … 3.89e+13 | 8.9 Dekaden |
| max \|u\|/L | 2.69e-6 … 1.59e+2 | 1.76e+10 … 9.28e+13 | 8.0 Dekaden |

**Die beiden Abstände sind nicht gleich zu lesen**, und das ist der eigentliche
Befund. Beim Pivot ist der Abstand kein Sicherheitsabstand, sondern eine
Eigenschaft dieses Korpus: das kleinste Pivot der stabilen Menge fällt mit der
Systemgröße und der Schlankheit, und hier stehen Systeme mit höchstens
60 Freiheitsgraden. Wer die Schwelle über
das größte durchgerutschte Pivot hebt, muss sie beim nächsten größeren Modell
wieder nachziehen — und trifft dann tragfähige Systeme.

| stabiles System mit dem kleinsten Pivot | DOF | min. Pivot |
| --- | ---: | ---: |
| Dreigelenkrahmen · IPE 80 · L = 20 m | 11 | 2.39e-5 |
| Rahmen 30 Grad · IPE 80 · L = 20 m | 6 | 6.81e-5 |
| Rahmen 45 Grad · IPE 80 · L = 20 m | 6 | 8.39e-5 |
| Dreigelenkrahmen · IPE 80 · L = 10 m | 11 | 9.56e-5 |
| Stockwerkrahmen (6 x 2) · IPE 80 · L = 5 m | 54 | 1.07e-4 |
| Rahmen 60 Grad · IPE 80 · L = 20 m | 6 | 1.18e-4 |
| Kragarm (20 Elemente) · IPE 80 · L = 20 m | 60 | 1.34e-4 |
| Kragarm (20 Elemente) · IPE 80 · L = 10 m | 60 | 1.60e-4 |

Bei der **Verformung** ist der Abstand dagegen keine Eigenschaft des Korpus,
sondern der Theorie: `rad` und `u/L` sind dimensionslos, und ein Ergebnis
oberhalb von rund `0.1` verlässt ohnehin den Gültigkeitsbereich der
Theorie I. Ordnung (`sin φ ≈ φ`, Gleichgewicht am unverformten System). Die
durchgerutschten Mechanismen liegen bei 9.22e+9 rad und darüber.
Das ist der Grund für die Verformungsprüfung als viertes Netz.

Die obere Kante der stabilen Menge setzen dabei nicht die schwierigen Systeme,
sondern die maßlos überlasteten — ein IPE 80 als 20-m-Kragarm unter 10 kN
rechnet linear-elastisch klaglos durch:

| stabiles System mit der größten Verformung | max \|φ\| [rad] | max \|u\|/L |
| --- | ---: | ---: |
| Kragarm (20 Elemente) · IPE 80 · L = 20 m | 1.19e+1 | 1.59e+2 |
| Kragarm · IPE 80 · L = 20 m | 1.19e+1 | 7.93e+0 |
| Dreigelenkrahmen · IPE 80 · L = 20 m | 5.05e+0 | 6.19e+0 |
| Kragarm · IPE 80 · L = 10 m | 2.97e+0 | 1.98e+0 |
| Kragarm (20 Elemente) · IPE 80 · L = 10 m | 2.97e+0 | 3.96e+1 |
| Einfeldtraeger · IPE 80 · L = 20 m | 1.49e+0 | 9.91e-1 |

Kein tragfähiges System des Korpus kommt in die Nähe von `1e3` — und keiner der
durchgerutschten Mechanismen bleibt darunter.

**Die beiden Größen sind aber nicht gleich robust.** Der 20-m-Kragarm steht
zweimal in der Tabelle, einmal als ein Element und einmal als zwanzig, mit
identischem `max |φ|` und `7.93e+0` gegen `1.59e+2` bei `max |u|/L`. Der Grund
ist die Bezugslänge: gemessen wird gegen den ANGEHÄNGTEN Stab, und der ist beim
unterteilten Kragarm zwanzigmal kürzer. `|u|/L` hängt damit an der Feinheit der
Eingabe, `|φ|` nicht. Für dieses Programm ist das folgenlos — ein Stab ist ein
Element, es wird nicht vernetzt —, aber es ist der Grund, warum die Verdrehung
und nicht die bezogene Verschiebung die belastbarere der beiden Größen ist.

## Wo die beiden Wege sich uneins sind

Auf den **117 tragfähigen** Systemen kommen dicht und dünnbesetzt
ausnahmslos zum selben Befund (0 Abweichungen). Bei den
kinematischen tun sie es nicht: **2 von
132** Systemen werden auf dem einen Weg gemeldet und auf dem
anderen gelöst.

Das ist kein Fehler in einer der beiden Fassungen, sondern derselbe Befund, den
[ADR 0016](../adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md)
schon beschreibt, nur an einer neuen Stelle. Beide Crates bekommen **dieselben
Zahlen** — die Assemblierung ist dieselbe, und beide lesen nur das untere
Dreieck. Verschieden ist die **Reihenfolge**, in der die Zerlegung sie
verrechnet: die dünnbesetzte Fassung ordnet mit AMD um und eliminiert in einer
anderen Folge, mit anderem fill-in. Bei einem tragfähigen System ist das
folgenlos — die letzte Stelle interessiert niemanden. Bei einem Mechanismus ist
das gemessene Pivot **reines Rundungsrauschen**, und über den Abbruch
entscheidet sein Vorzeichen; also entscheidet dort die letzte Stelle, und die
hängt an der Reihenfolge.

Von den 2 Abweichungen fängt der **dünnbesetzte** Weg 2 und der **dichte** 0.
Daraus folgt KEINE Rangfolge der beiden Zerlegungen: die Pivots liegen auf
beiden Seiten im Bereich `1e-12`, also dort, wo die Zahl nichts mehr misst. Wer
daraus „dünnbesetzt ist strenger" liest, hat Rauschen für ein Kriterium
gehalten — und genau das ist die Aussage von ADR 0016.

Alle Abweichungen liegen im Winkelsweep, also genau bei den Systemen,
deren wahres Pivot exakt 0 ist. Für die Anwendung ist das folgenlos: gemessen
wird hier **ohne** die Verformungsprüfung, und das vierte Netz fängt jeden
dieser Fälle — auf beiden Wegen.

| System | min. Pivot (dicht) | min. Pivot (dünn) | Befund dicht | Befund dünn |
| --- | ---: | ---: | --- | --- |
| Winkelsweep real 40 Grad · IPE 80 | 1.27e-12 | 7.37e-13 | geloest | SingularStiffnessMatrixError |
| Winkelsweep real 70 Grad · HEB 200 | 1.72e-12 | 9.97e-13 | geloest | SingularStiffnessMatrixError |

## Stabile Systeme

| System | DOF | A·L²/I | min. Pivot (dicht) | min. Pivot (dünn) | max \|φ\| [rad] | max \|u\|/L | Befund (3 Netze) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Kragarm · IPE 80 · L = 1 m | 3 | 9.54e+2 | 2.63e-1 | 2.63e-1 | 2.97e-2 | 2.02e-2 | geloest |
| Kragarm · IPE 80 · L = 3 m | 3 | 8.58e+3 | 2.51e-1 | 2.51e-1 | 2.68e-1 | 1.79e-1 | geloest |
| Kragarm · IPE 80 · L = 10 m | 3 | 9.54e+4 | 2.50e-1 | 2.50e-1 | 2.97e+0 | 1.98e+0 | geloest |
| Kragarm · IPE 80 · L = 20 m | 3 | 3.82e+5 | 2.50e-1 | 2.50e-1 | 1.19e+1 | 7.93e+0 | geloest |
| Kragarm · HEB 200 · L = 1 m | 3 | 1.37e+2 | 3.64e-1 | 3.64e-1 | 4.18e-4 | 3.28e-4 | geloest |
| Kragarm · HEB 200 · L = 3 m | 3 | 1.23e+3 | 2.65e-1 | 2.65e-1 | 3.76e-3 | 2.56e-3 | geloest |
| Kragarm · HEB 200 · L = 10 m | 3 | 1.37e+4 | 2.51e-1 | 2.51e-1 | 4.18e-2 | 2.79e-2 | geloest |
| Kragarm · HEB 200 · L = 20 m | 3 | 5.48e+4 | 2.50e-1 | 2.50e-1 | 1.67e-1 | 1.12e-1 | geloest |
| Kragarm · HEB 600 · L = 1 m | 3 | 1.58e+1 | 7.10e-1 | 7.10e-1 | 1.39e-5 | 2.40e-5 | geloest |
| Kragarm · HEB 600 · L = 3 m | 3 | 1.42e+2 | 3.62e-1 | 3.62e-1 | 1.25e-4 | 9.83e-5 | geloest |
| Kragarm · HEB 600 · L = 10 m | 3 | 1.58e+3 | 2.62e-1 | 2.62e-1 | 1.39e-3 | 9.43e-4 | geloest |
| Kragarm · HEB 600 · L = 20 m | 3 | 6.32e+3 | 2.53e-1 | 2.53e-1 | 5.57e-3 | 3.73e-3 | geloest |
| Einfeldtraeger · IPE 80 · L = 1 m | 6 | 2.38e+2 | 4.41e-1 | 4.60e-1 | 3.72e-3 | 2.65e-3 | geloest |
| Einfeldtraeger · IPE 80 · L = 3 m | 6 | 2.15e+3 | 3.83e-1 | 4.07e-1 | 3.34e-2 | 2.25e-2 | geloest |
| Einfeldtraeger · IPE 80 · L = 10 m | 6 | 2.38e+4 | 3.76e-1 | 4.01e-1 | 3.72e-1 | 2.48e-1 | geloest |
| Einfeldtraeger · IPE 80 · L = 20 m | 6 | 9.54e+4 | 3.75e-1 | 4.00e-1 | 1.49e+0 | 9.91e-1 | geloest |
| Einfeldtraeger · HEB 200 · L = 1 m | 6 | 3.43e+1 | 5.00e-1 | 5.00e-1 | 5.23e-5 | 5.97e-5 | geloest |
| Einfeldtraeger · HEB 200 · L = 3 m | 6 | 3.09e+2 | 4.49e-1 | 4.68e-1 | 4.70e-4 | 3.38e-4 | geloest |
| Einfeldtraeger · HEB 200 · L = 10 m | 6 | 3.43e+3 | 3.82e-1 | 4.07e-1 | 5.23e-3 | 3.51e-3 | geloest |
| Einfeldtraeger · HEB 200 · L = 20 m | 6 | 1.37e+4 | 3.77e-1 | 4.02e-1 | 2.09e-2 | 1.40e-2 | geloest |
| Einfeldtraeger · HEB 600 · L = 1 m | 6 | 3.95e+0 | 5.00e-1 | 3.67e-1 | 1.74e-6 | 8.53e-6 | geloest |
| Einfeldtraeger · HEB 600 · L = 3 m | 6 | 3.55e+1 | 5.00e-1 | 5.00e-1 | 1.57e-5 | 1.78e-5 | geloest |
| Einfeldtraeger · HEB 600 · L = 10 m | 6 | 3.95e+2 | 4.35e-1 | 4.55e-1 | 1.74e-4 | 1.23e-4 | geloest |
| Einfeldtraeger · HEB 600 · L = 20 m | 6 | 1.58e+3 | 3.91e-1 | 4.15e-1 | 6.96e-4 | 4.71e-4 | geloest |
| Zweifeldtraeger · IPE 80 · L = 1 m | 11 | 2.38e+2 | 2.50e-1 | 1.67e-1 | 1.95e-3 | 1.28e-3 | geloest |
| Zweifeldtraeger · IPE 80 · L = 3 m | 11 | 2.15e+3 | 2.50e-1 | 1.67e-1 | 1.68e-2 | 9.95e-3 | geloest |
| Zweifeldtraeger · IPE 80 · L = 10 m | 11 | 2.38e+4 | 2.50e-1 | 1.67e-1 | 1.86e-1 | 1.09e-1 | geloest |
| Zweifeldtraeger · IPE 80 · L = 20 m | 11 | 9.54e+4 | 2.50e-1 | 1.67e-1 | 7.43e-1 | 4.34e-1 | geloest |
| Zweifeldtraeger · HEB 200 · L = 1 m | 11 | 3.43e+1 | 2.50e-1 | 1.67e-1 | 3.80e-5 | 4.31e-5 | geloest |
| Zweifeldtraeger · HEB 200 · L = 3 m | 11 | 3.09e+2 | 2.50e-1 | 1.67e-1 | 2.49e-4 | 1.65e-4 | geloest |
| Zweifeldtraeger · HEB 200 · L = 10 m | 11 | 3.43e+3 | 2.50e-1 | 1.67e-1 | 2.63e-3 | 1.55e-3 | geloest |
| Zweifeldtraeger · HEB 200 · L = 20 m | 11 | 1.37e+4 | 2.50e-1 | 1.67e-1 | 1.05e-2 | 6.12e-3 | geloest |
| Zweifeldtraeger · HEB 600 · L = 1 m | 11 | 3.95e+0 | 2.50e-1 | 1.67e-1 | 2.47e-6 | 8.27e-6 | geloest |
| Zweifeldtraeger · HEB 600 · L = 3 m | 11 | 3.55e+1 | 2.50e-1 | 1.67e-1 | 1.14e-5 | 1.28e-5 | geloest |
| Zweifeldtraeger · HEB 600 · L = 10 m | 11 | 3.95e+2 | 2.50e-1 | 1.67e-1 | 9.11e-5 | 5.91e-5 | geloest |
| Zweifeldtraeger · HEB 600 · L = 20 m | 11 | 1.58e+3 | 2.50e-1 | 1.67e-1 | 3.52e-4 | 2.11e-4 | geloest |
| Rahmen 30 Grad · IPE 80 · L = 1 m | 6 | 1.27e+3 | 2.49e-2 | 2.49e-2 | 6.94e-4 | 3.11e-3 | geloest |
| Rahmen 30 Grad · IPE 80 · L = 3 m | 6 | 1.14e+4 | 3.00e-3 | 3.00e-3 | 6.29e-3 | 2.64e-2 | geloest |
| Rahmen 30 Grad · IPE 80 · L = 10 m | 6 | 1.27e+5 | 2.72e-4 | 2.72e-4 | 6.99e-2 | 2.91e-1 | geloest |
| Rahmen 30 Grad · IPE 80 · L = 20 m | 6 | 5.09e+5 | 6.81e-5 | 6.81e-5 | 2.80e-1 | 1.16e+0 | geloest |
| Rahmen 30 Grad · HEB 200 · L = 1 m | 6 | 1.83e+2 | 1.02e-1 | 1.02e-1 | 1.34e-5 | 6.91e-5 | geloest |
| Rahmen 30 Grad · HEB 200 · L = 3 m | 6 | 1.65e+3 | 1.92e-2 | 1.92e-2 | 8.92e-5 | 3.97e-4 | geloest |
| Rahmen 30 Grad · HEB 200 · L = 10 m | 6 | 1.83e+4 | 1.88e-3 | 1.88e-3 | 9.84e-4 | 4.12e-3 | geloest |
| Rahmen 30 Grad · HEB 200 · L = 20 m | 6 | 7.31e+4 | 4.73e-4 | 4.73e-4 | 3.94e-3 | 1.64e-2 | geloest |
| Rahmen 30 Grad · HEB 600 · L = 1 m | 6 | 2.11e+1 | 1.96e-1 | 1.96e-1 | 1.41e-6 | 9.52e-6 | geloest |
| Rahmen 30 Grad · HEB 600 · L = 3 m | 6 | 1.89e+2 | 9.93e-2 | 9.93e-2 | 4.00e-6 | 2.06e-5 | geloest |
| Rahmen 30 Grad · HEB 600 · L = 10 m | 6 | 2.11e+3 | 1.53e-2 | 1.53e-2 | 3.30e-5 | 1.45e-4 | geloest |
| Rahmen 30 Grad · HEB 600 · L = 20 m | 6 | 8.42e+3 | 4.04e-3 | 4.04e-3 | 1.31e-4 | 5.54e-4 | geloest |
| Rahmen 45 Grad · IPE 80 · L = 1 m | 6 | 1.91e+3 | 3.04e-2 | 3.04e-2 | 7.13e-4 | 4.20e-3 | geloest |
| Rahmen 45 Grad · IPE 80 · L = 3 m | 6 | 1.72e+4 | 3.69e-3 | 3.69e-3 | 6.90e-3 | 3.57e-2 | geloest |
| Rahmen 45 Grad · IPE 80 · L = 10 m | 6 | 1.91e+5 | 3.35e-4 | 3.35e-4 | 7.73e-2 | 3.94e-1 | geloest |
| Rahmen 45 Grad · IPE 80 · L = 20 m | 6 | 7.63e+5 | 8.39e-5 | 8.39e-5 | 3.10e-1 | 1.58e+0 | geloest |
| Rahmen 45 Grad · HEB 200 · L = 1 m | 6 | 2.74e+2 | 1.22e-1 | 1.22e-1 | 3.80e-6 | 9.07e-5 | geloest |
| Rahmen 45 Grad · HEB 200 · L = 3 m | 6 | 2.47e+3 | 2.36e-2 | 2.36e-2 | 8.97e-5 | 5.35e-4 | geloest |
| Rahmen 45 Grad · HEB 200 · L = 10 m | 6 | 2.74e+4 | 2.31e-3 | 2.31e-3 | 1.08e-3 | 5.58e-3 | geloest |
| Rahmen 45 Grad · HEB 200 · L = 20 m | 6 | 1.10e+5 | 5.83e-4 | 5.83e-4 | 4.34e-3 | 2.22e-2 | geloest |
| Rahmen 45 Grad · HEB 600 · L = 1 m | 6 | 3.16e+1 | 2.27e-1 | 2.27e-1 | 7.14e-7 | 1.19e-5 | geloest |
| Rahmen 45 Grad · HEB 600 · L = 3 m | 6 | 2.84e+2 | 1.19e-1 | 1.19e-1 | 1.17e-6 | 2.70e-5 | geloest |
| Rahmen 45 Grad · HEB 600 · L = 10 m | 6 | 3.16e+3 | 1.88e-2 | 1.88e-2 | 3.38e-5 | 1.95e-4 | geloest |
| Rahmen 45 Grad · HEB 600 · L = 20 m | 6 | 1.26e+4 | 4.97e-3 | 4.97e-3 | 1.43e-4 | 7.49e-4 | geloest |
| Rahmen 60 Grad · IPE 80 · L = 1 m | 6 | 3.82e+3 | 4.12e-2 | 4.12e-2 | 3.39e-3 | 6.33e-3 | geloest |
| Rahmen 60 Grad · IPE 80 · L = 3 m | 6 | 3.43e+4 | 5.15e-3 | 5.15e-3 | 3.08e-2 | 5.42e-2 | geloest |
| Rahmen 60 Grad · IPE 80 · L = 10 m | 6 | 3.82e+5 | 4.70e-4 | 4.70e-4 | 3.42e-1 | 5.98e-1 | geloest |
| Rahmen 60 Grad · IPE 80 · L = 20 m | 6 | 1.53e+6 | 1.18e-4 | 1.18e-4 | 1.37e+0 | 2.39e+0 | geloest |
| Rahmen 60 Grad · HEB 200 · L = 1 m | 6 | 5.48e+2 | 1.53e-1 | 1.53e-1 | 4.47e-5 | 1.31e-4 | geloest |
| Rahmen 60 Grad · HEB 200 · L = 3 m | 6 | 4.94e+3 | 3.22e-2 | 3.22e-2 | 4.29e-4 | 8.05e-4 | geloest |
| Rahmen 60 Grad · HEB 200 · L = 10 m | 6 | 5.48e+4 | 3.24e-3 | 3.24e-3 | 4.81e-3 | 8.46e-3 | geloest |
| Rahmen 60 Grad · HEB 200 · L = 20 m | 6 | 2.19e+5 | 8.16e-4 | 8.16e-4 | 1.92e-2 | 3.37e-2 | geloest |
| Rahmen 60 Grad · HEB 600 · L = 1 m | 6 | 6.32e+1 | 2.61e-1 | 2.61e-1 | 1.90e-6 | 1.54e-5 | geloest |
| Rahmen 60 Grad · HEB 600 · L = 3 m | 6 | 5.68e+2 | 1.49e-1 | 1.49e-1 | 1.34e-5 | 3.90e-5 | geloest |
| Rahmen 60 Grad · HEB 600 · L = 10 m | 6 | 6.32e+3 | 2.58e-2 | 2.58e-2 | 1.59e-4 | 2.94e-4 | geloest |
| Rahmen 60 Grad · HEB 600 · L = 20 m | 6 | 2.53e+4 | 6.93e-3 | 6.93e-3 | 6.40e-4 | 1.13e-3 | geloest |
| Dreigelenkrahmen · IPE 80 · L = 1 m | 11 | 9.54e+2 | 8.87e-3 | 2.56e-3 | 1.28e-2 | 1.61e-2 | geloest |
| Dreigelenkrahmen · IPE 80 · L = 3 m | 11 | 8.58e+3 | 1.05e-3 | 2.99e-4 | 1.14e-1 | 1.40e-1 | geloest |
| Dreigelenkrahmen · IPE 80 · L = 10 m | 11 | 9.54e+4 | 9.56e-5 | 2.71e-5 | 1.26e+0 | 1.55e+0 | geloest |
| Dreigelenkrahmen · IPE 80 · L = 20 m | 11 | 3.82e+5 | 2.39e-5 | 6.78e-6 | 5.05e+0 | 6.19e+0 | geloest |
| Dreigelenkrahmen · HEB 200 · L = 1 m | 11 | 1.37e+2 | 3.76e-2 | 1.29e-2 | 2.02e-4 | 2.97e-4 | geloest |
| Dreigelenkrahmen · HEB 200 · L = 3 m | 11 | 1.23e+3 | 6.81e-3 | 1.99e-3 | 1.62e-3 | 2.04e-3 | geloest |
| Dreigelenkrahmen · HEB 200 · L = 10 m | 11 | 1.37e+4 | 6.61e-4 | 1.88e-4 | 1.78e-2 | 2.18e-2 | geloest |
| Dreigelenkrahmen · HEB 200 · L = 20 m | 11 | 5.48e+4 | 1.66e-4 | 4.71e-5 | 7.10e-2 | 8.71e-2 | geloest |
| Dreigelenkrahmen · HEB 600 · L = 1 m | 11 | 1.58e+1 | 7.38e-2 | 3.39e-2 | 1.36e-5 | 3.08e-5 | geloest |
| Dreigelenkrahmen · HEB 600 · L = 3 m | 11 | 1.42e+2 | 3.65e-2 | 1.25e-2 | 6.03e-5 | 8.86e-5 | geloest |
| Dreigelenkrahmen · HEB 600 · L = 10 m | 11 | 1.58e+3 | 5.41e-3 | 1.57e-3 | 5.98e-4 | 7.48e-4 | geloest |
| Dreigelenkrahmen · HEB 600 · L = 20 m | 11 | 6.32e+3 | 1.42e-3 | 4.05e-4 | 2.37e-3 | 2.92e-3 | geloest |
| Sprengwerk · IPE 80 · L = 1 m | 10 | 2.65e+2 | 3.50e-1 | 2.49e-1 | 1.36e-4 | 1.12e-4 | geloest |
| Sprengwerk · IPE 80 · L = 3 m | 10 | 2.38e+3 | 3.36e-1 | 2.43e-1 | 1.58e-4 | 1.17e-4 | geloest |
| Sprengwerk · IPE 80 · L = 10 m | 10 | 2.65e+4 | 3.34e-1 | 2.42e-1 | 1.61e-4 | 1.18e-4 | geloest |
| Sprengwerk · IPE 80 · L = 20 m | 10 | 1.06e+5 | 3.33e-1 | 2.42e-1 | 1.61e-4 | 1.18e-4 | geloest |
| Sprengwerk · HEB 200 · L = 1 m | 10 | 3.81e+1 | 3.68e-1 | 2.60e-1 | 6.48e-6 | 1.00e-5 | geloest |
| Sprengwerk · HEB 200 · L = 3 m | 10 | 3.43e+2 | 3.46e-1 | 2.48e-1 | 1.32e-5 | 1.11e-5 | geloest |
| Sprengwerk · HEB 200 · L = 10 m | 10 | 3.81e+3 | 3.35e-1 | 2.43e-1 | 1.55e-5 | 1.15e-5 | geloest |
| Sprengwerk · HEB 200 · L = 20 m | 10 | 1.52e+4 | 3.34e-1 | 2.43e-1 | 1.57e-5 | 1.16e-5 | geloest |
| Sprengwerk · HEB 600 · L = 1 m | 10 | 4.39e+0 | 3.81e-1 | 2.70e-1 | 4.33e-7 | 2.69e-6 | geloest |
| Sprengwerk · HEB 600 · L = 3 m | 10 | 3.95e+1 | 3.67e-1 | 2.60e-1 | 1.89e-6 | 2.91e-6 | geloest |
| Sprengwerk · HEB 600 · L = 10 m | 10 | 4.39e+2 | 3.44e-1 | 2.47e-1 | 3.96e-6 | 3.24e-6 | geloest |
| Sprengwerk · HEB 600 · L = 20 m | 10 | 1.75e+3 | 3.37e-1 | 2.44e-1 | 4.39e-6 | 3.31e-6 | geloest |
| Kragarm (20 Elemente) · IPE 80 · L = 3 m | 60 | 2.15e+1 | 5.08e-4 | 1.44e-1 | 2.68e-1 | 3.57e+0 | geloest |
| Kragarm (20 Elemente) · IPE 80 · L = 10 m | 60 | 2.38e+2 | 1.60e-4 | 7.47e-2 | 2.97e+0 | 3.96e+1 | geloest |
| Kragarm (20 Elemente) · IPE 80 · L = 20 m | 60 | 9.54e+2 | 1.34e-4 | 6.57e-2 | 1.19e+1 | 1.59e+2 | geloest |
| Kragarm (20 Elemente) · HEB 200 · L = 3 m | 60 | 3.09e+0 | 3.79e-3 | 2.29e-1 | 3.76e-3 | 5.12e-2 | geloest |
| Kragarm (20 Elemente) · HEB 200 · L = 10 m | 60 | 3.43e+1 | 4.78e-4 | 1.41e-1 | 4.18e-2 | 5.58e-1 | geloest |
| Kragarm (20 Elemente) · HEB 200 · L = 20 m | 60 | 1.37e+2 | 2.14e-4 | 9.09e-2 | 1.67e-1 | 2.23e+0 | geloest |
| Kragarm (20 Elemente) · HEB 600 · L = 3 m | 60 | 3.55e-1 | 2.08e-2 | 2.47e-1 | 1.25e-4 | 1.97e-3 | geloest |
| Kragarm (20 Elemente) · HEB 600 · L = 10 m | 60 | 3.95e+0 | 3.10e-3 | 2.24e-1 | 1.39e-3 | 1.89e-2 | geloest |
| Kragarm (20 Elemente) · HEB 600 · L = 20 m | 60 | 1.58e+1 | 9.04e-4 | 1.78e-1 | 5.57e-3 | 7.46e-2 | geloest |
| Durchlauftraeger (10 Felder) · IPE 80 · L = 3 m | 51 | 2.15e+3 | 5.00e-2 | 2.63e-2 | 1.94e-2 | 1.19e-2 | geloest |
| Durchlauftraeger (10 Felder) · IPE 80 · L = 10 m | 51 | 2.38e+4 | 5.00e-2 | 2.63e-2 | 2.15e-1 | 1.30e-1 | geloest |
| Durchlauftraeger (10 Felder) · HEB 200 · L = 3 m | 51 | 3.09e+2 | 5.00e-2 | 2.63e-2 | 2.82e-4 | 1.91e-4 | geloest |
| Durchlauftraeger (10 Felder) · HEB 200 · L = 10 m | 51 | 3.43e+3 | 5.00e-2 | 2.63e-2 | 3.03e-3 | 1.85e-3 | geloest |
| Durchlauftraeger (10 Felder) · HEB 600 · L = 3 m | 51 | 3.55e+1 | 5.00e-2 | 2.63e-2 | 1.18e-5 | 1.33e-5 | geloest |
| Durchlauftraeger (10 Felder) · HEB 600 · L = 10 m | 51 | 3.95e+2 | 5.00e-2 | 2.63e-2 | 1.04e-4 | 6.89e-5 | geloest |
| Stockwerkrahmen (6 x 2) · IPE 80 · L = 3 m | 54 | 8.58e+3 | 2.95e-4 | 1.46e-4 | 6.68e-2 | 3.63e-1 | geloest |
| Stockwerkrahmen (6 x 2) · IPE 80 · L = 5 m | 54 | 2.38e+4 | 1.07e-4 | 5.32e-5 | 1.85e-1 | 1.00e+0 | geloest |
| Stockwerkrahmen (6 x 2) · HEB 200 · L = 3 m | 54 | 1.23e+3 | 1.85e-3 | 9.01e-4 | 1.00e-3 | 5.50e-3 | geloest |
| Stockwerkrahmen (6 x 2) · HEB 200 · L = 5 m | 54 | 3.43e+3 | 7.17e-4 | 3.53e-4 | 2.66e-3 | 1.45e-2 | geloest |
| Stockwerkrahmen (6 x 2) · HEB 600 · L = 3 m | 54 | 1.42e+2 | 8.59e-3 | 4.04e-3 | 4.98e-5 | 2.96e-4 | geloest |
| Stockwerkrahmen (6 x 2) · HEB 600 · L = 5 m | 54 | 3.95e+2 | 4.63e-3 | 2.22e-3 | 1.06e-4 | 5.97e-4 | geloest |

## Kinematische Systeme

| System | DOF | A·L²/I | min. Pivot (dicht) | min. Pivot (dünn) | max \|φ\| [rad] | max \|u\|/L | Befund (3 Netze) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Verschieblicher Rahmen (2 Pendelstuetzen) · IPE 80 · L = 3 m | 6 | 8.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Verschieblicher Rahmen (2 Pendelstuetzen) · IPE 80 · L = 10 m | 6 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Verschieblicher Rahmen (2 Pendelstuetzen) · HEB 200 · L = 3 m | 6 | 1.23e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Verschieblicher Rahmen (2 Pendelstuetzen) · HEB 200 · L = 10 m | 6 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Verschieblicher Rahmen (2 Pendelstuetzen) · HEB 600 · L = 3 m | 6 | 1.42e+2 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Verschieblicher Rahmen (2 Pendelstuetzen) · HEB 600 · L = 10 m | 6 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Gelenkkette (2 Gelenke) · IPE 80 · L = 3 m | 8 | 9.54e+2 | 5.00e-16 | 1.11e-16 | — | — | SingularStiffnessMatrixError |
| Gelenkkette (2 Gelenke) · IPE 80 · L = 10 m | 8 | 1.06e+4 | 3.89e-16 | 8.88e-16 | — | — | SingularStiffnessMatrixError |
| Gelenkkette (2 Gelenke) · HEB 200 · L = 3 m | 8 | 1.37e+2 | 1.05e-15 | 5.55e-16 | — | — | SingularStiffnessMatrixError |
| Gelenkkette (2 Gelenke) · HEB 200 · L = 10 m | 8 | 1.52e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Gelenkkette (2 Gelenke) · HEB 600 · L = 3 m | 8 | 1.58e+1 | 2.22e-16 | 0 | — | — | SingularStiffnessMatrixError |
| Gelenkkette (2 Gelenke) · HEB 600 · L = 10 m | 8 | 1.75e+2 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Drei parallele uz-Auflager · IPE 80 · L = 3 m | 6 | 2.15e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Drei parallele uz-Auflager · IPE 80 · L = 10 m | 6 | 2.38e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Drei parallele uz-Auflager · HEB 200 · L = 3 m | 6 | 3.09e+2 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Drei parallele uz-Auflager · HEB 200 · L = 10 m | 6 | 3.43e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Drei parallele uz-Auflager · HEB 600 · L = 3 m | 6 | 3.55e+1 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Drei parallele uz-Auflager · HEB 600 · L = 10 m | 6 | 3.95e+2 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 00 Grad · IPE 80 | 7 | 9.54e+6 | 2.55e-15 | 1.30e-15 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 00 Grad · HEB 200 | 7 | 1.37e+6 | 3.72e-15 | 1.86e-15 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 00 Grad · HEB 600 | 7 | 1.58e+5 | 7.22e-16 | 6.38e-16 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 05 Grad · IPE 80 | 7 | 9.54e+6 | 7.48e-12 | 4.35e-12 | 3.89e+13 | 9.28e+13 | geloest |
| Winkelsweep Demo 05 Grad · HEB 200 | 7 | 1.37e+6 | 5.01e-13 | 2.92e-13 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 05 Grad · HEB 600 | 7 | 1.58e+5 | 4.79e-14 | 2.72e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 10 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 10 Grad · HEB 200 | 7 | 1.37e+6 | 2.57e-12 | 1.49e-12 | 1.59e+12 | 3.78e+12 | geloest |
| Winkelsweep Demo 10 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 15 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 15 Grad · HEB 200 | 7 | 1.37e+6 | 9.28e-12 | 5.39e-12 | 4.38e+11 | 1.04e+12 | geloest |
| Winkelsweep Demo 15 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 20 Grad · IPE 80 | 7 | 9.54e+6 | 2.55e-11 | 1.48e-11 | 1.12e+13 | 2.65e+13 | geloest |
| Winkelsweep Demo 20 Grad · HEB 200 | 7 | 1.37e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 20 Grad · HEB 600 | 7 | 1.58e+5 | 2.27e-12 | 1.32e-12 | 5.93e+10 | 1.39e+11 | geloest |
| Winkelsweep Demo 25 Grad · IPE 80 | 7 | 9.54e+6 | 1.37e-10 | 7.96e-11 | 2.08e+12 | 4.84e+12 | geloest |
| Winkelsweep Demo 25 Grad · HEB 200 | 7 | 1.37e+6 | 4.41e-11 | 2.56e-11 | 9.07e+10 | 2.12e+11 | geloest |
| Winkelsweep Demo 25 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 30 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 30 Grad · HEB 200 | 7 | 1.37e+6 | 4.17e-11 | 2.42e-11 | 9.48e+10 | 2.19e+11 | geloest |
| Winkelsweep Demo 30 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 35 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 35 Grad · HEB 200 | 7 | 1.37e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 35 Grad · HEB 600 | 7 | 1.58e+5 | 2.82e-12 | 1.64e-12 | 4.61e+10 | 1.05e+11 | geloest |
| Winkelsweep Demo 40 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 40 Grad · HEB 200 | 7 | 1.37e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 40 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 45 Grad · IPE 80 | 7 | 9.54e+6 | 4.64e-10 | 2.69e-10 | 5.80e+11 | 1.28e+12 | geloest |
| Winkelsweep Demo 45 Grad · HEB 200 | 7 | 1.37e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 45 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 50 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 50 Grad · HEB 200 | 7 | 1.37e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 50 Grad · HEB 600 | 7 | 1.58e+5 | 1.66e-14 | 1.01e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 55 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 55 Grad · HEB 200 | 7 | 1.37e+6 | 5.98e-12 | 3.48e-12 | 6.08e+11 | 1.29e+12 | geloest |
| Winkelsweep Demo 55 Grad · HEB 600 | 7 | 1.58e+5 | 2.83e-12 | 1.65e-12 | 4.28e+10 | 9.09e+10 | geloest |
| Winkelsweep Demo 60 Grad · IPE 80 | 7 | 9.54e+6 | 5.42e-10 | 3.15e-10 | 4.67e+11 | 9.70e+11 | geloest |
| Winkelsweep Demo 60 Grad · HEB 200 | 7 | 1.37e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 60 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 65 Grad · IPE 80 | 7 | 9.54e+6 | 3.31e-10 | 1.92e-10 | 7.46e+11 | 1.51e+12 | geloest |
| Winkelsweep Demo 65 Grad · HEB 200 | 7 | 1.37e+6 | 1.03e-10 | 5.97e-11 | 3.38e+10 | 6.84e+10 | geloest |
| Winkelsweep Demo 65 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 70 Grad · IPE 80 | 7 | 9.54e+6 | 2.64e-10 | 1.53e-10 | 9.12e+11 | 1.79e+12 | geloest |
| Winkelsweep Demo 70 Grad · HEB 200 | 7 | 1.37e+6 | 4.54e-11 | 2.64e-11 | 7.46e+10 | 1.47e+11 | geloest |
| Winkelsweep Demo 70 Grad · HEB 600 | 7 | 1.58e+5 | 3.92e-12 | 2.28e-12 | 2.88e+10 | 5.66e+10 | geloest |
| Winkelsweep Demo 75 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 75 Grad · HEB 200 | 7 | 1.37e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 75 Grad · HEB 600 | 7 | 1.58e+5 | 1.19e-11 | 6.92e-12 | 9.22e+9 | 1.76e+10 | geloest |
| Winkelsweep Demo 80 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 80 Grad · HEB 200 | 7 | 1.37e+6 | 5.47e-11 | 3.18e-11 | 5.86e+10 | 1.08e+11 | geloest |
| Winkelsweep Demo 80 Grad · HEB 600 | 7 | 1.58e+5 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 85 Grad · IPE 80 | 7 | 9.54e+6 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep Demo 85 Grad · HEB 200 | 7 | 1.37e+6 | 1.41e-11 | 8.18e-12 | 2.21e+11 | 3.93e+11 | geloest |
| Winkelsweep Demo 85 Grad · HEB 600 | 7 | 1.58e+5 | 2.67e-12 | 1.55e-12 | 3.88e+10 | 6.89e+10 | geloest |
| Winkelsweep Demo 90 Grad · IPE 80 | 7 | 9.54e+6 | 8.37e-11 | 4.87e-11 | 2.56e+12 | 4.38e+12 | geloest |
| Winkelsweep Demo 90 Grad · HEB 200 | 7 | 1.37e+6 | 5.25e-11 | 3.05e-11 | 5.74e+10 | 9.82e+10 | geloest |
| Winkelsweep Demo 90 Grad · HEB 600 | 7 | 1.58e+5 | 2.62e-12 | 1.52e-12 | 3.83e+10 | 6.55e+10 | geloest |
| Winkelsweep real 00 Grad · IPE 80 | 7 | 9.54e+4 | 3.33e-16 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 00 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 00 Grad · HEB 600 | 7 | 1.58e+3 | 5.55e-16 | 1.39e-16 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 05 Grad · IPE 80 | 7 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 05 Grad · HEB 200 | 7 | 1.37e+4 | 1.77e-14 | 1.05e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 05 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 10 Grad · IPE 80 | 7 | 9.54e+4 | 1.02e-13 | 5.97e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 10 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 10 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 15 Grad · IPE 80 | 7 | 9.54e+4 | 9.09e-13 | 5.29e-13 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 15 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 15 Grad · HEB 600 | 7 | 1.58e+3 | 2.39e-15 | 1.25e-15 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 20 Grad · IPE 80 | 7 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 20 Grad · HEB 200 | 7 | 1.37e+4 | 2.37e-13 | 1.38e-13 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 20 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 25 Grad · IPE 80 | 7 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 25 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 25 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 30 Grad · IPE 80 | 7 | 9.54e+4 | 3.28e-12 | 1.91e-12 | 8.59e+11 | 1.98e+12 | geloest |
| Winkelsweep real 30 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 30 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 35 Grad · IPE 80 | 7 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 35 Grad · HEB 200 | 7 | 1.37e+4 | 2.36e-13 | 1.37e-13 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 35 Grad · HEB 600 | 7 | 1.58e+3 | 3.30e-14 | 1.86e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 40 Grad · IPE 80 | 7 | 9.54e+4 | 1.27e-12 | 7.37e-13 | 2.16e+12 | 4.85e+12 | geloest |
| Winkelsweep real 40 Grad · HEB 200 | 7 | 1.37e+4 | 3.35e-13 | 1.94e-13 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 40 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 45 Grad · IPE 80 | 7 | 9.54e+4 | 2.48e-12 | 1.44e-12 | 1.09e+12 | 2.40e+12 | geloest |
| Winkelsweep real 45 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 45 Grad · HEB 600 | 7 | 1.58e+3 | 7.85e-14 | 4.48e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 50 Grad · IPE 80 | 7 | 9.54e+4 | 6.34e-12 | 3.68e-12 | 4.17e+11 | 9.04e+11 | geloest |
| Winkelsweep real 50 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 50 Grad · HEB 600 | 7 | 1.58e+3 | 2.96e-14 | 1.70e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 55 Grad · IPE 80 | 7 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 55 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 55 Grad · HEB 600 | 7 | 1.58e+3 | 1.54e-14 | 8.38e-15 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 60 Grad · IPE 80 | 7 | 9.54e+4 | 2.72e-12 | 1.58e-12 | 9.32e+11 | 1.93e+12 | geloest |
| Winkelsweep real 60 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 60 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 65 Grad · IPE 80 | 7 | 9.54e+4 | 2.41e-12 | 1.40e-12 | 1.03e+12 | 2.08e+12 | geloest |
| Winkelsweep real 65 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 65 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 70 Grad · IPE 80 | 7 | 9.54e+4 | 4.49e-12 | 2.61e-12 | 5.37e+11 | 1.06e+12 | geloest |
| Winkelsweep real 70 Grad · HEB 200 | 7 | 1.37e+4 | 1.72e-12 | 9.97e-13 | 1.99e+10 | 3.91e+10 | geloest |
| Winkelsweep real 70 Grad · HEB 600 | 7 | 1.58e+3 | 1.75e-13 | 1.00e-13 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 75 Grad · IPE 80 | 7 | 9.54e+4 | 3.02e-13 | 1.75e-13 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 75 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 75 Grad · HEB 600 | 7 | 1.58e+3 | 9.11e-14 | 5.15e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 80 Grad · IPE 80 | 7 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 80 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 80 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 85 Grad · IPE 80 | 7 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 85 Grad · HEB 200 | 7 | 1.37e+4 | 3.06e-13 | 1.77e-13 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 85 Grad · HEB 600 | 7 | 1.58e+3 | 9.59e-14 | 5.52e-14 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 90 Grad · IPE 80 | 7 | 9.54e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 90 Grad · HEB 200 | 7 | 1.37e+4 | 0 | 0 | — | — | SingularStiffnessMatrixError |
| Winkelsweep real 90 Grad · HEB 600 | 7 | 1.58e+3 | 0 | 0 | — | — | SingularStiffnessMatrixError |
