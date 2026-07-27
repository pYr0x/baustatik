# Kinematik-Erkennung: Messreihe, Verformungsprüfung, ADR

## Der Befund, aus dem dieser Plan entstand

Ein Tragwerk mit einem einzigen Auflager (`ux/uz fixed`, `phiY free`) ist ein
Mechanismus — es dreht sich als starrer Körper um diesen Knoten. `K_ff` ist
exakt rangdefizit. Gemessen wurde trotzdem (Demo-Geometrie, `EA=1e6`, `EI=1000`,
`GAs=500`, Stab 0–1 = 100, echte Rust-Fassung über `cargo test`):

| dritter Knoten | kleinstes skaliertes Pivot | Ergebnis |
| --- | --- | --- |
| keiner (nur Stab 0–1) | Llt-Abbruch | erkannt |
| (200, 0) kollinear | 1.3e-16 | erkannt |
| (165, 40) | Llt-Abbruch (Pivot ≤ 0) | erkannt |
| (165, 10) | **1.76e-12** | **rechnet** → `uz1 = 9.4e14` |
| (165, 80) | **7.9e-10** | **rechnet** → `uz1 = 5.4e12` |

Der wahre Wert des Pivots ist exakt 0. Was `faer` sieht, ist Rundungsrauschen:
das **Vorzeichen** entscheidet über den Llt-Abbruch, der **Betrag** über die
`1e-12`-Schwelle aus ADR 0012. Beides hängt an den Koordinaten.

Ursache des Rauschpegels: ein **schräger** Stab mischt über die Transformation
Dehn- und Biegesteifigkeit in dieselbe Zeile — `EA/L = 1e4` neben
`12EI/L³ = 0.012`, Faktor ~1e6. Die Auslöschung trägt die Größe des *größten*
Terms, die Jacobi-Skalierung normiert auf die *Diagonale* der Zeile:
`eps · 1e6 ≈ 1e-10`, hundertfach über der Schwelle. Der Verstärkungsfaktor ist
rund `A·L²/I`, also die Schlankheit im Quadrat — kein Demo-Artefakt: mit
realistischen Werten (HEB 200, `EA=1.1e9`, `EI=1.8e7`) rechnet dieselbe
kinematische Geometrie ebenfalls durch (Pivot `5e-11`).

Entscheidend für die Wahl des Wegs: was die Assemblierung an Stellen verliert,
holt keine Zerlegung zurück. Nach der Auslöschung steht in `K` **nicht** die
Matrix des Modells, sondern die exakte Matrix eines geringfügig anderen Modells
— und dieses andere Modell ist nicht kinematisch. Zerlegung, Eigenwertlöser und
Konditionsschätzer lesen alle dieselbe kaputte Matrix.

Der Ausweg liegt im Ergebnis statt in der Matrix: der Mechanismus zerstört das
Pivot in der 12. Stelle, blüht in der Lösung aber um 12 Größenordnungen auf.

| | kleinstes Pivot | max. Verdrehung |
| --- | --- | --- |
| Kragarm / echtes Tragwerk | 0.25 … 1e-9 | ~1e-3 rad |
| Mechanismus (165,10) | 1.7e-12 ⟵ *unauffällig* | 9.4e12 rad |
| Mechanismus (165,80) | 7.9e-10 ⟵ *unauffällig* | 3.3e10 rad |

Beim Pivot überlappen die Zeilen, bei der Verdrehung liegen 13 bis 16
Größenordnungen dazwischen.

## Entscheidung

Die Schwelle `1e-12` **bleibt unverändert** und bleibt an ihrem Ort. Sie ist
nicht falsch eingestellt, sie ist die falsche Art von Kriterium: Hochsetzen
tauscht Durchrutscher gegen Fehlalarme bei schlanken, aber tragfähigen Systemen.
Das Pivot bleibt als **einseitiger** Test — ein Pivot darunter ist sicher ein
Mechanismus, die Gegenrichtung beweist es nie.

Dazu kommt eine **Verformungsprüfung** in `fem-solver` mit zwei Stufen:

| | Grenze | Befund |
| --- | --- | --- |
| Hinweis | `\|φ\| > 0.1 rad` oder `\|u\|/L > 0.1` | Ergebnis verlässt den Gültigkeitsbereich der Theorie I. Ordnung |
| Fehler | `\|φ\| > 1e3 rad` oder `\|u\|/L > 1e3` | keine Verformung mehr, sondern eine Bewegung → kinematisch |

Die Grenzen sind keine Plausibilitätsschätzung, sondern die Gültigkeitsgrenze der
gerechneten Theorie (`sin φ ≈ φ`, Gleichgewicht am unverformten System) — und
einheitenfrei, weil `rad` und `u/L` dimensionslos sind. Die Fehlergrenze liegt
drei Größenordnungen über allem physikalisch Vorkommenden und immer noch zehn
unter den gemessenen Mechanismen.

**Ehrliche Grenze:** die Prüfung sieht den Mechanismus nur, wenn die Last ihn
anregt. Eine Last, deren Resultierende durch den Drehpunkt zeigt, erzeugt keine
Bewegung — Prüfung still, Modell trotzdem kinematisch und die Lösung nicht
eindeutig. Deshalb ist sie das **vierte Netz**, nicht der Ersatz für das Pivot.

Verworfen: den Rauschboden aus der Assemblierung mitzuführen (numerisch der
sauberste Weg, kostet Instrumentierung in der Assemblierung und bringt weniger
als die Verformungsprüfung — aufheben, nicht bauen).

---

## Schritt 1 — Messreihe (kein Produktionscode)

**Neu: `packages/fem-solver/tests/kinematics-margin.test.ts`**

- Modellkorpus als zwei Listen von Bauern, je Eintrag
  `{ name, nodes, beams, supports, loads }`:
  - *stabil*: Kragarm (Referenzwert `0.25`), Einfeldträger, Zweifeldträger,
    Rahmen mit schrägem Stiel (30°/45°/60°), Dreigelenkrahmen, Sprengwerk —
    parametrisiert über IPE 80 / HEB 200 / HEB 600 und `L = 1 / 3 / 10 / 20 m`,
    also ~60–100 Systeme.
  - *kinematisch*: das Demo-System, verschieblicher Rahmen mit zwei
    Pendelstützen, Gelenkkette, drei parallele `uz`-Auflager, und ein
    **Winkelsweep** des schrägen Stabs (0°…90° in 5°-Schritten) — der Sweep ist
    der wichtigste Teil, weil der Winkel das Rauschen steuert.
- **Echte** `Timoshenko2D`-Formulierung und echte Querschnittswerte, nicht
  `fakeFormulation`/`STIFF` — gemessen wird gerade die Auslöschung zwischen `EA`
  und `EI`.
- Als Port eine Messfassung von `gaussSolve` (aus `support.ts` kopiert, lokal im
  Testfile): sie reicht das kleinste skalierte Pivot **auch im gelungenen Fall**
  heraus. `LinearSolveOutcome` bleibt unangetastet — die Messung darf den
  Port-Vertrag nicht verbiegen.
- Je System protokolliert: DOF-Zahl, `A·L²/I` (Verstärkungsfaktor), kleinstes
  Pivot, `max|φ|`, `max |u|/L`, und ob die heutige Erkennung anschlägt.
- Ausgabe als Markdown-Tabelle nach **`docs/messungen/kinematik-abstand.md`**
  (via `node:fs`, weil vitest hier `console.log` schluckt). Diese Datei ist das
  Beleg-Artefakt, auf das die ADR verweist.
- Zusicherungen in dieser Stufe nur die konstruktive Wahrheit: jedes stabile
  System löst, jedes kinematische ist per Konstruktion ein Mechanismus. **Keine**
  Schwellenaussage — der Test ist zunächst ein Messgerät.

**Ergebnis:** `min(Pivot)` über die stabile Menge gegen `max(Pivot)` über die
kinematische, und dieselbe Gegenüberstellung für `max|φ|` und `max |u|/L`.
Daraus kommen die Zahlen für Schritt 2.

## Schritt 2 — Verformungsprüfung

**`src/policy.ts`**

- Neues Feld:
  ```ts
  readonly deformationLimits: {
    readonly warn: { rotation: number; relativeDisplacement: number };
    readonly fail: { rotation: number; relativeDisplacement: number };
  };
  ```
  Defaults `warn: { 0.1 rad, 0.1 }`, `fail: { 1e3, 1e3 }` — die vier Zahlen
  werden erst **nach** Schritt 1 festgezurrt.
- `FIELDS`, `DEFAULT_ANALYSIS_POLICY`, `createAnalysisPolicy`,
  `parseAnalysisPolicy` erweitern. Prüfungen im Parser: Zahl, endlich, `> 0`,
  und `warn < fail` je Größe — jeweils mit `InvalidAnalysisPolicyError` und
  gesetztem `field`.
- `ANALYSIS_POLICY_SCHEMA_VERSION` **1 → 2**. Ein v1-Dokument hat das Feld nicht
  und scheitert am strikten Parser; ein Migrationspfad existiert im Code nicht.
  Vorher verifizieren, dass noch nichts persistiert ist (`parseAnalysisPolicy`
  hat heute vermutlich keinen produktiven Aufrufer) — falls doch, wird die
  Migration ein eigener Punkt.

**`src/errors.ts`**

- `ImplausibleDisplacementError extends BaustatikError` mit `nodeId`, `dof`,
  `value`, `limit`. Meldung im Klartext: das ist keine Verformung mehr, sondern
  eine Bewegung; das Modell ist (nahezu) kinematisch. Anders als beim
  Pivot-Hinweis ist der Knoten hier **exakt** benennbar — das gehört in den
  Doc-Kommentar, weil es der Unterschied zu `SingularStiffnessMatrixError` ist.
- `SolveWarning extends BaustatikError` (abstrakt, neue schmale Wurzel für
  Ergebnisbefunde — analog zu `ModelValidationWarning` und
  `LoadValidationWarning`) und darunter `SmallRotationAssumptionWarning`:
  Ergebnis verlässt den Gültigkeitsbereich der Theorie I. Ordnung.

**`src/solve.ts`**

- Neue Funktion
  `assessDisplacements(displacements, nodes, beams, geometry, limits)`,
  aufgerufen in `solveWith` direkt nach `solveReduced` und **vor**
  `reactionsByNode`/`endForcesByBeam` — aus unbrauchbaren Verschiebungen sollen
  keine unbrauchbaren Schnittgrößen entstehen.
- Gemessen wird je Knoten `|φ|` und je Stab `|u|/L` für beide Endknoten
  (Bezugslänge ist der angehängte Stab). Absolut, nicht relativ zwischen den
  Knoten: die Auflager legen den Bezugsrahmen fest, und gesucht ist die
  *Bewegung*, nicht die Verzerrung.
- Über `fail` → Wurf. Nur über `warn` → Warnung sammeln.
- Das vierte Netz kommt hinter die drei bestehenden; der Staffelungskommentar in
  `solveReduced` wird um den vierten Punkt ergänzt, samt Begründung, warum das
  Pivot allein nicht reicht.

**`SolveResult`** bekommt `warnings: SolveWarning[]`. Einzige API-Erweiterung
nach außen; passt zur bestehenden Linie, dass das Ergebnis selbstbeschreibend
ist (`loadCaseId`).

**`src/index.ts`**: die neuen Klassen exportieren.

**Tests**

- `tests/solve.test.ts`: (i) **der Regressionstest** — Demo-System mit drittem
  Knoten bei `(165, 10)`, echte Formulierung, Port meldet `solved` mit Pivot
  `1.7e-12`, und `solve()` wirft trotzdem `ImplausibleDisplacementError`; (ii)
  ein Kragarm mit großer, aber legitimer Verformung wirft nicht; (iii) je ein
  Fall genau über `warn` und genau über `fail`; (iv) die Warnung erscheint in
  `result.warnings` und bricht nicht ab.
- `tests/policy.test.ts`: Defaults, Overrides, Parser-Fehler je Feld,
  Versionssprung.
- `tests/support.ts`: `configOver` erbt die neuen Defaults automatisch — prüfen,
  dass keine bestehende Erwartung an `SolveResult` durch das neue Feld bricht.

**Nicht angefasst:** `check.ts` (der Bericht kann Kinematik weiterhin nicht
vorhersagen — dieser Teil von ADR 0012 bleibt gültig), Rust/WASM, der
Port-Vertrag.

## Schritt 3 — ADR

**Neu:
`docs/adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md`**

- Der Befund mit den Zahlen aus Schritt 1: wo die beiden Mengen beim Pivot
  liegen, wo bei der Verdrehung.
- Warum die Schwelle **nicht** verschoben wird (Tausch von Durchrutschern gegen
  Fehlalarme).
- Warum keine Nachbesserung im Löser hilft: der Auslöschungsfehler der
  Assemblierung macht die gespeicherte Matrix zur exakten Matrix eines leicht
  anderen, tragfähigen Modells — Rückwärtsfehler, den keine Zerlegung, kein
  Eigenwertlöser und keine Konditionsschätzung zurückholt.
- Die zwei Stufen und warum die Grenze aus der Theorie kommt.
- Die ehrliche Grenze: eine Last, die den Mechanismus nicht anregt, bleibt
  unentdeckt — deshalb viertes Netz, kein Ersatz.
- Warum die Prüfung in `fem-solver` liegt und nicht im Löser.
- Verworfen: Rauschboden aus der Assemblierung, Eigenwert/Konditionsschätzer
  (sehen dasselbe Rauschen), Topologiezählung (schon in 0012 verworfen).

**`docs/adr/0012-kinematics-is-detected-by-the-solver.md`**: kurzer Nachtrag am
Ende mit Verweis auf 0016. Die alte Begründung bleibt stehen — sie war richtig,
nur unvollständig.

**`packages/fem-solver/CONTEXT.md`**: die neue Invariante („ein Ergebnis
verlässt dieses Package nur, wenn es eine Verformung ist und keine Bewegung").

## Reihenfolge und offene Entscheidungen

1 → 2 → 3, wobei 3 parallel zu 2 entworfen werden kann; die Zahlen darin kommen
aus 1.

Vor Schritt 2 zu bestätigen:

- **`SolveResult.warnings`** als neues Feld — oder soll die
  Theorie-I.-Ordnung-Warnung zunächst entfallen und nur der Fehler kommen?
- **Schema-Version 2** ohne Migration (setzt voraus, dass noch keine Policy
  gespeichert liegt — wird zu Beginn von Schritt 2 geprüft).
- **Die vier Grenzwerte** nach Schritt 1, mit den Messwerten als Vorschlag.

## Getrennt davon

Das Demo-Modell in `apps/demo/fem-viewer.ts` braucht ein zweites Auflager (oder
`phiY: 'fixed'` am Knoten 0). Das ist eine Modellkorrektur und nicht Teil dieser
Arbeit — sie behebt den Solver-Befund nicht.
