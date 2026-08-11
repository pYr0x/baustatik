//! Der dünnbesetzte Gleichungslöser `K d = F` für positiv definite Systeme.
//!
//! `K` kommt als Triplets des unteren Dreiecks herein. `F` und das Ergebnis
//! liegen spaltenweise flach als `n × k` vor.

use faer::linalg::solvers::Solve;
use faer::sparse::linalg::LltError;
use faer::sparse::{SparseColMat, Triplet};
use faer::{Mat, Side};
use wasm_bindgen::prelude::*;

/// Das Ergebnis eines Lösungsversuchs.
///
/// Eine fehlende Fixierung oder ein zerfallenes Netz ist kein Fehler des
/// Aufrufers. Es ist ein Befund über das Modell und steht deshalb nicht im
/// `Err` von `solve`.
#[wasm_bindgen]
pub struct SparseSolveOutcome {
    d: Vec<f64>,
    unfixed: bool,
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
}

impl SparseSolveOutcome {
    fn solved(d: Vec<f64>) -> Self {
        Self { d, unfixed: false }
    }

    fn unfixed_outcome() -> Self {
        Self {
            d: Vec::new(),
            unfixed: true,
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

    let mut triplets = Vec::with_capacity(values.len());
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
        triplets.push(Triplet::new(row, col, value));
    }

    let matrix = SparseColMat::<usize, f64>::try_new_from_triplets(n, n, &triplets)
        .map_err(|error| format!("K konnte nicht aus Triplets aufgebaut werden: {error:?}"))?;
    let factorization = match matrix.sp_cholesky(Side::Lower) {
        Ok(factorization) => factorization,
        Err(LltError::Numeric(_)) => return Ok(SparseSolveOutcome::unfixed_outcome()),
        Err(LltError::Generic(error)) => {
            return Err(format!("K konnte nicht zerlegt werden: {error:?}"));
        }
    };

    let rhs = Mat::from_fn(n, rhs_columns, |row, column| f[column * n + row]);
    let d = factorization.solve(rhs.as_ref());
    let mut flat_d = Vec::with_capacity(rhs_len);
    for column in 0..rhs_columns {
        for row in 0..n {
            let value = d[(row, column)];
            if !value.is_finite() {
                return Ok(SparseSolveOutcome::unfixed_outcome());
            }
            flat_d.push(value);
        }
    }

    Ok(SparseSolveOutcome::solved(flat_d))
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
    fn meldet_fehlende_fixierung_als_befund() {
        let outcome = solve_checked(
            2,
            &[0, 1, 1],
            &[0, 0, 1],
            &[1.0, -1.0, 1.0],
            1,
            &[1.0, -1.0],
        )
        .expect("Vertrag eingehalten");

        assert!(outcome.unfixed);
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
