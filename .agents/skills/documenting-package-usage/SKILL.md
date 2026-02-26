---
name: documenting-package-usage
description: Use when generating or updating standardized API usage documentation (usage.md) for a specific package to help AI agents understand and use its exports correctly.
---

# Documenting Package Usage

## Overview
This skill provides a standardized approach for creating `usage.md` files within the `docs/` folder of individual packages. These files serve as the primary source of truth for AI agents to understand how to interact with the package's APIs.

Core Principle: **Documentation should be extraction-based.** Documentation is derived directly from source code exports and tests to ensure 100% accuracy.

## When to Use
- When a new package is created and needs documentation.
- When existing API documentation is missing or outdated.
- When you need to prepare package documentation for merging into a global "knowledge base" file.

## Workflow

### 1. Identify Exports
Scan the main entry point (usually `src/index.ts`) to identify all public exports.
- Follow re-exports to find the actual implementations.
- Identify functions, classes, types, and constants.

### 2. Extract Descriptions and Signatures
For each export, capture:
- The full function signature or class definition.
- JSDoc comments if available.
- Key parameters and return types.

### 3. Source Examples from Tests
Look into `src/*.test.ts` files to find realistic usage examples.
- Prefer simple, illustrative test cases over complex edge-case tests.
- Ensure examples demonstrate the "fluent" nature of the API if applicable.

### 4. Structure the `usage.md` File
The file must follow this specific structure to facilitate future merging:

```markdown
# [Package Name] Usage
Location: `packages/[dir-name]`

## Overview
[A brief 1-2 sentence description of what the package does.]

## API Reference

### [Export Name]
**Signature:** `[code signature]`
**Description:** [What it does]
**Example:**
```typescript
[working code example]
```

... repeat for other exports ...
```

## Critical Rules
- **Absolute Paths**: Always use the correct package location as seen from the monorepo root (e.g., `packages/round`).
- **No Placeholders**: Never use placeholder text like "TBD". If you don't know an API's purpose, read the source.
- **Merge-Ready**: Keep the structure consistent so multiple `usage.md` files can be concatenated without breaking formatting.

## Example (Round Package)

```markdown
# @baustatik/round Usage
Location: `packages/round`

## Overview
Atomic and smart numeric rounding for engineering applications.

## API Reference

### round()
**Signature:** `function round(value: number | string | null | undefined): RoundingChain`
**Description:** Entry point for the fluent rounding API. Returns a chainable object.
**Example:**
```typescript
import { round } from '@baustatik/round';
const result = round(1.255).toDecimals(2); // 1.26
```
```
