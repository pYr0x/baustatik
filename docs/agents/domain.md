# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: multi-context

This is a pnpm/turbo monorepo. Each package under `packages/*` and each app under `apps/*` is its own bounded context.

## Before exploring, read these

- **`AGENTS.md`** at the repo root — its repository map is this repo's context map, one line per package. Read the `CONTEXT.md` of each package relevant to the topic.
- **`packages/<pkg>/CONTEXT.md`** / **`apps/<app>/CONTEXT.md`** — the glossary for the context you're working in.
- **`docs/adr/`** — system-wide decisions; read ADRs that touch the area you're about to work in. Also check `packages/<pkg>/docs/adr/` (or `apps/<app>/docs/adr/`) for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── AGENTS.md                          ← repository map
├── docs/adr/                          ← system-wide decisions
├── packages/
│   ├── section-geometry/
│   │   ├── CONTEXT.md
│   │   └── docs/adr/                  ← package-specific decisions
│   └── fem-2d/
│       ├── CONTEXT.md
│       └── docs/adr/
└── apps/
    └── <app>/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
