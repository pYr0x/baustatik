---
'@baustatik/cross-section': minor
'@baustatik/script': major
---

Die Spannungspunkte folgen der Idealisierung (ADR 0029), und `t-beam` heißt
`t-section`.

- **Der behobene Widerspruch:** das Package führte ZWEI unabhängige
  Schubmodelle, und `idealisation` steuerte nur eines. Ein `i-symmetric` mit
  `thin-walled` und IPE-80-Massen bekam sein κ aus dem Wandweg (`Sy,max`
  11,60 cm³, Katalog 11,61) und seinen Schwerpunkt-Spannungspunkt aus der
  Umrissmodell (11,25 cm³) — zwei Antworten auf EINE Zahl, in einem Querschnitt.
  Dazu stand am Gurtpunkt `t = b` statt `t = tf`, also die senkrechte
  Schubkomponente, die an einer dünnwandigen Wand nichts bedeutet.
- **`stressPoints` verzweigt jetzt über Form UND Idealisierung.** Neu ist
  `src/stress-points/thin.ts` mit den dünnwandigen Vorlagen für `i-symmetric`
  (15 Punkte) und `t-section` (9 Punkte). `solid` behält das Umrissmodell, und
  das ist keine Übergangslösung: Grashof IST für Vollquerschnitte richtig.
- **Koordinaten und Nummern bewegen sich nicht**, nur `t` und `S`. Die
  Nummerierung ist ein veröffentlichter Vertrag.
- **Das Orakel kostete keine neue Fixture:** ein geschweißtes I ohne Ausrundung
  IST das gewalzte Profil mit `r = 0`. An den 14 Gurtstationen stimmen die neue
  Vorlage und die gegen 546 RSTAB-Punkte validierte `rolled-i.ts` auf
  Gleitkommarauschen überein. Am STEG gilt das Orakel nicht — `rolled-i.ts`
  führt dort die lichte Höhe, das Wandmodell Gurtmitte zu Gurtmitte —, und der
  Schwerpunkt hat deshalb seine eigene Referenz: `Sy,max` des Katalogs, über die
  ganze Reihe immer um 0,05 % bis 4,6 % unterschritten (die fehlende Ausrundung,
  dieselbe Signatur wie bei κ).
- **κ hat sich in keiner Ziffer bewegt.** `shear.ts`, die Wege und κ wurden nicht
  angefasst; `tests/kappa.test.ts` ist der Beleg.
- **Der Kasten bleibt `undefined`, mit präziserem Grund:** ihm fehlen die
  REFERENZDATEN, nicht die Theorie — `closedBoxPath` hat den umlaufenden Weg
  längst, und κ fällt daraus.

**BREAKING (`@baustatik/script`): `schemaVersion` 4 → 5.**

- `ShapeSpec.kind` heißt `'t-section'` statt `'t-beam'`. Der alte Name trug
  einen BAUSTOFF: dieselbe Form heißt im Betonbau Plattenbalken und im Stahlbau
  T-Profil, und getrennt werden die beiden von `idealisation`, nicht vom
  Formnamen.
- Ein v4-Snapshot wird **abgelehnt**, nicht umgeschrieben — wie v3 heute. Hier
  wäre es eine zweizeilige Ersetzung, und genau das ist das Argument dagegen,
  sie still zu tun: eine Migration ist ein Werkzeug, das jemand AUFRUFT, sieht
  und ablehnen kann.
