# `@baustatik/fem`

## Purpose

Das ebene Stabwerksmodell: die drei Typen, aus denen ein Tragwerk besteht, und
die Regeln, wann sie zusammen ein tragfaehiges Modell ergeben.

```
Store        ->  Node/Beam/NodeSupport  ->  validateModel  ->  fem-solver
Rohdaten         DIESES PACKAGE             das Tor            die Rechnung
                                                            ->  fem-viewer
                                                                das Bild
```

Beide Seiten — Rechnung und Darstellung — sprechen dieses Vokabular. Deshalb
liegt es unter beiden und nicht in einer von ihnen.

## Boundaries

- Owns: `Node`, `Beam`, `NodeSupport`, die Regeln darueber
  (`validateModel`/`assertValidModel`), die zugehoerigen Fehler- und
  Warnungsklassen und die Graph-Auskunft `isolatedNodeIds`.
- Does not own: die LASTEN samt ihren Regeln (`@baustatik/fem-loads`), die
  Rechnung (`@baustatik/fem-solver`), die Darstellung (`@baustatik/fem-viewer`)
  und die Speicherung. Kein Zustand: kein Array, keine Map, kein `let`.
- Kennt keine Querschnitts- oder Materialkataloge. `crossSectionId` und
  `materialId` sind ids, keine Objekte; ob es sie gibt, prueft der, der die
  Steifigkeiten holt (siehe _Known constraints_).

## Dependencies

- `@baustatik/errors` — `BaustatikError` als Wurzel beider Hierarchien.

Das war frueher leer. Der Schritt ist bewusst und begruendet in
[ADR 0008](../../docs/adr/0008-model-rules-live-in-fem.md): wer den Typ besitzt,
besitzt seine Regeln — dieselbe Ordnung, nach der `fem-loads` in ADR 0006
entschieden wurde.

## Navigation

- [`src/types.ts`](src/types.ts): das Modell. Der Dateikopf traegt die Achsen-
  und Drehsinn-Konvention.
- [`src/validate.ts`](src/validate.ts): `validateModel`, `assertValidModel`.
- [`src/graph.ts`](src/graph.ts): `isolatedNodeIds` und die Zusammenhangs-
  komponenten.
- [`src/errors.ts`](src/errors.ts): vier Fehler und eine Warnung unter zwei
  Gruppenklammern.

## Domain language

- **Knoten** (`Node`) — ein Punkt mit id. `position` in **METERN**; ab `solve()`
  geht die Laenge als `L`, `L^2` und `L^3` in die Steifigkeit ein und muss zu
  `EA` in kN und `EI` in kNm^2 passen.
- **Stab** (`Beam`) — eine Kante zwischen zwei Knoten, mit Querschnitts- und
  Material-id. Ein Stab = ein Element; es gibt kein Meshing.
- **Gelenk** (`releases`) — ein freigesetzter Freiheitsgrad am Stabende. Heute
  nur `phiY`. Der Solver kondensiert ihn heraus.
- **Auflager** (`NodeSupport`) — je Richtung `fixed` oder `free`. Nur homogene
  Bedingungen: keine Federn, keine Vorverschiebungen, keine schiefen Auflager.
- **Teilstruktur** — eine Zusammenhangskomponente des Graphen. Der Begriff
  traegt M3: nicht „alles muss zusammenhaengen", sondern „keine Komponente ohne
  Halt".
- **Isolierter Knoten** — ein Knoten, an dem kein Stab haengt. Alles an ihm
  bleibt wirkungslos.

## Invariants and conventions

- **z zeigt nach unten.** Eine nach unten wirkende Groesse ist positiv.
- **Drehsinn**: das globale y zeigt aus der Zeichenebene, ein positives `phiY`
  dreht im Bild GEGEN den Uhrzeigersinn. Das ist NICHT der Drehsinn von `theta`
  in `fem-element`; es gilt `phiY = -theta`
  ([ADR 0005](../../docs/adr/0005-rotation-sense-phiy-versus-theta.md)).
- **Zwei Hierarchien, zwei Woerter.** `ModelValidationError` ist ein hartes Tor;
  `ModelValidationWarning` haelt nichts auf. `assertValidModel` ignoriert
  Warnungen.
- **Alle Befunde tragen ihre ids als FELDER**, nicht nur im Meldungstext — die
  Oberflaeche markiert daran das betroffene Element.
- **Die Hierarchie ist die Erweiterungsstelle.** Wer eine Modellregel braucht,
  die dieses Package nicht pruefen kann (weil ihr Wissen woanders liegt),
  leitet von `ModelValidationError` ab. `fem-solver` tut das mit
  `UnknownSectionPropertiesError`. Der Bericht bleibt dadurch EINE Liste.

## Validation

Geprueft wird:

|     | Regel                                           | Befund                      |
| --- | ----------------------------------------------- | --------------------------- |
| M1  | Stab oder Auflager zeigt auf unbekannten Knoten | `UnknownNodeReferenceError` |
| M2  | Stab der Laenge 0                               | `ZeroLengthBeamError`       |
| M3  | Teilstruktur ohne Auflager                      | `UnsupportedComponentError` |
| M4  | zwei Auflager auf einem Knoten                  | `DuplicateSupportError`     |
| M5  | Knoten ohne jeden Stab                          | `IsolatedNodeWarning`       |

**M1 schaltet M3 ab.** Faellt ein Stab wegen haengender Referenz aus dem
Graphen, saehe der Rest aus wie eine Teilstruktur ohne Auflager — ein
Folgefehler statt eines eigenen Befunds.

**M2 heisst nicht `DegenerateBeamError`.** Den Namen belegt `fem-loads` fuer den
lastseitigen Fall. Zwei Ausloeser, zwei Namen: der lastseitige faellt nur auf,
wenn zufaellig eine Last auf dem Stab liegt.

```text
pnpm --filter @baustatik/fem typecheck
pnpm --filter @baustatik/fem test
```

## Known constraints

- **Kinematik nur zur Haelfte.** M3 ist der statisch entscheidbare Teil: eine
  Komponente ohne Auflager ist garantiert singulaer, ohne dass ein
  Gleichungssystem noetig waere. Verschieblicher Rahmen, Gelenkkette und lauter
  parallele Auflager brauchen das Gleichungssystem und fallen im `fem-solver`
  auf.
- **Der Pendelstab wird NICHT verboten.** Ein Stab mit Gelenk an beiden Enden
  ist fachlich voellig zulaessig; erst die unverspannte Kette ist kinematisch,
  und die Unterscheidung braucht wieder das Gleichungssystem.
- **Unbekannte `crossSectionId`/`materialId` werden hier nicht geprueft** —
  dieses Package kennt die Kataloge nicht. Der Befund entsteht im `fem-solver`
  als Unterklasse von `ModelValidationError`.
- **`fem-viewer` hat weiterhin einen eigenen `UnknownNodeReferenceError.`** Die
  Zusammenlegung ist eine separate Aufraeumung; siehe ADR 0008.
