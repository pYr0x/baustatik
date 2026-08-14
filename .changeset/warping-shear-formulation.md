---
'@baustatik/cross-section-fe': patch
'@baustatik/cross-section': patch
'@baustatik/script': patch
---

Das Schubproblem des Vollquerschnitts rechnet über eine Verwölbung.

Ein gezeichneter Vollquerschnitt mit einem Loch **neben** der Biegeachse lieferte
bisher weder κ noch einen Schubmittelpunkt: die FE verweigerte mit
`reason: 'hole-off-bending-axis'`. Diese Grenze ist ersatzlos weg
([ADR 0048](https://github.com/pYr0x/baustatik/blob/main/docs/adr/0048-the-shear-problem-uses-the-warping-formulation.md)).

**Sie war eine Eigenschaft der Formulierung, nicht der Figur.** Das Schubproblem
lief über eine Spannungsfunktion `Φ`, die je Randschleife nur bis auf eine
Konstante bestimmt ist; ihr Randdatum musste beim Umlauf schließen, und der
Sprung `∮dΦ = (1/Iy)·∫∫_D z dA` verschwindet nur, wenn der Schwerpunkt jedes
Lochs auf der Biegeachse liegt. Über eine **Verschiebung** gerechnet stellt sich
die Frage nicht — genau darum lief die Torsion schon immer so, und genau darum
war `It` von der Verweigerung nie betroffen.

Gemessen wurden beide Formulierungen auf demselben Netz und `τ` in jedem
Gaußpunkt verglichen:
[`docs/messungen/verwoelbung-gegen-dirichlet.md`](https://github.com/pYr0x/baustatik/blob/main/docs/messungen/verwoelbung-gegen-dirichlet.md).

**BRUCH: `@baustatik/script` geht auf `schemaVersion: 12`.** Die Union von
`feValues.reason` schrumpft auf `'disconnected-areas'`. Ein v11-Snapshot kann
`'hole-off-bending-axis'` tragen, und `parseFEMModelSnapshot` weist ihn künftig
ab. Dieselbe Figur liefert heute `status: 'computed'` — den Wert still
umzuschreiben hieße, eine Verweigerung in Zahlen zu verwandeln, die niemand
nachgerechnet hat.

**BRUCH: `FEResult.shear` ist nicht mehr `| undefined`.** Wer
`computeFromMesh` direkt ruft, braucht den `undefined`-Zweig nicht mehr.
`computeFESectionValues` kann nur noch **vor** dem Vernetzen verweigern
(`'disconnected-areas'`), also trägt `FESectionState` mit `status: 'unsupported'`
in der Praxis kein `It` mehr.

Weiter:

- **Eine Matrix statt zweier.** Torsion und Schub sind beide reines Neumann und
  teilen sich Steifigkeitsmatrix und Zerlegung: fünf rechte Seiten auf einer
  Faktorisierung, wo es zuvor zwei Assemblierungen, zwei Zerlegungen und `4 + h`
  Spalten waren.
- **`FEDiagnostics`**: `closureZ`, `closureY` und `capacitanceAsymmetry` fallen
  weg; neu sind `compatibilityPsi0Z/Y` und `compatibilityPsi1Z/Y` — der Rest der
  Verträglichkeit je rechter Seite, **identisch** null.
- **`d1RatioZ`/`d1RatioY` laufen jetzt mit `O(h³)` gegen null**, statt strukturell
  null zu sein. Das ist ein Gewinn: eine Größe, die per Konstruktion null ist,
  prüft nichts.
- `κ = 0,833333333333` beim Rechteck steht unverändert auf zwölf Stellen.
- An ADR 0045 ändert sich sonst nichts: Koeffizientenform, ν-Freiheit,
  Trefftz-Schubmittelpunkt und der materialfreie Satz bleiben in Kraft.
