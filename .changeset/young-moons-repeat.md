---
'@baustatik/fem-viewer': patch
---

Draw the `N`, `V` and `M` diagrams (ADR 0050).

**Breaking at `ViewerConfig` and `FEMSceneOptions`** — recorded here rather than
in the version arithmetic (ADR 0036):

- `getReactions: () => ReadonlyMap<string, SupportReaction> | undefined` is
  replaced by `getResult: () => SolveResult | undefined`; `femSpecs`' `reactions`
  option becomes `result`. The reactions are read out of `result.reactions`. Two
  pulls meaning the same computation could desynchronise, and the diagrams need
  the same result. `@baustatik/fem-solver` is therefore now a **runtime**
  dependency (`internalForcesAlong`), not a type-only one.
- `FEM_LAYERS` gains a band: `diagrams`, between `hinges` and `loads`. Any driver
  built from the tuple picks it up; a hard-coded band list does not.

New:

- `getDiagrams: () => DiagramOptions | undefined` and the matching `diagrams`
  option on `femSpecs`. `DiagramOptions` carries one optional number per internal
  force — **presence is the switch**, the value is the exaggeration. A factor of
  `0` or less throws `InvalidDiagramExaggerationError`.
- The reference size is **global per internal force**: `ref[K] = max |K(x)|` over
  all beams and all stations, so two field moments in one picture are comparable.
  `ref[K] === 0` produces not a single spec. The ordinate `diagramOrdinateM`
  (0.5 m) is the package's **first world measure** — it is not divided by
  `vp.scale` and the area therefore scales with zoom, an amendment to the
  "schematic, not scale drawing" invariant.
- Every beam gains a dashed fibre on its `+ez` side (`beam:{id}:fiber`), drawn
  with or without a result: it shows which side the node order made the positive
  one. It is always on; a switch is a view-policy question.
- `ResultStyle` gains the diagram keys (ordinate, resolution, twelve colours,
  label metrics), `ModelStyle` the four fibre keys. `LabelStyle` is split out of
  `SymbolStyle`, which now extends it — no existing caller changes.
