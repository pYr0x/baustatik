/**
 * Einwirkungen nach EN 1990 — das gemeinsame Vokabular, noch ohne Zahlen.
 *
 * WARUM DIESES PACKAGE EIN BLATT IST, und zwar ein leeres:
 *
 * Die Kombinatorik (Teilsicherheitsbeiwerte, psi0/psi1/psi2, Leiteinwirkung,
 * sich ausschliessende Gruppen) wird spaeter ein eigenes Package. Das braucht
 * den `LoadCase` aus @baustatik/fem-loads, haengt also DARAN. Wuerde die
 * Kategorie dort wohnen, muesste fem-loads umgekehrt an der Kombinatorik
 * haengen — ein Zyklus. Deshalb liegt das Vokabular in einem Blatt, das beide
 * benutzen koennen, und deshalb hat dieses Package NULL Abhaengigkeiten, nicht
 * einmal @baustatik/errors.
 *
 * KEINE psi-WERTE HIER. Das Package traegt die Begriffe, nicht die Tabelle.
 * Die Tabellenwerte sind national verschieden (Nationaler Anhang) und gehoeren
 * mit Herkunftsangabe je Datensatz dorthin, wo sie ausgewertet werden — Muster
 * ist packages/material/src/national-annex.ts (ADR 0001).
 *
 * KEINE VALIDIERUNG. Der Union ist diskriminiert, also kann kein unmoeglicher
 * Zustand entstehen: eine Nutzungskategorie ohne Nutzlast ist nicht
 * darstellbar, statt zur Laufzeit abgewiesen zu werden.
 */

/**
 * Die Einwirkung, zu der ein Lastfall gehoert.
 *
 * ZWEI ACHSEN, ABSICHTLICH GETRENNT: `action` ist die Klassifikation aus
 * EN 1990 (§4.1.1), `kind` die konkrete Einwirkung. Die psi-Zeilen in
 * DIN EN 1990 Tab. NA.A.1.1 sind nach BEIDEN indiziert — alle Nutzlast-,
 * Schnee- und Windfaelle sind gleichermassen `'variable'`, haben aber
 * verschiedene psi-Werte. Eine einzige flache Liste wuerde die beiden Achsen
 * verschmelzen und spaeter ein zweites Feld erzwingen.
 *
 * DISKRIMINANTEN AUSGESCHRIEBEN, nicht als Eurocode-Buchstaben `'G' | 'Q' |
 * 'A'`: die kollidieren mit den Symbolen fuer Lastwerte, und ein `switch` liest
 * sich mit Woertern.
 *
 * KEIN HOEHENSPLIT BEIM SCHNEE, obwohl der Nationale Anhang psi0 = 0,5 bzw.
 * 0,7 nach Orten bis/ueber NN+1000 m unterscheidet: die Hoehenlage ist
 * Eigenschaft des BAUWERKSSTANDORTS, nicht der Einwirkung. Ein Schneelastfall
 * wird keine andere Einwirkung, wenn das Gebaeude umzieht — und die Hoehenlage
 * gilt fuer alle Lastfaelle gemeinsam, muesste also je Schneelastfall erneut
 * eingegeben werden. Die psi-Funktion bekommt den Standort spaeter als zweites
 * Argument.
 *
 * NOCH NICHT DA: Verkehrslasten der Kategorien F bis H, Baugrundsetzung,
 * "sonstige". Ergaenzen kostet heute nichts, weil noch niemand exhaustiv
 * darueber schaltet; sobald eine psi-Abbildung existiert, ist jede neue
 * Variante ein Breaking Change.
 */
export type ActionCategory =
  | { action: 'permanent' }
  | {
      action: 'variable';
      kind: 'imposed';
      /** Nutzungskategorie nach EN 1991-1-1 Tab. 6.1/6.2. */
      useCategory: 'A' | 'B' | 'C' | 'D' | 'E';
    }
  | { action: 'variable'; kind: 'snow' | 'wind' | 'temperature' }
  | { action: 'accidental' };
