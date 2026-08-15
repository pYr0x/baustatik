# @baustatik/sparse-solver-wasm

## 0.0.3

### Patch Changes

- 8243eae: Use reproducible Docker toolchains as the local fallback for WASM builds.

## 0.0.2

### Patch Changes

- 1fda9e0: The sparse solver reports `pivotRatio` and `singularIndex`

  `SparseSolveOutcome` gains two getters, so the frame path keeps its net against
  kinematics when it runs sparse
  ([ADR 0043](../docs/adr/0043-the-solver-is-an-analysis-setting.md)):

  - **`pivotRatio`** — the smallest pivot of the _scaled_ matrix, reported **also
    in the successful case**. That is what catches the nearly singular system that
    factorizes fine and returns noise. The crate therefore now applies the same
    Jacobi scaling (`Ks = S K S`, diagonal 1 everywhere) and the same threshold
    `1e-12` as `@baustatik/linear-solver-wasm`. That both packages measure the
    same quantity is a number: the same scaled cantilever yields exactly `1/4` on
    both, independently of `EI` and `L`.
  - **`singularIndex`** — the row where the rank deficiency became visible, **in
    the caller's numbering**. The factorization runs in an AMD ordering and faer
    counts the failed column from one; both are mapped back before the index
    leaves the package. An index in the wrong numbering would be worse than no
    index at all.

  `unfixed` keeps its name and its meaning — _the matrix is not positive
  definite_, not _mechanism_. Translating that into the language of a given field
  is the port adapter's job, not the crate's.

  **Additive, with two internal changes worth knowing.** Duplicate triplets are
  now summed for the scaling as well, not only when building the matrix — an FE
  assembly writes to the same place several times. And the factorization runs
  over `factorize_symbolic_cholesky` / `factorize_numeric_llt` with
  `SupernodalThreshold::FORCE_SIMPLICIAL` instead of `sp_cholesky`: only the
  simplicial layout exposes the diagonal of `L`, and `sp_cholesky` hands out
  neither it nor the permutation. faer's heuristic between simplicial and
  supernodal is a speed decision and must not decide whether the pivot is
  obtainable at all.

## 0.0.1

### Patch Changes

- 2188bc8: Add a separate sparse SPD WebAssembly solver with multiple right-hand sides and
  a missing-fixation finding.
