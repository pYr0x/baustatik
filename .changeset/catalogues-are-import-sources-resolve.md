---
'@baustatik/fem-section-resolve': minor
---

Der Katalog-Parameter entfaellt — der Schritt, der Code WEGNIMMT.

- **Neue Signatur: `resolveSectionStiffness(beam, model)`.** Bis hierher kam ein
  dritter Parameter `catalog` herein, und die Naht zwischen „was gespeichert
  wird" und „was am Nationalen Anhang haengt" lag genau hier. Seit die Zahlen im
  Modellsatz stehen ([ADR 0027](../docs/adr/0027-catalogues-are-import-sources.md)),
  gibt es diese Naht nicht mehr.
- **`resolveModuli` ist geloescht.** Mit ihm verschwinden der Familien-`switch`,
  die drei `as SteelGrade`-Casts und das `try`/`catch` um `UnknownGradeError`.
  Die Familienwahl faellt einmal beim Anlegen des Satzes, nicht bei jedem
  Aufruf.
- **„Der Anhang bewegt die FEM nicht" ist keine Zusicherung mehr, sondern eine
  Bauform.** Es gibt keinen Parameter mehr, an dem ein Anhang haengen koennte;
  `@baustatik/material` wird nur noch fuer zwei Typen importiert. Der frueher
  hier stehende DE/EN-Test ist deshalb ersatzlos entfallen — was von ihm zu
  pruefen bleibt, steht jetzt in `material/tests/moduli.test.ts`.
- **`undefined` heisst weniger als vorher:** unbekannter `crossSectionId`,
  unbekannter `materialId`, oder ein Querschnitt, dessen Werte sich nicht bilden
  lassen. „Unbekannte Sorte" und „unbekanntes Profil" stehen nicht mehr dabei —
  ein Tippfehler wird beim Anlegen gemeldet, ein Verweis ins Leere im Bericht.
  Zwei Fehler, die vorher als dasselbe `undefined` ankamen, sind damit getrennt.
- `ElasticModuli` wird aus `@baustatik/material` re-exportiert;
  `sectionStiffness(props, moduli)` ist unveraendert.
