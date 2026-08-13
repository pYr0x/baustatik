# Die Zusatzbedingung am Loch

<!-- ERZEUGT von tests/loch-zusatzbedingung.mjs.
     Nicht von Hand bearbeiten — der nächste Lauf überschreibt die Datei. -->

Beleg-Artefakt zu [ADR 0045](../adr/0045-solid-section-values-are-nu-free-coefficients.md),
Fortsetzung von [ν-Abhängigkeit der Schubwerte](nu-abhaengigkeit-schubwerte.md)
auf **mehrfach zusammenhängende** Figuren.

## Die Frage

Die Randbedingung `dΦ/ds = −z²/(2·Iy)·dy/ds` legt Φ *entlang* eines Randes
fest, aber nur bis auf eine Konstante. Am Außenrand ist die gleichgültig. An
jedem Innenrand ist sie relativ dazu eine echte Unbekannte `c_k` und fällt
erst aus der Forderung, dass die Verwölbung beim Umlauf um das Loch
wieder auf ihrem Ausgangswert ankommt:

```text
∮_Γk ∂Φ/∂n ds = 0
```

Gerechnet wird als `Φ = Φ_g + m·Φ_load + Σ cₖ·Φₖ` — bei h Löchern `2 + h`
rechte Seiten auf **einer** Zerlegung, plus ein dichtes h×h-System.

## Zuerst eine Grenze, die beim Nachprüfen aufgefallen ist

Die Randbedingung legt Φ entlang des Randes fest. Damit Φ nach einem vollen
Umlauf wieder auf seinem Ausgangswert ankommt, muss `∮_Γk z² dy = 0` sein —
und das ist nicht geschenkt. Green gibt

```text
∮_Γk z² dy = −2·∫∫_{D_k} z dA        (D_k = das eingeschlossene Gebiet)

Sprung je Umlauf = (1/Iy)·∫∫_{D_k} z dA
```

**Der Sprung verschwindet genau dann, wenn der Schwerpunkt jedes Lochs auf der
Biegeachse liegt** — und der Rand des Vollmaterials ebenso. Sonst ist Φ
mehrdeutig und als Finite-Elemente-Feld gar nicht darstellbar. Bei `Qy` steht
an derselben Stelle `∫∫ y dA`.

Das ist **keine** Eigenheit mehrerer Löcher: ein einziges Loch neben der Achse
genügt. Kasten 200 × 300, Loch 60 × 120 bei z = 210 statt 150, Schwerpunkt
bei z_s = 141.8182:

| Schleife | Sprung vorhergesagt | gemessen |
| --- | ---: | ---: |
| Außenrand | 1.191800e-3 | 1.191800e-3 |
| Loch | -1.191800e-3 | -1.191800e-3 |

Das sind 16.39 % der Spannweite von g. Die Vorhersage steht aus zwei
Rechteckdaten, die Messung aus rund 500 Segmentintegralen — die Diagnose ist
damit belegt und nicht bloß plausibel. Die Folgen:

- Das Gleichgewicht bricht: `max|Fz−1|, |Fy|` = 1.78e-1 statt ~1e-14.
- κ = 0.496053887 bei ν = 0,3 ist ohne Bedeutung.
- **Der Restfluss merkt nichts** (3.9e-17): die Zusatzbedingung wird erfüllt, nur
  eben für ein falsches Randwertproblem. Der Anzeiger ist hier der Randschluss.

Alle übrigen Figuren dieses Berichts halten die Bedingung ein — beim Kasten aus
Schritt 3 wurde das Loch in y verschoben, nicht in z. Deshalb ist es bis hierher
nie aufgefallen. **Für die Umsetzung heißt das: die Dirichlet-Formulierung deckt
mehrfach zusammenhängende Querschnitte nur teilweise ab.** Sie trägt den
symmetrischen Hohlkasten und alles, was seine Löcher auf der Biegeachse hat;
ein außermittiger Hohlraum braucht mehr. Zwei Wege stehen offen, beide
ungeprüft:

1. **Die partikuläre Lösung ändern.** Der Sprung hängt an der Wahl von `τ^p`
   nur über dessen Fluss durch die Löcher. Ein zusätzliches harmonisches `∇v`
   mit vorgegebenem Lochfluss macht Φ wieder eindeutig und lässt die
   Differentialgleichung unberührt — die dafür nötige Matrix ist dieselbe
   Kopplungsmatrix wie unten.
2. **Auf die Verwölbungsformulierung wechseln.** Dort ist die Unbekannte eine
   Verschiebung und damit ohnehin eindeutig; die Frage stellt sich nicht. Das
   ist der Weg, den die Torsion in diesem Messgerät schon geht.

## Die Figuren

| Figur | Elemente | Schleifen | Randschluss | Gleichgewicht | Restfluss |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rechteck 1 × 1,5 OHNE Loch (Regression) | 46704 | 1 | 8.5e-16 | 2.1e-14 | 0.0e+0 |
| Kreisring a = 1, b = 0,5 | 47028 | 2 | 4.9e-16 | 5.8e-6 | 4.5e-15 |
| Kasten 200 × 300, Loch 60 × 120 MITTIG (Demo-Figur) | 46735 | 2 | 1.4e-16 | 3.5e-14 | 2.0e-17 |
| Kasten 200 × 300, Loch 60 × 120 VERSCHOBEN (y = 55) | 46761 | 2 | 5.9e-17 | 2.6e-14 | 4.0e-17 |
| Kasten 200 × 300, ZWEI Löcher 40 × 120, in y gespiegelt | 46630 | 3 | 1.3e-16 | 3.7e-14 | 2.9e-17 |
| Kasten 200 × 300, DREI Löcher, ohne jede Symmetrie | 46697 | 4 | 3.1e-19 | 2.8e-14 | 9.9e-17 |
| Kasten 200 × 300, Loch 60 × 120 bei z = 210 (neben der Achse) | 46592 | 2 | 1.2e-3 | 1.8e-1 | 3.9e-17 |

Zwei Orakel vorweg:

- **Rechteck ohne Loch** — der Mehrfachumlauf darf die alte Zahl nicht bewegen:
  κ(ν=0) = `0.833333333333`, Abstand zu 5/6 2.03e-14.
- **Kreisring** — `It` gegen `π(a⁴−b⁴)/2`: gerechnet `1.472587290e+0`, exakt `1.472621556e+0`, Abweichung 0.0023 %.

Beide prüfen aber nur die **Installation**: der Randschluss prüft den
Mehrfachumlauf, `It` die Torsion. Für das Schubproblem mit Loch braucht es
eine eigene, unabhängige Antwort — der dünnwandige Grenzfall hat eine:
die Schubfläche eines dünnen Rohres ist die halbe Fläche, also `κ → 1/2`.

| b/a | t/a | κ(ν=0) | Abstand zu 1/2 |
| ---: | ---: | ---: | ---: |
| 0.80 | 0.20 | 0.510238863 | 1.024e-2 |
| 0.90 | 0.10 | 0.502304275 | 2.304e-3 |
| 0.95 | 0.05 | 0.500547405 | 5.474e-4 |

Der Abstand viertelt sich bei halbierter Wandstärke — das ist die erwartete
Ordnung `O((t/a)²)`. Damit ist nicht nur die Umsetzung geprüft, sondern auch
die **Wahl** der Nebenbedingung: der klassische Wert 1/2 gehört zum
Schubfeld ohne überlagerte Torsion, also zu `θ' = 0`.

## Was das Loch kostet

Kasten 200 × 300 mit Loch 60 × 120, **außermittig** bei y = 55, damit die
Symmetrie gebrochen ist. Bei ν = 0,3:

| | mit Zusatzbedingung | ohne (`c₁ = 0`) |
| --- | ---: | ---: |
| κ | 0.687030263 | 0.098968427 |
| Restfluss `∮∂Φ/∂n ds` | 4.0e-17 | 4.0e-2 |
| yM (Weber) | 1.606445e+1 | -1.737025e+2 |
| yM (Trefftz) | 1.587313193e+1 | 1.587313193e+1 |

**κ ist um 85.5948 % zu klein**, wenn die Bedingung fehlt. Das ist kein
Feinheitsproblem. Die übliche Gleichgewichtsprobe `∫τ_z dA = Qz` merkt davon
nichts: ein additiver Randwert erzeugt ein umlaufendes Feld ohne Resultierende.

## Der Trefftz-Schubmittelpunkt merkt es auch nicht — und das ist gut

Weber springt von `1.6064e+1` auf `-1.7370e+2`, also aus der Figur heraus. Trefftz steht in
beiden Spalten auf allen ausgewiesenen Stellen gleich. Das ist beweisbar:

```text
ΔyM_Trefftz = Δtorque − Δprojection = −∫(Φ,z·ω,y − Φ,y·ω,z) dA
            = −∮ Φ·(ω,y·n_z − ω,z·n_y) ds = Σ_k C_k·∮_Γk ∂ω/∂t ds = 0
```

weil Φₖ auf jeder Randschleife **konstant** ist und ω als physische
Verschiebung eindeutig. Der Trefftz-Schubmittelpunkt ist also gegen jede
additive Randkonstante immun — auch gegen eine falsch bestimmte. Betroffen
ist allein κ.

## `c₁ = 0` ist keine Näherung, sondern eine Eichung

`c₁ = 0` heißt „null am Startknoten des Randumlaufs" — und der hängt an der
Knotennummerierung des Netzes. Derselbe Lauf mit einem um 137 Knoten
versetzten Startpunkt, wieder bei ν = 0,3:

| | Startknoten A | Startknoten B | Unterschied |
| --- | ---: | ---: | ---: |
| κ **mit** Bedingung | 0.687030263 | 0.687030263 | 2.44e-13 % |
| κ **ohne** Bedingung | 0.098968427 | 0.109597740 | 9.6985 % |

Ohne die Bedingung ist das Ergebnis also nicht falsch-aber-reproduzierbar,
sondern **von der Knotennummerierung abhängig**. Zwei Netze derselben Figur
liefern zwei verschiedene κ.

## Mehrere Löcher: die Kopplung

Bei einem Loch ist das „h×h-System" eine Division — die Kopplung, um die es
geht, kommt gar nicht vor. Ab zwei Löchern schon: `Φ_j` legt auf Rand j eine
Eins ab und verändert damit den Fluss durch **alle anderen** Löcher. Die
Matrix der Zusatzbedingungen `M_kj = ∮_Γk ∂Φ_j/∂n ds` ist die
Schur-Ergänzung von K auf die Innenränder; sie hängt nicht von m ab und wird
einmal je Figur gebaut.

**Zwei Löcher 40 × 120**, in y gespiegelt (y = 55 und y = 145), 46630 Elemente:

```text
[    9.103959e+0   -2.871486e+0 ]
[   -2.871486e+0    9.103550e+0 ]
```

Die Nebendiagonale ist 31.54 % der Diagonale — die beiden Löcher sehen
einander also deutlich. Drei Proben:

- **M ist symmetrisch** auf 4.9e-17 genau (bezogen auf die Diagonale).
  Das ist eine Selbstprüfung ohne Orakel von außen: `M_kj` und `M_jk` entstehen
  aus verschiedenen Lösungen und verschiedenen Summen.
- **Der Fluss verschwindet gleichzeitig an beiden Rändern**: 2.9e-17.
- **Die Symmetrievorhersage trifft.** Unter y → −y geht die Figur in sich über,
  während `−m·y/Iy` und `g = −1/(2·Iy)∫z²dy` beide das Vorzeichen wechseln — Φ
  ist also ungerade in y, und die beiden Löcher tauschen die Plätze. Gemessen
  am Φ-Mittel jedes Innenrandes (gegen den Außenrand, damit weder Startknoten
  noch globale Konstante hineinspielen): `Φ̄₁ + Φ̄₂` = 7.31e-9, das sind
  1.38e-4 % der Spannweite von g.

### Was die Kopplung wert ist

Dieselbe Figur, aber nur mit der Diagonale von M gerechnet — jedes Loch für
sich. Bei ν = 0,3:

| | vollständig | nur Diagonale |
| --- | ---: | ---: |
| κ | 0.662494135 | 0.482397225 |
| Restfluss | 2.9e-17 | 9.3e-3 |

Der Unterschied an κ ist 27.1847 %. Die Kopplung ist also keine
Feinheit, und der Restfluss zeigt sie sofort an — dieselbe Anzeige wie beim
einzelnen Loch.

### Drei Löcher, ohne jede Symmetrie

Kasten 200 × 300 mit Löchern 30 × 160 bei y = 40, 40 × 80 bei y = 95 und
50 × 40 bei y = 160; 46697 Elemente, Fläche 50000.000 (Sollwert 50000).
Alle drei liegen auf z = 150 — das ist Pflicht, siehe oben —, in y aber
unsymmetrisch und verschieden groß. Hier ist nichts vorherzusagen, also wird
nur geprüft. Bei ν = 0,3:

| | κ | Restfluss |
| --- | ---: | ---: |
| vollständig | 0.560089455 | 9.9e-17 |
| ohne Kopplung | 0.236045362 | 1.8e-2 |
| ohne Zusatzbedingung | 0.086352011 | 4.8e-2 |

Die 3×3-Matrix ist auf 3.4e-16 symmetrisch, ihre stärkste Nebendiagonale
beträgt 38.17 % der Diagonale. Alle drei Flüsse verschwinden gleichzeitig.
Und die drei Aussagen aus dem einfachen Fall stehen unverändert:

- **Trefftz bleibt immun**: -3.647578326e+0 mit, -3.647578326e+0 ohne
  Zusatzbedingung — während Weber von -3.7165e+0 auf -1.8871e+2 springt.
- **Die Eichung schlägt nicht durch**: Randumlauf um 137 Knoten versetzt, κ ändert
  sich um 2.66e-13 %.
- **Die Zahl ist konvergiert**: bei 186262 Elementen (viermal feiner) wird κ =
  0.560761250, also 0.1198 % Unterschied.

### Was hier fehlt

Für den einzelligen Fall gab es oben ein **unabhängiges** Orakel, den
dünnwandigen Grenzwert `κ → 1/2`. Für zwei und drei Zellen gibt es keinen
entsprechenden geschlossenen κ-Wert, an dem sich messen ließe. Die Beweislage
ist hier deshalb schwächer als oben: geprüft sind die Symmetrie der Matrix,
der gleichzeitige Nullfluss, eine Symmetrievorhersage und die Netzkonvergenz —
alles Eigenschaften der Rechnung. Was ein Orakel von außen bestätigt, ist die
**Formulierung** (einzelliges Rohr), und die ändert sich mit der Zellenzahl
nicht; was hinzukommt, ist allein das lineare Gleichungssystem in `c`.

## `d₁` bleibt null — auch mit Loch

| Figur | d₀ | d₁ | d₁/d₀ |
| --- | ---: | ---: | ---: |
| Rechteck 1 × 1,5 OHNE Loch (Regression) | 1.200000e+0 | 2.54e-13 | 2.12e-13 |
| Kreisring a = 1, b = 0,5 | 1.700075e+0 | 2.68e-13 | 1.58e-13 |
| Kasten 200 × 300, Loch 60 × 120 MITTIG (Demo-Figur) | 1.432635e+0 | 2.30e-14 | 1.61e-14 |
| Kasten 200 × 300, Loch 60 × 120 VERSCHOBEN (y = 55) | 1.454505e+0 | 2.26e-13 | 1.55e-13 |
| Kasten 200 × 300, ZWEI Löcher 40 × 120, in y gespiegelt | 1.508569e+0 | 5.93e-14 | 3.93e-14 |
| Kasten 200 × 300, DREI Löcher, ohne jede Symmetrie | 1.784616e+0 | -5.42e-13 | -3.04e-13 |

Der Beweis aus ADR 0045 brauchte `Φ₁ = 0` auf dem *ganzen* Rand. Mit Loch ist
`Φ₁` auf jedem Innenrand k die Konstante `c_k₁` (der m-Anteil von `c_k`), und
beide Randterme verschwinden trotzdem:

```text
∮Φ₁·∂Φ₀/∂n ds       = Σ_k c_k₁·∮_Γk ∂Φ₀/∂n ds = 0   ← die Zusatzbedingung
                                                       selbst, m⁰-Anteil
∮z²/(2·Iy)·Φ₁·n_y ds = Σ_k c_k₁/(2·Iy)·∮_Γk z² dz = 0   ← exaktes Differential
```

Jeder Summand fällt einzeln weg, also hängt nichts an der Zahl der Löcher.
**`d₁ = 0` gilt also auch mehrfach zusammenhängend**, sobald die
Zusatzbedingung erfüllt ist. Damit ist die Begründung entfallen, drei Zahlen
statt zwei zu speichern.

Und `d₁` taugt **nicht** als Anzeiger für eine vergessene Zusatzbedingung:
bei erzwungenem `c₁ = 0` ist `Φ₁ = Φ_load`, also wieder null auf dem ganzen
Rand — gemessen `d₁/d₀ = 4.07e-13`, obwohl κ um 85.5948 % danebenliegt.
Der Anzeiger ist der Restfluss, nicht `d₁`.

### Woran der Beweis hängt

Die erste partielle Integration braucht `∇²Φ₀ = 0`, und das gilt für das Feld
mit `C = 0`, also **ohne überlagerte Torsion**. Käme κ stattdessen aus dem
Trefftz-korrigierten Feld, wäre `∇²Φ₀ = C₀ ≠ 0` und es bliebe `−C₀·∫Φ₁ dA`
stehen — bei unsymmetrischen Figuren ungleich null.

**κ gehört also zum Weber-Feld, `yM`/`zM` zu Trefftz.** Das ist kein
Widerspruch: κ ist eine Energieäquivalenz im gewöhnlichen Schubproblem (daher
auch die 5/6 und die 1/2 oben), der Schubmittelpunkt dagegen die Antwort auf
„wo muss die Last angreifen". Wer κ je auf das Trefftz-Feld umstellt, verliert
die zweite Zahl und braucht die dritte zurück.

## Zwei Vorhersagen, die die Messung widerlegt hat

**„Beim symmetrischen Ring ist `c₁ = 0`."** Falsch — gemessen `3.961e-1`. Der Wert von `c₁` ist gar keine
physikalische Größe: er steht relativ zum willkürlichen Startknoten (siehe
oben). Was die Symmetrie tötet, ist sein **m-Anteil**: Spannweite über alle ν
`1.0e-9` beim Ring und `1.1e-9` beim mittigen Kasten, gegen `1.7e-5`
beim außermittigen. Nur der m-Anteil geht in `d₁` ein.

**„Mit Loch darf `d₁` auftauchen."** Falsch — es bleibt null, und zwar
beweisbar, siehe oben.

