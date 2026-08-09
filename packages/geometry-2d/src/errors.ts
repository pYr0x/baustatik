import { BaustatikError } from '@baustatik/errors';

export class CollinearPointsError extends BaustatikError {
  constructor() {
    super(
      'Arc.fromPoints: die drei Punkte sind kollinear - kein eindeutiger Kreis möglich',
    );
  }
}

export class DegenerateVectorError extends BaustatikError {
  constructor() {
    super('Vector.normalize: Nullvektor kann nicht normalisiert werden');
  }
}

export class OpenPolylineError extends BaustatikError {
  constructor() {
    super('Polyline.toPolygon: Polyline ist nicht geschlossen');
  }
}

export class InvalidPolygonError extends BaustatikError {
  constructor(reason: string) {
    super(`Polygon ungültig: ${reason}`);
  }
}

export class InvalidArcError extends BaustatikError {
  constructor(reason: string) {
    super(`Arc ungültig: ${reason}`);
  }
}

export class DegenerateAxisError extends BaustatikError {
  constructor() {
    super(
      'mirror: axisP1 und axisP2 sind identisch - Spiegelachse ist degeneriert',
    );
  }
}

export class InvalidPolylineError extends BaustatikError {
  constructor(reason: string) {
    super(`Polyline ungültig: ${reason}`);
  }
}

export class DiscontinuousLinesError extends BaustatikError {
  constructor(index: number) {
    super(
      `Linien sind nicht verbunden: Linie ${index} endet nicht am Startpunkt von Linie ${index + 1}`,
    );
  }
}

/**
 * Nach einem Bogen gefragt, wo keiner ist.
 *
 * Eine gebrochene VORBEDINGUNG und nicht der `undefined`-Kanal: die Gerade ist
 * eine BEKANNTE Antwort, kein „ich weiß es nicht". Wer sie mitbedienen will,
 * nimmt `Bulge.toPolyline` (total) oder fragt vorher `Bulge.isStraight`.
 *
 * ALLE DREI ZAHLEN ALS FELDER, weil `bulge` allein den Wurf nicht erklärt:
 * entschieden hat `(Sehne/2)·|bulge| <= tolerance`. Derselbe `bulge` ist auf
 * 5 mm Sehne harmlos und auf 2 m Sehne ein sichtbarer Bogen — die Länge
 * gehört in die Meldung.
 */
export class StraightBulgeError extends BaustatikError {
  readonly bulge: number;
  readonly chordLength: number;
  readonly tolerance: number;

  constructor(bulge: number, chordLength: number, tolerance: number) {
    super(
      `bulge ${bulge} auf Sehne ${chordLength} ergibt die Stichhöhe ` +
        `${(chordLength / 2) * Math.abs(bulge)} und liegt damit nicht über der ` +
        `Toleranz ${tolerance} — das ist eine Gerade, kein Bogen.`,
    );
    this.bulge = bulge;
    this.chordLength = chordLength;
    this.tolerance = tolerance;
  }
}

/**
 * Ein Bogen, der sich zum Vollkreis schließt — `|sweep| >= 2π`.
 *
 * `bulge = tan(Δ/4)` hat dort seinen Pol, und `tan(π/2)` liefert in IEEE-754
 * kein `Infinity`, sondern `1.633e16`: eine still FALSCHE endliche Zahl, die
 * durch jede weitere Rechnung reisen würde. Der Wertebereich ist deshalb offen
 * `(−2π, +2π)`, und DXF zieht dieselbe Grenze — eine `LWPOLYLINE` kann keinen
 * Vollkreis tragen, dafür gibt es `CIRCLE`.
 */
export class FullCircleBulgeError extends BaustatikError {
  readonly sweep: number;

  constructor(sweep: number) {
    super(
      `sweep ${sweep} schließt den Vollkreis — bulge = tan(Δ/4) hat dort ` +
        'seinen Pol und ist nicht definiert.',
    );
    this.sweep = sweep;
  }
}
