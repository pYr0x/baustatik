---
trigger: always_on
---

**Throw** when the developer violates a precondition — the function cannot fulfill its contract because:
- The result is **mathematically undefined** (division by zero, no unique solution)
- A **type invariant is broken** (value out of valid range, NaN, insufficient input size)
- The inputs are **semantically incompatible** (inputs are individually valid but their combination is meaningless)

Fail loud and early so bugs surface immediately at the call site. Use named error classes with clear messages.

**Return a safe value** when valid input produces an empty or boundary result at runtime — `null`, `[]`, or the input as-is. Low-level utilities running in loops, renders, or pipelines must never throw.

---

**Decision question:** Did the developer break a promise to the function?
- Broken precondition → **throw**
- Valid input, empty result → **return safe value**
- Bad runtime data in internal utility → **guard clause**

---

**Rule of thumb:** Public API functions throw when their preconditions are violated. Internal utility functions never throw.

---

**Non-null assertions (`!`) are forbidden.** TypeScript does not narrow types through array length checks, so even after an explicit precondition guard, `arr[i]` remains `T | undefined` in the type system. Use `atOrThrow(arr, i)` from `@your-scope/core` instead:

```typescript
// ❌ forbidden
if (pl.points.length === 0) throw new InvalidPolylineError('...');
return pl.points[0]!;

// ✅ correct
if (pl.points.length === 0) throw new InvalidPolylineError('...');
return atOrThrow(pl.points, 0);
```

`atOrThrow()` acts as an **internal assertion guard**: it throws an `AssertionError` if an index does not exist despite a prior precondition check — signalling a bug in the calling code, not invalid user input. In loops with safe bounds (`i < arr.length`), `atOrThrow()` is equally preferred over the `!` operator:

```typescript
// ❌ forbidden
for (let i = 1; i < pl.points.length; i++)
  total += Point.distance(pl.points[i - 1]!, pl.points[i]!);

// ✅ correct
for (let i = 1; i < pl.points.length; i++)
  total += Point.distance(atOrThrow(pl.points, i - 1), atOrThrow(pl.points, i));
```

---

**Package-specific examples:** see the `errors.ts` of each package for named error classes and the conditions that trigger them.