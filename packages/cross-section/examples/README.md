# Examples

Every kind of cross-section this package knows, built once and printed: section
properties, κ and stress points. These files are **not tests** — they assert
nothing. They exist to show what the call sites look like. The guarantees live
in `tests/`.

```text
pnpm --filter @baustatik/cross-section example
```

| File | What it shows |
| --- | --- |
| `rectangle.ts` | The only shape without `idealisation`; κ comes out as exactly 5/6. |
| `i-symmetric.ts` | The same welded I twice — `solid` vs. `thin-walled`. Same coordinates and numbers, different `t`, `S` and κ. |
| `t-section.ts` | Reinforced-concrete T-beam (`solid`, centroid inside the flange) and welded steel tee (`thin-walled`). |
| `hollow-rectangle.ts` | Full section properties, but `stressPoints` returns `undefined` — the box has no template yet. |
| `rolled-profile.ts` | Catalogue profile: `lookupProfile` once when the section is created, the table row travelling in `data`. |
| `undefined-cases.ts` | What `undefined` means: `sectionProperties` does not throw. |

`report.ts` holds the printing only; every number comes from the two exported
functions `sectionProperties` and `stressPoints`.

## Why this runs differently from `src`

Node runs these files directly (it strips the types itself), which has two
consequences that do not apply anywhere else in the package:

- **Relative imports carry the `.ts` extension.** `src` is bundled by Vite and
  follows the repo rule of extensionless imports; plain Node ESM resolution
  needs the extension.
- **The package is imported by its own name** and therefore resolves to
  `dist/`, exactly as a consumer would see it. The `example` script builds
  first. The workspace dependencies (`@baustatik/units`,
  `@baustatik/steel-profiles`) need their `dist/` too — run `pnpm build` at the
  repo root once if they are missing.

`examples/tsconfig.json` type-checks this folder; it is wired into the
package's `typecheck` script so an example cannot rot unnoticed.
