/**
 * Das UNABHAENGIGE ORAKEL fuer kappa: numerische Integration.
 *
 * `src/calculation/shear.ts` rechnet `integral S^2/t ds` geschlossen, indem es das Polynom
 * vierten Grades ausmultipliziert. Diese Datei rechnet dasselbe Integral
 * numerisch, aus einer Beschreibung des Weges, die den Hebelarm als FUNKTION
 * angibt statt als Koeffizienten. Kein Schritt der einen Rechnung kommt in der
 * anderen vor — genau das macht sie zum Orakel und nicht zur Wiederholung.
 *
 * Vier Herleitungen (Rechteck, Kasten, I, Plattenbalken) mal zwei
 * Idealisierungen haetten sonst nur sich selbst als Zeugen.
 */

/** Ein Abschnitt: Laenge, Dicke, und der Hebelarm entlang des Weges. */
export type OraclePiece = {
  readonly length: number;
  readonly t: number;
  /** Abstand zur Schwerpunktachse an der Stelle `s` in `[0, length]`. */
  readonly arm: (s: number) => number;
};

/** Ein Ast des Weges: startet bei `S0` und laeuft die Abschnitte der Reihe nach. */
export type OracleBranch = {
  readonly S0: number;
  readonly pieces: readonly OraclePiece[];
};

/**
 * `integral S^2/t ds` ueber alle Aeste, plus das `S` am Ende jedes Astes.
 *
 * `S` entsteht durch kumulative Simpson-Integration von `arm*t` — der
 * Integrand ist hoechstens linear, die Regel dafuer exakt. Das aeussere
 * Integral ist zusammengesetztes Simpson ueber `S^2/t`; bei `steps = 400` je
 * Abschnitt liegt der Fehler weit unter der geforderten Toleranz 1e-6.
 */
export function shearIntegralNumeric(
  branches: readonly OracleBranch[],
  steps = 400,
): { total: number; endMoments: number[] } {
  let total = 0;
  const endMoments: number[] = [];

  for (const branch of branches) {
    let S = branch.S0;
    for (const piece of branch.pieces) {
      const n = steps % 2 === 0 ? steps : steps + 1;
      const h = piece.length / n;

      // S an den Gitterpunkten, kumulativ.
      const values: number[] = [S];
      for (let i = 0; i < n; i++) {
        const a = i * h;
        const flux =
          (h / 6) *
          (piece.arm(a) + 4 * piece.arm(a + h / 2) + piece.arm(a + h)) *
          piece.t;
        S += flux;
        values.push(S);
      }

      // Zusammengesetztes Simpson ueber S^2/t.
      let sum = values[0] * values[0] + values[n] * values[n];
      for (let i = 1; i < n; i++) {
        sum += (i % 2 === 1 ? 4 : 2) * values[i] * values[i];
      }
      total += ((h / 3) * sum) / piece.t;
    }
    endMoments.push(S);
  }

  return { total, endMoments };
}

/** `A_s = I^2 / integral S^2/t ds` — dieselbe Definition, andere Rechnung. */
export function shearAreaNumeric(
  I: number,
  branches: readonly OracleBranch[],
): number {
  return (I * I) / shearIntegralNumeric(branches).total;
}

/** Eine Teilflaeche laengs der Schubrichtung: der Hebelarm waechst mit `s`. */
export function alongPiece(
  start: number,
  length: number,
  t: number,
): OraclePiece {
  return { length, t, arm: (s) => start + s };
}

/** Eine Wand quer zur Schubrichtung: der Hebelarm ist fest. */
export function acrossPiece(
  arm: number,
  length: number,
  t: number,
): OraclePiece {
  return { length, t, arm: () => arm };
}
