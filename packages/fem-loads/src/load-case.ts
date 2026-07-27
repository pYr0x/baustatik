/**
 * Der Lastfall — eine Gruppe von Lasten, die gemeinsam wirken.
 *
 * EINE SCHICHT UEBER DEM LASTMODELL, nicht darin: `src/types.ts` bleibt die
 * reine Lastmenge, die `fem-load-resolve` und der Viewer verarbeiten. Der
 * Lastfall besitzt Lasten, aendert aber keine einzige Lastart.
 *
 * DER LASTFALL BESITZT SEINE LASTEN. Es gibt bewusst KEIN `loadCaseId` an der
 * Last: zwei Orte fuer dieselbe Zugehoerigkeit waeren zwei Wahrheiten, und eine
 * id ohne Besitzer laedt zu einem Fake-Default-Lastfall ein. Eine Last existiert
 * nur innerhalb eines Lastfalls.
 *
 * WOZU DER FAKTOR — und wozu NICHT:
 *
 *   Er dient der ABLEITUNG DURCH KOPIEREN. Einen Lastfall mit einem Dutzend
 *   Lasten kopieren und als Ganzes umkehren (Wind von links -> Wind von rechts,
 *   Faktor -1) oder auf den echten Wert skalieren (1-fach eingegeben -> Faktor
 *   1,75). Ohne ihn muesste der Anwender jeden Lastwert der Kopie einzeln
 *   nachziehen.
 *
 *   Er ist KEIN KOMBINATIONSBEIWERT. Wer hier 1,35 eintraegt, bekommt es in der
 *   Kombination ein zweites Mal — 1,35 x 1,35. Teilsicherheitsbeiwerte und
 *   psi-Werte gehoeren zur Kombinatorik und nicht an den Lastfall. Siehe
 *   ADR 0013; die Verwechslung ist naheliegend genug, dass sie beim Entwurf
 *   dieses Moduls tatsaechlich passiert ist.
 *
 * ROH PRUEFEN, EFFEKTIV RECHNEN: das Tor (`assertValidLoads`) sieht die
 * EINGEGEBENEN Werte, Rechnung und Darstellung sehen die gefakterten. So nennt
 * jede Meldung die Zahl, die der Anwender eingetippt hat. Tragfaehig ist das,
 * weil bei endlichem Faktor ungleich 0 keine heutige Regel ihr Ergebnis aendert:
 * Nullheit und Endlichkeit bleiben erhalten, und die Abstaende werden gar nicht
 * angefasst. Die Invariante steht in ADR 0013 und haengt an einem Test in
 * `tests/load-case.test.ts`.
 */

import type { ActionCategory } from '@baustatik/actions';
import { InvalidLoadCaseError } from './errors';
import type { FEMLoad, NodeLoad } from './types';

/**
 * Eine benannte Gruppe von Lasten, die gemeinsam wirken.
 *
 * `loads` ist unveraenderlich GETYPT, das Feld selbst aber zuweisbar: der Store
 * ersetzt das Array (`loads = [...loads, neu]`), niemand schiebt in eine Menge,
 * die andere gerade lesen.
 */
export type LoadCase = {
  id: string;
  /**
   * Benennung fuer Oberflaeche und Bericht — KEIN Schluessel. Zwei Lastfaelle
   * duerfen „Wind" heissen; unterschieden werden sie ueber `id`.
   */
  name: string;
  loads: readonly FEMLoad[];
  /**
   * Faktor auf alle Lastwerte dieses Falls. Fehlt das Feld, wirkt 1.
   *
   * Endlich und ungleich 0. Negativ ist ERLAUBT und der Hauptzweck: -1 kehrt
   * eine kopierte Windlast um. 0 dagegen waere ein stillgelegter Lastfall durch
   * die Hintertuer — dafuer gehoert ein eigener Schalter her oder Loeschen,
   * kein magischer Wert.
   */
  factor?: number;
  /**
   * Einwirkung, zu der dieser Lastfall gehoert. Wird GESPEICHERT und nie
   * gedeutet: keine psi-Werte, keine Teilsicherheitsbeiwerte in diesem Package.
   *
   * Achtung, Kategorie ist nicht Gruppe: „Wind von links" und „Wind von rechts"
   * tragen dieselbe Kategorie, duerfen aber nie gleichzeitig in einer
   * Kombination stehen. Diese ausschliessende Beziehung drueckt das Feld NICHT
   * aus und darf nicht dafuer missbraucht werden.
   */
  category?: ActionCategory;
};

/**
 * Wirft, wenn der Faktor unbrauchbar ist.
 *
 * KEINE FACTORY. Ein Lastfall ist ein Datensatz, kein Objekt mit Verhalten — ihn
 * durch eine `createLoadCase()` zu schleusen wuerde ein Bauwerk vortaeuschen, das
 * es nicht gibt, und vor allem waere es umgehbar: ein Objektliteral ginge daran
 * vorbei und `solve()` rechnete mit `NaN` weiter. Als Zusicherung steht das hier
 * neben `assertValidLoads` und laeuft an derselben Stelle wie diese, im Tor.
 *
 * Prueft NUR den Faktor. Alles andere ist entweder vom Typ erzwungen (`category`
 * ist ein diskriminierter Union, `name` ist Pflicht) oder gar keine Beanstandung:
 * ein Lastfall OHNE Lasten ist nicht falsch, sondern nur nicht rechenbar — das
 * meldet der Pruefbericht des Solvers als Zustand `unloaded`.
 */
export function assertValidLoadCase(loadCase: LoadCase): void {
  const { factor } = loadCase;
  if (factor === undefined) return;

  if (!Number.isFinite(factor)) {
    throw new InvalidLoadCaseError(
      loadCase.id,
      `Faktor ist nicht endlich: ${factor}`,
    );
  }
  // Deckt -0 mit ab: `-0 === 0` ist wahr.
  if (factor === 0) {
    throw new InvalidLoadCaseError(
      loadCase.id,
      'Faktor 0 waere ein stillgelegter Lastfall — loeschen statt neutralisieren.',
    );
  }
}

/**
 * Die Lasten des Falls, wie sie wirken — Faktor angewandt.
 *
 * DIE EINE STELLE, durch die Solver UND Viewer schauen. Deshalb kann am Pfeil
 * nichts anderes stehen als in der Rechnung.
 *
 * Bei Faktor 1 (oder fehlendem Faktor) kommt DASSELBE Array zurueck, keine
 * Kopie: der Normalfall darf nichts kosten, und die Lastobjekte behalten ihre
 * Identitaet.
 */
export function effectiveLoads(loadCase: LoadCase): readonly FEMLoad[] {
  const factor = loadCase.factor ?? 1;
  if (factor === 1) {
    return loadCase.loads;
  }
  return loadCase.loads.map((load) => scaleLoad(load, factor));
}

/**
 * Skaliert NUR die Lastwerte, nie die Geometrie.
 *
 * Der Switch spiegelt `valuesOf` in `src/validate.ts` — dort werden dieselben
 * Felder als „die Lastwerte" aufgezaehlt. Kommt eine Lastart dazu, sind das die
 * zwei Stellen, die mitwandern muessen.
 *
 * WAS UNANGETASTET BLEIBT und warum es zaehlt: `distanceFromStart`, `from`,
 * `to`, `relativeDistances`, `fullLength`, `referenceLength`, `frame`, `axis`.
 * Ein naives „alle Zahlen multiplizieren" wuerde bei Faktor -1 aus einer
 * legalen Lage einen negativen Abstand machen und die Last am Tor scheitern
 * lassen, die der Anwender korrekt eingegeben hat.
 */
function scaleLoad(load: FEMLoad, factor: number): FEMLoad {
  if (load.target === 'node') {
    // Feldweise statt per Spread mit `undefined`, damit eine weggelassene
    // Komponente weggelassen BLEIBT und nicht als `fx: undefined` auftaucht.
    const scaled: NodeLoad = { ...load };
    if (load.fx !== undefined) scaled.fx = scale(load.fx, factor);
    if (load.fz !== undefined) scaled.fz = scale(load.fz, factor);
    if (load.my !== undefined) scaled.my = scale(load.my, factor);
    return scaled;
  }

  if (load.kind === 'force') {
    switch (load.distribution) {
      case 'point':
        return { ...load, p: scale(load.p, factor) };
      case 'constant':
        return { ...load, q: scale(load.q, factor) };
      case 'trapezoidal':
        return {
          ...load,
          q1: scale(load.q1, factor),
          q2: scale(load.q2, factor),
        };
    }
  }

  switch (load.distribution) {
    case 'point':
    case 'constant':
      return { ...load, m: scale(load.m, factor) };
    case 'trapezoidal':
      return {
        ...load,
        m1: scale(load.m1, factor),
        m2: scale(load.m2, factor),
      };
  }
}

/**
 * `0` bleibt `0`. Ohne die Abfrage liefert `0 * -1` die Zahl `-0`, und die
 * stuende als „-0 kN" an einem Pfeil.
 */
function scale(value: number, factor: number): number {
  return value === 0 ? 0 : value * factor;
}
