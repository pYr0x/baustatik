# @baustatik/cross-section-fe

## 0.0.1

### Patch Changes

- 2108d8a: FE-Querschnittswerte für gezeichnete Vollquerschnitte.

  Ein gezeichneter Querschnitt, der als Vollquerschnitt gerechnet wird, lieferte
  bisher kein κ, kein `It` und keinen Schubmittelpunkt. Diese Lücke ist
  geschlossen — über eine 2D-FE-Rechnung auf einem Tri6-Netz
  (ADR 0045, ADR 0047).

  **NEU: `@baustatik/cross-section-fe`.** Eine asynchrone Tür,
  `computeFESectionValues(geometry, policy)`. Sie vernetzt (`mesh-2d-wasm`), löst
  zwei Randwertprobleme (`sparse-solver-wasm`) und gibt zwei Dinge zurück: den
  Satz-Anteil und das Netz daneben (transient, ADR 0039). **Eine Geometrie herein,
  ein Ergebnis heraus — keine ID:** die Deduplizierung gehört der Anwendung, und
  ihr Wächter ist das Feld `feValues` im Satz selbst.

  **BREAKING CHANGES:**

  - **`@baustatik/script`: `schemaVersion` 10 → 11.** Jeder v10-Snapshot wird
    abgelehnt und nicht ergänzt. Drei Gründe zugleich: `SectionPolicy` bekommt das
    Pflichtfeld `FEElements`, `SectionGeometry` das optionale `feValues` in beiden
    Varianten, `ElasticModuli` das optionale `nu`.
  - **`@baustatik/cross-section`: `SectionPolicy` bekommt `FEElements`
    (Pflichtfeld, Default `4000`).** `parseSectionPolicy` ist strikt, also weist
    er jeden Satz ohne dieses Feld ab. Es ist eine dritte Sorte Feld — es ändert
    den Umriss nicht und beurteilt ihn nicht, es _erzeugt Zahlen, die im Satz
    gespeichert werden_.
  - **`@baustatik/material`: `ElasticModuli` bekommt `nu?`.** Optional, und die
    Abwesenheit ist eine Antwort: Holz ist orthotrop, hat kein isotropes ν und
    bekommt deshalb kein κ. Nicht aus `E` und `G` zurückgerechnet — das gäbe
    `0,30001` für Stahl und `6,97` für C24.
  - **`@baustatik/core`: `atOrThrow` nimmt `ArrayLike<T>` statt `readonly T[]`.**
    Strikt weiter als vorher; die FE rechnet in typisierten Feldern, und die
    Hausregel „`!` steht in keinem `src/`" war dort sonst nicht einzuhalten.

  **Weiter:**

  - `SectionProperties` bekommt `inverseKappaY`/`inverseKappaZ` — κ als ν-freie
    FORMEL `1/κ = d0 + d2·m²` mit `m = ν/(1+ν)`. Der Querschnitt bleibt damit
    materialfrei (ADR 0020).
  - `@baustatik/fem-section-resolve` wertet sie mit dem ν des Stabmaterials aus.
    Fehlt `nu`, bleibt der Stab schubstarr — derselbe Fall wie bisher, und
    `check()` meldet ihn weiterhin mit `ShearDeformationUnavailableWarning`.
  - Das Gate meldet einen FE-Block, dessen Fingerabdruck nicht mehr zum Umriss
    passt — als bestehende `OutlineDriftWarning`, keine neue Warnung.
  - `t-section` + `solid` behält sein Grashof-κ. Das ist eine bekannte, offene
    Lücke: gemessen liegt Grashof beim T um +11 % bis +134 % daneben
    (`docs/messungen/t-querschnitt-grashof-gegen-fe.md`).

- Updated dependencies [2108d8a]
  - @baustatik/cross-section@0.0.6
  - @baustatik/core@0.0.3
  - @baustatik/mesh-2d-wasm@0.0.3
