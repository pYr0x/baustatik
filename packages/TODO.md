# Ausbauplan Monorepo — offen

Stand: 2026-07-29. Diese Liste enthält bewusst nur noch offene Arbeit und
Entscheidungen, die dafür wichtig bleiben. Erledigte Stufen sind in ADRs,
`CONTEXT.md`, Changelogs und Tests festgehalten — nicht hier.

## Nächste sinnvolle Wege

| Strang | Nächster Schritt | Warum |
| --- | --- | --- |
| FEM-Viewer | Streckenlasten zeichnen | Punktlasten, Momente und Gelenke sind sichtbar; Streckenlasten sind die verbleibende grundlegende Lastart. |
| FEM-Viewer | Schnittgrößen grafisch darstellen | Die Rechenwerte und exakten Auswertungsstellen existieren bereits. |
| FEM-Rechnung | Lastkombinationen und Hüllkurven | Baut auf Lastfällen und den vorhandenen Schnittgrößen-Auswertungen auf. |
| Querschnitte | Werte → Profilkatalog → Solver-Anschluss | Liefert echte Steifigkeiten, bevor ein Editor gebaut wird. |

Der Viewer- und der Querschnittsstrang können unabhängig weiterlaufen.

## 1. Streckenlasten im Viewer

Streckenlasten brauchen einen eigenen Entwurf; sie sind nicht nur eine Reihe
von Punktlastpfeilen. Die Darstellung soll Lastlinie und Stab über eine Fläche
(inklusive Trapezform bei veränderlicher Intensität) verbinden und die
Bezugslänge klar machen.

Vor der Umsetzung ist die gemeinsame Skalierungsregel festzulegen:

- Eine Referenzgröße bezieht sich auf **alle sichtbaren Lasten des aktiven
  Lastfalls**, damit unterschiedliche Intensitäten erkennbar bleiben.
- Symbole bleiben screen-konstant, während die fachliche Größe über Länge bzw.
  Höhe lesbar skaliert wird.
- Beschriftungen müssen dieselben effektiven (also bereits mit
  Lastfallfaktor versehenen) Werte zeigen wie die Rechnung.

Diese Regel sollte anschließend auch die Basis für Diagramm-Skalierung sein;
keine zweite, leicht abweichende Skalierungslogik einführen.

## 2. Gemeinsame View-Policy, wenn sie gebraucht wird

Die vorhandenen Viewer-Styles reichen für einzelne Symbole. Sobald
Streckenlasten und Schnittgrößendiagramme eine gemeinsame Skalierung, Farben
oder Sichtbarkeit brauchen, werden diese Optionen als View-Policy gebündelt.

Sie folgt nur dem Zusammensetzungsmuster der `AnalysisPolicy` (Paket-Slices
und Default im Composition Root), **nicht** deren Persistenz- und
Versionsstrenge: Anzeigeeinstellungen dürfen bei fehlenden Feldern auf
Defaults fallen.

## 3. Schnittgrößen grafisch darstellen

Darstellen von `N`, `V` und `M` entlang des Stabs, auf Basis der vorhandenen
`ElementEvaluationState`-Daten und `internalForcesAt` /
`internalForcesAlong`.

- Nicht über ein grobes Raster approximieren: die vom Rechenkern gelieferten
  Last-, Segment- und Extremstellen verwenden.
- Die Skalierung aus dem Streckenlast-Thema wiederverwenden.
- Vor dem UI-Entwurf festlegen, ob mehrere Größen gleichzeitig oder bewusst
  einzeln sichtbar sind; Lesbarkeit hat Vorrang vor Vollständigkeit.

## 4. Lastkombinationen und Hüllkurven

Ein neues Kombinationsmodul übernimmt die normative Kombination; `fem-loads`
bleibt Eigentümer von Lastfällen und `actions` von der reinen
Einwirkungs-Vokabel. Keine ψ- oder γ-Werte in diese bestehenden Pakete ziehen.

Wichtige Anforderungen für den Entwurf:

- Kombinationen sind gewichtete, lineare Superpositionen von Lastfällen.
- Gegensätzliche Varianten derselben Einwirkung (z. B. Wind links/rechts)
  brauchen eine ausschließende Gruppe; eine Kategorie allein drückt das nicht
  aus.
- Hüllkurven bewahren die **zugehörigen** Werte: Beim maßgebenden `M` müssen
  gleichzeitig wirkendes `N` und `V` abrufbar bleiben. Drei unabhängige
  Min-/Max-Listen reichen für Bemessung nicht aus.
- Die Extremwertsuche nutzt die exakten Stützstellen des Abschnittskraft-
  Verlaufs.

## 5. Querschnitte und echte Stabsteifigkeiten

Die getroffenen Entscheidungen stehen in
[ADR 0020](../docs/adr/0020-section-properties-versus-section-stiffness.md),
[0021](../docs/adr/0021-section-values-separate-from-tabulated-profiles.md),
[0022](../docs/adr/0022-stress-points-are-computed-from-a-template.md) und
[0023](../docs/adr/0023-cross-sections-belong-to-the-model.md); die
Arbeitspläne selbst (`plan*.md`) sind nicht versioniert.

Reihenfolge:

1. ~~Parametrische Querschnittswerte im Rechenkern~~ — erledigt:
   `@baustatik/cross-section` liefert `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` und κ
   aus vier geschlossenen Formen. Widerstandsmomente und Hauptachsenwinkel
   kommen erst mit der Bemessung; Polygone werden durch die
   Closed-Form-Entscheidung nicht gebraucht.
2. ~~Stahlprofilkatalog als Daten mit nachweisbarer Quelle~~ — erledigt:
   `@baustatik/steel-profiles`, 18 IPE + 24 HEA. Tabellen- und nachgerechnete
   Werte bleiben unterscheidbar, weil sie in getrennten Packages wohnen.
3. ~~Adapter auf `SolverConfig.getSectionStiffness`~~ — erledigt:
   `@baustatik/fem-section-resolve`. Die Demo rechnet mit IPE 300 aus S235.
4. Erst danach ein Querschnittseditor. **Offen.**

Ein Profilkatalog, der den Solver versorgt, ist bereits ein sinnvoller
Zwischenstand. Ein Editor ohne Rechenkern nicht.

Offen geblieben ist außerdem: der geschlossene Kasten hat noch keine
Spannungspunkt-Vorlage — ihm fehlen die **Referenzdaten**, nicht die Theorie
(`closedBoxPath` hat den umlaufenden Weg, κ fällt daraus); er wartet auf die
QRO-Daten mit ihren Bogentangenten. Und `It` fehlt — dort wirkt die
`idealisation` wieder, und zwischen `⅓Σl·t³` und Bredt liegen drei
Zehnerpotenzen.

Die Idealisierung steuert seit
[ADR 0029](../docs/adr/0029-stress-points-follow-the-idealisation.md) κ **und**
die Spannungspunkte. Bewusst noch nicht angefasst:

- **Das positionierte Wandmodell — teilweise beantwortet.**
  [ADR 0030](../docs/adr/0030-the-section-editor-stores-a-wall-graph.md) hat die
  **Speicherform** entschieden: `SectionGeometry` ist ein Graph mit Identität je
  Abschnitt (`SectionNode`, `Wall` mit String-Ids), und genau deshalb kann ein
  Weg darauf eine Durchlaufordnung tragen. Offen bleibt der **Rechenweg**:
  `ShearSegment` ist weiterhin ein lageloser Energieakkumulator — `pathZ`
  benutzt dasselbe Gurtobjekt viermal —, also können κ und die Spannungspunkte
  nicht denselben Weg lesen. Ein Weg, der beides speist, bräuchte Startpunkt und
  Richtung je Abschnitt, und `Sy`/`Sz` kämen aus zwei verschieden
  parametrisierten Wegen, deren Stationen korreliert werden müssten. Danach
  blieben zwei Maschinen — aber jede nur noch für ihren Fall zuständig. Wer die
  Auflösung Graph → lagerichtige Geometrie besitzt (der Viewer hat sie schon),
  ist ebenfalls noch offen.
- **`i-shape` mit unabhängigen Gurten**, das I und T subsumiert (T = Grenzfall
  `tf,unten = 0`). Das ist eine Formänderung im Modellsatz, kein Aufräumen.

## Dauerhafte Leitplanken

- Die FEM-Rechnung bleibt unabhängig von Auswahl- und Darstellungszustand.
  Der Viewer zeigt genau einen von der Anwendung gewählten Lastfall; der Solver
  bekommt die Lastfall-ID als Eingabe.
- Auswertungsdaten müssen beim Ergebnis verbleiben und serialisierbar sein.
  Ein abgelegtes Ergebnis darf für Schnittgrößen nichts am aktuellen Modell
  nachlesen müssen.
- Fachliche Skalierung und Bildschirmgeometrie getrennt halten: Lasten,
  Gelenke und Beschriftungen bleiben bei Zoom lesbar.
