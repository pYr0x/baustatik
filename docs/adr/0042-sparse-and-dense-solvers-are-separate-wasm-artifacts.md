# `0042` Sparse and dense solvers are separate WASM artifacts

Status: accepted

## Context

The frame solver receives dense stiffness matrices with hundreds of degrees of
freedom and reports a failed Cholesky factorization as a mechanism. The
cross-section Poisson problem receives sparse systems with 1,000 to 8,000
unknowns, about seven nonzeros per row, and requires multiple right-hand sides
for one factorization. Its failed factorization instead means missing fixation
or a disconnected mesh.

The two meanings cannot share the existing `linear-solver-wasm` contract. The
module is also loaded by a worker: putting both implementations in one crate
would make every frame calculation fetch and initialize sparse factorization
and ordering code.

With `rust-wasm` (`wasm-pack 0.13.1`) and faer 0.24.4, the generated artifacts
measure:

| Artifact | Bytes | KiB |
| --- | ---: | ---: |
| dense `linear_solver_wasm_bg.wasm` | 138,826 | 135.6 |
| sparse `sparse_solver_wasm_bg.wasm` | 241,953 | 236.3 |
| combined measurement crate | 241,598 | 235.9 |

The combined measurement keeps dense and sparse Cholesky exports alive in one
crate. It intentionally omits the production outcome/validation wrappers, so
it is not a publishable combined artifact. Its near-identical size to sparse
alone nevertheless shows that both paths share most linked code. Sparse support
is therefore a material increment for frame-only consumers.

## Decision

`@baustatik/linear-solver-wasm` remains unchanged. It owns dense Cholesky and
the frame-specific mechanism finding.

`@baustatik/sparse-solver-wasm` is a separate package and Rust `cdylib`. It
accepts lower-triangle triplets and an `n × k` right-hand-side matrix, uses
faer's sparse Cholesky with its default AMD fill-in reduction, and returns a
separate `unfixed` finding for a non-positive pivot.

When a caller needs either solver, the application owns its worker port. No
domain package imports either WASM package directly.

## Consequences

The frame path preserves its 135.7 KiB dense artifact and its vocabulary. A
cross-section calculation adds a lazily loadable 236.3 KiB sparse artifact, but
gets memory use proportional to sparse factorization rather than a dense
`n × n` matrix. The two packages duplicate a small WASM binding/runtime surface;
that cost is accepted to keep the domain contracts and load boundaries honest.
