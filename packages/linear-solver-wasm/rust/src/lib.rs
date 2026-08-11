//! Der Gleichungsloeser `K d = F` — und die Erkennung, dass es keine Loesung
//! gibt.
//!
//! `K` kommt ZEILENWEISE flach herein (die JS-Seite legt Zeile fuer Zeile ab).
//! `F` und das Ergebnis liegen SPALTENWEISE flach als `n x k` vor: zuerst die
//! `n` Werte der ersten rechten Seite, dann die der zweiten.
//!
//! Dieses Paket kennt keine Knoten, Staebe oder Auflager. Es meldet nur, DASS
//! die Matrix singulaer ist und an welcher ZEILE das aufgefallen ist; die
//! Deutung — welcher Knoten, welche Richtung — macht `@baustatik/fem-solver`.

use faer::linalg::solvers::{Llt, LltError, Solve};
use faer::{Mat, Side};
use wasm_bindgen::prelude::*;

/// Ab hier gilt ein Pivot als „nicht mehr da".
///
/// Verglichen wird das kleinste Pivot der SKALIERTEN Matrix (siehe `solve`),
/// deren Diagonale ueberall 1 ist — der Wert ist damit ein billiger Schaetzer
/// fuer den Kehrwert der Konditionszahl und einheitenfrei.
///
/// `1e-12` laesst in `f64` noch rund vier Dezimalstellen Rechenschaerfe uebrig.
/// Tragwerke liegen normalerweise bei `1e-4` bis `1e-9` (siehe die Tests unten,
/// die den Abstand belegen statt ihn zu behaupten); ein Mechanismus faellt auf
/// `1e-16` und darunter. Die Luecke dazwischen ist gross, weshalb der genaue
/// Wert der Schwelle unkritisch ist.
const SINGULAR_PIVOT_TOLERANCE: f64 = 1e-12;

/// Das Ergebnis eines Loeseversuchs.
///
/// Ein Mechanismus ist KEIN Fehler des Aufrufers, sondern ein Befund ueber sein
/// Modell — deshalb steht er hier und nicht im `Err` von `solve`. Das `Err` ist
/// den Vertragsbruechen vorbehalten (falsche Laengen).
#[wasm_bindgen]
pub struct SolveOutcome {
    d: Vec<f64>,
    singular_index: i32,
    pivot_ratio: f64,
}

#[wasm_bindgen]
impl SolveOutcome {
    /// Die Verschiebungen, spaltenweise flach als `n x k`. Leer, wenn
    /// `singularIndex >= 0`.
    #[wasm_bindgen(getter)]
    pub fn d(&self) -> Vec<f64> {
        self.d.clone()
    }

    /// Die Zeile, in der die Singularitaet aufgefallen ist — oder `-1`.
    ///
    /// Ein HINWEIS, kein Beweis: Cholesky pivotiert nicht, die Zeile ist also
    /// die Stelle, an der der Mechanismus waehrend der Elimination sichtbar
    /// wird. Das muss nicht der Freiheitsgrad sein, der sich bewegt.
    #[wasm_bindgen(getter, js_name = singularIndex)]
    pub fn singular_index(&self) -> i32 {
        self.singular_index
    }

    /// Das kleinste skalierte Pivot — auch im gelungenen Fall, als Mass dafuer,
    /// wie nah das System an der Kinematik stand. `0` heisst exakter
    /// Fehlschlag.
    #[wasm_bindgen(getter, js_name = pivotRatio)]
    pub fn pivot_ratio(&self) -> f64 {
        self.pivot_ratio
    }
}

impl SolveOutcome {
    fn solved(d: Vec<f64>, pivot_ratio: f64) -> Self {
        Self {
            d,
            singular_index: -1,
            pivot_ratio,
        }
    }

    fn singular(index: usize, pivot_ratio: f64) -> Self {
        Self {
            d: Vec::new(),
            singular_index: index as i32,
            pivot_ratio,
        }
    }
}

/// Loest `K d = F` und meldet Kinematik, statt sie als `NaN` durchzureichen.
///
/// `K` ist die reduzierte Steifigkeitsmatrix und damit symmetrisch positiv
/// SEMIdefinit: haelt das Tragwerk, ist sie positiv definit; ist es kinematisch,
/// ist sie nur noch semidefinit. Genau diese Grenze ist die, an der eine
/// Cholesky-Zerlegung scheitert — das klassische „Null- oder Negativpivot ist
/// ein Mechanismus". Deshalb `Llt` und nicht `PartialPivLu`: der Fehlschlag IST
/// das Signal, und nebenbei ist es die haelfte der Arbeit.
///
/// NICHT ueber die Determinante: `det(K)` ist das Produkt aller `n` Eigenwerte
/// und laeuft bei realistischen Steifigkeiten (`EA ~ 1e9`) und ein paar hundert
/// Freiheitsgraden ueber oder unter. Ein voellig stabiler Rahmen liefert dann
/// `det = 0` durch Underflow. `det` ist ausserdem nicht skalierungsinvariant.
///
/// NICHT ueber SVD oder `col_piv_qr`: die GELINGEN bei einem Mechanismus und
/// liefern ein beliebiges Least-Squares-Verschiebungsfeld, statt zu scheitern.
///
/// MEHRERE RECHTE SEITEN teilen sich EINE Zerlegung. `pivotRatio` und
/// `singularIndex` bleiben dabei EINWERTIG — sie gehoeren der Zerlegung und
/// damit der Matrix, nicht einer einzelnen rechten Seite.
#[wasm_bindgen]
pub fn solve(
    n: usize,
    k: &[f64],
    rhs_columns: usize,
    f: &[f64],
) -> Result<SolveOutcome, JsError> {
    solve_checked(n, k, rhs_columns, f).map_err(|reason| JsError::new(&reason))
}

/// Der Rechenkern ohne WASM-Grenze.
///
/// Getrennt, weil `JsError` sich auf einem Nicht-WASM-Ziel nicht bauen laesst —
/// `cargo test` liefe sonst in eine Panik, und die Fehlerwege waeren die
/// einzigen, die ungetestet blieben.
fn solve_checked(
    n: usize,
    k: &[f64],
    rhs_columns: usize,
    f: &[f64],
) -> Result<SolveOutcome, String> {
    if k.len() != n * n {
        return Err(format!(
            "K braucht n * n = {} Werte, bekommen hat es {}.",
            n * n,
            k.len()
        ));
    }
    let rhs_len = n
        .checked_mul(rhs_columns)
        .ok_or_else(|| "n * rhs_columns laeuft ueber usize.".to_owned())?;
    if f.len() != rhs_len {
        return Err(format!(
            "F braucht n * rhs_columns = {} Werte, bekommen hat es {}.",
            rhs_len,
            f.len()
        ));
    }
    if n == 0 {
        return Ok(SolveOutcome::solved(Vec::new(), f64::INFINITY));
    }

    // JACOBI-SKALIERUNG. In `K` stehen Dehnsteifigkeiten (`EA/L`) neben
    // Biegesteifigkeiten (`EI/L^3`) — Groessen, die um Zehnerpotenzen
    // auseinanderliegen. Ein Pivot-Vergleich auf der Rohmatrix wuerde davon
    // erschlagen und einen gut gestuetzten Rahmen fuer kinematisch halten.
    // `Ks = S K S` mit `S = diag(1/sqrt(K_ii))` macht die Diagonale ueberall 1,
    // erst dann ist ein Pivot mit einer festen Schwelle vergleichbar.
    let mut s = vec![0.0f64; n];
    for i in 0..n {
        let diagonal = k[i * n + i];
        // Kein positiver Diagonalwert heisst: diese Zeile haelt gar nichts.
        // `fem-solver` faengt das schon vorher ab und kann es dabei genauer
        // benennen — hier steht es, damit die Skalierung nicht durch 0 teilt.
        if !(diagonal > 0.0) || !diagonal.is_finite() {
            return Ok(SolveOutcome::singular(i, 0.0));
        }
        s[i] = 1.0 / diagonal.sqrt();
    }

    let scaled = Mat::from_fn(n, n, |i, j| k[i * n + j] * s[i] * s[j]);

    let llt = match Llt::new(scaled.as_ref(), Side::Lower) {
        Ok(llt) => llt,
        // Der exakte Fall: die Zerlegung stoesst auf ein Pivot <= 0. Das
        // Tragwerk ist ein Mechanismus.
        Err(LltError::NonPositivePivot { index }) => {
            return Ok(SolveOutcome::singular(index, 0.0));
        }
    };

    // Der FAST singulaere Fall — der, den `NaN` nie gefangen hat. Die Zerlegung
    // gelingt, aber ein Pivot ist nur noch Rundungsrauschen: ein Rahmen, der
    // rechnerisch steht und praktisch umfaellt. Weil `diag(Ks) = 1` ist, gilt
    // `L_ii^2 <= 1` und `L_00^2 = 1` — das kleinste Pivot IST damit schon das
    // Verhaeltnis zum groessten.
    let lower = llt.L();
    let mut min_pivot = f64::INFINITY;
    let mut min_index = 0usize;
    for i in 0..n {
        let pivot = lower[(i, i)] * lower[(i, i)];
        if pivot < min_pivot {
            min_pivot = pivot;
            min_index = i;
        }
    }
    if min_pivot < SINGULAR_PIVOT_TOLERANCE {
        return Ok(SolveOutcome::singular(min_index, min_pivot));
    }

    // `Ks y = S F` loesen und mit `d = S y` zurueckskalieren — alle rechten
    // Seiten auf einmal, damit die Zerlegung nur einmal bezahlt wird.
    let rhs = Mat::from_fn(n, rhs_columns, |i, column| f[column * n + i] * s[i]);
    let y = llt.solve(rhs.as_ref());

    let mut d = Vec::with_capacity(rhs_len);
    for column in 0..rhs_columns {
        for i in 0..n {
            let value = s[i] * y[(i, column)];
            // Guertel und Hosentraeger: kommt hier trotz allem etwas
            // Unendliches heraus, ist es keine Loesung — lieber melden als
            // ausliefern.
            if !value.is_finite() {
                return Ok(SolveOutcome::singular(i, min_pivot));
            }
            d.push(value);
        }
    }

    Ok(SolveOutcome::solved(d, min_pivot))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Nach der Skalierung ist ein Ergebnis nicht mehr bitgenau — `S K S` und
    /// das Zurueckskalieren kosten die letzte Stelle. Verglichen wird deshalb
    /// relativ, nicht mit `assert_eq!`.
    fn nahe(actual: f64, expected: f64) -> bool {
        (actual - expected).abs() <= 1e-12 * expected.abs().max(1.0)
    }

    /// Eine rechte Seite — die Form, in der die meisten Tests unten rechnen.
    fn solved(n: usize, k: &[f64], f: &[f64]) -> SolveOutcome {
        solved_many(n, k, 1, f)
    }

    fn solved_many(n: usize, k: &[f64], rhs_columns: usize, f: &[f64]) -> SolveOutcome {
        let outcome = solve_checked(n, k, rhs_columns, f).expect("Vertrag eingehalten");
        assert_eq!(
            outcome.singular_index, -1,
            "haette loesen muessen, meldet aber Zeile {}",
            outcome.singular_index
        );
        outcome
    }

    fn singular(n: usize, k: &[f64], f: &[f64]) -> SolveOutcome {
        let outcome = solve_checked(n, k, 1, f).expect("Vertrag eingehalten");
        assert!(
            outcome.singular_index >= 0,
            "haette singulaer sein muessen, liefert aber {:?}",
            outcome.d
        );
        outcome
    }

    #[test]
    fn loest_ein_einfaches_system() {
        // [2 0; 0 3] * d = [4; 9] -> d = [2; 3]
        let outcome = solved(2, &[2.0, 0.0, 0.0, 3.0], &[4.0, 9.0]);

        assert!(nahe(outcome.d[0], 2.0), "uz = {}", outcome.d[0]);
        assert!(nahe(outcome.d[1], 3.0), "phiY = {}", outcome.d[1]);
    }

    #[test]
    fn die_skalierung_veraendert_die_loesung_nicht() {
        // Ein Fall mit Nebendiagonalen, von Hand nachgerechnet:
        // [4 1; 1 3] * d = [1; 2] -> d = [1/11; 7/11]
        let outcome = solved(2, &[4.0, 1.0, 1.0, 3.0], &[1.0, 2.0]);

        assert!(nahe(outcome.d[0], 1.0 / 11.0), "d0 = {}", outcome.d[0]);
        assert!(nahe(outcome.d[1], 7.0 / 11.0), "d1 = {}", outcome.d[1]);
    }

    #[test]
    fn meldet_den_echten_mechanismus_mit_zeile() {
        // Zweite Zeile ist ein Vielfaches der ersten — Rangabfall, und er faellt
        // bei der Elimination genau dort auf.
        let outcome = singular(2, &[1.0, 1.0, 1.0, 1.0], &[1.0, 1.0]);

        assert_eq!(outcome.singular_index, 1);
        assert_eq!(outcome.pivot_ratio, 0.0);
        assert!(outcome.d.is_empty());
    }

    #[test]
    fn meldet_die_leere_diagonale_ohne_zu_zerlegen() {
        // Zeile 1 haelt nichts — die Skalierung faengt es vor der Zerlegung ab.
        let outcome = singular(2, &[3.0, 0.0, 0.0, 0.0], &[1.0, 1.0]);

        assert_eq!(outcome.singular_index, 1);
        assert_eq!(outcome.pivot_ratio, 0.0);
    }

    #[test]
    fn meldet_das_fast_singulaere_system() {
        // Die Zerlegung GELINGT hier — `PartialPivLu` haette brav grosse, aber
        // endliche Zahlen geliefert, und nichts haette sie aufgehalten.
        let outcome = singular(2, &[1.0, 1.0, 1.0, 1.0 + 1e-15], &[1.0, 1.0]);

        assert_eq!(outcome.singular_index, 1);
        assert!(
            outcome.pivot_ratio > 0.0 && outcome.pivot_ratio < SINGULAR_PIVOT_TOLERANCE,
            "Pivot-Verhaeltnis {} sollte klein aber positiv sein",
            outcome.pivot_ratio
        );
    }

    #[test]
    fn ein_schlecht_skaliertes_aber_stabiles_system_kommt_durch() {
        // DER Test, der die Jacobi-Skalierung rechtfertigt: Dehnsteifigkeit
        // neben Biegesteifigkeit, neun Zehnerpotenzen auseinander. Ohne
        // Skalierung waere das kleinste ROHE Pivot 1e-3 und damit von einer
        // festen Schwelle nicht mehr von einem Mechanismus zu unterscheiden.
        let ea = 2.1e9;
        let ei = 1.0e0;
        let outcome = solved(2, &[ea, 0.0, 0.0, ei], &[ea, ei]);

        assert!(nahe(outcome.d[0], 1.0), "d0 = {}", outcome.d[0]);
        assert!(nahe(outcome.d[1], 1.0), "d1 = {}", outcome.d[1]);
        // Nach der Skalierung ist das System die Einheitsmatrix.
        assert!(nahe(outcome.pivot_ratio, 1.0), "Pivot {}", outcome.pivot_ratio);
    }

    #[test]
    fn ein_echter_kragarm_haelt_grossen_abstand_zur_schwelle() {
        // Das reduzierte K eines Kragarms mit einem Timoshenko-Element, Knoten 2
        // frei in (uz, phiY) — die Biege-Untermatrix aus `apps/demo`:
        //   [ 12EI/L^3   -6EI/L^2 ]
        //   [ -6EI/L^2    4EI/L   ]
        // mit EI = 2.1e11 * 8.356e-5 (HEB 200, S235) und L = 3.0.
        let ei = 2.1e11 * 8.356e-5;
        let l = 3.0;
        let k = [
            12.0 * ei / (l * l * l),
            -6.0 * ei / (l * l),
            -6.0 * ei / (l * l),
            4.0 * ei / l,
        ];
        // Einheitslast in z am freien Ende.
        let outcome = solved(2, &k, &[-1000.0, 0.0]);

        // Handrechnung: uz = -P L^3 / (3 EI), phiY-Zeile daraus konsistent.
        let expected_uz = -1000.0 * l * l * l / (3.0 * ei);
        assert!(
            nahe(outcome.d[0], expected_uz),
            "uz = {}, erwartet {}",
            outcome.d[0],
            expected_uz
        );

        // Der eigentliche Punkt: der ABSTAND zur Schwelle, gemessen statt
        // behauptet — und zwar genau 1/4, unabhaengig von EI, L und Material:
        //   1 - (6EI/L^2)^2 / (12EI/L^3 * 4EI/L) = 1 - 36/48 = 1/4
        // Genau das leistet die Skalierung: sie kuerzt die Steifigkeit weg und
        // laesst nur die GEOMETRIE des Systems stehen. Zwoelf Zehnerpotenzen
        // Abstand zur Schwelle — der Kragarm kommt ihr nie nahe.
        assert!(
            nahe(outcome.pivot_ratio, 0.25),
            "Pivot-Verhaeltnis {}, erwartet 1/4",
            outcome.pivot_ratio
        );
    }

    #[test]
    fn ein_vertragsbruch_ist_ein_fehler_und_keine_panik() {
        assert!(solve_checked(2, &[1.0, 0.0, 0.0], 1, &[1.0, 1.0]).is_err());
        assert!(solve_checked(2, &[1.0, 0.0, 0.0, 1.0], 1, &[1.0]).is_err());
        // Die Laenge von F haengt jetzt an `rhs_columns` — zwei Spalten
        // brauchen 2n Werte.
        assert!(solve_checked(2, &[1.0, 0.0, 0.0, 1.0], 2, &[1.0, 1.0]).is_err());
    }

    #[test]
    fn ein_leeres_system_ist_loesbar() {
        let outcome = solved(0, &[], &[]);

        assert!(outcome.d.is_empty());
    }

    #[test]
    fn eine_zerlegung_traegt_alle_rechten_seiten() {
        // [4 1; 1 3] mit drei rechten Seiten. Verglichen wird das Buendel mit
        // der Spalte-fuer-Spalte-Rechnung: dass die Zerlegung geteilt wird,
        // darf am Ergebnis nichts aendern.
        let k = [4.0, 1.0, 1.0, 3.0];
        let f = [1.0, 2.0, 1.0, 0.0, 0.0, 1.0];

        let buendel = solved_many(2, &k, 3, &f);
        assert_eq!(buendel.d.len(), 6);
        for column in 0..3 {
            let einzeln = solved(2, &k, &f[column * 2..(column + 1) * 2]);
            for row in 0..2 {
                assert!(
                    nahe(buendel.d[column * 2 + row], einzeln.d[row]),
                    "Spalte {column}, Zeile {row}"
                );
            }
        }

        // Die erste Spalte ist die von Hand nachgerechnete: d = [1/11, 7/11].
        assert!(nahe(buendel.d[0], 1.0 / 11.0), "d0 = {}", buendel.d[0]);
        assert!(nahe(buendel.d[1], 7.0 / 11.0), "d1 = {}", buendel.d[1]);
    }

    #[test]
    fn das_pivot_gehoert_der_zerlegung_und_nicht_der_rechten_seite() {
        // Zwei rechte Seiten, ein Pivot — und dasselbe Pivot wie mit einer.
        let k = [2.0, 0.0, 0.0, 3.0];
        let eine = solved(2, &k, &[4.0, 9.0]);
        let zwei = solved_many(2, &k, 2, &[4.0, 9.0, 2.0, 3.0]);

        assert_eq!(eine.pivot_ratio, zwei.pivot_ratio);
        assert_eq!(zwei.singular_index, -1);
    }
}
