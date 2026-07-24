# Nachprüfen: drei Entscheidungen aus `validate.ts`

**Angelegt:** 2026-07-24 · betrifft `src/validate.ts`, `src/errors.ts`,
`tests/validate.test.ts`

Beim Bau von `validate.ts` (Schritt 3 aus [`HANDOFF.md`](HANDOFF.md)) musste ich
drei Dinge entscheiden, die nicht im Pseudocode standen. Alle drei sind so
umgesetzt, dass die Umkehrung billig bleibt — aber sie gehören angesehen, bevor
`fem-load-resolve` und der Viewer darauf aufbauen.

---

## 1. Fehler werden gesammelt UND geworfen

**Umgesetzt:** `validateLoads(model, loads)` gibt ein `LoadValidationError[]`
zurück (`src/validate.ts:101`); `assertValidLoads` wirft davon den ersten
(`src/validate.ts:112`). Die Fehlerklassen tragen `loadId`, `field`, `beamId`
als Felder, nicht nur im Meldungstext (`src/errors.ts`).

**Warum so:** Eine Lasteingabe kommt aus einem Dialog. Das ist keine verletzte
Precondition des Entwicklers, sondern ein Tippfehler des Anwenders — und der
will alle Beanstandungen auf einmal sehen und das falsche Eingabefeld markiert
bekommen, nicht eine nach der anderen. `.agents/rules/error-handling-in-libraries.md`
verlangt „laut und früh scheitern"; das leistet `assertValidLoads` für die
Rechenkette.

**Der Preis:** Zwei Einstiegspunkte statt einem, und `validateLoads` baut
`Error`-Objekte (inkl. Stacktrace) auch dann, wenn sie nur angezeigt werden.
Außerdem verliert `assertValidLoads` alle Fehler außer dem ersten.

**Alternativen, falls dir das nicht passt:**

- Nur werfen. Dann braucht der Dialog eine eigene Prüfung — dieselbe Regel
  zweimal, genau das, was Frage 7 im `fem-load-resolve`-Handoff vermeiden will.
- Nur zurückgeben, `resolve` ruft selbst `if (errors.length) throw`. Spart eine
  Funktion, verlagert aber die Gate-Disziplin in jeden Aufrufer.
- `assertValidLoads` wirft einen Sammelfehler (`AggregateError`-Stil) statt des
  ersten. Dann verliert man die `instanceof`-Unterscheidung an der Oberfläche
  der Ausnahme.

**Aufwand der Umkehr:** klein, solange nur die Tests dranhängen.

---

## 2. Kein Import aus `@baustatik/fem` — das Modell kommt als `LoadModelGeometry`

**Umgesetzt:** `src/validate.ts:52`

```ts
export type LoadModelGeometry = {
  hasNode(nodeId: string): boolean;
  beamAxis(beamId: string): Line | undefined; // p1 = Anfangs-, p2 = Endknoten
};
```

Dependencies des Packages sind damit genau `@baustatik/errors` und
`@baustatik/fem-geometry`.

**Warum so:** Die Zeile „Dependencies" in der Entschieden-Tabelle des Handoffs
begründet die Auslagerung von `resolve` damit, dass das reine Eingabemodell
sonst `fem-geometry` **und** `fem` mitzöge. Gebraucht werden aber nur zwei
Auskünfte über die Geometrie. Die Abbildung `Beam → Line` leistet der Aufrufer,
der `@baustatik/fem` ohnehin kennt (Viewer, Store, `fem-load-resolve`).

**Der Preis:** Jeder Aufrufer schreibt sich den Adapter selbst — drei bis fünf
Zeilen, und wenn es drei Aufrufer werden, steht er dreimal da. Außerdem weicht
die Signatur von der im `fem-load-resolve`-Handoff vorgeschlagenen ab
(`resolveLoads(model: { nodes, beams }, loads)`), d. h. die beiden Packages
sprechen unterschiedlich über dasselbe Modell.

**Alternativen:**

- `@baustatik/fem` als Dependency aufnehmen und `{ nodes, beams }` entgegen-
  nehmen — bequemer für Aufrufer, kostet die Abhängigkeitsfreiheit.
- Interface behalten, aber eine Hilfsfunktion `modelGeometry(nodes, beams)`
  danebenstellen. Die müsste dann dort leben, wo `fem` schon hängt (z. B. in
  `fem-load-resolve`), sonst holt man sich die Dependency durch die Hintertür.

**Aufwand der Umkehr:** klein, aber der Zeitpunkt zählt — sobald der Viewer und
`resolve` je einen eigenen Adapter haben, ist die Zeile schwerer wieder
einzusammeln.

---

## 3. Die `referenceLength` der Einzellast wird nicht beanstandet

**Umgesetzt:** `referenceLengthOf` (`src/validate.ts:326`) liefert bei
`distribution: 'point'` und bei allen Momentlasten `undefined`; die Prüfung auf
projizierte Länge 0 entfällt dort. Test:
„laesst die wirkungslose Bezugslaenge der Einzellast unbeanstandet".

**Warum so:** `p` ist in kN angegeben, nicht je Länge — `referenceLength` hat an
der Einzellast keine Wirkung (das ist offene Frage 6 im
`fem-load-resolve`-Handoff). Ein Feld ohne Wirkung darf keinen Fehler auslösen,
sonst lehnt die Validierung eine Eingabe ab, die rechnerisch völlig in Ordnung
ist.

**Der Preis:** `pointLoad({ referenceLength: 'verticalProjection' })` auf einem
waagrechten Stab geht stillschweigend durch, obwohl es nach einem Vertipper
aussieht.

**Hängt an einer offenen Frage:** Wird `BeamForceDirection` wie dort empfohlen
in Richtung + Bezugslänge aufgespalten und verliert `BeamForcePointLoad` das
Feld, erledigt sich dieser Punkt von selbst — dann kann man die Sonderbehandlung
in `referenceLengthOf` ersatzlos streichen. **Das ist die Entscheidung, die ich
als erste treffen würde**, weil sie `types.ts` betrifft und damit alles
Nachgelagerte.

**Verwandt, gleiche Familie:** Nur eine projizierte Länge von exakt 0 (bis auf
Toleranz `1e-9` relativ zu L, `src/validate.ts:68`) wird abgelehnt. Ein fast
waagrechter Stab mit `'verticalProjection'` verstärkt die Last um Größen-
ordnungen — rechnerisch korrekt, aber praktisch fast immer ein Eingabefehler.
Jede schärfere Schranke wäre willkürlich, deshalb steht hier keine. Falls du
eine willst: sie gehört an dieselbe Stelle.

---

## Was nicht zur Debatte steht

Diese Punkte sind aus dem Pseudocode (Abschnitt G in
`apps/demo/fem-viewer.ts`) direkt übernommen und stehen hier nur, damit sie
nicht versehentlich mitdiskutiert werden: nichtleere Ziel-Listen, unbekannte
ids werfen, `0 ≤ from ≤ to ≤ L` bzw. `≤ 100` bei `relativeDistances`,
Knotenlast braucht mindestens eine wirkende Komponente, projizierte Länge 0 am
Streckenlastfall ablehnen. Dazu kommt als einzige Zutat, die nicht im
Pseudocode stand, die Endlichkeitsprüfung aller Werte (`NaN`/`Infinity`) — nach
demselben Argument wie in `fem-element`: ungeprüft landet das still in der
globalen Steifigkeitsmatrix, weit weg von der Ursache.
