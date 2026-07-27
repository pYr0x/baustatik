# Lastbeispiele

Diese Seite zeigt die fachlichen Eingabevarianten von
`@baustatik/fem-loads`. Sie ist die ausführliche Ergänzung zur
[API-Referenz](usage.md). Die Beispiele verwenden Modell-IDs wie `n1`, `n2`,
`b1` und `b2`; in einer Anwendung werden diese IDs aus dem eigenen Modell
übernommen.

Die Beispiele sind absichtlich unabhängig von Store, Viewer und UI. Ein
Lastobjekt wird erzeugt und anschließend über seine `nodeIds` beziehungsweise
`beamIds` mit dem Modell verbunden.

Die Typen können beispielsweise so importiert werden:

```typescript
import type {
  BeamForceConstantLoad,
  BeamForcePointLoad,
  BeamForceTrapezoidalLoad,
  BeamMomentConstantLoad,
  BeamMomentPointLoad,
  BeamMomentTrapezoidalLoad,
  NodeLoad,
} from '@baustatik/fem-loads';
```

## Grundregeln

Es gibt zwei verschiedene Eingabeformen:

- **Knotenlast:** komponentenweise — `fx`, `fz` und `my` global in einer Last.
  Zwei Komponenten derselben Last bleiben eine Last mit einer ID.
- **Stablast:** Betrag plus separat gewählte Richtung. Eine Richtung wird über
  `frame` und `axis` angegeben. Zwei Richtungen werden als zwei Lastobjekte
  modelliert. Eine Stablast ist entweder eine Kraft oder ein Moment.

### Vorzeichen

Im ebenen FEM-Modell zeigt die globale `z`-Achse nach unten. Eine nach unten
wirkende Kraft ist daher positiv:

```text
+fx  nach rechts
+fz  nach unten
+my  gegen den Uhrzeigersinn im Bild
```

`my` und `m` drehen um die globale beziehungsweise lokale y-Achse. Die
Umrechnung zwischen der Lastkonvention und der Elementkonvention erfolgt erst
in `@baustatik/fem-load-resolve`.

### Ziele

Alle Lasten referenzieren eine Liste von Zielen. Die Liste darf nicht leer
sein. Ein Objekt kann deshalb dieselbe Last an mehrere Knoten oder Stäbe hängen:

```typescript
const load: NodeLoad = {
  id: 'load-1',
  target: 'node',
  nodeIds: ['n1', 'n2'],
  fz: 10,
};
```

Löschen bedeutet in diesem Modell, die gesamte Last mit ihrer ID zu löschen —
nicht nur eines ihrer Ziele.

## A. Knotenlasten

Eine Knotenlast wird komponentenweise im globalen System eingegeben. Mindestens
eine der Komponenten `fx`, `fz` oder `my` muss von null verschieden sein.

### A1 — Vertikale Einzellast nach unten

Der häufigste Fall:

```typescript
const load: NodeLoad = {
  id: 'node-load-downward',
  target: 'node',
  nodeIds: ['n2'],
  fz: 10, // kN, positiv nach unten
};
```

### A2 — Horizontale Einzellast

Zum Beispiel Wind an einer Rahmenecke:

```typescript
const load: NodeLoad = {
  id: 'node-load-wind',
  target: 'node',
  nodeIds: ['n2'],
  fx: 5, // kN, positiv nach rechts
};
```

### A3 — Schräge Einzellast

Eine schräge Knotenlast wird durch zwei Komponenten derselben Last beschrieben:

```typescript
const load: NodeLoad = {
  id: 'node-load-diagonal',
  target: 'node',
  nodeIds: ['n2'],
  fx: 5,
  fz: 10,
};
```

Das ist nicht dasselbe wie zwei Lastobjekte. Beim Löschen wird die gesamte
Kombination als eine Last entfernt.

### A4 — Reine Momentenlast

Eine reine Momentenlast hat keine Pfeilkomponente:

```typescript
const load: NodeLoad = {
  id: 'node-load-moment',
  target: 'node',
  nodeIds: ['n2'],
  my: 12, // kNm, gegen den Uhrzeigersinn
};
```

### A5 — Kraft und Moment gemeinsam

Kraft und Moment dürfen bei der Knotenlast zusammen auftreten:

```typescript
const load: NodeLoad = {
  id: 'node-load-combined',
  target: 'node',
  nodeIds: ['n2'],
  fx: 5,
  fz: 10,
  my: 12,
};
```

Die Darstellung kann daraus bis zu drei Symbole erzeugen, fachlich bleibt es
eine Last mit einer ID.

### A6 — Eine Last auf mehrere Knoten

Ein Kommentar wird mitgeführt, aber nicht ausgewertet:

```typescript
const load: NodeLoad = {
  id: 'node-load-secondary-beam',
  target: 'node',
  nodeIds: ['n2', 'n3'],
  fz: 10,
  comment: 'Auflagerkraft Nebenträger',
};
```

## B. Stablasten: Kraft und Moment

Bei einer Stabkraft sind folgende Angaben relevant:

```text
kind          force
distribution  point | constant | trapezoidal
frame         global | local
axis          x | z
```

Bei einem ebenen Stabmoment entfallen `frame`, `axis` und `referenceLength`:

```text
kind          moment
distribution  point | constant | trapezoidal
```

Ein ebenes Moment wirkt immer um y. Die Auswahl „Lokal y“ oder „Global Y“ aus
der UI hätte für dieses 2D-Modell keine beobachtbare Wirkung und wird deshalb
nicht als Feld im Typ gespeichert. Die Bezugs­länge eines Stabmoments ist
immer die wahre Stablänge.

Die sechs Stablastvarianten sind also die Kombinationen aus `kind` und
`distribution`. Die unterschiedlichen Feldnamen machen auch die Einheiten
sichtbar:

```text
Kraft, punktförmig       p       [kN]
Kraft, verteilt          q       [kN/m]
Kraft, trapezförmig      q1, q2  [kN/m]
Moment, punktförmig      m       [kNm]
Moment, verteilt         m       [kNm/m]
Moment, trapezförmig     m1, m2  [kNm/m]
```

## C. Punktförmige Stabkraft

Eine Punktlast besitzt den Gesamtwert `p` in kN und die Position
`distanceFromStart`. Eine Bezugs­länge gibt es hier nicht: `p` ist keine Last
pro Länge, sondern bereits eine Gesamtkraft.

### C1 — Global nach unten, absoluter Abstand

```typescript
const load: BeamForcePointLoad = {
  id: 'beam-point-global-z',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'point',
  frame: 'global',
  axis: 'z',
  p: 10, // kN
  distanceFromStart: 50,
};
```

### C2 — Punktlast mit relativem Abstand

Mit `relativeDistances: true` wird der Abstand als Prozentwert der Stablänge
interpretiert. `50` bedeutet also Stabmitte:

```typescript
const load: BeamForcePointLoad = {
  id: 'beam-point-relative',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'point',
  frame: 'global',
  axis: 'z',
  p: 10,
  distanceFromStart: 50, // 50 % der Stablänge
  relativeDistances: true,
};
```

Das Flag gehört zur Position der Last und nicht zu einer einzelnen
Darstellungseinheit.

### C3 — Punktlast in lokaler Richtung

`local` bezieht die Achse auf die Stabachse. `axis: 'z'` bedeutet dann
senkrecht zum Stab, beispielsweise eine Radlast:

```typescript
const load: BeamForcePointLoad = {
  id: 'beam-point-local-z',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'point',
  frame: 'local',
  axis: 'z',
  p: 10,
  distanceFromStart: 50,
};
```

## D. Konstante Stabkraft

Eine konstante Streckenlast wird immer über die gesamte Stablänge angesetzt.
Deshalb besitzt diese Variante keine Abstände und kein
`relativeDistances`-Feld. Ein konstanter Teilabschnitt wird als Trapezlast mit
`q1 === q2` modelliert.

### D1 — Gleichlast global nach unten

```typescript
const load: BeamForceConstantLoad = {
  id: 'beam-constant-self-weight',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'constant',
  frame: 'global',
  axis: 'z',
  referenceLength: 'trueLength',
  q: 5, // kN/m
};
```

### D2 — Gleichlast global horizontal

Zum Beispiel Wind auf eine Stütze:

```typescript
const load: BeamForceConstantLoad = {
  id: 'beam-constant-wind',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'constant',
  frame: 'global',
  axis: 'x',
  referenceLength: 'trueLength',
  q: 2,
};
```

### D3 — Gleichlast senkrecht zur lokalen Stabachse

```typescript
const load: BeamForceConstantLoad = {
  id: 'beam-constant-local-normal',
  target: 'beam',
  beamIds: ['b2'],
  kind: 'force',
  distribution: 'constant',
  frame: 'local',
  axis: 'z',
  referenceLength: 'trueLength',
  q: 2,
};
```

### D4 — Schneelast bezogen auf die horizontale Projektion

`horizontalProjection` misst die x-Ausdehnung des schrägen Stabes. Das ist die
Bezugs­länge, die in der RFEM-Oberfläche als „Projektion in Z“ bezeichnet wird.
Die Bezugs­länge ist unabhängig von der Lastrichtung:

```typescript
const load: BeamForceConstantLoad = {
  id: 'beam-snow-horizontal-projection',
  target: 'beam',
  beamIds: ['b2'],
  kind: 'force',
  distribution: 'constant',
  frame: 'global',
  axis: 'z',
  referenceLength: 'horizontalProjection',
  q: 0.85, // kN/m bezogen auf die Grundrisslänge
};
```

### D5 — Gleichlast bezogen auf die vertikale Projektion

`verticalProjection` misst die z-Ausdehnung. Das entspricht in der
RFEM-Oberfläche „Projektion in X“:

```typescript
const load: BeamForceConstantLoad = {
  id: 'beam-wind-vertical-projection',
  target: 'beam',
  beamIds: ['b2'],
  kind: 'force',
  distribution: 'constant',
  frame: 'global',
  axis: 'x',
  referenceLength: 'verticalProjection',
  q: 1.2,
};
```

### D6 — Gleichlast auf mehrere Stäbe

```typescript
const load: BeamForceConstantLoad = {
  id: 'beam-constant-multiple',
  target: 'beam',
  beamIds: ['b1', 'b2'],
  kind: 'force',
  distribution: 'constant',
  frame: 'global',
  axis: 'z',
  referenceLength: 'trueLength',
  q: 5,
  comment: 'Eigengewicht Aufbau',
};
```

## E. Trapezförmige Stabkraft

Eine Trapezlast besitzt `q1` am Anfang und `q2` am Ende des Lastabschnitts.
Der Abschnitt wird entweder mit `fullLength: true` über den ganzen Stab gelegt
oder mit `from` und `to` angegeben:

```text
.____|----------|____.
  Knoten       Knoten
       from  to
```

Bei `relativeDistances: true` sind `from` und `to` Prozentwerte der
Stablänge. Das Flag gilt für beide Abstände gemeinsam.

### E1 — Trapez über den ganzen Stab

```typescript
const load: BeamForceTrapezoidalLoad = {
  id: 'beam-trapezoidal-full',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'trapezoidal',
  frame: 'global',
  axis: 'z',
  referenceLength: 'trueLength',
  q1: 2,
  q2: 8,
  fullLength: true,
};
```

### E2 — Dreieckslast

Eine Dreieckslast ist ein Sonderfall der Trapezlast, bei dem einer der Werte
null ist:

```typescript
const load: BeamForceTrapezoidalLoad = {
  id: 'beam-triangular',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'trapezoidal',
  frame: 'global',
  axis: 'z',
  referenceLength: 'trueLength',
  q1: 0,
  q2: 8,
  fullLength: true,
};
```

### E3 — Trapez auf einem absoluten Teilabschnitt

```typescript
const load: BeamForceTrapezoidalLoad = {
  id: 'beam-trapezoidal-segment',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'trapezoidal',
  frame: 'global',
  axis: 'z',
  referenceLength: 'trueLength',
  q1: 10,
  q2: 100,
  from: 0,
  to: 33.333,
};
```

### E4 — Derselbe Abschnitt relativ

```typescript
const load: BeamForceTrapezoidalLoad = {
  id: 'beam-trapezoidal-relative',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'trapezoidal',
  frame: 'global',
  axis: 'z',
  referenceLength: 'trueLength',
  q1: 10,
  q2: 100,
  from: 0,
  to: 33.333,
  relativeDistances: true,
};
```

### E5 — Konstanter Teilabschnitt

Ein konstanter Teilabschnitt wird nicht als eigene Distribution modelliert:

```typescript
const load: BeamForceTrapezoidalLoad = {
  id: 'beam-constant-segment',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'trapezoidal',
  frame: 'global',
  axis: 'z',
  referenceLength: 'trueLength',
  q1: 5,
  q2: 5,
  from: 20,
  to: 60,
};
```

## F. Stabmomente

Ein ebenes Stabmoment besitzt keine Richtungsauswahl. Es wirkt immer um die
lokale y-Achse; `frame`, `axis` und `referenceLength` werden deshalb nicht
angegeben.

### F1 — Punktmoment, absoluter Abstand

```typescript
const load: BeamMomentPointLoad = {
  id: 'beam-point-moment',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'moment',
  distribution: 'point',
  m: 12, // kNm
  distanceFromStart: 50,
};
```

### F2 — Punktmoment, relativer Abstand

```typescript
const load: BeamMomentPointLoad = {
  id: 'beam-point-moment-relative',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'moment',
  distribution: 'point',
  m: 12,
  distanceFromStart: 50, // 50 % der Stablänge
  relativeDistances: true,
};
```

### F3 — Konstantes Streckenmoment

```typescript
const load: BeamMomentConstantLoad = {
  id: 'beam-constant-moment',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'moment',
  distribution: 'constant',
  m: 2, // kNm/m
};
```

### F4 — Trapezförmiges Streckenmoment über den ganzen Stab

```typescript
const load: BeamMomentTrapezoidalLoad = {
  id: 'beam-trapezoidal-moment-full',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'moment',
  distribution: 'trapezoidal',
  m1: 2, // kNm/m
  m2: 8, // kNm/m
  fullLength: true,
};
```

### F5 — Trapezförmiges Streckenmoment auf einem Teilabschnitt

```typescript
const load: BeamMomentTrapezoidalLoad = {
  id: 'beam-trapezoidal-moment-segment',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'moment',
  distribution: 'trapezoidal',
  m1: 2,
  m2: 8,
  from: 20,
  to: 60,
};
```

## Validierungsregeln

Die Union beschreibt die Form der Eingabe; `validateLoad()` und
`validateLoads()` prüfen zusätzlich die Werte gegen die Modellgeometrie.

### Felder je Distribution

```text
point
  Kraft:       p, distanceFromStart
  Moment:      m, distanceFromStart
  Nicht erlaubt: from, to, fullLength, referenceLength

constant
  Kraft:       q, referenceLength
  Moment:      m
  Nicht erlaubt: Abstände, relativeDistances, fullLength

trapezoidal
  Kraft:       q1, q2, referenceLength
  Moment:      m1, m2
  Entweder:    fullLength
  oder:        from und to
```

Zusätzlich gilt:

- `kind: 'moment'` besitzt weder `frame` noch `axis` noch
  `referenceLength`.
- `0 <= distanceFromStart <= Stablänge`; bei relativen Abständen gilt
  `0 <= distanceFromStart <= 100`.
- Für Trapezlasten gilt analog `0 <= from <= to <= Stablänge` beziehungsweise
  `<= 100`.
- Eine Knotenlast braucht mindestens eine Komponente ungleich null.
- Eine Stablast braucht mindestens einen wirksamen Wert ungleich null. Eine
  Dreieckslast wie `q1: 0, q2: 8` ist daher gültig.
- Ziel-Listen dürfen nicht leer sein.
- Jede Ziel-ID muss im Modell existieren.
- Ein belasteter Stab muss eine positive Länge besitzen.
- Eine verwendete projizierte Bezugs­länge darf nicht null sein. Eine
  waagerechte Stabachse mit `verticalProjection` und eine senkrechte Stabachse
  mit `horizontalProjection` sind daher ungültig.
- Alle numerischen Werte müssen endlich sein; `NaN` und `Infinity` sind nicht
  zulässig.

Für eine Eingabeoberfläche werden alle Beanstandungen gesammelt:

```typescript
const errors = validateLoads(modelGeometry(nodes, beams), loads);
```

Vor der Rechenkette wird dagegen der erste Fehler geworfen:

```typescript
assertValidLoads(modelGeometry(nodes, beams), loads);
```

## Bezugs­längen

Bei Streckenlasten ist `referenceLength` eine eigene Achse. Sie beschreibt, auf
welche gemessene Länge sich `q`, `q1` und `q2` beziehen; sie ist nicht Teil der
Lastrichtung.

```text
trueLength             wahre Stablänge
horizontalProjection   x-Ausdehnung, Grundriss
verticalProjection     z-Ausdehnung, Ansicht
```

Die Namen beziehen sich auf die gemessene Ausdehnung. Die RFEM-Dialoge nennen
stattdessen die Blickrichtung:

```text
RFEM „Projektion in X“  -> verticalProjection  (misst z)
RFEM „Projektion in Z“  -> horizontalProjection (misst x, Schnee)
```

Der Umrechnungsfaktor ist `L_proj / L` und damit höchstens 1. Eine Last mit
Bezugs­länge wird also kleiner oder gleich der Last bezogen auf die wahre
Stablänge gerechnet, nie größer. Genau null wird als ungültig abgelehnt, weil
die Last dann vollständig verschwinden würde. Sehr kleine, aber positive
Faktoren sind aktuell zulässig; siehe die Einschränkung in
[CONTEXT.md](../CONTEXT.md).

## Nicht in diesen Lasttypen enthalten

Die hier beschriebenen Typen decken die aktuelle Eingabe von Knoten- und
Stablasten ab. Nicht enthalten sind derzeit:

- Lastkombinationen (Lastfälle selbst gibt es: `LoadCase` in
  [`src/load-case.ts`](../src/load-case.ts)),
- ein Eigengewicht-Generator,
- Temperatur, Längenänderung, Längsverschiebung, Vorkrümmung und
  Anfangsvorspannung,
- viereckige, parabolische oder sonstige veränderliche Verläufe,
- benutzerdefinierte Koordinatensysteme,
- Ersatzknotenlasten und die Solver-Assemblierung,
- Eingabe per Mausklick auf einen Stab.
