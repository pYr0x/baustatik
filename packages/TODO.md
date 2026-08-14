# Ausbauplan Monorepo — offen

Stand: 2026-08-08. Diese Liste enthält bewusst nur noch offene Arbeit und
Entscheidungen, die dafür wichtig bleiben. Erledigte Stufen sind in ADRs,
`CONTEXT.md`, Changelogs und Tests festgehalten — nicht hier.

## Nächste sinnvolle Wege

| Strang | Nächster Schritt | Warum |
| --- | --- | --- |
| FEM-Viewer | Streckenlasten zeichnen | Punktlasten, Momente und Gelenke sind sichtbar; Streckenlasten sind die verbleibende grundlegende Lastart. |
| FEM-Viewer | Schnittgrößen grafisch darstellen | Die Rechenwerte und exakten Auswertungsstellen existieren bereits. |
| FEM-Rechnung | Lastkombinationen und Hüllkurven | Baut auf Lastfällen und den vorhandenen Schnittgrößen-Auswertungen auf. |
| Querschnitte | Werte → Profilkatalog → Solver-Anschluss | Liefert echte Steifigkeiten, bevor ein Editor gebaut wird. |
| Policy | `analysisPolicy` modellgebunden: Snapshot v11, eigenes `schemaVersion` fällt | `sectionPolicy` ist das Muster; Plan: [`plan-refactor-policy.md`](plan-refactor-policy.md). **v10 ist mit P5 vergeben** (`thickWallRatio`, `shearCentreTolerance`), also nimmt der Refactor die nächste freie. |
| Projekt | Behälter und Persistenz entwerfen (ADR) | Der Behälter ist die App; die Tool-Dokumente sind die Datensatz-Einheiten. |

Der Viewer- und der Querschnittsstrang können unabhängig weiterlaufen; der
Policy-Strang (siehe §6) ebenso.

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

**Der erste benannte Anwärter `crossSectionStyle` steht.** Solange es zwei
Farben waren — schwarze Wandmittellinien gegen den orangen abgeleiteten Umriss
(ADR 0030/0037) —, blieben sie Modulkonstanten mit einer Begründung im JSDoc:
eine Option am Aufruf hätte eine Aussage über die Bedeutung der Lagen an den
Aufrufer verschoben. Mit dem FE-Netz und den drei Ergebnissymbolen sind Farbe,
Strichstärke und Punktgröße zu einer zusammenhängenden Anzeigefrage geworden,
und `CrossSectionStyle` in `cross-section-viewer/src/style.ts` ist die erste
Scheibe. Die Wandstärke gehört ausdrücklich **nicht** dazu: `Wall.t` ist Physik
in Millimetern, alles mit dem Suffix `Px` ist schematisch.

Offen bleibt die Bündelung selbst: eine gemeinsame Skalierungsregel über
Streckenlasten und Schnittgrößendiagramme (§1, §3), und erst mit ihr ein
zusammengesetzter View-Policy-Typ über beide Viewer.

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
QRO-Daten mit ihren Bogentangenten.

~~Und `It` fehlt.~~ **Erledigt mit P5**
([ADR 0040](../docs/adr/0040-the-wall-path-is-positioned.md),
[0041](../docs/adr/0041-two-figures-for-the-wall-path.md)): `It` steht als
geschlossener Ausdruck an jeder dünnwandigen Form, als Tabellenwert am
Walzprofil und als `4A_m²/∮(ds/t) + ⅓Σ_offen l·t³` am gezeichneten Wandgraphen.
Kompakt bleibt es `undefined` — dort ist es ein Randwertproblem. **Offen bleibt
eine externe Referenz**: der Katalog taugt nicht dafür (IPE 300: Wandgraph
`15,70` gegen tabellierte `20,12 cm⁴`, die Ausrundung), und ein U-Profil, an dem
sich die Handformel prüfen ließe, gibt es im Repo nicht.

Die Idealisierung steuert seit
[ADR 0029](../docs/adr/0029-stress-points-follow-the-idealisation.md) κ **und**
die Spannungspunkte, seit P5 außerdem `It`. Bewusst noch nicht angefasst:

- **Das positionierte Wandmodell — mit P5 zur Hälfte gebaut.**
  [ADR 0030](../docs/adr/0030-the-section-editor-stores-a-wall-graph.md) hat die
  **Speicherform** entschieden, ADR 0040 den **Rechenweg**: `Segment` ist
  vergeben und trägt Startpunkt, Richtung, Länge, `t` und `wallId` — und
  ausdrücklich **kein `S`**, weil `Sy` und `Sz` zwei verschieden
  parametrisierte Läufe über dieselbe Geometrie sind. Aus ihm fallen κ, der
  Schubmittelpunkt und `It`. **Was offen bleibt: die Spannungspunkte lesen ihn
  noch nicht** — sie verzweigen weiter über ihre Vorlagen, und für den
  gezeichneten Querschnitt gibt es gar keine. Damit ist die ursprüngliche
  Absicht, „κ und die Spannungspunkte fallen einmal gemeinsam", erst zur Hälfte
  eingelöst. Wer die Auflösung Graph → lagerichtige Geometrie besitzt (der
  Viewer hat sie schon), ist ebenfalls noch offen.
- **Mehrzeller (P6).** Bei genau einer Zelle kommt eine skalare
  Verträglichkeit dazu, deren Ergebnis ein konstanter Zuschlag auf `c0` ist; ab
  zwei Zellen sind es `n` gekoppelte Unbekannte, also ein Gleichungssystem. Bis
  dahin bleiben κ, `yM`/`zM` und `It` dort `undefined`, und das Gate meldet es
  mit `MultipleCellsWarning`. Dasselbe gilt für den unverbundenen Wandgraphen.
- **`i-shape` mit unabhängigen Gurten**, das I und T subsumiert (T = Grenzfall
  `tf,unten = 0`). Das ist eine Formänderung im Modellsatz, kein Aufräumen.

### Der Vollquerschnitt hat zwei Maschinen — offen seit P9

Seit [ADR 0045](../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)
und [ADR 0047](../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md)
liefert die FE κ, `It` und den Schubmittelpunkt für den **gezeichneten**
Vollquerschnitt. Der **parametrische** (`kind: 'shape'` + `idealisation:
'solid'`) behält sein Grashof-κ aus `shear.ts` — ihm fehlt der Polygonzug, den
die FE braucht.

**Das ist eine bekannte, offene Lücke, kein erledigter Zustand: ein Modell, zwei
Maschinen.** Und die entscheidende Messung ist gemacht
([`docs/messungen/t-querschnitt-grashof-gegen-fe.md`](../docs/messungen/t-querschnitt-grashof-gegen-fe.md)):

| Figur | `bf/bw` | Grashof gegen FE |
| --- | --- | --- |
| Plattenbalken 2000/200/250/500 | 8,0 | **+122 % … +134 %** |
| Plattenbalken 1000/150/300/600 | 3,3 | +34 % |
| Quadrat-T 300/150/150/300 | 2,0 | +16 % |
| Stahl-T 200/15/10/200 | 20,0 | +11 % |

Für das Rechteck waren es 0,08 %; für die T-Figur ist es das Hundertfache, und
Grashof liegt immer auf der **steifen** Seite. Der Grund ist die zweite Näherung,
nicht die erste: `τ = Q·S/(I·t)` mittelt über die Schnittbreite, und am Übergang
Gurt/Steg springt `t` um `bf/bw`. Die ν-Blindheit ist der kleinere Fehler.

Zwei Auswege, und **entschieden ist keiner**:

1. Die vier parametrischen Formen als Polygonzug ausschreiben, dann laufen sie
   durch dieselbe FE. Das ist ein eigenes Stück Arbeit und hat mit der FE nichts
   zu tun.
2. Grashof für den parametrischen Zweig behalten und es **am Feld sagen** — dann
   ist die Doppelung dokumentiert statt still.

Der Ausweg, der heute schon offen steht: wer FE-Werte für eine parametrische Form
will, **zeichnet die Figur**. Genau das tun die Vorgaben auf
`outline-sections.html`.

### Spannungspunkte für die gezeichnete Figur — offen

Sie kommen später aus dem **FE-Feld** und ausdrücklich **nicht** aus einer
zweiten Grashof-Maschine: `τ` liegt nach dem Lauf punktweise vor, und eine
Vorlage, die dieselbe Größe noch einmal näherungsweise rechnet, wäre die dritte
Meinung über dieselbe Figur. Was fehlt, ist die Frage, **welche** Punkte eine
gezeichnete Figur überhaupt hat — bei einer Vorlage sind es benannte Orte, bei
einem freien Umriss ist es eine Auswahl.

### Die Stufenkette — offen, und ein ADR lohnt noch nicht

Der Auflösungsschritt aus P9 ist die **erste Stufe** einer Kette, die später
mehrere haben kann: Querschnittswerte, dann Stabwerk, dann Bemessung — jede
rechnet, schreibt ihr Ergebnis in den Modellsatz und ist fertig; die nächste
liest von dort. Das Vorbild ist die Modulkette in SOFiSTiK (AQUA rechnet
Querschnitte in die Datenbank, STAR rechnet danach das Stabwerk und holt sie sich
von dort). Der Modellsatz — heute der Pinia-Store — ist diese Datenbank.

Gebaut ist davon **nichts weiter**: kein Ablaufsteuerer, keine
Abhängigkeitsverwaltung, kein automatisches Nachziehen. Bei zwei Stufen und einer
Kante wäre das eine Maschine, die gegen ein einziges Beispiel entworfen ist.

Offen sind zwei Fragen:

- **Die Steuerung.** „Rechne, was veraltet ist" — **ausgelöst, nicht reaktiv**.
  Reaktiv hieße ein Netz je Tastendruck; der Toleranzregler auf
  `outline-sections.html` feuert auf jedem `input`-Ereignis.
- **Die Tragfähigkeit des Pinia-Stores** als dieser Speicher. Zwei Regeln halten
  ihn heute: große Zahlenfelder kommen nicht hinein (das Netz bleibt transient,
  ADR 0039 — in den Satz gehen sieben Zahlen, nicht hunderttausend), und ein
  Ergebnis trägt alles bei sich, was zum Auswerten nötig ist (ADR 0019/0027).

Ein ADR dafür lohnt erst, wenn die **zweite** Stufe ansteht — vorher gäbe es nur
ein Beispiel, gegen das man entwerfen könnte. Was die erste Stufe erfüllt und
jede weitere erfüllen sollte, sind drei Eigenschaften: das Ergebnis trägt einen
Fingerabdruck seiner Eingabe, „abwesend / verweigert / gerechnet" sind drei
Zustände und nicht zwei, und eine Stufe ruft keine andere.

### Zwei Clipping-Bibliotheken in `geometry-2d` — offen seit P3

P3 hat `clipper2-ts` für die Aufweitung der Mittellinien eingezogen und lässt es
**auch** vereinigen: `Polygon.union` kann es nicht, weil `fromMartinez`
(`geometry-2d/src/polygon.ts`) je Ergebnispolygon nur Ring 0 behält und auf CCW
normalisiert — ein Loch überlebt das nicht, und der Umlaufsinn trägt seit
[ADR 0034](../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)
Bedeutung. Danach stehen **zwei** Clipping-Bibliotheken nebeneinander: martinez
für `union`/`intersect`/`subtract`, Clipper2 für Offset und die Vereinigung des
Wandgraphen.

Das ist bewusst so entschieden (der Austausch quer durch ein Package mit
fremden Verbrauchern gehört nicht in P3), aber es ist kein Endzustand. Zu
entscheiden bleibt, ob `clipper2-ts` martinez ganz ablöst:

- **Dafür:** eine Bibliothek statt zweier, Löcher und Verschachtelung fallen
  über `PolyTreeD` an, `fromMartinez` samt seiner Ring-0-Verkürzung entfällt,
  und die Zusage über den Umlaufsinn hat dann **eine** Grenze statt zweier.
- **Dagegen:** `union`/`intersect`/`subtract` haben Verbraucher ausserhalb des
  Querschnitts, deren Ergebnisse sich in der Punktzahl ändern würden. Die zweite
  Gegenrede der Sitzung — `clipper2-ts` stehe auf einem Prerelease — ist
  entfallen: eingezogen ist das freigegebene `2.0.1`, exakt gepinnt.
- **Voraussetzung:** ein Mehrringpolygon in `geometry-2d`. Solange `Polygon` ein
  EINZELNER Ring ist, kann keine Boolesche Operation ein Loch zurückgeben —
  unabhängig von der Bibliothek.

## 6. Das Projekt als Behälter — die Tool-Dokumente und ihre modellgebundenen Policies

**Der Befund, der diesen Abschnitt auslöst:** die `AnalysisPolicy` wird heute
**nirgends** persistiert. Typ, Default und der strikte `parseAnalysisPolicy`
existieren seit [ADR 0011](../docs/adr/0011-analysis-settings-split-into-versioned-policy-and-ports.md)
und tragen eine eigene `ANALYSIS_POLICY_SCHEMA_VERSION` (heute 2) — aber der
Parser hat bis heute **keinen produktiven Aufrufer**, und genau deshalb durfte
der Sprung 1 → 2 ohne Migrationspfad passieren (`fem-solver/CONTEXT.md`). Die
Einstellung erreicht die Rechnung ausschließlich zur Laufzeit über
`SolverConfig.analysisPolicy`. Das ändert sich: sie wird modellgebunden, wie es
`SectionPolicy` schon ist. Der Plan dafür steht in
[`plan-refactor-policy.md`](plan-refactor-policy.md).

### Die Gliederung, die gilt: Positionen sind Tools

```text
Projekt                       Name und die Angaben zum Bauvorhaben — gehört der APP
  ├─ FEM-2D-Stab (Tool)         Tool-Dokument: FEMModelSnapshot + AnalysisPolicy
  ├─ Querschnittseditor (Tool)  Tool-Dokument: Querschnitte + SectionPolicy
  ├─ Bemessung (Tool)           später — Stahlbeton und Stahl, eigene Policy
  └─ … weitere Norm-Nachweise   als weitere Tools
```

Eine **Position** ist kein Datenbehälter, sondern ein **Tool**: FEM-2D-Stab,
Querschnittseditor, später die Bemessung (Beton und Stahl) und weitere
normbezogene Nachweise. Jedes Tool hat ein eigenes Dokument, das gespeichert
und geöffnet wird. Die FEM-2D-Stab-Position ist der `FEMModelSnapshot`
(zusammen mit der `AnalysisPolicy`); das Querschnitts-Dokument sind die
Querschnitte des Editors — die **Quelle**, aus der eine Position nach ADR 0027
kopiert, nicht der Ort, den die Rechnung liest.

**Die `AnalysisPolicy` gehört zu EINER Position, nicht zum Projekt.** Ob eine
Position schubsteif oder schubweich gerechnet wird, ist eine Entscheidung über
diese Position; zwei Positionen desselben Projekts dürfen sie verschieden
treffen. Dasselbe sagt
[ADR 0033](../docs/adr/0033-the-cross-section-has-a-creation-policy.md) für die
`SectionPolicy`: die Frage ist immer, über welchen Gegenstand die Einstellung
urteilt.

### Die Policy ist modellgebunden — der Stand des Austauschs

- **Eine Policy gehört zum Datensatz ihres Tools, nicht zum Code.** Vollständige
  effektive Werte, serialisiert, nie still durch eine Package-Änderung
  überschrieben. Genau das ist die Linie aus ADR 0011 und ADR 0033.
- **Eine Version je Datensatz (= Tool-Dokument).** Die offene Frage „wie viele
  `schemaVersion` trägt eine Projektdatei?" ist damit beantwortet: eine pro
  Tool-Dokument, plus eine für die Projekt-Hülle (Name, Bauvorhaben, Verweise).
  Eigene Zähler auf Policies (`ANALYSIS_POLICY_SCHEMA_VERSION`) wären die
  „zweite Wahrheit über dieselben Bytes", gegen die ADR 0033 argumentiert.
- **Migration verhält sich wie ein Programm-Update.** Ändert ein Package
  Berechnungsgrundlagen oder Toleranzen, muss die Datei migriert werden, und
  der Anwender bestätigt. Ausgelöst wird die Migration von der **Version am
  Datensatz**; ausgeliefert wird das Migrationswissen in der **Package-Version**
  ([ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md):
  Format-Version ≠ Paket-Version). „Gespeichert mit Programmversion x" darf es
  als Metadatum geben, treibt aber nichts.
- **`sectionPolicy`: Form korrekt, Ort ist eine Brücke.** Vollständig, strikt,
  Pflicht, kein eigenes `schemaVersion` — so bleibt es. Ihre heutige Lage im
  FEM-Snapshot besteht nur, weil es keinen anderen Behälter gibt; mit dem
  Querschnitts-Dokument zieht sie dorthin (die Drift-Prüfung braucht die
  Toleranz **neben** dem Umriss, und beides zieht gemeinsam). Der Viewer-Port
  bleibt: er ist strukturell nötig, weil `discretisationTolerance` die Zeichnung steuert —
  den FEM-Viewer erreicht eine Policy dagegen nie, er zeichnet das Modell, nicht
  die Einstellung.
- **`analysisPolicy`: wird modellgebunden.** Pflichtfeld im FEM-Tool-Dokument,
  und das ist dann **die nächste freie Snapshot-Version** — nicht mehr v11: die
  ist mit P9 vergeben (`FEElements` in der `SectionPolicy`, `feValues` in
  `SectionGeometry`, `nu?` in `ElasticModuli`,
  [ADR 0045](../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)/[0047](../docs/adr/0047-the-solid-section-fe-lives-in-its-own-package.md)),
  wie v10 mit P5
  ([ADR 0040](../docs/adr/0040-the-wall-path-is-positioned.md)). **Eine Nummer
  im Voraus zu reservieren hat sich damit als Fehler erwiesen** — die Version
  gehört dem Vorgang, der sie bricht, und nicht dem, der sie zuerst aufschreibt.
  Eigenes `schemaVersion` fällt im selben Schritt — erst adoptieren, dann Version
  entfernen. Form, Composition-Root und Striktheit
  bleiben, wie sie sind. Plan: [`plan-refactor-policy.md`](plan-refactor-policy.md).
- **Eigenes Package für den Projekt-Behälter: nein.** Die Tool-Dokumente sind
  Packages (das FEM-Dokument ist es schon, in `@baustatik/script`); der
  Behälter selbst — Name, Bauvorhaben, Verweise — ist die App. Die oberste
  Ebene des Graphen bleibt die Composition Root der Anwendung, nicht eine
  Bibliothek.

### Was dabei nicht neu zu erfinden ist

Die Form steht: vollständige effektive Werte statt Abweichungslisten, die
Datensatz-Version zuerst und dann die Gestalt prüfen, jede Scheibe wird von
ihrem Eigentümer geparst und dessen Fehlerklasse reist unverändert nach außen.
`parseFEMModelSnapshot` ruft künftig `parseSectionPolicy` **und**
`parseAnalysisPolicy` — er prüft deren Formen nicht ein zweites Mal.

## Schemabrüche und Changesets, solange es keine Abnehmer gibt — entschieden

**Entschieden mit [ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md).**
Bis zur ersten Freigabe sind alle Paketversionen `0.0.0`, jeder Changeset ist
`patch`, und Breaking Changes stehen im Changelog-Text, nicht in der
Versionsarithmetik. `schemaVersion` ist ein Datenformat-Zähler, kein Paket-Semver,
und zählt weiter — ein Schemabruch löst also **kein** `major` mehr aus. Die erste
echte Freigabe startet bewusst bei `1.0.0`. Offen bleibt nur, welcher Moment die
erste Freigabe auslöst (der erste externe Abnehmer? die erste gespeicherte
Datei?) — an der Policy ändert die Antwort nichts.

## Dauerhafte Leitplanken

- Die FEM-Rechnung bleibt unabhängig von Auswahl- und Darstellungszustand.
  Der Viewer zeigt genau einen von der Anwendung gewählten Lastfall; der Solver
  bekommt die Lastfall-ID als Eingabe.
- Auswertungsdaten müssen beim Ergebnis verbleiben und serialisierbar sein.
  Ein abgelegtes Ergebnis darf für Schnittgrößen nichts am aktuellen Modell
  nachlesen müssen.
- Fachliche Skalierung und Bildschirmgeometrie getrennt halten: Lasten,
  Gelenke und Beschriftungen bleiben bei Zoom lesbar.
