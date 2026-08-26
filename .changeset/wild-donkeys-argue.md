---
'@baustatik/cross-section': patch
'@baustatik/script': patch
---

Der parametrische Vollquerschnitt läuft durch dieselbe FE wie die gezeichnete
Figur (ADR 0062). `shapeOutline(spec)` schreibt jede der vier Formen als
Polygonzug aus; κ, `It` und `yM`/`zM` kommen für `idealisation: 'solid'` aus
`@baustatik/cross-section-fe` statt aus Grashof beziehungsweise `undefined`.

```ts
const shape = { kind: 't-section', bf: 2000, hf: 200, bw: 250, h: 500, idealisation: 'solid' } as const;

const geometry = createSectionGeometry(
  { kind: 'outline', rings: shapeOutline(shape) ?? [] },
  policy,
);
const { state } = await computeFESectionValues(geometry, policy);

// Der Block gehört jetzt an den Satz selbst.
sectionProperties({ kind: 'shape', id: 't', shape, feValues: state });
```

**BREAKING: ohne aufgelösten FE-Block ist der parametrische Vollquerschnitt
schubstarr.** `sectionProperties` liefert dort `kappaY`/`kappaZ: undefined`,
`resolveSectionStiffness` gibt `GAs: 'rigid'`, und `check()` meldet
`ShearDeformationUnavailableWarning`. Bis hierher lieferte Grashof **immer** eine
Zahl — gemessen +11 % bis +134 % zu schubsteif, immer auf der steifen Seite
(`docs/messungen/t-querschnitt-grashof-gegen-fe.md`). Gespeicherte Modelle
brauchen einen Lauf.

**BREAKING: `schemaVersion` 13 → 14.** `CrossSection` trägt das optionale Feld
`feValues` jetzt auch in der `shape`-Variante. Ein v13-Snapshot ist an der
Gestalt unverändert gültig — was sich ändert, ist die **Bedeutung** der
Abwesenheit des Blocks, und deshalb wird er abgewiesen statt still anders
gerechnet.

- **`ShapeResult.pathY`/`pathZ` sind optional.** Die Grashof-Pfade des
  Vollquerschnitts sind gelöscht: `solidPaths` in `shapes/t-section.ts` und
  `shapes/i-symmetric.ts`, der inline `solid`-Arm in `shapes/hollow-rectangle.ts`
  und der Weg in `shapes/rectangle.ts` ganz. `calculation/shear.ts` bleibt
  **vollständig** — der dünnwandige Zweig lebt davon, und `κ = 5/6` fürs
  Rechteck wird dort weiterhin bewiesen, jetzt in `tests/kappa.test.ts` gegen
  `shearArea` statt gegen `rectangle()`.
- **Die geschlossene Formel bleibt und wird zum Orakel.** `A`, `Iy`, `Iz`,
  `Iyz`, `ys`, `zs`, `alpha`, `Iu`, `Iv` brauchen keine FE und antworten
  unverändert synchron. Geprüft wird der Umriss gegen sie (Green, `1e-12`) und
  gegen den FE-Fingerabdruck, der aus dem Netz kommt.
- **Ohne ν kein κ**, wie bei der gezeichneten Figur schon immer: ein
  Holz-Vollquerschnitt rechnet schubstarr statt Grashof. Kein `nu ?? 0`.
- **`@baustatik/cross-section-fe` ist unverändert.** Seine Tür nimmt eine
  `SectionGeometry`, und `{ kind: 'outline', rings, outline }` ist eine — das
  war der Prüfstein der Entscheidung.
