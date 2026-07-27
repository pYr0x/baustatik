# `@baustatik/actions`

## Purpose

Das gemeinsame Vokabular fuer Einwirkungen nach EN 1990 — welcher Art eine
Einwirkung ist, nicht wie stark sie wirkt und nicht wie sie kombiniert wird.

Ein Lastfall in `@baustatik/fem-loads` traegt optional eine `ActionCategory`.
Er **speichert** sie und deutet sie nie.

## Boundaries

Owns:

- `ActionCategory` — Klassifikation nach EN 1990 §4.1.1 (`action`) mal konkrete
  Einwirkung (`kind`), fuer Nutzlasten zusaetzlich die Nutzungskategorie nach
  EN 1991-1-1 Tab. 6.1/6.2.

Does not own:

- **psi-Werte, Teilsicherheitsbeiwerte, Kombinationsregeln.** Dieses Package
  traegt die Begriffe, nicht die Tabelle. Die Werte sind national verschieden
  und gehoeren mit Herkunftsangabe je Datensatz dorthin, wo sie ausgewertet
  werden — Muster ist `packages/material/src/national-annex.ts` (ADR 0001).
- **Sich ausschliessende Gruppen.** „Wind von links" und „Wind von rechts" sind
  zwei Lastfaelle derselben Einwirkung und duerfen nie gleichzeitig in einer
  Kombination stehen. Diese Beziehung drueckt die Kategorie nicht aus, und sie
  soll auch nicht dafuer missbraucht werden.
- **Den Bauwerksstandort.** Der Nationale Anhang unterscheidet psi0 fuer Schnee
  nach Orten bis/ueber NN+1000 m. Das ist Eigenschaft des Standorts, nicht der
  Einwirkung; eine spaetere psi-Funktion bekommt ihn als zweites Argument.

## Dependencies

**Keine** — auch nicht `@baustatik/errors`. Das ist Absicht, siehe Invarianten.

Downstream: `@baustatik/fem-loads`; spaeter zusaetzlich die Kombinatorik.

## Navigation

- `src/types.ts` — `ActionCategory`, der gesamte Inhalt des Packages.

## Domain language

- **Einwirkung** — die physikalische Ursache (Eigengewicht, Schnee, Wind). Sie
  ist nicht dasselbe wie ein Lastfall: „Wind von links" und „Wind von rechts"
  sind zwei Lastfaelle **einer** Einwirkung.
- **Klassifikation** (`action`) — staendig, veraenderlich, aussergewoehnlich.
  Die Achse, nach der EN 1990 die Einwirkungen einteilt.
- **Nutzungskategorie** (`useCategory`) — A bis E nach EN 1991-1-1, gilt nur
  fuer Nutzlasten. NICHT zu verwechseln mit der Klassifikation.

## Invariants and conventions

- **Blatt ohne Abhaengigkeiten.** Die Kombinatorik wird spaeter `LoadCase` aus
  `fem-loads` brauchen, haengt also daran. Lebte die Kategorie dort, muesste
  `fem-loads` umgekehrt an der Kombinatorik haengen — ein Zyklus gegen die
  Richtung in `AGENTS.md`. Ein Blatt ist der einzige azyklische Ort fuer
  Vokabular, das beide brauchen. Siehe ADR 0015.
- **Keine Validierung, weil kein unmoeglicher Zustand darstellbar ist.** Der
  Union ist diskriminiert: eine Nutzungskategorie ohne Nutzlast laesst sich
  nicht schreiben, statt zur Laufzeit abgewiesen zu werden. Deshalb wirft dieses
  Package nichts und braucht `@baustatik/errors` nicht.
- **Diskriminanten ausgeschrieben**, nicht als Eurocode-Buchstaben `G`/`Q`/`A` —
  die kollidieren mit den Symbolen fuer Lastwerte.

## Known constraints

- Noch nicht da: Verkehrslasten der Kategorien F bis H, Baugrundsetzung,
  „sonstige". Ergaenzen kostet heute nichts, weil niemand exhaustiv ueber den
  Union schaltet. Sobald eine psi-Abbildung existiert, ist jede neue Variante
  ein Breaking Change — `tests/types.test.ts` haelt diese Stelle mit einem
  `assertNever` offen.

## Validation

```text
pnpm --filter @baustatik/actions test
pnpm --filter @baustatik/actions typecheck
pnpm --filter @baustatik/actions build
```
