# Vendored characteristic data, German-NA safety factors computed in-house

We vendor the **characteristic** material values (fck, fyk, fmk, moduli, unit
weights, kmod tables) from the EN material standards — cross-checked against
`pcachim/eurocodepy`'s `eurocodes.json` as a seed — but we compute all **design
values** ourselves from the German National Annex rather than reusing any
third-party partial safety factors.

This matters because `eurocodepy` encodes the EN-*recommended* values (no `αcc`,
`γM1 = 1.0`), not the German Annex (`αcc = 0.85`, `γM1 = 1.1`). Copying its
design values would silently produce non-DIN results — e.g. `fcd(C30/37) = 20.0`
instead of the correct `17.0`. Recording this so a future reader does not "fix"
our deliberate divergence from eurocodepy by importing its factors.
