//! Der dünnbesetzte Gleichungslöser `K d = F` für positiv definite Systeme.
//!
//! `K` kommt als Triplets des unteren Dreiecks herein. `F` und das Ergebnis
//! liegen spaltenweise flach als `n × k` vor.
//!
//! Dieses Paket kennt keine Knoten, Stäbe oder Auflager. Es meldet nur, DASS
//! die Matrix nicht positiv definit ist und an welcher ZEILE das aufgefallen
//! ist; die Deutung — welcher Knoten, welche Richtung — macht der Aufrufer.

use faer::dyn_stack::{MemBuffer, MemStack};
use faer::linalg::solvers::LltError;
use faer::sparse::linalg::SupernodalThreshold;
use faer::sparse::linalg::cholesky::{
    CholeskySymbolicParams, LltRef, SymbolicCholeskyRaw, SymmetricOrdering,
    factorize_symbolic_cholesky,
};
use faer::sparse::{SparseColMat, Triplet};
use faer::{Conj, Mat, Par, Side};
use wasm_bindgen::prelude::*;

/// Ab hier gilt ein Pivot als „nicht mehr da".
///
/// DIESELBE ZAHL wie `SINGULAR_PIVOT_TOLERANCE` in `@baustatik/linear-solver-wasm`,
/// und das ist kein Zufall: verglichen wird in beiden Paketen das kleinste Pivot
/// der SKALIERTEN Matrix, deren Diagonale überall 1 ist. Der Wert ist damit
/// einheitenfrei, und beide Rechenwege sind an derselben Schwelle zu messen —
/// sonst hinge die Aussage „das Modell ist kinematisch" daran, welcher Löser
/// eingestellt ist. Belegt wird der Abstand in
/// `docs/messungen/kinematik-abstand.md`, das beide Spalten führt.
const SINGULAR_PIVOT_TOLERANCE: f64 = 1e-12;

/// Das Ergebnis eines Lösungsversuchs.
///
/// Eine fehlende Fixierung oder ein zerfallenes Netz ist kein Fehler des
/// Aufrufers. Es ist ein Befund über das Modell und steht deshalb nicht im
/// `Err` von `solve`.
#[wasm_bindgen]
pub struct SparseSolveOutcome {
    d: Vec<f64>,
    unfixed: bool,
    singular_index: i32,
    pivot_ratio: f64,
}

#[wasm_bindgen]
impl SparseSolveOutcome {
    /// Die Lösungen, spaltenweise flach als `n × k`. Leer, wenn `unfixed` gilt.
    #[wasm_bindgen(getter)]
    pub fn d(&self) -> Vec<f64> {
        self.d.clone()
    }

    /// Die Matrix ist nicht positiv definit: die Fixierung fehlt oder das Netz
    /// besteht aus unverbundenen Teilen.
    #[wasm_bindgen(getter)]
    pub fn unfixed(&self) -> bool {
        self.unfixed
    }

    /// Die Zeile, in der es aufgefallen ist — oder `-1`.
    ///
    /// IN DER NUMMERIERUNG DES AUFRUFERS. Die Zerlegung rechnet in einer
    /// AMD-Umordnung; der Index wird über die Permutation zurückgerechnet,
    /// bevor er dieses Paket verlässt. Ohne das zeigte er auf eine ganz andere
    /// Zeile, und das wäre schlimmer als gar kein Index.
    ///
    /// Ein HINWEIS, kein Beweis: Cholesky pivotiert nicht, die Zeile ist die
    /// Stelle, an der der Rangabfall während der Elimination sichtbar wird.
    #[wasm_bindgen(getter, js_name = singularIndex)]
    pub fn singular_index(&self) -> i32 {
        self.singular_index
    }

    /// Das kleinste skalierte Pivot — auch im gelungenen Fall, als Maß dafür,
    /// wie nah das System an der Kinematik stand. `0` heißt exakter
    /// Fehlschlag.
    #[wasm_bindgen(getter, js_name = pivotRatio)]
    pub fn pivot_ratio(&self) -> f64 {
        self.pivot_ratio
    }
}

impl SparseSolveOutcome {
    fn solved(d: Vec<f64>, pivot_ratio: f64) -> Self {
        Self {
            d,
            unfixed: false,
            singular_index: -1,
            pivot_ratio,
        }
    }

    fn unfixed_outcome(index: i32, pivot_ratio: f64) -> Self {
        Self {
            d: Vec::new(),
            unfixed: true,
            singular_index: index,
            pivot_ratio,
        }
    }
}

/// Löst ein symmetrisch positiv definites, dünnbesetztes `K d = F`.
///
/// Die drei Triplet-Arrays sind gleich lang und enthalten nur das untere
/// Dreieck einschließlich der Diagonale. `f` ist spaltenweise flach: zuerst
/// die `n` Werte der ersten rechten Seite, dann die der zweiten. Die Cholesky-
/// Zerlegung verwendet AMD zur Reduktion von fill-in.
#[wasm_bindgen]
pub fn solve(
    n: usize,
    rows: &[u32],
    cols: &[u32],
    values: &[f64],
    rhs_columns: usize,
    f: &[f64],
) -> Result<SparseSolveOutcome, JsError> {
    solve_checked(n, rows, cols, values, rhs_columns, f)
        .map_err(|reason| JsError::new(&reason))
}

/// Der Rechenkern ohne WASM-Grenze.
///
/// Getrennt, weil `JsError` sich auf einem Nicht-WASM-Ziel nicht bauen lässt —
/// damit prüfen die Rust-Tests auch alle Vertragsbrüche.
fn solve_checked(
    n: usize,
    rows: &[u32],
    cols: &[u32],
    values: &[f64],
    rhs_columns: usize,
    f: &[f64],
) -> Result<SparseSolveOutcome, String> {
    if rows.len() != cols.len() || rows.len() != values.len() {
        return Err(format!(
            "rows, cols und values brauchen gleich viele Werte, bekommen hat es {}, {} und {}.",
            rows.len(),
            cols.len(),
            values.len()
        ));
    }

    let rhs_len = n
        .checked_mul(rhs_columns)
        .ok_or_else(|| "n * rhs_columns läuft über usize.".to_owned())?;
    if f.len() != rhs_len {
        return Err(format!(
            "F braucht n * rhs_columns = {} Werte, bekommen hat es {}.",
            rhs_len,
            f.len()
        ));
    }
    if n == 0 {
        return Ok(SparseSolveOutcome::solved(Vec::new(), f64::INFINITY));
    }

    // JACOBI-SKALIERUNG, aus demselben Grund wie im dichten Schwesterpaket: in
    // `K` stehen Dehnsteifigkeiten (`EA/L`) neben Biegesteifigkeiten
    // (`EI/L^3`), Größen, die um Zehnerpotenzen auseinanderliegen. Erst
    // `Ks = S K S` mit `S = diag(1/sqrt(K_ii))` macht die Diagonale überall 1
    // und ein Pivot mit einer festen Schwelle vergleichbar. Die Skalierung ist
    // dabei permutationsinvariant — AMD ordnet um, die Einsdiagonale bleibt.
    let mut diagonal = vec![0.0f64; n];
    for (&row, (&col, &value)) in rows.iter().zip(cols.iter().zip(values.iter())) {
        let row = row as usize;
        let col = col as usize;
        if row >= n || col >= n {
            return Err(format!(
                "Triplet ({}, {}) liegt außerhalb der {} × {}-Matrix.",
                row, col, n, n
            ));
        }
        if row < col {
            return Err(format!(
                "Triplet ({}, {}) liegt oberhalb der Diagonale; erwartet wird nur das untere Dreieck.",
                row, col
            ));
        }
        if !value.is_finite() {
            return Err(format!("Triplet ({}, {}) ist nicht endlich.", row, col));
        }
        // Doppelte Einträge werden aufsummiert, genau wie beim Aufbau der
        // Matrix — sonst skalierte die Diagonale nach dem letzten Triplet
        // statt nach dem Wert, der in der Matrix steht.
        if row == col {
            diagonal[row] += value;
        }
    }

    let mut s = vec![0.0f64; n];
    for i in 0..n {
        // Kein positiver Diagonalwert heißt: diese Zeile hält gar nichts. Der
        // Aufrufer fängt das schon vorher ab und kann es dabei genauer
        // benennen — hier steht es, damit die Skalierung nicht durch 0 teilt.
        if !(diagonal[i] > 0.0) || !diagonal[i].is_finite() {
            return Ok(SparseSolveOutcome::unfixed_outcome(i as i32, 0.0));
        }
        s[i] = 1.0 / diagonal[i].sqrt();
    }

    let mut triplets = Vec::with_capacity(values.len());
    for (&row, (&col, &value)) in rows.iter().zip(cols.iter().zip(values.iter())) {
        let row = row as usize;
        let col = col as usize;
        triplets.push(Triplet::new(row, col, value * s[row] * s[col]));
    }

    let matrix = SparseColMat::<usize, f64>::try_new_from_triplets(n, n, &triplets)
        .map_err(|error| format!("K konnte nicht aus Triplets aufgebaut werden: {error:?}"))?;

    // DIE ZERLEGUNG LÄUFT ÜBER DIE UNTERE API von faer und nicht über
    // `sp_cholesky`, und zwar für beide Befunde: `sp_cholesky` gibt im
    // Fehlerfall nur einen `LltError` heraus und mit ihm die Permutation
    // preis, ohne die der Index auf die falsche Zeile zeigt; und es reicht die
    // Werte von `L` nicht heraus, aus deren Diagonale das Pivot des
    // GELUNGENEN Falls kommt. Beides ist hier nötig.
    //
    // SIMPLICIAL ERZWUNGEN: nur in dieser Anordnung steht die Diagonale von
    // `L` an der ersten Stelle jeder Spalte (`values[col_ptr[j]]`). faers
    // Heuristik zwischen simplicial und supernodal ist eine
    // Geschwindigkeitsentscheidung; sie darf nicht darüber entscheiden, ob das
    // Pivot überhaupt zu haben ist. Für Stabwerke — rund zwölf Einträge je
    // Zeile — ist simplicial ohnehin die passende Wahl.
    let params = CholeskySymbolicParams {
        supernodal_flop_ratio_threshold: SupernodalThreshold::FORCE_SIMPLICIAL,
        ..Default::default()
    };
    let symbolic = factorize_symbolic_cholesky(
        matrix.symbolic(),
        Side::Lower,
        SymmetricOrdering::Amd,
        params,
    )
    .map_err(|error| format!("K konnte symbolisch nicht zerlegt werden: {error:?}"))?;

    let simplicial = match symbolic.raw() {
        SymbolicCholeskyRaw::Simplicial(simplicial) => simplicial,
        SymbolicCholeskyRaw::Supernodal(_) => {
            return Err(
                "faer hat trotz FORCE_SIMPLICIAL supernodal zerlegt; ohne col_ptr ist die \
                 Diagonale von L nicht zu lesen."
                    .to_owned(),
            );
        }
    };
    let col_ptr = simplicial.col_ptr().to_vec();

    // `perm_fwd[permutiert] = global`: die Zeile des Aufrufers zu einer Zeile
    // der Zerlegung.
    let perm_fwd: Vec<usize> = match symbolic.perm() {
        Some(perm) => perm.arrays().0.to_vec(),
        None => (0..n).collect(),
    };
    let to_caller = |permuted: usize| -> i32 {
        match perm_fwd.get(permuted) {
            Some(&global) => global as i32,
            None => -1,
        }
    };

    let mut l_values = vec![0.0f64; symbolic.len_val()];
    let mut factor_mem = MemBuffer::new(
        symbolic.factorize_numeric_llt_scratch::<f64>(Par::Seq, Default::default()),
    );
    if let Err(LltError::NonPositivePivot { index }) = symbolic.factorize_numeric_llt::<f64>(
        &mut l_values,
        matrix.as_ref(),
        Side::Lower,
        Default::default(),
        Par::Seq,
        MemStack::new(&mut factor_mem),
        Default::default(),
    ) {
        // faer zählt die gescheiterte Spalte AB EINS — `index` ist die Zahl der
        // Spalten, die noch gelungen sind. Belegt in den Tests unten.
        let permuted = index.saturating_sub(1);
        return Ok(SparseSolveOutcome::unfixed_outcome(to_caller(permuted), 0.0));
    }

    // Der FAST singuläre Fall, den ein Fehlschlag nie fängt: die Zerlegung
    // gelingt, aber ein Pivot ist nur noch Rundungsrauschen. Weil
    // `diag(Ks) = 1` ist, gilt `L_jj^2 <= 1` — das kleinste Pivot IST damit
    // schon das Verhältnis zum größten.
    let mut min_pivot = f64::INFINITY;
    let mut min_index = 0usize;
    for j in 0..n {
        let l_jj = l_values[col_ptr[j]];
        let pivot = l_jj * l_jj;
        if pivot < min_pivot {
            min_pivot = pivot;
            min_index = j;
        }
    }
    if min_pivot < SINGULAR_PIVOT_TOLERANCE {
        return Ok(SparseSolveOutcome::unfixed_outcome(
            to_caller(min_index),
            min_pivot,
        ));
    }

    // `Ks y = S F` lösen und mit `d = S y` zurückskalieren. EINE Zerlegung für
    // alle rechten Seiten — genau dafür nimmt dieses Paket `n × k` entgegen.
    let mut rhs = Mat::from_fn(n, rhs_columns, |row, column| f[column * n + row] * s[row]);
    let mut solve_mem =
        MemBuffer::new(symbolic.solve_in_place_scratch::<f64>(rhs_columns, Par::Seq));
    LltRef::new(&symbolic, &l_values).solve_in_place_with_conj(
        Conj::No,
        rhs.as_mut(),
        Par::Seq,
        MemStack::new(&mut solve_mem),
    );

    let mut flat_d = Vec::with_capacity(rhs_len);
    for column in 0..rhs_columns {
        for row in 0..n {
            let value = s[row] * rhs[(row, column)];
            // Gürtel und Hosenträger: kommt hier trotz allem etwas Unendliches
            // heraus, ist es keine Lösung — lieber melden als ausliefern.
            if !value.is_finite() {
                return Ok(SparseSolveOutcome::unfixed_outcome(row as i32, min_pivot));
            }
            flat_d.push(value);
        }
    }

    Ok(SparseSolveOutcome::solved(flat_d, min_pivot))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn nahe(actual: f64, expected: f64) -> bool {
        (actual - expected).abs() <= 1e-12 * expected.abs().max(1.0)
    }

    fn solved(
        n: usize,
        rows: &[u32],
        cols: &[u32],
        values: &[f64],
        rhs_columns: usize,
        f: &[f64],
    ) -> SparseSolveOutcome {
        let outcome = solve_checked(n, rows, cols, values, rhs_columns, f)
            .expect("Vertrag eingehalten");
        assert!(!outcome.unfixed, "hätte lösen müssen");
        assert_eq!(outcome.singular_index, -1);
        outcome
    }

    fn unfixed(
        n: usize,
        rows: &[u32],
        cols: &[u32],
        values: &[f64],
        rhs_columns: usize,
        f: &[f64],
    ) -> SparseSolveOutcome {
        let outcome = solve_checked(n, rows, cols, values, rhs_columns, f)
            .expect("Vertrag eingehalten");
        assert!(
            outcome.unfixed,
            "hätte unfixed sein müssen, liefert aber {:?}",
            outcome.d
        );
        assert!(outcome.d.is_empty());
        outcome
    }

    #[test]
    fn löst_den_fünfpunkt_stern_mit_zwei_rechten_seiten() {
        // Der Fünfpunkt-Stern auf vier inneren Knoten eines Einheitsquadrats.
        // Die beiden rechten Seiten stammen von d = [1, 2, 3, 4] und
        // d = [4, 3, 2, 1].
        let rows = [0, 1, 2, 3, 1, 2, 3, 3];
        let cols = [0, 1, 2, 3, 0, 0, 1, 2];
        let values = [4.0, 4.0, 4.0, 4.0, -1.0, -1.0, -1.0, -1.0];
        let outcome = solved(
            4,
            &rows,
            &cols,
            &values,
            2,
            &[-1.0, 3.0, 7.0, 11.0, 11.0, 7.0, 3.0, -1.0],
        );

        for (actual, expected) in outcome
            .d
            .iter()
            .zip([1.0, 2.0, 3.0, 4.0, 4.0, 3.0, 2.0, 1.0])
        {
            assert!(nahe(*actual, expected), "{actual} statt {expected}");
        }
    }

    #[test]
    fn eine_zerlegung_traegt_alle_rechten_seiten() {
        // DERSELBE Aufbau, einmal mit drei rechten Seiten auf einen Schlag und
        // einmal Spalte für Spalte: dass die Zerlegung geteilt wird, darf am
        // Ergebnis nichts ändern.
        let rows = [0, 1, 2, 1, 2];
        let cols = [0, 1, 2, 0, 1];
        let values = [4.0, 4.0, 4.0, -1.0, -1.0];
        let f = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];

        let bündel = solved(3, &rows, &cols, &values, 3, &f);
        for column in 0..3 {
            let einzeln = solved(3, &rows, &cols, &values, 1, &f[column * 3..(column + 1) * 3]);
            for row in 0..3 {
                assert!(
                    nahe(bündel.d[column * 3 + row], einzeln.d[row]),
                    "Spalte {column}, Zeile {row}"
                );
            }
        }
    }

    #[test]
    fn meldet_fehlende_fixierung_mit_zeile() {
        // Zweite Zeile ist ein Vielfaches der ersten — Rangabfall, und er fällt
        // bei der Elimination genau dort auf.
        let outcome = unfixed(2, &[0, 1, 1], &[0, 0, 1], &[1.0, 1.0, 1.0], 1, &[1.0, 1.0]);

        assert_eq!(outcome.singular_index, 1);
        assert_eq!(outcome.pivot_ratio, 0.0);
    }

    #[test]
    fn meldet_die_leere_diagonale_ohne_zu_zerlegen() {
        // Zeile 1 hält nichts — die Skalierung fängt es vor der Zerlegung ab.
        let outcome = unfixed(2, &[0, 1], &[0, 0], &[1.0, 1.0], 1, &[1.0, 1.0]);

        assert_eq!(outcome.singular_index, 1);
        assert_eq!(outcome.pivot_ratio, 0.0);
    }

    #[test]
    fn die_gemeldete_zeile_steht_in_der_nummerierung_des_aufrufers() {
        // DER Test, an dem die AMD-Permutation hängt: ein Band über acht
        // Zeilen, dessen SECHSTE Zeile (Index 5) zu schwach ist, um die beiden
        // Nachbarn zu halten. AMD ordnet dieses System nachweislich um — ohne
        // das Zurückrechnen käme hier eine andere Zahl heraus.
        let n = 8usize;
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut values = Vec::new();
        for i in 0..n {
            rows.push(i as u32);
            cols.push(i as u32);
            values.push(if i == 5 { 1.0 } else { 4.0 });
            if i + 1 < n {
                rows.push((i + 1) as u32);
                cols.push(i as u32);
                values.push(-2.0);
            }
        }

        let outcome = unfixed(n, &rows, &cols, &values, 1, &vec![1.0; n]);
        assert_eq!(outcome.singular_index, 5);
    }

    #[test]
    fn meldet_das_fast_singuläre_system() {
        // Die Zerlegung GELINGT hier — ohne das Pivot liefe ein Rahmen durch,
        // der rechnerisch steht und praktisch umfällt.
        let outcome = unfixed(
            2,
            &[0, 1, 1],
            &[0, 0, 1],
            &[1.0, 1.0, 1.0 + 1e-15],
            1,
            &[1.0, 1.0],
        );

        assert!(
            outcome.pivot_ratio > 0.0 && outcome.pivot_ratio < SINGULAR_PIVOT_TOLERANCE,
            "Pivot-Verhältnis {} sollte klein aber positiv sein",
            outcome.pivot_ratio
        );
    }

    #[test]
    fn ein_echter_kragarm_hält_großen_abstand_zur_schwelle() {
        // Dasselbe reduzierte K wie im dichten Schwesterpaket: ein Kragarm mit
        // einem Timoshenko-Element, Knoten 2 frei in (uz, phiY), EI aus
        // HEB 200 / S235 und L = 3 m. Die Zahl 1/4 hängt weder an EI noch an L
        // — genau das leistet die Skalierung —, und dass BEIDE Pakete sie
        // liefern, ist der Beleg dafür, dass `pivotRatio` auf beiden Wegen
        // dieselbe Größe ist.
        let ei: f64 = 2.1e11 * 8.356e-5;
        let l: f64 = 3.0;
        let k11 = 12.0 * ei / (l * l * l);
        let k12 = -6.0 * ei / (l * l);
        let k22 = 4.0 * ei / l;

        let outcome = solved(
            2,
            &[0, 1, 1],
            &[0, 0, 1],
            &[k11, k12, k22],
            1,
            &[-1000.0, 0.0],
        );

        let expected_uz = -1000.0 * l * l * l / (3.0 * ei);
        assert!(
            nahe(outcome.d[0], expected_uz),
            "uz = {}, erwartet {}",
            outcome.d[0],
            expected_uz
        );
        assert!(
            nahe(outcome.pivot_ratio, 0.25),
            "Pivot-Verhältnis {}, erwartet 1/4",
            outcome.pivot_ratio
        );
    }

    #[test]
    fn ein_schlecht_skaliertes_aber_stabiles_system_kommt_durch() {
        // Dehnsteifigkeit neben Biegesteifigkeit, neun Zehnerpotenzen
        // auseinander. Ohne Skalierung wäre das kleinste ROHE Pivot 1e-3 und
        // von einem Mechanismus nicht mehr zu unterscheiden.
        let ea = 2.1e9;
        let ei = 1.0e0;
        let outcome = solved(2, &[0, 1], &[0, 1], &[ea, ei], 1, &[ea, ei]);

        assert!(nahe(outcome.d[0], 1.0), "d0 = {}", outcome.d[0]);
        assert!(nahe(outcome.d[1], 1.0), "d1 = {}", outcome.d[1]);
        assert!(nahe(outcome.pivot_ratio, 1.0), "Pivot {}", outcome.pivot_ratio);
    }

    #[test]
    fn doppelte_triplets_werden_summiert() {
        // Die Assemblierung eines Stabwerks trägt denselben Platz mehrfach an.
        // Summiert werden muss auch für die SKALIERUNG, nicht nur beim Aufbau
        // der Matrix — sonst skalierte die Diagonale nach dem letzten Triplet.
        let outcome = solved(
            1,
            &[0, 0, 0],
            &[0, 0, 0],
            &[1.0, 2.0, 1.0],
            1,
            &[8.0],
        );
        assert!(nahe(outcome.d[0], 2.0), "d0 = {}", outcome.d[0]);
    }

    #[test]
    fn ein_leeres_system_ist_lösbar() {
        let outcome = solved(0, &[], &[], &[], 1, &[]);

        assert!(outcome.d.is_empty());
    }

    #[test]
    fn weist_vertragsbrüche_ohne_panik_zurück() {
        assert!(solve_checked(2, &[0], &[0, 1], &[1.0], 1, &[1.0, 2.0]).is_err());
        assert!(
            solve_checked(2, &[0, 0], &[0, 1], &[1.0, 1.0], 1, &[1.0, 2.0]).is_err()
        );
        assert!(solve_checked(2, &[0], &[0], &[1.0], 1, &[1.0]).is_err());
    }
}
