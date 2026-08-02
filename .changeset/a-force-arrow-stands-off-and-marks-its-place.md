---
'@baustatik/fem-viewer': minor
---

Der Kraftpfeil steht ab und sagt, wo er angreift — die zwei Dinge, die die
Streckenlast schon konnte, gelten jetzt fuer jede Punktlast.

- **Der Gap gilt fuer JEDEN Kraftpfeil:** die Spitze sitzt `forceGapPx` VOR dem
  Angriffspunkt statt darin. Es ist dieselbe Groesse, mit der die Streckenlast
  ueber dem Stab schwebt — wieviel Luft die Figur ueber der Stelle laesst, auf die
  sie sich bezieht —, und deshalb ist es EINE Zahl (`DEFAULT_FORCE_GAP_PX`, 10 px)
  und nicht zwei, die voneinander abweichen koennen.
- **Auch die Auflagerreaktion**, und zwar mit demselben Wert: Last und Reaktion
  stehen damit spiegelbildlich um den Knoten, gleich weit ab. Die
  Gleichgewichtsprobe bleibt ablesbar, weil die Regel fuer beide dieselbe ist —
  ein anderer Gap auf der Ergebnisseite saehe aus, als griffen die beiden an
  verschiedenen Stellen an.
- **Marke fuer die Stab-Einzellast**, an ihrem Angriffspunkt auf der Stabachse.
  Nur dort: eine Knotenlast und eine Reaktion haengen an einem Knoten, der schon
  gezeichnet ist, und die Marke laege unter seinem groesseren roten Kreis. Ob es
  eine Marke gibt, entscheidet deshalb `loads/beam-loads.ts` und nicht das
  Kraftsymbol — es ist die Frage, WORAN die Last haengt.
- **Neues Symbol `symbols/marker.ts`:** die Marke hat jetzt zwei Aufrufer. Bei der
  Streckenlast ist sie konstitutiv und steht in der Figur, bei der Einzellast ist
  sie der Fall „auf einem Stab" und steht beim Aufrufer.
- **Stilschluessel zusammengelegt** (die Streckenlast ist noch nicht
  veroeffentlicht, es bricht also nichts): `distributedLoadGapPx` →
  `pointForceGapPx` plus neu `reactionForceGapPx`, `distributedLoadMarkerColor`/
  `-SizePx` → `loadMarkerColor`/`loadMarkerSizePx`. In `symbols/style.ts` heissen
  sie `forceGapPx` (in `SymbolStyle`, weil die Reaktion ihn teilt) und
  `MarkerStyle` (eigene Scheibe, weil die Reaktion sie NICHT teilt).
