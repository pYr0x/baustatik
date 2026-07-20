# National Annex bound via a factory, not a global setter

The National Annex is bound per instance through `createMaterials({ na })`,
which returns material factories closed over that Annex. A convenience instance
pre-bound to `DE` is exported directly. There is deliberately **no** global
mutable `setNationalAnnex()`.

A module-level mutable singleton would cause action-at-a-distance and
order-of-import bugs (the last writer wins, so `concrete("C30/37")` could yield
different design values depending on load order across the monorepo) and would
leak state between parallel tests. The factory keeps configuration explicit and
trivially testable while preserving the ergonomic `concrete("C30/37").fcd`
call-site via the pre-bound DE default. Recording this so the "convenient"
global setter is not reintroduced later.
