---
'@baustatik/cross-section': patch
---

Aus dem `ShearSegment` wird das **`ShearFlowInterval`**. Nur Namen und
Kommentare — keine Zahl bewegt sich, und die öffentliche API ist nicht
betroffen (`shear.ts` ist package-intern, `src/index.ts` exportiert daraus
nichts).

- **`Segment` versprach eine Lage, die der Typ nicht hat.** Er ist ein Stück
  der Laufkoordinate `s`, kein Stück Querschnitt: `pathZ` des I-Profils benutzt
  dasselbe Gurtobjekt viermal, ein Ort ließe sich daraus nicht ablesen.
  `Interval` sagt genau das, und die Funktionsfamilie zieht mit —
  `partSegments` → `partIntervals`, `crossWallSegment` → `crossWallInterval`,
  das Rückgabefeld `.segments` → `.intervals`.
- **Damit ist `Segment` frei**, und es bleibt reserviert für das
  **positionierte** Wegstück mit Startpunkt und Richtung, aus dem κ und die
  Spannungspunkte einmal gemeinsam fallen sollen (`packages/TODO.md`). Das war
  der eigentliche Grund für den Rename; `Wall` (ADR 0030) ist unabhängig davon
  begründet und bleibt.
- **Nicht `ShearEnergyInterval`**, obwohl `shear.ts` mit der Schubenergie
  aufmacht: `∫ S²/t ds` ist mit `L⁶` eine rein geometrische Größe — deshalb
  fällt `A_s = I²/∫` als Fläche heraus. Die Schubenergie ist das Prinzip hinter
  der Formel und gehört in die Begründung, nicht in einen Typnamen, der sonst
  eine Einheit behauptet, die er nicht trägt.
- **Die Literatur gibt kein Wort her.** Sie führt das Stück nicht als Objekt,
  sondern integriert abschnittsweise über `s` und beschriftet „Bereich I, II,
  III". Dlubal (SHAPE-THIN/RSECTION) sagt _Element_ — im Monorepo vom
  FE-Element belegt; _Branch_ und _Zelle_ sind in der Theorie dünnwandiger
  Profile anders vergeben.
