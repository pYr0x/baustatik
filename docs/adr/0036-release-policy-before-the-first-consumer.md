# Release policy before the first consumer

You look this one up when a changeset is about to be labelled `major`, when a
package version jumps to `2.0.0`, when someone wants to "reset all versions to
1.0.0", or when `schemaVersion` is mistaken for a package version.

> **Until the first real release there are no consumers, so version arithmetic
> is ceremony. Every package stays in the `0.0.x` series and every changeset is
> `patch`. The changelog text carries the real signal, not the number. The first
> real release starts at `1.0.0` deliberately. `schemaVersion` is a data-format
> counter, not a package version, and keeps counting.**

## Why now

The monorepo is under heavy development, nothing is published to npm, and no
consumer exists outside the repo. Yet the change discipline kept producing
real version decisions: breaking changes were labelled `major`, and
`@baustatik/script` reached `2.0.0` on the strength of its `schemaVersion`
breaks. The release pipeline
([`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)) is
fully wired — the changesets action opens "Version Packages" PRs and, once an
`NPM_TOKEN` exists, publishes. Every "major" the agent writes therefore
becomes a real bump and eventually a real publish, even though nobody is
listening yet.

Semver exists to communicate compatibility to consumers. With zero consumers,
the signal has no receiver, and deciding major-versus-minor costs thought
every single time while encoding nothing. The question was already open in
`packages/TODO.md` ("Schemabrüche und Changesets, solange es keine Abnehmer
gibt"); this ADR answers it.

## What stays

- **Changesets remain.** They are the change-log discipline and the design
  memory of the repo — the German bodies carry *why*, which is exactly what a
  later release note needs. Only the bump label loses its meaning.
- **The pipeline stays wired.** `version-packages` and `publish-packages`
  keep working; they are simply fed `patch` labels until the first release.
- **Changelogs keep being generated.** The auto-generated history is the
  payoff of the changeset discipline; nothing about this decision removes it.

## What changes

- **All packages are reset to `0.0.0` and from there only ever tick within the
  `0.0.x` series.** The history `0.x` → `1.x` → `2.0.0` is discarded, because
  it communicated nothing. Internal references use `workspace:*`, so the reset
  is mechanical.
- **Every changeset is `patch`.** A breaking change is described in the
  body — where it says *"Breaking: …"* — and the version simply ticks. The
  package stays on `0.0.x` for as long as the repo is pre-release; a `0.0.1`
  or `0.0.2` after `changeset version` is the policy at work, not a drift from
  it.
- **The first real release starts at `1.0.0`.** Resetting to `1.0.0` on the
  day of the first publish is legal and deliberate: npm only forbids *going
  down* after something was published. There is no second release number that
  must be beaten.

## `schemaVersion` is not a package version

`schemaVersion` in `@baustatik/script` is the version of the snapshot *file
format*, not of the package. It keeps counting (v8 today). It is honest — the
format really changed — the tests reference it, and its whole job is the
invariant "an older snapshot is rejected, never extended". Resetting it would
save nothing. Its counting is decoupled from package semver: a format break
does **not** force a `major` label, and a package release does not force a
`schemaVersion` bump.

## Price

`0.0.x` does not follow semver's own 0.x rule (breaking changes bump the
minor). That is the point: with no consumers, the number encodes nothing, so
the cheapest rule is "patch until release". The one thing the repo loses is
the pretense that the version says anything before the first publish — which
was never true anyway.
