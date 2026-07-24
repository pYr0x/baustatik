use faer::linalg::solvers::{PartialPivLu, Solve};
use faer::mat::MatRef;
use wasm_bindgen::prelude::*;

// K comes in row-major (JS side flattens row by row) — F and the result are single columns.
#[wasm_bindgen]
pub fn solve(n: usize, k: &[f64], f: &[f64]) -> Vec<f64> {
    assert_eq!(k.len(), n * n, "K must have n * n entries");
    assert_eq!(f.len(), n, "F must have n entries");

    let k = MatRef::from_row_major_slice(k, n, n);
    let f = MatRef::from_column_major_slice(f, n, 1);

    let lu = PartialPivLu::new(k);
    let d = lu.solve(f);

    d.col_as_slice(0).to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solves_a_simple_system() {
        // [2 0; 0 3] * d = [4; 9] -> d = [2; 3]
        let k = [2.0, 0.0, 0.0, 3.0];
        let f = [4.0, 9.0];

        let d = solve(2, &k, &f);

        assert_eq!(d, vec![2.0, 3.0]);
    }
}
