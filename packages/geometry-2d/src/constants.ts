/**
 * Die EINE Diskretisierungstoleranz des Repos.
 *
 * Sie war vorher schon eine stille Modellannahme, nur an zwei Stellen mit zwei
 * Zahlen: `Arc.toPolyline` sprang auf `0,1`, der Querschnitts-Viewer zerlegte
 * jeden Bogen in feste `24` Abschnitte. Beides entscheidet mit, wie viele
 * Punkte ein Umriss traegt — und damit, welches `A`, `Iy`, `Iz` aus ihm
 * fallen. Zwei Zahlen fuer eine Annahme sind zwei Gelegenheiten, sie
 * verschieden zu setzen.
 *
 * WARUM SIE HIER WOHNT: die Sehnenabweichung ist eine Eigenschaft der
 * Diskretisierung eines Bogens, und die leistet dieses Package.
 *
 * DIE EINHEIT IST DIE DES AUFRUFERS, denn dieses Package kennt keine. Die Zahl
 * ist fuer MILLIMETER gewaehlt, die Einheit, in der ein Querschnitt gezeichnet
 * und bemasst wird ([ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md)).
 * Wer in einem anderen Massstab rechnet — `@baustatik/fem-geometry` fuehrt
 * Stabwerkskoordinaten in METERN —, uebergibt seine eigene Toleranz an
 * `Arc.toPolyline`, statt sich auf den Default zu verlassen. Der Default hier
 * traegt denselben stillschweigenden Massstab, den vorher die `0,1` trug; neu
 * ist nur, dass die Zahl einen Namen und eine Begruendung hat.
 *
 * Auf die Knickschranke des Querschnitts-Gates wirkt sie unmittelbar: bei
 * `0,05 mm` vertraegt eine `6 mm`-Wand rund `1,9°`, eine `20 mm`-Wand nur noch
 * `0,57°` ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)).
 *
 * KEINE KONSTANTE IM GATE, sondern ein PARAMETER an seiner Tuer: eine Zahl,
 * die das Ergebnis aendert, wird uebergeben und nicht importiert (ADR 0011).
 * Sonst haengt `@baustatik/cross-section` an diesem Package, nur um eine `0,05`
 * zu lesen.
 */
export const DEFAULT_ARC_TOLERANCE = 0.05;
