# `<package-name>`

## Purpose

State the package's responsibility in one or two sentences.

## Boundaries

- Owns: stable responsibilities and concepts defined here.
- Does not own: adjacent responsibilities that belong elsewhere.

## Dependencies

- `<internal-package>`: explain the role of this dependency.

Important consumers: link only the packages or applications that clarify the
dependency direction.

## Navigation

- `<public-entry-point>`: public package boundary.
- `<important-path>`: location of a major responsibility or canonical docs.

## Invariants and conventions

- Record only stable, evidence-backed rules future changes must preserve.

## Validation

```text
<exact package test command>
<exact package typecheck or build command>
```

## Known constraints

- Include only stable limitations that materially affect implementation.
