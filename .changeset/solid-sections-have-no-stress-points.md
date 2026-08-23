---
'@baustatik/cross-section': patch
---

Der parametrische Vollquerschnitt hat keine Spannungspunkte mehr.

**Breaking:** `stressPoints` liefert `undefined` für jede parametrische Form mit
`idealisation: 'solid'` und für `rectangle`, das gar kein `idealisation` trägt,
weil es der Vollquerschnitt IST. Bisher kam von dort das Umrissmodell (Grashof).
Der dünnwandige Zweig und das gewalzte Katalogprofil sind unverändert; die
Querschnittswerte — `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs`, κ, `It` — ebenfalls, für
jede Form.

`t` und `S` sind der Nenner eines SCHNITTMODELLS (`tau = V*S/(I*t)`), und ein
Vollquerschnitt hat keins. Die parametrische Eingabe ist nur eine bequemere
Schreibweise für eine gezeichnete Figur, und die gezeichnete Vollfigur antwortet
mit der FE — zwei Wege zu derselben Figur dürfen nicht zwei Zahlen liefern
([ADR 0057](../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)).

Entfallen sind `stress-points/compact.ts` und `stress-points/outline.ts`; beide
waren package-intern. Kein Schema wechselt, `idealisation: 'solid'` bleibt
gültiges Pflichtfeld mit unveränderter Bedeutung für κ und `It`.
