import { BaustatikError } from '@baustatik/errors';

/**
 * Ein Torsionsmoment ist angekommen, und dieses Package kann es nicht
 * auswerten.
 *
 * WARUM WERFEN STATT IGNORIEREN: der Verzicht ist heute **technisch erzwungen**
 * und nicht bloss eine Priorität.
 *
 * - Bredt braucht `Am`, und `Am` steht nicht in `SectionProperties`. Aus `It`
 *   zurückzurechnen geht nicht — `It = 4·Am²/∮(ds/t)` braucht das
 *   Umlaufintegral, das ebenso fehlt. `Mt` auszuwerten hiesse,
 *   `@baustatik/cross-section` zu erweitern.
 * - Beim OFFENEN Profil ist `τ = Mt·t/It` über die Wanddicke linear
 *   veränderlich mit Null in der Mittellinie. Das widerspricht direkt der
 *   Annahme, auf der der Spannungspunkt gebaut ist („τ konstant über die
 *   Schnittbreite", ADR 0057) — ein Torsionsanteil passt gar nicht in einen
 *   `StressPoint`, wie er heute definiert ist.
 * - Stilles Ignorieren wäre **unkonservativ**: ein zu kleines `sigmaV` ohne
 *   Warnung. Wörtlich der Fall, den ADR 0057 als Begründung für `undefined`
 *   anführt.
 *
 * `Mt: 0` UND `Mt: undefined` LAUFEN DURCH. Ein räumlicher Solver schickt alle
 * sechs Schnittgrössen, und die meisten davon sind null.
 */
export class TorsionNotSupportedError extends BaustatikError {
  constructor(
    /** Das Torsionsmoment, das nicht ausgewertet werden konnte [kNm]. */
    readonly Mt: number,
  ) {
    super(
      `Mt = ${Mt} kNm: die Torsionsschubspannung wird von ` +
        '@baustatik/cross-section-stress nicht ausgewertet.',
    );
  }
}
