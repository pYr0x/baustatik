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

/**
 * Die Nachkommastellen, mit denen `Polygon.inflate` rechnet.
 *
 * Clipper2 rechnet auf GANZEN ZAHLEN. Die `…D`-API nimmt Gleitkommazahlen
 * entgegen und rastert sie beim Eintritt auf ein Gitter der Weite `10^-p`; `p`
 * ist genau diese Zahl. Die Voreinstellung der Bibliothek ist `2`, also
 * `0,01 mm` — nur Faktor 5 unter `DEFAULT_ARC_TOLERANCE`, und damit stünde die
 * Rasterung des Rechenwegs in derselben Grössenordnung wie die
 * Modellannahme über die Bogenzerlegung. Zwei Näherungen, die man nicht mehr
 * auseinanderhalten kann.
 *
 * `6` heisst `10^-6 mm`. Bei Querschnittsmassen bis `10^4 mm` sind das `10^10`
 * Gittereinheiten und damit weit innerhalb der `int64`, auf der Clipper2
 * arbeitet (`~9,2·10^18`).
 *
 * QUANTISIERUNG DES RECHENWEGS, KEINE MODELLANNAHME — und deshalb ausdrücklich
 * KEIN Feld der `SectionPolicy`: sie ändert das Ergebnis nur um Beträge, über
 * die niemand eine Aussage treffen will, während `arcTolerance` die Punktzahl
 * bestimmt, aus der `A`, `Iy` und `Iz` fallen (ADR 0033). Eine Einstellung
 * hier lüde dazu ein, eine numerische Feinheit für eine Ingenieurentscheidung
 * zu halten.
 */
export const OFFSET_PRECISION = 6;
