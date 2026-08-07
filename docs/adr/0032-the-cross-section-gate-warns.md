# The cross-section gate warns, it does not refuse

The third of the P0 decisions, next to
[ADR 0030](0030-the-section-editor-stores-a-wall-graph.md) (the stored type) and
[ADR 0031](0031-the-cross-section-plane.md) (the value range). You look this one
up during the argument about why the editor only *reports* a 47 % deviation.

> **A cross-section cannot consent on behalf of the beam that uses it.**

## Two doors, because two different questions

```ts
// @baustatik/cross-section
validateSectionGeometry(g: SectionGeometry, opts: { arcTolerance: mm })
  : { errors, warnings }
validateSectionProperties(p: SectionProperties): { errors, warnings }

// @baustatik/geometry-2d
export const DEFAULT_ARC_TOLERANCE = 0.05; // mm
```

The split separates "is this record consistent in itself" from "does it match
the geometry library currently running". What makes the split possible is that
the checks in `cross-section` need **no** geometry library: the gate reads the
**carried** polygon (Shoelace, no library), and the end tangent of an arc wall
lies at `Δ/2 = 2·atan(bulge)` off the chord (trigonometry, no `Arc` object).
**The kink warning does not need P1** — the order P0 → P1 stays clean, and
`@baustatik/script` pulls no geometry library into the snapshot builder.

`deriveOutline` and `checkOutlineDrift` belong to `@baustatik/geometry-2d` and
arrive with P3, together with `clipper2-ts`. P0 adds only the constant.

| Channel | Content |
| --- | --- |
| `errors` | the record is **not computable**: duplicate node/wall id, `t ≤ 0`, zero-length wall, dangling `from`/`to`, unknown node, empty outline |
| `warnings` | computable, **under an assumption** — the four sentences below |

There is deliberately **no `assertValidSection…`**. The cross-section is not a
gate in front of the calculation chain; whoever cannot compute one gets
`undefined` out of `sectionProperties`, and that becomes a model error **in the
report** rather than an exception in the middle of `solve()`.

## The four sentences

| # | Trigger | Statement |
| --- | --- | --- |
| 1 | `Iyz ≠ 0` | not in principal-axis position — holds only while the beam is held out of plane |
| 2 | **`yM ≠ ys`** | a shear force through the centroid twists (`T = Vz·e`, `e = yM − ys`) |
| 3 | kink at an arc | tangency broken |
| 4 | **`yM === undefined`** | shear centre **not determined** — the condition in 2 is unchecked |

### Warning, not consent

The obvious alternative is a field "held out of plane: yes". That is not a
property of the cross-section. The same angle section is held in one beam and
free in the next, and `CrossSection` is **shared** across beams
([ADR 0023](0023-cross-sections-belong-to-the-model.md)). The statement belongs
on the `Beam` and stays additively possible there; P0 does not block it.

### Sentence 2 keys on `yM` alone

Not on the pair `(yM, zM)`. The plane frame knows only `Vz`; an offset in `z`
produces no torsion in it. Keying on the pair would fire at **every** plate
beam — singly symmetric, `yM = ys = 0`, and nothing twists. `zM` stays
information and stock for a spatial model.

### Sentence 4 is self-erasing

It fires between P0 and P5 for wall sections, falls silent with P5, and stays
standing permanently at a free solid section. "Unchecked" is a different
statement from "checked and fine", which is why it gets its own sentence rather
than silence.

**No substitute indicator is possible.** `Iyz = 0` does not rule torsion out
(the symmetrically placed channel), and `Iyz ≠ 0` does not imply it (the Z
profile).

### The kink threshold is derived from the tolerance, not set

```text
theta = |end tangent A − end tangent B|
notch = (t / 2) · tan(theta / 2)          offset of the outline corner
warn when notch > arcTolerance            and at least one wall is an arc
```

At `0.05 mm` that means `t = 6 → ≈1.9°`, `t = 12 → ≈0.95°`, `t = 20 → ≈0.57°`.
That **thicker walls tolerate less kink** is right: their notch gets deeper. One
constant instead of two — and the one is already justified.

Two restrictions carry meaning rather than convenience. The check runs only at
nodes of **degree 2**: at a junction — the web/flange node of a T — there is no
continuation whose tangent could be broken. And it runs only where **at least
one wall is an arc**: two straight walls meeting at an angle are a corner, not
broken tangency, which is the normal case at every welded profile.

### The tolerance is a parameter, not a constant in the gate

This resolves the contradiction between "no new dependency for
`cross-section`" and "the threshold hangs on a number from `geometry-2d`" — and
it is the form
[ADR 0011](0011-analysis-settings-split-into-versioned-policy-and-ports.md)
already chose for numbers that change results.

`DEFAULT_ARC_TOLERANCE` also cleans up an existing silent model assumption. The
discretisation tolerance lived at two places with two numbers: `Arc.toPolyline`
defaulted to `0.1`, and the cross-section viewer split every arc into a fixed
`24` segments. Both decide how many points an outline carries, and therefore
which `A`, `Iy`, `Iz` fall out of it.

## Consequences

- **Duplicate ids are the price of the string ids** chosen in ADR 0030. With
  index references the case cannot arise; with ids, `new Map(nodes.map(…))`
  silently keeps the *last* entry, every wall attaches to the wrong point, and
  every later check judges a figure nobody drew. Duplicate *wall* ids reach the
  viewer too, which reconciles its draw specs by `id`. One finding per id, with
  the count as a field — three entries for one id would be the same sentence
  three times. The check lives in the gate and not in the snapshot parser: the
  parser checks **shape**, the gate checks computability.
- The classes live in `packages/cross-section/src/errors.ts`, rooted in
  `BaustatikError`, after the pattern of `fem/src/errors.ts`: two hierarchies,
  two words, ids as **fields** rather than only in the message — the gate returns
  its findings, and a surface marks the affected wall by them.
- `Iyz !== 0` and `yM !== ys` compare **exactly** against zero. Every source
  today writes a literal `0`; the first source to integrate `Iyz` numerically
  (P2) brings the question "how small is zero" with it. A threshold here would be
  guessed before there is anything to estimate.
- Left open: the self-intersection check, the only `errors` sentence that is not
  obviously dependency-free.
