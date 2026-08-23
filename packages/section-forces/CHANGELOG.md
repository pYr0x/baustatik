# @baustatik/section-forces

## 0.0.1

### Patch Changes

- a2d34f1: Neues Blattpackage: `SectionForces`, die sechs Schnittgrössen an einer Stelle
  (`N`, `Vy`, `Vz`, `My`, `Mz`, `Mt`), alle Felder optional — der ebene Rahmen
  füllt drei, ein späterer räumlicher sechs. Keine Abhängigkeit, keine Funktion.

  Das Package **besitzt die Vorzeichenkonvention** (ADR 0060), und sie steht im
  JSDoc an den Feldern selbst, nicht bei der Formel, die sie verbraucht:
  `My = +∫z·σ dA`, `Mz = −∫y·σ dA`, und damit `dMy/dx = +Vz`, aber
  `dMz/dx = −Vy`. `Mz` und `Vy` sind ein Paar.

  Nicht zu verwechseln mit `SectionForces` aus `@baustatik/fem-element` — dem
  Tripel `N`/`V`/`M` des ebenen Stabs. Die Namensgleichheit bleibt bewusst
  unaufgelöst (ADR 0054).
