# Catalogues are import sources; the model owns its values

A model record that names a catalogue entry **carries that entry's data with
it**. The profile table and the grade tables are read when a record is
*created*, never when a model is *computed*.

```ts
export type CrossSection =
  | { kind: 'shape';   id: string; shape: ShapeSpec }
  | { kind: 'profile'; id: string; profile: string; data: SteelProfileData };

export type Material = {
  readonly kind: MaterialKind;
  readonly id: string;
  readonly grade: string;
  readonly moduli: ElasticModuli;   // { E, G } in MPa
};
```

`profile` and `grade` stay — as **provenance**, not as the lookup key of the
computation. `schemaVersion` goes to `4`.

## The defect this closes

[ADR 0023](0023-cross-sections-belong-to-the-model.md) and
[ADR 0026](0026-materials-belong-to-the-model.md) made the snapshot
self-supporting *in its references*: `crossSectionId` and `materialId` now point
at records that travel with the model. They did not make it self-supporting *in
its numbers*. `resolveSectionStiffness` still reaches into two tables that are
compiled into whatever release happens to be running.

So a saved model recomputes against today's tables, not the ones it was built
with. Correct a rounding in `IPE 300`, revise the DIN NA, extend a grade row —
and every stored model silently answers differently, with nothing in the file to
show that anything moved. That is precisely the failure
[ADR 0011](0011-analysis-settings-split-into-versioned-policy-and-ports.md)
already forbids for the analysis policy:

> Storing overrides would make a project compute differently after a change to
> the software defaults, silently. A project outlives a release of the program,
> so reproducibility beats brevity.

This ADR extends that rule from *settings* to *catalogue data*, which is the
larger half of it.

## The rule: freeze the inputs, not the derivations

The line is not "copy everything". It is:

> **What the model computes from its own fields stays computed. What the model
> points at outside itself is brought inside.**

| Data | Owned by | Decision |
| --- | --- | --- |
| `ShapeSpec` (`b`, `h`, `tw`, `tf`) | the model | **stays computed** |
| Profile table row (`'IPE 300'`) | `steel-profiles` | **copied in** |
| Grade elastic constants (`'S235'`) | `material` | **copied in** |

`ShapeSpec` is the case that shows the rule is not "distrust everything". There,
`b` and `h` *are* the input; `A` and `Iy` are a pure function of them, and the
function lives in this repository under version control. Copying its result
would create two truths about one number, and a bug fix in `iSymmetric` could
never reach the model it belongs to.

A table row has no such function. It is *tabulated, not recomputed*
([ADR 0021](0021-section-values-separate-from-tabulated-profiles.md)) — an
external measurement whose only route into the program is a lookup. The string
`'IPE 300'` is therefore not input; it is a pointer to input that lives
somewhere else. The same holds for `Es = 210000`.

This is also what the established programs do. RSTAB/RFEM copies the section and
material values into the model on selection, keeps the designation next to them
as provenance, marks an edited set as user-defined, and offers re-import as an
explicit action. SOFiSTiK reaches the same place by a different route: the code
version is an explicit input record, the resolved values are written to the CDB
and the printout, and the program version is pinned per project. Neither lets a
changed table reach an old model unannounced.

## The profile record copies the whole row

`data: SteelProfileData` — all of it, not the five numbers the stiffness needs.

Two consumers already read disjoint subsets of the row: `profileProperties`
reads `A`, `Ay`, `Az`, `Iy`, `Iz`, while `rolledIStressPoints` reads the
dimensions `h`, `b`, `tw`, `tf`, `r`. Design will read `Wply` and `It`. Any
subset would be a fresh opinion about what a profile *is*, invented here and
contradicted by the next consumer.

The row is a published artifact with a canonical extent — "IPE 300 as printed" —
and `SteelProfileData` already is exactly that type, already JSON, already in the
units the standard prints. Copying it needs no new vocabulary at all.

## The material record copies only the moduli

`moduli: ElasticModuli` — `{ E, G }`, and deliberately **not** `fyk`, `fck` or
`fmk`.

The asymmetry with the profile row is real and has a reason. There is no
"material row": `Steel`, `Concrete` and `Timber` are three different shapes with
three different field sets, so "copy the whole thing" would mean a three-way
discriminated union in the snapshot parser. And two of the three carry *design*
values, which are not the material's to state — they belong to the Annex.
`{ E, G }` is the one shape all three families share, and it is exactly what the
computation consumes.

Strengths stay out because **nothing reads them**. A copied `fyk` would be a
number no test could check and no result could contradict — frozen data whose
correctness nobody would notice failing. When design arrives, the characteristic
strengths join this record additively, per family, with the version bump that
implies. `gamma` (Wichte) is the known next field and arrives with self-weight.

`ElasticModuli` moves from `@baustatik/fem-section-resolve` to
`@baustatik/material`, where the values come from. The resolver keeps consuming
it and re-exports it, so `sectionStiffness(props, moduli)` is unchanged.

## The lookup moves to where a model is built

`lookupProfile` leaves `cross-section` and the grade lookup leaves the
stiffness path. Both move to the builder — `model.crossSection({ kind:
'profile', profile: 'IPE 300' })` resolves the row *there* and stores it.

**The DSL surface does not change.** `CrossSectionInput` and `MaterialInput` keep
naming the catalogue entry, exactly as `femScriptDeclarations` already declares
them; the copy is what `finish()` writes, not what the author types. This is
RSTAB's split precisely: choose by name in the dialog, store numbers in the file.

Building a model therefore needs **no National Annex**. `material` gains an
Annex-free `materialModuli(kind, grade)` beside `createMaterials`, reading the
same tables and the same `G` quotients that `makeSteel`/`makeConcrete`/
`makeTimber` use. ADR 0026 established by test that the Annex does not move the
FEM; now the FEM path cannot see the Annex at all.

## The failure moves with the lookup, and splits in two

Today both of these arrive as one `undefined` in the solver's report:

- `'IPE 301'` — a designation that is not in the catalogue.
- `crossSectionId: 'x'` — a reference to a section this model does not contain.

They are different failures. The first is a typo, and it is answerable *where it
is written*: `model.crossSection({ profile: 'IPE 301' })` now throws
`FEMScriptError`, at the line the author can fix. The second is a statement about
the model as a whole and stays what it is — `UnknownSectionStiffnessError` in the
report ([ADR 0010](0010-check-report-is-a-state-machine.md)).

`sectionProperties` and `stressPoints` become total for the profile branch: given
a record, the row is present. `undefined` there now means only what it always
should have meant — implausible dimensions, or a shape with no stress-point
template yet.

## The parser must not check the copy against the catalogue

`parseFEMModelSnapshot` validates `data` and `moduli` as **shape**: exact key
set, finite numbers, the positivity the field implies. It does **not** compare
them with the current table.

That restraint is the whole point. A parser that re-resolved on load — or
"corrected" a mismatch — would reintroduce silent recomputation through the back
door, and would do it at the one moment a user has the least chance to notice.
The rule of ADR 0023 and ADR 0026 is unchanged: shape, not resolvability.

## Drift is a finding, never a repair

A copy can diverge from the catalogue, and the program must be able to say so.
The route is a separate, explicitly invoked comparison — `compareToCatalogue(model)`
returning per-record differences — never an automatic refresh on load or solve.
Updating a section to the current table is a user's action with a visible diff,
the same way RFEM's re-import is.

It is **not** built here: there is no surface to show a diff on. This ADR records
where it goes, so the next person does not put it in the parser.

## `schemaVersion: 4` rejects version 3

A v3 snapshot is rejected, not filled in by lookup. Filling in would be the
silent resolution this ADR exists to remove, performed once at the worst possible
moment and then indistinguishable from a value the author chose. A migration is a
tool a user runs, prints, and can refuse — not a parser branch.

Nothing on disk is affected; no snapshot has ever been persisted.

## Consequences

- Breaking change to `@baustatik/cross-section`: the `profile` variant gains a
  required `data`. `sectionProperties`/`stressPoints` no longer look anything up;
  the dependency on `steel-profiles` becomes type-only in `src`.
- Breaking change to `@baustatik/material`: `Material` gains a required
  `moduli`; `ElasticModuli` and `materialModuli` are new exports.
  `createMaterials` and `MaterialCatalog` are untouched — ADR 0002 stands.
- Breaking change to `@baustatik/script`: `schemaVersion: 4`;
  `CrossSectionInput`/`MaterialInput` become explicit types rather than
  `Without<Record, 'id'>`; `crossSection()` and `material()` can throw
  `FEMScriptError`. The authored DSL and `femScriptDeclarations` are unchanged.
- `resolveSectionStiffness(beam, model)` loses its third parameter. The
  `as SteelGrade` cast, the `try`/`catch` around `UnknownGradeError` and the
  family switch in `resolveModuli` all disappear — the seam between "what is
  saved" and "what hangs on the Annex" is gone rather than maintained.
- The composition root no longer needs `createMaterials` to compute. The demo
  apps drop it from the solver wiring.
- Snapshots get substantially larger and less readable by hand. That is the
  price, and it is the same price a `.rs9` pays.
- The National Annex remains unpersisted, but is no longer urgent: it is now
  needed only where design happens, which does not exist yet. When it lands, the
  same rule applies — full `NationalAnnexParams`, with `'DE'` as provenance
  (`packages/PLAN.md`, open question 1).
