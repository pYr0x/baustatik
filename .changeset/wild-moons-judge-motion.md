---
"@baustatik/fem-solver": major
---

Kinematik zeigt sich in der Verformung, nicht nur im Pivot: `solve()` beurteilt
das Ergebnis, bevor es es herausgibt.

Das Pivot-Kriterium aus
[ADR 0012](../docs/adr/0012-kinematics-is-detected-by-the-solver.md) ist
**einseitig**. Ein schräger Stab mischt über die Transformation `EA/L` und
`12EI/L³` in dieselbe Zeile; nach der Auslöschung steht in `K` die exakte Matrix
eines geringfügig anderen — tragfähigen — Modells. Ein Mechanismus lässt sich
dann sauber zerlegen und liefert große, aber endliche Zahlen. Gemessen an rund
250 Systemen: 24 von 132 kinematischen rutschen durch, mit Verdrehungen ab
`3.3e10 rad` ([ADR 0016](../docs/adr/0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md),
Beleg in `docs/messungen/kinematik-abstand.md`).

- **Neu: das vierte Netz.** `solve()` prüft je Knoten `|φ|` und je Stabende
  `|u|/L` gegen zwei Stufen. Über `warn` sammelt es eine
  `SmallRotationAssumptionWarning` — das Ergebnis verlässt den
  Gültigkeitsbereich der Theorie I. Ordnung. Über `fail` wirft es den neuen
  `ImplausibleDisplacementError`: das ist keine Verformung mehr, sondern eine
  Bewegung. Anders als beim Pivot-Hinweis ist der Knoten dabei **exakt**
  benennbar.

  Die Prüfung läuft **vor** der Rückrechnung — aus unbrauchbaren Verschiebungen
  sollen keine unbrauchbaren Schnittgrößen entstehen.

  Ehrliche Grenze: sie sieht den Mechanismus nur, wenn die Last ihn **anregt**.
  Deshalb ein viertes Netz und kein Ersatz für das Pivot; die Schwelle `1e-12`
  bleibt unverändert.

- **Breaking: `SolveResult` trägt `warnings: SolveWarning[]`.** Neue schmale
  Warnungswurzel neben `ModelValidationWarning` und `LoadValidationWarning` — ein
  Befund an der Rechnung betrifft weder das Modell noch die Eingabe, sondern das,
  was aus beiden geworden ist. Ein Ergebnis, das seine Vorbehalte nicht kennt,
  kann man nicht ablegen.

- **Breaking: `ANALYSIS_POLICY_SCHEMA_VERSION` 1 → 2.** Die `AnalysisPolicy`
  bekommt `deformationLimits` (`warn`/`fail` × `rotation`/`relativeDisplacement`,
  Defaults `0.1` / `1e3 rad` und `1e4`). Kein Migrationspfad: ein v1-Dokument
  scheitert am strikten Parser. Zulässig, weil `parseAnalysisPolicy` zum
  Zeitpunkt des Sprungs keinen produktiven Aufrufer hatte.

  Die Grenzen sind keine Plausibilitätsschätzung, sondern die Gültigkeitsgrenze
  der gerechneten Theorie (`sin φ ≈ φ`, Gleichgewicht am unverformten System) —
  und einheitenfrei, weil `rad` und `u/L` dimensionslos sind.
  `relativeDisplacement` bekommt eine Dekade mehr Luft, weil sie an der Feinheit
  der Eingabe hängt: derselbe 20-m-Kragarm misst `7.9` als ein Element und
  `1.6e2` als zwanzig.

- `check.ts`, der Port-Vertrag und Rust/WASM bleiben unberührt. `check()` kann
  Kinematik weiterhin nicht vorhersagen — dieser Teil von ADR 0012 gilt
  unverändert.
