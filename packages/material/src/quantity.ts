/**
 * Die phantom-branded Quantities leben in `@baustatik/units` — dem Package,
 * dem das Einheiten-Vokabular ohnehin gehört (`UNITS`, `UnitCategory`,
 * `convert`). Sie hier ein zweites Mal zu definieren hiesse, denselben Typ an
 * zwei Stellen zu führen; genau das war der Zustand, den dieser Re-Export
 * beendet ([ADR 0024](../../../docs/adr/0024-units-at-the-package-boundary.md)).
 *
 * Die Datei bleibt bestehen, damit die Importe innerhalb von `material`
 * (`concrete.ts`, `steel.ts`, `reinforcement.ts`, `timber.ts`, `data/*`)
 * unverändert auf `./quantity` zeigen und die öffentliche Oberfläche dieses
 * Packages sich nicht ändert.
 *
 * Der Import ist REIN TYPSEITIG: zur Laufzeit entsteht keine Abhängigkeit auf
 * `units`, und im Bundle steht davon nichts.
 */
export type {
  Kgm3,
  KNm3,
  MPa,
  Percent,
  PerK,
  PerMille,
  Quantity,
} from '@baustatik/units';
