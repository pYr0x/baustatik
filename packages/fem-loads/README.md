# @baustatik/fem-loads

Fachliches Lastmodell für ebene Stabwerke. Das Package definiert Knoten- und
Stablasten und validiert sie, bevor sie in die weitere FEM-Rechenkette gelangen.

## Installation

```bash
npm install @baustatik/fem-loads
# oder
pnpm add @baustatik/fem-loads
```

## Zuständigkeit

`@baustatik/fem-loads` besitzt:

- `NodeLoad` und `BeamLoad` einschließlich ihrer Diskriminanten
  (`target`, `kind`, `distribution`),
- die Vorzeichen- und Bezugs­längen-Konventionen des ebenen Stabwerks,
- `validateLoad()` und `validateLoads()` für die Eingabeoberfläche,
- `assertValidLoads()` als Tor vor der Rechenkette,
- die `LoadValidationPolicy` — die Stellschrauben dieser Regeln samt Default,
  Factory und striktem Parser.

Das Package löst abstrakte Lasten noch nicht in lokale Elementlasten auf. Diese
Aufgabe gehört zu `@baustatik/fem-load-resolve`; Assemblierung und Rechnung
beginnen in `@baustatik/fem-solver`.

## Schnellstart

Eine Knotenlast enthält die globalen Komponenten direkt. `z` zeigt nach unten,
deshalb ist eine nach unten wirkende Last positiv:

```typescript
import type { NodeLoad } from '@baustatik/fem-loads';

const load: NodeLoad = {
  id: 'load-node-1',
  target: 'node',
  nodeIds: ['node-2'],
  fz: 10,
};
```

Eine punktuelle Stabkraft besteht aus Betrag, Richtung und Position:

```typescript
import type { BeamForcePointLoad } from '@baustatik/fem-loads';

const load: BeamForcePointLoad = {
  id: 'load-point-1',
  target: 'beam',
  beamIds: ['beam-1'],
  kind: 'force',
  distribution: 'point',
  frame: 'global',
  axis: 'z',
  p: 10,
  distanceFromStart: 50,
};
```

Vor der Auflösung oder Assemblierung werden die Lasten validiert:

```typescript
import { assertValidLoads, modelGeometry } from '@baustatik/fem-loads';

const geometry = modelGeometry(nodes, beams);
assertValidLoads(geometry, loads);
```

## Abweichende Prüfschranken

Die drei Zahlen, gegen die geprüft wird — Stationstoleranz, harte
Mindest-Projektionsrate und Warnschwelle — stehen in der
`LoadValidationPolicy`. Wer sie ändert, **bindet** sie einmal statt sie an jeden
Aufruf zu hängen:

```typescript
import { createLoadValidationPolicy, createLoadValidator } from '@baustatik/fem-loads';

const policy = createLoadValidationPolicy({ suspiciousReferenceFactor: 0.1 });
const validator = createLoadValidator(policy);

validator.validateLoad(geometry, draft); // Eingabedialog
validator.assertValidLoads(geometry, loads); // Rechenkette
```

Das ist kein Stilfrage: ein optionales drittes Argument wird vergessen, und dann
akzeptiert der Eingabedialog, was der Rechnen-Knopf ablehnt. Die freien
Funktionen `validateLoad`, `validateLoads` und `assertValidLoads` sind die
Ausgänge des Default-Validators und bleiben zweiargumentig.

In einer Anwendung mit Solver kommt die Policy aus der Analyse-Einstellung, und
beide Seiten bekommen dasselbe Objekt:

```typescript
import { createAnalysisPolicy, createFEMSolver } from '@baustatik/fem-solver';

const analysis = createAnalysisPolicy({ loads: { suspiciousReferenceFactor: 0.1 } });

const solver = createFEMSolver({ ...ports, analysisPolicy: analysis });
const dialogValidator = createLoadValidator(analysis.loads);
```

`parseLoadValidationPolicy(unknown)` liest eine gespeicherte Policy zurück und
lehnt fehlende, unbekannte oder falsch getypte Felder ab.

## Dokumentation

- [API- und Typreferenz](docs/usage.md)
- [Vollständige Lastbeispiele](docs/load-examples.md)
- [Paketgrenzen, Invarianten und Fachbegriffe](CONTEXT.md)

## Konventionen auf einen Blick

- Eine Knotenlast ist komponentenweise (`fx`, `fz`, `my`) und kann Kraft und
  Moment gemeinsam enthalten.
- Eine Stablast ist entweder eine Kraft oder ein Moment. Bei einer Kraft werden
  Bezugssystem und Achse separat gewählt.
- Eine Last kann mehrere Knoten oder Stäbe als Ziel haben; die Zielliste darf
  nicht leer sein.
- Eine konstante Stab-Streckenlast liegt immer über der gesamten Stablänge.
  Ein konstanter Teilabschnitt wird als Trapezlast mit `q1 === q2` modelliert.
- `p` bezeichnet eine punktuelle Kraft in kN, `q`/`q1`/`q2` eine Kraft pro
  Länge in kN/m. Bei Momenten gelten analog kNm beziehungsweise kNm/m.

Die ausführliche Begründung der Modellentscheidungen und die vollständigen
Validierungsregeln stehen in den verlinkten Dokumenten.
