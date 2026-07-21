---
name: creating-package-context
description: Use when creating or updating package-level CONTEXT.md files in a monorepo, especially when agents need concise package ownership, boundaries, invariants, entry points, dependencies, and validation guidance.
---

# Creating Package Context

## Overview

Create a compact navigation map for future agents. Document stable facts that
are expensive to rediscover; leave API details to source code and usage docs.

## Workflow

1. Read the root agent instructions and obey their documentation policy. If
   they prohibit package context files, stop unless the user explicitly
   overrides that policy.
2. Identify the requested package directories. Do not include legacy,
   generated, backup, or placeholder directories unless explicitly requested.
3. Read an existing `CONTEXT.md` completely before updating it.
4. Gather evidence from the smallest useful set of files:
   - package manifest and workspace configuration;
   - public entry point and package exports;
   - README, usage docs, ADRs, and package-local agent instructions;
   - test/build configuration and package scripts;
   - source files needed to verify ownership, boundaries, and invariants;
   - manifests or imports needed to identify internal consumers.
5. Write or update `CONTEXT.md` using
   [assets/CONTEXT.template.md](assets/CONTEXT.template.md). Omit sections that
   add no information. Aim for 20-50 lines for a small utility package and
   40-120 lines for a substantial package.
6. Validate every statement against repository evidence. Use explicit wording
   such as "Not established in the repository" only when the absence itself
   matters; otherwise omit uncertain claims.
7. Review the diff. Change only requested context files unless the user also
   asks for source, configuration, or root documentation changes.

## Content Rules

Include:

- the package purpose in one or two sentences;
- what the package owns and explicitly does not own;
- upstream internal dependencies and important downstream consumers;
- public entry points and a few high-value navigation paths;
- stable architectural rules, domain language, units, coordinate systems,
  numeric conventions, or lifecycle invariants;
- exact package validation commands and links to canonical documentation;
- stable limitations only when they materially affect future changes.

Exclude:

- exhaustive export, class, function, or file catalogs;
- tutorials or examples already covered by `README.md` or usage docs;
- speculative design intent inferred only from names;
- transient TODO lists, issue inventories, version numbers, and generated
  output;
- generic TypeScript, testing, or monorepo advice already present at the root.

Prefer links over duplication. Use repository-relative paths with forward
slashes. Describe dependency roles, not merely dependency names. Keep
implementation details only when they encode a boundary or invariant that a
future change could accidentally violate.

## Validation Checklist

- Each path and command exists.
- Dependencies agree with package manifests and actual imports.
- Public entry points agree with package exports.
- Invariants have direct evidence in code, tests, ADRs, or canonical docs.
- The document explains where changes belong without restating the API.
- Small packages receive small documents.
- Existing useful context is preserved when updating.

## Common Mistakes

Do not rewrite the API, infer design from names, list unexplained dependencies,
fill empty headings, or record transient implementation accidents. Link, verify,
explain, omit, and preserve only stable constraints.
