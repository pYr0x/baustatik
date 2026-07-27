# Ausbauplan Monorepo

Stand: 2026-07-26. Deine Notizen, gegen den Ist-Code gelesen und sortiert.
Kein Implementierungsplan — eine Richtung mit Reihenfolge und Begründung.

---

## Kurzfassung: was ich zuerst machen würde

| # | Schritt | Aufwand | Warum jetzt |
| --- | --- | --- | --- |
| 0 | ~~Staborientierung: Test + Doku~~ | erledigt 2026-07-26 | War schon korrekt implementiert — jetzt festgenagelt und dokumentiert |
| 1 | ~~Lastfall-Begriff einführen~~ | erledigt 2026-07-26 | ADR 0013–0015; siehe „Stufe 1" unten |
| 2 | `internalForces` in `fem-element` + Verlauf-API im Solver | mittel | Höchster Nutzen pro Aufwand, Naht liegt fertig |
| 3 | ~~Punktlasten: Kräfte und Momente gezeichnet~~; danach Linienlasten | erledigt 2026-07-27 / mittel | Punktlast ist abgeschlossen, Linienlasten sind ein eigener Plan |
| 4 | ViewPolicy | klein | Erst wenn es genug zu stylen gibt |
| 5 | Schnittgrößen grafisch | mittel | Braucht 2 + 4 |
| 6 | Lastkombinationen, min/max | mittel | Braucht 1 + 2 |
| 7 | Querschnitte: Katalog → Werte → Editor | groß | Eigener Strang, läuft parallel |

---

## Bestandsaufnahme deiner fünf Punkte

### A. Staborientierung — **ist bereits da**

Genau das Verhalten, das du beschreibst, steht schon in
`fem-geometry/src/line.ts:66` (`Line.frame`): `ex` zeigt vom Anfangs- zum
Endknoten, `ez` entsteht daraus durch dieselbe Drehung, die global x nach z
überführt — `(dx, dz) → (−dz, dx)`.

- Stab von links nach rechts: `ex = (1, 0)` → `ez = (0, 1)`, lokal z nach unten.
- Stab von rechts nach links: `ex = (−1, 0)` → `ez = (0, −1)`, lokal z nach oben.

Das ist die von dir gewünschte Konvention, und sie hängt an genau einer Stelle:
`fem-load-resolve` benutzt `Line.toLocal` für `frame: 'local'`, und dieselbe
Basis trägt die 6x6-Transformation im Solver. Es gibt hier **nichts global
nachzuziehen**.

Sichtbar gemacht am 2026-07-26 — **erledigt**:

- `fem-geometry/tests/line.test.ts`: ein waagrechter Stab von +x nach −x nagelt
  `ez = (0, −1)` fest, läuft in der `normalVector`-Tripwire mit, und `toLocal`
  zeigt dieselbe globale Last am umgedrehten Stab gekippt.
- `fem-load-resolve/tests/resolve.test.ts`: dieselbe globale Streckenlast auf
  `h` und auf `rev` (derselbe Stab, vertauschte Knoten) — die lokalen
  Komponenten kippen; dazu die Lage, die vom Anfangsknoten misst und deshalb
  am umgedrehten Stab am anderen Ende landet.
- Je ein Abschnitt „Stabrichtung = Knotenreihenfolge, und die legt lokal z fest"
  in `fem-geometry/CONTEXT.md` und `fem-loads/CONTEXT.md`.

### B. Lastfälle — **fehlen, und sie sind der Engpass**

`fem-loads/src/types.ts` sagt im Kopf ausdrücklich „keine Lastfälle", und
`HANDOFF.md:196` hat die id bewusst weggelassen: *„Bewusst kein `loadCaseId` im
Typ — eine ID ohne Besitzer lädt zu einem Fake-Default ein, Nachrüsten ist ein
Einzeiler."* Diese Entscheidung war richtig. Der Einzeiler ist jetzt fällig.

Der Grund für die Dringlichkeit ist nicht der Lastfall selbst, sondern was
gerade daneben gebaut wird: Der Viewer zieht Lasten über
`getLoads(): FEMLoad[]`, und die Schnittgrößen-API würde dieselbe flache Menge
nehmen. Beides gegen eine flache Liste zu bauen und danach umzustellen, ist
zweimal dieselbe Arbeit plus ein Breaking Change in einer schon veröffentlichten
API. Vorher kostet es fast nichts.

#### Entschieden am 2026-07-26 (Vorgespräch, vor dem Grilling)

**Kein neues Package.** `LoadCase` gehört nach `fem-loads`. Das Package besitzt
bereits das Eingabemodell *und* dessen Validierung, und ein Lastfall bringt keine
einzige neue Abhängigkeit mit: id, Name, Liste, optionaler Faktor,
optionales Kategorie-Tag. Ein Package für einen Typ und eine
Validierungsfunktion wäre Overhead.

Die Grenze, an der ein neues Package wirklich fällig wird, liegt woanders: bei
der **Kombinatorik** — EN 1990 mit γ, ψ0/ψ1/ψ2, Leiteinwirkung und sich
ausschließenden Gruppen. Das ist normatives Tabellenwissen mit NA-Varianten,
also das Muster von `material` samt Herkunftsangabe je Datensatz (ADR 0001).
Arbeitsname für später: `@baustatik/fem-combinations`.

Der einzige Einwand dagegen ist die Einwirkungskategorie — die *ist* normativ.
Aber `fem-loads` würde sie nur **speichern**, nicht **deuten**: keine ψ-Werte in
diesem Package. Ein Tag ohne Auswertung rechtfertigt kein Package, und ein
späterer Umzug ist ein Re-Export.

Zwei bewusst gesetzte Sätze werden dabei zurückgenommen und müssen mitwandern:
`fem-loads/src/types.ts:5` („keine Lastfaelle") und `fem-loads/CONTEXT.md:35`.
`HANDOFF.md:196` bleibt als Begründung stehen, warum es *keine* `loadCaseId` an
der Last gibt — diese Entscheidung gilt weiter.

### C. Schnittgrößenverläufe — **die Naht ist schon geschnitten**

Das hier ist bemerkenswert gut vorbereitet:

- `PreparedElement.internalForces(x, dLocal, load)` **existiert als Vertrag**
  (`fem-element/src/types.ts:171`) und wirft heute nur
  `InternalForcesNotImplementedError` (`timoshenko.ts:202`).
- Die Ansatzfunktionen samt Ableitungen liegen fertig in
  `shape-functions.ts` — package-intern, mit dem Kommentar, dass sie für
  `internalForces` gedacht sind.
- `solve()` liefert bereits `elementEndForces` je Stab, lokal, in
  `[N1, V1, M1, N2, V2, M2]`. Das sind die Randwerte des Verlaufs, also
  gleichzeitig die Prüfsteine für x=0 und x=L.

Es fehlt also die Implementierung, nicht der Entwurf. Das ist der Punkt aus
deiner Liste mit dem besten Verhältnis von Nutzen zu Aufwand.

### D. Grafische Lastdarstellung — **Plan liegt fertig, reviewt**

`packages/PLAN.md` beschreibt Punktlasten (`NodeLoad.fx/fz`,
`BeamForcePointLoad`) in sechs Schritten, `review-PLAN.md` hat ihn bereits
kritisch gegengelesen und die Punkte sind eingearbeitet. Umsetzbar wie er steht
— mit einer Anpassung, siehe Reihenfolge unten. Linienlasten sind ein eigener
Folgeplan, nicht ein Anhängsel.

### E. Querschnitte — **fast leeres Feld**

- `cross-section` exportiert **einen einzigen Typ** (`Segment`), keine
  Berechnung.
- `section-geometry` kann `area`, `centroid`, `perimeter`, `boundingBox`,
  Boolesche Operationen — aber **keine Trägheitsmomente, keine
  Widerstandsmomente, kein statisches Moment, keine Hauptachsen**.
- `cross-section-viewer` ist ein Gerüst, kein Vorbild.
- `material` hat Festigkeitsklassen, aber **keine Profiltabellen**.
- Die Anschlussstelle steht dagegen fest: `fem-solver` zieht
  `getSectionProperties(beam): SectionProperties` als Port
  (`fem-solver/src/config.ts:96`). Wer den bedient, ist offen — und genau das
  soll `cross-section` irgendwann sein.

Das ist der größte Brocken deiner Liste und der einzige, der nichts vom
FEM-Strang braucht.

---

## Reihenfolge mit Begründung

### Stufe 1 — Lastfall-Begriff — **erledigt am 2026-07-26**

Umgesetzt: `LoadCase`, `assertValidLoadCase`, `effectiveLoads` in
`fem-loads/src/load-case.ts`; neues Blatt-Package `@baustatik/actions`;
`fem-solver` mit `getLoadCases()`, `check(loadCaseId)`, `solve(loadCaseId)` und
`solveAll()`, dazu `SolveResult.loadCaseId` und `UnknownLoadCaseError`; Demo mit
drei Lastfällen, aktivem Lastfall als Schreibziel und `copyLoadCase`.
Begründungen in ADR 0013, 0014, 0015.

Der Entwurf, wie er vor dem Grilling stand — die Abweichungen stehen oben:

- In `fem-loads` ein `LoadCase = { id, name, loads, category?, factor? }` plus
  Validierung. Der Lastfall besitzt seine Lasten — keine `loadCaseId` an der
  Last, sonst zwei Wahrheiten.
- Dazu **eine** Funktion: `effectiveLoads(loadCase): readonly FEMLoad[]`. Sie
  wendet den Faktor an und liefert die flache Menge. Sie ist der Grund, warum
  alles danach unverändert bleiben kann — siehe „Der Viewer bleibt dumm".
- `resolveLoads` bleibt **unverändert**: es löst weiterhin eine flache Menge
  auf. Der Lastfall ist eine Schicht darüber, keine Änderung an der
  Lastauflösung. (`fem-load-resolve/CONTEXT.md:159` sieht das genau so vor.)
- `solve()` rechnet **einen** Lastfall. Superposition kommt in Stufe 6, nicht
  jetzt — sonst wird der Lastvektor zur Matrix und das Ergebnisobjekt gleich
  mit.
- Kein Eigenlast-Generator, keine Teilsicherheitsbeiwerte, keine ψ-Werte. Die
  gehören zur Kombinatorik und würden hier nur ungenutzt herumliegen.
  `LoadOrigin` hält den Platz schon frei.

(Punkt A ist inzwischen für sich erledigt, nicht als Nebenprodukt.)

#### Der Viewer bleibt dumm — der Port `getLoads()` ändert sich nicht

Wenn der Lastfall seine Lasten besitzt und der Viewer immer **genau einen**
zeigt, dann muss der Viewer den Begriff Lastfall gar nicht kennen. Der
Composition Root verdrahtet:

```ts
getLoads: () => effectiveLoads(store.activeLoadCase)
```

„Welcher Lastfall ist sichtbar" ist Auswahlzustand der Anwendung, nicht Wissen
des Zeichners. Dazu kommt: der Port ist inzwischen implementiert und
veröffentlicht (1bb918d, Changeset `thick-arrows-point-down`) — ihn umzubauen
wäre ein zweiter Breaking Change ohne Gegenwert. Das korrigiert, was weiter
unten in Stufe 3 stand.

**Beim Solver dagegen umstellen:** `getLoads()` wird zu `getLoadCase()`, und
`SolveResult` bekommt eine `loadCaseId`. Ein Ergebnis, das nicht sagt, wovon es
das Ergebnis ist, kann man nicht ablegen — und `fem-solver/CONTEXT.md:304`
nennt den Schritt („aus `canSolve` wird `canSolve(caseId)`") bereits vorweg.

#### Die zwei Lastfallparameter

**`category?` — Einwirkungskategorie**, optional, kein Zwang. Union-Typ statt
`string`, sonst sind Tippfehler zulässige Werte. `fem-loads` speichert das Tag
und wertet es nicht aus.

> Zum Aufpassen: **Kategorie ≠ Einwirkung.** „Wind von links" und „Wind von
> rechts" sind zwei Lastfälle *derselben* Einwirkung und dürfen nie gleichzeitig
> in einer Kombination stehen. Diese ausschließende Gruppe drückt ein
> Kategorie-Tag nicht aus. Nicht jetzt bauen — aber das Feld darf nicht so tun,
> als könne es das, sonst wird es später als Gruppierung missbraucht.

**`factor?` — Faktor auf alle Lasten des Falls**, Voreinstellung 1. Machbar,
mit drei Bedingungen:

1. Er **verdoppelt** den Kombinationsbeiwert. Kombination 1,35 × Lastfall 1,2
   ergibt 1,62, und niemand sieht die 1,62. Wenn der Faktor bleibt, muss er im
   Bericht getrennt ausgewiesen werden.
2. Der Viewer muss den **gefakterten** Wert beschriften, sonst steht 5 kN am
   Pfeil und 6 kN in der Rechnung. `effectiveLoads()` als einzige Stelle löst
   das von selbst, weil Viewer und Solver durch dieselbe Funktion sehen.
3. Validierung: endlich und `> 0`. Faktor 0 wäre ein stillgelegter Lastfall
   durch die Hintertür — dafür gehört ein eigener Schalter oder Löschen, kein
   magischer Wert.

#### Beantwortet im Grilling am 2026-07-26 — **umgesetzt**

- **Ist der Faktor gerechtfertigt?** Ja, aber aus einem anderen Grund als hier
  vermutet. Er ist keine Skalierung „charakteristischer Eingabe", sondern eine
  **Ableitung durch Kopieren**: Lastfall kopieren und als Ganzes umkehren oder
  auf den echten Wert skalieren. Damit ist er auch kein verlegter
  Kombinationsbeiwert (ADR 0013).
- **Negativer Faktor?** Erlaubt, und der Hauptzweck — genau dafür wird er
  gebraucht (Wind umdrehen). `0` und nicht endliche Werte wirft
  `assertValidLoadCase`, aufgerufen im Tor von `solve()`.
- **Kategorienliste?** Ein diskriminierter Union in einem neuen Blatt-Package
  `@baustatik/actions`, zwei Achsen (`action` × `kind`, plus `useCategory` A–E).
  Die ψ-Werte kommen später ebenfalls dorthin oder in die Kombinatorik — nicht
  nach `fem-loads`. Muss ein Blatt sein, sonst entsteht ein Zyklus, sobald die
  Kombinatorik `LoadCase` braucht (ADR 0015).
- **Last-ids global eindeutig?** Ja, und Lastfall-ids ebenso — aber
  **ungeprüft**: mit `crypto.randomUUID()` ist eine Kollision nicht erreichbar,
  und doppelte Last-ids sind heute schon ungeprüft. Die einzige reale Bedrohung
  ist die Kopieroperation, und die zieht neue ids.
- **Null Lastfälle?** Der Store hält mindestens einen. Ein leerer Lastfall ist
  kein Fehler, sondern der Zustand `unloaded` — `check.ts:9-14` begründet das
  bereits ausführlich.
- **Migration der Demo?** Drei Lastfälle, umschaltbar über die Konsole
  (`store.activeLoadCaseId`), kein HTML. „Wind von rechts" entsteht als Kopie von
  „Wind von links" mit Faktor −1 und führt damit den Anlass für den Faktor vor.

#### Was gegenüber diesem Entwurf anders entschieden wurde

- **Nicht `getLoadCase()` als Port, sondern `getLoadCases()` plus
  `check(loadCaseId)`/`solve(loadCaseId)`.** Der Solver darf keinen
  Auswahlzustand lesen — dasselbe Argument, mit dem der Viewer dumm bleibt. Der
  Hinweis auf `fem-solver/CONTEXT.md:304` unten war insofern richtig, dass die
  Stelle den Schritt vorhersagt: sie sagt `canSolve(caseId)`, also einen
  **Parameter**, nicht einen Port (ADR 0014).
- **`CheckReport` bekommt keine `loadCaseId`.** Der Bericht ist flüchtig und wird
  nie abgelegt; der Aufrufer hat die id gerade übergeben. `SolveResult` trägt sie.
- **Kein `validateLoadCases`.** Es gab keine erreichbare Regel: doppelte ids
  schließt die id-Erzeugung aus, gleiche Namen sind kein Befund (der Name ist
  kein Schlüssel), und der leere Lastfall ist ein Zustand.
- **Keine `createLoadCase`-Factory, sondern `assertValidLoadCase` im Tor.** Die
  Factory stand kurz da und war zweimal falsch: sie versprach den Bau einer
  Maschine wie `createFEMViewer`, gab aber ihr Argument zurück — und sie war per
  Objektliteral umgehbar, `NaN` lief also weiter bis zur Verformung.
- **`solveAll()` statt einer Schleife beim Aufrufer.** Genau zwei
  Rechenoperationen, keine dritte.
- **Der aktive Lastfall IST das Schreibziel des Stores.** `addNodeLoad(nodes,
  load)` schreibt hinein. Der Anwender legt einen Lastfall an, wechselt hinein
  und gibt Lasten ein — dagegen zu bauen wäre nur Zeremonie. Die Regel „nicht
  den Auswahlzustand lesen" gilt für die RECHNUNG, nicht für eine Eingabe, die
  der Anwender im gerade gewählten Fall macht.

### Stufe 2 — Schnittgrößen rechnerisch

Zwei getrennte Ebenen, und die Trennung ist wichtig:

1. **`fem-element`**: `internalForces(x, dLocal, load)` implementieren.
   Rein, lokal, ohne Modellwissen. Prüfbar gegen geschlossene Lösungen
   (Kragarm mit Einzellast, Einfeldträger mit Gleichlast) und gegen die
   vorhandenen `elementEndForces` an den Rändern.
2. **`fem-solver`**: eine Verlauf-API auf dem `SolveResult`, die je Stab und
   Stelle x auswertet.

Zur API-Frage, die du früh entscheiden solltest: **Punktabfrage als Primitiv,
Abtastung als Hilfsfunktion darüber.** Also `internalForcesAt(beamId, x)` als
Kern und `internalForcesAlong(beamId, opts)` für den Verlauf. Die Abtastung
muss die **Unstetigkeitsstellen erzwingen** — Angriffspunkte von Einzellasten,
Anfang und Ende von Trapezlasten — sonst übersieht ein gleichmäßiges Raster den
Sprung in V und den Knick in M, und der Anwender sieht ein falsches Maximum.
Diese Stellen kennt `fem-load-resolve` bereits, das ist der richtige Lieferant.

Die Frage „x absolut oder relativ" würde ich wie bei den Lasten beantworten:
absolut in Metern entlang der Stabachse, relativ optional in Prozent, gleiche
Konvention wie `PointPlacement`. Zwei verschiedene Regeln für dieselbe Größe
wären eine Fehlerquelle ohne Gegenwert.

### Stufe 3 — Lasten zeichnen

`PLAN.md` ist umgesetzt (1bb918d): Punktlasten werden als Pfeile mit
Beschriftung gezeichnet. Die hier ursprünglich geforderte Änderung am Port
(„nicht `getLoads()`, sondern der Lastfall") ist **zurückgenommen** — siehe
„Der Viewer bleibt dumm" in Stufe 1.

#### Zuerst: das Moment — **erledigt am 2026-07-27**

Umgesetzt: `render-core` bekam `ArcPathSpec` (Strichbogen, ohne Füllung, mit
vorzeichenbehaftetem `sweepAngle`; „ArcPath" statt „Arc", weil ein Ringsegment
eine andere Figur ist und den Namen sonst besetzt), der `konva-adapter` bildet
ihn über `Konva.Path` und das SVG-Kommando `A` ab, und `fem-viewer/src/loads/`
ist in zwei Ebenen zerlegt — Lastart (`node-loads.ts`, `beam-loads.ts`) und
Symbol (`point-force.ts`, `moment.ts`), mit `label.ts` und `style.ts` als
gemeinsamem Teil. Das Symbol ist ein 270-Grad-Bogen mit Radius 22 px und
demselben Label-Gap wie die Punktlast; positives Moment dreht gegen den
Uhrzeigersinn, das negative ist sein Spiegelbild. Festgehalten wird die Lücke:
sie sitzt bei beiden Vorzeichen unten, das Label darüber, die Spitze an der
Kante der Lücke. Sie ist gefüllt UND bestrichen wie Konvas Pfeilkopf — nur
gefüllt fiele sie bei gleichen Maßen kleiner aus.

Der Auftrag, wie er hier stand:

Gezeichnet wurden bisher nur die Kräfte. Es fehlten die Momentenlasten, und
zwar an beiden Stellen, an denen es sie gibt:

- `NodeLoad.my` — das Knotenmoment. Es steht heute **neben** `fx`/`fz` im
  selben Lastobjekt (`fem-loads/src/types.ts:108`), ein Knoten kann also
  gleichzeitig Kraft und Moment tragen. Der Zeichner muss beides aus
  derselben Last herausholen und darf den Pfeil nicht als Entweder-Oder
  behandeln.
- `BeamMomentPointLoad` — das Einzelmoment auf dem Stab
  (`fem-loads/src/types.ts:228`), mit `PointPlacement` wie die
  `BeamForcePointLoad`.

Darstellung: ein gebogener Pfeil (Kreisbogen mit Pfeilspitze am Ende), der
Drehsinn folgt dem Vorzeichen. Die Vorzeichenregel steht im Kopf von
`types.ts:18` — positives Moment dreht nach der Rechte-Hand-Regel um +y, im
Bild also von +z nach +x. Die kommt aufs Papier, bevor irgendein Bogen
gezeichnet wird, sonst wird der Drehsinn geraten.

**Konva kann das mit `Konva.Path()`.** `data` ist ein SVG-Pfad-String, also
`A` (elliptic arc) für den Bogen und ein kleines geschlossenes Dreieck für
die Spitze — kein eigener Renderer, keine Bitmap. Beispiel für die Form:

```ts
new Konva.Path({ data: 'M ... A r r 0 0 1 ... L ... Z', ... })
```

Der Radius ist wie die 48-px-Pfeillänge zunächst fest in px, damit der Bogen
beim Zoomen konstant groß bleibt; die Referenzskalierung kommt erst mit den
Streckenlasten (siehe unten) und der ViewPolicy in Stufe 4.

#### Danach: Streckenlasten

Offen bleibt ein eigener Plan für Streckenlasten — deren Darstellung ist
inhaltlich etwas anderes als ein Pfeil (Füllfläche zwischen Stab und Lastlinie,
Trapezform, Bezugslänge sichtbar, Beschriftung an zwei Stellen) und braucht als
erstes eine Antwort auf die Skalierungsfrage, die `fem-loads/HANDOFF.md:185`
schon aufwirft: **eine Referenzgröße über alle sichtbaren Lasten des Lastfalls**,
damit 5 kN/m und 50 kN/m unterscheidbar sind. Punktlasten drücken sich mit ihrer
festen 48-px-Pfeillänge noch davor; Streckenlasten können das nicht.

### Stufe 4 — ViewPolicy

Erst hier, weil jetzt genug zu stylen da ist: Lastfarben, Pfeillängen,
Referenzskalierung, später Schnittgrößen-Farben und -Maßstäbe. Vorher wäre es
eine Policy für fünf Felder — `FEMStyle` (`fem-viewer/src/scene.ts:17`) hat
heute genau `beamColor`, `beamWidthPx`, `nodeColor`, `nodeRadiusPx`,
`nodeSupportColor`.

**Meine deutlichste Abweichung von deiner Notiz:** Baue die ViewPolicy **nicht**
analog zur `AnalysisPolicy`. Die `AnalysisPolicy` ist versioniert, streng
geparst und wirft bei unbekannten Feldern, weil sie das **Rechenergebnis**
bestimmt — eine stillschweigend geänderte Toleranz ändert Zahlen, für die
jemand haftet, und ein Projekt muss in fünf Jahren reproduzierbar bleiben
(ADR 0011). Für Pfeilfarben gilt nichts davon. Eine ältere Datei ohne das Feld
`arrowLengthPx` ist kein Fehler, sondern nimmt den Default.

Übernehmen: das Muster „jedes Package bringt seine eigene Scheibe samt Default
mit, ein Composition Root setzt zusammen" — das trägt hier genauso. Nicht
übernehmen: `schemaVersion`, striktes Parsen, Fehler bei unbekannten Feldern.
Wenn Ansichtseinstellungen später wirklich persistiert werden, kann man
versionieren; vorwegnehmen sollte man es nicht.

### Stufe 5 — Schnittgrößen grafisch

Braucht Stufe 2 (Werte) und Stufe 4 (Maßstab, Farben, welche Größe wird
gezeigt). Die harte Frage ist auch hier die Skalierung — dieselbe wie bei den
Streckenlasten, deshalb lohnt es sich, sie in Stufe 3 einmal richtig zu lösen.

### Stufe 6 — Lastkombinationen

Erst wenn Lastfälle rechnen und Verläufe existieren. Dann ist es ein
überschaubarer Aufbau: Kombination = gewichtete Summe von Lastfällen,
Superposition auf den Verläufen (linear, also zulässig), min/max an jeder
Stelle x über alle Kombinationen. Die Extremwertsuche braucht dieselbe
Stützstellenliste wie Stufe 2 — noch ein Grund, sie dort sauber zu machen.

Ein Hinweis vorab: Sobald Bemessung dazukommt, brauchst du nicht nur min/max
je Größe, sondern die **zugehörigen** Werte (max M mit dem gleichzeitig
wirkenden N). Das ist eine andere Datenstruktur als drei unabhängige Extrema.
Das muss jetzt nicht gebaut werden, sollte aber beim Entwurf des
Ergebnistyps mitgedacht sein.

### Stufe 7 — Querschnitte (eigener Strang, jederzeit parallel)

In dieser Reihenfolge, und die Trennung ist der ganze Punkt:

1. **Querschnittswerte für Geometrie** — `A`, `Iy`, `Iz`, `Sy`, `Wy`,
   Schwerpunkt, Hauptachsen, für Polygone und für dünnwandige Segmentzüge.
   Gehört nach `section-geometry` (Polygone) beziehungsweise `cross-section`
   (Segmentzüge mit `thickness`). Rein numerisch, ohne UI, gegen
   Handrechnungen prüfbar.
2. **Profilkatalog als Daten** — IPE, HEA/HEB, U, Winkel, Rohr. Bau das nach
   dem Muster von `material`: vendorierte Tabellen plus Factory, mit einer
   Herkunftsangabe je Datensatz (ADR 0001 hat das für die
   Materialkennwerte schon durchdacht). Tabellenwerte sind **keine**
   nachgerechneten Werte — die Norm rundet und berücksichtigt Ausrundungen.
   Wenn beides existiert, muss die Quelle am Wert stehen.
3. **Anschluss an den Solver** — `getSectionProperties` aus `cross-section`
   bedienen. Ab hier hat ein Stab ein echtes Profil statt eingetippter Zahlen.
   Das ist der Moment, in dem sich der ganze Strang auszahlt, und er kommt
   früher, als der Editor fertig ist.
4. **Editor** — zuletzt. Er braucht 1 als Rechenkern, 2 als Startpunkte
   („HEB 300 laden und ändern") und einen brauchbaren Viewer. Der aktuelle
   `cross-section-viewer` ist ein Gerüst; wenn du dort weiterbaust, ist
   `grid-2d` das Vorbild, nicht der vorhandene Viewer.

Schritt 3 vor 4 ist wichtig: Ein Profilkatalog, der den Solver füttert, ist
für sich nützlich. Ein Editor ohne Rechenkern ist ein Zeichenprogramm.

---

## Was ich anders sehen würde als deine Notizen

1. **Lastfälle sind kein „irgendwann", sondern der erste Schritt.** In deiner
   Notiz stehen sie als Randbemerkung beim Thema Schnittgrößen. Sie sind aber
   die Struktur, gegen die Viewer-Port *und* Schnittgrößen-API geschnitten
   werden. Danach eingezogen, sind es zwei Breaking Changes statt einer
   additiven Erweiterung.

2. **ViewPolicy nicht „analog zu AnalysisPolicy".** Siehe Stufe 4 — das
   Zusammensetzmuster ja, die Versionierungsmaschinerie nein. Sonst
   verschleppst du Strenge, die einen guten Grund hat, dorthin, wo sie keinen
   hat.

3. **Staborientierung ist erledigt.** Da ist nichts nachzuziehen, nur zu
   dokumentieren. Der Punkt kann von der Liste.

4. **Der Querschnittseditor ist der teuerste Punkt und der am wenigsten
   dringende.** Er ist auch der, bei dem Scope-Kriechen am wahrscheinlichsten
   ist. Die Aufteilung Werte → Katalog → Solver-Anschluss → Editor sorgt
   dafür, dass jeder Zwischenstand für sich brauchbar ist.

5. **Kritischer Pfad zu einem sinnvollen Ergebnis:**
   `Lastfälle → internalForces → Verlauf-API → grafische Darstellung.`
   Alles andere ist Breite. Wenn du nur einen Strang verfolgen willst, dann
   diesen — er führt vom heutigen „Zahlen im Solver" zu „ein Statiker sieht
   einen Momentenverlauf".
