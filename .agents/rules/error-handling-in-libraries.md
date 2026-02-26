---
trigger: always_on
---

**Throw** when the developer misused the API: invalid input values (NaN, Infinity, wrong types), semantically impossible operations (incompatible units), unknown identifiers. Fail loud and early so bugs are visible immediately. Use named error classes with clear messages.

**Guard Clause** when data is unexpected at runtime. Low-level utilities that run in loops, renders, or pipelines must never throw — return the bad value as-is or fall back to a safe default.

**Decision question:** Did the developer make a mistake, or did the data arrive broken?
Developer mistake → throw. Bad data → Guard Clause.

**Rule of thumb:** Public API functions throw. Internal utility functions don't.