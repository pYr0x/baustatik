/**
 * Die benannten Fehler der Lastvalidierung.
 *
 * Alle erben von `LoadValidationError` und damit von `BaustatikError` (Policy
 * `error-hierarchy-policy.md`): ein Aufrufer unterscheidet per `instanceof`,
 * WAS schiefging, statt Meldungstexte zu parsen. `LoadValidationError` selbst
 * ist die Gruppenklammer — damit kann `fem-load-resolve` oder der Viewer
 * "irgendein Lastfehler" fangen, ohne alle Faelle einzeln aufzuzaehlen.
 *
 * BESONDERHEIT gegenueber `fem-element/src/errors.ts`: diese Fehler werden
 * nicht nur geworfen, sondern von `validateLoads` auch ZURUECKGEGEBEN. Eine
 * Lasteingabe kommt aus einem Dialog; der muss alle Beanstandungen auf einmal
 * zeigen koennen und darf am ersten nicht abbrechen. Deshalb tragen die Klassen
 * ihre Daten (`loadId`, betroffenes Ziel, Feldname) als Felder und nicht nur im
 * Text — die Oberflaeche kann daran das falsche Eingabefeld markieren.
 *
 * EINE AUSNAHME steht am Ende: `InvalidLoadValidationPolicyError` beanstandet
 * keine Last, sondern die EINSTELLUNG, mit der geprueft wird. Er erbt deshalb
 * nicht von `LoadValidationError` — er darf nicht in einer Liste landen, die
 * der Dialog als Eingabefehler des Anwenders anzeigt.
 */

import { BaustatikError } from '@baustatik/errors';

/** Zielart einer Last. Entspricht der Diskriminante `target` in `types.ts`. */
export type LoadTargetKind = 'node' | 'beam';

const TARGET_LABEL: Record<LoadTargetKind, string> = {
  node: 'Knoten',
  beam: 'Stab',
};

/**
 * Gemeinsame Basis aller Beanstandungen. Abstrakt, damit jede Regelverletzung
 * einen eigenen Namen bekommt und niemand einen generischen Fehler wirft.
 */
export abstract class LoadValidationError extends BaustatikError {
  /** Die beanstandete Last (`FEMLoad.id`). */
  readonly loadId: string;

  protected constructor(loadId: string, message: string) {
    super(`Last "${loadId}": ${message}`);
    this.loadId = loadId;
  }
}

/**
 * Gemeinsame Basis aller HINWEISE.
 *
 * Zweite Hierarchie neben `LoadValidationError`, weil der Ablauf drei Ausgaenge
 * hat: hart (Fehler, kein Rechnen), weich (Hinweis, Rechnen erlaubt) und frei.
 * Drei Ausgaenge brauchen zwei Sorten Befund — unabhaengig davon, wie viele
 * Faelle es gibt. Genau die Fallzahl war frueher das (falsche) Kriterium, an
 * dem dieser Begriff aufgehalten wurde.
 *
 * Eine Warnung wird NIE geworfen; `assertValidLoads` ignoriert sie. Sie meldet
 * eine ZULAESSIGE Eingabe, die nach einem Versehen aussieht.
 */
export abstract class LoadValidationWarning extends BaustatikError {
  /** Die betroffene Last (`FEMLoad.id`). */
  readonly loadId: string;

  protected constructor(loadId: string, message: string) {
    super(`Last "${loadId}": ${message}`);
    this.loadId = loadId;
  }
}

/** `nodeIds` bzw. `beamIds` ist leer — eine Last ohne Ziel wirkt nirgends. */
export class EmptyLoadTargetError extends LoadValidationError {
  readonly targetKind: LoadTargetKind;

  constructor(loadId: string, targetKind: LoadTargetKind) {
    super(
      loadId,
      `die Ziel-Liste (${targetKind === 'node' ? 'nodeIds' : 'beamIds'}) ist leer.`,
    );
    this.targetKind = targetKind;
  }
}

/**
 * Eine Last verweist auf einen Knoten oder Stab, den es im Modell nicht gibt.
 * Bewusst ein Fehler und keine stille Auslassung — dieselbe Begruendung wie bei
 * `UnknownNodeReferenceError` im `fem-viewer`: eine still uebersprungene Last
 * verschwindet spurlos aus Zeichnung und Rechnung.
 */
export class UnknownLoadTargetError extends LoadValidationError {
  readonly targetKind: LoadTargetKind;
  readonly targetId: string;

  constructor(loadId: string, targetKind: LoadTargetKind, targetId: string) {
    super(
      loadId,
      `verweist auf unbekannten ${TARGET_LABEL[targetKind]} "${targetId}".`,
    );
    this.targetKind = targetKind;
    this.targetId = targetId;
  }
}

/**
 * Der belastete Stab hat die Laenge 0 (beide Knoten an derselben Stelle).
 * Damit ist jede Lagepruefung sinnlos und `resolve` haette ein `L = 0` im
 * Nenner. Der Modellfehler wird hier gemeldet, weil er hier auffaellt.
 */
export class DegenerateBeamError extends LoadValidationError {
  readonly beamId: string;

  constructor(loadId: string, beamId: string) {
    super(loadId, `liegt auf dem entarteten Stab "${beamId}" (Laenge 0).`);
    this.beamId = beamId;
  }
}

/** Eine Knotenlast, deren Komponenten alle fehlen oder 0 sind. */
export class ZeroNodeLoadError extends LoadValidationError {
  constructor(loadId: string) {
    super(
      loadId,
      'keine Komponente ungleich 0 — mindestens eines von fx, fz, my muss wirken.',
    );
  }
}

/**
 * Eine Stablast, deren Werte alle 0 sind.
 *
 * Das Gegenstueck zu `ZeroNodeLoadError`, und aus demselben Grund ein Fehler:
 * eine Last, die nichts eintraegt, ist keine Last. Sie waere sonst still — im
 * Modell sichtbar, in der Rechnung wirkungslos.
 *
 * NICHT betroffen ist die Dreieckslast (`q1: 0, q2: 8`): dort wirkt ein Wert,
 * und der Verlauf mit einer Null an einem Ende ist ein ausdruecklich
 * vorgesehener Fall (E2 im Pseudocode). Beanstandet wird nur, wenn ALLE Werte
 * der Variante 0 sind.
 *
 * `fields` nennt die Felder der jeweiligen Variante — `p`, `q`, `q1`/`q2`, `m`
 * oder `m1`/`m2` —, damit die Oberflaeche sie markieren kann.
 */
export class ZeroBeamLoadError extends LoadValidationError {
  readonly fields: readonly string[];

  constructor(loadId: string, fields: readonly string[]) {
    super(
      loadId,
      `kein Wert ungleich 0 — mindestens eines von ${fields.join(', ')} muss wirken.`,
    );
    this.fields = fields;
  }
}

/**
 * Ein Lastwert oder Abstand ist `NaN` oder unendlich. Ungeprueft landete das
 * still in der globalen Steifigkeitsmatrix, weit weg von der Ursache.
 */
export class NonFiniteLoadValueError extends LoadValidationError {
  readonly field: string;
  readonly value: number;

  constructor(loadId: string, field: string, value: number) {
    super(loadId, `"${field}" ist nicht endlich (war: ${value}).`);
    this.field = field;
    this.value = value;
  }
}

/**
 * Ein Abstand ist negativ. Eigene Klasse und nicht `DistanceOutOfRangeError`
 * mit Grenze 0, weil die untere Grenze ohne jede Geometrie feststeht: sie gilt
 * fuer relative wie absolute Abstaende und fuer jeden Stab gleich.
 */
export class NegativeDistanceError extends LoadValidationError {
  readonly field: string;
  readonly value: number;

  constructor(loadId: string, field: string, value: number) {
    super(loadId, `"${field}" darf nicht negativ sein (war: ${value}).`);
    this.field = field;
    this.value = value;
  }
}

/**
 * Ein Abstand ueberschreitet die Obergrenze: die Stablaenge, bei
 * `relativeDistances` die 100 %. Bei absoluten Abstaenden haengt die Grenze am
 * Stab, deshalb steht dann auch `beamId` drin — dieselbe Last kann auf einem
 * langen Stab passen und auf einem kurzen nicht.
 */
export class DistanceOutOfRangeError extends LoadValidationError {
  readonly field: string;
  readonly value: number;
  readonly limit: number;
  readonly beamId: string | undefined;

  constructor(
    loadId: string,
    field: string,
    value: number,
    limit: number,
    beamId?: string,
  ) {
    super(
      loadId,
      `"${field}" ueberschreitet ${limit}${
        beamId === undefined ? '' : ` (Laenge von Stab "${beamId}")`
      } (war: ${value}).`,
    );
    this.field = field;
    this.value = value;
    this.limit = limit;
    this.beamId = beamId;
  }
}

/** Der Lastabschnitt laeuft rueckwaerts (`from > to`). */
export class BackwardsLoadExtentError extends LoadValidationError {
  readonly from: number;
  readonly to: number;

  constructor(loadId: string, from: number, to: number) {
    super(loadId, `Lastabschnitt laeuft rueckwaerts: from=${from} > to=${to}.`);
    this.from = from;
    this.to = to;
  }
}

/**
 * Der Bezugslaengen-Faktor `L_proj / L` liegt auf oder unter der harten
 * Mindest-Projektionsrate: `'verticalProjection'` am waagrechten Stab,
 * `'horizontalProjection'` am senkrechten. Die Last waere dann in Summe (fast)
 * 0 — der Anwender hat sich in der Bezugslaenge vertan (die RFEM-Option heisst
 * nach der BLICKRICHTUNG, nicht nach der gemessenen Achse, siehe `types.ts`).
 *
 * HIESS FRUEHER `ZeroProjectedLengthError`. Mit einer konfigurierbaren Schranke
 * (`LoadValidationPolicy.minimumReferenceFactor`) ist „Zero" schlicht falsch:
 * abgelehnt wird alles bis zur Schranke, und die muss nicht 0 sein. Aus
 * demselben Grund nennt die Meldung den Faktor und die aktive Schranke, statt
 * „misst am Stab 0" zu behaupten.
 *
 * Die Invariante bleibt: weil `validate.ts` mit `factor <= minimum` prueft,
 * ist der EXAKTE Faktor 0 auch bei `minimumReferenceFactor: 0` ein Fehler.
 */
export class ReferenceFactorBelowMinimumError extends LoadValidationError {
  readonly beamId: string;
  readonly referenceLength: string;
  /** `L_proj / L` am beanstandeten Stab. */
  readonly factor: number;
  /** Die aktive Schranke, damit der Befund bei abweichender Policy traegt. */
  readonly minimumReferenceFactor: number;

  constructor(
    loadId: string,
    beamId: string,
    referenceLength: string,
    factor: number,
    minimumReferenceFactor: number,
  ) {
    super(
      loadId,
      `Bezugslaenge "${referenceLength}" misst am Stab "${beamId}" nur den ` +
        `Bruchteil ${factor} der Stablaenge — zulaessig ist erst mehr als ` +
        `${minimumReferenceFactor}.`,
    );
    this.beamId = beamId;
    this.referenceLength = referenceLength;
    this.factor = factor;
    this.minimumReferenceFactor = minimumReferenceFactor;
  }
}

/** Ein Lastwert samt dem, was nach der Bezugslaenge davon uebrig bleibt. */
export type ScaledLoadValue = {
  field: string;
  /** Wie eingegeben. */
  value: number;
  /** `value * factor` — was tatsaechlich gerechnet wird. */
  effective: number;
};

/**
 * Die Bezugslaenge misst am Stab fast 0: die Last schrumpft auf einen Bruchteil
 * zusammen, ohne dass irgendetwas es zeigt.
 *
 * WARUM DAS EIN HINWEIS IST UND KEIN FEHLER: der Uebergang ist stetig. Ein
 * 5-Grad-Flachdach mit `'verticalProjection'` hat Faktor 0,087 und ist voellig
 * in Ordnung (Winddruck auf die Ansichtsflaeche). Ein Stab von (0,0) nach
 * (100,1) — 0,57 Grad, mit blossem Auge waagrecht — hat Faktor 0,01, und aus
 * `q: 5` werden gerechnete `0,05`. Beide Eingaben sind zulaessig; nur die
 * zweite sieht nach einem Vertipper aus. Als Fehler waere die Schranke
 * untragbar, als Hinweis ist sie vertretbar.
 *
 * DIE MELDUNG NENNT DIE FOLGE, NICHT DIE URSACHE. Das Gefaehrliche ist nicht
 * der kleine Faktor, sondern dass die Schrumpfung unsichtbar bleibt — in der
 * Zeichnung sieht die Last aus wie eingegeben. Deshalb traegt die Klasse den
 * GERECHNETEN Wert neben dem eingegebenen, nicht nur den Faktor.
 */
export class NearlyDegenerateReferenceLengthWarning extends LoadValidationWarning {
  readonly beamId: string;
  readonly referenceLength: string;
  /** `L_proj / L`, zwischen 0 und der Schranke. */
  readonly factor: number;
  /**
   * Die aktive Warnschwelle
   * (`LoadValidationPolicy.suspiciousReferenceFactor`).
   *
   * Steht im Befund, weil sie nicht mehr fest ist: ohne sie liesse sich bei
   * abweichender Policy nicht sagen, wogegen der Faktor gemessen wurde.
   */
  readonly suspiciousReferenceFactor: number;
  readonly values: readonly ScaledLoadValue[];

  constructor(
    loadId: string,
    beamId: string,
    referenceLength: string,
    factor: number,
    suspiciousReferenceFactor: number,
    values: readonly ScaledLoadValue[],
  ) {
    const percent = (factor * 100).toPrecision(2);
    const shrunk = values
      .map(
        ({ field, value, effective }) => `${field}: ${value} -> ${effective}`,
      )
      .join(', ');
    super(
      loadId,
      `Bezugslaenge "${referenceLength}" misst am Stab "${beamId}" nur ` +
        `${percent} % der Stablaenge — gerechnet wird ${shrunk}.`,
    );
    this.beamId = beamId;
    this.referenceLength = referenceLength;
    this.factor = factor;
    this.suspiciousReferenceFactor = suspiciousReferenceFactor;
    this.values = values;
  }
}

/**
 * Ein Trapez mit `from === to`: der Lastabschnitt hat keine Ausdehnung und
 * traegt nichts ein.
 *
 * `to < from` ist ein Fehler (`BackwardsLoadExtentError`), `to === from` nicht:
 * die Angabe ist widerspruchsfrei, sie ist nur wirkungslos. Braucht keine
 * gegriffene Schwelle — der Vergleich ist exakt.
 */
export class ZeroExtentLoadSegmentWarning extends LoadValidationWarning {
  readonly at: number;
  readonly relative: boolean;

  constructor(loadId: string, at: number, relative: boolean) {
    super(
      loadId,
      `Lastabschnitt ohne Ausdehnung: from = to = ${at}${
        relative ? ' %' : ''
      } — die Last traegt nichts ein.`,
    );
    this.at = at;
    this.relative = relative;
  }
}

/**
 * Die Lastvalidierungs-Policy selbst ist unbrauchbar (`src/policy.ts`).
 *
 * ERBT BEWUSST NICHT von `LoadValidationError`: das hier ist keine Last, die
 * der Anwender falsch eingegeben hat, sondern eine Einstellung, mit der gar
 * nicht erst geprueft werden kann. In der Fehlerliste des Eingabedialogs waere
 * er ein Fremdkoerper — und wuerde neben einer `loadId` stehen, die es nicht
 * gibt. Er wird immer GEWORFEN, nie zurueckgegeben.
 *
 * `field` nennt das beanstandete Feld, sofern sich der Befund auf eines
 * eingrenzen laesst — die Beziehung der beiden Referenzfaktoren zueinander
 * haengt an zweien.
 */
export class InvalidLoadValidationPolicyError extends BaustatikError {
  readonly field: string | undefined;

  constructor(reason: string, field?: string) {
    super(`Lastvalidierungs-Policy: ${reason}`);
    this.field = field;
  }
}
