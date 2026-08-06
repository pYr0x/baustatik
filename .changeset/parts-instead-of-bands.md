---
'@baustatik/cross-section': patch
---

Aus dem „Band" wird die **Teilfläche**, aus der „Bandmaschine" das
**Umrissmodell**. Nur Namen und Kommentare — keine Zahl bewegt sich, und die
öffentliche API ist nicht betroffen (`Part`, `OutlinePart` und `partSegments`
sind package-intern, `src/index.ts` exportiert sie nicht).

- **„Band" war erfundenes Vokabular.** Es steht in keinem Lehrbuch und in keinem
  Programm. Die Literatur nennt das Stück, aus dem ein zusammengesetzter
  Querschnitt gerechnet wird, **Teilfläche** — „das statische Moment der
  Teilfläche mal Abstand Teilschwerpunkt bis Gesamtschwerpunkt" ist genau das,
  was `momentBefore` tut. Dlubal nennt dasselbe in RSECTION/SHAPE-THIN
  *Element*; der Name ist hier vergeben, im Monorepo ist ein Element ein
  FE-Element.
- **`Segment` war schon zweimal vergeben** und schied deshalb als Ersatz aus:
  `ShearSegment` (`shear.ts`) ist der Abschnitt des Schubflusswegs, `Segment`
  (`types.ts`, exportiert) das Wandsegment eines dünnwandigen Querschnitts.
  Englisch heißt die Teilfläche jetzt `Part` — bewusst formneutral, siehe unten.
- **„Bandmaschine" war ein Gerät, wo ein Modell hingehört.** Der Begriff stand
  als Gegenstück zu **Wandmodell** in zwei Tabellen (`CONTEXT.md`,
  `stress-points/index.ts`). Beide Seiten heißen jetzt gleichrangig:
  **Umrissmodell** (Grashof, Schnitte durch die volle Umrissfigur) gegen
  **Wandmodell** (Schubfluss längs der Wandmittellinien).

**Zwei Kommentare waren sachlich falsch und sind mitkorrigiert:**

- `OutlinePart.from`/`to` laufen **längs** der Schnittkoordinate, `width` misst
  quer dazu — `shear.ts` behauptete beim Typ das Gegenteil („ein Band quer zur
  Schubrichtung"), während die Funktion darunter richtig „längs" schrieb. Die
  Teilflächen haben **keine gemeinsame Gestalt**: beim I ist der Gurt 8,5 mm
  hoch und 100 mm breit, der Steg 183 von 200 mm hoch und 5,6 mm breit. Es wird
  nicht in dünne Scheiben zerlegt und summiert, sondern über zwei bis drei
  Teilflächen geschlossen integriert.
- **`width` kann eine Summe über getrennte Bereiche sein**, und das stand
  nirgends. Beim I in y-Richtung liefert `widthAt` außerhalb des Stegs `2*tf` —
  der senkrechte Schnitt trifft Ober- **und** Untergurt, zwei Flächen, die sich
  nicht berühren. Für `S` und für den Nenner von Grashof ist das richtig, beim
  Lesen aber überraschend; jetzt steht es bei `OutlinePart`, bei `widthAt` und
  an der Stelle in `compact.ts`, wo die `2*tf` hingeschrieben werden.

`Teilfläche` und `Umrissmodell`/`Wandmodell` stehen ab jetzt unter
**Domänensprache** in `packages/cross-section/CONTEXT.md`, mitsamt den
Begriffen, die ausdrücklich *nicht* gemeint sind: „Streifen" ist Hillerborgs
Plattenverfahren, und eine „Lamelle" ist im Stahl- und Betonbau das
aufgeschweißte bzw. aufgeklebte Blech.
