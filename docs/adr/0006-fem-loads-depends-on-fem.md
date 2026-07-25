# `fem-loads` depends on `@baustatik/fem`, confined to one file

`@baustatik/fem-loads` now lists `@baustatik/fem` as a dependency and imports
`Node` and `Beam` in `src/model-geometry.ts`. This reverses a decision that the
package documented in three places — the `validate.ts` header said outright
"WARUM KEIN IMPORT AUS `@baustatik/fem`", and its handoff advertised "genau zwei
Dependencies". A reader who finds those older notes elsewhere deserves to know
why the opposite is now true.

The validation deliberately asks the model only two questions, through the
`LoadModelGeometry` interface: does this node exist, and where does this beam's
axis run. That stays. The rules genuinely do not need `crossSectionId`,
`materialId` or `releases`, and keeping them out means a rule like
`0 <= from <= to <= L` is expressed against a length rather than against an
object graph. What changed is the other side: **somebody has to answer those two
questions**, and until now nobody shipped an implementation. Both call sites we
could name — the load-input dialog, which validates a draft that is not in the
store yet, and `createFEMSolver`, which validates what is — would each have
hand-written the same six-line object literal with the same `byId` map. Two
copies of a lookup is where the third copy comes from.

The alternative we rejected was structural parameters: declare the argument as
`readonly { id: string; position: { x: number; z: number } }[]` and let
TypeScript match `Node[]` by shape without importing it. That would have kept
the dependency list at two, and it typechecks. We chose the real import because
the coupling exists either way and a `package.json` entry states it where
tooling can see it — renaming `startNodeId` in `@baustatik/fem` then breaks in
`fem-loads`, at the place that actually made the assumption, instead of
surfacing later in whichever application happened to call it.

We also rejected going further and dropping `LoadModelGeometry` entirely in
favour of `validateLoads({ nodes, beams }, loads)` — the signature the
`fem-load-resolve` handoff originally sketched. Once `fem-loads` knows the model
package, the interface's original justification ("keep `fem` out") is gone, so
this was a fair question. It stays for a different reason: `fem-load-resolve`
consumes the same interface (`resolve.ts`) and its `CONTEXT.md` records that it
does **not** depend on `@baustatik/fem`. Widening the signature would push the
dependency one package further down the chain for no gain, and it would replace
an O(1) map lookup with a scan per beam per load.

The containment is the point of this record: the import lives in
`src/model-geometry.ts` and nowhere else. `types.ts`, `validate.ts` and
`reference-length.ts` still know nothing about `Node` or `Beam`. If a future
change spreads that import into the rules, the trade-off recorded here no longer
holds and should be reopened rather than extended.
